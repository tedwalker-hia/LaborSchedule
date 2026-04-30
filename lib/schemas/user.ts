import { z } from 'zod';

const ROLES = ['SuperAdmin', 'CompanyAdmin', 'HotelAdmin', 'DeptAdmin'] as const;

export const LoginBodySchema = z.object({
  email: z.string(),
  password: z.string(),
});

export const ChangePasswordBodySchema = z.object({
  currentPassword: z.string().optional(),
  newPassword: z.string(),
});

const HotelAccessSchema = z.object({
  tenant: z.string(),
  hotelName: z.string(),
  usrSystemCompanyId: z.string().optional(),
  branchId: z.number().optional(),
});

const DeptAccessSchema = z.object({
  tenant: z.string(),
  hotelName: z.string(),
  deptName: z.string(),
});

export const CreateUserBodySchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  password: z.string(),
  role: z.enum(ROLES),
  tenants: z.array(z.string()).optional().default([]),
  hotels: z.array(HotelAccessSchema).optional().default([]),
  departments: z.array(DeptAccessSchema).optional().default([]),
});

export const UpdateUserBodySchema = z.object({
  firstName: z.string(),
  lastName: z.string(),
  email: z.string(),
  password: z.string().optional(),
  role: z.enum(ROLES),
  tenants: z.array(z.string()).optional().default([]),
  hotels: z.array(HotelAccessSchema).optional().default([]),
  departments: z.array(DeptAccessSchema).optional().default([]),
});
