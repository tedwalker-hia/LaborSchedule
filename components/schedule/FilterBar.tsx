'use client';

import type { FilterState, HotelOption } from '@/components/schedule/useScheduleState';
import DateRangeField from '@/components/ui/DateRangeField';

interface FilterBarProps {
  filters: FilterState;
  setFilters: (fn: (prev: FilterState) => FilterState) => void;
  tenants: string[];
  hotels: HotelOption[];
  departments: string[];
  positions: string[];
  loadHotels: (tenant: string) => void;
  loading: boolean;
  hotelsLoading?: boolean;
  departmentsLoading?: boolean;
  positionsLoading?: boolean;
}

const selectClasses =
  'px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500';

const labelClasses = 'text-sm font-medium text-gray-700 dark:text-gray-300';

export default function FilterBar({
  filters,
  setFilters,
  tenants,
  hotels,
  departments,
  positions,
  loadHotels,
  loading,
  hotelsLoading = false,
  departmentsLoading = false,
  positionsLoading = false,
}: FilterBarProps) {
  function handleTenantChange(value: string) {
    setFilters((prev) => ({
      ...prev,
      tenant: value,
      hotel: '',
      hotelInfo: null,
      department: '',
      position: '',
    }));
    if (value) loadHotels(value);
  }

  function handleHotelChange(value: string) {
    const match = hotels.find((h) => h.hotelName === value);
    const hotelInfo =
      match && match.branchId != null && match.usrSystemCompanyId != null
        ? {
            hotelName: match.hotelName,
            branchId: match.branchId,
            usrSystemCompanyId: match.usrSystemCompanyId,
          }
        : null;
    setFilters((prev) => ({ ...prev, hotel: value, hotelInfo, department: '', position: '' }));
  }

  function handleDepartmentChange(value: string) {
    setFilters((prev) => ({ ...prev, department: value, position: '' }));
  }

  function handlePositionChange(value: string) {
    setFilters((prev) => ({ ...prev, position: value }));
  }

  function handleStartDateChange(value: string) {
    setFilters((prev) => ({ ...prev, startDate: value }));
  }

  function handleEndDateChange(value: string) {
    setFilters((prev) => ({ ...prev, endDate: value }));
  }

  return (
    <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700">
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1">
          <label className={labelClasses}>Tenant</label>
          <select
            className={selectClasses}
            value={filters.tenant}
            onChange={(e) => handleTenantChange(e.target.value)}
            disabled={loading}
          >
            <option value="">-- Select Tenant --</option>
            {tenants.map((t) => (
              <option key={t} value={t}>
                {t}
              </option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClasses}>
            Hotel
            {hotelsLoading && (
              <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                Loading…
              </span>
            )}
          </label>
          <select
            className={selectClasses}
            value={filters.hotel}
            onChange={(e) => handleHotelChange(e.target.value)}
            disabled={!filters.tenant || hotelsLoading || loading}
          >
            <option value="">
              {hotelsLoading ? 'Loading hotels…' : '-- Select Hotel --'}
            </option>
            {!hotelsLoading &&
              hotels.map((h) => (
                <option key={`${h.branchId}-${h.usrSystemCompanyId}`} value={h.hotelName}>
                  {h.hotelName}
                </option>
              ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClasses}>
            Department
            {departmentsLoading && (
              <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                Loading…
              </span>
            )}
          </label>
          <select
            className={selectClasses}
            value={filters.department}
            onChange={(e) => handleDepartmentChange(e.target.value)}
            disabled={!filters.hotel || departmentsLoading || loading}
          >
            <option value="">
              {departmentsLoading ? 'Loading departments…' : '-- All Departments --'}
            </option>
            {!departmentsLoading &&
              departments.map((d) => (
                <option key={d} value={d}>
                  {d}
                </option>
              ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClasses}>
            Position
            {positionsLoading && (
              <span className="ml-2 text-xs font-normal text-gray-500 dark:text-gray-400">
                Loading…
              </span>
            )}
          </label>
          <select
            className={selectClasses}
            value={filters.position}
            onChange={(e) => handlePositionChange(e.target.value)}
            disabled={!filters.hotel || positionsLoading || loading}
          >
            <option value="">
              {positionsLoading ? 'Loading positions…' : '-- All Positions --'}
            </option>
            {!positionsLoading &&
              positions.map((p) => (
                <option key={p} value={p}>
                  {p}
                </option>
              ))}
          </select>
        </div>

        <DateRangeField
          startLabel="From"
          endLabel="To"
          startValue={filters.startDate}
          endValue={filters.endDate}
          onStartChange={handleStartDateChange}
          onEndChange={handleEndDateChange}
          disabled={!filters.hotel || loading}
        />
      </div>
    </div>
  );
}
