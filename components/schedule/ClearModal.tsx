'use client';

import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import type { FilterState } from '@/components/schedule/useScheduleState';

interface Employee {
  code: string;
  firstName: string;
  lastName: string;
  deptName: string;
  positionName: string;
}

interface ClearModalProps {
  open: boolean;
  onClose: () => void;
  filters: FilterState;
  selectedEmployees?: Set<string>;
  onComplete: () => void;
}

export default function ClearModal({
  open,
  onClose,
  filters,
  selectedEmployees,
  onComplete,
}: ClearModalProps) {
  const [startDate, setStartDate] = useState(filters.startDate);
  const [endDate, setEndDate] = useState(filters.endDate);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [clearLocked, setClearLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [fetchingEmployees, setFetchingEmployees] = useState(false);

  useEffect(() => {
    if (open) {
      setStartDate(filters.startDate);
      setEndDate(filters.endDate);
      setSelectedCodes(new Set(selectedEmployees ?? []));
      setClearLocked(false);
      fetchEmployees();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fetchEmployees = useCallback(async () => {
    if (!filters.hotelInfo) return;
    setFetchingEmployees(true);
    try {
      const params = new URLSearchParams({
        hotel: filters.hotel,
        usrSystemCompanyId: filters.hotelInfo.usrSystemCompanyId,
      });
      const res = await fetch(`/api/employees?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch employees');
      const json = await res.json();
      const list: Employee[] = json.employees ?? json;
      setEmployees(list);
      if (selectedEmployees && selectedEmployees.size > 0) {
        setSelectedCodes(new Set(selectedEmployees));
      }
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to fetch employees');
    } finally {
      setFetchingEmployees(false);
    }
  }, [filters.hotel, filters.hotelInfo, selectedEmployees]);

  const toggleEmployee = (code: string) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedCodes.size === employees.length) {
      setSelectedCodes(new Set());
    } else {
      setSelectedCodes(new Set(employees.map((e) => e.code)));
    }
  };

  const handleClear = async () => {
    if (!filters.hotelInfo) return;
    setLoading(true);
    try {
      const res = await fetch('/api/schedule/clear', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usrSystemCompanyId: filters.hotelInfo.usrSystemCompanyId,
          hotel: filters.hotel,
          branchId: filters.hotelInfo.branchId,
          tenant: filters.tenant,
          employeeCodes: [...selectedCodes],
          startDate,
          endDate,
          clearLocked,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Clear failed');
      }
      const json = await res.json();
      toast.success(json.message ?? 'Schedule cleared successfully.');
      onComplete();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Clear failed');
    } finally {
      setLoading(false);
    }
  };

  const footer = (
    <>
      <button
        onClick={onClose}
        className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-4 py-2 rounded-lg text-sm font-medium"
      >
        Cancel
      </button>
      <button
        onClick={handleClear}
        disabled={loading || selectedCodes.size === 0 || !startDate || !endDate}
        className="bg-red-600 text-white hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
      >
        {loading ? 'Clearing...' : 'Clear Schedule'}
      </button>
    </>
  );

  return (
    <Modal isOpen={open} onClose={onClose} title="Clear Schedule" size="md" footer={footer}>
      <div className="space-y-4">
        <div>
          <h3 className="text-sm font-medium text-gray-700 mb-2">Date Range</h3>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm text-gray-600 mb-1">Start Date</label>
              <input
                type="date"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-600 mb-1">End Date</label>
              <input
                type="date"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>
        </div>

        <div>
          <div className="flex items-center justify-between mb-2">
            <h3 className="text-sm font-medium text-gray-700">
              Employees ({selectedCodes.size}/{employees.length})
            </h3>
            <button onClick={toggleAll} className="text-sm text-blue-600 hover:text-blue-800">
              {selectedCodes.size === employees.length ? 'Deselect All' : 'Select All'}
            </button>
          </div>
          {fetchingEmployees ? (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          ) : (
            <div className="max-h-48 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {employees.map((emp) => (
                <label
                  key={emp.code}
                  className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                >
                  <input
                    type="checkbox"
                    checked={selectedCodes.has(emp.code)}
                    onChange={() => toggleEmployee(emp.code)}
                    className="mr-3"
                  />
                  <span className="text-sm text-gray-800">
                    {emp.firstName} {emp.lastName}
                  </span>
                  <span className="ml-auto text-xs text-gray-500">{emp.deptName}</span>
                </label>
              ))}
            </div>
          )}
        </div>

        <label className="flex items-center gap-2 cursor-pointer">
          <input
            type="checkbox"
            checked={clearLocked}
            onChange={(e) => setClearLocked(e.target.checked)}
          />
          <span className="text-sm text-gray-700">Also clear locked records?</span>
        </label>
      </div>
    </Modal>
  );
}
