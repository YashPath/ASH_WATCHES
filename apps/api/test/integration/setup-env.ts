// Runs before any module imports src/config/env.ts. Real values from the environment / .env always win.
const defaults: Record<string, string> = {
  NODE_ENV: 'test',
  JWT_ACCESS_SECRET: 'test-jwt-secret-for-integration-tests-only-1234',
  MEDIA_SIGNING_SECRET: 'test-media-secret-for-integration-tests-only-5678',
  TOTP_ENCRYPTION_KEY: 'test-totp-key-for-integration-tests-only-9012',
  HIBP_ENABLED: 'false',
  EMAIL_PROVIDER: 'console',
  LOG_LEVEL: 'silent',
  STRIPE_SECRET_KEY: 'sk_test_integration_dummy_key',
  STRIPE_WEBHOOK_SECRET: 'whsec_integration_test_secret',
  SEARCH_ENABLED: 'false'
};
for (const [k, v] of Object.entries(defaults)) if (!process.env[k]) process.env[k] = v;
process.env.NODE_ENV = 'test';
process.env.LOG_LEVEL = 'silent';
if (!process.env.DATABASE_URL) throw new Error('DATABASE_URL is required for integration tests');
