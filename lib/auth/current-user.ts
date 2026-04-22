import type { NextRequest } from 'next/server';
import type { Role } from '@/lib/permissions';

export interface CurrentUser {
  userId: number;
  email: string;
  role: Role;
}

const VALID_ROLES = new Set<Role>(['SuperAdmin', 'CompanyAdmin', 'HotelAdmin', 'DeptAdmin']);

/**
 * Extracts the authenticated user from request headers set by middleware.
 * Returns null if headers are missing or malformed — treat as unauthenticated.
 */
export function getCurrentUser(request: NextRequest | Request): CurrentUser | null {
  const rawId = request.headers.get('x-user-id');
  const rawRole = request.headers.get('x-user-role');
  const email = request.headers.get('x-user-email');

  if (!rawId || !rawRole || !email) return null;

  const userId = Number(rawId);
  if (!Number.isInteger(userId) || userId <= 0) return null;

  if (!VALID_ROLES.has(rawRole as Role)) return null;

  return { userId, email, role: rawRole as Role };
}
