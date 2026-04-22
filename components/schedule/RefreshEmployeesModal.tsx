'use client';

import { useState, useEffect } from 'react';
import Modal from '@/components/ui/Modal';
import type { FilterState } from '@/components/schedule/useScheduleState';

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
  const [step, setStep] = useState(1);
  const [preview, setPreview] = useState<RefreshPreviewData | null>(null);
  const [selectedToAdd, setSelectedToAdd] = useState<Set<string>>(new Set());
  const [selectedToRemove, setSelectedToRemove] = useState<Set<string>>(new Set());
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  useEffect(() => {
    if (open) {
      setStep(1);
      setPreview(null);
      setSelectedToAdd(new Set());
      setSelectedToRemove(new Set());
      setError('');
      setResult('');
      fetchPreview();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fetchPreview = async () => {
    if (!filters.hotelInfo) return;
    setLoading(true);
    setError('');
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
      setSelectedToAdd(new Set(json.toAdd.map((e) => e.code)));
      setSelectedToRemove(new Set(json.toRemove.map((e) => e.code)));
      setStep(2);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch preview');
      setStep(2);
    } finally {
      setLoading(false);
    }
  };

  const toggleAdd = (code: string) => {
    setSelectedToAdd((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const toggleRemove = (code: string) => {
    setSelectedToRemove((prev) => {
      const next = new Set(prev);
      if (next.has(code)) next.delete(code);
      else next.add(code);
      return next;
    });
  };

  const handleExecute = async () => {
    if (!filters.hotelInfo) return;
    setStep(3);
    setLoading(true);
    setError('');
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
      setStep(4);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Refresh failed');
      setStep(4);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (step === 4 && result) onComplete();
    onClose();
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="flex flex-col items-center py-8 gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-sm text-gray-600">Loading employee changes...</p>
          </div>
        );
      case 2:
        if (!preview) {
          return error ? null : <p className="text-sm text-gray-500">No preview data available.</p>;
        }
        return (
          <div className="space-y-4">
            {preview.toAdd.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-green-700 mb-2">
                  New Employees to Add ({selectedToAdd.size}/{preview.toAdd.length})
                </h3>
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {preview.toAdd.map((emp) => (
                    <label
                      key={emp.code}
                      className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedToAdd.has(emp.code)}
                        onChange={() => toggleAdd(emp.code)}
                        className="mr-3"
                      />
                      <span className="text-sm text-gray-800">
                        {emp.firstName} {emp.lastName}
                      </span>
                      <span className="ml-auto text-xs text-gray-500">{emp.deptName}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {preview.toRemove.length > 0 && (
              <div>
                <h3 className="text-sm font-medium text-red-700 mb-2">
                  Employees to Remove ({selectedToRemove.size}/{preview.toRemove.length})
                </h3>
                <div className="max-h-40 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
                  {preview.toRemove.map((emp) => (
                    <label
                      key={emp.code}
                      className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
                    >
                      <input
                        type="checkbox"
                        checked={selectedToRemove.has(emp.code)}
                        onChange={() => toggleRemove(emp.code)}
                        className="mr-3"
                      />
                      <span className="text-sm text-gray-800">
                        {emp.firstName} {emp.lastName}
                      </span>
                      <span className="ml-auto text-xs text-gray-500">{emp.deptName}</span>
                    </label>
                  ))}
                </div>
              </div>
            )}

            {preview.toAdd.length === 0 && preview.toRemove.length === 0 && (
              <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">
                Employee list is already up to date. No changes needed.
              </div>
            )}
          </div>
        );
      case 3:
        return (
          <div className="flex flex-col items-center py-8 gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-sm text-gray-600">Refreshing employee list...</p>
          </div>
        );
      case 4:
        return (
          <div className="space-y-4">
            {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
            {result && (
              <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">{result}</div>
            )}
          </div>
        );
      default:
        return null;
    }
  };

  const renderFooter = () => {
    if (step === 1 || step === 3) return null;
    if (step === 4) {
      return (
        <button
          onClick={handleClose}
          className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium"
        >
          Close
        </button>
      );
    }
    // Step 2
    const hasChanges = selectedToAdd.size > 0 || selectedToRemove.size > 0;
    return (
      <>
        <button
          onClick={handleClose}
          className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-4 py-2 rounded-lg text-sm font-medium"
        >
          Cancel
        </button>
        <button
          onClick={handleExecute}
          disabled={!hasChanges}
          className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
        >
          Apply Changes
        </button>
      </>
    );
  };

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title="Refresh Employees"
      size="lg"
      footer={renderFooter()}
    >
      {error && step !== 4 && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm mb-4">{error}</div>
      )}
      {renderStep()}
    </Modal>
  );
}
