// SECURITY-CRITICAL
import { Queue, Worker } from 'bullmq';
import Stripe from 'stripe';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { queueRedis } from '../middleware/security.js';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';

const QUEUE_NAME = 'order-maintenance';
const stripe = env.STRIPE_SECRET_KEY ? new Stripe(env.STRIPE_SECRET_KEY) : null;
export const orderMaintenanceQueue = new Queue(QUEUE_NAME, { connection: queueRedis, defaultJobOptions: { attempts: 5, backoff: { type: 'exponential', delay: 1000 }, removeOnComplete: 1000, removeOnFail: 5000 } });
export async function scheduleOrderMaintenance() {
  await orderMaintenanceQueue.upsertJobScheduler('expire-pending-orders-every-minute', { every: 60_000 }, { name: 'expire-pending-orders', data: {} });
  await orderMaintenanceQueue.upsertJobScheduler('reconcile-checkout-sessions-every-10-minutes', { every: 10 * 60_000 }, { name: 'reconcile-checkout-sessions', data: {} });
}
async function restock(tx: Prisma.TransactionClient, orderId: string) {
  const items = await tx.orderItem.findMany({ where: { orderId }, select: { variantId: true, quantity: true } });
  for (const item of items) await tx.productVariant.updateMany({ where: { id: item.variantId }, data: { stockQuantity: { increment: item.quantity } } });
}
async function expireStalePendingOrders() {
  const cutoff = new Date(Date.now() - 30 * 60_000);
  const stale = await prisma.order.findMany({ where: { status: 'PENDING', createdAt: { lt: cutoff }, deletedAt: null, OR: [{ checkoutStartedAt: null }, { checkoutStartedAt: { lt: new Date(Date.now() - 2 * 60_000) } }], payments: { none: { OR: [{ stripeCheckoutSessionId: { not: null } }, { stripePaymentIntentId: { not: null } }] } } }, select: { id: true }, take: 200 });
  for (const order of stale) await prisma.$transaction(async tx => {
    const changed = await tx.order.updateMany({ where: { id: order.id, status: 'PENDING', createdAt: { lt: cutoff }, OR: [{ checkoutStartedAt: null }, { checkoutStartedAt: { lt: new Date(Date.now() - 2 * 60_000) } }], payments: { none: { OR: [{ stripeCheckoutSessionId: { not: null } }, { stripePaymentIntentId: { not: null } }] } } }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: 'Automatically expired after 30 minutes' } });
    if (changed.count !== 1) return;
    await restock(tx, order.id);
    await tx.auditLog.create({ data: { action: 'STALE_ORDER_EXPIRED', resourceType: 'Order', resourceId: order.id, metadata: { cutoff: cutoff.toISOString() } } });
  }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
  if (stale.length) logger.info({ count: stale.length }, 'Expired stale pending orders');
}
async function reconcileCheckoutSessions() {
  if (!stripe) return;
  const cutoff = new Date(Date.now() - 2 * 60 * 60_000);
  const candidates = await prisma.order.findMany({ where: { status: 'PENDING', deletedAt: null, payments: { some: { stripeCheckoutSessionId: { not: null }, updatedAt: { lt: cutoff } } } }, include: { payments: true }, take: 200 });
  for (const order of candidates) {
    for (const payment of order.payments) {
      if (!payment.stripeCheckoutSessionId || payment.updatedAt >= cutoff) continue;
      let session: Stripe.Checkout.Session;
      try { session = await stripe.checkout.sessions.retrieve(payment.stripeCheckoutSessionId); }
      catch (error) { logger.error({ err: error, orderId: order.id, paymentId: payment.id }, 'Unable to reconcile Stripe Checkout session'); throw error; }
      const shouldCancel = session.status === 'expired';
      if (!shouldCancel) continue;
      await prisma.$transaction(async tx => {
        const changed = await tx.order.updateMany({ where: { id: order.id, status: 'PENDING', payments: { some: { id: payment.id, stripeCheckoutSessionId: session.id } } }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: 'Stripe Checkout session expired during reconciliation' } });
        if (changed.count !== 1) return;
        await restock(tx, order.id);
        const paymentChanged = await tx.payment.updateMany({ where: { id: payment.id, status: { in: ['PENDING', 'PROCESSING', 'REQUIRES_ACTION'] } }, data: { status: 'CANCELLED' } });
        if (paymentChanged.count !== 1) throw new Error(`Payment state changed during reconciliation: ${payment.id}`);
        await tx.auditLog.create({ data: { action: 'STRIPE_SESSION_RECONCILED_CANCELLED', resourceType: 'Order', resourceId: order.id, severity: 'WARNING', metadata: { sessionId: session.id, sessionStatus: session.status, paymentStatus: session.payment_status } } });
      }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    }
  }
}
export const orderMaintenanceWorker = new Worker(QUEUE_NAME, async job => {
  if (job.name === 'expire-pending-orders') return expireStalePendingOrders();
  if (job.name === 'reconcile-checkout-sessions') return reconcileCheckoutSessions();
  throw new Error(`Unknown order maintenance job: ${job.name}`);
}, { connection: queueRedis, concurrency: 2 });
orderMaintenanceWorker.on('failed', (job, error) => logger.error({ jobId: job?.id, err: error }, 'Order maintenance job failed'));
export async function closeOrderMaintenance() { await Promise.allSettled([orderMaintenanceWorker.close(), orderMaintenanceQueue.close()]); }
