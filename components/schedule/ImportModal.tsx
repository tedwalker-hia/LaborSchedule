'use client';

import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import type { FilterState } from '@/components/schedule/useScheduleState';

interface PreviewData {
  totalRows: number;
  newRecords: number;
  updatedRecords: number;
  skippedRecords: number;
  errors: string[];
}

interface ImportModalProps {
  open: boolean;
  onClose: () => void;
  filters: FilterState;
  onComplete: () => void;
}

export default function ImportModal({ open, onClose, filters, onComplete }: ImportModalProps) {
  const [step, setStep] = useState(1);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [overwriteLocked, setOverwriteLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      setStep(1);
      setFile(null);
      setPreview(null);
      setOverwriteLocked(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [open]);

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const selected = e.target.files?.[0] ?? null;
    setFile(selected);
  };

  const handlePreview = async () => {
    if (!file || !filters.hotelInfo) return;
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('hotel', filters.hotel);
      formData.append('usrSystemCompanyId', filters.hotelInfo.usrSystemCompanyId);
      formData.append('branchId', String(filters.hotelInfo.branchId));
      formData.append('tenant', filters.tenant);

      const res = await fetch('/api/schedule/import/preview', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Preview failed');
      }
      const json: PreviewData = await res.json();
      setPreview(json);
      setStep(2);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file || !filters.hotelInfo) return;
    setStep(4);
    setLoading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      formData.append('hotel', filters.hotel);
      formData.append('usrSystemCompanyId', filters.hotelInfo.usrSystemCompanyId);
      formData.append('branchId', String(filters.hotelInfo.branchId));
      formData.append('tenant', filters.tenant);
      formData.append('overwriteLocked', String(overwriteLocked));

      const res = await fetch('/api/schedule/import', {
        method: 'POST',
        body: formData,
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Import failed');
      }
      const json = await res.json();
      toast.success(json.message ?? 'Import completed successfully.');
      onComplete();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Import failed');
      setStep(3);
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700">Upload Excel File</h3>
            <input
              ref={fileInputRef}
              type="file"
              accept=".xlsx"
              onChange={handleFileChange}
              className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-blue-50 file:text-blue-700 hover:file:bg-blue-100"
            />
            {file && (
              <p className="text-sm text-gray-500">
                Selected: {file.name} ({(file.size / 1024).toFixed(1)} KB)
              </p>
            )}
          </div>
        );
      case 2:
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700">Preview</h3>
            {preview && (
              <div className="space-y-2 text-sm">
                <div className="grid grid-cols-2 gap-2 p-3 bg-gray-50 rounded-lg">
                  <span className="text-gray-600">Total rows:</span>
                  <span className="font-medium">{preview.totalRows}</span>
                  <span className="text-gray-600">New records:</span>
                  <span className="font-medium text-green-700">{preview.newRecords}</span>
                  <span className="text-gray-600">Updated records:</span>
                  <span className="font-medium text-blue-700">{preview.updatedRecords}</span>
                  <span className="text-gray-600">Skipped:</span>
                  <span className="font-medium text-gray-500">{preview.skippedRecords}</span>
                </div>
                {preview.errors.length > 0 && (
                  <div className="p-3 bg-yellow-50 text-yellow-700 rounded-lg">
                    <p className="font-medium mb-1">Warnings:</p>
                    <ul className="list-disc list-inside">
                      {preview.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            )}
          </div>
        );
      case 3:
        return (
          <div className="space-y-4">
            <h3 className="text-sm font-medium text-gray-700">Import Options</h3>
            <label className="flex items-center gap-2 cursor-pointer">
              <input
                type="checkbox"
                checked={overwriteLocked}
                onChange={(e) => setOverwriteLocked(e.target.checked)}
              />
              <span className="text-sm text-gray-700">Overwrite locked records?</span>
            </label>
          </div>
        );
      case 4:
        return (
          <div className="flex flex-col items-center py-8 gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-sm text-gray-600">Importing schedule data...</p>
          </div>
        );
      default:
        return null;
    }
  };

  const renderFooter = () => {
    if (step === 4) return null;
    return (
      <>
        <button
          onClick={onClose}
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
        {step === 1 && (
          <button
            onClick={handlePreview}
            disabled={!file || loading}
            className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {loading ? 'Uploading...' : 'Preview'}
          </button>
        )}
        {step === 2 && (
          <button
            onClick={() => setStep(3)}
            className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium"
          >
            Next
          </button>
        )}
        {step === 3 && (
          <button
            onClick={handleImport}
            className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium"
          >
            Import
          </button>
        )}
      </>
    );
  };

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={`Import Schedule (Step ${step}/4)`}
      size="lg"
      footer={renderFooter()}
    >
      {renderStep()}
    </Modal>
  );
}
