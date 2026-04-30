'use client';

export type SpinnerSize = 'sm' | 'md';

const sizeClasses: Record<SpinnerSize, string> = {
  sm: 'h-5 w-5',
  md: 'h-8 w-8',
};

export default function Spinner({ size = 'md' }: { size?: SpinnerSize }) {
  return (
    <div
      className={`animate-spin rounded-full border-b-2 border-blue-600 ${sizeClasses[size]}`}
      role="status"
      aria-label="Loading"
    />
  );
}
