'use client';

import { useEffect, useState } from 'react';
import { useScheduleState } from '@/components/schedule/useScheduleState';
import FilterBar from '@/components/schedule/FilterBar';
import ActionBar from '@/components/schedule/ActionBar';
import ScheduleGrid from '@/components/schedule/ScheduleGrid';
import GenerateModal from '@/components/schedule/GenerateModal';
import ClearModal from '@/components/schedule/ClearModal';
import ImportModal from '@/components/schedule/ImportModal';
import AddRecordModal from '@/components/schedule/AddRecordModal';
import DeleteModal from '@/components/schedule/DeleteModal';
import RefreshEmployeesModal from '@/components/schedule/RefreshEmployeesModal';
import SeedEmployeesModal from '@/components/schedule/SeedEmployeesModal';

export default function SchedulePage() {
  const {
    filters,
    setFilters,
    data,
    loading,
    changes,
    hasChanges,
    recordChange,
    getEffectiveValue,
    discardChanges,
    saveChanges,
    selectedEmployees,
    toggleEmployee,
    selectAllEmployees,
    deselectAllEmployees,
    tenants,
    hotels,
    departments,
    positions,
    loadTenants,
    loadHotels,
    loadSchedule,
  } = useScheduleState();

  // Modal state
  const [generateModalOpen, setGenerateModalOpen] = useState(false);
  const [clearModalOpen, setClearModalOpen] = useState(false);
  const [importModalOpen, setImportModalOpen] = useState(false);
  const [addModalOpen, setAddModalOpen] = useState(false);
  const [deleteModalOpen, setDeleteModalOpen] = useState(false);
  const [refreshModalOpen, setRefreshModalOpen] = useState(false);
  const [seedModalOpen, setSeedModalOpen] = useState(false);

  // Load tenants on mount
  useEffect(() => {
    loadTenants();
  }, [loadTenants]);

  // Status message
  const statusMessage = loading
    ? 'Loading schedule...'
    : hasChanges
      ? `${Object.keys(changes).length} unsaved change(s)`
      : data
        ? `${data.employees.length} employee(s) · ${data.dates.length} day(s)`
        : null;

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">Schedule Editor</h1>
      </div>

      <FilterBar
        filters={filters}
        setFilters={setFilters}
        tenants={tenants}
        hotels={hotels}
        departments={departments}
        positions={positions}
        loadHotels={loadHotels}
        loading={loading}
      />

      <ActionBar
        hasChanges={hasChanges}
        selectedCount={selectedEmployees.size}
        loading={loading}
        onSave={saveChanges}
        onDiscard={discardChanges}
        onSelectAll={selectAllEmployees}
        onDeselectAll={deselectAllEmployees}
        onOpenGenerate={() => setGenerateModalOpen(true)}
        onOpenClear={() => setClearModalOpen(true)}
        onOpenImport={() => setImportModalOpen(true)}
        onOpenAdd={() => setAddModalOpen(true)}
        onOpenDelete={() => setDeleteModalOpen(true)}
        onOpenRefresh={() => setRefreshModalOpen(true)}
        onOpenSeed={() => setSeedModalOpen(true)}
      />

      {statusMessage && (
        <div className="text-sm text-gray-500 dark:text-gray-400">{statusMessage}</div>
      )}

      {data ? (
        <ScheduleGrid
          data={data}
          changes={changes}
          selectedEmployees={selectedEmployees}
          getEffectiveValue={getEffectiveValue}
          recordChange={recordChange}
          toggleEmployee={toggleEmployee}
          selectAllEmployees={selectAllEmployees}
          deselectAllEmployees={deselectAllEmployees}
        />
      ) : (
        !loading && (
          <div className="rounded-lg border border-dashed border-gray-300 dark:border-gray-700 p-12 text-center">
            <p className="text-gray-500 dark:text-gray-400">
              Select a tenant and hotel, then load the schedule to get started.
            </p>
          </div>
        )
      )}

      {/* Modals */}
      {generateModalOpen && (
        <GenerateModal
          open={generateModalOpen}
          onClose={() => setGenerateModalOpen(false)}
          filters={filters}
          selectedEmployees={selectedEmployees}
          onComplete={loadSchedule}
        />
      )}
      {clearModalOpen && (
        <ClearModal
          open={clearModalOpen}
          onClose={() => setClearModalOpen(false)}
          filters={filters}
          selectedEmployees={selectedEmployees}
          onComplete={loadSchedule}
        />
      )}
      {importModalOpen && (
        <ImportModal
          open={importModalOpen}
          onClose={() => setImportModalOpen(false)}
          filters={filters}
          onComplete={loadSchedule}
        />
      )}
      {addModalOpen && (
        <AddRecordModal
          open={addModalOpen}
          onClose={() => setAddModalOpen(false)}
          filters={filters}
          onComplete={loadSchedule}
        />
      )}
      {deleteModalOpen && (
        <DeleteModal
          open={deleteModalOpen}
          onClose={() => setDeleteModalOpen(false)}
          filters={filters}
          selectedEmployees={selectedEmployees}
          onComplete={loadSchedule}
        />
      )}
      {refreshModalOpen && (
        <RefreshEmployeesModal
          open={refreshModalOpen}
          onClose={() => setRefreshModalOpen(false)}
          filters={filters}
          onComplete={loadSchedule}
        />
      )}
      {seedModalOpen && (
        <SeedEmployeesModal
          open={seedModalOpen}
          onClose={() => setSeedModalOpen(false)}
          filters={filters}
          onComplete={loadSchedule}
        />
      )}
    </div>
  );
}
