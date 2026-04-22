import type { NextRequest } from 'next/server';
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import bcrypt from 'bcryptjs';
import { SignJWT } from 'jose';
import { config } from '@/lib/config';
import { LoginBodySchema } from '@/lib/schemas/user';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

const JWT_SECRET = new TextEncoder().encode(config.JWT_SECRET);

export async function POST(request: NextRequest) {
  try {
    const parsed = LoginBodySchema.safeParse(await request.json());
    if (!parsed.success) {
      return NextResponse.json({ issues: parsed.error.issues }, { status: 400 });
    }
    const { email, password } = parsed.data;

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

    const validPassword = await bcrypt.compare(password, user.passwordHash);
    if (!validPassword) {
      return NextResponse.json({ error: 'Invalid email or password.' }, { status: 401 });
    }

    const token = await new SignJWT({
      userId: user.userId,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName,
      role: user.role,
      mustChangePassword: user.mustChangePassword,
    })
      .setProtectedHeader({ alg: 'HS256' })
      .setExpirationTime('7d')
      .setIssuedAt()
      .sign(JWT_SECRET);

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

    response.cookies.set('auth-token', token, {
      httpOnly: true,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: 7 * 24 * 60 * 60,
      path: '/',
    });

    return response;
  } catch (error) {
    console.error('Login error:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
