'use client';

import type { ReactNode } from 'react';

export type AlertVariant = 'error' | 'success' | 'warning' | 'info';

export interface AlertProps {
  variant?: AlertVariant;
  className?: string;
  children: ReactNode;
}

const variantClasses: Record<AlertVariant, string> = {
  error: 'bg-red-50 dark:bg-red-900/30 text-red-700 dark:text-red-300',
  success: 'bg-green-50 dark:bg-green-900/30 text-green-700 dark:text-green-300',
  warning: 'bg-yellow-50 dark:bg-yellow-900/20 text-yellow-700 dark:text-yellow-400',
  info: 'bg-blue-50 dark:bg-blue-900/30 text-blue-700 dark:text-blue-300',
};

const roleMap: Record<AlertVariant, string> = {
  error: 'alert',
  success: 'status',
  warning: 'alert',
  info: 'status',
};

export default function Alert({ variant = 'info', className, children }: AlertProps) {
  return (
    <div
      role={roleMap[variant]}
      className={['p-3 rounded-lg text-sm', variantClasses[variant], className]
        .filter(Boolean)
        .join(' ')}
    >
      {children}
    </div>
  );
}
