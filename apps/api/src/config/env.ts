import { config as loadDotenv } from 'dotenv';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { z } from 'zod';

// Always load the single canonical environment file at the monorepo root.
loadDotenv({ path: resolve(dirname(fileURLToPath(import.meta.url)), '../../../../.env') });

const schema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']),
  API_PORT: z.coerce.number().int().positive().default(4000),
  DATABASE_URL: z.string().min(1),
  DIRECT_URL: z.string().min(1).optional(),
  FRONTEND_ORIGIN: z.string().url().default('http://localhost:3000'),
  API_PUBLIC_URL: z.string().url().default('http://localhost:4000'),
  STRIPE_PAYMENT_METHOD_TYPES: z.string().default('card'),
  JWT_ACCESS_SECRET: z.string().min(1),
  COOKIE_NAME: z.string().default('ash_refresh'),
  COOKIE_SECURE: z.enum(['true', 'false']).default('false'),
  COOKIE_SAME_SITE: z.enum(['strict', 'lax', 'none']).default('strict'),
  HIBP_ENABLED: z.enum(['true', 'false']).default('true'),
  HIBP_TIMEOUT_MS: z.coerce.number().int().positive().default(3000),
  STRIPE_SECRET_KEY: z.string().optional(),
  STRIPE_WEBHOOK_SECRET: z.string().optional(),
  REDIS_URL: z.string().default('redis://localhost:6379'),
  EMAIL_FROM: z.string().default('ASH_ <no-reply@example.com>'),
  EMAIL_PROVIDER: z.enum(['console', 'smtp']).default('console'),
  SMTP_HOST: z.string().optional(),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASSWORD: z.string().optional(),
  LOG_LEVEL: z.string().default('info'),
  PRIVATE_MEDIA_DIR: z.string().default('./private-media'),
  PUBLIC_MEDIA_DIR: z.string().default('./public-media'),
  MEDIA_PUBLIC_BASE_URL: z.preprocess(value => value === '' ? undefined : value, z.string().url().optional()),
  MEDIA_STORAGE_PROVIDER: z.enum(['local', 's3']).default('local'),
  S3_ENDPOINT: z.preprocess(value => value === '' ? undefined : value, z.string().url().optional()),
  S3_REGION: z.string().default('ap-south-1'),
  S3_BUCKET: z.string().optional(),
  S3_ACCESS_KEY_ID: z.string().optional(),
  S3_SECRET_ACCESS_KEY: z.string().optional(),
  S3_FORCE_PATH_STYLE: z.enum(['true', 'false']).default('true'),
  MEDIA_SIGNING_SECRET: z.string().min(1),
  TOTP_ENCRYPTION_KEY: z.string().min(1),
  TOTP_ISSUER: z.string().default('ASH_'),
  // --- Search (Chroma) ---
  SEARCH_ENABLED: z.enum(['true', 'false']).default('true'),
  CHROMA_URL: z.string().url().default('http://localhost:8000'),
  CHROMA_AUTH_TOKEN: z.preprocess(value => value === '' ? undefined : value, z.string().min(16).optional()),
  CHROMA_COLLECTION: z.string().regex(/^[a-zA-Z0-9][a-zA-Z0-9_-]{2,60}$/).default('ash_watches'),
  CHROMA_TIMEOUT_MS: z.coerce.number().int().min(200).max(30000).default(3000),
  EMBEDDING_PROVIDER: z.preprocess(value => value === '' ? undefined : value, z.enum(['openai', 'ollama', 'hash']).optional()),
  OPENAI_API_KEY: z.preprocess(value => value === '' ? undefined : value, z.string().optional()),
  OPENAI_BASE_URL: z.string().url().default('https://api.openai.com/v1'),
  OPENAI_EMBEDDING_MODEL: z.string().default('text-embedding-3-small'),
  OPENAI_EMBEDDING_DIMENSIONS: z.coerce.number().int().min(64).max(3072).default(512),
  OLLAMA_URL: z.string().url().default('http://localhost:11434'),
  OLLAMA_EMBEDDING_MODEL: z.string().default('nomic-embed-text'),
  EMBEDDING_TIMEOUT_MS: z.coerce.number().int().min(500).max(60000).default(15000),
  EMBEDDING_HOURLY_BUDGET: z.coerce.number().int().min(0).max(1_000_000).default(2000),
  SEMANTIC_MAX_DISTANCE: z.coerce.number().min(0.1).max(2).default(0.8)
});

const parsed = schema.parse(process.env);
function hasRequiredDiversity(value: string): boolean {
  return value.length >= 32 && [/[a-z]/.test(value), /[A-Z]/.test(value), /\d/.test(value), /[^A-Za-z0-9]/.test(value)].filter(Boolean).length >= 3;
}
const exampleSecretValues = new Set([
  'Replace_With_A_Random_Secret_9x!4mP7qR2vL8zK1',
  'Different_Random_Media_Key_6b!9Qw2rT5yU8iO3',
  'Separate_TOTP_Encryption_Key_4h!7Jk2mN5pS8xA1',
  'CHANGE_ME'
]);
function isKnownExampleSecret(value: string): boolean {
  return exampleSecretValues.has(value) || ['Replace_With', 'Different_Random', 'Separate_TOTP', 'CHANGE_ME'].some(marker => value.includes(marker));
}
const configuredSecrets = {
  JWT_ACCESS_SECRET: parsed.JWT_ACCESS_SECRET,
  MEDIA_SIGNING_SECRET: parsed.MEDIA_SIGNING_SECRET,
  TOTP_ENCRYPTION_KEY: parsed.TOTP_ENCRYPTION_KEY
};
if (parsed.NODE_ENV !== 'test') {
  for (const [name, value] of Object.entries(configuredSecrets)) {
    if (isKnownExampleSecret(value) || !hasRequiredDiversity(value)) {
      throw new Error(`${name} must be a unique, non-example secret with at least 32 characters and at least three character classes. Generate it with: openssl rand -base64 48`);
    }
  }
  if (parsed.MEDIA_SIGNING_SECRET === parsed.JWT_ACCESS_SECRET) throw new Error('MEDIA_SIGNING_SECRET must be separate from JWT_ACCESS_SECRET. Generate it with: openssl rand -base64 48');
  if (parsed.TOTP_ENCRYPTION_KEY === parsed.JWT_ACCESS_SECRET || parsed.TOTP_ENCRYPTION_KEY === parsed.MEDIA_SIGNING_SECRET) throw new Error('TOTP_ENCRYPTION_KEY must be dedicated and distinct. Generate it with: openssl rand -base64 48');
}
if (parsed.NODE_ENV === 'production' && parsed.COOKIE_SECURE !== 'true') throw new Error('COOKIE_SECURE=true is required in production.');
if (parsed.COOKIE_SAME_SITE === 'none' && parsed.COOKIE_SECURE !== 'true' && parsed.NODE_ENV === 'production') throw new Error('SameSite=None requires Secure cookies in production.');
const allowedStripeMethodsForInr = new Set(['card', 'upi', 'netbanking']);
const configuredStripeMethods = parsed.STRIPE_PAYMENT_METHOD_TYPES.split(',').map(value => value.trim()).filter(Boolean);
if (configuredStripeMethods.length === 0 || new Set(configuredStripeMethods).size !== configuredStripeMethods.length || !configuredStripeMethods.every(value => allowedStripeMethodsForInr.has(value))) {
  throw new Error('STRIPE_PAYMENT_METHOD_TYPES must be a comma-separated subset of Stripe Checkout methods supported for INR: card, upi, netbanking.');
}
if (parsed.MEDIA_STORAGE_PROVIDER === 's3' && (!parsed.S3_BUCKET || !parsed.S3_ACCESS_KEY_ID || !parsed.S3_SECRET_ACCESS_KEY || !parsed.MEDIA_PUBLIC_BASE_URL)) throw new Error('S3_BUCKET, S3_ACCESS_KEY_ID, S3_SECRET_ACCESS_KEY and MEDIA_PUBLIC_BASE_URL are required when MEDIA_STORAGE_PROVIDER=s3.');
if (parsed.NODE_ENV === 'production' && parsed.EMAIL_PROVIDER !== 'smtp') throw new Error('EMAIL_PROVIDER=smtp is required in production.');
if (parsed.NODE_ENV === 'production' && (!parsed.SMTP_HOST || !parsed.SMTP_USER || !parsed.SMTP_PASSWORD)) throw new Error('SMTP_HOST, SMTP_USER and SMTP_PASSWORD are required in production.');
if (parsed.NODE_ENV === 'production' && !parsed.EMBEDDING_PROVIDER) throw new Error('EMBEDDING_PROVIDER must be set explicitly in production (openai, ollama or hash).');
if (parsed.EMBEDDING_PROVIDER === 'openai' && !parsed.OPENAI_API_KEY) throw new Error('OPENAI_API_KEY is required when EMBEDDING_PROVIDER=openai.');
if (parsed.NODE_ENV === 'production' && new URL(parsed.CHROMA_URL).protocol === 'http:' && !['localhost', '127.0.0.1'].includes(new URL(parsed.CHROMA_URL).hostname) && !parsed.CHROMA_AUTH_TOKEN) throw new Error('CHROMA_AUTH_TOKEN is required in production when Chroma is reached over the network.');
export const env = { ...parsed, EMBEDDING_PROVIDER: parsed.EMBEDDING_PROVIDER ?? 'hash' } as Omit<typeof parsed, 'EMBEDDING_PROVIDER'> & { EMBEDDING_PROVIDER: 'openai' | 'ollama' | 'hash' };
export const isProduction = env.NODE_ENV === 'production';
