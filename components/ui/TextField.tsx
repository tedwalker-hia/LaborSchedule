'use client';

import { useId } from 'react';

type TextFieldType = 'text' | 'email' | 'password' | 'number';

interface TextFieldProps {
  label: string;
  type?: TextFieldType;
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
  step?: string | number;
  disabled?: boolean;
  autoComplete?: string;
  required?: boolean;
  autoFocus?: boolean;
  id?: string;
  className?: string;
}

const inputCls =
  'w-full border border-gray-300 dark:border-slate-600 bg-white dark:bg-slate-700 text-gray-900 dark:text-white rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500';

const labelCls = 'block text-sm font-medium text-gray-700 dark:text-gray-300 mb-1';

export default function TextField({
  label,
  type = 'text',
  value,
  onChange,
  placeholder,
  step,
  disabled,
  autoComplete,
  required,
  autoFocus,
  id,
  className,
}: TextFieldProps) {
  const generatedId = useId();
  const inputId = id ?? generatedId;

  return (
    <div className={className}>
      <label htmlFor={inputId} className={labelCls}>
        {label}
      </label>
      <input
        id={inputId}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        step={step}
        disabled={disabled}
        autoComplete={autoComplete}
        required={required}
        autoFocus={autoFocus}
        className={inputCls}
      />
    </div>
  );
}
