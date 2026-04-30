import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { LoginBodySchema } from '@/lib/schemas/user';
import { checkLogin } from '@/lib/rate-limit';
import { verify, hash, needsUpgrade } from '@/lib/auth/hash';
import { sign, COOKIE_NAME, ABSOLUTE_TTL_S } from '@/lib/session';
import logger from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

function getClientIp(request: NextRequest): string {
  const forwarded = request.headers.get('x-forwarded-for');
  if (forwarded) return (forwarded.split(',')[0] ?? forwarded).trim();
  return request.headers.get('x-real-ip') ?? '127.0.0.1';
}

export async function POST(request: NextRequest) {
  try {
    const parsed = LoginBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
    }
    const { email, password } = parsed.data;

    const ip = getClientIp(request);
    const rateLimit = await checkLogin(ip, email);
    if (!rateLimit.allowed) {
      const retryAfterS = Math.ceil((rateLimit.retryAfterMs ?? 60_000) / 1000);
      return NextResponse.json(
        { error: 'Too many login attempts. Please try again later.' },
        { status: 429, headers: { 'Retry-After': String(retryAfterS) } },
      );
    }

    // SQL Server collation is case-insensitive by default, so direct match works
    const user = await prisma.user.findFirst({
      where: {
        email: email.trim().toLowerCase(),
        isActive: true,
      },
    });

    if (!user) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    if (!user.passwordHash) {
      return NextResponse.json(
        { error: 'Account not set up. Please contact an administrator.' },
        { status: 401 },
      );
    }

    const validPassword = await verify(password, user.passwordHash);
    if (!validPassword) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    if (needsUpgrade(user.passwordHash)) {
      const upgraded = await hash(password);
      await prisma.user.update({
        where: { userId: user.userId },
        data: { passwordHash: upgraded },
      });
    }

    const token = await sign({
      userId: user.userId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    });

    const response = NextResponse.json({
      message: 'Login successful',
      mustChangePassword: user.mustChangePassword,
      user: {
        userId: user.userId,
        firstName: user.firstName,
        lastName: user.lastName,
        email: user.email,
        role: user.role,
      },
    });

    response.cookies.set(COOKIE_NAME, token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: ABSOLUTE_TTL_S,
      path: '/',
    });

    return response;
  } catch (error) {
    logger.error({ err: error }, 'Login error');
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
