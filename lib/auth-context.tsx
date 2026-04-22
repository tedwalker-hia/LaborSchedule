'use client';

import type { ReactNode } from 'react';
import { createContext, useContext, useState, useEffect, useRef, useCallback } from 'react';

export interface User {
  userId: number;
  email: string;
  firstName: string;
  lastName: string;
  role: 'SuperAdmin' | 'CompanyAdmin' | 'HotelAdmin' | 'DeptAdmin';
  mustChangePassword: boolean;
}

interface AuthContextType {
  user: User | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<{ mustChangePassword: boolean }>;
  logout: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

function getCookie(name: string): string | null {
  if (typeof document === 'undefined') return null;
  const value = `; ${document.cookie}`;
  const parts = value.split(`; ${name}=`);
  if (parts.length === 2) return parts.pop()?.split(';').shift() || null;
  return null;
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  // Prevents concurrent 401 callbacks from triggering multiple logouts.
  const loggingOut = useRef(false);

  const logout = useCallback(async () => {
    if (loggingOut.current) return;
    loggingOut.current = true;
    const csrfToken = getCookie('csrf_token');
    await fetch('/api/auth/logout', {
      method: 'POST',
      headers: csrfToken ? { 'x-csrf-token': csrfToken } : {},
    });
    setUser(null);
    window.location.href = '/login';
  }, []);

  const checkAuth = async () => {
    try {
      // auth-token is httpOnly so document.cookie cannot access it.
      // Fall through to /api/auth/me which is protected by the middleware.
      const response = await fetch('/api/auth/me');
      if (response.ok) {
        const userData = await response.json();
        setUser(userData);
      } else {
        setUser(null);
      }
    } catch {
      setUser(null);
    } finally {
      setLoading(false);
    }
  };

  const login = async (email: string, password: string) => {
    const response = await fetch('/api/auth/login', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, password }),
    });

    if (!response.ok) {
      const error = await response.json();
      throw new Error(error.error || 'Login failed');
    }

    const data = await response.json();

    if (data.mustChangePassword) {
      return { mustChangePassword: true };
    }

    setUser(data.user);
    window.location.href = '/schedule';
    return { mustChangePassword: false };
  };

  // Initial auth check on mount.
  useEffect(() => {
    void checkAuth();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // JWT expiry timer: read the non-httpOnly auth-exp companion cookie (set by
  // middleware on every authenticated request) and schedule a forced logout at
  // that timestamp. Falls back gracefully if the cookie is not yet present —
  // the 401 interceptor below handles server-detected expiry in that case.
  useEffect(() => {
    if (!user) return;

    const expStr = getCookie('auth-exp');
    if (!expStr) return;

    const exp = parseInt(expStr, 10);
    if (isNaN(exp)) return;

    const delay = exp * 1000 - Date.now();
    if (delay <= 0) {
      void logout();
      return;
    }

    const timer = setTimeout(() => void logout(), delay);
    return () => clearTimeout(timer);
  }, [user, logout]);

  // Global fetch 401 interceptor: any authenticated API call returning 401
  // means the server has invalidated the session — force logout immediately.
  useEffect(() => {
    if (!user) return;

    const nativeFetch = window.fetch.bind(window);

    window.fetch = async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
      const method = (init?.method ?? 'GET').toUpperCase();
      if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(method)) {
        const csrfToken = getCookie('csrf_token');
        if (csrfToken) {
          const headers = new Headers(init?.headers as HeadersInit | undefined);
          if (!headers.has('x-csrf-token')) {
            headers.set('x-csrf-token', csrfToken);
            init = { ...init, headers };
          }
        }
      }

      const response = await nativeFetch(input, init);
      if (response.status === 401 && !loggingOut.current) {
        loggingOut.current = true;
        // Use native fetch to avoid recursive interception.
        void nativeFetch('/api/auth/logout', { method: 'POST' }).catch(() => {});
        setUser(null);
        window.location.href = '/login';
      }
      return response;
    };

    return () => {
      window.fetch = nativeFetch;
    };
  }, [user]);

  return (
    <AuthContext.Provider value={{ user, loading, login, logout }}>{children}</AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
}
