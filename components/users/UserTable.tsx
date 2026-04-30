'use client';

import { Pencil, Trash2 } from 'lucide-react';
import Badge, { type BadgeColor } from '@/components/ui/Badge';
import DataTable, { type Column } from '@/components/ui/DataTable';

export interface UserRow {
  userId: number;
  firstName: string;
  lastName: string;
  email: string;
  role: string;
  isActive: boolean;
  tenants: { tenant: string }[];
  hotels: { tenant: string; hotelName: string }[];
  departments: { tenant: string; hotelName: string; deptName: string }[];
}

interface UserTableProps {
  users: UserRow[];
  onEdit: (user: UserRow) => void;
  onDelete: (user: UserRow) => void;
}

const roleColors: Record<string, BadgeColor> = {
  SuperAdmin: 'blue',
  CompanyAdmin: 'green',
  HotelAdmin: 'purple',
  DeptAdmin: 'gray',
};

export default function UserTable({ users, onEdit, onDelete }: UserTableProps) {
  const columns: Column<UserRow>[] = [
    {
      key: 'name',
      header: 'Name',
      render: (u) => (
        <span className="font-medium text-gray-900 dark:text-white">
          {u.firstName} {u.lastName}
        </span>
      ),
    },
    {
      key: 'email',
      header: 'Email',
      render: (u) => <span className="text-gray-600 dark:text-gray-300">{u.email}</span>,
    },
    {
      key: 'role',
      header: 'Role',
      render: (u) => <Badge color={roleColors[u.role] ?? 'gray'}>{u.role}</Badge>,
    },
    {
      key: 'status',
      header: 'Status',
      render: (u) => (
        <Badge color={u.isActive ? 'green' : 'red'}>{u.isActive ? 'Active' : 'Inactive'}</Badge>
      ),
    },
    {
      key: 'actions',
      header: 'Actions',
      align: 'right',
      render: (u) => (
        <div className="flex items-center justify-end gap-2">
          <button
            onClick={() => onEdit(u)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-blue-600 hover:bg-blue-50 dark:text-gray-400 dark:hover:text-blue-400 dark:hover:bg-blue-950 transition-colors"
            title="Edit user"
          >
            <Pencil size={16} />
          </button>
          <button
            onClick={() => onDelete(u)}
            className="p-1.5 rounded-lg text-gray-500 hover:text-red-600 hover:bg-red-50 dark:text-gray-400 dark:hover:text-red-400 dark:hover:bg-red-950 transition-colors"
            title="Delete user"
          >
            <Trash2 size={16} />
          </button>
        </div>
      ),
    },
  ];

  return (
    <DataTable
      columns={columns}
      rows={users}
      emptyText="No users found."
      getKey={(u) => u.userId}
    />
  );
}
