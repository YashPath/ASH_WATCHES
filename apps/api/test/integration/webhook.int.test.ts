import { beforeEach, describe, expect, it } from 'vitest';
import Stripe from 'stripe';
import { API, addAddress, app, customer, prisma, request, resetDatabase, seedCatalog } from './helpers.js';
import { env } from '../../src/config/env.js';

const stripe = new Stripe(env.STRIPE_SECRET_KEY!);
const SESSION = 'cs_test_session_1';

async function pendingOrder(stock = 5, qty = 2) {
  const { variant } = await seedCatalog({ stock, price: 500000 });
  const c = await customer();
  const addr = await addAddress(c.user.id);
  await request(app).post(`${API}/cart/items`).set(c.auth).send({ variantId: variant.id, quantity: qty });
  const res = await request(app).post(`${API}/orders`).set(c.auth).send({ shippingAddressId: addr.id });
  expect(res.status, JSON.stringify(res.body)).toBe(201);
  const orderId = res.body.data.id as string;
  const payment = await prisma.payment.findFirstOrThrow({ where: { orderId } });
  await prisma.payment.update({ where: { id: payment.id }, data: { stripeCheckoutSessionId: SESSION, status: 'PROCESSING' } });
  return { orderId, payment, variant, total: res.body.data.totalAmount as number };
}

function send(type: string, object: Record<string, unknown>, opts: { id?: string; secret?: string } = {}) {
  const payload = JSON.stringify({ id: opts.id ?? `evt_${Math.random().toString(36).slice(2)}`, object: 'event', type, data: { object }, api_version: '2024-06-20', created: Math.floor(Date.now() / 1000) });
  const header = stripe.webhooks.generateTestHeaderString({ payload, secret: opts.secret ?? env.STRIPE_WEBHOOK_SECRET! });
  return request(app).post(`${API}/payments/webhook`).set('Content-Type', 'application/json').set('Stripe-Signature', header).send(payload);
}
const sessionObject = (o: { orderId: string; paymentId: string; amount: number; id?: string; paid?: boolean }) => ({ id: o.id ?? SESSION, object: 'checkout.session', payment_status: o.paid === false ? 'unpaid' : 'paid', amount_total: o.amount, currency: 'inr', payment_intent: 'pi_test_1', metadata: { orderId: o.orderId, paymentId: o.paymentId } });

describe('stripe webhook', () => {
  beforeEach(resetDatabase);

  it('rejects missing or forged signatures', async () => {
    const o = await pendingOrder();
    const forged = await send('checkout.session.completed', sessionObject({ orderId: o.orderId, paymentId: o.payment.id, amount: o.total }), { secret: 'whsec_wrong' });
    expect(forged.status).toBe(400);
    const none = await request(app).post(`${API}/payments/webhook`).set('Content-Type', 'application/json').send('{}');
    expect(none.status).toBe(400);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } })).status).toBe('PENDING');
  });

  it('marks the order paid exactly once, even when Stripe redelivers the event', async () => {
    const o = await pendingOrder();
    const obj = sessionObject({ orderId: o.orderId, paymentId: o.payment.id, amount: o.total });
    const first = await send('checkout.session.completed', obj, { id: 'evt_fixed_1' });
    expect(first.status, JSON.stringify(first.body)).toBe(200);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } });
    expect(order.status).toBe('PAID');
    expect(order.paidAt).not.toBeNull();
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: o.payment.id } })).status).toBe('SUCCEEDED');
    const again = await send('checkout.session.completed', obj, { id: 'evt_fixed_1' });
    expect(again.status).toBe(200);
    expect(again.body.duplicate).toBe(true);
    expect(await prisma.processedStripeEvent.count({ where: { eventId: 'evt_fixed_1' } })).toBe(1);
  });

  it('flags an amount mismatch for manual review instead of marking paid', async () => {
    const o = await pendingOrder();
    const res = await send('checkout.session.completed', sessionObject({ orderId: o.orderId, paymentId: o.payment.id, amount: o.total - 100 }));
    expect(res.status).toBe(200);
    const order = await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } });
    expect(order.status).toBe('PENDING');
    expect(order.manualReviewRequired).toBe(true);
  });

  it('flags a paid session that differs from the stored one', async () => {
    const o = await pendingOrder();
    await send('checkout.session.completed', sessionObject({ orderId: o.orderId, paymentId: o.payment.id, amount: o.total, id: 'cs_other_session' }));
    const order = await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } });
    expect(order.manualReviewRequired).toBe(true);
    expect(order.status).toBe('PENDING');
  });

  it('an expired session cancels the order and restocks', async () => {
    const o = await pendingOrder(5, 2);
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: o.variant.id } })).stockQuantity).toBe(3);
    const res = await send('checkout.session.expired', sessionObject({ orderId: o.orderId, paymentId: o.payment.id, amount: o.total, paid: false }));
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } })).status).toBe('CANCELLED');
    expect((await prisma.productVariant.findUniqueOrThrow({ where: { id: o.variant.id } })).stockQuantity).toBe(5);
  });

  it('a full refund moves the payment and order to REFUNDED', async () => {
    const o = await pendingOrder();
    await send('checkout.session.completed', sessionObject({ orderId: o.orderId, paymentId: o.payment.id, amount: o.total }));
    const res = await send('charge.refunded', { id: 'ch_1', object: 'charge', payment_intent: 'pi_test_1', amount_refunded: o.total });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect((await prisma.payment.findUniqueOrThrow({ where: { id: o.payment.id } })).status).toBe('REFUNDED');
    expect((await prisma.order.findUniqueOrThrow({ where: { id: o.orderId } })).status).toBe('REFUNDED');
  });

  it('ignores unsupported event types', async () => {
    const res = await send('customer.created', { id: 'cus_1', object: 'customer' });
    expect(res.status).toBe(200);
    expect(res.body.ignored).toBe(true);
  });
});
