import { Prisma } from '@prisma/client';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { env } from '../config/env.js';
import { reciprocalRankFusion } from './fusion.js';
import { queryNearest } from './vector-store.js';
import { embedQuery } from './query-embedding.js';
import type { Intent } from './intent.js';

export type SearchFilters = { minPrice?: number; maxPrice?: number; gender?: 'MEN' | 'WOMEN'; movement?: string; brandId?: string; categoryId?: string };
export type SearchMode = 'hybrid' | 'keyword-only';
const CANDIDATES = 60;

/** Chroma metadata filter. Unisex watches match either gender filter. */
function chromaWhere(f: SearchFilters): Record<string, unknown> | undefined {
  const clauses: Record<string, unknown>[] = [];
  if (f.gender) clauses.push({ gender: { $in: [f.gender, 'UNISEX'] } });
  if (f.movement) clauses.push({ movement: f.movement });
  if (f.brandId) clauses.push({ brandId: f.brandId });
  if (f.categoryId) clauses.push({ categoryId: f.categoryId });
  if (f.maxPrice !== undefined) clauses.push({ minPrice: { $lte: f.maxPrice } });
  if (f.minPrice !== undefined) clauses.push({ maxPrice: { $gte: f.minPrice } });
  if (!clauses.length) return undefined;
  return clauses.length === 1 ? clauses[0] : { $and: clauses };
}

function sqlFilters(f: SearchFilters): Prisma.Sql {
  const parts: Prisma.Sql[] = [Prisma.sql`p."status" = 'ACTIVE' AND p."deletedAt" IS NULL AND b."isActive" = true AND b."deletedAt" IS NULL`];
  if (f.gender) parts.push(Prisma.sql`p."gender"::text IN (${f.gender}, 'UNISEX')`);
  if (f.movement) parts.push(Prisma.sql`p."movement"::text = ${f.movement}`);
  if (f.brandId) parts.push(Prisma.sql`p."brandId" = ${f.brandId}::uuid`);
  if (f.categoryId) parts.push(Prisma.sql`p."categoryId" = ${f.categoryId}::uuid`);
  if (f.maxPrice !== undefined) parts.push(Prisma.sql`p."basePrice" <= ${f.maxPrice}`);
  if (f.minPrice !== undefined) parts.push(Prisma.sql`p."basePrice" >= ${f.minPrice}`);
  return Prisma.join(parts, ' AND ');
}

/** Keyword leg: Postgres full text search, weighted name > short description > body. Always parameterised. */
export async function keywordSearch(query: string, filters: SearchFilters, limit = CANDIDATES): Promise<string[]> {
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT p."id" FROM "Product" p JOIN "Brand" b ON b."id" = p."brandId",
      websearch_to_tsquery('english', ${query}) q
    WHERE ${sqlFilters(filters)}
      AND (setweight(to_tsvector('english', p."name" || ' ' || b."name"), 'A')
        || setweight(to_tsvector('english', coalesce(p."shortDescription", '') || ' ' || array_to_string(p."tags", ' ')), 'B')
        || setweight(to_tsvector('english', p."description"), 'C')) @@ q
    ORDER BY ts_rank_cd(setweight(to_tsvector('english', p."name" || ' ' || b."name"), 'A')
        || setweight(to_tsvector('english', coalesce(p."shortDescription", '') || ' ' || array_to_string(p."tags", ' ')), 'B')
        || setweight(to_tsvector('english', p."description"), 'C'), q) DESC, p."isFeatured" DESC
    LIMIT ${limit}`);
  return rows.map(r => r.id);
}

/** Substring fallback so a typo-free partial like "chrono" still finds something when FTS has no stem match. */
async function likeSearch(query: string, filters: SearchFilters, limit = CANDIDATES): Promise<string[]> {
  const pattern = `%${query.replace(/[\\%_]/g, m => `\\${m}`)}%`;
  const rows = await prisma.$queryRaw<Array<{ id: string }>>(Prisma.sql`
    SELECT p."id" FROM "Product" p JOIN "Brand" b ON b."id" = p."brandId"
    WHERE ${sqlFilters(filters)} AND (p."name" ILIKE ${pattern} OR b."name" ILIKE ${pattern})
    ORDER BY p."isFeatured" DESC, p."createdAt" DESC LIMIT ${limit}`);
  return rows.map(r => r.id);
}

export async function semanticSearch(query: string, filters: SearchFilters, limit = CANDIDATES): Promise<string[]> {
  const embedding = await embedQuery(query);
  const hits = await queryNearest(embedding, limit, chromaWhere(filters) as never);
  return hits.filter(h => h.distance <= env.SEMANTIC_MAX_DISTANCE).map(h => h.id);
}

/** Final ids in rank order. Chroma only proposes ids; Postgres re-checks visibility when hydrating. */
export async function hybridSearchIds(query: string, filters: SearchFilters): Promise<{ ids: string[]; mode: SearchMode }> {
  const [keyword, semantic] = await Promise.allSettled([keywordSearch(query, filters), semanticSearch(query, filters)]);
  let kw = keyword.status === 'fulfilled' ? keyword.value : [];
  if (keyword.status === 'rejected') logger.error({ err: keyword.reason }, 'Keyword search failed');
  if (kw.length === 0 && semantic.status !== 'fulfilled') kw = await likeSearch(query, filters).catch(() => []);
  if (semantic.status === 'rejected') logger.warn({ err: semantic.reason instanceof Error ? semantic.reason.message : semantic.reason }, 'Semantic search unavailable, using keyword only');
  const sem = semantic.status === 'fulfilled' ? semantic.value : [];
  const fused = reciprocalRankFusion([{ ids: kw, weight: 1.2 }, { ids: sem, weight: 1 }]);
  return { ids: fused.map(f => f.id), mode: semantic.status === 'fulfilled' ? 'hybrid' : 'keyword-only' };
}

export function filtersFromIntent(intent: Intent): SearchFilters {
  return {
    ...(intent.minPrice !== undefined ? { minPrice: intent.minPrice } : {}), ...(intent.maxPrice !== undefined ? { maxPrice: intent.maxPrice } : {}),
    ...(intent.gender ? { gender: intent.gender } : {}), ...(intent.movement ? { movement: intent.movement } : {})
  };
}
