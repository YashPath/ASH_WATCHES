// SECURITY-CRITICAL
import helmet from 'helmet';
import cors from 'cors';
import rateLimit, { ipKeyGenerator } from 'express-rate-limit';
import { RedisStore } from 'rate-limit-redis';
import { Redis } from 'ioredis';
import { env, isProduction } from '../config/env.js';
import { AppError } from '../lib/errors.js';
import type { NextFunction, Request, Response } from 'express';

// Never share this connection with BullMQ. Rate limiting fails closed when Redis is unavailable.
export const rateLimitRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: 1, enableOfflineQueue: true });
// BullMQ requires a separate connection with maxRetriesPerRequest=null.
export const queueRedis = new Redis(env.REDIS_URL, { maxRetriesPerRequest: null, enableOfflineQueue: true });
const redisStore = (prefix: string) => new RedisStore({ prefix, sendCommand: (command: string, ...args: string[]) => rateLimitRedis.call(command, ...args) as Promise<any> });
const sharedRateOptions = { standardHeaders: 'draft-7' as const, legacyHeaders: false, passOnStoreError: false, handler: (_req: Request, res: Response) => res.status(429).json({ error: 'Too many requests', code: 'RATE_LIMITED' }) };

export const securityHeaders = helmet({
  contentSecurityPolicy: { directives: { defaultSrc: ["'self'"], scriptSrc: ["'self'"], styleSrc: ["'self'", "'unsafe-inline'"], imgSrc: ["'self'", 'data:', 'https:'], connectSrc: ["'self'", env.FRONTEND_ORIGIN], objectSrc: ["'none'"], frameAncestors: ["'none'"], upgradeInsecureRequests: isProduction ? [] : null } },
  crossOriginEmbedderPolicy: false
});
export const corsPolicy = cors({ origin(origin, callback) { if (!origin || origin === env.FRONTEND_ORIGIN) return callback(null, true); return callback(new AppError(403, 'Origin not allowed', 'CORS_REJECTED')); }, credentials: true, methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'], allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID', 'X-CSRF-Token'] });
export const apiLimiter = rateLimit({ ...sharedRateOptions, windowMs: 60_000, limit: 120, store: redisStore('rl:api:') });
export const registerLimiter = rateLimit({ ...sharedRateOptions, windowMs: 15 * 60_000, limit: 5, store: redisStore('rl:auth:register:') });
export const loginIpLimiter = rateLimit({ ...sharedRateOptions, windowMs: 15 * 60_000, limit: 60, store: redisStore('rl:auth:login-ip:') });
export const loginLimiter = rateLimit({ ...sharedRateOptions, windowMs: 15 * 60_000, limit: 10, store: redisStore('rl:auth:login:'), keyGenerator: req => `${ipKeyGenerator(req.ip ?? '')}:${String((req.body as { email?: unknown } | undefined)?.email ?? '').trim().toLowerCase().slice(0,320)}` });
export const resendVerificationLimiter = rateLimit({ ...sharedRateOptions, windowMs: 15 * 60_000, limit: 5, store: redisStore('rl:auth:resend-verification:') });
export const resendVerificationEmailLimiter = rateLimit({ ...sharedRateOptions, windowMs: 60 * 60_000, limit: 3, store: redisStore('rl:auth:resend-verification-email:'), keyGenerator: req => String((req.body as { email?: unknown } | undefined)?.email ?? '').trim().toLowerCase().slice(0, 320) || 'missing-email' });
export const verifyEmailLimiter = rateLimit({ ...sharedRateOptions, windowMs: 15 * 60_000, limit: 10, store: redisStore('rl:auth:verify-email:') });
export const passwordResetRequestLimiter = rateLimit({ ...sharedRateOptions, windowMs: 15 * 60_000, limit: 5, store: redisStore('rl:auth:password-reset-request:') });
export const passwordResetEmailLimiter = rateLimit({ ...sharedRateOptions, windowMs: 60 * 60_000, limit: 3, store: redisStore('rl:auth:password-reset-email:'), keyGenerator: req => String((req.body as { email?: unknown } | undefined)?.email ?? '').trim().toLowerCase().slice(0, 320) || 'missing-email' });
export const passwordResetConfirmLimiter = rateLimit({ ...sharedRateOptions, windowMs: 15 * 60_000, limit: 8, store: redisStore('rl:auth:password-reset-confirm:') });
export const refreshLimiter = rateLimit({ ...sharedRateOptions, windowMs: 60_000, limit: 30, store: redisStore('rl:auth:refresh:') });
export const mfaChallengeLimiter = rateLimit({ ...sharedRateOptions, windowMs: 5 * 60_000, limit: 8, store: redisStore('rl:auth:mfa-challenge:') });
export const mfaInitialEnrollLimiter = rateLimit({ ...sharedRateOptions, windowMs: 5 * 60_000, limit: 5, store: redisStore('rl:auth:mfa-initial-enroll:') });
export const mfaInitialConfirmLimiter = rateLimit({ ...sharedRateOptions, windowMs: 5 * 60_000, limit: 8, store: redisStore('rl:auth:mfa-initial-confirm:') });
export const mfaEnrollLimiter = rateLimit({ ...sharedRateOptions, windowMs: 5 * 60_000, limit: 5, store: redisStore('rl:auth:mfa-enroll:') });
export const mfaConfirmLimiter = rateLimit({ ...sharedRateOptions, windowMs: 5 * 60_000, limit: 8, store: redisStore('rl:auth:mfa-confirm:') });
export const logoutLimiter = rateLimit({ ...sharedRateOptions, windowMs: 15 * 60_000, limit: 20, store: redisStore('rl:auth:logout:') });
export const orderLimiter = rateLimit({ ...sharedRateOptions, windowMs: 60 * 60_000, limit: 5, store: redisStore('rl:orders:'), keyGenerator: req => req.auth?.userId ?? ipKeyGenerator(req.ip ?? '') });

export function requireCsrfForCookieAuth(req: Request, _res: Response, next: NextFunction) {
  const mutating = ['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method);
  const hasCookie = Boolean(req.headers.cookie?.includes(`${env.COOKIE_NAME}=`));
  if (mutating && hasCookie) {
    const origin = req.headers.origin;
    const token = req.headers['x-csrf-token'];
    if (origin !== env.FRONTEND_ORIGIN || typeof token !== 'string' || token.length < 16) return next(new AppError(403, 'CSRF validation failed', 'CSRF_REJECTED'));
  }
  next();
}

export async function closeRedisClients() {
  await Promise.allSettled([rateLimitRedis.quit(), queueRedis.quit()]);
}
export const searchLimiter = rateLimit({ ...sharedRateOptions, windowMs: 60_000, limit: 30, store: redisStore('rl:search:') });
export const suggestLimiter = rateLimit({ ...sharedRateOptions, windowMs: 60_000, limit: 60, store: redisStore('rl:search:suggest:') });
export const assistantLimiter = rateLimit({ ...sharedRateOptions, windowMs: 10 * 60_000, limit: 20, store: redisStore('rl:assistant:') });
export const adminReindexLimiter = rateLimit({ ...sharedRateOptions, windowMs: 60 * 60_000, limit: 6, store: redisStore('rl:admin:reindex:') });
