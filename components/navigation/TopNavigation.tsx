'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { useTheme } from '@/lib/theme-provider';
import { useSelectedHotel } from '@/lib/selected-hotel-context';
import { Calendar, Users, LogOut, Moon, Sun, Building2 } from 'lucide-react';

const navItems = [
  { href: '/schedule', label: 'Schedule', icon: Calendar },
  { href: '/users', label: 'Users', icon: Users },
];

export default function TopNavigation() {
  const { user, logout } = useAuth();
  const { isDark, toggle } = useTheme();
  const { hotelName } = useSelectedHotel();
  const pathname = usePathname();

  if (!user) return null;

  return (
    <div className="flex items-center justify-between h-14 px-6 bg-white dark:bg-slate-800 border-b border-gray-200 dark:border-slate-700">
      <div className="flex items-center gap-6">
        <span className="font-semibold text-gray-900 dark:text-white text-sm">Labor Schedule</span>
        <nav className="flex items-center gap-1">
          {navItems.map((item) => {
            const isActive = pathname.startsWith(item.href);
            const Icon = item.icon;
            return (
              <Link
                key={item.href}
                href={item.href}
                className={`flex items-center gap-2 px-3 py-1.5 rounded-lg text-sm font-medium transition-colors ${
                  isActive
                    ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                    : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700'
                }`}
              >
                <Icon size={16} />
                <span>{item.label}</span>
              </Link>
            );
          })}
        </nav>
      </div>

      <div className="flex items-center gap-4">
        <button
          onClick={toggle}
          className="p-2 rounded-lg hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400"
          title="Toggle theme"
        >
          {isDark ? <Sun size={18} /> : <Moon size={18} />}
        </button>

        {hotelName && (
          <span
            className="flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-gray-100 dark:bg-slate-700 text-sm text-gray-700 dark:text-gray-200"
            title="Currently viewing"
          >
            <Building2 size={14} className="text-gray-500 dark:text-gray-400" />
            <span className="font-medium whitespace-nowrap">{hotelName}</span>
          </span>
        )}

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
