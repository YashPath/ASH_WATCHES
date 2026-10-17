import { Router } from 'express';
import { z } from 'zod';
import { ProductStatus, Prisma } from '@prisma/client';
import { prisma } from '../../lib/prisma.js';
import { notFound } from '../../lib/errors.js';

const router = Router();
const querySchema = z.object({
  q: z.string().trim().max(120).optional(), brand: z.string().uuid().optional(), category: z.string().optional(),
  minPrice: z.coerce.number().int().nonnegative().optional(), maxPrice: z.coerce.number().int().nonnegative().optional(),
  strap: z.string().max(80).optional(), caseSize: z.coerce.number().positive().max(100).optional(), movement: z.enum(['QUARTZ','AUTOMATIC','MANUAL','SOLAR','SMART']).optional(),
  gender: z.enum(['MEN','WOMEN','UNISEX']).optional(), color: z.string().max(60).optional(), sort: z.enum(['newest','price_asc','price_desc','name']).default('newest'),
  page: z.coerce.number().int().min(1).default(1), limit: z.coerce.number().int().min(1).max(48).default(12)
});

router.get('/', async (req, res, next) => {
  try {
    const q = querySchema.parse(req.query);
    const where: Prisma.ProductWhereInput = { status: ProductStatus.ACTIVE, deletedAt: null, brand: { isActive: true, deletedAt: null } };
    if (q.brand) where.brandId = q.brand;
    if (q.category) where.category = { slug: q.category };
    if (q.q) where.OR = [{ name: { contains: q.q, mode: 'insensitive' } }, { description: { contains: q.q, mode: 'insensitive' } }, { tags: { has: q.q.toLowerCase() } }];
    if (q.minPrice !== undefined || q.maxPrice !== undefined) where.basePrice = { ...(q.minPrice !== undefined ? { gte: q.minPrice } : {}), ...(q.maxPrice !== undefined ? { lte: q.maxPrice } : {}) };
    if (q.caseSize !== undefined) where.caseSizeMm = { gte: new Prisma.Decimal(q.caseSize - 1), lte: new Prisma.Decimal(q.caseSize + 1) };
    if (q.movement) where.movement = q.movement;
    if (q.gender) where.gender = q.gender;
    if (q.strap || q.color) where.variants = { some: { isActive: true, deletedAt: null, ...(q.strap ? { strapMaterial: { contains: q.strap, mode: 'insensitive' } } : {}), ...(q.color ? { OR: [{ strapColor: { contains: q.color, mode: 'insensitive' } }, { dialColor: { contains: q.color, mode: 'insensitive' } }, { caseColor: { contains: q.color, mode: 'insensitive' } }] } : {}) } };
    const orderBy: Prisma.ProductOrderByWithRelationInput = q.sort === 'price_asc' ? { basePrice: 'asc' } : q.sort === 'price_desc' ? { basePrice: 'desc' } : q.sort === 'name' ? { name: 'asc' } : { createdAt: 'desc' };
    const [items, total] = await prisma.$transaction([
      prisma.product.findMany({ where, orderBy, skip: (q.page - 1) * q.limit, take: q.limit, include: { brand: true, category: true, images: { orderBy: { sortOrder: 'asc' } }, variants: { where: { isActive: true, deletedAt: null }, select: { id: true, name: true, price: true, stockQuantity: true, strapMaterial: true, strapColor: true, dialColor: true, caseMaterial: true, caseColor: true } } } }),
      prisma.product.count({ where })
    ]);
    res.json({ data: items, pagination: { page: q.page, limit: q.limit, total, pages: Math.ceil(total / q.limit) } });
  } catch (e) { next(e); }
});

router.get('/:slug', async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({ where: { slug: req.params.slug, status: ProductStatus.ACTIVE, deletedAt: null }, include: { brand: true, category: true, images: { orderBy: { sortOrder: 'asc' } }, models3D: { where: { isActive: true } }, variants: { where: { isActive: true, deletedAt: null } }, reviews: { where: { isPublished: true, deletedAt: null }, orderBy: { createdAt: 'desc' }, take: 20, select: { id: true, rating: true, title: true, body: true, isVerified: true, createdAt: true, user: { select: { firstName: true } } } } } });
    if (!product) throw notFound('Product not found');
    res.json({ data: product });
  } catch (e) { next(e); }
});

export default router;
