import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { prisma } from '../../lib/prisma.js';
import { badRequest, notFound } from '../../lib/errors.js';

const router = Router();
router.post('/', authenticate, async (req, res, next) => {
  try {
    const input = z.object({ productId: z.string().uuid(), rating: z.number().int().min(1).max(5), title: z.string().trim().min(2).max(150), body: z.string().trim().min(10).max(5000) }).parse(req.body);
    const purchased = await prisma.orderItem.findFirst({ where: { productId: input.productId, order: { userId: req.auth!.userId, status: { in: ['PAID', 'SHIPPED', 'DELIVERED'] } } } });
    if (!purchased) throw badRequest('Only verified purchasers can review this product');
    const product = await prisma.product.findFirst({ where: { id: input.productId, status: 'ACTIVE', deletedAt: null } });
    if (!product) throw notFound('Product not found');
    const review = await prisma.review.create({ data: { ...input, userId: req.auth!.userId, isVerified: true, isPublished: false } });
    res.status(201).json({ data: review, message: 'Review submitted for moderation' });
  } catch (e) { next(e); }
});
export default router;
