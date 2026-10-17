import { Router } from 'express';
import { z } from 'zod';
import { authenticate } from '../../middleware/auth.js';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';

const router = Router(); router.use(authenticate);
router.get('/', async (req, res, next) => { try { const items = await prisma.wishlistItem.findMany({ where: { userId: req.auth!.userId }, include: { product: { include: { brand: true, images: { orderBy: { sortOrder: 'asc' }, take: 1 } } } }, orderBy: { createdAt: 'desc' } }); res.json({ data: items }); } catch (e) { next(e); } });
router.post('/', async (req, res, next) => { try { const { productId } = z.object({ productId: z.string().uuid() }).parse(req.body); const product = await prisma.product.findFirst({ where: { id: productId, status: 'ACTIVE', deletedAt: null } }); if (!product) throw notFound('Product not found'); const item = await prisma.wishlistItem.upsert({ where: { userId_productId: { userId: req.auth!.userId, productId } }, create: { userId: req.auth!.userId, productId }, update: {} }); res.status(201).json({ data: item }); } catch (e) { next(e); } });
router.delete('/:productId', async (req, res, next) => { try { const productId = z.string().uuid().parse(req.params.productId); await prisma.wishlistItem.deleteMany({ where: { userId: req.auth!.userId, productId } }); res.status(204).end(); } catch (e) { next(e); } });
export default router;
