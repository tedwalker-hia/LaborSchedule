import { z } from 'zod';

export const SaveChangeSchema = z.object({
  employeeCode: z.string(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  /** Optional. When the employee is scheduled in multiple positions on this
   * date, this disambiguates which row the change targets. */
  positionName: z.string().nullable().optional(),
  date: z.string(),
  clockIn: z.string().nullable().optional(),
  clockOut: z.string().nullable().optional(),
});

export const SaveBodySchema = z.object({
  usrSystemCompanyId: z.string(),
  hotel: z.string().nullable().optional(),
  branchId: z.number().nullable().optional(),
  tenant: z.string().nullable().optional(),
  changes: z.array(SaveChangeSchema),
});

export const AddBodySchema = z.object({
  usrSystemCompanyId: z.string(),
  branchId: z.number().nullable().optional(),
  hotel: z.string().nullable().optional(),
  tenant: z.string().nullable().optional(),
  employeeCode: z.string(),
  firstName: z.string().nullable().optional(),
  lastName: z.string().nullable().optional(),
  deptName: z.string().nullable().optional(),
  positionName: z.string().nullable().optional(),
  date: z.string(),
  clockIn: z.string().nullable().optional(),
  clockOut: z.string().nullable().optional(),
});

export const LockRecordSchema = z.object({
  employeeCode: z.string(),
  date: z.string(),
});

export const LockBodySchema = z.object({
  usrSystemCompanyId: z.string(),
  records: z.array(LockRecordSchema),
  locked: z.boolean(),
});

export const ClearBodySchema = z.object({
  usrSystemCompanyId: z.string(),
  employeeCodes: z.array(z.string()),
  startDate: z.string(),
  endDate: z.string(),
  clearLocked: z.boolean().optional(),
});

export const DeleteSelectionSchema = z.object({
  employeeCode: z.string(),
  positionName: z.string().nullable().optional(),
});

export const DeleteBodySchema = z.object({
  usrSystemCompanyId: z.string(),
  selections: z.array(DeleteSelectionSchema),
  startDate: z.string(),
  endDate: z.string(),
});

export const GenerateBodySchema = z.object({
  usrSystemCompanyId: z.string(),
  hotel: z.string().nullable().optional(),
  branchId: z.number().nullable().optional(),
  tenant: z.string().nullable().optional(),
  employeeCodes: z.array(z.string()),
  startDate: z.string(),
  endDate: z.string(),
  overwriteLocked: z.boolean().optional(),
});

export const CheckLockedBodySchema = z.object({
  usrSystemCompanyId: z.string(),
  employeeCodes: z.array(z.string()),
  startDate: z.string(),
  endDate: z.string(),
});
