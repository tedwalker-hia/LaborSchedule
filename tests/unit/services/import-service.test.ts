import { describe, it, expect } from 'vitest';
import { ImportService } from '@/lib/services/import-service';

const makeRepo = () => ({
  findFirst: () => Promise.resolve(null),
  create: () => Promise.resolve({ id: 1 }),
  deleteById: () => Promise.resolve(),
  updateLocked: () => Promise.resolve(0),
  clearRange: () => Promise.resolve({ deleted: 0, lockedSkipped: 0 }),
  deleteRange: () => Promise.resolve(0),
  findLocked: () => Promise.resolve([]),
});

describe('ImportService.commit', () => {
  it('throws not-implemented (stub until Phase 9)', async () => {
    const svc = new ImportService(makeRepo() as any);
    await expect(svc.commit([], { usrSystemCompanyId: 'test' })).rejects.toThrow(
      'import-service.commit: not yet implemented — Phase 9',
    );
  });
});
