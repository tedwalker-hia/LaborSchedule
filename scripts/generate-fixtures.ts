/**
 * Generates 20 synthetic Excel schedule fixtures for tests/fixtures/excel/.
 * Run: node --experimental-strip-types scripts/generate-fixtures.ts
 *
 * Each workbook matches the format expected by lib/excel/parser.ts:
 *   Row 1: Name | Code | Dept | Position | Total | [DateHdr every 3 cols]
 *   Row 2: (sub) In | Out | Hrs per date group
 *   Row 3+: Employee rows
 *
 * Times use "H:MM AM/PM" format compatible with calcHours() in lib/domain/rules.ts.
 */

import * as ExcelJS from 'exceljs';
import * as fs from 'fs';
import * as path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const OUT_DIR = path.join(__dirname, '..', 'tests', 'fixtures', 'excel');

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface Shift {
  clockIn: string;
  clockOut: string;
  hours: number;
}

interface EmployeeSchedule {
  code: string;
  name: string; // "LastName, FirstName"
  dept: string;
  position: string;
  shifts: (Shift | null)[]; // index = day offset from weekStart; null = day off
}

interface FixtureSpec {
  filename: string;
  hotel: string;
  tenant: string;
  weekStart: Date; // Monday of the week
  numDays: number; // number of date columns
  employees: EmployeeSchedule[];
}

// ---------------------------------------------------------------------------
// Shift presets
// ---------------------------------------------------------------------------

const S = {
  std: { clockIn: '8:00 AM', clockOut: '4:00 PM', hours: 8 },
  morning: { clockIn: '6:00 AM', clockOut: '2:00 PM', hours: 8 },
  evening: { clockIn: '2:00 PM', clockOut: '10:00 PM', hours: 8 },
  overnight: { clockIn: '10:00 PM', clockOut: '6:00 AM', hours: 8 },
  parttime: { clockIn: '9:00 AM', clockOut: '1:00 PM', hours: 4 },
  brunch: { clockIn: '10:00 AM', clockOut: '4:00 PM', hours: 6 },
  long: { clockIn: '7:00 AM', clockOut: '7:00 PM', hours: 12 },
  audit: { clockIn: '11:00 PM', clockOut: '7:00 AM', hours: 8 },
  short: { clockIn: '11:00 AM', clockOut: '3:00 PM', hours: 4 },
  split: { clockIn: '7:00 AM', clockOut: '3:00 PM', hours: 8 },
} satisfies Record<string, Shift>;

// ---------------------------------------------------------------------------
// Helper: build date from parts
// ---------------------------------------------------------------------------

function d(year: number, month: number, day: number): Date {
  return new Date(Date.UTC(year, month - 1, day));
}

// ---------------------------------------------------------------------------
// Helper: format date as Excel header "Mon DD"
// ---------------------------------------------------------------------------

const MONTH_ABBR = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

function fmtDateHeader(date: Date): string {
  const m = MONTH_ABBR[date.getUTCMonth()];
  const day = date.getUTCDate().toString().padStart(2, '0');
  return `${m} ${day}`;
}

function addDays(date: Date, n: number): Date {
  return new Date(date.getTime() + n * 86400000);
}

// ---------------------------------------------------------------------------
// Fixture specs — 20 workbooks covering varied scenarios
// ---------------------------------------------------------------------------

// Common employee pools by property
const alphaFnB = (shifts7: (Shift | null)[][]): EmployeeSchedule[] => [
  { code: 'ALPHA-001', name: 'Smith, John',       dept: 'F&B',          position: 'Server',       shifts: shifts7[0]! },
  { code: 'ALPHA-002', name: 'Johnson, Mary',     dept: 'F&B',          position: 'Bartender',    shifts: shifts7[1]! },
  { code: 'ALPHA-003', name: 'Williams, Robert',  dept: 'F&B',          position: 'Host',         shifts: shifts7[2]! },
  { code: 'ALPHA-004', name: 'Brown, Patricia',   dept: 'F&B',          position: 'Busser',       shifts: shifts7[3]! },
  { code: 'ALPHA-005', name: 'Jones, Michael',    dept: 'Housekeeping', position: 'Room Attendant', shifts: shifts7[4]! },
  { code: 'ALPHA-006', name: 'Garcia, Linda',     dept: 'Housekeeping', position: 'Laundry',      shifts: shifts7[5]! },
  { code: 'ALPHA-007', name: 'Martinez, David',   dept: 'Maintenance',  position: 'Engineer',     shifts: shifts7[6]! },
  { code: 'ALPHA-008', name: 'Rodriguez, Barbara',dept: 'F&B',          position: 'Server',       shifts: shifts7[7]! },
];

const betaFrontDesk = (shifts7: (Shift | null)[][]): EmployeeSchedule[] => [
  { code: 'BETA-001', name: 'Wilson, Richard',   dept: 'Front Desk',   position: 'Agent',       shifts: shifts7[0]! },
  { code: 'BETA-002', name: 'Anderson, Maria',   dept: 'Front Desk',   position: 'Supervisor',  shifts: shifts7[1]! },
  { code: 'BETA-003', name: 'Taylor, Charles',   dept: 'Concierge',    position: 'Concierge',   shifts: shifts7[2]! },
  { code: 'BETA-004', name: 'Thomas, Susan',     dept: 'Front Desk',   position: 'Agent',       shifts: shifts7[3]! },
  { code: 'BETA-005', name: 'Jackson, Joseph',   dept: 'Front Desk',   position: 'Night Audit', shifts: shifts7[4]! },
  { code: 'BETA-006', name: 'White, Karen',      dept: 'Housekeeping', position: 'Inspector',   shifts: shifts7[5]! },
];

// Repeat pattern across days
function repeat<T>(val: T, n: number): T[] {
  return Array(n).fill(val);
}

// 7-day pattern: work Mon-Fri, off Sat-Sun
const weekdays = (s: Shift): (Shift | null)[] => [s, s, s, s, s, null, null];
// work all 7
const allWeek = (s: Shift): (Shift | null)[] => repeat(s, 7);
// off Mon, work Tue-Sun (rotational)
const rotA = (s: Shift): (Shift | null)[] => [null, s, s, s, s, s, s];
// work Wed-Sun, off Mon-Tue
const rotB = (s: Shift): (Shift | null)[] => [null, null, s, s, s, s, s];
// work Mon-Sat, off Sun
const sixDay = (s: Shift): (Shift | null)[] => [s, s, s, s, s, s, null];
// sparse: work Mon, Wed, Fri only
const sparse = (s: Shift): (Shift | null)[] => [s, null, s, null, s, null, null];
// weekend only: Fri-Sun
const weekendOnly = (s: Shift): (Shift | null)[] => [null, null, null, null, s, s, s];

const specs: FixtureSpec[] = [
  // -------------------------------------------------------------------------
  // WB01 — Alpha Hotel, F&B standard week (Jan 6-12, 2026)
  // -------------------------------------------------------------------------
  {
    filename: 'wb-2026-w02-alpha-fnb.xlsx',
    hotel: 'Alpha Hotel',
    tenant: 'ALPHA-CORP',
    weekStart: d(2026, 1, 6),
    numDays: 7,
    employees: alphaFnB([
      weekdays(S.std), weekdays(S.std), sixDay(S.std), weekdays(S.std),
      weekdays(S.morning), weekdays(S.morning), weekdays(S.std), rotA(S.std),
    ]),
  },

  // -------------------------------------------------------------------------
  // WB02 — Alpha Hotel, F&B with weekend peak (Jan 13-19, 2026)
  // -------------------------------------------------------------------------
  {
    filename: 'wb-2026-w03-alpha-fnb.xlsx',
    hotel: 'Alpha Hotel',
    tenant: 'ALPHA-CORP',
    weekStart: d(2026, 1, 13),
    numDays: 7,
    employees: alphaFnB([
      weekdays(S.std), rotA(S.std), allWeek(S.std), weekdays(S.std),
      rotB(S.morning), sixDay(S.morning), weekdays(S.std), allWeek(S.evening),
    ]),
  },

  // -------------------------------------------------------------------------
  // WB03 — Beta Hotel, Front Desk standard (Jan 20-26, 2026)
  // -------------------------------------------------------------------------
  {
    filename: 'wb-2026-w04-beta-frontdesk.xlsx',
    hotel: 'Beta Hotel',
    tenant: 'BETA-CORP',
    weekStart: d(2026, 1, 20),
    numDays: 7,
    employees: betaFrontDesk([
      weekdays(S.std), sixDay(S.std), allWeek(S.std), weekdays(S.std),
      allWeek(S.audit), rotB(S.std),
    ]),
  },

  // -------------------------------------------------------------------------
  // WB04 — Beta Hotel, Jan 27-Feb 2 (month boundary)
  // -------------------------------------------------------------------------
  {
    filename: 'wb-2026-w05-beta-frontdesk.xlsx',
    hotel: 'Beta Hotel',
    tenant: 'BETA-CORP',
    weekStart: d(2026, 1, 27),
    numDays: 7,
    employees: betaFrontDesk([
      allWeek(S.std), weekdays(S.std), sixDay(S.std), rotA(S.std),
      allWeek(S.overnight), weekdays(S.std),
    ]),
  },

  // -------------------------------------------------------------------------
  // WB05 — Gamma Resort, multi-dept (Feb 3-9, 2026)
  // -------------------------------------------------------------------------
  {
    filename: 'wb-2026-w06-gamma-multi.xlsx',
    hotel: 'Gamma Resort',
    tenant: 'GAMMA-RESORTS',
    weekStart: d(2026, 2, 3),
    numDays: 7,
    employees: [
      { code: 'GAMMA-001', name: 'Thompson, Kevin',   dept: 'F&B',          position: 'Server',         shifts: weekdays(S.std) },
      { code: 'GAMMA-002', name: 'Garcia, Nancy',     dept: 'F&B',          position: 'Bartender',      shifts: rotA(S.std) },
      { code: 'GAMMA-003', name: 'Martinez, Brian',   dept: 'Housekeeping', position: 'Room Attendant', shifts: weekdays(S.morning) },
      { code: 'GAMMA-004', name: 'Robinson, Dorothy', dept: 'F&B',          position: 'Host',           shifts: sixDay(S.std) },
      { code: 'GAMMA-005', name: 'Clark, Edward',     dept: 'Maintenance',  position: 'Engineer',       shifts: weekdays(S.std) },
      { code: 'GAMMA-006', name: 'Rodriguez, Ashley', dept: 'Housekeeping', position: 'Laundry',        shifts: weekdays(S.morning) },
      { code: 'GAMMA-007', name: 'Lewis, Daniel',     dept: 'F&B',          position: 'Server',         shifts: allWeek(S.evening) },
      { code: 'GAMMA-008', name: 'Lee, Jessica',      dept: 'F&B',          position: 'Busser',         shifts: weekdays(S.std) },
      { code: 'GAMMA-009', name: 'Walker, Ryan',      dept: 'Maintenance',  position: 'Engineer',       shifts: weekdays(S.std) },
      { code: 'GAMMA-010', name: 'Hall, Sarah',       dept: 'F&B',          position: 'Bartender',      shifts: rotB(S.evening) },
    ],
  },

  // -------------------------------------------------------------------------
  // WB06 — Alpha Hotel, overnight shifts (Feb 10-16, 2026)
  // -------------------------------------------------------------------------
  {
    filename: 'wb-2026-w07-alpha-overnight.xlsx',
    hotel: 'Alpha Hotel',
    tenant: 'ALPHA-CORP',
    weekStart: d(2026, 2, 10),
    numDays: 7,
    employees: [
      { code: 'ALPHA-001', name: 'Smith, John',       dept: 'F&B',          position: 'Server',         shifts: weekdays(S.std) },
      { code: 'ALPHA-002', name: 'Johnson, Mary',     dept: 'F&B',          position: 'Bartender',      shifts: weekdays(S.evening) },
      { code: 'ALPHA-003', name: 'Williams, Robert',  dept: 'F&B',          position: 'Host',           shifts: allWeek(S.overnight) },
      { code: 'ALPHA-005', name: 'Jones, Michael',    dept: 'Housekeeping', position: 'Room Attendant', shifts: weekdays(S.morning) },
      { code: 'ALPHA-007', name: 'Martinez, David',   dept: 'Maintenance',  position: 'Engineer',       shifts: weekdays(S.std) },
    ],
  },

  // -------------------------------------------------------------------------
  // WB07 — Alpha Hotel, Presidents Day week (Feb 17-23, 2026)
  // -------------------------------------------------------------------------
  {
    filename: 'wb-2026-w08-alpha-fnb.xlsx',
    hotel: 'Alpha Hotel',
    tenant: 'ALPHA-CORP',
    weekStart: d(2026, 2, 17),
    numDays: 7,
    employees: alphaFnB([
      allWeek(S.std), weekdays(S.std), sixDay(S.brunch), allWeek(S.std),
      weekdays(S.morning), rotA(S.morning), weekdays(S.std), allWeek(S.evening),
    ]),
  },

  // -------------------------------------------------------------------------
  // WB08 — Beta Hotel, housekeeping sparse (Feb 24-Mar 2, 2026)
  // -------------------------------------------------------------------------
  {
    filename: 'wb-2026-w09-beta-housekeeping.xlsx',
    hotel: 'Beta Hotel',
    tenant: 'BETA-CORP',
    weekStart: d(2026, 2, 24),
    numDays: 7,
    employees: [
      { code: 'BETA-006', name: 'White, Karen',       dept: 'Housekeeping', position: 'Inspector',      shifts: weekdays(S.morning) },
      { code: 'BETA-007', name: 'Harris, Thomas',     dept: 'Housekeeping', position: 'Room Attendant', shifts: sparse(S.morning) },
      { code: 'BETA-008', name: 'Martin, Sandra',     dept: 'Housekeeping', position: 'Room Attendant', shifts: rotB(S.morning) },
      { code: 'BETA-001', name: 'Wilson, Richard',    dept: 'Front Desk',   position: 'Agent',          shifts: weekdays(S.std) },
      { code: 'BETA-002', name: 'Anderson, Maria',    dept: 'Front Desk',   position: 'Supervisor',     shifts: weekdays(S.std) },
      { code: 'BETA-005', name: 'Jackson, Joseph',    dept: 'Front Desk',   position: 'Night Audit',    shifts: allWeek(S.audit) },
      { code: 'BETA-004', name: 'Thomas, Susan',      dept: 'Front Desk',   position: 'Agent',          shifts: sparse(S.std) },
    ],
  },

  // -------------------------------------------------------------------------
  // WB09 — Gamma Resort, large roster (Mar 3-9, 2026)
  // -------------------------------------------------------------------------
  {
    filename: 'wb-2026-w10-gamma-large.xlsx',
    hotel: 'Gamma Resort',
    tenant: 'GAMMA-RESORTS',
    weekStart: d(2026, 3, 3),
    numDays: 7,
    employees: [
      { code: 'GAMMA-001', name: 'Thompson, Kevin',   dept: 'F&B',          position: 'Server',         shifts: weekdays(S.std) },
      { code: 'GAMMA-002', name: 'Garcia, Nancy',     dept: 'F&B',          position: 'Bartender',      shifts: allWeek(S.evening) },
      { code: 'GAMMA-003', name: 'Martinez, Brian',   dept: 'Housekeeping', position: 'Room Attendant', shifts: weekdays(S.morning) },
      { code: 'GAMMA-004', name: 'Robinson, Dorothy', dept: 'F&B',          position: 'Host',           shifts: sixDay(S.std) },
      { code: 'GAMMA-005', name: 'Clark, Edward',     dept: 'Maintenance',  position: 'Engineer',       shifts: weekdays(S.std) },
      { code: 'GAMMA-006', name: 'Rodriguez, Ashley', dept: 'Housekeeping', position: 'Laundry',        shifts: weekdays(S.morning) },
      { code: 'GAMMA-007', name: 'Lewis, Daniel',     dept: 'F&B',          position: 'Server',         shifts: rotA(S.std) },
      { code: 'GAMMA-008', name: 'Lee, Jessica',      dept: 'F&B',          position: 'Busser',         shifts: allWeek(S.std) },
      { code: 'GAMMA-009', name: 'Walker, Ryan',      dept: 'Maintenance',  position: 'Engineer',       shifts: weekdays(S.std) },
      { code: 'GAMMA-010', name: 'Hall, Sarah',       dept: 'F&B',          position: 'Bartender',      shifts: weekendOnly(S.evening) },
      { code: 'GAMMA-011', name: 'Allen, James',      dept: 'Housekeeping', position: 'Inspector',      shifts: weekdays(S.morning) },
      { code: 'GAMMA-012', name: 'Young, Emily',      dept: 'F&B',          position: 'Server',         shifts: weekdays(S.evening) },
    ],
  },

  // -------------------------------------------------------------------------
  // WB10 — Alpha Hotel, part-time only (Mar 10-16, 2026)
  // -------------------------------------------------------------------------
  {
    filename: 'wb-2026-w11-alpha-parttime.xlsx',
    hotel: 'Alpha Hotel',
    tenant: 'ALPHA-CORP',
    weekStart: d(2026, 3, 10),
    numDays: 7,
    employees: [
      { code: 'ALPHA-PT1', name: 'Evans, Carol',     dept: 'F&B',          position: 'Server',         shifts: weekdays(S.parttime) },
      { code: 'ALPHA-PT2', name: 'Turner, James',    dept: 'F&B',          position: 'Busser',         shifts: sparse(S.parttime) },
      { code: 'ALPHA-PT3', name: 'Phillips, Lisa',   dept: 'Housekeeping', position: 'Room Attendant', shifts: weekdays(S.parttime) },
      { code: 'ALPHA-PT4', name: 'Campbell, Mark',   dept: 'F&B',          position: 'Host',           shifts: weekendOnly(S.parttime) },
    ],
  },

  // -------------------------------------------------------------------------
  // WB11 — Beta Hotel, morning shifts (Mar 17-23, 2026)
  // -------------------------------------------------------------------------
  {
    filename: 'wb-2026-w12-beta-morning.xlsx',
    hotel: 'Beta Hotel',
    tenant: 'BETA-CORP',
    weekStart: d(2026, 3, 17),
    numDays: 7,
    employees: betaFrontDesk([
      allWeek(S.morning), weekdays(S.morning), sixDay(S.morning), rotA(S.morning),
      allWeek(S.audit), rotB(S.morning),
    ]),
  },

  // -------------------------------------------------------------------------
  // WB12 — Gamma Resort, evening shifts (Mar 24-30, 2026)
  // -------------------------------------------------------------------------
  {
    filename: 'wb-2026-w13-gamma-evening.xlsx',
    hotel: 'Gamma Resort',
    tenant: 'GAMMA-RESORTS',
    weekStart: d(2026, 3, 24),
    numDays: 7,
    employees: [
      { code: 'GAMMA-001', name: 'Thompson, Kevin',   dept: 'F&B',          position: 'Server',         shifts: allWeek(S.evening) },
      { code: 'GAMMA-002', name: 'Garcia, Nancy',     dept: 'F&B',          position: 'Bartender',      shifts: allWeek(S.evening) },
      { code: 'GAMMA-004', name: 'Robinson, Dorothy', dept: 'F&B',          position: 'Host',           shifts: weekdays(S.evening) },
      { code: 'GAMMA-007', name: 'Lewis, Daniel',     dept: 'F&B',          position: 'Server',         shifts: rotA(S.evening) },
      { code: 'GAMMA-008', name: 'Lee, Jessica',      dept: 'F&B',          position: 'Busser',         shifts: sixDay(S.evening) },
      { code: 'GAMMA-010', name: 'Hall, Sarah',       dept: 'F&B',          position: 'Bartender',      shifts: allWeek(S.evening) },
      { code: 'GAMMA-012', name: 'Young, Emily',      dept: 'F&B',          position: 'Server',         shifts: weekdays(S.evening) },
      { code: 'GAMMA-003', name: 'Martinez, Brian',   dept: 'Housekeeping', position: 'Room Attendant', shifts: weekdays(S.morning) },
      { code: 'GAMMA-006', name: 'Rodriguez, Ashley', dept: 'Housekeeping', position: 'Laundry',        shifts: rotB(S.morning) },
    ],
  },

  // -------------------------------------------------------------------------
  // WB13 — Alpha Hotel, multi-position employees (Mar 31-Apr 6, 2026)
  // Employee appears twice in same sheet with different positions (cross-trained)
  // -------------------------------------------------------------------------
  {
    filename: 'wb-2026-w14-alpha-multipos.xlsx',
    hotel: 'Alpha Hotel',
    tenant: 'ALPHA-CORP',
    weekStart: d(2026, 3, 31),
    numDays: 7,
    employees: [
      // Smith appears twice: Server Mon-Wed, Bartender Thu-Sun
      { code: 'ALPHA-001', name: 'Smith, John',       dept: 'F&B', position: 'Server',    shifts: [S.std, S.std, S.std, null, null, null, null] },
      { code: 'ALPHA-001', name: 'Smith, John',       dept: 'F&B', position: 'Bartender', shifts: [null, null, null, S.std, S.std, S.std, null] },
      { code: 'ALPHA-002', name: 'Johnson, Mary',     dept: 'F&B', position: 'Bartender', shifts: weekdays(S.std) },
      { code: 'ALPHA-003', name: 'Williams, Robert',  dept: 'F&B', position: 'Host',      shifts: sixDay(S.std) },
      // Garcia cross-trained: Housekeeping + Maintenance
      { code: 'ALPHA-006', name: 'Garcia, Linda',     dept: 'Housekeeping', position: 'Room Attendant', shifts: [S.morning, S.morning, S.morning, null, null, null, null] },
      { code: 'ALPHA-006', name: 'Garcia, Linda',     dept: 'Maintenance',  position: 'Engineer',       shifts: [null, null, null, S.std, S.std, null, null] },
      { code: 'ALPHA-007', name: 'Martinez, David',   dept: 'Maintenance',  position: 'Engineer',       shifts: weekdays(S.std) },
    ],
  },

  // -------------------------------------------------------------------------
  // WB14 — Delta Inn, dense 15-employee week (Apr 7-13, 2026)
  // -------------------------------------------------------------------------
  {
    filename: 'wb-2026-w15-delta-dense.xlsx',
    hotel: 'Delta Inn',
    tenant: 'DELTA-HOSPITALITY',
    weekStart: d(2026, 4, 7),
    numDays: 7,
    employees: [
      { code: 'DELTA-001', name: 'Hernandez, Christopher', dept: 'F&B',          position: 'Server',         shifts: allWeek(S.std) },
      { code: 'DELTA-002', name: 'King, Amanda',           dept: 'F&B',          position: 'Bartender',      shifts: allWeek(S.evening) },
      { code: 'DELTA-003', name: 'Wright, Matthew',        dept: 'Front Desk',   position: 'Agent',          shifts: weekdays(S.std) },
      { code: 'DELTA-004', name: 'Lopez, Stephanie',       dept: 'Housekeeping', position: 'Room Attendant', shifts: weekdays(S.morning) },
      { code: 'DELTA-005', name: 'Hill, Anthony',          dept: 'F&B',          position: 'Host',           shifts: sixDay(S.std) },
      { code: 'DELTA-006', name: 'Scott, Dorothy',         dept: 'F&B',          position: 'Busser',         shifts: allWeek(S.std) },
      { code: 'DELTA-007', name: 'Green, Mark',            dept: 'Maintenance',  position: 'Engineer',       shifts: weekdays(S.std) },
      { code: 'DELTA-008', name: 'Adams, Rebecca',         dept: 'Front Desk',   position: 'Supervisor',     shifts: weekdays(S.std) },
      { code: 'DELTA-009', name: 'Baker, Donald',          dept: 'F&B',          position: 'Server',         shifts: rotA(S.std) },
      { code: 'DELTA-010', name: 'Gonzalez, Sharon',       dept: 'Housekeeping', position: 'Room Attendant', shifts: rotB(S.morning) },
      { code: 'DELTA-011', name: 'Nelson, Joshua',         dept: 'F&B',          position: 'Bartender',      shifts: weekendOnly(S.evening) },
      { code: 'DELTA-012', name: 'Carter, Amy',            dept: 'Front Desk',   position: 'Agent',          shifts: allWeek(S.audit) },
      { code: 'DELTA-013', name: 'Mitchell, Kenneth',      dept: 'Maintenance',  position: 'Engineer',       shifts: weekdays(S.std) },
      { code: 'DELTA-014', name: 'Perez, Anna',            dept: 'F&B',          position: 'Server',         shifts: allWeek(S.evening) },
      { code: 'DELTA-015', name: 'Roberts, Scott',         dept: 'Housekeeping', position: 'Inspector',      shifts: weekdays(S.morning) },
    ],
  },

  // -------------------------------------------------------------------------
  // WB15 — Delta Inn, lean 3-employee week (Apr 14-20, 2026)
  // -------------------------------------------------------------------------
  {
    filename: 'wb-2026-w16-delta-lean.xlsx',
    hotel: 'Delta Inn',
    tenant: 'DELTA-HOSPITALITY',
    weekStart: d(2026, 4, 14),
    numDays: 5, // Mon-Fri only
    employees: [
      { code: 'DELTA-003', name: 'Wright, Matthew',  dept: 'Front Desk',  position: 'Agent',     shifts: [S.std, S.std, S.std, S.std, S.std] },
      { code: 'DELTA-007', name: 'Green, Mark',      dept: 'Maintenance', position: 'Engineer',  shifts: [S.std, S.std, S.std, S.std, S.std] },
      { code: 'DELTA-008', name: 'Adams, Rebecca',   dept: 'Front Desk',  position: 'Supervisor',shifts: [S.std, null, S.std, null, S.std] },
    ],
  },

  // -------------------------------------------------------------------------
  // WB16 — Alpha Hotel, Thanksgiving week (Nov 24-30, 2025)
  // -------------------------------------------------------------------------
  {
    filename: 'wb-2025-w48-alpha-thanksgiving.xlsx',
    hotel: 'Alpha Hotel',
    tenant: 'ALPHA-CORP',
    weekStart: d(2025, 11, 24),
    numDays: 7,
    employees: alphaFnB([
      allWeek(S.std), allWeek(S.std), allWeek(S.brunch), allWeek(S.std),
      allWeek(S.morning), rotA(S.morning), weekdays(S.std), allWeek(S.long),
    ]),
  },

  // -------------------------------------------------------------------------
  // WB17 — Beta Hotel, Dec 1-7, 2025
  // -------------------------------------------------------------------------
  {
    filename: 'wb-2025-w49-beta-frontdesk.xlsx',
    hotel: 'Beta Hotel',
    tenant: 'BETA-CORP',
    weekStart: d(2025, 12, 1),
    numDays: 7,
    employees: betaFrontDesk([
      weekdays(S.std), sixDay(S.std), allWeek(S.std), weekdays(S.std),
      allWeek(S.overnight), weekdays(S.morning),
    ]),
  },

  // -------------------------------------------------------------------------
  // WB18 — Gamma Resort, Dec 8-14, 2025
  // -------------------------------------------------------------------------
  {
    filename: 'wb-2025-w50-gamma-multi.xlsx',
    hotel: 'Gamma Resort',
    tenant: 'GAMMA-RESORTS',
    weekStart: d(2025, 12, 8),
    numDays: 7,
    employees: [
      { code: 'GAMMA-001', name: 'Thompson, Kevin',   dept: 'F&B',          position: 'Server',         shifts: allWeek(S.std) },
      { code: 'GAMMA-002', name: 'Garcia, Nancy',     dept: 'F&B',          position: 'Bartender',      shifts: allWeek(S.evening) },
      { code: 'GAMMA-003', name: 'Martinez, Brian',   dept: 'Housekeeping', position: 'Room Attendant', shifts: weekdays(S.morning) },
      { code: 'GAMMA-004', name: 'Robinson, Dorothy', dept: 'F&B',          position: 'Host',           shifts: sixDay(S.std) },
      { code: 'GAMMA-005', name: 'Clark, Edward',     dept: 'Maintenance',  position: 'Engineer',       shifts: weekdays(S.std) },
      { code: 'GAMMA-006', name: 'Rodriguez, Ashley', dept: 'Housekeeping', position: 'Laundry',        shifts: weekdays(S.morning) },
      { code: 'GAMMA-007', name: 'Lewis, Daniel',     dept: 'F&B',          position: 'Server',         shifts: rotA(S.std) },
      { code: 'GAMMA-008', name: 'Lee, Jessica',      dept: 'F&B',          position: 'Busser',         shifts: weekdays(S.std) },
      { code: 'GAMMA-009', name: 'Walker, Ryan',      dept: 'Maintenance',  position: 'Engineer',       shifts: sparse(S.std) },
      { code: 'GAMMA-010', name: 'Hall, Sarah',       dept: 'F&B',          position: 'Bartender',      shifts: weekendOnly(S.evening) },
    ],
  },

  // -------------------------------------------------------------------------
  // WB19 — Delta Inn, holiday dense (Dec 22-28, 2025)
  // -------------------------------------------------------------------------
  {
    filename: 'wb-2025-w52-delta-holiday.xlsx',
    hotel: 'Delta Inn',
    tenant: 'DELTA-HOSPITALITY',
    weekStart: d(2025, 12, 22),
    numDays: 7,
    employees: [
      { code: 'DELTA-001', name: 'Hernandez, Christopher', dept: 'F&B',          position: 'Server',         shifts: allWeek(S.std) },
      { code: 'DELTA-002', name: 'King, Amanda',           dept: 'F&B',          position: 'Bartender',      shifts: allWeek(S.evening) },
      { code: 'DELTA-003', name: 'Wright, Matthew',        dept: 'Front Desk',   position: 'Agent',          shifts: allWeek(S.std) },
      { code: 'DELTA-004', name: 'Lopez, Stephanie',       dept: 'Housekeeping', position: 'Room Attendant', shifts: allWeek(S.morning) },
      { code: 'DELTA-005', name: 'Hill, Anthony',          dept: 'F&B',          position: 'Host',           shifts: allWeek(S.std) },
      { code: 'DELTA-006', name: 'Scott, Dorothy',         dept: 'F&B',          position: 'Busser',         shifts: allWeek(S.std) },
      { code: 'DELTA-007', name: 'Green, Mark',            dept: 'Maintenance',  position: 'Engineer',       shifts: allWeek(S.std) },
      { code: 'DELTA-008', name: 'Adams, Rebecca',         dept: 'Front Desk',   position: 'Supervisor',     shifts: allWeek(S.std) },
      { code: 'DELTA-009', name: 'Baker, Donald',          dept: 'F&B',          position: 'Server',         shifts: allWeek(S.std) },
      { code: 'DELTA-010', name: 'Gonzalez, Sharon',       dept: 'Housekeeping', position: 'Room Attendant', shifts: allWeek(S.morning) },
      { code: 'DELTA-011', name: 'Nelson, Joshua',         dept: 'F&B',          position: 'Bartender',      shifts: allWeek(S.evening) },
      { code: 'DELTA-012', name: 'Carter, Amy',            dept: 'Front Desk',   position: 'Agent',          shifts: allWeek(S.audit) },
    ],
  },

  // -------------------------------------------------------------------------
  // WB20 — Alpha Hotel, year boundary + overnight (Dec 29, 2025 - Jan 4, 2026)
  // -------------------------------------------------------------------------
  {
    filename: 'wb-2025-w53-alpha-yearboundary.xlsx',
    hotel: 'Alpha Hotel',
    tenant: 'ALPHA-CORP',
    weekStart: d(2025, 12, 29),
    numDays: 7,
    employees: [
      { code: 'ALPHA-001', name: 'Smith, John',       dept: 'F&B',          position: 'Server',         shifts: allWeek(S.std) },
      { code: 'ALPHA-002', name: 'Johnson, Mary',     dept: 'F&B',          position: 'Bartender',      shifts: allWeek(S.evening) },
      { code: 'ALPHA-003', name: 'Williams, Robert',  dept: 'F&B',          position: 'Host',           shifts: allWeek(S.overnight) },
      { code: 'ALPHA-005', name: 'Jones, Michael',    dept: 'Housekeeping', position: 'Room Attendant', shifts: sixDay(S.morning) },
      { code: 'ALPHA-007', name: 'Martinez, David',   dept: 'Maintenance',  position: 'Engineer',       shifts: weekdays(S.std) },
    ],
  },
];

// ---------------------------------------------------------------------------
// Workbook builder
// ---------------------------------------------------------------------------

async function buildWorkbook(spec: FixtureSpec): Promise<void> {
  const wb = new ExcelJS.Workbook();
  const ws = wb.addWorksheet('Schedule');

  // Row 1 — fixed column headers
  ws.getCell(1, 1).value = 'Name';
  ws.getCell(1, 2).value = 'Code';
  ws.getCell(1, 3).value = 'Dept';
  ws.getCell(1, 4).value = 'Position';
  ws.getCell(1, 5).value = 'Total';

  // Row 1 — date headers (col 6, 9, 12, …)
  // Row 2 — sub-headers (In/Out/Hrs per date group)
  for (let di = 0; di < spec.numDays; di++) {
    const date = addDays(spec.weekStart, di);
    const baseCol = 6 + di * 3;
    ws.getCell(1, baseCol).value = fmtDateHeader(date);
    ws.getCell(2, baseCol).value = 'In';
    ws.getCell(2, baseCol + 1).value = 'Out';
    ws.getCell(2, baseCol + 2).value = 'Hrs';
  }

  // Row 3+ — employee rows
  for (let ei = 0; ei < spec.employees.length; ei++) {
    const emp = spec.employees[ei]!;
    const row = 3 + ei;

    ws.getCell(row, 1).value = emp.name;
    ws.getCell(row, 2).value = emp.code;
    ws.getCell(row, 3).value = emp.dept;
    ws.getCell(row, 4).value = emp.position;

    let totalHours = 0;
    for (let di = 0; di < spec.numDays; di++) {
      const shift = emp.shifts[di] ?? null;
      const baseCol = 6 + di * 3;
      if (shift) {
        ws.getCell(row, baseCol).value = shift.clockIn;
        ws.getCell(row, baseCol + 1).value = shift.clockOut;
        ws.getCell(row, baseCol + 2).value = shift.hours;
        totalHours += shift.hours;
      }
    }

    ws.getCell(row, 5).value = totalHours > 0 ? totalHours : null;
  }

  const outPath = path.join(OUT_DIR, spec.filename);
  await wb.xlsx.writeFile(outPath);
  console.log(`  written: ${spec.filename} (${spec.employees.length} employees, ${spec.numDays} days)`);
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function main() {
  fs.mkdirSync(OUT_DIR, { recursive: true });
  fs.mkdirSync(path.join(OUT_DIR, 'baselines'), { recursive: true });

  console.log(`Generating ${specs.length} fixture workbooks → ${OUT_DIR}`);
  for (const spec of specs) {
    await buildWorkbook(spec);
  }
  console.log('Done.');
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
