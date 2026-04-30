'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import Alert from '@/components/ui/Alert';
import { useWizard, Wizard } from '@/components/ui/Wizard';
import ResultStep from '@/components/ui/ResultStep';
import Button from '@/components/ui/Button';
import EmployeeCheckboxList from '@/components/ui/EmployeeCheckboxList';
import type { FilterState } from '@/components/schedule/useScheduleState';
import { useToggleSet } from '@/lib/hooks/useToggleSet';

interface EmployeePreview {
  code: string;
  firstName: string;
  lastName: string;
  deptName: string;
}

interface RefreshPreviewData {
  toAdd: EmployeePreview[];
  toRemove: EmployeePreview[];
}

interface RefreshEmployeesModalProps {
  open: boolean;
  onClose: () => void;
  filters: FilterState;
  onComplete: () => void;
}

export default function RefreshEmployeesModal({
  open,
  onClose,
  filters,
  onComplete,
}: RefreshEmployeesModalProps) {
  const { step, next, goTo, reset } = useWizard(3);
  const [preview, setPreview] = useState<RefreshPreviewData | null>(null);
  const {
    set: selectedToAdd,
    toggle: toggleAdd,
    toggleAll: toggleAllAdd,
    clear: clearToAdd,
    reset: resetToAdd,
  } = useToggleSet<string>();
  const {
    set: selectedToRemove,
    toggle: toggleRemove,
    toggleAll: toggleAllRemove,
    clear: clearToRemove,
    reset: resetToRemove,
  } = useToggleSet<string>();
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      reset();
      setPreview(null);
      clearToAdd();
      clearToRemove();
      setError(null);
      setResult(null);
      fetchPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fetchPreview = async () => {
    if (!filters.hotelInfo) return;
    setLoading(true);
    try {
      const res = await fetch('/api/employees/refresh-preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hotel: filters.hotel,
          usrSystemCompanyId: filters.hotelInfo.usrSystemCompanyId,
          branchId: filters.hotelInfo.branchId,
          tenant: filters.tenant,
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to fetch preview');
      }
      const json: RefreshPreviewData = await res.json();
      setPreview(json);
      resetToAdd(json.toAdd.map((e) => e.code));
      resetToRemove(json.toRemove.map((e) => e.code));
      next();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to fetch preview');
      next();
    } finally {
      setLoading(false);
    }
  };

  const handleExecute = async () => {
    if (!filters.hotelInfo) return;
    goTo(3);
    setLoading(true);
    setError(null);
    setResult(null);
    try {
      const res = await fetch('/api/employees/refresh', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          hotel: filters.hotel,
          usrSystemCompanyId: filters.hotelInfo.usrSystemCompanyId,
          branchId: filters.hotelInfo.branchId,
          tenant: filters.tenant,
          addCodes: [...selectedToAdd],
          removeCodes: [...selectedToRemove],
        }),
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Refresh failed');
      }
      const json = await res.json();
      setResult(json.message ?? 'Employee list refreshed successfully.');
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return <ResultStep loading loadingText="Loading employee changes..." />;
      case 2:
        if (!preview) {
          return <p className="text-sm text-gray-500">No preview data available.</p>;
        }
        return (
          <div className="space-y-4">
            {preview.toAdd.length > 0 && (
              <EmployeeCheckboxList
                employees={preview.toAdd}
                selected={selectedToAdd}
                onToggle={toggleAdd}
                onToggleAll={toggleAllAdd}
                label="New Employees to Add"
                labelClassName="text-sm font-medium text-green-700"
                maxHeight="max-h-40"
              />
            )}

            {preview.toRemove.length > 0 && (
              <EmployeeCheckboxList
                employees={preview.toRemove}
                selected={selectedToRemove}
                onToggle={toggleRemove}
                onToggleAll={toggleAllRemove}
                label="Employees to Remove"
                labelClassName="text-sm font-medium text-red-700"
                maxHeight="max-h-40"
              />
            )}

            {preview.toAdd.length === 0 && preview.toRemove.length === 0 && (
              <Alert variant="success">
                Employee list is already up to date. No changes needed.
              </Alert>
            )}
          </div>
        );
      case 3:
        return (
          <ResultStep
            loading={loading}
            loadingText="Refreshing employee list..."
            error={error}
            result={result}
            onClose={onClose}
          />
        );
      default:
        return null;
    }
  };

  const renderFooter = () => {
    if (step === 1 || step === 3) return null;
    const hasChanges = selectedToAdd.size > 0 || selectedToRemove.size > 0;
    return (
      <>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        <Button variant="primary" onClick={handleExecute} disabled={!hasChanges}>
          Apply Changes
        </Button>
      </>
    );
  };

  return (
    <Wizard
      open={open}
      onClose={onClose}
      title="Refresh Employees"
      size="lg"
      step={step}
      total={3}
      showStepCount={false}
      footer={renderFooter()}
    >
      {renderStep()}
    </Wizard>
  );
}
