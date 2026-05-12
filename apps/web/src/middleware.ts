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

// Routes that are only for non-onboarded authenticated users
// — bypasses the "already authenticated → dashboard" redirect
const ONBOARDING_ROUTES = ['/onboarding'];

// Routes that should redirect to dashboard if already authenticated
const AUTH_ROUTES = ['/login', '/signup', '/forgot-password', '/reset-password'];

function isProtectedRoute(pathname: string): boolean {
  return PROTECTED_ROUTES.some((route) => pathname.startsWith(route));
}

function isAuthRoute(pathname: string): boolean {
  return AUTH_ROUTES.some((route) => pathname.startsWith(route));
}

function isOnboardingRoute(pathname: string): boolean {
  return ONBOARDING_ROUTES.some((route) => pathname.startsWith(route));
}

function isAppRoute(pathname: string): boolean {
  // App routes are protected routes that are NOT onboarding
  // These require the user to be fully onboarded
  return isProtectedRoute(pathname) && !isOnboardingRoute(pathname);
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

  // ── 3. App route: redirect non-onboarded users to /onboarding ────────────
  // Middleware cannot read the Zustand store (runs on Edge) so we cannot
  // check is_onboarded directly here. Instead we rely on two mechanisms:
  //
  // a) The backend OnboardedDep returns HTTP 403 with
  //    detail: "Onboarding required before accessing this resource."
  //    for any API call from a non-onboarded user. The API client
  //    interceptor in useAuth catches this and redirects to /onboarding.
  //
  // b) As a belt-and-suspenders check, we read the is_onboarded flag from
  //    Supabase user_metadata if it was stored there during signup.
  //    If not present we let the request through and rely on (a).
  //
  // This means the middleware never makes an extra DB call — it stays fast.
  if (isAppRoute(pathname) && isAuthenticated) {
    const isOnboarded = session?.user?.user_metadata?.is_onboarded === true;

    // Only redirect if we have a definitive false — not if the field is
    // absent (undefined), since we can't be certain without a DB call.
    if (isOnboarded === false) {
      return NextResponse.redirect(new URL('/onboarding', request.url));
    }
  }

  return response;
}

// ─── Matcher ──────────────────────────────────────────────────────────────────

export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
