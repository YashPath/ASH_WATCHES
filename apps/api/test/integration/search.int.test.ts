import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';

// Needs a reachable Chroma server (CHROMA_URL, default http://localhost:8000). Skipped otherwise.
process.env.SEARCH_ENABLED = 'true';
process.env.EMBEDDING_PROVIDER = 'hash';
process.env.CHROMA_COLLECTION = `ash_it_${process.pid}`;
const { API, app, prisma, request, resetDatabase, seedCatalog } = await import('./helpers.js');
const { pingVectorStore, dropCollection, resetVectorStoreState, countRecords } = await import('../../src/search/vector-store.js');
const { reindexAll, indexProduct } = await import('../../src/search/indexer.js');
const { closeSearchQueue } = await import('../../src/search/queue.js');
const chromaUp = await pingVectorStore().catch(() => false);

async function addProduct(name: string, description: string, price: number, gender: 'MEN' | 'WOMEN', movement: 'AUTOMATIC' | 'QUARTZ') {
  const { product } = await seedCatalog({ price });
  return prisma.product.update({ where: { id: product.id }, data: { name, description, gender, movement, shortDescription: name } });
}

describe.skipIf(!chromaUp)('hybrid search (Postgres + Chroma)', () => {
  let dive: { id: string; slug: string }, dress: { id: string; slug: string }, solar: { id: string; slug: string };
  beforeAll(async () => { resetVectorStoreState(); });
  beforeEach(async () => {
    await resetDatabase(); await dropCollection().catch(() => undefined); resetVectorStoreState();
    dive = await addProduct('Abyss Diver', 'Rugged automatic dive watch, 300m water resistance, luminous dial and rotating bezel for swimming.', 3500000, 'MEN', 'AUTOMATIC');
    dress = await addProduct('Lune Slim', 'Elegant slim dress watch with leather strap for weddings and formal office wear.', 2200000, 'WOMEN', 'QUARTZ');
    solar = await addProduct('Solstice Solar', 'Sporty solar powered watch for running and gym workouts.', 1500000, 'MEN', 'QUARTZ');
    await reindexAll();
  });
  afterAll(async () => { await dropCollection().catch(() => undefined); await closeSearchQueue(); });

  it('indexes active products and skips unchanged ones on re-run', async () => {
    expect(await countRecords()).toBe(3);
    const second = await reindexAll();
    expect(second).toMatchObject({ indexed: 0, unchanged: 3, removed: 0 });
  });

  it('finds the dive watch for a dive query (keyword + vector)', async () => {
    const res = await request(app).get(`${API}/search?q=${encodeURIComponent('dive watch for swimming')}`);
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.meta.mode).toBe('hybrid');
    expect(res.body.data[0].slug).toBe(dive.slug);
  });

  it('applies filters on both retrievers', async () => {
    const res = await request(app).get(`${API}/search?q=watch&maxPrice=2000000`);
    expect(res.status).toBe(200);
    const slugs = res.body.data.map((p: { slug: string }) => p.slug);
    expect(slugs).toContain(solar.slug);
    expect(slugs).not.toContain(dive.slug);
    const women = await request(app).get(`${API}/search?q=watch&gender=WOMEN`);
    expect(women.body.data.map((p: { slug: string }) => p.slug)).toEqual([dress.slug]);
  });

  it('drops products that stop being visible, even before the index catches up', async () => {
    await prisma.product.update({ where: { id: dive.id }, data: { status: 'DRAFT' } });
    const stale = await request(app).get(`${API}/search?q=dive`); // Chroma still has it; Postgres re-check must hide it
    expect(stale.body.data.map((p: { slug: string }) => p.slug)).not.toContain(dive.slug);
    expect(await indexProduct(dive.id)).toBe('removed');
    expect(await countRecords()).toBe(2);
  });

  it('the assistant understands budget, gender and movement', async () => {
    const res = await request(app).post(`${API}/search/assistant`).send({ message: 'automatic watch for men under ₹40,000' });
    expect(res.status, JSON.stringify(res.body)).toBe(200);
    expect(res.body.data.filters.join(' ')).toMatch(/40,000/);
    expect(res.body.data.products.map((p: { slug: string }) => p.slug)).toEqual([dive.slug]);
  });

  it('suggest returns prefix matches and rejects short input', async () => {
    const res = await request(app).get(`${API}/search/suggest?q=Abyss`);
    expect(res.body.data[0].slug).toBe(dive.slug);
    expect((await request(app).get(`${API}/search/suggest?q=a`)).status).toBe(400);
  });

  it('similar products never include the product itself', async () => {
    const res = await request(app).get(`${API}/products/${dive.slug}/similar`);
    expect(res.status).toBe(200);
    expect(res.body.data.map((p: { id: string }) => p.id)).not.toContain(dive.id);
  });

  it('treats search input as data, not SQL', async () => {
    const res = await request(app).get(`${API}/search?q=${encodeURIComponent("'); DROP TABLE \"Product\"; --")}`);
    expect(res.status).toBe(200);
    expect(await prisma.product.count()).toBe(3);
  });
});
