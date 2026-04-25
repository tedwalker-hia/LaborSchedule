'use client';

import { useState, memo, useMemo } from 'react';
import { format, parseISO, isWeekend, isBefore, startOfDay } from 'date-fns';
import { Lock } from 'lucide-react';
import { TIME_OPTIONS } from '@/lib/schedule-utils';

interface Employee {
  rowKey: string;
  code: string;
  firstName: string;
  lastName: string;
  deptName: string;
  multiDept: boolean;
  positionName: string;
}

interface ScheduleRecord {
  clockIn: string;
  clockOut: string;
  hours: number;
  locked: boolean;
}

interface ScheduleData {
  dates: string[];
  employees: Employee[];
  schedule: Record<string, Record<string, ScheduleRecord>>;
  allDepts: string[];
  allPositions: string[];
  positionsByDept: Record<string, string[]>;
}

interface ScheduleGridProps {
  data: ScheduleData;
  changes: Record<string, { clockIn?: string; clockOut?: string; hours?: number }>;
  selectedEmployees: Set<string>;
  recordChange: (rowKey: string, date: string, field: string, value: string) => void;
  toggleEmployee: (empCode: string) => void;
  getEffectiveValue: (rowKey: string, date: string, field: string) => string | number;
}

// ── Frozen column left offsets ──
// Checkbox(40) + Employee(180) + Code(80) + Dept(140) + Position(140) + TotalHrs(70)
const FROZEN_WIDTHS = {
  checkbox: 40,
  employee: 180,
  code: 80,
  dept: 140,
  position: 140,
  totalHrs: 70,
};

const FROZEN_LEFTS = {
  checkbox: 0,
  employee: FROZEN_WIDTHS.checkbox,
  code: FROZEN_WIDTHS.checkbox + FROZEN_WIDTHS.employee,
  dept: FROZEN_WIDTHS.checkbox + FROZEN_WIDTHS.employee + FROZEN_WIDTHS.code,
  position:
    FROZEN_WIDTHS.checkbox + FROZEN_WIDTHS.employee + FROZEN_WIDTHS.code + FROZEN_WIDTHS.dept,
  totalHrs:
    FROZEN_WIDTHS.checkbox +
    FROZEN_WIDTHS.employee +
    FROZEN_WIDTHS.code +
    FROZEN_WIDTHS.dept +
    FROZEN_WIDTHS.position,
};

// ── Shared cell class fragments ──
const HEADER_BASE =
  'px-2 py-2 text-xs font-medium text-gray-600 dark:text-gray-400 bg-gray-50 dark:bg-slate-700 border border-gray-200 dark:border-slate-600';
const BODY_BASE = 'px-2 py-1 border border-gray-200 dark:border-slate-600 whitespace-nowrap';
const FROZEN_BG = 'bg-white dark:bg-slate-800';

// ── TimeCell (click-to-edit) ──
function TimeCell({
  value,
  onChange,
  disabled,
  changed,
}: {
  value: string;
  onChange: (v: string) => void;
  disabled: boolean;
  changed: boolean;
}) {
  const [editing, setEditing] = useState(false);

  const bgClass = changed ? 'bg-yellow-50 dark:bg-yellow-900/20' : '';

  if (disabled) {
    return (
      <span className={`block w-full text-center text-xs text-gray-400 ${bgClass}`}>
        {value || '-'}
      </span>
    );
  }

  if (editing) {
    return (
      <select
        autoFocus
        value={value}
        onChange={(e) => {
          onChange(e.target.value);
          setEditing(false);
        }}
        onBlur={() => setEditing(false)}
        className="w-full text-xs border border-blue-400 rounded px-1 py-0.5 focus:outline-none focus:ring-1 focus:ring-blue-500 dark:bg-slate-700 dark:text-gray-200"
      >
        <option value="">--</option>
        {TIME_OPTIONS.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
    );
  }

  return (
    <span
      onClick={() => setEditing(true)}
      className={`block w-full text-center text-xs cursor-pointer hover:bg-gray-100 dark:hover:bg-slate-600 rounded px-1 py-0.5 ${bgClass}`}
    >
      {value || '-'}
    </span>
  );
}

// ── ScheduleRow (memoized) ──
interface ScheduleRowProps {
  emp: Employee;
  dates: string[];
  today: string;
  selected: boolean;
  changes: Record<string, { clockIn?: string; clockOut?: string; hours?: number }>;
  schedule: Record<string, ScheduleRecord>;
  allDepts: string[];
  positionsByDept: Record<string, string[]>;
  recordChange: (rowKey: string, date: string, field: string, value: string) => void;
  toggleEmployee: (empCode: string) => void;
  getEffectiveValue: (rowKey: string, date: string, field: string) => string | number;
}

const ScheduleRow = memo(function ScheduleRow({
  emp,
  dates,
  today,
  selected,
  changes,
  schedule,
  allDepts,
  positionsByDept,
  recordChange,
  toggleEmployee,
  getEffectiveValue,
}: ScheduleRowProps) {
  const todayDate = startOfDay(parseISO(today));

  // Compute total hours
  const totalHrs = dates.reduce((sum, date) => {
    const hrs = getEffectiveValue(emp.rowKey, date, 'hours');
    return sum + (typeof hrs === 'number' ? hrs : Number(hrs) || 0);
  }, 0);

  const frozenStickyBase = `sticky z-10 ${FROZEN_BG}`;

  return (
    <tr className={selected ? 'bg-blue-50/50 dark:bg-blue-900/10' : ''}>
      {/* Checkbox */}
      <td
        className={`${BODY_BASE} ${frozenStickyBase} text-center`}
        style={{ left: FROZEN_LEFTS.checkbox, minWidth: FROZEN_WIDTHS.checkbox }}
      >
        <input
          type="checkbox"
          checked={selected}
          onChange={() => toggleEmployee(emp.code)}
          className="rounded border-gray-300 dark:border-slate-500"
        />
      </td>

      {/* Employee name */}
      <td
        className={`${BODY_BASE} ${frozenStickyBase} font-medium text-gray-900 dark:text-gray-100`}
        style={{ left: FROZEN_LEFTS.employee, minWidth: FROZEN_WIDTHS.employee }}
      >
        <span>
          {emp.lastName}, {emp.firstName}
        </span>
        {emp.multiDept && (
          <span className="ml-1.5 inline-flex items-center rounded px-1 py-0.5 text-[10px] font-semibold bg-purple-100 text-purple-700 dark:bg-purple-800 dark:text-purple-200">
            MP
          </span>
        )}
      </td>

      {/* Code */}
      <td
        className={`${BODY_BASE} ${frozenStickyBase} text-gray-500 dark:text-gray-400`}
        style={{ left: FROZEN_LEFTS.code, minWidth: FROZEN_WIDTHS.code }}
      >
        {emp.code}
      </td>

      {/* Department */}
      <td
        className={`${BODY_BASE} ${frozenStickyBase} text-xs text-gray-700 dark:text-gray-300`}
        style={{ left: FROZEN_LEFTS.dept, minWidth: FROZEN_WIDTHS.dept }}
      >
        {emp.deptName}
      </td>

      {/* Position */}
      <td
        className={`${BODY_BASE} ${frozenStickyBase} text-xs text-gray-700 dark:text-gray-300`}
        style={{ left: FROZEN_LEFTS.position, minWidth: FROZEN_WIDTHS.position }}
      >
        {emp.positionName}
      </td>

      {/* Total Hours */}
      <td
        className={`${BODY_BASE} ${frozenStickyBase} text-right font-semibold text-gray-700 dark:text-gray-300`}
        style={{ left: FROZEN_LEFTS.totalHrs, minWidth: FROZEN_WIDTHS.totalHrs }}
      >
        {totalHrs.toFixed(2)}
      </td>

      {/* Date cells */}
      {dates.map((date) => {
        const parsed = parseISO(date);
        const isPast = isBefore(parsed, todayDate);
        const weekend = isWeekend(parsed);
        const record = schedule[date];
        const locked = record?.locked ?? false;
        const disabled = isPast || locked;

        const changeKey = `${emp.rowKey}|${date}`;
        const hasClockInChange = changes[changeKey]?.clockIn !== undefined;
        const hasClockOutChange = changes[changeKey]?.clockOut !== undefined;

        const clockIn = String(getEffectiveValue(emp.rowKey, date, 'clockIn') ?? '');
        const clockOut = String(getEffectiveValue(emp.rowKey, date, 'clockOut') ?? '');
        const hrs = getEffectiveValue(emp.rowKey, date, 'hours');

        const weekendBg = weekend ? 'bg-purple-50/50 dark:bg-purple-900/10' : '';

        return (
          <td key={date} colSpan={3} className={`${BODY_BASE} p-0 ${weekendBg}`}>
            <div className="flex">
              {/* In */}
              <div
                className={`flex-1 px-1 py-1 border-r border-gray-200 dark:border-slate-600 ${hasClockInChange ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}`}
                style={{ minWidth: 80 }}
              >
                {locked && <Lock className="inline-block w-3 h-3 mr-0.5 text-gray-400" />}
                <TimeCell
                  value={clockIn}
                  onChange={(v) => recordChange(emp.rowKey, date, 'clockIn', v)}
                  disabled={disabled}
                  changed={hasClockInChange}
                />
              </div>
              {/* Out */}
              <div
                className={`flex-1 px-1 py-1 border-r border-gray-200 dark:border-slate-600 ${hasClockOutChange ? 'bg-yellow-50 dark:bg-yellow-900/20' : ''}`}
                style={{ minWidth: 80 }}
              >
                <TimeCell
                  value={clockOut}
                  onChange={(v) => recordChange(emp.rowKey, date, 'clockOut', v)}
                  disabled={disabled}
                  changed={hasClockOutChange}
                />
              </div>
              {/* Hrs */}
              <div
                className="flex-none px-1 py-1 text-right text-xs text-gray-600 dark:text-gray-400"
                style={{ minWidth: 50 }}
              >
                {typeof hrs === 'number' ? hrs.toFixed(2) : hrs || '-'}
              </div>
            </div>
          </td>
        );
      })}
    </tr>
  );
});

// ── Main Grid ──
function ScheduleGrid({
  data,
  changes,
  selectedEmployees,
  recordChange,
  toggleEmployee,
  getEffectiveValue,
}: ScheduleGridProps) {
  const today = useMemo(() => new Date().toISOString().split('T')[0]!, []);
  const todayDate = useMemo(() => startOfDay(parseISO(today)), [today]);

  const frozenStickyHeader = `sticky z-30 ${HEADER_BASE}`;

  return (
    <div className="overflow-auto border rounded-xl bg-white dark:bg-slate-800 max-h-[calc(100vh-280px)]">
      <table className="w-full border-collapse text-sm">
        <thead className="sticky top-0 z-20">
          {/* Primary header row */}
          <tr>
            {/* Frozen header cells */}
            <th
              className={`${frozenStickyHeader}`}
              style={{ left: FROZEN_LEFTS.checkbox, minWidth: FROZEN_WIDTHS.checkbox }}
              rowSpan={2}
            >
              &nbsp;
            </th>
            <th
              className={`${frozenStickyHeader} text-left`}
              style={{ left: FROZEN_LEFTS.employee, minWidth: FROZEN_WIDTHS.employee }}
              rowSpan={2}
            >
              Employee
            </th>
            <th
              className={`${frozenStickyHeader} text-left`}
              style={{ left: FROZEN_LEFTS.code, minWidth: FROZEN_WIDTHS.code }}
              rowSpan={2}
            >
              Code
            </th>
            <th
              className={`${frozenStickyHeader} text-left`}
              style={{ left: FROZEN_LEFTS.dept, minWidth: FROZEN_WIDTHS.dept }}
              rowSpan={2}
            >
              Department
            </th>
            <th
              className={`${frozenStickyHeader} text-left`}
              style={{ left: FROZEN_LEFTS.position, minWidth: FROZEN_WIDTHS.position }}
              rowSpan={2}
            >
              Position
            </th>
            <th
              className={`${frozenStickyHeader} text-right`}
              style={{ left: FROZEN_LEFTS.totalHrs, minWidth: FROZEN_WIDTHS.totalHrs }}
              rowSpan={2}
            >
              Total Hrs
            </th>

            {/* Date headers */}
            {data.dates.map((date) => {
              const parsed = parseISO(date);
              const isPast = isBefore(parsed, todayDate);
              const weekend = isWeekend(parsed);

              let bgClass = '';
              if (isPast) bgClass = 'bg-amber-50 dark:bg-amber-900/20';
              else if (weekend) bgClass = 'bg-purple-50 dark:bg-purple-900/20';

              return (
                <th key={date} colSpan={3} className={`${HEADER_BASE} text-center ${bgClass}`}>
                  <span className="inline-flex items-center gap-1">
                    {format(parsed, 'MMM dd (EEE)')}
                    {isPast && (
                      <Lock
                        className="w-3 h-3 text-gray-400"
                        aria-label="Past date — read only"
                      />
                    )}
                  </span>
                </th>
              );
            })}
          </tr>

          {/* Sub-header row (In / Out / Hrs) */}
          <tr>
            {data.dates.map((date) => {
              const parsed = parseISO(date);
              const isPast = isBefore(parsed, todayDate);
              const weekend = isWeekend(parsed);

              let bgClass = '';
              if (isPast) bgClass = 'bg-amber-50 dark:bg-amber-900/20';
              else if (weekend) bgClass = 'bg-purple-50 dark:bg-purple-900/20';

              return (
                <th key={date} colSpan={3} className={`${HEADER_BASE} p-0 ${bgClass}`}>
                  <div className="flex text-[10px]">
                    <span
                      className="flex-1 px-1 py-1 text-center border-r border-gray-200 dark:border-slate-600"
                      style={{ minWidth: 80 }}
                    >
                      In
                    </span>
                    <span
                      className="flex-1 px-1 py-1 text-center border-r border-gray-200 dark:border-slate-600"
                      style={{ minWidth: 80 }}
                    >
                      Out
                    </span>
                    <span className="flex-none px-1 py-1 text-center" style={{ minWidth: 50 }}>
                      Hrs
                    </span>
                  </div>
                </th>
              );
            })}
          </tr>
        </thead>

        <tbody>
          {data.employees.map((emp) => (
            <ScheduleRow
              key={emp.rowKey}
              emp={emp}
              dates={data.dates}
              today={today}
              selected={selectedEmployees.has(emp.code)}
              changes={changes}
              schedule={data.schedule[emp.rowKey] ?? {}}
              allDepts={data.allDepts}
              positionsByDept={data.positionsByDept}
              recordChange={recordChange}
              toggleEmployee={toggleEmployee}
              getEffectiveValue={getEffectiveValue}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default ScheduleGrid;
