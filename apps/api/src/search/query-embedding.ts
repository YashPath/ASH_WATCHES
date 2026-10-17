import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { rateLimitRedis } from '../middleware/security.js';
import { getEmbeddingProvider, sha256 } from './embeddings.js';

export class EmbeddingBudgetExceeded extends Error { constructor() { super('Hourly embedding budget exhausted'); this.name = 'EmbeddingBudgetExceeded'; } }

/**
 * Embeds a search query with a 24h Redis cache and an hourly spend cap for paid providers,
 * so an attacker cannot turn the public search box into an unbounded OpenAI bill.
 */
export async function embedQuery(query: string): Promise<number[]> {
  const provider = getEmbeddingProvider();
  const normalized = query.toLowerCase().trim();
  const key = `emb:${provider.id}:${sha256(normalized)}`;
  try {
    const hit = await rateLimitRedis.get(key);
    if (hit) { const parsed = JSON.parse(hit) as unknown; if (Array.isArray(parsed) && parsed.every(n => typeof n === 'number')) return parsed as number[]; }
  } catch (error) { logger.debug({ err: error }, 'Query embedding cache read failed'); }

  if (provider.kind === 'semantic') {
    const bucket = `emb:budget:${new Date().toISOString().slice(0, 13)}`;
    let used: number;
    try {
      used = await rateLimitRedis.incr(bucket);
      if (used === 1) await rateLimitRedis.expire(bucket, 7200);
    } catch { throw new EmbeddingBudgetExceeded(); } // cannot account for spend => do not spend
    if (used > env.EMBEDDING_HOURLY_BUDGET) throw new EmbeddingBudgetExceeded();
  }

  const [vector] = await provider.embed([normalized]);
  if (!vector) throw new Error('Embedding provider returned no vector');
  try { await rateLimitRedis.set(key, JSON.stringify(vector), 'EX', 86400); } catch (error) { logger.debug({ err: error }, 'Query embedding cache write failed'); }
  return vector;
}
