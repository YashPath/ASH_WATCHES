// SECURITY-CRITICAL
import multer from 'multer';
import { S3Client, PutObjectCommand, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { fileTypeFromBuffer } from 'file-type';
import sharp from 'sharp';
import crypto from 'node:crypto';
import fs from 'node:fs/promises';
import path from 'node:path';
import type { NextFunction, Request, Response } from 'express';
import { AppError } from '../lib/errors.js';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';

const s3 = env.MEDIA_STORAGE_PROVIDER === 's3' ? new S3Client({ region: env.S3_REGION, ...(env.S3_ENDPOINT ? { endpoint: env.S3_ENDPOINT } : {}), forcePathStyle: env.S3_FORCE_PATH_STYLE === 'true', credentials: { accessKeyId: env.S3_ACCESS_KEY_ID!, secretAccessKey: env.S3_SECRET_ACCESS_KEY! } }) : null;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_GLB_BYTES = 3 * 1024 * 1024;
const storage = multer.memoryStorage();
const imageUpload = multer({ storage, limits: { fileSize: MAX_IMAGE_BYTES, files: 1, fields: 10 }, fileFilter(_req, file, cb) {
  const ext = path.extname(file.originalname).toLowerCase();
  const allowed: Record<string, string> = { '.jpg': 'image/jpeg', '.jpeg': 'image/jpeg', '.png': 'image/png', '.webp': 'image/webp' };
  if (!allowed[ext] || allowed[ext] !== file.mimetype) return cb(new AppError(415, 'Image extension and MIME type must match JPEG, PNG, or WebP', 'UPLOAD_TYPE_REJECTED'));
  cb(null, true);
} });
const modelUpload = multer({ storage, limits: { fileSize: MAX_GLB_BYTES, files: 1, fields: 10 }, fileFilter(_req, file, cb) {
  if (path.extname(file.originalname).toLowerCase() !== '.glb' || !['model/gltf-binary', 'application/octet-stream'].includes(file.mimetype)) return cb(new AppError(415, 'Only binary GLB models under 3 MB are accepted', 'UPLOAD_TYPE_REJECTED'));
  cb(null, true);
} });
export const parseSingleImage = imageUpload.single('image');
export const parseSingleModel = modelUpload.single('model');
function signDownload(assetId: string, expires: number) { return crypto.createHmac('sha256', env.MEDIA_SIGNING_SECRET).update(`${assetId}:${expires}`).digest('hex'); }
export function createSignedMediaUrl(assetId: string, ttlSeconds = 300) { const expires = Math.floor(Date.now() / 1000) + ttlSeconds; return `/api/v1/media/${assetId}/download?expires=${expires}&signature=${signDownload(assetId, expires)}`; }
async function saveFile(directoryInput: string, bytes: Buffer, extension: string) {
  const storageKey = `${crypto.randomUUID()}${extension}`;
  const directory = path.resolve(directoryInput);
  await fs.mkdir(directory, { recursive: true, mode: 0o700 });
  await fs.writeFile(path.join(directory, storageKey), bytes, { flag: 'wx', mode: 0o600 });
  return storageKey;
}
function publicUrl(key: string) {
  const encodedKey = key.split('/').map(encodeURIComponent).join('/');
  if (env.MEDIA_PUBLIC_BASE_URL) return `${env.MEDIA_PUBLIC_BASE_URL.replace(/\/$/, '')}/${encodedKey}`;
  // Same-origin path: the web app proxies /media-public to the API, and the CSP only allows img-src 'self'.
  return `/media-public/${encodedKey}`;
}
async function storeAssetPair(privateBytes: Buffer, privateExt: string, publicBytes: Buffer, publicExt: string, publicContentType: string) {
  const id = crypto.randomUUID();
  if (s3) {
    const privateKey = `private/${id}${privateExt}`;
    const publicKey = `public/${id}${publicExt}`;
    await s3.send(new PutObjectCommand({ Bucket: env.S3_BUCKET!, Key: privateKey, Body: privateBytes, ContentType: privateExt === '.glb' ? 'model/gltf-binary' : 'application/octet-stream', CacheControl: 'private, no-store' }));
    await s3.send(new PutObjectCommand({ Bucket: env.S3_BUCKET!, Key: publicKey, Body: publicBytes, ContentType: publicContentType, CacheControl: 'public, max-age=31536000, immutable' }));
    return { privateKey, publicKey, url: publicUrl(publicKey) };
  }
  const privateKey = await saveFile(env.PRIVATE_MEDIA_DIR, privateBytes, privateExt);
  const publicKey = await saveFile(env.PUBLIC_MEDIA_DIR, publicBytes, publicExt);
  return { privateKey, publicKey, url: publicUrl(publicKey) };
}
function validateGlbJson(buffer: Buffer) {
  if (buffer.length < 20 || buffer.toString('ascii', 0, 4) !== 'glTF' || buffer.readUInt32LE(4) !== 2 || buffer.readUInt32LE(8) !== buffer.length) throw new AppError(415, 'Invalid GLB magic bytes, version, or declared length', 'GLB_INVALID');
  const jsonLength = buffer.readUInt32LE(12);
  const jsonType = buffer.readUInt32LE(16);
  if (jsonType !== 0x4e4f534a || jsonLength < 2 || 20 + jsonLength > buffer.length) throw new AppError(415, 'GLB must begin with a valid JSON chunk', 'GLB_INVALID_JSON_CHUNK');
  let document: unknown;
  try { document = JSON.parse(buffer.toString('utf8', 20, 20 + jsonLength).replace(/[\u0000\u0020]+$/g, '')); }
  catch { throw new AppError(415, 'GLB JSON chunk is invalid', 'GLB_INVALID_JSON'); }
  const visit = (value: unknown): void => {
    if (!value || typeof value !== 'object') return;
    if (Array.isArray(value)) { for (const item of value) visit(item); return; }
    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
      if (key === 'uri' && typeof child === 'string' && !child.startsWith('data:')) throw new AppError(415, 'GLB may not reference external resources', 'GLB_EXTERNAL_URI_REJECTED');
      visit(child);
    }
  };
  visit(document);
}
export async function validateAndStoreImage(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) throw new AppError(400, 'Image file is required', 'UPLOAD_REQUIRED');
    const detected = await fileTypeFromBuffer(req.file.buffer);
    if (!detected || !['image/jpeg', 'image/png', 'image/webp'].includes(detected.mime)) throw new AppError(415, 'File content is not a supported image', 'UPLOAD_MAGIC_BYTES_REJECTED');
    const optimized = await sharp(req.file.buffer, { limitInputPixels: 40_000_000 }).rotate().resize({ width: 2400, height: 2400, fit: 'inside', withoutEnlargement: true }).webp({ quality: 84 }).toBuffer();
    const stored = await storeAssetPair(req.file.buffer, `.${detected.ext}`, optimized, '.webp', 'image/webp');
    const asset = await prisma.mediaAsset.create({ data: { storageKey: stored.privateKey, publicStorageKey: stored.publicKey, publicUrl: stored.url, originalName: path.basename(req.file.originalname).slice(0, 200), contentType: 'image/webp', sizeBytes: optimized.byteLength, kind: 'IMAGE', uploadedById: req.auth?.userId ?? null } });
    res.status(201).json({ data: { id: asset.id, publicUrl: asset.publicUrl, contentType: asset.contentType, sizeBytes: asset.sizeBytes, privateOriginalUrl: createSignedMediaUrl(asset.id) } });
  } catch (error) { next(error); }
}
export async function validateAndStoreGlb(req: Request, res: Response, next: NextFunction) {
  try {
    if (!req.file) throw new AppError(400, 'GLB model file is required', 'UPLOAD_REQUIRED');
    validateGlbJson(req.file.buffer);
    const stored = await storeAssetPair(req.file.buffer, '.glb', req.file.buffer, '.glb', 'model/gltf-binary');
    const asset = await prisma.mediaAsset.create({ data: { storageKey: stored.privateKey, publicStorageKey: stored.publicKey, publicUrl: stored.url, originalName: path.basename(req.file.originalname).slice(0, 200), contentType: 'model/gltf-binary', sizeBytes: req.file.buffer.length, kind: 'GLB', uploadedById: req.auth?.userId ?? null } });
    res.status(201).json({ data: { id: asset.id, publicUrl: asset.publicUrl, contentType: asset.contentType, sizeBytes: asset.sizeBytes, privateOriginalUrl: createSignedMediaUrl(asset.id) } });
  } catch (error) { next(error); }
}
export async function signedMediaDownload(req: Request, res: Response, next: NextFunction) {
  try {
    const id = String(req.params.id); const expires = Number(req.query.expires); const signature = String(req.query.signature ?? '');
    if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) throw new AppError(400, 'Invalid media asset ID', 'INVALID_UUID');
    if (!Number.isSafeInteger(expires) || expires < Math.floor(Date.now() / 1000) || expires > Math.floor(Date.now() / 1000) + 600) throw new AppError(403, 'Signed URL expired or invalid', 'SIGNED_URL_INVALID');
    const expected = signDownload(id, expires); const a = Buffer.from(signature); const b = Buffer.from(expected);
    if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) throw new AppError(403, 'Signed URL expired or invalid', 'SIGNED_URL_INVALID');
    const asset = await prisma.mediaAsset.findUnique({ where: { id } }); if (!asset) throw new AppError(404, 'Media asset not found', 'NOT_FOUND');
    res.setHeader('Cache-Control', 'private, no-store');
    if (s3) {
      const url = await getSignedUrl(s3, new GetObjectCommand({ Bucket: env.S3_BUCKET!, Key: asset.storageKey }), { expiresIn: 300 });
      return res.redirect(302, url);
    }
    const filePath = path.resolve(env.PRIVATE_MEDIA_DIR, asset.storageKey); const root = path.resolve(env.PRIVATE_MEDIA_DIR) + path.sep;
    if (!filePath.startsWith(root)) throw new AppError(403, 'Invalid storage key', 'STORAGE_KEY_INVALID');
    res.type(asset.kind === 'GLB' ? 'model/gltf-binary' : 'application/octet-stream');
    res.sendFile(filePath, { dotfiles: 'deny' }, error => { if (error && !res.headersSent) next(error); });
  } catch (error) { next(error); }
}
