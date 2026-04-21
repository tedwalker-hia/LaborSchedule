/**
 * Schedule utility functions — TypeScript port of Python labor scheduling logic.
 */

/**
 * Format an hour (0–23) and minute into "H:MM AM/PM" with no leading zero on the hour.
 */
export function formatTime(hour: number, minute: number): string {
  const period = hour < 12 ? "AM" : "PM";
  let displayHour = hour % 12;
  if (displayHour === 0) displayHour = 12;
  const mm = minute.toString().padStart(2, "0");
  return `${displayHour}:${mm} ${period}`;
}

/**
 * Parse a time string like "7:00 AM" or "3:15 PM" into minutes since midnight.
 * Returns null if the string cannot be parsed.
 */
export function parseTimeToMinutes(timeStr: string): number | null {
  const trimmed = timeStr.trim();
  const match = trimmed.match(/^(\d{1,2}):(\d{2})\s*(AM|PM)$/i);
  if (!match) return null;

  let hour = parseInt(match[1], 10);
  const minute = parseInt(match[2], 10);
  const period = match[3].toUpperCase();

  if (hour < 1 || hour > 12 || minute < 0 || minute > 59) return null;

  if (period === "AM") {
    if (hour === 12) hour = 0;
  } else {
    if (hour !== 12) hour += 12;
  }

  return hour * 60 + minute;
}

/**
 * Calculate the number of hours between two clock-in/out time strings.
 * Handles overnight shifts (clock-out earlier than clock-in wraps past midnight).
 * Returns hours rounded to 2 decimal places, or null if parsing fails.
 */
export function calcHours(clockIn: string, clockOut: string): number | null {
  const inMinutes = parseTimeToMinutes(clockIn);
  const outMinutes = parseTimeToMinutes(clockOut);
  if (inMinutes === null || outMinutes === null) return null;

  let diff = outMinutes - inMinutes;
  if (diff < 0) diff += 1440;

  return Math.round((diff / 60) * 100) / 100;
}

/**
 * Generate clock-in and clock-out time strings for a given number of hours.
 * Hours are rounded to the nearest 15-minute increment.
 * Start time is chosen based on shift length:
 *   >= 8 hours  → 7:00 AM
 *   >= 6 hours  → 8:00 AM
 *   otherwise   → 9:00 AM
 * Returns null if hours is not a positive number.
 */
export function generateClockTimes(
  hours: number
): { clockIn: string; clockOut: string } | null {
  if (!hours || hours <= 0) return null;

  // Round to nearest 15 minutes
  const totalMinutes = Math.round((hours * 60) / 15) * 15;
  if (totalMinutes <= 0) return null;

  let startHour: number;
  if (hours >= 8) {
    startHour = 7;
  } else if (hours >= 6) {
    startHour = 8;
  } else {
    startHour = 9;
  }

  const startMinutes = startHour * 60;
  const endMinutes = (startMinutes + totalMinutes) % 1440;

  const endHour = Math.floor(endMinutes / 60);
  const endMinute = endMinutes % 60;

  const clockIn = formatTime(startHour, 0);
  const clockOut = formatTime(endHour, endMinute);

  return { clockIn, clockOut };
}

/**
 * Clean a raw department name.
 * - Splits by "/" and takes the middle section if there are 3+ parts.
 * - Fixes known truncations/abbreviations.
 */
export function cleanDeptName(rawDept: string): string {
  const parts = rawDept.split("/");

  let name: string;
  if (parts.length >= 3) {
    name = parts[1].trim();
  } else {
    name = rawDept.trim();
  }

  // Fix known truncations
  if (name === "Administrati") {
    name = "Administration";
  } else if (name.startsWith("Comp Food")) {
    name = "Comp Food & Beverage";
  }

  return name;
}

/**
 * Array of 96 time strings in 15-minute increments from 12:00 AM to 11:45 PM.
 */
export const TIME_OPTIONS: string[] = (() => {
  const options: string[] = [];
  for (let h = 0; h < 24; h++) {
    for (let m = 0; m < 60; m += 15) {
      options.push(formatTime(h, m));
    }
  }
  return options;
})();
