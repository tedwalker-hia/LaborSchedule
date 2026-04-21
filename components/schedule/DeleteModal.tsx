'use client'

import { useState, useEffect } from 'react'
import Modal from '@/components/ui/Modal'
import { FilterState } from '@/components/schedule/useScheduleState'

interface DeleteModalProps {
  open: boolean
  onClose: () => void
  filters: FilterState
  selectedEmployees?: Set<string>
  onComplete: () => void
}

export default function DeleteModal({ open, onClose, filters, selectedEmployees, onComplete }: DeleteModalProps) {
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const [result, setResult] = useState('')

  useEffect(() => {
    if (open) {
      setError('')
      setResult('')
    }
  }, [open])

  const employeeCodes = selectedEmployees ? [...selectedEmployees] : []

  const handleDelete = async () => {
    if (!filters.hotelInfo) return
    setLoading(true)
    setError('')
    try {
      const res = await fetch('/api/schedule/delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          usrSystemCompanyId: filters.hotelInfo.usrSystemCompanyId,
          employeeCodes,
          startDate: filters.startDate,
          endDate: filters.endDate,
        }),
      })
      if (!res.ok) {
        const body = await res.json().catch(() => ({}))
        throw new Error(body.error ?? 'Delete failed')
      }
      const json = await res.json()
      setResult(json.message ?? 'Records deleted successfully.')
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Delete failed')
    } finally {
      setLoading(false)
    }
  }

  const handleClose = () => {
    if (result) onComplete()
    onClose()
  }

  const footer = result ? (
    <button onClick={handleClose} className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium">
      Close
    </button>
  ) : (
    <>
      <button onClick={handleClose} className="bg-gray-100 text-gray-700 hover:bg-gray-200 px-4 py-2 rounded-lg text-sm font-medium">
        Cancel
      </button>
      <button
        onClick={handleDelete}
        disabled={loading || employeeCodes.length === 0}
        className="bg-red-600 text-white hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
      >
        {loading ? 'Deleting...' : 'Delete'}
      </button>
    </>
  )

  return (
    <Modal isOpen={open} onClose={handleClose} title="Delete Schedule Records" size="sm" footer={footer}>
      {error && <div className="p-3 bg-red-50 text-red-700 rounded-lg text-sm mb-4">{error}</div>}
      {result ? (
        <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm">{result}</div>
      ) : (
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
                  <li key={code} className="font-mono">{code}</li>
                ))}
              </ul>
            )}
          </div>

          <div className="text-sm text-gray-600">
            <p><strong>Date range:</strong> {filters.startDate} to {filters.endDate}</p>
          </div>

          <div className="p-3 bg-yellow-50 text-yellow-700 rounded-lg text-sm">
            This action cannot be undone.
          </div>
        </div>
      )}
    </Modal>
  )
}
