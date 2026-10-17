import crypto from 'node:crypto';
import argon2 from 'argon2';
import jwt from 'jsonwebtoken';
import request from 'supertest';
import { Prisma, UserRole } from '@prisma/client';
import { app } from '../../src/app.js';
import { prisma } from '../../src/lib/prisma.js';
import { env } from '../../src/config/env.js';
import { rateLimitRedis } from '../../src/middleware/security.js';

export { app, prisma, request };
export const PASSWORD = 'Correct-Horse-Battery-9!';
export const API = '/api/v1';
const ORIGIN = env.FRONTEND_ORIGIN;
export const csrfHeaders = { Origin: ORIGIN, 'X-CSRF-Token': 'x'.repeat(32) };

/** Wipes all application data between tests (children first) and resets rate-limit counters. */
export async function resetDatabase() {
  const tables = ['ProcessedStripeEvent', 'AuditLog', 'EmailActionToken', 'Review', 'WishlistItem', 'Payment', 'OrderItem', 'Order', 'CartItem', 'Cart', 'Product3DModel', 'ProductImage', 'ProductVariant', 'Product', 'Category', 'Brand', 'RefreshToken', 'Address', 'MediaAsset', 'User'];
  await prisma.$executeRawUnsafe(`TRUNCATE ${tables.map(t => `"${t}"`).join(', ')} RESTART IDENTITY CASCADE`);
  const keys = await rateLimitRedis.keys('rl:*');
  if (keys.length) await rateLimitRedis.del(...keys);
}

let counter = 0;
const unique = () => `${Date.now().toString(36)}${(counter++).toString(36)}${crypto.randomBytes(2).toString('hex')}`;

export async function createUser(opts: { role?: UserRole; verified?: boolean; email?: string; password?: string; twoFactor?: boolean } = {}) {
  const email = opts.email ?? `user-${unique()}@example.com`;
  const user = await prisma.user.create({ data: { email, passwordHash: await argon2.hash(opts.password ?? PASSWORD, { type: argon2.argon2id }), firstName: 'Test', lastName: 'User', role: opts.role ?? 'CUSTOMER', emailVerifiedAt: opts.verified === false ? null : new Date(), twoFactorEnabled: opts.twoFactor ?? false } });
  return { user, email, password: opts.password ?? PASSWORD };
}

export async function loginAs(email: string, password = PASSWORD) {
  const res = await request(app).post(`${API}/auth/login`).set(csrfHeaders).send({ email, password });
  return res;
}

/** Customer with a ready Bearer token (via the real login endpoint). */
export async function customer(opts: { verified?: boolean } = {}) {
  const { user, email } = await createUser(opts);
  const res = await loginAs(email);
  if (res.status !== 200) throw new Error(`login failed: ${res.status} ${JSON.stringify(res.body)}`);
  return { user, email, token: res.body.data.accessToken as string, auth: { Authorization: `Bearer ${res.body.data.accessToken}` } };
}

/** Admin tokens require a completed MFA challenge; mint the same claims the API would after a successful TOTP step. */
export async function admin() {
  const { user } = await createUser({ role: 'ADMIN', twoFactor: true });
  const token = jwt.sign({ role: user.role, typ: 'access', mfa: true }, env.JWT_ACCESS_SECRET, { algorithm: 'HS256', subject: user.id, expiresIn: 600, jwtid: crypto.randomUUID(), issuer: 'ash-api', audience: 'ash-web' });
  return { user, auth: { Authorization: `Bearer ${token}` } };
}

export async function seedCatalog(opts: { stock?: number; price?: number } = {}) {
  const s = unique();
  const brand = await prisma.brand.create({ data: { name: `Brand ${s}`, slug: `brand-${s}` } });
  const category = await prisma.category.create({ data: { name: `Cat ${s}`, slug: `cat-${s}` } });
  const product = await prisma.product.create({ data: {
    brandId: brand.id, categoryId: category.id, name: `Diver ${s}`, slug: `diver-${s}`, sku: `SKU-${s}`, description: 'A rugged automatic dive watch with sapphire crystal.', shortDescription: 'Dive watch',
    gender: 'MEN', movement: 'AUTOMATIC', caseSizeMm: new Prisma.Decimal(42), waterResistanceM: 200, basePrice: opts.price ?? 2500000, status: 'ACTIVE', tags: ['dive', 'steel'],
    variants: { create: [{ sku: `V-${s}`, name: 'Blue / Steel', strapMaterial: 'Steel', strapColor: 'Silver', dialColor: 'Blue', caseMaterial: 'Steel', caseColor: 'Silver', price: opts.price ?? 2500000, stockQuantity: opts.stock ?? 5 }] }
  }, include: { variants: true } });
  return { brand, category, product, variant: product.variants[0]! };
}

export async function addAddress(userId: string) {
  return prisma.address.create({ data: { userId, type: 'SHIPPING', fullName: 'Test User', phone: '9999999999', line1: '1 Test Street', city: 'Dehradun', state: 'Uttarakhand', postalCode: '248001', countryCode: 'IN', isDefault: true } });
}
