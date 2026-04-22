/** Clock-in / clock-out pair for a single work shift. */
export interface Shift {
  clockIn: string;
  clockOut: string;
}

/** Domain representation of a single LaborSchedule row. */
export interface ScheduleRow {
  id?: number;
  usrSystemCompanyId: string;
  branchId?: number | null;
  hotelName?: string | null;
  employeeCode: string;
  firstName?: string | null;
  lastName?: string | null;
  scheduleDate: Date;
  clockIn?: string | null;
  clockOut?: string | null;
  hours?: number | null;
  tenant?: string | null;
  deptName?: string | null;
  multiDept?: boolean | null;
  positionName?: string | null;
  locked?: boolean | null;
}

/** Per-employee work-pattern summary derived from payroll history. */
export interface EmployeeHistory {
  /** 0 = Monday … 6 = Sunday (Monday-based) → average hours worked */
  avgByDow: Record<number, number>;
  /** Days the employee typically works, sorted by frequency descending */
  workDays: number[];
  avgWeeklyHours: number;
  totalDaysWorked: number;
  avgDailyHours: number;
  deptName?: string;
  positionName?: string;
}

/** Application RBAC roles, ordered highest to lowest privilege. */
export type Role = 'SuperAdmin' | 'CompanyAdmin' | 'HotelAdmin' | 'DeptAdmin';

/**
 * Access scope for a user.
 * `unlimited: true` means no restrictions (SuperAdmin).
 * Explicit empty arrays mean no access — not unlimited.
 */
export type Scope =
  | { unlimited: true }
  | {
      unlimited?: false;
      tenants: string[];
      hotels: {
        tenant: string;
        hotelName: string;
        usrSystemCompanyId: string | null;
        branchId: number | null;
      }[];
      departments: { tenant: string; hotelName: string; deptName: string }[];
    };
