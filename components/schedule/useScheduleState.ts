'use client';

import { useState, useCallback, useMemo, useEffect, useRef } from 'react';
import { format, addDays, subDays } from 'date-fns';
import toast from 'react-hot-toast';
import { calcHours } from '@/lib/domain/rules';
import { useSelectedHotel } from '@/lib/selected-hotel-context';

const AUTO_LOAD_DEBOUNCE_MS = 400;

function errorMessage(err: unknown, fallback: string): string {
  return err instanceof Error && err.message ? err.message : fallback;
}

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ScheduleEmployee {
  rowKey: string;
  code: string;
  firstName: string;
  lastName: string;
  deptName: string;
  multiDept: boolean;
  positionName: string;
}

export interface ScheduleEntry {
  clockIn: string;
  clockOut: string;
  hours: number;
  locked: boolean;
}

export interface ScheduleChange {
  clockIn?: string;
  clockOut?: string;
  hours?: number;
}

export interface ScheduleData {
  dates: string[];
  employees: ScheduleEmployee[];
  schedule: Record<string, Record<string, ScheduleEntry>>;
  allDepts: string[];
  allPositions: string[];
  positionsByDept: Record<string, string[]>;
}

export interface FilterState {
  tenant: string;
  hotel: string;
  hotelInfo: { hotelName: string; branchId: number; usrSystemCompanyId: string } | null;
  department: string;
  position: string;
  startDate: string;
  endDate: string;
}

export interface HotelOption {
  hotelName: string;
  branchId: number | null;
  usrSystemCompanyId: string | null;
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useScheduleState() {
  const { setHotelName } = useSelectedHotel();

  // Filter state — default dates are populated so bulk-action APIs (which
  // require a date range) always receive valid ISO dates instead of empty strings.
  const [filters, setFilters] = useState<FilterState>(() => {
    const today = new Date();
    return {
      tenant: '',
      hotel: '',
      hotelInfo: null,
      department: '',
      position: '',
      startDate: format(subDays(today, 7), 'yyyy-MM-dd'),
      endDate: format(addDays(today, 7), 'yyyy-MM-dd'),
    };
  });

  // Data state
  const [data, setData] = useState<ScheduleData | null>(null);
  const [loading, setLoading] = useState(false);

  // Change tracking — keyed by `${rowKey}|${date}` where rowKey is `${empCode}|${positionName}`.
  const [changes, setChanges] = useState<Record<string, ScheduleChange>>({});

  // Selection — Set of employee codes (selecting a person selects all their position rows).
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set());

  // Dropdown options
  const [tenants, setTenants] = useState<string[]>([]);
  const [hotels, setHotels] = useState<HotelOption[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [positions, setPositions] = useState<string[]>([]);

  // Loading flags for dropdowns so the UI can show "Loading…" instead of an
  // empty list while these requests are in flight.
  const [hotelsLoading, setHotelsLoading] = useState(false);
  const [departmentsLoading, setDepartmentsLoading] = useState(false);
  const [positionsLoading, setPositionsLoading] = useState(false);

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadTenants = useCallback(async () => {
    try {
      const res = await fetch('/api/tenants');
      if (!res.ok) throw new Error('Failed to load tenants');
      const json = await res.json();
      setTenants(json.tenants ?? json);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load tenants'));
    }
  }, []);

  const loadHotels = useCallback(async (tenant: string) => {
    setHotelsLoading(true);
    setHotels([]);
    try {
      const res = await fetch(`/api/hotels/${encodeURIComponent(tenant)}`);
      if (!res.ok) throw new Error('Failed to load hotels');
      const json = await res.json();
      setHotels(json.hotels ?? json);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load hotels'));
    } finally {
      setHotelsLoading(false);
    }
  }, []);

  const loadDepartments = useCallback(async () => {
    if (!filters.hotelInfo) return;
    setDepartmentsLoading(true);
    setDepartments([]);
    try {
      const params = new URLSearchParams({
        hotel: filters.hotel,
        usrSystemCompanyId: filters.hotelInfo.usrSystemCompanyId,
      });
      const res = await fetch(`/api/departments?${params.toString()}`);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Failed to load departments (${res.status}): ${body}`);
      }
      const json = await res.json();
      setDepartments(json.departments ?? json);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load departments'));
    } finally {
      setDepartmentsLoading(false);
    }
  }, [filters.hotel, filters.hotelInfo]);

  const loadPositions = useCallback(async () => {
    if (!filters.hotelInfo) return;
    setPositionsLoading(true);
    setPositions([]);
    try {
      const params = new URLSearchParams({
        hotel: filters.hotel,
        usrSystemCompanyId: filters.hotelInfo.usrSystemCompanyId,
      });
      if (filters.department) params.set('dept', filters.department);
      const res = await fetch(`/api/positions?${params.toString()}`);
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Failed to load positions (${res.status}): ${body}`);
      }
      const json = await res.json();
      setPositions(json.positions ?? json);
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to load positions'));
    } finally {
      setPositionsLoading(false);
    }
  }, [filters.hotel, filters.hotelInfo, filters.department]);

  // AbortController ref guards loadSchedule against stale-response races when
  // filters change mid-flight. Each new call aborts the prior in-flight fetch.
  const scheduleAbortRef = useRef<AbortController | null>(null);

  const loadSchedule = useCallback(async () => {
    scheduleAbortRef.current?.abort();
    const controller = new AbortController();
    scheduleAbortRef.current = controller;

    setLoading(true);
    try {
      const today = new Date();
      const startDate = filters.startDate || format(subDays(today, 7), 'yyyy-MM-dd');
      const endDate = filters.endDate || format(addDays(today, 7), 'yyyy-MM-dd');

      const params = new URLSearchParams();
      if (filters.tenant) params.set('tenant', filters.tenant);
      if (filters.hotel) params.set('hotel', filters.hotel);
      if (filters.hotelInfo) {
        params.set('branchId', String(filters.hotelInfo.branchId));
        params.set('usrSystemCompanyId', filters.hotelInfo.usrSystemCompanyId);
      }
      if (filters.department) params.set('department', filters.department);
      if (filters.position) params.set('position', filters.position);
      params.set('startDate', startDate);
      params.set('endDate', endDate);

      const res = await fetch(`/api/schedule?${params.toString()}`, { signal: controller.signal });
      if (!res.ok) {
        const body = await res.text();
        throw new Error(`Failed to load schedule (${res.status}): ${body}`);
      }
      const json: ScheduleData = await res.json();
      if (controller.signal.aborted) return;
      setData(json);
      setChanges({});
      setSelectedEmployees(new Set());
    } catch (err) {
      if (err instanceof DOMException && err.name === 'AbortError') return;
      toast.error(errorMessage(err, 'Failed to load schedule'));
    } finally {
      if (scheduleAbortRef.current === controller) {
        scheduleAbortRef.current = null;
        setLoading(false);
      }
    }
  }, [filters]);

  // ── Change tracking ────────────────────────────────────────────────────────

  const recordChange = useCallback(
    (rowKey: string, date: string, field: string, value: string | number) => {
      setChanges((prev) => {
        const key = `${rowKey}|${date}`;
        const existing = prev[key] ?? {};
        const updated = { ...existing, [field]: value } as ScheduleChange;

        // Auto-calc hours when both clock times are available
        if (field === 'clockIn' || field === 'clockOut') {
          const clockIn = field === 'clockIn' ? (value as string) : updated.clockIn;
          const clockOut = field === 'clockOut' ? (value as string) : updated.clockOut;

          const origEntry = data?.schedule?.[rowKey]?.[date];
          const effectiveIn = clockIn ?? origEntry?.clockIn;
          const effectiveOut = clockOut ?? origEntry?.clockOut;

          if (effectiveIn && effectiveOut) {
            const hrs = calcHours(effectiveIn, effectiveOut);
            if (hrs !== null) {
              updated.hours = hrs;
            }
          }
        }

        return { ...prev, [key]: updated };
      });
    },
    [data],
  );

  const getEffectiveValue = useCallback(
    (rowKey: string, date: string, field: string): string | number => {
      const key = `${rowKey}|${date}`;
      const change = changes[key];
      const f = field as keyof ScheduleChange;
      if (change && change[f] !== undefined) {
        return change[f] as string | number;
      }
      const entry = data?.schedule?.[rowKey]?.[date];
      if (entry) {
        return entry[field as keyof ScheduleEntry] as string | number;
      }
      return '';
    },
    [changes, data],
  );

  const discardChanges = useCallback(() => {
    setChanges({});
  }, []);

  const saveChanges = useCallback(async () => {
    if (!filters.hotelInfo) return;
    setLoading(true);
    try {
      // Flatten the change map (`${empCode}|${positionName}|${date}` -> ScheduleChange)
      // into the array shape expected by /api/schedule/save.
      const changeList = Object.entries(changes).map(([key, value]) => {
        const [employeeCode = '', positionName = '', date = ''] = key.split('|');
        return {
          employeeCode,
          positionName: positionName || null,
          date,
          clockIn: value.clockIn ?? null,
          clockOut: value.clockOut ?? null,
        };
      });

      const res = await fetch('/api/schedule/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant: filters.tenant,
          hotel: filters.hotel,
          branchId: filters.hotelInfo.branchId,
          usrSystemCompanyId: filters.hotelInfo.usrSystemCompanyId,
          changes: changeList,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error((body as { error?: string }).error ?? 'Failed to save changes');
      }
      // Reload schedule after successful save
      await loadSchedule();
    } catch (err) {
      toast.error(errorMessage(err, 'Failed to save changes'));
    } finally {
      setLoading(false);
    }
  }, [changes, filters, loadSchedule]);

  // ── Selection ──────────────────────────────────────────────────────────────
  // Selection is keyed by employee code (NOT rowKey). Bulk actions
  // (clear/generate/delete) accept `employeeCodes[]` and operate position-agnostically
  // — so a multi-position employee should appear as one logical selection that
  // covers all their rows. Toggling any of their rows flips the whole employee.

  const toggleEmployee = useCallback((rowKey: string) => {
    const code = rowKey.split('|')[0];
    if (!code) return;
    setSelectedEmployees((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
      return next;
    });
  }, []);

  const selectAllEmployees = useCallback(() => {
    if (!data) return;
    setSelectedEmployees(new Set(data.employees.map((e) => e.code)));
  }, [data]);

  const deselectAllEmployees = useCallback(() => {
    setSelectedEmployees(new Set());
  }, []);

  // Public alias retained for callers that previously expected a Set<empCode>.
  const selectedEmployeeCodes = selectedEmployees;

  // ── Auto-load on filter change ────────────────────────────────────────────

  useEffect(() => {
    if (filters.hotelInfo) loadDepartments();
  }, [filters.hotelInfo, loadDepartments]);

  useEffect(() => {
    if (filters.hotelInfo) loadPositions();
  }, [filters.hotelInfo, filters.department, loadPositions]);

  // Debounce auto-load so date keystrokes don't fire a fetch per character.
  useEffect(() => {
    if (!filters.hotelInfo) return;
    const handle = setTimeout(() => {
      void loadSchedule();
    }, AUTO_LOAD_DEBOUNCE_MS);
    return () => clearTimeout(handle);
  }, [
    filters.hotelInfo,
    filters.department,
    filters.position,
    filters.startDate,
    filters.endDate,
    loadSchedule,
  ]);

  // Abort any in-flight schedule fetch on unmount.
  useEffect(() => {
    return () => {
      scheduleAbortRef.current?.abort();
    };
  }, []);

  // Publish current hotel selection to the global header.
  useEffect(() => {
    setHotelName(filters.hotel || null);
  }, [filters.hotel, setHotelName]);

  // ── Computed ───────────────────────────────────────────────────────────────

  const hasChanges = useMemo(() => Object.keys(changes).length > 0, [changes]);

  // ── Return ─────────────────────────────────────────────────────────────────

  return {
    // Filter state
    filters,
    setFilters,

    // Data
    data,
    loading,

    // Changes
    changes,
    hasChanges,
    recordChange,
    getEffectiveValue,
    discardChanges,
    saveChanges,

    // Selection
    selectedEmployees,
    selectedEmployeeCodes,
    toggleEmployee,
    selectAllEmployees,
    deselectAllEmployees,

    // Dropdown options
    tenants,
    hotels,
    departments,
    positions,
    hotelsLoading,
    departmentsLoading,
    positionsLoading,

    // Loaders
    loadTenants,
    loadHotels,
    loadDepartments,
    loadPositions,
    loadSchedule,
  };
}
