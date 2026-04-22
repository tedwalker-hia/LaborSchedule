import { defineConfig } from 'vitest/config';
import tsconfigPaths from 'vite-tsconfig-paths';

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: 'node',
    include: ['tests/unit/**/*.test.ts'],
    env: {
      JWT_SECRET: 'test-jwt-secret-at-least-32-characters-long-for-zod',
      DATABASE_URL: 'sqlserver://test:1433;database=test;user=sa;password=x',
      NODE_ENV: 'test',
    },
    coverage: {
      provider: 'v8',
      include: ['lib/domain/**'],
      thresholds: {
        lines: 95,
        functions: 95,
        branches: 95,
        statements: 95,
      },
    },
  },
});
