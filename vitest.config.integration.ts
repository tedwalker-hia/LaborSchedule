import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

/**
 * Separate Vitest config for Testcontainers-backed integration tests.
 * Run with: npm run test:integration
 *
 * Requires Docker daemon to be reachable (CI: set DOCKER_HOST or use a DinD sidecar).
 *
 * fileParallelism: false — one worker process shares the single DB instance,
 * keeping execution serial and avoiding connection pool contention.
 * (Vitest 4 replacement for pool:'forks' + singleFork:true from Vitest 3)
 */
export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.test.ts'],
    globalSetup: ['tests/integration/setup.ts'],
    setupFiles: ['tests/integration/env-setup.ts'],
    testTimeout: 30_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});
