import { Queue, Worker } from 'bullmq';
import { env } from '../config/env.js';
import { logger } from '../lib/logger.js';
import { queueRedis } from '../middleware/security.js';
import { indexProduct, reindexAll, removeProduct } from './indexer.js';

const QUEUE_NAME = 'search-index';
type JobData = { productId?: string };
export const searchQueue = new Queue<JobData>(QUEUE_NAME, { connection: queueRedis, defaultJobOptions: { attempts: 6, backoff: { type: 'exponential', delay: 2000 }, removeOnComplete: 500, removeOnFail: 2000 } });

/** Fire-and-forget: a search outage must never fail an admin catalogue edit. Nightly reindex heals any missed job. */
export async function enqueueProductIndex(productId: string): Promise<void> {
  if (env.SEARCH_ENABLED !== 'true') return;
  try { await searchQueue.add('index-product', { productId }, { delay: 1500 }); } catch (error) { logger.warn({ err: error, productId }, 'Could not enqueue product index job'); }
}
export async function enqueueProductRemoval(productId: string): Promise<void> {
  if (env.SEARCH_ENABLED !== 'true') return;
  try { await searchQueue.add('remove-product', { productId }); } catch (error) { logger.warn({ err: error, productId }, 'Could not enqueue product removal job'); }
}
export async function enqueueReindexAll(): Promise<string | undefined> {
  const job = await searchQueue.add('reindex-all', {}, { jobId: `reindex-all:${Math.floor(Date.now() / 60_000)}`, attempts: 2 });
  return job.id;
}
export async function scheduleSearchJobs(): Promise<void> {
  if (env.SEARCH_ENABLED !== 'true') return;
  await searchQueue.upsertJobScheduler('nightly-search-reindex', { pattern: '30 2 * * *' }, { name: 'reindex-all', data: {} });
}

export const searchWorker = env.SEARCH_ENABLED === 'true' ? new Worker<JobData>(QUEUE_NAME, async job => {
  if (job.name === 'index-product' && job.data.productId) return indexProduct(job.data.productId);
  if (job.name === 'remove-product' && job.data.productId) return removeProduct(job.data.productId);
  if (job.name === 'reindex-all') return reindexAll();
  throw new Error(`Unknown search job ${job.name}`);
}, { connection: queueRedis, concurrency: 2 }) : null;
searchWorker?.on('failed', (job, error) => {
  const exhausted = job && job.attemptsMade >= (job.opts.attempts ?? 1);
  logger[exhausted ? 'error' : 'warn']({ jobId: job?.id, name: job?.name, productId: job?.data.productId, err: error.message, exhausted }, 'Search index job failed');
});
export async function closeSearchQueue() { await Promise.allSettled([searchWorker?.close(), searchQueue.close()]); }
