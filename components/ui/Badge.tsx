import type { ReactNode } from 'react';

export type BadgeColor = 'blue' | 'green' | 'purple' | 'gray' | 'red';

const colorMap: Record<BadgeColor, string> = {
  blue: 'bg-blue-100 text-blue-700 dark:bg-blue-900 dark:text-blue-300',
  green: 'bg-green-100 text-green-700 dark:bg-green-900 dark:text-green-300',
  purple: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
  gray: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
  red: 'bg-red-100 text-red-700 dark:bg-red-900 dark:text-red-300',
};

interface BadgeProps {
  color: BadgeColor;
  children: ReactNode;
}

export default function Badge({ color, children }: BadgeProps) {
  return (
    <span
      className={`inline-flex items-center px-2 py-0.5 text-xs rounded-full font-medium ${colorMap[color]}`}
    >
      {children}
    </span>
  );
}
