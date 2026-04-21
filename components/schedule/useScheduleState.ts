'use client'

import { useState, useCallback, useMemo } from 'react'
import { format, addDays, subDays } from 'date-fns'
import { calcHours } from '@/lib/schedule-utils'

// ── Types ──────────────────────────────────────────────────────────────────────

export interface ScheduleEmployee {
  code: string
  firstName: string
  lastName: string
  deptName: string
  multiDept: boolean
  positionName: string
}

export interface ScheduleEntry {
  clockIn: string
  clockOut: string
  hours: number
  locked: boolean
}

export interface ScheduleChange {
  clockIn?: string
  clockOut?: string
  hours?: number
}

export interface ScheduleData {
  dates: string[]
  employees: ScheduleEmployee[]
  schedule: Record<string, Record<string, ScheduleEntry>>
  allDepts: string[]
  allPositions: string[]
  positionsByDept: Record<string, string[]>
}

export interface FilterState {
  tenant: string
  hotel: string
  hotelInfo: { name: string; branchId: number; usrSystemCompanyId: string } | null
  department: string
  position: string
  startDate: string
  endDate: string
}

export interface HotelOption {
  name: string
  branchId: number
  usrSystemCompanyId: string
}

// ── Hook ───────────────────────────────────────────────────────────────────────

export function useScheduleState() {
  // Filter state
  const [filters, setFilters] = useState<FilterState>({
    tenant: '',
    hotel: '',
    hotelInfo: null,
    department: '',
    position: '',
    startDate: '',
    endDate: '',
  })

  // Data state
  const [data, setData] = useState<ScheduleData | null>(null)
  const [loading, setLoading] = useState(false)

  // Change tracking — keyed by `${empCode}|${date}`
  const [changes, setChanges] = useState<Record<string, ScheduleChange>>({})

  // Selection
  const [selectedEmployees, setSelectedEmployees] = useState<Set<string>>(new Set())

  // Dropdown options
  const [tenants, setTenants] = useState<string[]>([])
  const [hotels, setHotels] = useState<HotelOption[]>([])
  const [departments, setDepartments] = useState<string[]>([])
  const [positions, setPositions] = useState<string[]>([])

  // ── Loaders ────────────────────────────────────────────────────────────────

  const loadTenants = useCallback(async () => {
    try {
      const res = await fetch('/api/tenants')
      if (!res.ok) throw new Error('Failed to load tenants')
      const json = await res.json()
      setTenants(json.tenants ?? json)
    } catch (err) {
      console.error('loadTenants error:', err)
    }
  }, [])

  const loadHotels = useCallback(async (tenant: string) => {
    try {
      const res = await fetch(`/api/hotels/${encodeURIComponent(tenant)}`)
      if (!res.ok) throw new Error('Failed to load hotels')
      const json = await res.json()
      setHotels(json.hotels ?? json)
    } catch (err) {
      console.error('loadHotels error:', err)
    }
  }, [])

  const loadDepartments = useCallback(async () => {
    try {
      const res = await fetch('/api/departments')
      if (!res.ok) throw new Error('Failed to load departments')
      const json = await res.json()
      setDepartments(json.departments ?? json)
    } catch (err) {
      console.error('loadDepartments error:', err)
    }
  }, [])

  const loadPositions = useCallback(async () => {
    try {
      const res = await fetch('/api/positions')
      if (!res.ok) throw new Error('Failed to load positions')
      const json = await res.json()
      setPositions(json.positions ?? json)
    } catch (err) {
      console.error('loadPositions error:', err)
    }
  }, [])

  const loadSchedule = useCallback(async () => {
    setLoading(true)
    try {
      const today = new Date()
      const startDate = filters.startDate || format(subDays(today, 7), 'yyyy-MM-dd')
      const endDate = filters.endDate || format(addDays(today, 7), 'yyyy-MM-dd')

      const params = new URLSearchParams()
      if (filters.tenant) params.set('tenant', filters.tenant)
      if (filters.hotel) params.set('hotel', filters.hotel)
      if (filters.hotelInfo) {
        params.set('branchId', String(filters.hotelInfo.branchId))
        params.set('usrSystemCompanyId', filters.hotelInfo.usrSystemCompanyId)
      }
      if (filters.department) params.set('department', filters.department)
      if (filters.position) params.set('position', filters.position)
      params.set('startDate', startDate)
      params.set('endDate', endDate)

      const res = await fetch(`/api/schedule?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to load schedule')
      const json: ScheduleData = await res.json()
      setData(json)
      setChanges({})
      setSelectedEmployees(new Set())
    } catch (err) {
      console.error('loadSchedule error:', err)
    } finally {
      setLoading(false)
    }
  }, [filters])

  // ── Change tracking ────────────────────────────────────────────────────────

  const recordChange = useCallback(
    (empCode: string, date: string, field: string, value: string | number) => {
      setChanges((prev) => {
        const key = `${empCode}|${date}`
        const existing = prev[key] ?? {}
        const updated = { ...existing, [field]: value } as ScheduleChange

        // Auto-calc hours when both clock times are available
        if (field === 'clockIn' || field === 'clockOut') {
          const clockIn = field === 'clockIn' ? (value as string) : updated.clockIn
          const clockOut = field === 'clockOut' ? (value as string) : updated.clockOut

          // Fall back to original data if one side is missing from changes
          const origEntry = data?.schedule?.[empCode]?.[date]
          const effectiveIn = clockIn ?? origEntry?.clockIn
          const effectiveOut = clockOut ?? origEntry?.clockOut

          if (effectiveIn && effectiveOut) {
            const hrs = calcHours(effectiveIn, effectiveOut)
            if (hrs !== null) {
              updated.hours = hrs
            }
          }
        }

        return { ...prev, [key]: updated }
      })
    },
    [data],
  )

  const getEffectiveValue = useCallback(
    (empCode: string, date: string, field: string): string | number => {
      const key = `${empCode}|${date}`
      const change = changes[key]
      const f = field as keyof ScheduleChange
      if (change && change[f] !== undefined) {
        return change[f] as string | number
      }
      const entry = data?.schedule?.[empCode]?.[date]
      if (entry) {
        return entry[field as keyof ScheduleEntry] as string | number
      }
      return ''
    },
    [changes, data],
  )

  const discardChanges = useCallback(() => {
    setChanges({})
  }, [])

  const saveChanges = useCallback(async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/schedule/save', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant: filters.tenant,
          hotel: filters.hotel,
          hotelInfo: filters.hotelInfo,
          changes,
        }),
      })
      if (!res.ok) throw new Error('Failed to save changes')
      // Reload schedule after successful save
      await loadSchedule()
    } catch (err) {
      console.error('saveChanges error:', err)
    } finally {
      setLoading(false)
    }
  }, [changes, filters, loadSchedule])

  // ── Selection ──────────────────────────────────────────────────────────────

  const toggleEmployee = useCallback((empCode: string) => {
    setSelectedEmployees((prev) => {
      const next = new Set(prev)
      if (next.has(empCode)) {
        next.delete(empCode)
      } else {
        next.add(empCode)
      }
      return next
    })
  }, [])

  const selectAllEmployees = useCallback(() => {
    if (!data) return
    setSelectedEmployees(new Set(data.employees.map((e) => e.code)))
  }, [data])

  const deselectAllEmployees = useCallback(() => {
    setSelectedEmployees(new Set())
  }, [])

  // ── Computed ───────────────────────────────────────────────────────────────

  const hasChanges = useMemo(() => Object.keys(changes).length > 0, [changes])

  // ── Return ─────────────────────────────────────────────────────────────────

  return {
    // Filter state
    filters,
    setFilters,

    // Data
    data,
    loading,

    // Changes
    changes,
    hasChanges,
    recordChange,
    getEffectiveValue,
    discardChanges,
    saveChanges,

    // Selection
    selectedEmployees,
    toggleEmployee,
    selectAllEmployees,
    deselectAllEmployees,

    // Dropdown options
    tenants,
    hotels,
    departments,
    positions,

    // Loaders
    loadTenants,
    loadHotels,
    loadDepartments,
    loadPositions,
    loadSchedule,
  }
}
