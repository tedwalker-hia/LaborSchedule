import type { ReactNode } from 'react';

export interface Column<T> {
  key: string;
  header: string;
  align?: 'left' | 'right' | 'center';
  render: (row: T) => ReactNode;
}

interface DataTableProps<T> {
  columns: Column<T>[];
  rows: T[];
  emptyText?: string;
  getKey: (row: T) => string | number;
}

const alignClass: Record<NonNullable<Column<unknown>['align']>, string> = {
  left: 'text-left',
  right: 'text-right',
  center: 'text-center',
};

export default function DataTable<T>({
  columns,
  rows,
  emptyText = 'No records found.',
  getKey,
}: DataTableProps<T>) {
  return (
    <div className="bg-white dark:bg-slate-800 rounded-xl shadow-sm border border-gray-200 dark:border-slate-700 overflow-hidden">
      <div className="overflow-x-auto">
        <table className="w-full">
          <thead className="bg-gray-50 dark:bg-slate-700">
            <tr>
              {columns.map((col) => (
                <th
                  key={col.key}
                  className={`${alignClass[col.align ?? 'left']} px-6 py-3 text-xs font-medium text-gray-500 dark:text-gray-400 uppercase tracking-wider`}
                >
                  {col.header}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-200 dark:divide-slate-700">
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={columns.length}
                  className="px-6 py-12 text-center text-sm text-gray-500 dark:text-gray-400"
                >
                  {emptyText}
                </td>
              </tr>
            ) : (
              rows.map((row) => (
                <tr
                  key={getKey(row)}
                  className="hover:bg-gray-50 dark:hover:bg-slate-750 transition-colors"
                >
                  {columns.map((col) => (
                    <td
                      key={col.key}
                      className={`${alignClass[col.align ?? 'left']} px-6 py-4 text-sm whitespace-nowrap`}
                    >
                      {col.render(row)}
                    </td>
                  ))}
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
