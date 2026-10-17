// SECURITY-CRITICAL
import { Router } from 'express';
import crypto from 'node:crypto';
import { z } from 'zod';
import { OrderStatus, Prisma } from '@prisma/client';
import { authenticate, requireVerifiedEmail } from '../../middleware/auth.js';
import { orderLimiter } from '../../middleware/security.js';
import { prisma } from '../../lib/prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';

const router = Router(); router.use(authenticate);
const createSchema = z.object({ shippingAddressId: z.string().uuid(), customerNote: z.string().max(1000).optional() });
const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));
function retryable(error: unknown): boolean {
  if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2034') return true;
  const message = error instanceof Error ? error.message : String(error);
  return /deadlock detected|could not serialize access|serialization failure|40P01|40001/i.test(message);
}
router.post('/', orderLimiter, requireVerifiedEmail, async (req, res, next) => {
  try {
    const input = createSchema.parse(req.body); const userId = req.auth!.userId;
    let created: unknown;
    for (let attempt = 0; attempt < 3; attempt++) {
      try {
        created = await prisma.$transaction(async tx => {
          // Serialize order creation per customer so the three-pending-order cap is race-safe.
          await tx.$queryRaw<Array<{ id: string }>>`SELECT "id" FROM "User" WHERE "id" = ${userId}::uuid FOR UPDATE`;
          const address = await tx.address.findFirst({ where: { id: input.shippingAddressId, userId, deletedAt: null } });
          if (!address) throw notFound('Shipping address not found');
          const pending = await tx.order.count({ where: { userId, status: 'PENDING', deletedAt: null, payments: { none: { provider: 'COD' } } } });
          if (pending >= 3) throw badRequest('Too many pending orders; complete or cancel an existing order');
          const cart = await tx.cart.findUnique({ where: { userId }, include: { items: true } });
          if (!cart || cart.items.length === 0) throw badRequest('Cart is empty');
          const cartItems = [...cart.items].sort((a, b) => a.variantId.localeCompare(b.variantId));
          const lockedVariants: Array<{ id: string; stockQuantity: number; price: number; productId: string; sku: string; name: string; productName: string }> = [];
          for (const item of cartItems) {
            const rows = await tx.$queryRaw<Array<{ id: string; stockQuantity: number; price: number; productId: string; sku: string; name: string; productName: string }>>`
              SELECT v."id", v."stockQuantity", v."price", v."productId", v."sku", v."name", p."name" AS "productName"
              FROM "ProductVariant" v JOIN "Product" p ON p."id" = v."productId"
              WHERE v."id" = ${item.variantId}::uuid AND v."isActive" = true AND v."deletedAt" IS NULL AND p."status" = 'ACTIVE' AND p."deletedAt" IS NULL
              FOR UPDATE OF v`;
            const row = rows[0]; if (!row || row.stockQuantity < item.quantity) throw badRequest('One or more items are out of stock'); lockedVariants.push(row);
          }
          let subtotal = 0;
          const orderItems: Prisma.OrderItemCreateWithoutOrderInput[] = [];
          for (const item of cartItems) {
            const variant = lockedVariants.find(v => v.id === item.variantId)!;
            const lineTotal = variant.price * item.quantity;
            if (!Number.isSafeInteger(lineTotal) || lineTotal <= 0) throw badRequest('Invalid order item total');
            subtotal += lineTotal;
            const decremented = await tx.productVariant.updateMany({ where: { id: variant.id, stockQuantity: { gte: item.quantity }, isActive: true }, data: { stockQuantity: { decrement: item.quantity } } });
            if (decremented.count !== 1) throw badRequest('Inventory changed; retry checkout');
            orderItems.push({ product: { connect: { id: variant.productId } }, variant: { connect: { id: variant.id } }, productName: variant.productName, variantName: variant.name, sku: variant.sku, quantity: item.quantity, unitPrice: variant.price, lineTotal, configuration: {} });
          }
          if (!Number.isSafeInteger(subtotal) || subtotal <= 0) throw badRequest('Invalid order total');
          const orderNumber = `ASH-${Date.now().toString(36).toUpperCase()}-${crypto.randomUUID().slice(0, 8).toUpperCase()}`;
          const order = await tx.order.create({ data: { orderNumber, userId, shippingAddressId: address.id, status: OrderStatus.PENDING, currency: 'INR', subtotal, totalAmount: subtotal, customerNote: input.customerNote, items: { create: orderItems }, payments: { create: { amount: subtotal, currency: 'INR', status: 'PENDING' } } }, include: { items: true, payments: true } });
          await tx.cartItem.deleteMany({ where: { cartId: cart.id } });
          await tx.auditLog.create({ data: { actorUserId: userId, action: 'ORDER_CREATED', resourceType: 'Order', resourceId: order.id, metadata: { orderNumber: order.orderNumber, totalAmount: subtotal } } });
          return order;
        }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted, timeout: 15000, maxWait: 5000 });
        break;
      } catch (error) { if (!retryable(error) || attempt === 2) throw error; await sleep(40 * (attempt + 1) + Math.floor(Math.random() * 40)); }
    }
    res.status(201).json({ data: created });
  } catch (e) { next(e); }
});
router.get('/', async (req, res, next) => { try { const orders = await prisma.order.findMany({ where: { userId: req.auth!.userId, deletedAt: null }, orderBy: { createdAt: 'desc' }, include: { items: true, payments: { select: { id: true, status: true, amount: true, currency: true, provider: true } } } }); res.json({ data: orders }); } catch (e) { next(e); } });
router.get('/:id', async (req, res, next) => { try { const id = z.string().uuid().parse(req.params.id); const order = await prisma.order.findFirst({ where: { id, userId: req.auth!.userId, deletedAt: null }, include: { items: true, payments: { select: { id: true, status: true, amount: true, currency: true, provider: true } } } }); if (!order) throw notFound('Order not found'); res.json({ data: order }); } catch (e) { next(e); } });
router.post('/:id/cancel', async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const result = await prisma.$transaction(async tx => {
      const order = await tx.order.findFirst({ where: { id, userId: req.auth!.userId }, include: { items: true, payments: true } });
      if (!order) throw notFound('Order not found');
      if (order.status !== 'PENDING') throw badRequest('Only pending orders can be cancelled');
      if (order.payments.some(payment => payment.stripeCheckoutSessionId || payment.stripePaymentIntentId)) throw badRequest('This order has entered payment processing and cannot be cancelled through this endpoint');
      const changed = await tx.order.updateMany({ where: { id, userId: req.auth!.userId, status: 'PENDING', checkoutStartedAt: null, payments: { none: { OR: [{ stripeCheckoutSessionId: { not: null } }, { stripePaymentIntentId: { not: null } }] } } }, data: { status: 'CANCELLED', cancelledAt: new Date(), cancellationReason: 'Cancelled by customer' } });
      if (changed.count !== 1) throw badRequest('Order status changed; reload and try again');
      for (const item of order.items) await tx.productVariant.updateMany({ where: { id: item.variantId }, data: { stockQuantity: { increment: item.quantity } } });
      await tx.payment.updateMany({ where: { orderId: id, provider: 'COD', status: 'PROCESSING' }, data: { status: 'CANCELLED' } });
      await tx.auditLog.create({ data: { actorUserId: req.auth!.userId, action: 'ORDER_CANCELLED', resourceType: 'Order', resourceId: order.id } });
      return tx.order.findUniqueOrThrow({ where: { id } });
    }, { isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted });
    res.json({ data: result });
  } catch (e) { next(e); }
});
router.post('/:id/cod', requireVerifiedEmail, async (req, res, next) => {
  try {
    const id = z.string().uuid().parse(req.params.id);
    const result = await prisma.$transaction(async tx => {
      const order = await tx.order.findFirst({ where: { id, userId: req.auth!.userId, deletedAt: null }, include: { payments: true } });
      if (!order) throw notFound('Order not found');
      if (order.status !== 'PENDING') throw badRequest('Order is not payable');
      if (order.checkoutStartedAt || order.payments.some(p => p.stripeCheckoutSessionId || p.stripePaymentIntentId)) throw badRequest('Online payment already started for this order');
      const payment = order.payments.find(p => p.status === 'PENDING');
      if (!payment) throw badRequest('No payable payment found');
      const changed = await tx.payment.updateMany({ where: { id: payment.id, status: 'PENDING', stripeCheckoutSessionId: null, stripePaymentIntentId: null }, data: { provider: 'COD', status: 'PROCESSING' } });
      if (changed.count !== 1) throw badRequest('Order changed; reload and try again');
      await tx.auditLog.create({ data: { actorUserId: req.auth!.userId, action: 'ORDER_COD_CONFIRMED', resourceType: 'Order', resourceId: order.id } });
      return tx.order.findUniqueOrThrow({ where: { id }, include: { items: true, payments: { select: { id: true, status: true, amount: true, currency: true, provider: true } } } });
    });
    res.json({ data: result });
  } catch (e) { next(e); }
});
export default router;
