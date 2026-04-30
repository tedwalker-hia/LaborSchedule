import { exportScheduleToExcel } from './writer.ts';

export interface TemplateParams {
  hotel: string;
  dates: Date[];
  /** Optional list of employee rows to pre-populate the template. */
  employees?: {
    code: string;
    firstName: string;
    lastName: string;
    deptName: string;
    positionName: string;
  }[];
}

/**
 * Generate a blank schedule Excel workbook for the given hotel and date range.
 * Intended as a download target so users can fill in shifts and re-upload.
 */
export async function generateBlankTemplate(params: TemplateParams): Promise<Buffer> {
  return exportScheduleToExcel({
    hotel: params.hotel,
    employees: params.employees ?? [],
    dates: params.dates,
    schedule: {},
    // Far-past "today" ensures every real date compares as future in the writer's
    // isBefore(date, today) check, so all cells stay editable with dropdowns.
    today: new Date('1900-01-01'),
  });
}
