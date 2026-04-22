import { z } from 'zod';

const SeedEmployeeSchema = z.object({
  code: z.string(),
  firstName: z.string(),
  lastName: z.string(),
  deptName: z.string().nullable().optional(),
  positionName: z.string().nullable().optional(),
});

export const SeedBodySchema = z.object({
  usrSystemCompanyId: z.string(),
  branchId: z.number().nullable().optional(),
  hotelName: z.string().nullable().optional(),
  tenant: z.string().nullable().optional(),
  employees: z.array(SeedEmployeeSchema),
});
