'use client';

import { AuthProvider } from '@/lib/auth-context';
import { ThemeProvider } from '@/lib/theme-provider';
import { SelectedHotelProvider } from '@/lib/selected-hotel-context';
import TopNavigation from '@/components/navigation/TopNavigation';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <AuthProvider>
      <ThemeProvider>
        <SelectedHotelProvider>
          <div className="flex flex-col h-screen overflow-hidden">
            <TopNavigation />
            <main className="flex-1 overflow-y-auto bg-gray-50 dark:bg-slate-900 p-6">
              {children}
            </main>
          </div>
        </SelectedHotelProvider>
      </ThemeProvider>
    </AuthProvider>
  );
}
