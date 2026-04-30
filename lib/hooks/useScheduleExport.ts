'use client';

import { useCallback, useState } from 'react';
import toast from 'react-hot-toast';

export interface ExportFilters {
  hotel: string;
  usrSystemCompanyId: string;
  tenant?: string;
  startDate: string;
  endDate: string;
  dept?: string;
  position?: string;
}

const FALLBACK_FILENAME = 'schedule.xlsx';

export function parseFilename(header: string | null): string {
  if (!header) return FALLBACK_FILENAME;
  const match = header.match(/filename\s*=\s*"?([^";]+)"?/i);
  return match?.[1]?.trim() || FALLBACK_FILENAME;
}

export function buildExportUrl(filters: ExportFilters): string {
  const params = new URLSearchParams({
    hotel: filters.hotel,
    usrSystemCompanyId: filters.usrSystemCompanyId,
    startDate: filters.startDate,
    endDate: filters.endDate,
  });
  if (filters.tenant) params.append('tenant', filters.tenant);
  if (filters.dept) params.append('dept', filters.dept);
  if (filters.position) params.append('position', filters.position);
  return `/api/schedule/export?${params.toString()}`;
}

function triggerDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

export function useScheduleExport(): {
  exportSchedule: (filters: ExportFilters) => Promise<void>;
  loading: boolean;
} {
  const [loading, setLoading] = useState(false);

  const exportSchedule = useCallback(async (filters: ExportFilters): Promise<void> => {
    if (!filters.hotel || !filters.usrSystemCompanyId) {
      toast.error('Select a hotel before exporting');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch(buildExportUrl(filters));

      if (!res.ok) {
        if (res.status === 401) {
          toast.error('Sign in to export');
        } else if (res.status === 403) {
          toast.error("You do not have access to export this hotel's schedule");
        } else if (res.status >= 500) {
          toast.error('Export failed. Try again.');
        } else {
          const json = (await res.json().catch(() => ({}))) as { error?: string };
          toast.error(json.error ?? 'Export failed. Try again.');
        }
        return;
      }

      const filename = parseFilename(res.headers.get('Content-Disposition'));
      const blob = await res.blob();
      triggerDownload(blob, filename);
      toast.success('Export downloaded');
    } catch {
      toast.error('Export failed. Try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  return { exportSchedule, loading };
}
