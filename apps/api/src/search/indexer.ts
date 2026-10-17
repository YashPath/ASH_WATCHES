import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { getEmbeddingProvider, sha256 } from './embeddings.js';
import { buildSearchDocument, indexInclude, isIndexable } from './document.js';
import { type VectorMetadata, deleteRecords, getMetadata, listAllIds, upsertRecords } from './vector-store.js';

const docHash = (text: string, metadata: VectorMetadata) => sha256(`${text}|${JSON.stringify(metadata)}`);
export type IndexResult = 'indexed' | 'unchanged' | 'removed';

/** Re-embeds a product only when its document or metadata really changed (content hash). */
export async function indexProduct(productId: string): Promise<IndexResult> {
  const product = await prisma.product.findUnique({ where: { id: productId }, include: indexInclude });
  if (!product || !isIndexable(product)) { await deleteRecords([productId]); return 'removed'; }
  const { text, metadata } = buildSearchDocument(product);
  const hash = docHash(text, metadata);
  const existing = (await getMetadata([productId])).get(productId);
  if (existing?.hash === hash) return 'unchanged';
  const [embedding] = await getEmbeddingProvider().embed([text]);
  if (!embedding) throw new Error('Embedding provider returned no vector');
  await upsertRecords([{ id: productId, embedding, metadata: { ...metadata, hash } }]);
  return 'indexed';
}

export async function removeProduct(productId: string): Promise<void> { await deleteRecords([productId]); }

const BATCH = 32;
/** Full rebuild: index every active product, then delete vectors whose product no longer qualifies. */
export async function reindexAll(): Promise<{ indexed: number; unchanged: number; removed: number; total: number }> {
  const active = await prisma.product.findMany({ where: { status: 'ACTIVE', deletedAt: null, brand: { isActive: true, deletedAt: null } }, select: { id: true } });
  const activeIds = new Set(active.map(p => p.id));
  const stats = { indexed: 0, unchanged: 0, removed: 0, total: active.length };
  const ids = [...activeIds];
  for (let i = 0; i < ids.length; i += BATCH) {
    const slice = ids.slice(i, i + BATCH);
    const products = await prisma.product.findMany({ where: { id: { in: slice } }, include: indexInclude });
    const docs = products.filter(isIndexable).map(p => ({ id: p.id, ...buildSearchDocument(p) }));
    const existing = await getMetadata(docs.map(d => d.id));
    const changed = docs.filter(d => {
      const hash = docHash(d.text, d.metadata);
      d.metadata.hash = hash;
      return existing.get(d.id)?.hash !== hash;
    });
    stats.unchanged += docs.length - changed.length;
    if (changed.length) {
      const vectors = await getEmbeddingProvider().embed(changed.map(d => d.text));
      await upsertRecords(changed.map((d, idx) => ({ id: d.id, embedding: vectors[idx]!, metadata: d.metadata })));
      stats.indexed += changed.length;
    }
  }
  const stale = (await listAllIds()).filter(id => !activeIds.has(id));
  for (let i = 0; i < stale.length; i += 200) await deleteRecords(stale.slice(i, i + 200));
  stats.removed = stale.length;
  logger.info(stats, 'Search reindex finished');
  return stats;
}
