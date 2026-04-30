'use client';

import { useState, useEffect } from 'react';
import toast from 'react-hot-toast';
import { useWizard, Wizard } from '@/components/ui/Wizard';
import ResultStep from '@/components/ui/ResultStep';
import Button from '@/components/ui/Button';
import Spinner from '@/components/ui/Spinner';
import SelectField from '@/components/ui/SelectField';
import EmployeeCheckboxList from '@/components/ui/EmployeeCheckboxList';
import type { FilterState } from '@/components/schedule/useScheduleState';
import { useToggleSet } from '@/lib/hooks/useToggleSet';

interface PayrollTenant {
  id: string;
  name: string;
  hotels: PayrollHotel[];
}

interface PayrollHotel {
  id: string;
  name: string;
  usrSystemCompanyId: string;
}

interface PayrollEmployee {
  code: string;
  firstName: string;
  lastName: string;
  deptName: string;
  positionName: string;
}

interface SeedEmployeesModalProps {
  open: boolean;
  onClose: () => void;
  filters: FilterState;
  onComplete: () => void;
}

export default function SeedEmployeesModal({
  open,
  onClose,
  filters,
  onComplete,
}: SeedEmployeesModalProps) {
  const { step, next, back, goTo, reset } = useWizard(3);
  const [tenants, setTenants] = useState<PayrollTenant[]>([]);
  const [selectedTenant, setSelectedTenant] = useState('');
  const [selectedHotel, setSelectedHotel] = useState('');
  const [selectedUsrSystemCompanyId, setSelectedUsrSystemCompanyId] = useState('');
  const [employees, setEmployees] = useState<PayrollEmployee[]>([]);
  const {
    set: selectedCodes,
    toggle: toggleEmployee,
    toggleAll,
    clear: clearCodes,
    reset: resetCodes,
  } = useToggleSet<string>();
  const [loading, setLoading] = useState(false);
  const [fetchingEmployees, setFetchingEmployees] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<string | null>(null);

  useEffect(() => {
    if (open) {
      reset();
      setSelectedTenant('');
      setSelectedHotel('');
      setSelectedUsrSystemCompanyId('');
      setEmployees([]);
      clearCodes();
      setError(null);
      setResult(null);
      fetchTenants();
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  const fetchTenants = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/payroll/tenants');
      if (!res.ok) throw new Error('Failed to fetch tenants');
      const json = await res.json();
      setTenants(json.tenants ?? json);
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to fetch tenants');
    } finally {
      setLoading(false);
    }
  };

  const handleTenantChange = (tenantId: string) => {
    setSelectedTenant(tenantId);
    setSelectedHotel('');
    setSelectedUsrSystemCompanyId('');
  };

  const handleHotelChange = (hotelId: string) => {
    setSelectedHotel(hotelId);
    const tenant = tenants.find((t) => t.id === selectedTenant);
    const hotel = tenant?.hotels.find((h) => h.id === hotelId);
    setSelectedUsrSystemCompanyId(hotel?.usrSystemCompanyId ?? '');
  };

  const currentTenant = tenants.find((t) => t.id === selectedTenant);
  const currentHotels = currentTenant?.hotels ?? [];

  const fetchEmployees = async () => {
    if (!selectedUsrSystemCompanyId) return;
    setFetchingEmployees(true);
    try {
      const params = new URLSearchParams({
        usrSystemCompanyId: selectedUsrSystemCompanyId,
      });
      const res = await fetch(`/api/payroll/employees?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch payroll employees');
      const json = await res.json();
      const list: PayrollEmployee[] = json.employees ?? json;
      setEmployees(list);
      resetCodes(list.map((e) => e.code));
      next();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to fetch payroll employees');
    } finally {
      setFetchingEmployees(false);
    }
  };

  const handleSeed = async () => {
    goTo(3);
    setLoading(true);
    setError(null);
    setResult(null);
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
      });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Seeding failed');
      }
      const json = await res.json();
      setResult(json.message ?? 'Employees seeded successfully.');
      onComplete();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Seeding failed');
    } finally {
      setLoading(false);
    }
  };

  const renderStep = () => {
    switch (step) {
      case 1:
        if (loading) {
          return (
            <div className="flex justify-center py-8">
              <Spinner />
            </div>
          );
        }
        return (
          <div className="space-y-4">
            <SelectField
              label="Payroll Tenant"
              value={selectedTenant}
              onChange={handleTenantChange}
            >
              <option value="">Select tenant...</option>
              {tenants.map((t) => (
                <option key={t.id} value={t.id}>
                  {t.name}
                </option>
              ))}
            </SelectField>

            {currentHotels.length > 0 && (
              <SelectField label="Hotel" value={selectedHotel} onChange={handleHotelChange}>
                <option value="">Select hotel...</option>
                {currentHotels.map((h) => (
                  <option key={h.id} value={h.id}>
                    {h.name}
                  </option>
                ))}
              </SelectField>
            )}

            {fetchingEmployees && (
              <div className="flex justify-center py-4">
                <Spinner />
              </div>
            )}
          </div>
        );
      case 2:
        return (
          <div className="space-y-3">
            <EmployeeCheckboxList
              employees={employees}
              selected={selectedCodes}
              onToggle={toggleEmployee}
              onToggleAll={toggleAll}
              label="Payroll Employees"
              showCode
            />
            <div className="p-3 bg-gray-50 rounded-lg text-sm text-gray-600">
              <p>
                <strong>Seeding to:</strong>
              </p>
              <p>Tenant: {currentTenant?.name}</p>
              <p>Hotel: {currentHotels.find((h) => h.id === selectedHotel)?.name}</p>
              <p>Employees: {selectedCodes.size} selected</p>
            </div>
          </div>
        );
      case 3:
        return (
          <ResultStep
            loading={loading}
            loadingText="Seeding employees..."
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
    if (step === 3) return null;
    return (
      <>
        <Button variant="secondary" onClick={onClose}>
          Cancel
        </Button>
        {step === 2 && (
          <Button variant="secondary" onClick={back}>
            Back
          </Button>
        )}
        {step === 1 && (
          <Button
            variant="primary"
            onClick={fetchEmployees}
            disabled={!selectedHotel || fetchingEmployees}
          >
            {fetchingEmployees ? 'Loading...' : 'Next'}
          </Button>
        )}
        {step === 2 && (
          <Button variant="primary" onClick={handleSeed} disabled={selectedCodes.size === 0}>
            Seed Employees
          </Button>
        )}
      </>
    );
  };

  return (
    <Wizard
      open={open}
      onClose={onClose}
      title="Seed Employees"
      size="lg"
      step={step}
      total={3}
      footer={renderFooter()}
    >
      {renderStep()}
    </Wizard>
  );
}
