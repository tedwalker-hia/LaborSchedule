import '@/lib/config';
import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { verify, rotate, COOKIE_NAME, ABSOLUTE_TTL_S } from '@/lib/session';
import { issueToken, verifyToken, needsCsrf, CSRF_COOKIE, CSRF_HEADER } from '@/lib/csrf';

const PUBLIC_PATHS = new Set([
  '/',
  '/login',
  '/change-password',
  '/api/auth/login',
  '/api/health',
  '/favicon.ico',
]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (PUBLIC_PATHS.has(pathname)) {
    return NextResponse.next();
  }

  const token = request.cookies.get(COOKIE_NAME)?.value;

  if (!token) {
    return unauthenticated(request);
  }

  const verifyResult = await verify(token);

  if (!verifyResult.ok) {
    const res = unauthenticated(request);
    res.cookies.delete(COOKIE_NAME);
    res.cookies.delete('auth-exp');
    return res;
  }

  const { payload } = verifyResult;

  if (needsCsrf(request.method, pathname)) {
    const csrfHeader = request.headers.get(CSRF_HEADER);
    const valid = csrfHeader ? await verifyToken(csrfHeader, payload.jti) : false;
    if (!valid) {
      return NextResponse.json({ error: 'Invalid CSRF token' }, { status: 403 });
    }
  }

  if (
    payload.mustChangePassword &&
    pathname !== '/change-password' &&
    !pathname.startsWith('/api/auth/')
  ) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Password change required' }, { status: 403 });
    }
    return NextResponse.redirect(new URL('/change-password', request.url));
  }

  const requestHeaders = new Headers(request.headers);
  requestHeaders.set('x-user-id', String(payload.userId));
  requestHeaders.set('x-user-role', payload.role);
  requestHeaders.set('x-user-email', payload.email);

  const res = NextResponse.next({ request: { headers: requestHeaders } });

  const rotated = await rotate(token);
  if (rotated) {
    const remainingTtl = payload.issuedAt + ABSOLUTE_TTL_S - Math.floor(Date.now() / 1000);
    const maxAge = Math.max(remainingTtl, 0);
    const cookieOpts = {
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax' as const,
      maxAge,
      path: '/',
    };
    res.cookies.set(COOKIE_NAME, rotated, { httpOnly: true, ...cookieOpts });
    // Non-httpOnly companion cookie so the client can schedule an expiry timer
    // without ever seeing the JWT. Contains only the absolute expiry unix timestamp.
    res.cookies.set('auth-exp', String(payload.issuedAt + ABSOLUTE_TTL_S), {
      httpOnly: false,
      ...cookieOpts,
    });
  }

  // On GET to authenticated pages (not API routes), set the CSRF double-submit
  // cookie so client JS can read it and echo it as X-CSRF-Token on mutations.
  if (request.method === 'GET' && !pathname.startsWith('/api/')) {
    const remainingTtl = payload.issuedAt + ABSOLUTE_TTL_S - Math.floor(Date.now() / 1000);
    const csrfToken = await issueToken(payload.jti);
    res.cookies.set(CSRF_COOKIE, csrfToken, {
      httpOnly: false,
      secure: process.env.NODE_ENV === 'production',
      sameSite: 'lax',
      maxAge: Math.max(remainingTtl, 0),
      path: '/',
    });
  }

  return res;
}

function unauthenticated(request: NextRequest): NextResponse {
  const { pathname } = request.nextUrl;
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('from', pathname);
  return NextResponse.redirect(loginUrl);
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
};
