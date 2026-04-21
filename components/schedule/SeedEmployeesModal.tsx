'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import { FilterState } from '@/components/schedule/useScheduleState'

interface PayrollTenant {
  id: string
  name: string
  hotels: PayrollHotel[]
}

interface PayrollHotel {
  id: string
  name: string
  usrSystemCompanyId: string
}

interface PayrollEmployee {
  code: string
  firstName: string
  lastName: string
  deptName: string
  positionName: string
}

interface SeedEmployeesModalProps {
  open: boolean
  onClose: () => void
  filters: FilterState
  onComplete: () => void
}

export default function SeedEmployeesModal({ open, onClose, filters, onComplete }: SeedEmployeesModalProps) {
  const [step, setStep] = useState(1)
  const [tenants, setTenants] = useState<PayrollTenant[]>([])
  const [selectedTenant, setSelectedTenant] = useState('')
  const [selectedHotel, setSelectedHotel] = useState('')
  const [selectedUsrSystemCompanyId, setSelectedUsrSystemCompanyId] = useState('')
  const [employees, setEmployees] = useState<PayrollEmployee[]>([])
  const [selectedCodes, setSelectedCodes] = useState<Set<string>>(new Set())
  const [loading, setLoading] = useState(false)
  const [fetchingEmployees, setFetchingEmployees] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')

  useEffect(() => {
    if (open) {
      setStep(1)
      setSelectedTenant('')
      setSelectedHotel('')
      setSelectedUsrSystemCompanyId('')
      setEmployees([])
      setSelectedCodes(new Set())
      setError('')
      setResult('')
      fetchTenants()
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const fetchTenants = async () => {
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/payroll/tenants')
      if (!res.ok) throw new Error('Failed to fetch tenants')
      const json = await res.json()
      setTenants(json.tenants ?? json)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch tenants')
    } finally {
      setLoading(false)
    }
  }

  const handleTenantChange = (tenantId: string) => {
    setSelectedTenant(tenantId)
    setSelectedHotel('')
    setSelectedUsrSystemCompanyId('')
  }

  const handleHotelChange = (hotelId: string) => {
    setSelectedHotel(hotelId)
    const tenant = tenants.find((t) => t.id === selectedTenant)
    const hotel = tenant?.hotels.find((h) => h.id === hotelId)
    setSelectedUsrSystemCompanyId(hotel?.usrSystemCompanyId ?? '')
  }

  const currentTenant = tenants.find((t) => t.id === selectedTenant)
  const currentHotels = currentTenant?.hotels ?? []

  const fetchEmployees = async () => {
    if (!selectedUsrSystemCompanyId) return
    setFetchingEmployees(true)
    setError('')
    try {
      const params = new URLSearchParams({
        usrSystemCompanyId: selectedUsrSystemCompanyId,
      })
      const res = await fetch(`/api/payroll/employees?${params.toString()}`)
      if (!res.ok) throw new Error('Failed to fetch payroll employees')
      const json = await res.json()
      const list: PayrollEmployee[] = json.employees ?? json
      setEmployees(list)
      setSelectedCodes(new Set(list.map((e) => e.code)))
      setStep(2)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to fetch payroll employees')
    } finally {
      setFetchingEmployees(false)
    }
  }

  const toggleEmployee = (code: string) => {
    setSelectedCodes((prev) => {
      const next = new Set(prev)
      if (next.has(code)) next.delete(code)
      else next.add(code)
      return next
    })
  }

  const toggleAll = () => {
    if (selectedCodes.size === employees.length) {
      setSelectedCodes(new Set())
    } else {
      setSelectedCodes(new Set(employees.map((e) => e.code)))
    }
  }

  const handleSeed = async () => {
    setStep(3)
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/payroll/seed', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          tenant: selectedTenant,
          hotel: selectedHotel,
          usrSystemCompanyId: selectedUsrSystemCompanyId,
          employeeCodes: [...selectedCodes],
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Seeding failed')
      }
      const json = await res.json()
      setResult(json.message ?? 'Employees seeded successfully.')
      setStep(4)
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Seeding failed')
      setStep(4)
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (step === 4 && result) onComplete()
    onClose()
  }

  const renderStep = () => {
    switch (step) {
      case 1:
        if (loading) {
          return (
            <div className="flex justify-center py-8">
              <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            </div>
          )
        }
        return (
          <div className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Payroll Tenant</label>
              <select
                value={selectedTenant}
                onChange={(e) => handleTenantChange(e.target.value)}
                className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
              >
                <option value="">Select tenant...</option>
                {tenants.map((t) => (
                  <option key={t.id} value={t.id}>{t.name}</option>
                ))}
              </select>
            </div>

            {currentHotels.length > 0 && (
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Hotel</label>
                <select
                  value={selectedHotel}
                  onChange={(e) => handleHotelChange(e.target.value)}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 text-sm"
                >
                  <option value="">Select hotel...</option>
                  {currentHotels.map((h) => (
                    <option key={h.id} value={h.id}>{h.name}</option>
                  ))}
                </select>
              </div>
            )}

            {fetchingEmployees && (
              <div className="flex justify-center py-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
              </div>
            )}
          </div>
        )
      case 2:
        return (
          <div className="space-y-3">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-medium text-gray-700">
                Payroll Employees ({selectedCodes.size}/{employees.length})
              </h3>
              <button onClick={toggleAll} className="text-sm text-blue-600 hover:text-blue-800">
                {selectedCodes.size === employees.length ? 'Deselect All' : 'Select All'}
              </button>
            </div>
            <div className="max-h-64 overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100">
              {employees.map((emp) => (
                <label key={emp.code} className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={selectedCodes.has(emp.code)}
                    onChange={() => toggleEmployee(emp.code)}
                    className="mr-3"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-800">
                      {emp.firstName} {emp.lastName}
                    </span>
                    <span className="text-xs text-gray-500 ml-2">{emp.code}</span>
                  </div>
                  <span className="text-xs text-gray-500 ml-2">{emp.deptName}</span>
                </label>
              ))}
            </div>
            <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
              <p><strong>Seeding to:</strong></p>
              <p>Tenant: {currentTenant?.name}</p>
              <p>Hotel: {currentHotels.find((h) => h.id === selectedHotel)?.name}</p>
              <p>Employees: {selectedCodes.size} selected</p>
            </div>
          </div>
        )
      case 3:
        return (
          <div className="flex flex-col items-center py-8 gap-4">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
            <p className="text-sm text-gray-600">Seeding employees...</p>
          </div>
        )
      case 4:
        return (
          <div className="space-y-4">
            {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm">{error}</div>}
            {result && <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">{result}</div>}
          </div>
        )
      default:
        return null
    }
  }

  const renderFooter = () => {
    if (step === 3) return null
    if (step === 4) {
      return (
        <button onClick={handleClose} className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium">
          Close
        </button>
      )
    }
    return (
      <>
        <button onClick={handleClose} className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-4 py-2 rounded-lg text-sm font-medium">
          Cancel
        </button>
        {step === 2 && (
          <button onClick={() => setStep(1)} className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-4 py-2 rounded-lg text-sm font-medium">
            Back
          </button>
        )}
        {step === 1 && (
          <button
            onClick={fetchEmployees}
            disabled={!selectedHotel || fetchingEmployees}
            className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            {fetchingEmployees ? 'Loading...' : 'Next'}
          </button>
        )}
        {step === 2 && (
          <button
            onClick={handleSeed}
            disabled={selectedCodes.size === 0}
            className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
          >
            Seed Employees
          </button>
        )}
      </>
    )
  }

  return (
    <Modal isOpen={open} onClose={handleClose} title={`Seed Employees (Step ${step}/4)`} size="lg" footer={renderFooter()}>
      {error && step !== 4 && (
        <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm mb-4">{error}</div>
      )}
      {renderStep()}
    </Modal>
  )
}
