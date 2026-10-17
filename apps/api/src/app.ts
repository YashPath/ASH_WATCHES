import 'dotenv/config';
import crypto from 'node:crypto';
import path from 'node:path';
import express from 'express';
import cookieParser from 'cookie-parser';
import { pinoHttp } from 'pino-http';
import { env } from './config/env.js';
import { prisma } from './lib/prisma.js';
import { logger } from './lib/logger.js';
import { securityHeaders, corsPolicy, apiLimiter, requireCsrfForCookieAuth, rateLimitRedis } from './middleware/security.js';
import { errorHandler, notFoundHandler } from './middleware/errors.js';
import authRoutes from './modules/auth/auth.routes.js';
import productsRoutes from './modules/products/products.routes.js';
import cartRoutes from './modules/cart/cart.routes.js';
import ordersRoutes from './modules/orders/orders.routes.js';
import reviewsRoutes from './modules/reviews/reviews.routes.js';
import wishlistRoutes from './modules/wishlist/wishlist.routes.js';
import addressesRoutes from './modules/addresses/addresses.routes.js';
import adminRoutes from './modules/admin/admin.routes.js';
import { stripeWebhookHandler, WebhookSignatureError } from './modules/payments/payments.routes.js';
import paymentsRoutes from './modules/payments/payments.routes.js';
import mediaRoutes from './routes/media.routes.js';
import searchRoutes, { similarRouter } from './search/search.routes.js';
import adminSearchRoutes from './search/admin-search.routes.js';

const app = express();
app.disable('x-powered-by');
app.set('trust proxy', env.NODE_ENV === 'production' ? 1 : false);
app.use((req, res, next) => {
  const incoming = req.header('x-request-id');
  req.id = incoming && /^[a-zA-Z0-9._-]{1,100}$/.test(incoming) ? incoming : crypto.randomUUID();
  res.setHeader('X-Request-ID', req.id);
  next();
});
app.use(pinoHttp({ logger, genReqId: req => req.id ?? crypto.randomUUID(), customLogLevel(_req, res, error) { if (error || res.statusCode >= 500) return 'error'; if (res.statusCode >= 400) return 'warn'; return 'info'; } }));
app.use(securityHeaders);
app.use(corsPolicy);
app.use('/media-public', express.static(path.resolve(env.PUBLIC_MEDIA_DIR), { immutable: true, maxAge: '1y', setHeaders(res) { res.setHeader('X-Content-Type-Options', 'nosniff'); res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin'); } }));

// Stripe signature verification requires the untouched request bytes. This route must stay
// before express.json() and must never be converted to parsed JSON first.
app.post('/api/v1/payments/webhook', express.raw({ type: 'application/json', limit: '1mb' }), async (req, res) => {
  try {
    const result = await stripeWebhookHandler(req.body as Buffer, req.header('stripe-signature'));
    res.json(result);
  } catch (error) {
    logger.warn({ err: error, requestId: req.id }, 'Stripe webhook rejected or failed processing');
    res.status(error instanceof WebhookSignatureError ? 400 : 500).json({ error: error instanceof WebhookSignatureError ? 'Invalid webhook signature' : 'Webhook processing failed; Stripe may retry' });
  }
});

app.use(express.json({ limit: '1mb', strict: true }));
app.use(express.urlencoded({ extended: false, limit: '32kb' }));
app.use(cookieParser());
app.use(requireCsrfForCookieAuth);
app.get('/health', (_req, res) => res.json({ status: 'ok', service: 'ash-api' }));
app.get('/ready', async (_req, res) => {
  try { await prisma.$queryRaw`SELECT 1`; await rateLimitRedis.ping(); res.json({ status: 'ready', database: 'ok', redis: 'ok' }); }
  catch { res.status(503).json({ status: 'not_ready', database: 'or-redis-unavailable' }); }
});
app.get('/openapi.json', (_req, res) => res.json({
  openapi: '3.1.0', info: { title: 'ASH_ Commerce API', version: '1.0.0' }, servers: [{ url: '/api/v1' }],
  paths: {
    '/products': { get: { summary: 'List and filter active products', responses: { '200': { description: 'Paginated product list' } } } },
    '/products/{slug}': { get: { summary: 'Get a product by slug', responses: { '200': { description: 'Product detail' }, '404': { description: 'Not found' } } } },
    '/auth/register': { post: { summary: 'Register a customer', responses: { '201': { description: 'Created' } } } },
    '/auth/login': { post: { summary: 'Authenticate a customer', responses: { '200': { description: 'Access token and customer' } } } },
    '/cart': { get: { summary: 'Read authenticated customer cart', responses: { '200': { description: 'Cart with server-calculated totals' } } } },
    '/orders': { post: { summary: 'Create an order from the authenticated cart', responses: { '201': { description: 'Order created transactionally' } } }, get: { summary: 'List authenticated customer orders', responses: { '200': { description: 'Orders' } } } },
    '/payments/checkout-session': { post: { summary: 'Create a Stripe Checkout session', responses: { '200': { description: 'Checkout URL' } } } },
    '/payments/webhook': { post: { summary: 'Stripe signed webhook endpoint', responses: { '200': { description: 'Event accepted' }, '400': { description: 'Invalid signature' } } } }
  }
}));

const api = express.Router();
api.use('/auth', authRoutes);
api.use('/products', similarRouter);
api.use('/products', productsRoutes);
api.use('/search', searchRoutes);
api.use('/admin/search', adminSearchRoutes);
api.use('/cart', cartRoutes);
api.use('/orders', ordersRoutes);
api.use('/reviews', reviewsRoutes);
api.use('/wishlist', wishlistRoutes);
api.use('/addresses', addressesRoutes);
api.use('/admin', adminRoutes);
api.use('/payments', paymentsRoutes);
api.use('/media', mediaRoutes);
app.use('/api/v1', apiLimiter, api);
app.use(notFoundHandler);
app.use(errorHandler);


export { app };
