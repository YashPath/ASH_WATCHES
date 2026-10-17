import { defineConfig } from 'vitest/config';
// Integration tests need real Postgres (schema applied) and Redis. They run serially because they share one database.
export default defineConfig({
  test: { include: ['test/integration/**/*.int.test.ts'], setupFiles: ['test/integration/setup-env.ts'], fileParallelism: false, testTimeout: 30_000, hookTimeout: 30_000, pool: 'forks' }
});
