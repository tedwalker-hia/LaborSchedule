import type { Metadata } from 'next';
import { cookies } from 'next/headers';
import { Toaster } from 'react-hot-toast';
import { CSRF_COOKIE } from '@/lib/csrf';
import './globals.css';

export async function generateMetadata(): Promise<Metadata> {
  const jar = await cookies();
  const csrfToken = jar.get(CSRF_COOKIE)?.value;
  return {
    title: 'Labor Schedule Editor',
    description: 'Labor scheduling and management system',
    ...(csrfToken ? { other: { csrf: csrfToken } } : {}),
  };
}

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
