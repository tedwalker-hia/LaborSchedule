'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import TextField from '@/components/ui/TextField';
import SelectField from '@/components/ui/SelectField';
import DateField from '@/components/ui/DateField';
import type { FilterState } from '@/components/schedule/useScheduleState';
import { TIME_OPTIONS } from '@/lib/schedule-utils';
import { calcHours } from '@/lib/domain/rules';
import { useEmployees } from '@/lib/hooks/useEmployees';

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
  const {
    employees,
    loading: fetchingEmployees,
    error: employeeError,
    refetch,
  } = useEmployees(filters);
  const [selectedEmployee, setSelectedEmployee] = useState('');
  const [department, setDepartment] = useState('');
  const [position, setPosition] = useState('');
  const [date, setDate] = useState('');
  const [clockIn, setClockIn] = useState('');
  const [clockOut, setClockOut] = useState('');
  const [hours, setHours] = useState('');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setSelectedEmployee('');
      setDepartment(filters.department);
      setPosition(filters.position);
      setDate(filters.startDate);
      setClockIn('');
      setClockOut('');
      setHours('');
      refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (employeeError) toast.error(employeeError);
  }, [employeeError]);

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
      toast.success(json.message ?? 'Record added successfully.');
      onComplete();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to add record');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = selectedEmployee && date && clockIn && clockOut && !loading;

  const footer = (
    <>
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
      <Button variant="primary" onClick={handleSubmit} disabled={!canSubmit}>
        {loading ? 'Adding...' : 'Add Record'}
      </Button>
    </>
  );

  return (
    <Modal isOpen={open} onClose={onClose} title="Add Schedule Record" size="md" footer={footer}>
      <div className="space-y-4">
        {fetchingEmployees ? (
          <div>
            <label className="block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1">
              Employee
            </label>
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          </div>
        ) : (
          <SelectField label="Employee" value={selectedEmployee} onChange={handleEmployeeChange}>
            <option value="">Select employee...</option>
            {employees.map((emp) => (
              <option key={emp.code} value={emp.code}>
                {emp.firstName} {emp.lastName} ({emp.code})
              </option>
            ))}
          </SelectField>
        )}

        <div className="grid grid-cols-2 gap-4">
          <TextField label="Department" value={department} onChange={setDepartment} />
          <TextField label="Position" value={position} onChange={setPosition} />
        </div>

        <DateField label="Date" value={date} onChange={setDate} />

        <div className="grid grid-cols-2 gap-4">
          <SelectField label="Clock In" value={clockIn} onChange={setClockIn}>
            <option value="">Select time...</option>
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </SelectField>
          <SelectField label="Clock Out" value={clockOut} onChange={setClockOut}>
            <option value="">Select time...</option>
            {TIME_OPTIONS.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </SelectField>
        </div>

        <TextField
          label="Hours"
          type="number"
          step="0.25"
          value={hours}
          onChange={setHours}
          placeholder="Auto-calculated from clock times"
        />
      </div>
    </Modal>
  );
}
