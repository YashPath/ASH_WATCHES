import { ChromaClient, type Collection, type Where } from 'chromadb';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { getEmbeddingProvider } from './embeddings.js';

export class VectorStoreUnavailable extends Error {
  constructor(message: string, readonly retryable = true) { super(message); this.name = 'VectorStoreUnavailable'; }
}
export type VectorMetadata = Record<string, string | number | boolean>;
export type VectorRecord = { id: string; embedding: number[]; metadata: VectorMetadata };
export type VectorHit = { id: string; distance: number; metadata: VectorMetadata };

const BREAKER_THRESHOLD = 3;
const BREAKER_OPEN_MS = 30_000;
const breaker = { failures: 0, openUntil: 0 };
let client: ChromaClient | undefined;
let collectionPromise: Promise<Collection> | undefined;

export function collectionName(): string { return `${env.CHROMA_COLLECTION}__${getEmbeddingProvider().id}`; }
export function vectorStoreHealth() { return { circuitOpen: Date.now() < breaker.openUntil, consecutiveFailures: breaker.failures, collection: collectionName() }; }
export function resetVectorStoreState() { breaker.failures = 0; breaker.openUntil = 0; client = undefined; collectionPromise = undefined; }

function getClient(): ChromaClient {
  if (client) return client;
  const url = new URL(env.CHROMA_URL);
  const ssl = url.protocol === 'https:';
  client = new ChromaClient({ host: url.hostname, port: url.port ? Number(url.port) : ssl ? 443 : 80, ssl, ...(env.CHROMA_AUTH_TOKEN ? { headers: { Authorization: `Bearer ${env.CHROMA_AUTH_TOKEN}` } } : {}) });
  return client;
}

function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T> {
  let timer: NodeJS.Timeout | undefined;
  const timeout = new Promise<never>((_, reject) => { timer = setTimeout(() => reject(new Error(`Chroma request timed out after ${ms} ms`)), ms); });
  return Promise.race([promise, timeout]).finally(() => { if (timer) clearTimeout(timer); });
}

/** Every Chroma call goes through here: circuit breaker + timeout + uniform error type. */
async function guarded<T>(fn: () => Promise<T>, timeoutMs = env.CHROMA_TIMEOUT_MS): Promise<T> {
  if (Date.now() < breaker.openUntil) throw new VectorStoreUnavailable('Vector store circuit is open');
  try {
    const result = await withTimeout(fn(), timeoutMs);
    breaker.failures = 0;
    return result;
  } catch (error) {
    collectionPromise = undefined; // re-resolve (and re-create if needed) on the next call
    breaker.failures += 1;
    if (breaker.failures >= BREAKER_THRESHOLD) { breaker.openUntil = Date.now() + BREAKER_OPEN_MS; logger.error({ failures: breaker.failures }, 'Vector store circuit opened'); }
    throw new VectorStoreUnavailable(error instanceof Error ? error.message : 'Vector store request failed');
  }
}

async function getCollection(): Promise<Collection> {
  collectionPromise ??= getClient().getOrCreateCollection({ name: collectionName(), embeddingFunction: null, configuration: { hnsw: { space: 'cosine' } } });
  return collectionPromise;
}

const WRITE_TIMEOUT_MS = () => env.CHROMA_TIMEOUT_MS * 5;

export async function pingVectorStore(): Promise<boolean> {
  try { await guarded(() => getClient().heartbeat()); return true; } catch { return false; }
}
export async function countRecords(): Promise<number> { return guarded(async () => (await getCollection()).count()); }

export async function upsertRecords(records: VectorRecord[]): Promise<void> {
  if (records.length === 0) return;
  await guarded(async () => (await getCollection()).upsert({ ids: records.map(r => r.id), embeddings: records.map(r => r.embedding), metadatas: records.map(r => r.metadata) }), WRITE_TIMEOUT_MS());
}
export async function updateMetadata(id: string, metadata: VectorMetadata): Promise<void> {
  await guarded(async () => (await getCollection()).update({ ids: [id], metadatas: [metadata] }), WRITE_TIMEOUT_MS());
}
export async function deleteRecords(ids: string[]): Promise<void> {
  if (ids.length === 0) return;
  await guarded(async () => { await (await getCollection()).delete({ ids }); }, WRITE_TIMEOUT_MS());
}
export async function getMetadata(ids: string[]): Promise<Map<string, VectorMetadata>> {
  const out = new Map<string, VectorMetadata>();
  if (ids.length === 0) return out;
  const result = await guarded(async () => (await getCollection()).get({ ids, include: ['metadatas'] }));
  result.ids.forEach((id, index) => { const metadata = result.metadatas[index]; if (metadata) out.set(id, metadata as VectorMetadata); });
  return out;
}
export async function getEmbedding(id: string): Promise<number[] | null> {
  const result = await guarded(async () => (await getCollection()).get({ ids: [id], include: ['embeddings'] }));
  const vector = result.embeddings?.[0];
  return vector ? Array.from(vector) : null;
}
export async function queryNearest(embedding: number[], nResults: number, where?: Where): Promise<VectorHit[]> {
  const result = await guarded(async () => (await getCollection()).query({ queryEmbeddings: [embedding], nResults, ...(where ? { where } : {}), include: ['distances', 'metadatas'] }));
  const ids = result.ids[0] ?? [];
  const distances = result.distances?.[0] ?? [];
  const metadatas = result.metadatas?.[0] ?? [];
  return ids.map((id, index) => ({ id, distance: distances[index] ?? 2, metadata: (metadatas[index] ?? {}) as VectorMetadata }));
}
export async function listAllIds(pageSize = 500): Promise<string[]> {
  const ids: string[] = [];
  for (let offset = 0; ; offset += pageSize) {
    const page = await guarded(async () => (await getCollection()).get({ limit: pageSize, offset, include: [] }), WRITE_TIMEOUT_MS());
    ids.push(...page.ids);
    if (page.ids.length < pageSize) break;
  }
  return ids;
}
export async function dropCollection(): Promise<void> {
  await guarded(async () => { await getClient().deleteCollection({ name: collectionName() }); collectionPromise = undefined; });
}
