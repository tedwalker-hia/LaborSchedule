'use client';

import { useState } from 'react';
import Link from 'next/link';
import { usePathname } from 'next/navigation';
import { useAuth } from '@/lib/auth-context';
import { Calendar, Users, ChevronLeft, ChevronRight } from 'lucide-react';

const navItems = [
  { href: '/schedule', label: 'Schedule', icon: Calendar },
  { href: '/users', label: 'Users', icon: Users },
];

export default function Sidebar() {
  const [isCollapsed, setIsCollapsed] = useState(false);
  const pathname = usePathname();
  const { user } = useAuth();

  if (!user) return null;

  return (
    <div
      className={`flex flex-col h-full bg-white dark:bg-slate-800 border-r border-gray-200 dark:border-slate-700 transition-all duration-200 ${isCollapsed ? 'w-16' : 'w-56'}`}
    >
      {/* Header */}
      <div className="flex items-center justify-between px-4 h-14 border-b border-gray-200 dark:border-slate-700">
        {!isCollapsed && (
          <span className="font-semibold text-gray-900 dark:text-white text-sm truncate">
            Labor Schedule
          </span>
        )}
        <button
          onClick={() => setIsCollapsed(!isCollapsed)}
          className="p-1 rounded hover:bg-gray-100 dark:hover:bg-slate-700 text-gray-500 dark:text-gray-400"
        >
          {isCollapsed ? <ChevronRight size={18} /> : <ChevronLeft size={18} />}
        </button>
      </div>

      {/* Nav items */}
      <nav className="flex-1 py-3 px-2 space-y-1">
        {navItems.map((item) => {
          const isActive = pathname.startsWith(item.href);
          const Icon = item.icon;
          return (
            <Link
              key={item.href}
              href={item.href}
              className={`flex items-center gap-3 px-3 py-2 rounded-lg text-sm font-medium transition-colors ${
                isActive
                  ? 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300'
                  : 'text-gray-600 dark:text-gray-400 hover:bg-gray-100 dark:hover:bg-slate-700'
              }`}
              title={isCollapsed ? item.label : undefined}
            >
              <Icon size={20} />
              {!isCollapsed && <span>{item.label}</span>}
            </Link>
          );
        })}
      </nav>
    </div>
  );
}
