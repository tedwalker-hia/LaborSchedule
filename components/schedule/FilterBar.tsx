'use client'

import { FilterState, HotelOption } from '@/components/schedule/useScheduleState'

interface FilterBarProps {
  filters: FilterState
  setFilters: (fn: (prev: FilterState) => FilterState) => void
  tenants: string[]
  hotels: HotelOption[]
  departments: string[]
  positions: string[]
  loadHotels: (tenant: string) => void
  loadDepartments: () => void
  loadPositions: () => void
  loadSchedule: () => void
  loading: boolean
}

const selectClasses =
  'px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

const labelClasses = 'text-sm font-medium text-gray-700 dark:text-gray-300'

const inputClasses =
  'px-3 py-2 border rounded-lg text-sm bg-white dark:bg-slate-700 border-gray-300 dark:border-slate-600 text-gray-900 dark:text-gray-100 focus:outline-none focus:ring-2 focus:ring-blue-500'

export default function FilterBar({
  filters,
  setFilters,
  tenants,
  hotels,
  departments,
  positions,
  loadHotels,
  loadDepartments,
  loadPositions,
  loadSchedule,
  loading,
}: FilterBarProps) {
  function handleTenantChange(value: string) {
    setFilters(prev => ({ ...prev, tenant: value, hotel: '', hotelInfo: null, department: '', position: '' }))
    if (value) loadHotels(value)
  }

  function handleHotelChange(value: string) {
    const hotelInfo = hotels.find(h => h.name === value) || null
    setFilters(prev => ({ ...prev, hotel: value, hotelInfo, department: '', position: '' }))
    if (hotelInfo) {
      loadDepartments()
      loadSchedule()
    }
  }

  function handleDepartmentChange(value: string) {
    setFilters(prev => ({ ...prev, department: value, position: '' }))
    loadPositions()
    loadSchedule()
  }

  function handlePositionChange(value: string) {
    setFilters(prev => ({ ...prev, position: value }))
    loadSchedule()
  }

  function handleStartDateChange(value: string) {
    setFilters(prev => ({ ...prev, startDate: value }))
    loadSchedule()
  }

  function handleEndDateChange(value: string) {
    setFilters(prev => ({ ...prev, endDate: value }))
    loadSchedule()
  }

  return (
    <div className="bg-white dark:bg-slate-800 p-4 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700">
      <div className="flex flex-wrap gap-4 items-end">
        <div className="flex flex-col gap-1">
          <label className={labelClasses}>Tenant</label>
          <select
            className={selectClasses}
            value={filters.tenant}
            onChange={e => handleTenantChange(e.target.value)}
            disabled={loading}
          >
            <option value="">-- Select Tenant --</option>
            {tenants.map(t => (
              <option key={t} value={t}>{t}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClasses}>Hotel</label>
          <select
            className={selectClasses}
            value={filters.hotel}
            onChange={e => handleHotelChange(e.target.value)}
            disabled={!filters.tenant || loading}
          >
            <option value="">-- Select Hotel --</option>
            {hotels.map(h => (
              <option key={`${h.branchId}-${h.usrSystemCompanyId}`} value={h.name}>{h.name}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClasses}>Department</label>
          <select
            className={selectClasses}
            value={filters.department}
            onChange={e => handleDepartmentChange(e.target.value)}
            disabled={!filters.hotel || loading}
          >
            <option value="">-- All Departments --</option>
            {departments.map(d => (
              <option key={d} value={d}>{d}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClasses}>Position</label>
          <select
            className={selectClasses}
            value={filters.position}
            onChange={e => handlePositionChange(e.target.value)}
            disabled={!filters.hotel || loading}
          >
            <option value="">-- All Positions --</option>
            {positions.map(p => (
              <option key={p} value={p}>{p}</option>
            ))}
          </select>
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClasses}>From</label>
          <input
            type="date"
            className={inputClasses}
            value={filters.startDate}
            onChange={e => handleStartDateChange(e.target.value)}
            disabled={!filters.hotel || loading}
          />
        </div>

        <div className="flex flex-col gap-1">
          <label className={labelClasses}>To</label>
          <input
            type="date"
            className={inputClasses}
            value={filters.endDate}
            onChange={e => handleEndDateChange(e.target.value)}
            disabled={!filters.hotel || loading}
          />
        </div>
      </div>
    </div>
  )
}
