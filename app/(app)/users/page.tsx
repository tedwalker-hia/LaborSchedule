'use client';

import { useState, useEffect, useCallback } from 'react';
import { Plus } from 'lucide-react';
import toast from 'react-hot-toast';
import Modal from '@/components/ui/Modal';
import UserTable, { type UserRow } from '@/components/users/UserTable';
import UserModal from '@/components/users/UserModal';

export default function UsersPage() {
  const [users, setUsers] = useState<UserRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedUser, setSelectedUser] = useState<UserRow | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [deleteConfirm, setDeleteConfirm] = useState<{ userId: number; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  const fetchUsers = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/users');
      if (!res.ok) throw new Error('Failed to fetch users');
      const data: UserRow[] = await res.json();
      setUsers(data);
    } catch {
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  // ── Add user ───────────────────────────────────────────────────────────
  const handleAdd = () => {
    setSelectedUser(null);
    setModalOpen(true);
  };

  // ── Edit user ──────────────────────────────────────────────────────────
  const handleEdit = (user: UserRow) => {
    setSelectedUser(user);
    setModalOpen(true);
  };

  // ── Delete user ────────────────────────────────────────────────────────
  const handleDeleteRequest = (user: UserRow) => {
    setDeleteConfirm({ userId: user.userId, name: `${user.firstName} ${user.lastName}` });
  };

  const handleDeleteConfirm = async () => {
    if (!deleteConfirm) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/users/${deleteConfirm.userId}`, { method: 'DELETE' });
      if (!res.ok) {
        const body = await res.json().catch(() => ({}));
        throw new Error(body.error ?? 'Failed to delete user');
      }
      setDeleteConfirm(null);
      fetchUsers();
    } catch (err) {
      toast.error(err instanceof Error ? err.message : 'Failed to delete user');
    } finally {
      setDeleting(false);
    }
  };

  const handleDeleteCancel = () => {
    setDeleteConfirm(null);
  };

  // ── After modal save ──────────────────────────────────────────────────
  const handleSaved = () => {
    fetchUsers();
  };

  return (
    <div>
      {/* Header */}
      <div className="flex items-center justify-between mb-6">
        <h1 className="text-2xl font-bold text-gray-900 dark:text-white">User Management</h1>
        <button
          onClick={handleAdd}
          className="inline-flex items-center gap-1.5 px-4 py-2 text-sm font-medium rounded-lg border border-blue-500 bg-blue-600 text-white hover:bg-blue-700 transition-colors focus:outline-none focus:ring-2 focus:ring-offset-1 focus:ring-blue-500"
        >
          <Plus size={16} />
          Add User
        </button>
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex justify-center py-20">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600" />
        </div>
      ) : (
        <UserTable users={users} onEdit={handleEdit} onDelete={handleDeleteRequest} />
      )}

      {/* User create / edit modal */}
      <UserModal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        user={selectedUser}
        onSaved={handleSaved}
      />

      {/* Delete confirmation modal */}
      <Modal
        isOpen={deleteConfirm !== null}
        onClose={handleDeleteCancel}
        title="Delete User"
        size="sm"
        footer={
          <>
            <button
              onClick={handleDeleteCancel}
              className="bg-gray-100 text-gray-700 hover:bg-gray-200 dark:bg-slate-700 dark:text-gray-300 dark:hover:bg-slate-600 px-4 py-2 rounded-lg text-sm font-medium"
            >
              Cancel
            </button>
            <button
              onClick={handleDeleteConfirm}
              disabled={deleting}
              className="bg-red-600 text-white hover:bg-red-700 px-4 py-2 rounded-lg text-sm font-medium disabled:opacity-50"
            >
              {deleting ? 'Deleting...' : 'Delete'}
            </button>
          </>
        }
      >
        <div className="space-y-4">
          <p className="text-sm text-gray-700 dark:text-gray-300">
            Are you sure you want to deactivate{' '}
            <span className="font-semibold">{deleteConfirm?.name}</span>? This user will no longer
            be able to log in.
          </p>
          <div className="p-3 bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400 rounded-lg text-sm">
            This action can be reversed by a database administrator.
          </div>
        </div>
      </Modal>
    </div>
  );
}
