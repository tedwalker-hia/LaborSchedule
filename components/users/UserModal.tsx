'use client';

import { useState, useEffect, useCallback } from 'react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import type { UserRow } from '@/components/users/UserTable';

type Role = 'SuperAdmin' | 'CompanyAdmin' | 'HotelAdmin' | 'DeptAdmin';

interface HotelOption {
  hotelName: string;
  branchId: number | null;
  usrSystemCompanyId: string | null;
}

interface UserModalProps {
  open: boolean;
  onClose: () => void;
  user: UserRow | null;
  onSaved: () => void;
}

const ROLES: { value: Role; label: string }[] = [
  { value: 'SuperAdmin', label: 'Super Admin' },
  { value: 'CompanyAdmin', label: 'Company Admin' },
  { value: 'HotelAdmin', label: 'Hotel Admin' },
  { value: 'DeptAdmin', label: 'Dept Admin' },
];

const inputCls =
  'w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

export default function UserModal({ open, onClose, user, onSaved }: UserModalProps) {
  const isEdit = user !== null;

  // ── Form state ──────────────────────────────────────────────────────────
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [role, setRole] = useState<Role>('DeptAdmin');

  // ── Assignment state ────────────────────────────────────────────────────
  const [tenants, setTenants] = useState<string[]>([]);
  const [availableTenants, setAvailableTenants] = useState<string[]>([]);

  const [selectedTenant, setSelectedTenant] = useState('');
  const [availableHotels, setAvailableHotels] = useState<HotelOption[]>([]);
  const [selectedHotels, setSelectedHotels] = useState<{ tenant: string; hotelName: string }[]>([]);

  const [selectedHotelForDepts, setSelectedHotelForDepts] = useState('');
  const [selectedHotelUsrSystemCompanyId, setSelectedHotelUsrSystemCompanyId] = useState('');
  const [availableDepts, setAvailableDepts] = useState<string[]>([]);
  const [selectedDepts, setSelectedDepts] = useState<
    { tenant: string; hotelName: string; deptName: string }[]
  >([]);

  // ── Loader / error ─────────────────────────────────────────────────────
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');
  const [loadingTenants, setLoadingTenants] = useState(false);
  const [loadingHotels, setLoadingHotels] = useState(false);
  const [loadingDepts, setLoadingDepts] = useState(false);

  // ── Populate form when opening ─────────────────────────────────────────
  useEffect(() => {
    if (!open) return;
    setError('');
    setSaving(false);
    setPassword('');
    if (user) {
      setFirstName(user.firstName);
      setLastName(user.lastName);
      setEmail(user.email);
      setRole(user.role as Role);
      setTenants(user.tenants.map((t) => t.tenant));
      setSelectedHotels(user.hotels.map((h) => ({ tenant: h.tenant, hotelName: h.hotelName })));
      setSelectedDepts(
        user.departments.map((d) => ({
          tenant: d.tenant,
          hotelName: d.hotelName,
          deptName: d.deptName,
        })),
      );
    } else {
      setFirstName('');
      setLastName('');
      setEmail('');
      setRole('DeptAdmin');
      setTenants([]);
      setSelectedHotels([]);
      setSelectedDepts([]);
    }
    setSelectedTenant('');
    setSelectedHotelForDepts('');
    setSelectedHotelUsrSystemCompanyId('');
    setAvailableHotels([]);
    setAvailableDepts([]);
  }, [open, user]);

  // ── Fetch tenants when modal opens with a non-SuperAdmin role ──────────
  useEffect(() => {
    if (!open || role === 'SuperAdmin') return;
    let cancelled = false;
    const fetchTenants = async () => {
      setLoadingTenants(true);
      try {
        const res = await fetch('/api/tenants');
        if (!res.ok) throw new Error('Failed to fetch tenants');
        const data: string[] = await res.json();
        if (!cancelled) setAvailableTenants(data);
      } catch {
        if (!cancelled) setAvailableTenants([]);
      } finally {
        if (!cancelled) setLoadingTenants(false);
      }
    };
    fetchTenants();
    return () => {
      cancelled = true;
    };
  }, [open, role]);

  // ── Fetch hotels when a tenant is selected (for HotelAdmin / DeptAdmin) ─
  const fetchHotels = useCallback(async (tenant: string) => {
    if (!tenant) {
      setAvailableHotels([]);
      return;
    }
    setLoadingHotels(true);
    try {
      const res = await fetch(`/api/hotels/${encodeURIComponent(tenant)}`);
      if (!res.ok) throw new Error('Failed to fetch hotels');
      const data: HotelOption[] = await res.json();
      setAvailableHotels(data);
    } catch {
      setAvailableHotels([]);
    } finally {
      setLoadingHotels(false);
    }
  }, []);

  useEffect(() => {
    if (role === 'HotelAdmin' || role === 'DeptAdmin') {
      fetchHotels(selectedTenant);
    }
  }, [selectedTenant, role, fetchHotels]);

  // ── Fetch departments when a hotel is selected (DeptAdmin) ─────────────
  const fetchDepartments = useCallback(async (hotelName: string, usrSystemCompanyId: string) => {
    if (!hotelName || !usrSystemCompanyId) {
      setAvailableDepts([]);
      return;
    }
    setLoadingDepts(true);
    try {
      const params = new URLSearchParams({ hotel: hotelName, usrSystemCompanyId });
      const res = await fetch(`/api/departments?${params.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch departments');
      const data: string[] = await res.json();
      setAvailableDepts(data);
    } catch {
      setAvailableDepts([]);
    } finally {
      setLoadingDepts(false);
    }
  }, []);

  useEffect(() => {
    if (role === 'DeptAdmin') {
      fetchDepartments(selectedHotelForDepts, selectedHotelUsrSystemCompanyId);
    }
  }, [selectedHotelForDepts, selectedHotelUsrSystemCompanyId, role, fetchDepartments]);

  // ── Tenant checkbox toggle (CompanyAdmin) ──────────────────────────────
  const toggleTenant = (t: string) => {
    setTenants((prev) => (prev.includes(t) ? prev.filter((x) => x !== t) : [...prev, t]));
  };

  // ── Hotel checkbox toggle (HotelAdmin) ─────────────────────────────────
  const toggleHotel = (tenant: string, hotelName: string) => {
    setSelectedHotels((prev) => {
      const exists = prev.some((h) => h.tenant === tenant && h.hotelName === hotelName);
      if (exists) return prev.filter((h) => !(h.tenant === tenant && h.hotelName === hotelName));
      return [...prev, { tenant, hotelName }];
    });
  };

  // ── Dept checkbox toggle (DeptAdmin) ───────────────────────────────────
  const toggleDept = (tenant: string, hotelName: string, deptName: string) => {
    setSelectedDepts((prev) => {
      const exists = prev.some(
        (d) => d.tenant === tenant && d.hotelName === hotelName && d.deptName === deptName,
      );
      if (exists)
        return prev.filter(
          (d) => !(d.tenant === tenant && d.hotelName === hotelName && d.deptName === deptName),
        );
      return [...prev, { tenant, hotelName, deptName }];
    });
  };

  // ── Submit ─────────────────────────────────────────────────────────────
  const handleSave = async () => {
    setError('');
    if (!firstName.trim() || !lastName.trim() || !email.trim()) {
      setError('First name, last name and email are required.');
      return;
    }
    if (!isEdit && !password) {
      setError('Password is required for new users.');
      return;
    }

    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        firstName: firstName.trim(),
        lastName: lastName.trim(),
        email: email.trim().toLowerCase(),
        role,
        tenants: role === 'CompanyAdmin' ? tenants : [],
        hotels: role === 'HotelAdmin' ? selectedHotels : [],
        departments: role === 'DeptAdmin' ? selectedDepts : [],
      };
      if (password) {
        body.password = password;
      }

      const url = isEdit ? `/api/users/${user.userId}` : '/api/users';
      const method = isEdit ? 'PUT' : 'POST';

      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error ?? `Failed to ${isEdit ? 'update' : 'create'} user`);
      }

      toast.success(isEdit ? 'User updated.' : 'User created.');
      onSaved();
      onClose();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'An unexpected error occurred');
    } finally {
      setSaving(false);
    }
  };

  // ── Render ─────────────────────────────────────────────────────────────
  const footer = (
    <>
      <button
        onClick={onClose}
        className="bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600 px-4 py-2 rounded-lg text-sm font-medium"
      >
        Cancel
      </button>
      <button
        onClick={handleSave}
        disabled={saving}
        className="bg-blue-600 text-white hover:bg-blue-700 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
      >
        {saving ? 'Saving...' : isEdit ? 'Update User' : 'Create User'}
      </button>
    </>
  );

  return (
    <Modal
      isOpen={open}
      onClose={onClose}
      title={isEdit ? 'Edit User' : 'Create User'}
      size="lg"
      footer={footer}
    >
      {error && (
        <div className="p-3 bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-400 rounded-lg text-sm mb-4">
          {error}
        </div>
      )}

      <div className="space-y-4">
        {/* Name row */}
        <div className="grid grid-cols-2 gap-4">
          <div>
            <label className={labelCls}>First Name</label>
            <input
              type="text"
              value={firstName}
              onChange={(e) => setFirstName(e.target.value)}
              className={inputCls}
              placeholder="First name"
            />
          </div>
          <div>
            <label className={labelCls}>Last Name</label>
            <input
              type="text"
              value={lastName}
              onChange={(e) => setLastName(e.target.value)}
              className={inputCls}
              placeholder="Last name"
            />
          </div>
        </div>

        {/* Email */}
        <div>
          <label className={labelCls}>Email</label>
          <input
            type="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputCls}
            placeholder="user@example.com"
          />
        </div>

        {/* Password */}
        <div>
          <label className={labelCls}>
            {isEdit ? 'Password (leave blank to keep current)' : 'Password'}
          </label>
          <input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputCls}
            placeholder={isEdit ? 'Leave blank to keep current' : 'Enter password'}
          />
        </div>

        {/* Role */}
        <div>
          <label className={labelCls}>Role</label>
          <select
            value={role}
            onChange={(e) => setRole(e.target.value as Role)}
            className={inputCls}
          >
            {ROLES.map((r) => (
              <option key={r.value} value={r.value}>
                {r.label}
              </option>
            ))}
          </select>
        </div>

        {/* ── Assignment section ─────────────────────────────────────── */}
        {role !== 'SuperAdmin' && (
          <div className="border-t border-gray-200 dark:border-slate-700 pt-4">
            <h3 className="text-sm font-semibold text-gray-900 dark:text-white mb-3">
              Assignments
            </h3>

            {loadingTenants ? (
              <div className="flex justify-center py-6">
                <div className="animate-spin rounded-full h-6 w-6 border-b-2 border-blue-600" />
              </div>
            ) : (
              <>
                {/* CompanyAdmin: tenant checkboxes */}
                {role === 'CompanyAdmin' && (
                  <div>
                    <label className={labelCls}>Tenants</label>
                    {availableTenants.length === 0 ? (
                      <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                        No tenants available.
                      </p>
                    ) : (
                      <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border border-gray-200 dark:border-slate-600 rounded-lg">
                        {availableTenants.map((t) => (
                          <label
                            key={t}
                            className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
                          >
                            <input
                              type="checkbox"
                              checked={tenants.includes(t)}
                              onChange={() => toggleTenant(t)}
                              className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                            />
                            {t}
                          </label>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* HotelAdmin: tenant dropdown -> hotel checkboxes */}
                {role === 'HotelAdmin' && (
                  <div className="space-y-3">
                    <div>
                      <label className={labelCls}>Tenant</label>
                      <select
                        value={selectedTenant}
                        onChange={(e) => setSelectedTenant(e.target.value)}
                        className={inputCls}
                      >
                        <option value="">Select tenant...</option>
                        {availableTenants.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedTenant && (
                      <div>
                        <label className={labelCls}>Hotels</label>
                        {loadingHotels ? (
                          <div className="flex justify-center py-4">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
                          </div>
                        ) : availableHotels.length === 0 ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                            No hotels found for this tenant.
                          </p>
                        ) : (
                          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border border-gray-200 dark:border-slate-600 rounded-lg">
                            {availableHotels.map((h) => (
                              <label
                                key={h.hotelName}
                                className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedHotels.some(
                                    (sh) =>
                                      sh.tenant === selectedTenant && sh.hotelName === h.hotelName,
                                  )}
                                  onChange={() => toggleHotel(selectedTenant, h.hotelName)}
                                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                {h.hotelName}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Show currently assigned hotels across all tenants */}
                    {selectedHotels.length > 0 && (
                      <div>
                        <label className={labelCls}>Assigned Hotels</label>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedHotels.map((h) => (
                            <span
                              key={`${h.tenant}-${h.hotelName}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-medium bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300"
                            >
                              {h.hotelName}
                              <button
                                type="button"
                                onClick={() => toggleHotel(h.tenant, h.hotelName)}
                                className="hover:text-purple-900 dark:hover:text-purple-100"
                              >
                                &times;
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}

                {/* DeptAdmin: tenant -> hotel -> department checkboxes */}
                {role === 'DeptAdmin' && (
                  <div className="space-y-3">
                    <div>
                      <label className={labelCls}>Tenant</label>
                      <select
                        value={selectedTenant}
                        onChange={(e) => {
                          setSelectedTenant(e.target.value);
                          setSelectedHotelForDepts('');
                          setSelectedHotelUsrSystemCompanyId('');
                          setAvailableDepts([]);
                        }}
                        className={inputCls}
                      >
                        <option value="">Select tenant...</option>
                        {availableTenants.map((t) => (
                          <option key={t} value={t}>
                            {t}
                          </option>
                        ))}
                      </select>
                    </div>

                    {selectedTenant && (
                      <div>
                        <label className={labelCls}>Hotel</label>
                        {loadingHotels ? (
                          <div className="flex justify-center py-4">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
                          </div>
                        ) : (
                          <select
                            value={selectedHotelForDepts}
                            onChange={(e) => {
                              const hotelName = e.target.value;
                              setSelectedHotelForDepts(hotelName);
                              const hotelOption = availableHotels.find(
                                (h) => h.hotelName === hotelName,
                              );
                              setSelectedHotelUsrSystemCompanyId(
                                hotelOption?.usrSystemCompanyId ?? '',
                              );
                            }}
                            className={inputCls}
                          >
                            <option value="">Select hotel...</option>
                            {availableHotels.map((h) => (
                              <option key={h.hotelName} value={h.hotelName}>
                                {h.hotelName}
                              </option>
                            ))}
                          </select>
                        )}
                      </div>
                    )}

                    {selectedHotelForDepts && (
                      <div>
                        <label className={labelCls}>Departments</label>
                        {loadingDepts ? (
                          <div className="flex justify-center py-4">
                            <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-600" />
                          </div>
                        ) : availableDepts.length === 0 ? (
                          <p className="text-sm text-gray-500 dark:text-gray-400 italic">
                            No departments found for this hotel.
                          </p>
                        ) : (
                          <div className="grid grid-cols-2 gap-2 max-h-48 overflow-y-auto p-2 border border-gray-200 dark:border-slate-600 rounded-lg">
                            {availableDepts.map((dept) => (
                              <label
                                key={dept}
                                className="flex items-center gap-2 text-sm text-gray-700 dark:text-gray-300 cursor-pointer"
                              >
                                <input
                                  type="checkbox"
                                  checked={selectedDepts.some(
                                    (d) =>
                                      d.tenant === selectedTenant &&
                                      d.hotelName === selectedHotelForDepts &&
                                      d.deptName === dept,
                                  )}
                                  onChange={() =>
                                    toggleDept(selectedTenant, selectedHotelForDepts, dept)
                                  }
                                  className="rounded border-gray-300 text-blue-600 focus:ring-blue-500"
                                />
                                {dept}
                              </label>
                            ))}
                          </div>
                        )}
                      </div>
                    )}

                    {/* Show currently assigned departments across all tenants/hotels */}
                    {selectedDepts.length > 0 && (
                      <div>
                        <label className={labelCls}>Assigned Departments</label>
                        <div className="flex flex-wrap gap-1.5">
                          {selectedDepts.map((d) => (
                            <span
                              key={`${d.tenant}-${d.hotelName}-${d.deptName}`}
                              className="inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-medium bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300"
                            >
                              {d.hotelName} / {d.deptName}
                              <button
                                type="button"
                                onClick={() => toggleDept(d.tenant, d.hotelName, d.deptName)}
                                className="hover:text-gray-900 dark:hover:text-gray-100"
                              >
                                &times;
                              </button>
                            </span>
                          ))}
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </>
            )}
          </div>
        )}
      </div>
    </Modal>
  );
}
