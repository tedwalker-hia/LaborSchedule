'use client';

import { useId } from 'react';

interface DateFieldProps {
  label: string;
  value: string;
  onChange: (value: string) => void;
  disabled?: boolean;
  id?: string;
  className?: string;
  labelClassName?: string;
}

const inputCls =
  'w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

const defaultLabelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

export default function DateField({
  label,
  value,
  onChange,
  disabled,
  id,
  className,
  labelClassName,
}: DateFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={className}>
      <label htmlFor={inputId} className={labelClassName ?? defaultLabelCls}>
        {label}
      </label>
      <input
        id={inputId}
        type="date"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        disabled={disabled}
        className={inputCls}
      />
    </div>
  );
}
