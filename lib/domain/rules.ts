import { z } from 'zod';

/** Parse "H:MM AM/PM" into minutes since midnight. Returns null on failure. */
function parseTimeToMinutes(timeStr: string): number | null {
  const match = timeStr.trim().match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;

  let hour = parseInt(match[1]!, 10);
  const minute = parseInt(match[2]!, 10);
  const period = match[3]!.toUpperCase();

  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;

  if (period === 'AM') {
    if (hour === 12) hour = 0;
  } else {
    if (hour !== 12) hour += 12;
  }

  return hour * 60 + minute;
}

/**
 * Hours between two clock-in/out strings ("H:MM AM/PM").
 * Handles overnight shifts (out < in wraps past midnight).
 * Returns null if either string cannot be parsed.
 * Same-start-end returns 0 (not 24).
 */
export function calcHours(clockIn: string, clockOut: string): number | null {
  const inMin = parseTimeToMinutes(clockIn);
  const outMin = parseTimeToMinutes(clockOut);
  if (inMin === null || outMin === null) return null;

  let diff = outMin - inMin;
  if (diff < 0) diff += 1440;

  return Math.round((diff / 60) * 100) / 100;
}

/**
 * Clean a raw department name from payroll data.
 * Splits by "/" and takes the middle section when there are 3+ parts.
 * Fixes known truncations: "Administrati" → "Administration",
 * "Comp Food*" → "Comp Food & Beverage".
 */
export function cleanDeptName(rawDept: string): string {
  const parts = rawDept.split('/');

  let name: string;
  if (parts.length >= 3) {
    name = parts[1]!.trim();
  } else {
    name = rawDept.trim();
  }

  if (name === 'Administrati') {
    name = 'Administration';
  } else if (name.startsWith('Comp Food')) {
    name = 'Comp Food & Beverage';
  }

  return name;
}

/**
 * Start hour (0–23) for a shift of the given length.
 *   >= 8 hours → 7 AM
 *   >= 6 hours → 8 AM
 *   otherwise  → 9 AM
 */
export function startTimeForShift(hours: number): number {
  if (hours >= 8) return 7;
  if (hours >= 6) return 8;
  return 9;
}

/**
 * Round hours to the nearest 0.25 h (15-minute increment).
 */
export function roundToQuarter(hours: number): number {
  return Math.round(hours * 4) / 4;
}

/**
 * Whether a DOW should be scheduled given the employee's average hours on that day.
 * Skips days averaging less than 0.5 h.
 */
export function shouldScheduleDow(avgHours: number): boolean {
  return avgHours >= 0.5;
}

const passwordSchema = z
  .string()
  .min(8, 'At least 8 characters')
  .regex(/[A-Z]/, 'At least one uppercase letter')
  .regex(/[0-9]/, 'At least one number')
  .regex(/[^A-Za-z0-9]/, 'At least one special character');

/**
 * Validate a password against the application policy.
 * Returns an empty array when the password is valid, or a list of ZodIssues
 * describing each violation when invalid.
 */
export function validatePassword(password: string): z.ZodIssue[] {
  const result = passwordSchema.safeParse(password);
  if (result.success) return [];
  return result.error.issues;
}
