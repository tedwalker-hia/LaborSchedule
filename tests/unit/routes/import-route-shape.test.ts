import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

vi.mock('@/lib/auth/current-user', () => ({ getCurrentUser: vi.fn() }));
vi.mock('@/lib/auth/rbac', () => ({ getUserPermissions: vi.fn() }));
vi.mock('@/lib/excel/parser', () => ({ parseWorkbook: vi.fn() }));
vi.mock('@/lib/services/import-service', () => ({ makeImportService: vi.fn() }));
vi.mock('@/lib/prisma', () => ({
  prisma: { laborSchedule: { findMany: vi.fn().mockResolvedValue([]) } },
}));
vi.mock('@/lib/logger', () => ({ default: { error: vi.fn(), info: vi.fn(), warn: vi.fn() } }));
vi.mock('@/lib/http/map-error', () => ({
  mapErrorResponse: vi
    .fn()
    .mockReturnValue(new Response(JSON.stringify({ error: 'err' }), { status: 500 })),
}));

import { getCurrentUser } from '@/lib/auth/current-user';
import { getUserPermissions } from '@/lib/auth/rbac';
import { parseWorkbook } from '@/lib/excel/parser';
import { makeImportService } from '@/lib/services/import-service';

const mockUser = { userId: 1, email: 'test@test.com', role: 'manager' };
const mockPerms = {
  hasScheduleAccess: () => true,
  hasHotelAccess: vi.fn().mockResolvedValue(true),
  deriveScheduleScope: vi.fn().mockResolvedValue(null),
};

function makeFormData(overrides: Record<string, string> = {}) {
  const fd = new FormData();
  const xlsxBytes = new Uint8Array([0x50, 0x4b, 0x03, 0x04]); // minimal zip header
  fd.append(
    'file',
    new File([xlsxBytes], 'test.xlsx', {
      type: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    }),
  );
  fd.append('hotel', overrides.hotel ?? 'TestHotel');
  fd.append('usrSystemCompanyId', overrides.usrSystemCompanyId ?? 'CO001');
  fd.append('tenant', overrides.tenant ?? 'tenant1');
  fd.append('branchId', overrides.branchId ?? '1');
  if (overrides.overwriteLocked !== undefined) {
    fd.append('overwriteLocked', overrides.overwriteLocked);
  }
  return fd;
}

function makeRequest(url: string, fd: FormData) {
  return new NextRequest(url, { method: 'POST', body: fd });
}

const sampleRecords = [
  {
    employeeCode: 'E001',
    date: '2025-06-01',
    clockIn: '08:00',
    clockOut: '16:00',
    positionName: '',
    firstName: '',
    lastName: '',
    deptName: '',
  },
];

describe('import route response shapes', () => {
  beforeEach(() => {
    vi.mocked(getCurrentUser).mockReturnValue(mockUser as any);
    vi.mocked(getUserPermissions).mockResolvedValue(mockPerms as any);
    vi.mocked(parseWorkbook).mockResolvedValue({ records: sampleRecords } as any);
  });

  describe('POST /api/schedule/import/preview', () => {
    it('response matches PreviewData interface', async () => {
      const { POST } = await import('@/app/api/schedule/import/preview/route');

      const req = makeRequest('http://localhost/api/schedule/import/preview', makeFormData());
      const res = await POST(req);
      const json = await res.json();

      // Matches: interface PreviewData { totalRows, newRecords, updatedRecords, skippedRecords, errors }
      expect(typeof json.totalRows).toBe('number');
      expect(typeof json.newRecords).toBe('number');
      expect(typeof json.updatedRecords).toBe('number');
      expect(typeof json.skippedRecords).toBe('number');
      expect(Array.isArray(json.errors)).toBe(true);
      expect(res.status).toBe(200);
    });

    it('totalRows equals parsed record count', async () => {
      const { POST } = await import('@/app/api/schedule/import/preview/route');

      const req = makeRequest('http://localhost/api/schedule/import/preview', makeFormData());
      const res = await POST(req);
      const json = await res.json();

      expect(json.totalRows).toBe(sampleRecords.length);
    });
  });

  describe('POST /api/schedule/import', () => {
    it('response includes message field consumed by ImportModal', async () => {
      vi.mocked(makeImportService).mockReturnValue({
        commit: vi.fn().mockResolvedValue({ inserted: 2, updated: 1, skipped: 0, skippedRows: [] }),
      } as any);

      const { POST } = await import('@/app/api/schedule/import/route');

      const fd = makeFormData({ overwriteLocked: 'false' });
      const req = makeRequest('http://localhost/api/schedule/import', fd);
      const res = await POST(req);
      const json = await res.json();

      // ImportModal.tsx: toast.success(json.message ?? 'Import completed successfully.')
      expect(typeof json.message).toBe('string');
      expect(json.message.length).toBeGreaterThan(0);
      expect(res.status).toBe(200);
    });

    it('response includes commit counts', async () => {
      vi.mocked(makeImportService).mockReturnValue({
        commit: vi.fn().mockResolvedValue({
          inserted: 3,
          updated: 0,
          skipped: 1,
          skippedRows: [{ employeeCode: 'E002', date: '2025-06-01' }],
        }),
      } as any);

      const { POST } = await import('@/app/api/schedule/import/route');

      const fd = makeFormData({ overwriteLocked: 'false' });
      const req = makeRequest('http://localhost/api/schedule/import', fd);
      const res = await POST(req);
      const json = await res.json();

      expect(json.inserted).toBe(3);
      expect(json.updated).toBe(0);
      expect(json.skipped).toBe(1);
      expect(Array.isArray(json.skippedRows)).toBe(true);
    });
  });
});
