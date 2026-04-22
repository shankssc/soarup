// src/middleware.ts
// Route protection for all (app) routes.
// Reads Supabase session from cookies — set by syncSupabaseSession in useAuth.

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// ─── Route configuration ──────────────────────────────────────────────────────

// Routes that require authentication
const PROTECTED_ROUTES = [
  '/dashboard',
  '/onboarding',
  '/submit',
  '/history',
  '/settings',
];

// Routes that should redirect to dashboard if already authenticated
const AUTH_ROUTES = ['/login', '/signup', '/forgot-password', '/reset-password'];

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
}

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((route) => pathname.startsWith(route));
}

// ─── Middleware ───────────────────────────────────────────────────────────────

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Create a response to pass through — middleware must return a response
  let response = NextResponse.next({
    request: { headers: request.headers },
  });

  // Create Supabase client that can read/write cookies in middleware
  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll();
        },
        setAll(
          cookiesToSet: { name: string; value: string; options: CookieOptions }[],
        ) {
          cookiesToSet.forEach(({ name, value }) => request.cookies.set(name, value));
          response = NextResponse.next({
            request: { headers: request.headers },
          });
          cookiesToSet.forEach(({ name, value, options }) =>
            response.cookies.set(name, value, options),
          );
        },
      },
    },
  );

  // Refresh session — this also sets updated cookies on the response
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const isAuthenticated = Boolean(session);

  // ── Protected route: redirect to login if not authenticated ───────────────
  if (isProtectedRoute(pathname) && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    // Preserve the intended destination so we can redirect back after login
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── Auth route: redirect to dashboard if already authenticated ────────────
  if (isAuthRoute(pathname) && isAuthenticated) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

// ─── Matcher ──────────────────────────────────────────────────────────────────
// Only run middleware on routes that need it.
// Excludes: static files, _next internals, API routes, favicon.

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
