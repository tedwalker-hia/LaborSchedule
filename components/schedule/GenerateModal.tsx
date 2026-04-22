'use client';

import { useState, useEffect, useCallback } from 'react';
import Modal from '@/components/ui/Modal';
import type { FilterState } from '@/components/schedule/useScheduleState';

interface Employee {
  code: string;
  firstName: string;
  lastName: string;
  deptName: string;
  positionName: string;
}

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
  const [step, setStep] = useState(1);
  const [startDate, setStartDate] = useState(filters.startDate);
  const [endDate, setEndDate] = useState(filters.endDate);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set());
  const [overwriteLocked, setOverwriteLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [result, setResult] = useState('');

  // Reset state when modal opens
  useEffect(() => {
    if (open) {
      setStep(1);
      setStartDate(filters.startDate);
      setEndDate(filters.endDate);
      setSelectedCodes(new Set(selectedEmployees ?? []));
      setOverwriteLocked(false);
      setError('');
      setResult('');
    }
  }, [open, filters.startDate, filters.endDate, selectedEmployees]);

  // Fetch employees when entering step 2
  useEffect(() => {
    if (step === 2 && employees.length === 0) {
      fetchEmployees();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [step]);

  const fetchEmployees = useCallback(async () => {
    if (!filters.hotelInfo) return;
    setLoading(true);
    setError('');
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
      // Pre-select from selectedEmployees prop
      if (selectedEmployees && selectedEmployees.size > 0) {
        setSelectedCodes(new Set(selectedEmployees));
      } else {
        setSelectedCodes(new Set(list.map((e) => e.code)));
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch employees');
    } finally {
      setLoading(false);
    }
  }, [filters.hotel, filters.hotelInfo, selectedEmployees]);

  const toggleEmployee = (code: string) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev);
      if (next.has(code)) {
        next.delete(code);
      } else {
        next.add(code);
      }
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

  const handleGenerate = async () => {
    if (!filters.hotelInfo) return;
    setStep(4);
    setLoading(true);
    setError('');
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
      setResult(json.message ?? 'Schedule generated successfully.');
      setStep(5);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
      setStep(5);
    } finally {
      setLoading(false);
    }
  };

  const handleClose = () => {
    if (step === 5 && result) {
      onComplete();
    }
    onClose();
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700">Date Range</h3>
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
        );
      case 2:
        if (loading) {
          return (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          );
        }
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-700">
                Select Employees ({selectedCodes.size}/{employees.length})
              </h3>
              <button onClick={toggleAll} className="text-sm text-blue-600 hover:text-blue-800">
                {selectedCodes.size === employees.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
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
          </div>
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
        return (
          <div className="flex flex-col items-center py-8 gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-sm text-gray-600">Generating schedule...</p>
          </div>
        );
      case 5:
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
    if (step === 4) return null;
    if (step === 5) {
      return (
        <button
          onClick={handleClose}
          className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium"
        >
          Close
        </button>
      );
    }
    return (
      <>
        <button
          onClick={handleClose}
          className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-4 py-2 rounded-lg text-sm font-medium"
        >
          Cancel
        </button>
        {step > 1 && (
          <button
            onClick={() => setStep(step - 1)}
            className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-4 py-2 rounded-lg text-sm font-medium"
          >
            Back
          </button>
        )}
        {step < 3 && (
          <button
            onClick={() => setStep(step + 1)}
            disabled={step === 1 && (!startDate || !endDate)}
            className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            Next
          </button>
        )}
        {step === 3 && (
          <button
            onClick={handleGenerate}
            disabled={selectedCodes.size === 0}
            className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            Generate
          </button>
        )}
      </>
    );
  };

  return (
    <Modal
      isOpen={open}
      onClose={handleClose}
      title={`Generate Schedule (Step ${step}/5)`}
      size="lg"
      footer={renderFooter()}
    >
      {error && step !== 5 && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm mb-4">{error}</div>
      )}
      {renderStep()}
    </Modal>
  );
}
