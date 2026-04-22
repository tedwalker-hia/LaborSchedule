import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { ChangePasswordBodySchema } from '@/lib/schemas/user';
import { sign, COOKIE_NAME, ABSOLUTE_TTL_S } from '@/lib/session';
import logger from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const PASSWORD_PATTERN = /^(?=.*[A-Z])(?=.*\d)(?=.*[^A-Za-z0-9]).{8,}$/;

export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id');
    if (!userId) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }

    const parsed = ChangePasswordBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
    }
    const { newPassword, currentPassword } = parsed.data;

    if (!PASSWORD_PATTERN.test(newPassword)) {
      return NextResponse.json(
        {
          error:
            'Password must be at least 8 characters with at least one uppercase letter, one number, and one special character.',
        },
        { status: 400 },
      );
    }

    const user = await prisma.user.findUnique({
      where: { userId: parseInt(userId) },
    });

    if (!user) {
      return NextResponse.json({ error: 'User not found' }, { status: 404 });
    }

    // If not a forced change, verify current password
    if (!user.mustChangePassword) {
      if (!currentPassword || !user.passwordHash) {
        return NextResponse.json({ error: 'Current password is required' }, { status: 400 });
      }
      const valid = await bcrypt.compare(currentPassword, user.passwordHash);
      if (!valid) {
        return NextResponse.json({ error: 'Current password is incorrect.' }, { status: 401 });
      }
    }

    const newHash = await bcrypt.hash(newPassword, 10);

    await prisma.user.update({
      where: { userId: parseInt(userId) },
      data: {
        passwordHash: newHash,
        mustChangePassword: false,
        updatedAt: new Date(),
      },
    });

    // Issue a fresh JWT without mustChangePassword
    const token = await sign({
      userId: user.userId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      mustChangePassword: false,
    });

    const response = NextResponse.json({ message: 'Password changed successfully.' });

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: ABSOLUTE_TTL_S,
      path: '/',
    });

    return response;
  } catch (error) {
    logger.error({ err: error }, 'Change password error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
