'use client';

import { useState, useEffect, useCallback } from 'react';
import Modal from '@/components/ui/Modal';
import type { FilterState } from '@/components/schedule/useScheduleState';
import { TIME_OPTIONS, calcHours } from '@/lib/schedule-utils';

interface Employee {
  code: string;
  firstName: string;
  lastName: string;
  deptName: string;
  positionName: string;
}

interface AddRecordModalProps {
  open: boolean;
  onClose: () => void;
  filters: FilterState;
  onComplete: () => void;
}

export default function AddRecordModal({
  open,
  onClose,
  filters,
  onComplete,
}: AddRecordModalProps) {
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [department, setDepartment] = useState('');
  const [position, setPosition] = useState('');
  const [date, setDate] = useState('');
  const [clockIn, setClockIn] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [hours, setHours] = useState('');
  const [loading, setLoading] = useState(false);
  const [fetchingEmployees, setFetchingEmployees] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  useEffect(() => {
    if (open) {
      setSelectedEmployee('');
      setDepartment(filters.department);
      setPosition(filters.position);
      setDate(filters.startDate);
      setClockIn('');
      setClockOut('');
      setHours('');
      setError('');
      setResult('');
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
      setEmployees(json.employees ?? json);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch employees');
    } finally {
      setFetchingEmployees(false);
    }
  }, [filters.hotel, filters.hotelInfo]);

  const handleEmployeeChange = (code: string) => {
    setSelectedEmployee(code);
    const emp = employees.find((e) => e.code === code);
    if (emp) {
      setDepartment(emp.deptName);
      setPosition(emp.positionName);
    }
  };

  // Auto-calculate hours when clock times change
  useEffect(() => {
    if (clockIn && clockOut) {
      const computed = calcHours(clockIn, clockOut);
      if (computed !== null) {
        setHours(String(computed));
      }
    }
  }, [clockIn, clockOut]);

  const handleSubmit = async () => {
    if (!filters.hotelInfo) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/schedule/add', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usrSystemCompanyId: filters.hotelInfo.usrSystemCompanyId,
          hotel: filters.hotel,
          branchId: filters.hotelInfo.branchId,
          tenant: filters.tenant,
          employeeCode: selectedEmployee,
          department,
          position,
          date,
          clockIn,
          clockOut,
          hours: hours ? parseFloat(hours) : undefined,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to add record');
      }
      const json = await res.json();
      setResult(json.message ?? 'Record added successfully.');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to add record');
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (result) onComplete();
    onClose();
  };

  const canSubmit = selectedEmployee && date && clockIn && clockOut && !loading;

  const footer = result ? (
    <button
      onClick={handleClose}
      className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium"
    >
      Close
    </button>
  ) : (
    <>
      <button
        onClick={handleClose}
        className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-4 py-2 rounded-lg text-sm font-medium"
      >
        Cancel
      </button>
      <button
        onClick={handleSubmit}
        disabled={!canSubmit}
        className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
      >
        {loading ? 'Adding...' : 'Add Record'}
      </button>
    </>
  );

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title="Add Schedule Record"
      size="md"
      footer={footer}
    >
      {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm mb-4">{error}</div>}
      {result ? (
        <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">{result}</div>
      ) : (
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Employee</label>
            {fetchingEmployees ? (
              <div className="flex justify-center py-8">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            ) : (
              <select
                value={selectedEmployee}
                onChange={(e) => handleEmployeeChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select employee...</option>
                {employees.map((emp) => (
                  <option key={emp.code} value={emp.code}>
                    {emp.firstName} {emp.lastName} ({emp.code})
                  </option>
                ))}
              </select>
            )}
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Department</label>
              <input
                type="text"
                value={department}
                onChange={(e) => setDepartment(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Position</label>
              <input
                type="text"
                value={position}
                onChange={(e) => setPosition(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              />
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
            />
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Clock In</label>
              <select
                value={clockIn}
                onChange={(e) => setClockIn(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select time...</option>
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Clock Out</label>
              <select
                value={clockOut}
                onChange={(e) => setClockOut(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select time...</option>
                {TIME_OPTIONS.map((t) => (
                  <option key={t} value={t}>
                    {t}
                  </option>
                ))}
              </select>
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Hours</label>
            <input
              type="number"
              step="0.25"
              value={hours}
              onChange={(e) => setHours(e.target.value)}
              className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              placeholder="Auto-calculated from clock times"
            />
          </div>
        </div>
      )}
    </Modal>
  );
}
