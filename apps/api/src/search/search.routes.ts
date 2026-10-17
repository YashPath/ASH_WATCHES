import { Router } from 'express';
import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { notFound, AppError } from '../lib/errors.js';
import { env } from '../config/env.js';
import { assistantLimiter, searchLimiter, suggestLimiter } from '../middleware/security.js';
import { filtersFromIntent, hybridSearchIds, type SearchFilters } from './hybrid.js';
import { formatInr, parseIntent } from './intent.js';
import { getEmbedding, queryNearest } from './vector-store.js';
import { EmbeddingBudgetExceeded } from './query-embedding.js';

const router = Router();
const cardSelect = {
  id: true, name: true, slug: true, shortDescription: true, basePrice: true, compareAtPrice: true, currency: true, gender: true, movement: true, isFeatured: true,
  brand: { select: { id: true, name: true, slug: true } }, category: { select: { name: true, slug: true } },
  images: { orderBy: { sortOrder: 'asc' }, take: 2, select: { url: true, altText: true, isPrimary: true } }
} satisfies Prisma.ProductSelect;
const visible: Prisma.ProductWhereInput = { status: 'ACTIVE', deletedAt: null, brand: { isActive: true, deletedAt: null } };

async function hydrate(ids: string[]) {
  if (!ids.length) return [];
  const rows = await prisma.product.findMany({
    where: { id: { in: ids }, ...visible },
    select: { ...cardSelect, variants: { where: { isActive: true, deletedAt: null }, select: { stockQuantity: true } } }
  });
  const byId = new Map(rows.map(r => [r.id, r]));
  return ids.flatMap(id => {
    const row = byId.get(id);
    if (!row) return [];
    const { variants, ...rest } = row;
    return [{ ...rest, inStock: variants.some(v => v.stockQuantity > 0) }];
  });
}

const searchSchema = z.object({
  q: z.string().trim().min(2).max(120),
  minPrice: z.coerce.number().int().nonnegative().optional(), maxPrice: z.coerce.number().int().nonnegative().optional(),
  gender: z.enum(['MEN', 'WOMEN']).optional(), movement: z.enum(['QUARTZ', 'AUTOMATIC', 'MANUAL', 'SOLAR', 'SMART']).optional(),
  brand: z.string().uuid().optional(), category: z.string().uuid().optional(),
  page: z.coerce.number().int().min(1).max(20).default(1), limit: z.coerce.number().int().min(1).max(24).default(12)
});

function pageOf<T>(items: T[], page: number, limit: number) { return { items: items.slice((page - 1) * limit, page * limit), pagination: { page, limit, total: items.length, pages: Math.ceil(items.length / limit) } }; }

async function runSearch(q: string, filters: SearchFilters) {
  try { return await hybridSearchIds(q, filters); }
  catch (error) { if (error instanceof EmbeddingBudgetExceeded) return { ids: [], mode: 'keyword-only' as const }; throw error; }
}

router.get('/', searchLimiter, async (req, res, next) => {
  try {
    if (env.SEARCH_ENABLED !== 'true') throw new AppError(503, 'Search is disabled', 'SEARCH_DISABLED');
    const p = searchSchema.parse(req.query);
    const filters: SearchFilters = { ...(p.minPrice !== undefined ? { minPrice: p.minPrice } : {}), ...(p.maxPrice !== undefined ? { maxPrice: p.maxPrice } : {}), ...(p.gender ? { gender: p.gender } : {}), ...(p.movement ? { movement: p.movement } : {}), ...(p.brand ? { brandId: p.brand } : {}), ...(p.category ? { categoryId: p.category } : {}) };
    const { ids, mode } = await runSearch(p.q, filters);
    const slice = pageOf(ids, p.page, p.limit);
    res.json({ data: await hydrate(slice.items), pagination: slice.pagination, meta: { mode } });
  } catch (e) { next(e); }
});

router.get('/suggest', suggestLimiter, async (req, res, next) => {
  try {
    const { q } = z.object({ q: z.string().trim().min(2).max(60) }).parse(req.query);
    const pattern = `${q.replace(/[\\%_]/g, m => `\\${m}`)}%`;
    const rows = await prisma.$queryRaw<Array<{ name: string; slug: string }>>(Prisma.sql`
      SELECT p."name", p."slug" FROM "Product" p JOIN "Brand" b ON b."id" = p."brandId"
      WHERE p."status" = 'ACTIVE' AND p."deletedAt" IS NULL AND b."isActive" = true AND b."deletedAt" IS NULL
        AND (p."name" ILIKE ${pattern} OR b."name" ILIKE ${pattern} OR p."name" ILIKE ${'% ' + pattern})
      ORDER BY p."isFeatured" DESC, p."name" ASC LIMIT 6`);
    res.json({ data: rows });
  } catch (e) { next(e); }
});

const assistantSchema = z.object({ message: z.string().trim().min(2).max(300) });
router.post('/assistant', assistantLimiter, async (req, res, next) => {
  try {
    if (env.SEARCH_ENABLED !== 'true') throw new AppError(503, 'Search is disabled', 'SEARCH_DISABLED');
    const { message } = assistantSchema.parse(req.body);
    const intent = parseIntent(message);
    const { ids, mode } = await runSearch(intent.semanticQuery, filtersFromIntent(intent));
    const products = (await hydrate(ids.slice(0, 6))).slice(0, 4);
    const understood = intent.notes.length ? `I understood: ${intent.notes.join(', ')}. ` : '';
    const reply = products.length
      ? `${understood}Here ${products.length === 1 ? 'is a watch' : `are ${products.length} watches`} that fit${products[0] ? `, starting with ${products[0].brand.name} ${products[0].name} at ${formatInr(products[0].basePrice)}` : ''}.`
      : `${understood}I could not find a close match. Try widening the budget or describing the style you like.`;
    res.json({ data: { reply, products, filters: intent.notes }, meta: { mode } });
  } catch (e) { next(e); }
});

export const similarRouter = Router();
similarRouter.get('/:slug/similar', searchLimiter, async (req, res, next) => {
  try {
    const product = await prisma.product.findFirst({ where: { slug: req.params.slug, ...visible }, select: { id: true, gender: true, categoryId: true } });
    if (!product) throw notFound('Product not found');
    let ids: string[] = [];
    let mode: 'semantic' | 'fallback' = 'fallback';
    try {
      const embedding = env.SEARCH_ENABLED === 'true' ? await getEmbedding(product.id) : null;
      if (embedding) {
        const hits = await queryNearest(embedding, 9, { gender: { $in: [product.gender, 'UNISEX'] } } as never);
        ids = hits.filter(h => h.id !== product.id && h.distance <= env.SEMANTIC_MAX_DISTANCE).map(h => h.id);
        mode = 'semantic';
      }
    } catch { /* fall through to category fallback */ }
    if (!ids.length) {
      const same = await prisma.product.findMany({ where: { ...visible, id: { not: product.id }, categoryId: product.categoryId }, orderBy: [{ isFeatured: 'desc' }, { createdAt: 'desc' }], take: 8, select: { id: true } });
      ids = same.map(s => s.id);
    }
    res.json({ data: await hydrate(ids.slice(0, 8)), meta: { mode } });
  } catch (e) { next(e); }
});

export default router;
