// SECURITY-CRITICAL
import { Router } from 'express';
import Stripe from 'stripe';
import { z } from 'zod';
import { Prisma, PaymentStatus } from '@prisma/client';
import { authenticate } from '../../middleware/auth.js';
import { env } from '../../config/env.js';
import { prisma } from '../../lib/prisma.js';
import { AppError, badRequest, notFound } from '../../lib/errors.js';
import { logger } from '../../lib/logger.js';

export class WebhookSignatureError extends Error {}
const router = Router();
const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;
const checkoutInput = z.object({ orderId: z.string().uuid() });
const transitions: Record<PaymentStatus, PaymentStatus[]> = {
  PENDING: ['PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED'],
  REQUIRES_ACTION: ['PROCESSING', 'SUCCEEDED', 'FAILED', 'CANCELLED'],
  PROCESSING: ['SUCCEEDED', 'FAILED', 'CANCELLED'],
  SUCCEEDED: ['PARTIALLY_REFUNDED', 'REFUNDED'],
  FAILED: [], CANCELLED: [], PARTIALLY_REFUNDED: ['PARTIALLY_REFUNDED', 'REFUNDED'], REFUNDED: []
};
function canTransition(from: PaymentStatus, to: PaymentStatus) { return from === to || transitions[from].includes(to); }
const paymentMethodTypes = env.STRIPE_PAYMENT_METHOD_TYPES.split(',').map(value => value.trim()) as Stripe.Checkout.SessionCreateParams.PaymentMethodType[];

router.post('/checkout-session', authenticate, async (req, res, next) => {
  let claimedOrderId: string | null = null;
  let claimTime: Date | null = null;
  try {
    if (!stripe) throw new AppError(503, 'Online payments are not available right now. Please try again later.', 'PAYMENTS_UNAVAILABLE');
    const { orderId } = checkoutInput.parse(req.body);
    const userId = req.auth!.userId;
    let order = await prisma.order.findFirst({ where: { id: orderId, userId }, include: { items: true, payments: true } });
    if (!order) throw notFound('Order not found');
    if (order.status !== 'PENDING') throw badRequest('Order is not payable');
    if (order.payments.some(p => p.provider === 'COD')) throw badRequest('This order is set to cash on delivery');
    let payment = order.payments.find(p => ['PENDING', 'PROCESSING', 'REQUIRES_ACTION'].includes(p.status));
    if (!payment) throw badRequest('No payable payment found');

    if (payment.stripeCheckoutSessionId) {
      const existing = await stripe.checkout.sessions.retrieve(payment.stripeCheckoutSessionId);
      if (existing.status === 'open' && existing.url) {
        res.setHeader('Cache-Control', 'no-store, private');
        return res.json({ data: { checkoutUrl: existing.url, sessionId: existing.id } });
      }
      if (existing.status === 'complete' && existing.payment_status === 'paid') throw badRequest('Payment has completed; refresh the order status before retrying checkout');
      if (existing.status === 'expired') {
        const cleared = await prisma.payment.updateMany({
          where: { id: payment.id, stripeCheckoutSessionId: existing.id, status: { in: ['PENDING', 'PROCESSING', 'REQUIRES_ACTION'] } },
          data: { stripeCheckoutSessionId: null, status: 'PENDING' }
        });
        if (cleared.count === 1) await prisma.order.updateMany({ where: { id: orderId, userId, status: 'PENDING' }, data: { checkoutStartedAt: null } });
        order = await prisma.order.findFirst({ where: { id: orderId, userId }, include: { items: true, payments: true } });
        if (!order || order.status !== 'PENDING') throw badRequest('Order is no longer payable');
        payment = order.payments.find(p => p.id === payment!.id)!;
      } else {
        throw badRequest('Existing checkout session is no longer available');
      }
    }

    claimTime = new Date();
    claimedOrderId = order.id;
    const claim = await prisma.$transaction(async tx => {
      const claimed = await tx.order.updateMany({
        where: { id: order!.id, userId, status: 'PENDING', OR: [{ checkoutStartedAt: null }, { checkoutStartedAt: { lt: new Date(Date.now() - 2 * 60_000) } }] },
        data: { checkoutStartedAt: claimTime! }
      });
      if (claimed.count !== 1) throw badRequest('Checkout is already being started. Retry shortly.');

      const freshOrder = await tx.order.findFirst({ where: { id: order!.id, userId, status: 'PENDING' }, include: { items: true } });
      if (!freshOrder) throw badRequest('Order is no longer payable');
      const freshPayment = await tx.payment.findFirst({ where: { id: payment!.id, orderId: freshOrder.id, status: { in: ['PENDING', 'PROCESSING', 'REQUIRES_ACTION'] }, stripeCheckoutSessionId: null } });
      if (!freshPayment) throw badRequest('A checkout session is already associated with this payment');

      const now = new Date();
      const needsNewAttempt = freshPayment.checkoutAttempt < 1 || !freshPayment.checkoutExpiresAt || freshPayment.checkoutExpiresAt.getTime() - now.getTime() < 31 * 60_000;
      const expiresAt = needsNewAttempt ? new Date(now.getTime() + 35 * 60_000) : freshPayment.checkoutExpiresAt!;
      const savedPayment = await tx.payment.update({
        where: { id: freshPayment.id },
        data: {
          ...(needsNewAttempt ? { checkoutAttempt: { increment: 1 }, checkoutExpiresAt: expiresAt } : {})
        }
      });
      return { order: freshOrder, payment: savedPayment, expiresAt };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });

    const idempotencyKey = `ash-checkout-${claim.payment.id}-${claim.payment.checkoutAttempt}`;
    let session: Stripe.Checkout.Session;
    try {
      session = await stripe.checkout.sessions.create({
        mode: 'payment', payment_method_types: paymentMethodTypes,
        currency: claim.order.currency.toLowerCase(), expires_at: Math.floor(claim.expiresAt.getTime() / 1000),
        line_items: claim.order.items.map(item => ({ quantity: item.quantity, price_data: { currency: claim.order.currency.toLowerCase(), unit_amount: item.unitPrice, product_data: { name: `${item.productName} — ${item.variantName}` } } })),
        success_url: `${env.FRONTEND_ORIGIN}/checkout/success?session_id={CHECKOUT_SESSION_ID}`,
        cancel_url: `${env.FRONTEND_ORIGIN}/checkout/cancel?order=${claim.order.id}`,
        metadata: { orderId: claim.order.id, paymentId: claim.payment.id, userId },
        payment_intent_data: { metadata: { orderId: claim.order.id, paymentId: claim.payment.id, userId } }
      }, { idempotencyKey });
    } catch (stripeError) {
      await prisma.order.updateMany({ where: { id: claimedOrderId!, status: 'PENDING', checkoutStartedAt: claimTime! }, data: { checkoutStartedAt: null } });
      throw stripeError;
    }

    const saved = await prisma.payment.updateMany({ where: { id: claim.payment.id, checkoutAttempt: claim.payment.checkoutAttempt, stripeCheckoutSessionId: null, status: { in: ['PENDING', 'PROCESSING', 'REQUIRES_ACTION'] } }, data: { stripeCheckoutSessionId: session.id, status: 'PROCESSING' } });
    if (saved.count !== 1) {
      const currentPayment = await prisma.payment.findUnique({ where: { id: claim.payment.id } });
      if (currentPayment?.stripeCheckoutSessionId !== session.id) {
        logger.error({ orderId: claim.order.id, paymentId: claim.payment.id, sessionId: session.id, storedSessionId: currentPayment?.stripeCheckoutSessionId }, 'Checkout session created but could not be associated with payment');
        throw new Error('Checkout session claim was lost; retry the same checkout attempt');
      }
    }
    res.setHeader('Cache-Control', 'no-store, private').json({ data: { checkoutUrl: session.url, sessionId: session.id } });
  } catch (e) { next(e); }
});

async function restockAndCancel(tx: Prisma.TransactionClient, orderId: string, reason: string, paymentSessionId?: string) {
  const where: Prisma.OrderWhereInput = paymentSessionId
    ? { id: orderId, status: 'PENDING', payments: { some: { stripeCheckoutSessionId: paymentSessionId } } }
    : { id: orderId, status: 'PENDING', payments: { none: { OR: [{ stripeCheckoutSessionId: { not: null } }, { stripePaymentIntentId: { not: null } }] } } };
  const changed = await tx.order.updateMany({ where, data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: reason } });
  if (changed.count !== 1) return false;
  const items = await tx.orderItem.findMany({ where: { orderId }, select: { variantId: true, quantity: true } });
  for (const item of items) await tx.productVariant.updateMany({ where: { id: item.variantId }, data: { stockQuantity: { increment: item.quantity } } });
  return true;
}

async function auditIgnoredEvent(tx: Prisma.TransactionClient, event: Stripe.Event, message: string, resourceId?: string) {
  logger.warn({ eventId: event.id, eventType: event.type, resourceId }, message);
  await tx.auditLog.create({ data: { action: 'STRIPE_EVENT_IGNORED', resourceType: 'StripeEvent', resourceId: resourceId ?? null, severity: 'WARNING', metadata: { eventId: event.id, eventType: event.type, reason: message } } });
}

export async function stripeWebhookHandler(rawBody: Buffer, signature: string | undefined) {
  if (!env.STRIPE_WEBHOOK_SECRET || !stripe) throw new Error('Stripe webhook is not configured');
  if (!signature) throw new WebhookSignatureError('Missing Stripe signature');
  let event: Stripe.Event;
  try { event = stripe.webhooks.constructEvent(rawBody, signature, env.STRIPE_WEBHOOK_SECRET); }
  catch (error) { throw new WebhookSignatureError(error instanceof Error ? error.message : 'Invalid Stripe signature'); }
  const supported = new Set(['checkout.session.completed', 'checkout.session.async_payment_succeeded', 'checkout.session.async_payment_failed', 'checkout.session.expired', 'payment_intent.payment_failed', 'charge.refunded']);
  if (!supported.has(event.type)) return { received: true, ignored: true };

  try {
    await prisma.$transaction(async tx => {
      await tx.processedStripeEvent.create({ data: { eventId: event.id, eventType: event.type } });
      if (event.type === 'payment_intent.payment_failed') {
        const intent = event.data.object as Stripe.PaymentIntent;
        const payment = await tx.payment.findFirst({ where: { OR: [{ stripePaymentIntentId: intent.id }, ...(intent.metadata?.paymentId ? [{ id: intent.metadata.paymentId }] : [])] } });
        logger.warn({ eventId: event.id, paymentIntentId: intent.id, paymentId: payment?.id, failureCode: intent.last_payment_error?.code ?? null }, 'PaymentIntent failure observed; Checkout session remains retryable');
        if (payment) await tx.auditLog.create({ data: { action: 'STRIPE_PAYMENT_INTENT_FAILURE_OBSERVED', resourceType: 'Payment', resourceId: payment.id, severity: 'WARNING', metadata: { eventId: event.id, paymentIntentId: intent.id, failureCode: intent.last_payment_error?.code ?? null } } });
        else await auditIgnoredEvent(tx, event, 'PaymentIntent failure has no matching payment');
        return;
      }

      if (event.type === 'charge.refunded') {
        const charge = event.data.object as Stripe.Charge;
        const intentId = typeof charge.payment_intent === 'string' ? charge.payment_intent : charge.payment_intent?.id;
        const payment = intentId ? await tx.payment.findFirst({ where: { stripePaymentIntentId: intentId } }) : null;
        if (!payment) { await auditIgnoredEvent(tx, event, 'Refund event has no matching payment intent', intentId ?? undefined); return; }
        const amountRefunded = Math.max(payment.amountRefunded, Math.min(payment.amount, charge.amount_refunded));
        const next: PaymentStatus = amountRefunded >= payment.amount ? 'REFUNDED' : 'PARTIALLY_REFUNDED';
        if (!canTransition(payment.status, next)) throw new Error(`Rejected out-of-order payment transition ${payment.status} -> ${next} for ${payment.id}`);
        const changed = await tx.payment.updateMany({ where: { id: payment.id, status: payment.status }, data: { status: next, amountRefunded, lastStripeEventId: event.id } });
        if (changed.count !== 1) throw new Error(`Payment state raced while processing event ${event.id}`);
        if (next === 'REFUNDED') await tx.order.updateMany({ where: { id: payment.orderId, status: { in: ['PAID', 'SHIPPED', 'DELIVERED'] } }, data: { status: 'REFUNDED' } });
        await tx.auditLog.create({ data: { action: 'PAYMENT_STATE_CHANGED', resourceType: 'Payment', resourceId: payment.id, severity: 'INFO', metadata: { eventId: event.id, eventType: event.type, from: payment.status, to: next, amountRefunded } } });
        return;
      }

      const session = event.data.object as Stripe.Checkout.Session;
      const orderId = session.metadata?.orderId;
      const paymentId = session.metadata?.paymentId;
      if (!orderId || !paymentId) { await auditIgnoredEvent(tx, event, 'Checkout event is missing orderId/paymentId metadata', session.id); return; }
      const payment = await tx.payment.findUnique({ where: { id: paymentId }, include: { order: true } });
      if (!payment || payment.orderId !== orderId) { await auditIgnoredEvent(tx, event, 'Checkout event references an unknown payment', session.id); return; }
      const paid = session.payment_status === 'paid' && ['checkout.session.completed', 'checkout.session.async_payment_succeeded'].includes(event.type);
      if (payment.stripeCheckoutSessionId !== session.id) {
        if (paid && payment.status === 'SUCCEEDED') return;
        if (paid) {
          await tx.order.update({ where: { id: orderId }, data: { manualReviewRequired: true } });
          await tx.auditLog.create({ data: { action: 'POSSIBLE_DOUBLE_PAYMENT_SESSION_MISMATCH', resourceType: 'Order', resourceId: orderId, severity: 'CRITICAL', metadata: { eventId: event.id, eventType: event.type, receivedSessionId: session.id, storedSessionId: payment.stripeCheckoutSessionId, paymentId: payment.id } } });
          logger.error({ eventId: event.id, orderId, paymentId: payment.id, receivedSessionId: session.id, storedSessionId: payment.stripeCheckoutSessionId }, 'Paid Checkout session differs from stored session; manual review required');
        } else {
          await auditIgnoredEvent(tx, event, 'Checkout session id differs from the stored payment session', session.id);
        }
        return;
      }

      if (event.type === 'checkout.session.expired') {
        const changed = await restockAndCancel(tx, orderId, 'Stripe Checkout session expired', session.id);
        if (!changed) {
          const currentOrder = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } });
          if (currentOrder?.status !== 'CANCELLED' && payment.status !== 'CANCELLED') throw new Error(`Out-of-order checkout.session.expired event ${event.id}`);
        }
        if (changed) {
          if (!canTransition(payment.status, 'CANCELLED')) throw new Error(`Rejected out-of-order payment transition ${payment.status} -> CANCELLED`);
          const paymentChanged = await tx.payment.updateMany({ where: { id: payment.id, status: payment.status }, data: { status: 'CANCELLED', lastStripeEventId: event.id } });
          if (paymentChanged.count !== 1) throw new Error(`Payment state raced while processing ${event.id}`);
        }
        await tx.auditLog.create({ data: { action: 'CHECKOUT_SESSION_EXPIRED', resourceType: 'Order', resourceId: orderId, severity: 'WARNING', metadata: { eventId: event.id, sessionId: session.id, cancelledAndRestocked: changed } } });
        return;
      }

      if (event.type === 'checkout.session.async_payment_failed') {
        if (!canTransition(payment.status, 'FAILED')) throw new Error(`Rejected out-of-order payment transition ${payment.status} -> FAILED for ${payment.id}`);
        const changed = await tx.payment.updateMany({ where: { id: payment.id, status: payment.status }, data: { status: 'FAILED', lastStripeEventId: event.id, failureCode: 'ASYNC_PAYMENT_FAILED' } });
        if (changed.count !== 1) throw new Error(`Payment state raced while processing ${event.id}`);
        const cancelled = await restockAndCancel(tx, orderId, 'Asynchronous Stripe payment failed', session.id);
        if (!cancelled) { const currentOrder = await tx.order.findUnique({ where: { id: orderId }, select: { status: true } }); if (currentOrder?.status !== 'CANCELLED') throw new Error(`Out-of-order checkout.session.async_payment_failed event ${event.id}`); }
        await tx.auditLog.create({ data: { action: 'PAYMENT_STATE_CHANGED', resourceType: 'Payment', resourceId: payment.id, severity: 'WARNING', metadata: { eventId: event.id, eventType: event.type, from: payment.status, to: 'FAILED', cancelledAndRestocked: cancelled } } });
        return;
      }

      if (!paid) return;
      if (payment.status === 'SUCCEEDED') return;
      if (session.amount_total !== payment.amount || session.currency?.toUpperCase() !== payment.currency.trim().toUpperCase()) {
        logger.error({ eventId: event.id, paymentId: payment.id, expectedAmount: payment.amount, actualAmount: session.amount_total, expectedCurrency: payment.currency, actualCurrency: session.currency }, 'Stripe Checkout amount/currency mismatch');
        await tx.order.update({ where: { id: orderId }, data: { manualReviewRequired: true } });
        await tx.auditLog.create({ data: { action: 'PAYMENT_AMOUNT_CURRENCY_MISMATCH', resourceType: 'Payment', resourceId: payment.id, severity: 'CRITICAL', metadata: { eventId: event.id, expectedAmount: payment.amount, actualAmount: session.amount_total, expectedCurrency: payment.currency, actualCurrency: session.currency } } });
        return;
      }
      if (!canTransition(payment.status, 'SUCCEEDED')) throw new Error(`Rejected out-of-order payment transition ${payment.status} -> SUCCEEDED for ${payment.id}`);
      const intentId = typeof session.payment_intent === 'string' ? session.payment_intent : session.payment_intent?.id;
      const updated = await tx.payment.updateMany({ where: { id: payment.id, status: payment.status }, data: { status: 'SUCCEEDED', lastStripeEventId: event.id, ...(intentId ? { stripePaymentIntentId: intentId } : {}) } });
      if (updated.count !== 1) throw new Error(`Payment state raced while processing ${event.id}`);
      const orderChanged = await tx.order.updateMany({ where: { id: orderId, status: 'PENDING' }, data: { status: 'PAID', paidAt: new Date() } });
      if (orderChanged.count !== 1) {
        await tx.order.update({ where: { id: orderId }, data: { manualReviewRequired: true } });
        await tx.auditLog.create({ data: { action: 'PAID_PAYMENT_ORDER_STATE_MISMATCH', resourceType: 'Order', resourceId: orderId, severity: 'CRITICAL', metadata: { eventId: event.id, paymentId: payment.id, currentOrderStatus: payment.order.status } } });
      }
      await tx.auditLog.create({ data: { action: 'PAYMENT_STATE_CHANGED', resourceType: 'Payment', resourceId: payment.id, severity: 'INFO', metadata: { eventId: event.id, eventType: event.type, from: payment.status, to: 'SUCCEEDED' } } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      const target = error.meta?.target;
      if ((Array.isArray(target) && target.includes('eventId')) || String(target ?? '').includes('eventId') || JSON.stringify(error.meta ?? {}).includes('eventId')) return { received: true, duplicate: true };
    }
    throw error;
  }
  return { received: true };
}
export default router;
