import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { prisma } from '../../lib/prisma.js';
import { notFound, badRequest } from '../../lib/errors.js';

const router = Router();
router.use(authenticate);
const itemSchema = z.object({ variantId: z.string().uuid(), quantity: z.number().int().min(1).max(10) });

router.get('/', async (req, res, next) => {
  try {
    const cart = await prisma.cart.findUnique({
      where: { userId: req.auth!.userId },
      include: {
        items: {
          include: {
            variant: {
              include: {
                product: {
                  include: {
                    brand: true,
                    images: { where: { isPrimary: true }, take: 1 }
                  }
                }
              }
            }
          }
        }
      }
    });
    if (!cart) throw notFound('Cart not found');
    const items = cart.items.map(item => ({ id: item.id, variantId: item.variantId, quantity: item.quantity, product: { id: item.variant.product.id, name: item.variant.product.name, slug: item.variant.product.slug, brand: item.variant.product.brand.name }, variant: { name: item.variant.name, price: item.variant.price, stockQuantity: item.variant.stockQuantity }, image: item.variant.product.images[0]?.url ?? null, lineTotal: item.variant.price * item.quantity }));
    res.json({ data: { id: cart.id, currency: cart.currency, items, subtotal: items.reduce((sum, item) => sum + item.lineTotal, 0) } });
  } catch (e) { next(e); }
});

router.post('/items', async (req, res, next) => {
  try {
    const input = itemSchema.parse(req.body);
    const variant = await prisma.productVariant.findFirst({ where: { id: input.variantId, isActive: true, deletedAt: null, product: { status: 'ACTIVE', deletedAt: null } } });
    if (!variant) throw notFound('Variant not available');
    if (variant.stockQuantity < input.quantity) throw badRequest('Insufficient stock');
    const cart = await prisma.cart.upsert({ where: { userId: req.auth!.userId }, create: { userId: req.auth!.userId }, update: {} });
    const current = await prisma.cartItem.findUnique({ where: { cartId_variantId: { cartId: cart.id, variantId: input.variantId } } });
    const quantity = (current?.quantity ?? 0) + input.quantity;
    if (quantity > 10 || quantity > variant.stockQuantity) throw badRequest('Requested quantity exceeds the allowed quantity or available stock');
    const item = await prisma.cartItem.upsert({ where: { cartId_variantId: { cartId: cart.id, variantId: input.variantId } }, create: { cartId: cart.id, variantId: input.variantId, quantity: input.quantity }, update: { quantity } });
    res.status(201).json({ data: item });
  } catch (e) { next(e); }
});

router.patch('/items/:id', async (req, res, next) => {
  try {
    const quantity = z.object({ quantity: z.number().int().min(1).max(10) }).parse(req.body).quantity;
    const cart = await prisma.cart.findUnique({ where: { userId: req.auth!.userId } });
    if (!cart) throw notFound('Cart not found');
    const item = await prisma.cartItem.findFirst({ where: { id: req.params.id, cartId: cart.id }, include: { variant: true } });
    if (!item) throw notFound('Cart item not found');
    if (quantity > item.variant.stockQuantity) throw badRequest('Insufficient stock');
    res.json({ data: await prisma.cartItem.update({ where: { id: item.id }, data: { quantity } }) });
  } catch (e) { next(e); }
});

router.delete('/items/:id', async (req, res, next) => {
  try {
    const cart = await prisma.cart.findUnique({ where: { userId: req.auth!.userId } });
    if (!cart) throw notFound('Cart not found');
    const item = await prisma.cartItem.findFirst({ where: { id: req.params.id, cartId: cart.id } });
    if (!item) throw notFound('Cart item not found');
    await prisma.cartItem.delete({ where: { id: item.id } });
    res.status(204).end();
  } catch (e) { next(e); }
});

export default router;
