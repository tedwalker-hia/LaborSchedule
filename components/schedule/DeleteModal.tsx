'use client';

import toast from 'react-hot-toast';
import Alert from '@/components/ui/Alert';
import ConfirmModal from '@/components/ui/ConfirmModal';
import type { FilterState } from '@/components/schedule/useScheduleState';

interface DeleteModalProps {
  open: boolean;
  onClose: () => void;
  filters: FilterState;
  selectedEmployees?: Set<string>;
  onComplete: () => void;
}

export default function DeleteModal({
  open,
  onClose,
  filters,
  selectedEmployees,
  onComplete,
}: DeleteModalProps) {
  const employeeCodes = selectedEmployees ? [...selectedEmployees] : [];

  const handleDelete = async () => {
    if (!filters.hotelInfo) return;
    const res = await fetch('/api/schedule/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usrSystemCompanyId: filters.hotelInfo.usrSystemCompanyId,
        employeeCodes,
        startDate: filters.startDate,
        endDate: filters.endDate,
      }),
    });
    if (!res.ok) {
      const body = await res.json().catch(() => ({}));
      throw new Error(body.error ?? 'Delete failed');
    }
    const json = await res.json();
    toast.success(json.message ?? 'Records deleted successfully.');
    onComplete();
    onClose();
  };

  const handleConfirm = async () => {
    try {
      await handleDelete();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Delete failed');
    }
  };

  const body = (
    <div className="space-y-4">
      <p className="text-sm text-gray-700">
        Are you sure you want to delete schedule records for the following employees?
      </p>

      <div className="p-3 bg-gray-50 rounded-lg">
        {employeeCodes.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No employees selected.</p>
        ) : (
          <ul className="text-sm text-gray-800 space-y-1">
            {employeeCodes.map((code) => (
              <li key={code} className="font-mono">
                {code}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="text-sm text-gray-600">
        <p>
          <strong>Date range:</strong> {filters.startDate} to {filters.endDate}
        </p>
      </div>

      <Alert variant="warning">This action cannot be undone.</Alert>
    </div>
  );

  return (
    <ConfirmModal
      open={open}
      onClose={onClose}
      title="Delete Schedule Records"
      body={body}
      onConfirm={handleConfirm}
      variant="danger"
      confirmLabel="Delete"
    />
  );
}
