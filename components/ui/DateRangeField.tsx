'use client';

import DateField from '@/components/ui/DateField';

interface DateRangeFieldProps {
  startValue: string;
  endValue: string;
  onStartChange: (v: string) => void;
  onEndChange: (v: string) => void;
  startLabel?: string;
  endLabel?: string;
  label?: string;
  disabled?: boolean;
  className?: string;
  labelClassName?: string;
}

export default function DateRangeField({
  startValue,
  endValue,
  onStartChange,
  onEndChange,
  startLabel = 'Start Date',
  endLabel = 'End Date',
  label,
  disabled,
  className,
  labelClassName,
}: DateRangeFieldProps) {
  return (
    <div className={className}>
      {label && <h3 className="text-sm font-medium text-gray-700 mb-2">{label}</h3>}
      <div className="grid grid-cols-2 gap-4">
        <DateField
          label={startLabel}
          value={startValue}
          onChange={onStartChange}
          disabled={disabled}
          labelClassName={labelClassName}
        />
        <DateField
          label={endLabel}
          value={endValue}
          onChange={onEndChange}
          disabled={disabled}
          labelClassName={labelClassName}
        />
      </div>
    </div>
  );
}
