import { describe, it, expect } from 'vitest';
import {
  buildExportUrl,
  parseFilename,
  type ExportFilters,
} from '@/lib/hooks/useScheduleExport';

const baseFilters: ExportFilters = {
  hotel: 'Hyatt',
  usrSystemCompanyId: 'UCO123',
  startDate: '2026-01-01',
  endDate: '2026-01-07',
};

describe('buildExportUrl', () => {
  it('always includes hotel, usrSystemCompanyId, startDate, endDate', () => {
    const url = buildExportUrl(baseFilters);
    expect(url).toContain('hotel=Hyatt');
    expect(url).toContain('usrSystemCompanyId=UCO123');
    expect(url).toContain('startDate=2026-01-01');
    expect(url).toContain('endDate=2026-01-07');
  });

  it('omits dept and position when empty/undefined', () => {
    const url = buildExportUrl({ ...baseFilters, dept: '', position: '' });
    expect(url).not.toContain('dept=');
    expect(url).not.toContain('position=');
  });

  it('appends dept and position when provided', () => {
    const url = buildExportUrl({
      ...baseFilters,
      dept: 'Front Desk',
      position: 'Agent',
    });
    expect(url).toContain('dept=Front+Desk');
    expect(url).toContain('position=Agent');
  });

  it('targets the schedule export route', () => {
    expect(buildExportUrl(baseFilters)).toMatch(/^\/api\/schedule\/export\?/);
  });
});

describe('parseFilename', () => {
  it('extracts a quoted filename from Content-Disposition', () => {
    const header = 'attachment; filename="Schedule_Hyatt_2026-01-01_2026-01-07.xlsx"';
    expect(parseFilename(header)).toBe('Schedule_Hyatt_2026-01-01_2026-01-07.xlsx');
  });

  it('extracts an unquoted filename', () => {
    expect(parseFilename('attachment; filename=schedule.xlsx')).toBe('schedule.xlsx');
  });

  it('falls back to schedule.xlsx when header is null', () => {
    expect(parseFilename(null)).toBe('schedule.xlsx');
  });

  it('falls back to schedule.xlsx when header is malformed', () => {
    expect(parseFilename('attachment')).toBe('schedule.xlsx');
  });
});
