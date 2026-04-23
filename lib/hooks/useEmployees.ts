'use client';

import { useState, useEffect, useCallback } from 'react';

export interface Employee {
  code: string;
  firstName: string;
  lastName: string;
  deptName: string;
  positionName: string;
}

interface EmployeeFilters {
  hotel: string;
  hotelInfo: { usrSystemCompanyId: string } | null;
}

export function useEmployees(filters: EmployeeFilters) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const refetch = useCallback(async () => {
    if (!filters.hotelInfo) return;
    setLoading(true);
    setError(null);
    try {
      const params = new URLSearchParams({
        hotel: filters.hotel,
        usrSystemCompanyId: filters.hotelInfo.usrSystemCompanyId,
      });
      const res = await fetch(`/api/employees?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch employees');
      const json = await res.json();
      setEmployees(json.employees ?? json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch employees');
    } finally {
      setLoading(false);
    }
  }, [filters.hotel, filters.hotelInfo]);

  useEffect(() => {
    refetch();
  }, [refetch]);

  return { employees, loading, error, refetch };
}
