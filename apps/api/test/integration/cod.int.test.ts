import { beforeEach, describe, expect, it } from 'vitest';
import { API, addAddress, admin, app, customer, prisma, request, resetDatabase, seedCatalog } from './helpers.js';

async function placed(stock = 5) {
  const { variant } = await seedCatalog({ stock, price: 500000 });
  const c = await customer();
  const address = await addAddress(c.user.id);
  await request(app).post(`${API}/cart/items`).set(c.auth).send({ variantId: variant.id, quantity: 1 });
  const order = await request(app).post(`${API}/orders`).set(c.auth).send({ shippingAddressId: address.id });
  expect(order.status, JSON.stringify(order.body)).toBe(201);
  return { c, variant, orderId: order.body.data.id as string };
}

describe('cash on delivery', () => {
  beforeEach(resetDatabase);

  it('confirms COD, then admin ships and delivers; payment settles on delivery', async () => {
    const { c, orderId } = await placed();
    const cod = await request(app).post(`${API}/orders/${orderId}/cod`).set(c.auth);
    expect(cod.status, JSON.stringify(cod.body)).toBe(200);
    expect(cod.body.data.payments[0]).toMatchObject({ provider: 'COD', status: 'PROCESSING' });
    const a = await admin();
    const ship = await request(app).patch(`${API}/admin/orders/${orderId}/status`).set(a.auth).send({ status: 'SHIPPED' });
    expect(ship.status, JSON.stringify(ship.body)).toBe(200);
    const done = await request(app).patch(`${API}/admin/orders/${orderId}/status`).set(a.auth).send({ status: 'DELIVERED' });
    expect(done.status, JSON.stringify(done.body)).toBe(200);
    expect((await prisma.payment.findFirstOrThrow({ where: { orderId } })).status).toBe('SUCCEEDED');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: orderId } })).paidAt).not.toBeNull();
  });

  it('non-COD pending orders cannot be shipped by admin', async () => {
    const { orderId } = await placed();
    const a = await admin();
    expect((await request(app).patch(`${API}/admin/orders/${orderId}/status`).set(a.auth).send({ status: 'SHIPPED' })).status).toBe(400);
  });

  it('stripe checkout is refused for COD orders; customer can cancel and stock returns', async () => {
    const { c, variant, orderId } = await placed();
    await request(app).post(`${API}/orders/${orderId}/cod`).set(c.auth).expect(200);
    expect((await request(app).post(`${API}/payments/checkout-session`).set(c.auth).send({ orderId })).status).toBe(400);
    expect((await request(app).post(`${API}/orders/${orderId}/cancel`).set(c.auth)).status).toBe(200);
    expect((await prisma.payment.findFirstOrThrow({ where: { orderId } })).status).toBe('CANCELLED');
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: variant.id } })).stockQuantity).toBe(5);
  });

  it("another customer cannot confirm someone else's order; double confirm is rejected", async () => {
    const { c, orderId } = await placed();
    const other = await customer();
    expect((await request(app).post(`${API}/orders/${orderId}/cod`).set(other.auth)).status).toBe(404);
    await request(app).post(`${API}/orders/${orderId}/cod`).set(c.auth).expect(200);
    expect((await request(app).post(`${API}/orders/${orderId}/cod`).set(c.auth)).status).toBe(400);
  });
});
