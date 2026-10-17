import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts'],
    exclude: ['test/integration/**', 'node_modules/**'],
    testTimeout: 30_000,
    env: {
      NODE_ENV: 'test',
      DATABASE_URL: 'postgresql://ash:ash@localhost:5432/ash_test?schema=public',
      DIRECT_URL: 'postgresql://ash:ash@localhost:5432/ash_test?schema=public',
      JWT_ACCESS_SECRET: 'test-only-access-secret-0123456789abcdef',
      MEDIA_SIGNING_SECRET: 'test-only-media-secret-0123456789abcdef',
      TOTP_ENCRYPTION_KEY: 'test-only-totp-key-0123456789abcdefgh',
      EMBEDDING_PROVIDER: 'hash',
      HIBP_ENABLED: 'false'
    }
  }
});
