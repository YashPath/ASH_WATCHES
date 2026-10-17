import { beforeEach, describe, expect, it } from 'vitest';
import { API, addAddress, app, customer, prisma, request, resetDatabase, seedCatalog } from './helpers.js';

async function fillCart(c: Awaited<ReturnType<typeof customer>>, variantId: string, quantity = 1) {
  const res = await request(app).post(`${API}/cart/items`).set(c.auth).send({ variantId, quantity });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
}
const placeOrder = (c: Awaited<ReturnType<typeof customer>>, addressId: string) => request(app).post(`${API}/orders`).set(c.auth).send({ shippingAddressId: addressId });

describe('catalogue, cart and orders', () => {
  beforeEach(resetDatabase);

  it('lists and shows active products, hides drafts', async () => {
    const { product } = await seedCatalog();
    await prisma.product.update({ where: { id: product.id }, data: { status: 'DRAFT' } });
    expect((await request(app).get(`${API}/products`)).body.data).toHaveLength(0);
    expect((await request(app).get(`${API}/products/${product.slug}`)).status).toBe(404);
    await prisma.product.update({ where: { id: product.id }, data: { status: 'ACTIVE' } });
    expect((await request(app).get(`${API}/products`)).body.data).toHaveLength(1);
    const detail = await request(app).get(`${API}/products/${product.slug}`);
    expect(detail.status).toBe(200);
    expect(detail.body.data.variants).toHaveLength(1);
  });

  it('filters by price, movement and gender', async () => {
    await seedCatalog({ price: 1000000 });
    await seedCatalog({ price: 9000000 });
    const cheap = await request(app).get(`${API}/products?maxPrice=2000000&movement=AUTOMATIC&gender=MEN`);
    expect(cheap.body.data).toHaveLength(1);
    expect(cheap.body.data[0].basePrice).toBe(1000000);
    expect((await request(app).get(`${API}/products?maxPrice=abc`)).status).toBe(400);
  });

  it('requires login for the cart and validates quantities', async () => {
    const { variant } = await seedCatalog({ stock: 2 });
    expect((await request(app).post(`${API}/cart/items`).send({ variantId: variant.id, quantity: 1 })).status).toBe(401);
    const c = await customer();
    expect((await request(app).post(`${API}/cart/items`).set(c.auth).send({ variantId: variant.id, quantity: 0 })).status).toBe(400);
    expect((await request(app).post(`${API}/cart/items`).set(c.auth).send({ variantId: variant.id, quantity: 3 })).status).toBe(400); // exceeds stock
    await fillCart(c, variant.id, 2);
    const cart = await request(app).get(`${API}/cart`).set(c.auth);
    expect(cart.body.data.subtotal).toBe(variant.price * 2);
  });

  it('places an order: server-side price, stock decremented, cart emptied, payment row created', async () => {
    const { variant } = await seedCatalog({ stock: 5, price: 1234500 });
    const c = await customer();
    const address = await addAddress(c.user.id);
    await fillCart(c, variant.id, 2);
    const res = await placeOrder(c, address.id);
    expect(res.status, JSON.stringify(res.body)).toBe(201);
    expect(res.body.data.totalAmount).toBe(1234500 * 2);
    expect(res.body.data.status).toBe('PENDING');
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stockQuantity).toBe(3);
    expect(await prisma.cartItem.count()).toBe(0);
    expect(await prisma.payment.count({ where: { orderId: res.body.data.id } })).toBeGreaterThanOrEqual(1);
  });

  it('refuses unverified emails and empty carts', async () => {
    const { variant } = await seedCatalog();
    const unverified = await customer({ verified: false });
    const addr = await addAddress(unverified.user.id);
    await fillCart(unverified, variant.id);
    expect((await placeOrder(unverified, addr.id)).status).toBe(403);
    const c = await customer();
    const a = await addAddress(c.user.id);
    expect((await placeOrder(c, a.id)).status).toBe(400);
  });

  it("cannot order to someone else's address", async () => {
    const { variant } = await seedCatalog();
    const a = await customer(); const b = await customer();
    const bAddr = await addAddress(b.user.id);
    await fillCart(a, variant.id);
    expect((await placeOrder(a, bAddr.id)).status).toBe(404);
  });

  it('never oversells the last unit under concurrency', async () => {
    const { variant } = await seedCatalog({ stock: 1 });
    const buyers = await Promise.all([customer(), customer(), customer(), customer()]);
    for (const b of buyers) { await fillCart(b, variant.id, 1); }
    const addrs = await Promise.all(buyers.map(b => addAddress(b.user.id)));
    const results = await Promise.all(buyers.map((b, i) => placeOrder(b, addrs[i]!.id)));
    const ok = results.filter(r => r.status === 201).length;
    expect(ok).toBe(1);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stockQuantity).toBe(0);
  });

  it('cancelling a pending order restocks it', async () => {
    const { variant } = await seedCatalog({ stock: 3 });
    const c = await customer();
    const addr = await addAddress(c.user.id);
    await fillCart(c, variant.id, 2);
    const order = await placeOrder(c, addr.id);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stockQuantity).toBe(1);
    const cancel = await request(app).post(`${API}/orders/${order.body.data.id}/cancel`).set(c.auth).send({});
    expect(cancel.status, JSON.stringify(cancel.body)).toBe(200);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stockQuantity).toBe(3);
  });

  it("users cannot read other users' orders", async () => {
    const { variant } = await seedCatalog();
    const a = await customer(); const b = await customer();
    const addr = await addAddress(a.user.id);
    await fillCart(a, variant.id);
    const order = await placeOrder(a, addr.id);
    expect((await request(app).get(`${API}/orders/${order.body.data.id}`).set(b.auth)).status).toBe(404);
    expect((await request(app).get(`${API}/orders/${order.body.data.id}`).set(a.auth)).status).toBe(200);
  });
});
