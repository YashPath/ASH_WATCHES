import { Prisma } from '@prisma/client';
import type { VectorMetadata } from './vector-store.js';

export const indexInclude = {
  brand: { select: { id: true, name: true, slug: true, isActive: true, deletedAt: true } },
  category: { select: { id: true, name: true, slug: true } },
  variants: { where: { isActive: true, deletedAt: null }, select: { price: true, strapMaterial: true, strapColor: true, dialColor: true, caseMaterial: true, caseColor: true } }
} satisfies Prisma.ProductInclude;
export type IndexableProduct = Prisma.ProductGetPayload<{ include: typeof indexInclude }>;

export const DOC_VERSION = 1;
const MAX_DOC_CHARS = 6000;

export function isIndexable(p: Pick<IndexableProduct, 'status' | 'deletedAt' | 'brand'>): boolean {
  return p.status === 'ACTIVE' && p.deletedAt === null && p.brand.isActive && p.brand.deletedAt === null;
}

function unique(values: string[]): string[] { return [...new Set(values.map(v => v.trim()).filter(Boolean))]; }

function flattenSpecs(value: Prisma.JsonValue, prefix = '', out: string[] = [], depth = 0): string[] {
  if (out.length >= 30 || depth > 2 || value === null) return out;
  if (typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean') { out.push(`${prefix}: ${String(value).slice(0, 120)}`); return out; }
  if (Array.isArray(value)) { out.push(`${prefix}: ${value.filter(v => typeof v !== 'object').map(String).join(', ').slice(0, 200)}`); return out; }
  for (const [key, child] of Object.entries(value)) flattenSpecs(child as Prisma.JsonValue, key.slice(0, 60), out, depth + 1);
  return out;
}

/** Text that gets embedded plus the metadata stored beside the vector. Pure function: easy to test. */
export function buildSearchDocument(p: IndexableProduct): { text: string; metadata: VectorMetadata } {
  const prices = p.variants.map(v => v.price);
  const minPrice = prices.length ? Math.min(...prices) : p.basePrice;
  const maxPrice = prices.length ? Math.max(...prices) : p.basePrice;
  const caseSize = Number(p.caseSizeMm);
  const lines = [
    `${p.brand.name} ${p.name}`,
    `Category: ${p.category.name}`,
    p.shortDescription ?? '',
    p.description,
    `Movement: ${p.movement.toLowerCase()}. Gender: ${p.gender.toLowerCase()}. Case size ${caseSize} mm. Water resistance ${p.waterResistanceM} m.${p.crystal ? ` Crystal: ${p.crystal}.` : ''}${p.powerReserveHours ? ` Power reserve ${p.powerReserveHours} hours.` : ''}`,
    `Strap: ${unique(p.variants.map(v => v.strapMaterial)).join(', ')}. Strap colours: ${unique(p.variants.map(v => v.strapColor)).join(', ')}. Dial colours: ${unique(p.variants.map(v => v.dialColor)).join(', ')}. Case: ${unique(p.variants.map(v => `${v.caseMaterial} ${v.caseColor}`)).join(', ')}.`,
    p.tags.length ? `Tags: ${p.tags.join(', ')}` : '',
    ...flattenSpecs(p.specifications as Prisma.JsonValue)
  ];
  const text = lines.filter(Boolean).join('\n').replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, ' ').slice(0, MAX_DOC_CHARS);
  return {
    text,
    metadata: {
      productId: p.id, slug: p.slug, brandId: p.brandId, categoryId: p.categoryId, gender: p.gender, movement: p.movement,
      minPrice, maxPrice, caseSizeMm: caseSize, isFeatured: p.isFeatured, docVersion: DOC_VERSION
    }
  };
}
