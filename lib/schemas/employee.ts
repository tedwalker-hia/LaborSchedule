import { z } from 'zod';

export const UpdateEmployeeBodySchema = z.object({
  usrSystemCompanyId: z.string(),
  employeeCode: z.string(),
  oldDeptName: z.string().nullable().optional(),
  oldPositionName: z.string().nullable().optional(),
  newDeptName: z.string().nullable().optional(),
  newPositionName: z.string().nullable().optional(),
});

const RefreshEmployeeSchema = z.object({
  code: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  deptName: z.string().nullable().optional(),
  positionName: z.string().nullable().optional(),
});

export const RefreshBodySchema = z.object({
  usrSystemCompanyId: z.string(),
  hotelName: z.string().nullable().optional(),
  branchId: z.number().nullable().optional(),
  tenant: z.string().nullable().optional(),
  newEmployees: z.array(RefreshEmployeeSchema).optional().default([]),
  removedCodes: z.array(z.string()).optional().default([]),
});

export const RefreshPreviewBodySchema = z.object({
  usrSystemCompanyId: z.string(),
  hotelName: z.string().nullable().optional(),
  tenant: z.string().nullable().optional(),
});
