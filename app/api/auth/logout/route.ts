import { NextResponse } from 'next/server';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function POST() {
  const response = NextResponse.json({ message: 'Logged out' });
  const cookieOpts = {
    secure: process.env.NODE_ENV === 'production',
    sameSite: 'lax' as const,
    maxAge: 0,
    path: '/',
  };
  response.cookies.set('auth-token', '', { httpOnly: true, ...cookieOpts });
  response.cookies.set('auth-exp', '', { httpOnly: false, ...cookieOpts });
  response.cookies.set('csrf_token', '', { httpOnly: false, ...cookieOpts });
  return response;
}
