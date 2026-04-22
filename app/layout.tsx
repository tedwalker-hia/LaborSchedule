import type { Metadata } from 'next';
import { Toaster } from 'react-hot-toast';
import './globals.css';

export const metadata: Metadata = {
  title: 'Labor Schedule Editor',
  description: 'Labor scheduling and management system',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className="bg-gray-50 dark:bg-slate-900 text-gray-900 dark:text-slate-100 antialiased">
        {children}
        <Toaster position="top-right" />
      </body>
    </html>
  );
}
