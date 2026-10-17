import crypto from 'node:crypto';
import { env } from '../config/env.js';

function encryptionKey() { return crypto.createHash('sha256').update(env.TOTP_ENCRYPTION_KEY, 'utf8').digest(); }
export function isEncryptedTotpSecret(value: string) { return value.startsWith('v1:'); }
export function encryptTotpSecret(secret: string) {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', encryptionKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(secret, 'utf8'), cipher.final()]);
  return `v1:${iv.toString('base64url')}:${cipher.getAuthTag().toString('base64url')}:${ciphertext.toString('base64url')}`;
}
export function decryptTotpSecret(value: string) {
  const [version, ivText, tagText, ciphertextText] = value.split(':');
  if (version !== 'v1' || !ivText || !tagText || !ciphertextText) throw new Error('Stored TOTP secret has an unsupported format');
  const decipher = crypto.createDecipheriv('aes-256-gcm', encryptionKey(), Buffer.from(ivText, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagText, 'base64url'));
  return Buffer.concat([decipher.update(Buffer.from(ciphertextText, 'base64url')), decipher.final()]).toString('utf8');
}
