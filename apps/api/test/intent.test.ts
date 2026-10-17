import { describe, expect, it } from 'vitest';
import { parseIntent } from '../src/search/intent.js';
import { reciprocalRankFusion } from '../src/search/fusion.js';

describe('parseIntent', () => {
  it('parses a max budget in k with gender and occasion', () => {
    const i = parseIntent('elegant watch under 20k for a wedding, for my husband');
    expect(i.maxPrice).toBe(2_000_000);
    expect(i.minPrice).toBeUndefined();
    expect(i.gender).toBe('MEN');
    expect(i.semanticQuery).toContain('dress');
    expect(i.semanticQuery).not.toContain('20k');
  });
  it('parses ranges, lakh units and rupee symbols', () => {
    expect(parseIntent('watch between 10k and 20k')).toMatchObject({ minPrice: 1_000_000, maxPrice: 2_000_000 });
    expect(parseIntent('premium watch under 1.5 lakh')).toMatchObject({ maxPrice: 15_000_000 });
    expect(parseIntent('something below ₹15,000')).toMatchObject({ maxPrice: 1_500_000 });
    expect(parseIntent('at least 50000')).toMatchObject({ minPrice: 5_000_000 });
  });
  it('treats "around" as a +-20% band', () => {
    expect(parseIntent('around 25k')).toMatchObject({ minPrice: 2_000_000, maxPrice: 3_000_000 });
  });
  it('ignores case sizes and water resistance numbers', () => {
    const i = parseIntent('40mm automatic diver with 200m water resistance');
    expect(i.maxPrice).toBeUndefined();
    expect(i.movement).toBe('AUTOMATIC');
  });
  it('leaves gender unset when both are mentioned', () => {
    expect(parseIntent('a gift for him and her').gender).toBeUndefined();
  });
  it('is safe on hostile input', () => {
    const i = parseIntent('9'.repeat(5000) + ' ' + '₹'.repeat(300) + ' <script>alert(1)</script>');
    expect(i.semanticQuery.length).toBeLessThanOrEqual(400);
  });
});

describe('reciprocalRankFusion', () => {
  it('rewards ids present in several lists and de-duplicates', () => {
    const fused = reciprocalRankFusion([{ ids: ['a', 'b', 'c', 'a'] }, { ids: ['c', 'b'] }]);
    // b: 1/62+1/62, c: 1/63+1/61 (c edges ahead), a: only 1/61
    expect(fused.map(f => f.id)).toEqual(['c', 'b', 'a']);
  });
  it('honours weights', () => {
    const fused = reciprocalRankFusion([{ ids: ['a'], weight: 1 }, { ids: ['b'], weight: 3 }]);
    expect(fused[0]?.id).toBe('b');
  });
});
