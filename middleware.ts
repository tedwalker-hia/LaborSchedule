import { NextResponse } from 'next/server';
import type { NextRequest } from 'next/server';
import { jwtVerify } from 'jose';
import { config as envConfig } from '@/lib/config';

const JWT_SECRET = new TextEncoder().encode(envConfig.JWT_SECRET);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  const publicRoutes = ['/login', '/api/auth/login', '/api/auth/logout', '/api/health'];
  const exactPublicRoutes = ['/', '/favicon.ico'];

  const isPublicRoute =
    publicRoutes.some((route) => pathname.startsWith(route)) ||
    exactPublicRoutes.includes(pathname);

  if (isPublicRoute) {
    return NextResponse.next();
  }

  const token = request.cookies.get('auth-token')?.value;

  if (!token) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }

  try {
    const { payload } = await jwtVerify(token, JWT_SECRET);
    const user = payload as {
      userId: number;
      email: string;
      firstName: string;
      lastName: string;
      role: string;
      mustChangePassword?: boolean;
    };

    // Force password change redirect
    if (
      user.mustChangePassword &&
      !pathname.startsWith('/change-password') &&
      !pathname.startsWith('/api/auth/')
    ) {
      if (pathname.startsWith('/api/')) {
        return NextResponse.json({ error: 'Password change required' }, { status: 403 });
      }
      return NextResponse.redirect(new URL('/change-password', request.url));
    }

    // Add user info to headers for API routes
    const requestHeaders = new Headers(request.headers);
    requestHeaders.set('x-user-id', String(user.userId));
    requestHeaders.set('x-user-role', user.role);
    requestHeaders.set('x-user-email', user.email);

    return NextResponse.next({
      request: {
        headers: requestHeaders,
      },
    });
  } catch {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('from', pathname);
    return NextResponse.redirect(loginUrl);
  }
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|public).*)'],
};
