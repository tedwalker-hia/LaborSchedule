/**
 * Vitest setupFiles — propagate DATABASE_URL from globalSetup into each
 * test worker's process.env so the Prisma singleton picks it up.
 */
import { inject } from 'vitest';

const databaseUrl = inject('DATABASE_URL');
if (databaseUrl) {
  process.env.DATABASE_URL = databaseUrl;
}
