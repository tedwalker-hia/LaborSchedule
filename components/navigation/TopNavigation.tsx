'use client';

import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-provider';
import { LogOut, Moon, Sun } from 'lucide-react';

export default function TopNavigation() {
  const { user, logout } = useAuth();
  const { isDark, toggle } = useTheme();

  if (!user) return null;

  return (
    <div className="flex items-center justify-between h-14 px-6 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
      <div />
      <div className="flex items-center gap-4">
        <button
          onClick={toggle}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400"
          title="Toggle theme"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        <span className="text-sm text-gray-600 dark:text-gray-400">
          {user.firstName} {user.lastName}
          <span className="ml-2 px-2 py-0.5 text-xs rounded-full bg-blue-100 dark:bg-blue-900/40 text-blue-700 dark:text-blue-300">
            {user.role}
          </span>
        </span>

        <button
          onClick={logout}
          className="flex items-center gap-1.5 px-3 py-1.5 text-sm text-gray-600 dark:text-gray-400 hover:text-red-600 dark:hover:text-red-400 hover:bg-red-50 dark:hover:bg-red-900/20 rounded-lg transition-colors"
        >
          <LogOut size={16} />
          Logout
        </button>
      </div>
    </div>
  );
}
