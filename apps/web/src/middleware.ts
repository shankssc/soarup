// src/middleware.ts
// Route protection for all (app) routes.
// Reads Supabase session from cookies — set by syncSupabaseSession in useAuth.

import { createServerClient, type CookieOptions } from '@supabase/ssr';
import { NextResponse, type NextRequest } from 'next/server';

// ─── Route configuration ──────────────────────────────────────────────────────

// Routes that require authentication
// PUBLIC_ROUTES — never add these to PROTECTED_ROUTES or AUTH_ROUTES
// /invite/* — invite acceptance, requires no auth to view
// /api/v1/invites/* — invite details endpoint, no auth required
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

  let response = NextResponse.next({
    request: { headers: request.headers },
  });

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

  // Refresh session — also updates cookies on the response
  const {
    data: { session },
  } = await supabase.auth.getSession();

  const isAuthenticated = Boolean(session);

  // ── 1. Protected route: redirect to login if not authenticated ────────────
  if (isProtectedRoute(pathname) && !isAuthenticated) {
    const loginUrl = new URL('/login', request.url);
    loginUrl.searchParams.set('next', pathname);
    return NextResponse.redirect(loginUrl);
  }

  // ── 2. Auth route: redirect authenticated users away ─────────────────────
  // Authenticated users hitting /login, /signup etc. go to /dashboard.
  // Exception: if they are not onboarded, the onboarding page guard in
  // page.tsx handles the redirect — middleware doesn't need to intervene
  // because /onboarding is not in AUTH_ROUTES.
  if (isAuthRoute(pathname) && isAuthenticated) {
    return NextResponse.redirect(new URL('/dashboard', request.url));
  }

  return response;
}

// ─── Matcher ──────────────────────────────────────────────────────────────────

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
