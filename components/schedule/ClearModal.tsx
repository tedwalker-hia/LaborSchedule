'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import Button from '@/components/ui/Button';
import DateRangeField from '@/components/ui/DateRangeField';
import EmployeeCheckboxList from '@/components/ui/EmployeeCheckboxList';
import type { FilterState } from '@/components/schedule/useScheduleState';
import { useEmployees } from '@/lib/hooks/useEmployees';
import { useToggleSet } from '@/lib/hooks/useToggleSet';

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
  const {
    employees,
    loading: fetchingEmployees,
    error: employeeError,
    refetch,
  } = useEmployees(filters);
  const [startDate, setStartDate] = useState(filters.startDate);
  const [endDate, setEndDate] = useState(filters.endDate);
  const {
    set: selectedCodes,
    toggle: toggleEmployee,
    toggleAll,
    reset: resetCodes,
  } = useToggleSet<string>();
  const [clearLocked, setClearLocked] = useState(false);
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    if (open) {
      setStartDate(filters.startDate);
      setEndDate(filters.endDate);
      resetCodes([...(selectedEmployees ?? [])]);
      setClearLocked(false);
      refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  useEffect(() => {
    if (employeeError) toast.error(employeeError);
  }, [employeeError]);

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
      <Button variant="secondary" onClick={onClose}>
        Cancel
      </Button>
      <Button
        variant="danger"
        onClick={handleClear}
        disabled={loading || selectedCodes.size === 0 || !startDate || !endDate}
      >
        {loading ? 'Clearing...' : 'Clear Schedule'}
      </Button>
    </>
  );

  return (
    <Modal isOpen={open} onClose={onClose} title="Clear Schedule" size="md" footer={footer}>
      <div className="space-y-4">
        <DateRangeField
          label="Date Range"
          startValue={startDate}
          endValue={endDate}
          onStartChange={setStartDate}
          onEndChange={setEndDate}
          labelClassName="block text-sm text-gray-600 mb-1"
        />

        <EmployeeCheckboxList
          employees={employees}
          selected={selectedCodes}
          onToggle={toggleEmployee}
          onToggleAll={toggleAll}
          loading={fetchingEmployees}
          maxHeight="max-h-48"
        />

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
