import type { ReactNode } from 'react';

export type ChipColor = 'purple' | 'gray';

const colorMap: Record<ChipColor, { base: string; removeHover: string }> = {
  purple: {
    base: 'bg-purple-100 text-purple-700 dark:bg-purple-900 dark:text-purple-300',
    removeHover: 'hover:text-purple-900 dark:hover:text-purple-100',
  },
  gray: {
    base: 'bg-gray-100 text-gray-700 dark:bg-gray-700 dark:text-gray-300',
    removeHover: 'hover:text-gray-900 dark:hover:text-gray-100',
  },
};

interface ChipProps {
  color: ChipColor;
  children: ReactNode;
  onRemove: () => void;
}

export default function Chip({ color, children, onRemove }: ChipProps) {
  const { base, removeHover } = colorMap[color];
  return (
    <span
      className={`inline-flex items-center gap-1 px-2 py-0.5 text-xs rounded-full font-medium ${base}`}
    >
      {children}
      <button type="button" onClick={onRemove} className={removeHover} aria-label="Remove">
        &times;
      </button>
    </span>
  );
}
