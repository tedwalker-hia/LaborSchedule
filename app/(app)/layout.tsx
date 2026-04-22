'use client';

import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from '@/lib/theme-provider';
import Sidebar from '@/components/navigation/Sidebar';
import TopNavigation from '@/components/navigation/TopNavigation';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ThemeProvider>
        <div className="flex h-screen overflow-hidden">
          <Sidebar />
          <div className="flex flex-col flex-1 min-w-0 overflow-hidden">
            <TopNavigation />
            <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-slate-900 p-6">
              {children}
            </main>
          </div>
        </div>
      </ThemeProvider>
    </AuthProvider>
  );
}
