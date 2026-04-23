'use client';

import { useEffect } from 'react';
import toast from 'react-hot-toast';
import { useWizard, Wizard } from '@/components/ui/Wizard';
import ResultStep from '@/components/ui/ResultStep';
import Button from '@/components/ui/Button';
import DateRangeField from '@/components/ui/DateRangeField';
import EmployeeCheckboxList from '@/components/ui/EmployeeCheckboxList';
import type { FilterState } from '@/components/schedule/useScheduleState';
import { useEmployees } from '@/lib/hooks/useEmployees';
import { useToggleSet } from '@/lib/hooks/useToggleSet';
import { useState } from 'react';

interface GenerateModalProps {
  open: boolean;
  onClose: () => void;
  filters: FilterState;
  selectedEmployees?: Set<string>;
  onComplete: () => void;
}

export default function GenerateModal({
  open,
  onClose,
  filters,
  selectedEmployees,
  onComplete,
}: GenerateModalProps) {
  const {
    employees,
    loading: fetchingEmployees,
    error: employeeError,
    refetch,
  } = useEmployees(filters);
  const { step, next, back, goTo, reset } = useWizard(4);
  const [startDate, setStartDate] = useState(filters.startDate);
  const [endDate, setEndDate] = useState(filters.endDate);
  const {
    set: selectedCodes,
    toggle: toggleEmployee,
    toggleAll,
    reset: resetCodes,
  } = useToggleSet<string>();
  const [overwriteLocked, setOverwriteLocked] = useState(false);

  useEffect(() => {
    if (open) {
      reset();
      setStartDate(filters.startDate);
      setEndDate(filters.endDate);
      resetCodes([...(selectedEmployees ?? [])]);
      setOverwriteLocked(false);
    }
  }, [open, filters.startDate, filters.endDate, selectedEmployees, reset, resetCodes]);

  useEffect(() => {
    if (step === 2 && employees.length === 0) {
      refetch();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  useEffect(() => {
    if (step === 2 && employees.length > 0 && selectedCodes.size === 0) {
      if (selectedEmployees && selectedEmployees.size > 0) {
        resetCodes([...selectedEmployees]);
      } else {
        resetCodes(employees.map((e) => e.code));
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [employees]);

  useEffect(() => {
    if (employeeError) toast.error(employeeError);
  }, [employeeError]);

  const handleGenerate = async () => {
    if (!filters.hotelInfo) return;
    goTo(4);
    try {
      const res = await fetch('/api/schedule/generate', {
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
          overwriteLocked,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Generation failed');
      }
      const json = await res.json();
      toast.success(json.message ?? 'Schedule generated successfully.');
      onComplete();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Generation failed');
      goTo(3);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <DateRangeField
              label="Date Range"
              startValue={startDate}
              endValue={endDate}
              onStartChange={setStartDate}
              onEndChange={setEndDate}
              labelClassName="block text-sm text-gray-600 mb-1"
            />
          </div>
        );
      case 2:
        return (
          <EmployeeCheckboxList
            employees={employees}
            selected={selectedCodes}
            onToggle={toggleEmployee}
            onToggleAll={toggleAll}
            label="Select Employees"
            loading={fetchingEmployees}
          />
        );
      case 3:
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700">Options</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={overwriteLocked}
                onChange={(e) => setOverwriteLocked(e.target.checked)}
              />
              <span className="text-sm text-gray-700">Overwrite locked records?</span>
            </label>
            <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
              <p>
                <strong>Summary:</strong>
              </p>
              <p>
                Date range: {startDate} to {endDate}
              </p>
              <p>Employees: {selectedCodes.size} selected</p>
            </div>
          </div>
        );
      case 4:
        return <ResultStep loading loadingText="Generating schedule..." />;
      default:
        return null;
    }
  };

  const renderFooter = () => {
    if (step === 4) return null;
    return (
      <>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        {step > 1 && (
          <Button variant="secondary" onClick={back}>
            Back
          </Button>
        )}
        {step < 3 && (
          <Button
            variant="primary"
            onClick={next}
            disabled={step === 1 && (!startDate || !endDate)}
          >
            Next
          </Button>
        )}
        {step === 3 && (
          <Button variant="primary" onClick={handleGenerate} disabled={selectedCodes.size === 0}>
            Generate
          </Button>
        )}
      </>
    );
  };

  return (
    <Wizard
      open={open}
      onClose={onClose}
      title="Generate Schedule"
      size="lg"
      step={step}
      total={4}
      footer={renderFooter()}
    >
      {renderStep()}
    </Wizard>
  );
}
