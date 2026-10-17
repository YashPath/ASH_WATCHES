import { beforeEach, describe, expect, it } from 'vitest';
import { API, admin, app, customer, prisma, request, resetDatabase, seedCatalog } from './helpers.js';

describe('admin', () => {
  beforeEach(resetDatabase);

  it('blocks customers and anonymous users', async () => {
    expect((await request(app).get(`${API}/admin/products`)).status).toBe(401);
    const c = await customer();
    expect((await request(app).get(`${API}/admin/products`).set(c.auth)).status).toBe(403);
  });

  it('blocks admin tokens that skipped MFA', async () => {
    const { createUser } = await import('./helpers.js');
    const { user } = await createUser({ role: 'ADMIN', twoFactor: true });
    const jwt = (await import('jsonwebtoken')).default;
    const { env } = await import('../../src/config/env.js');
    const token = jwt.sign({ role: user.role, typ: 'access', mfa: false }, env.JWT_ACCESS_SECRET, { algorithm: 'HS256', subject: user.id, expiresIn: 600, issuer: 'ash-api', audience: 'ash-web' });
    expect((await request(app).get(`${API}/admin/products`).set('Authorization', `Bearer ${token}`)).status).toBe(403);
  });

  it('lists the catalog and adds brands and categories idempotently (admins only)', async () => {
    const c = await customer();
    expect((await request(app).get(`${API}/admin/catalog`).set(c.auth)).status).toBe(403);
    const a = await admin();
    const first = await request(app).post(`${API}/admin/brands`).set(a.auth).send({ name: 'Kedar & Sons' });
    const again = await request(app).post(`${API}/admin/brands`).set(a.auth).send({ name: 'Kedar & Sons' });
    expect(first.status).toBe(201); expect(again.body.data.id).toBe(first.body.data.id);
    const cat = await request(app).post(`${API}/admin/categories`).set(a.auth).send({ name: 'Heritage' });
    expect(cat.status).toBe(201);
    const list = await request(app).get(`${API}/admin/catalog`).set(a.auth);
    expect(list.body.data.brands.map((b: { name: string }) => b.name)).toContain('Kedar & Sons');
    expect(list.body.data.categories.map((x: { name: string }) => x.name)).toContain('Heritage');
    expect((await request(app).post(`${API}/admin/brands`).set(a.auth).send({ name: '!!' })).status).toBe(400);
  });

  it('creates, edits and soft-deletes a product with audit logging', async () => {
    const { brand, category } = await seedCatalog();
    const a = await admin();
    const create = await request(app).post(`${API}/admin/products`).set(a.auth).send({ brandId: brand.id, categoryId: category.id, name: 'Orbit Chrono', slug: 'orbit-chrono', sku: 'ORB-1', description: 'A chronograph for everyday wear.', gender: 'UNISEX', movement: 'QUARTZ', caseSizeMm: 40, waterResistanceM: 100, basePrice: 1800000, status: 'ACTIVE' });
    expect(create.status, JSON.stringify(create.body)).toBe(201);
    const id = create.body.data.id as string;
    const patch = await request(app).patch(`${API}/admin/products/${id}`).set(a.auth).send({ basePrice: 1700000 });
    expect(patch.status, JSON.stringify(patch.body)).toBe(200);
    expect((await prisma.product.findUniqueOrThrow({ where: { id } })).basePrice).toBe(1700000);
    const del = await request(app).delete(`${API}/admin/products/${id}`).set(a.auth);
    expect(del.status, JSON.stringify(del.body)).toBeLessThan(300);
    expect((await prisma.product.findUniqueOrThrow({ where: { id } })).deletedAt).not.toBeNull();
    expect(await prisma.auditLog.count()).toBeGreaterThanOrEqual(3);
    expect((await request(app).get(`${API}/products/orbit-chrono`)).status).toBe(404);
  });

  it('rejects invalid product input', async () => {
    const a = await admin();
    const res = await request(app).post(`${API}/admin/products`).set(a.auth).send({ name: 'x' });
    expect(res.status).toBe(400);
  });
});
