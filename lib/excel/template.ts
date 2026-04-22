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
 *
 * Phase 13 provides the full implementation (parity with generate_labor_schedules.py).
 */
export async function generateBlankTemplate(_params: TemplateParams): Promise<Buffer> {
  throw new Error('generateBlankTemplate: not yet implemented (Phase 13)');
}
