'use client';

import { useState, useEffect, useRef } from 'react';
import toast from 'react-hot-toast';
import Alert from '@/components/ui/Alert';
import { useWizard, Wizard } from '@/components/ui/Wizard';
import ResultStep from '@/components/ui/ResultStep';
import Button from '@/components/ui/Button';
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
  const { step, next, back, goTo, reset } = useWizard(4);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<PreviewData | null>(null);
  const [overwriteLocked, setOverwriteLocked] = useState(false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (open) {
      reset();
      setFile(null);
      setPreview(null);
      setOverwriteLocked(false);
      setError(null);
      setResult(null);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  }, [open, reset]);

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
      next();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Preview failed');
    } finally {
      setLoading(false);
    }
  };

  const handleImport = async () => {
    if (!file || !filters.hotelInfo) return;
    goTo(4);
    setLoading(true);
    setError(null);
    setResult(null);
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
      setResult(json.message ?? 'Import completed successfully.');
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Import failed');
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
                  <Alert variant="warning">
                    <p className="font-medium mb-1">Warnings:</p>
                    <ul className="list-disc list-inside">
                      {preview.errors.map((err, i) => (
                        <li key={i}>{err}</li>
                      ))}
                    </ul>
                  </Alert>
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
          <ResultStep
            loading={loading}
            loadingText="Importing schedule data..."
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
        {step === 1 && (
          <Button variant="primary" onClick={handlePreview} disabled={!file || loading}>
            {loading ? 'Uploading...' : 'Preview'}
          </Button>
        )}
        {step === 2 && (
          <Button variant="primary" onClick={next}>
            Next
          </Button>
        )}
        {step === 3 && (
          <Button variant="primary" onClick={handleImport}>
            Import
          </Button>
        )}
      </>
    );
  };

  return (
    <Wizard
      open={open}
      onClose={onClose}
      title="Import Schedule"
      size="lg"
      step={step}
      total={4}
      footer={renderFooter()}
    >
      {renderStep()}
    </Wizard>
  );
}
