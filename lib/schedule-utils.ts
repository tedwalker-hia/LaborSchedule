/**
 * Schedule utility functions — TypeScript port of Python labor scheduling logic.
 */

import { startTimeForShift, roundToQuarter } from '@/lib/domain/rules';

/**
 * Format an hour (0–23) and minute into "H:MM AM/PM" with no leading zero on the hour.
 */
export function formatTime(hour: number, minute: number): string {
  const period = hour < 12 ? 'AM' : 'PM';
  let displayHour = hour % 12;
  if (displayHour === 0) displayHour = 12;
  const mm = minute.toString().padStart(2, '0');
  return `${displayHour}:${mm} ${period}`;
}

/**
 * Generate clock-in and clock-out time strings for a given number of hours.
 * Returns null if hours is not a positive number.
 */
export function generateClockTimes(hours: number): { clockIn: string; clockOut: string } | null {
  if (!hours || hours <= 0) return null;

  const rounded = roundToQuarter(hours);
  const totalMinutes = Math.round(rounded * 60);
  if (totalMinutes <= 0) return null;

  const startHour = startTimeForShift(hours);
  const startMinutes = startHour * 60;
  const endMinutes = (startMinutes + totalMinutes) % 1440;

  const clockIn = formatTime(startHour, 0);
  const clockOut = formatTime(Math.floor(endMinutes / 60), endMinutes % 60);

  return { clockIn, clockOut };
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
