import type { RequestHandler } from 'express';
import { prisma } from '../lib/prisma.js';
import { logger } from '../lib/logger.js';
import { enqueueProductIndex, enqueueProductRemoval } from './queue.js';

const UUID = '[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}';
const PRODUCT_PATH = new RegExp(`^/products/(${UUID})(?:/|$)`, 'i');
const VARIANT_PATH = new RegExp(`^/variants/(${UUID})(?:/|$)`, 'i');

/**
 * Mounted on the admin router. After any successful catalogue mutation it schedules a re-index of the
 * affected product, so the admin handlers stay untouched and search can never break an edit.
 */
export const searchSyncHook: RequestHandler = (req, res, next) => {
  if (!['POST', 'PATCH', 'PUT', 'DELETE'].includes(req.method)) return next();
  let createdId: string | undefined;
  if (req.method === 'POST' && req.path === '/products') {
    const original = res.json.bind(res);
    res.json = (body: unknown) => { const id = (body as { data?: { id?: unknown } } | null)?.data?.id; if (typeof id === 'string') createdId = id; return original(body); };
  }
  res.on('finish', () => {
    if (res.statusCode >= 400) return;
    void (async () => {
      try {
        const product = PRODUCT_PATH.exec(req.path)?.[1];
        if (product) { await (req.method === 'DELETE' && req.path.toLowerCase() === `/products/${product.toLowerCase()}` ? enqueueProductRemoval(product) : enqueueProductIndex(product)); return; }
        if (createdId) { await enqueueProductIndex(createdId); return; }
        const variant = VARIANT_PATH.exec(req.path)?.[1];
        if (variant) {
          const row = await prisma.productVariant.findUnique({ where: { id: variant }, select: { productId: true } });
          if (row) await enqueueProductIndex(row.productId);
        }
      } catch (error) { logger.warn({ err: error }, 'Search sync hook failed'); }
    })();
  });
  next();
};
