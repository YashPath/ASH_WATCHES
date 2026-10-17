import { Router } from 'express';
import { UserRole } from '@prisma/client';
import { authenticate, requireRole } from '../middleware/auth.js';
import { adminReindexLimiter } from '../middleware/security.js';
import { prisma } from '../lib/prisma.js';
import { env } from '../config/env.js';
import { getEmbeddingProvider } from './embeddings.js';
import { countRecords, pingVectorStore, vectorStoreHealth } from './vector-store.js';
import { enqueueReindexAll, searchQueue } from './queue.js';

const router = Router();
router.use(authenticate, requireRole(UserRole.ADMIN, UserRole.SUPER_ADMIN));

router.get('/status', async (_req, res, next) => {
  try {
    const provider = getEmbeddingProvider();
    const [reachable, activeProducts, counts] = await Promise.all([
      pingVectorStore().catch(() => false),
      prisma.product.count({ where: { status: 'ACTIVE', deletedAt: null, brand: { isActive: true, deletedAt: null } } }),
      searchQueue.getJobCounts('waiting', 'active', 'delayed', 'failed').catch(() => null)
    ]);
    const indexed = reachable ? await countRecords().catch(() => null) : null;
    res.json({ data: { enabled: env.SEARCH_ENABLED === 'true', provider: { id: provider.id, kind: provider.kind }, chroma: { reachable, ...vectorStoreHealth() }, activeProducts, indexed, inSync: indexed === activeProducts, queue: counts } });
  } catch (e) { next(e); }
});

router.post('/reindex', adminReindexLimiter, async (req, res, next) => {
  try {
    const jobId = await enqueueReindexAll();
    await prisma.auditLog.create({ data: { actorUserId: req.auth!.userId, action: 'SEARCH_REINDEX_REQUESTED', resourceType: 'Search', resourceId: jobId ?? 'n/a', severity: 'INFO', metadata: {} } });
    res.status(202).json({ data: { jobId } });
  } catch (e) { next(e); }
});
export default router;
