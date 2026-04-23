'use client';

import Spinner from '@/components/ui/Spinner';

interface Employee {
  code: string;
  firstName: string;
  lastName: string;
  deptName: string;
}

interface EmployeeCheckboxListProps {
  employees: Employee[];
  selected: Set<string>;
  onToggle: (code: string) => void;
  onToggleAll: (codes: string[]) => void;
  label?: string;
  loading?: boolean;
  maxHeight?: string;
  labelClassName?: string;
  showCode?: boolean;
}

export default function EmployeeCheckboxList({
  employees,
  selected,
  onToggle,
  onToggleAll,
  label = 'Employees',
  loading = false,
  maxHeight = 'max-h-64',
  labelClassName = 'text-sm font-medium text-gray-700',
  showCode = false,
}: EmployeeCheckboxListProps) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <h3 className={labelClassName}>
          {label} ({selected.size}/{employees.length})
        </h3>
        <button
          onClick={() => onToggleAll(employees.map((e) => e.code))}
          className="text-sm text-blue-600 hover:text-blue-800"
        >
          {selected.size === employees.length ? 'Deselect All' : 'Select All'}
        </button>
      </div>
      {loading ? (
        <div className="flex justify-center py-8">
          <Spinner />
        </div>
      ) : (
        <div
          className={`${maxHeight} overflow-y-auto border border-gray-200 rounded-lg divide-y divide-gray-100`}
        >
          {employees.map((emp) => (
            <label
              key={emp.code}
              className="flex items-center px-3 py-2 hover:bg-gray-50 cursor-pointer"
            >
              <input
                type="checkbox"
                checked={selected.has(emp.code)}
                onChange={() => onToggle(emp.code)}
                className="mr-3"
              />
              {showCode ? (
                <>
                  <div className="flex-1 min-w-0">
                    <span className="text-sm text-gray-800">
                      {emp.firstName} {emp.lastName}
                    </span>
                    <span className="text-xs text-gray-500 ml-2">{emp.code}</span>
                  </div>
                  <span className="text-xs text-gray-500 ml-2">{emp.deptName}</span>
                </>
              ) : (
                <>
                  <span className="text-sm text-gray-800">
                    {emp.firstName} {emp.lastName}
                  </span>
                  <span className="ml-auto text-xs text-gray-500">{emp.deptName}</span>
                </>
              )}
            </label>
          ))}
        </div>
      )}
    </div>
  );
}
