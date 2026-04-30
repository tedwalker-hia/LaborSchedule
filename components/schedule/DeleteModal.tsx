'use client';

import toast from 'react-hot-toast';
import Alert from '@/components/ui/Alert';
import ConfirmModal from '@/components/ui/ConfirmModal';
import type { FilterState } from '@/components/schedule/useScheduleState';

export interface DeleteSelection {
  employeeCode: string;
  positionName: string | null;
}

interface DeleteModalProps {
  open: boolean;
  onClose: () => void;
  filters: FilterState;
  selections: DeleteSelection[];
  onComplete: () => void;
}

export default function DeleteModal({
  open,
  onClose,
  filters,
  selections,
  onComplete,
}: DeleteModalProps) {
  const handleDelete = async () => {
    if (!filters.hotelInfo) return;
    const res = await fetch('/api/schedule/delete', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        usrSystemCompanyId: filters.hotelInfo.usrSystemCompanyId,
        selections,
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
        Are you sure you want to delete schedule records for the following selections?
      </p>

      <div className="p-3 bg-gray-50 rounded-lg">
        {selections.length === 0 ? (
          <p className="text-sm text-gray-500 italic">No rows selected.</p>
        ) : (
          <ul className="text-sm text-gray-800 space-y-1">
            {selections.map((s) => (
              <li key={`${s.employeeCode}|${s.positionName ?? ''}`} className="font-mono">
                {s.employeeCode}
                {s.positionName ? (
                  <span className="text-gray-500"> · {s.positionName}</span>
                ) : null}
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
