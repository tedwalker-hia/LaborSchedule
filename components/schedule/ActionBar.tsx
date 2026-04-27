'use client';

import { Lock, Unlock, Trash2, Download, Upload, Plus, Save } from 'lucide-react';

interface ActionBarProps {
  hasChanges: boolean;
  selectedCount: number;
  loading: boolean;
  exporting: boolean;
  onSave: () => void;
  onDiscard: () => void;
  onSelectAll: () => void;
  onDeselectAll: () => void;
  onOpenGenerate: () => void;
  onOpenClear: () => void;
  onOpenImport: () => void;
  onExport: () => void;
  onOpenAdd: () => void;
  onOpenDelete: () => void;
  onOpenRefresh: () => void;
  onOpenSeed: () => void;
}

const outlineBtn =
  'px-3 py-2 text-sm font-medium rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1';

const iconBtn =
  'p-2 rounded-lg border transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1';

export default function ActionBar({
  hasChanges,
  selectedCount,
  loading,
  exporting,
  onSave,
  onDiscard,
  onOpenGenerate,
  onOpenClear,
  onOpenImport,
  onExport,
  onOpenAdd,
  onOpenDelete,
  onOpenRefresh,
  onOpenSeed,
}: ActionBarProps) {
  const hasSelection = selectedCount > 0;

  return (
    <div className="bg-white dark:bg-slate-800 p-3 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700">
      <div className="flex flex-wrap items-center justify-between gap-3">
        {/* Left side actions */}
        <div className="flex flex-wrap items-center gap-2">
          <button
            onClick={onOpenGenerate}
            className={`${outlineBtn} border-blue-300 text-blue-600 hover:bg-blue-50 dark:border-blue-600 dark:text-blue-400 dark:hover:bg-blue-950`}
          >
            Generate Schedule
          </button>
          <button
            onClick={onOpenClear}
            className={`${outlineBtn} border-amber-300 text-amber-600 hover:bg-amber-50 dark:border-amber-600 dark:text-amber-400 dark:hover:bg-amber-950`}
          >
            Clear Schedule
          </button>
          <button
            onClick={onOpenRefresh}
            className={`${outlineBtn} border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800`}
          >
            Update Employee List
          </button>
          <button
            onClick={onOpenSeed}
            className={`${outlineBtn} border-green-300 text-green-600 hover:bg-green-50 dark:border-green-600 dark:text-green-400 dark:hover:bg-green-950`}
          >
            Seed from Payroll
          </button>
        </div>

        {/* Right side actions */}
        <div className="flex flex-wrap items-center gap-2">
          {hasSelection && (
            <>
              <button
                onClick={onOpenDelete}
                className={`${iconBtn} border-red-300 text-red-600 hover:bg-red-50 dark:border-red-600 dark:text-red-400 dark:hover:bg-red-950`}
                title={`Delete ${selectedCount} selected`}
              >
                <Trash2 className="w-4 h-4" />
              </button>
              <span className="text-xs text-gray-400 dark:text-gray-500 mx-1">|</span>
            </>
          )}

          {hasChanges && (
            <button
              onClick={onDiscard}
              className={`${outlineBtn} border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800`}
            >
              Discard
            </button>
          )}

          <button
            onClick={onExport}
            disabled={exporting}
            className={`${iconBtn} border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800 disabled:opacity-50 disabled:cursor-not-allowed`}
            title="Export to Excel"
            aria-label="Export to Excel"
          >
            <Download className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenImport}
            className={`${iconBtn} border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800`}
            title="Import"
          >
            <Upload className="w-4 h-4" />
          </button>
          <button
            onClick={onOpenAdd}
            className={`${outlineBtn} border-gray-300 text-gray-600 hover:bg-gray-50 dark:border-gray-600 dark:text-gray-400 dark:hover:bg-gray-800`}
          >
            <span className="flex items-center gap-1">
              <Plus className="w-4 h-4" />
              Add Record
            </span>
          </button>

          <button
            onClick={onSave}
            disabled={!hasChanges || loading}
            className={`${outlineBtn} flex items-center gap-1 ${
              hasChanges && !loading
                ? 'border-blue-500 bg-blue-600 text-white hover:bg-blue-700'
                : 'border-gray-200 bg-gray-100 text-gray-400 cursor-not-allowed dark:border-gray-700 dark:bg-gray-800 dark:text-gray-600'
            }`}
          >
            <Save className="w-4 h-4" />
            {loading ? 'Saving...' : 'Save Changes'}
          </button>
        </div>
      </div>
    </div>
  );
}
