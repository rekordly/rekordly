// middleware.ts
import { withAuth } from 'next-auth/middleware';
import { NextResponse } from 'next/server';

export default withAuth(
  function middleware(req) {
    const token = req.nextauth.token;
    const path = req.nextUrl.pathname;

    // Public routes - accessible to everyone
    const publicRoutes = [
      '/',
      '/terms-condition',
      '/privacy-policy',
      '/about',
      '/contact',
    ];

    // Auth routes - only for non-authenticated users
    const authRoutes = ['/account'];

    // OTP verification route
    const otpRoute = '/verify-otp';

    // Check if current path is public
    const isPublicRoute = publicRoutes.some(
      route =>
        path.startsWith(route) && (path === route || path === route + '/')
    );

    // Check if current path is auth route
    const isAuthRoute = authRoutes.some(route => path.startsWith(route));

    // Allow public routes for everyone
    if (isPublicRoute || path.startsWith('/session')) {
      return NextResponse.next();
    }

    // Not authenticated
    if (!token) {
      // Allow auth and OTP routes
      if (isAuthRoute) {
        return NextResponse.next();
      }

      // Redirect to login for protected routes
      return NextResponse.redirect(new URL('/account', req.url));
    }

    // Authenticated user
    const user = {
      onboarded: token.onboarded as boolean,
      hasPassword: token.hasPassword as boolean,
      emailVerified: token.emailVerified as boolean | undefined,
    };

    // Redirect authenticated users away from auth routes
    if (isAuthRoute) {
      // Check onboarding status
      if (!user.onboarded || !user.hasPassword) {
        return NextResponse.redirect(new URL('/onboarding', req.url));
      }

      return NextResponse.redirect(new URL('/dashboard', req.url));
    }

    // Handle /onboarding route
    if (path.startsWith('/onboarding')) {
      // User already onboarded and has password
      if (user.onboarded && user.hasPassword) {
        return NextResponse.redirect(new URL('/dashboard', req.url));
      }

      // User can access onboarding
      return NextResponse.next();
    }

    // Protected routes (dashboard, etc.)
    // User must be onboarded and have password
    if (!user.onboarded || !user.hasPassword) {
      return NextResponse.redirect(new URL('/onboarding', req.url));
    }

    return NextResponse.next();
  },
  {
    callbacks: {
      authorized: ({ token }) => true, // We handle authorization in middleware function
    },
  }
);

export const config = {
  matcher: [
    /*
     * Match all request paths except:
     * - api routes (except /api/auth)
     * - _next/static (static files)
     * - _next/image (image optimization files)
     * - favicon.ico (favicon file)
     * - public files (public folder)
     */
    '/((?!api(?!/auth)|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)',
  ],
};
