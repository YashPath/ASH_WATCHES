import { describe, expect, it } from 'vitest';
import { buildSearchDocument, isIndexable, type IndexableProduct } from '../src/search/document.js';

const base = {
  id: '11111111-1111-4111-8111-111111111111', slug: 'x', brandId: 'b', categoryId: 'c', name: 'Orbit', shortDescription: 'Diver', description: 'A rugged dive watch.',
  gender: 'MEN', movement: 'AUTOMATIC', caseSizeMm: 42, waterResistanceM: 200, crystal: 'Sapphire', powerReserveHours: 70, basePrice: 2500000, isFeatured: true,
  tags: ['dive', 'steel'], specifications: { lume: 'Super-LumiNova', nested: { depth: 3 } }, status: 'ACTIVE', deletedAt: null,
  brand: { id: 'b', name: 'Ashford', slug: 'ashford', isActive: true, deletedAt: null }, category: { id: 'c', name: 'Divers', slug: 'divers' },
  variants: [{ price: 2500000, strapMaterial: 'Steel', strapColor: 'Silver', dialColor: 'Blue', caseMaterial: 'Steel', caseColor: 'Silver' }, { price: 2700000, strapMaterial: 'Rubber', strapColor: 'Black', dialColor: 'Black', caseMaterial: 'Steel', caseColor: 'Silver' }]
} as unknown as IndexableProduct;

describe('search document', () => {
  it('builds text and price range metadata', () => {
    const { text, metadata } = buildSearchDocument(base);
    expect(text).toContain('Ashford Orbit');
    expect(text).toContain('Rubber');
    expect(text).toContain('lume: Super-LumiNova');
    expect(metadata).toMatchObject({ minPrice: 2500000, maxPrice: 2700000, gender: 'MEN', movement: 'AUTOMATIC', caseSizeMm: 42 });
  });
  it('only indexes visible products', () => {
    expect(isIndexable(base)).toBe(true);
    expect(isIndexable({ ...base, status: 'DRAFT' })).toBe(false);
    expect(isIndexable({ ...base, deletedAt: new Date() })).toBe(false);
    expect(isIndexable({ ...base, brand: { ...base.brand, isActive: false } })).toBe(false);
  });
});
