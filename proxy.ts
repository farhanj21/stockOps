import { NextResponse, type NextRequest } from 'next/server';

const SESSION_COOKIE = 'stockops_session';
const AUTH_PAGES = ['/signin', '/signup', '/forgot'];

/**
 * Fast redirect based on whether a session cookie exists. This is only a convenience:
 * the cookie is verified against the database by every API route and Server Action.
 */
export function proxy(req: NextRequest) {
  const hasSession = req.cookies.has(SESSION_COOKIE);
  const isAuthPage = AUTH_PAGES.includes(req.nextUrl.pathname);
  if (!hasSession && !isAuthPage) return NextResponse.redirect(new URL('/signin', req.url));
  if (hasSession && isAuthPage) return NextResponse.redirect(new URL('/', req.url));
  return NextResponse.next();
}

export const config = {
  // Pages only: skip API routes, build assets, icons, the manifest and the service worker.
  matcher: ['/((?!api|_next/static|_next/image|icon|apple-icon|manifest.webmanifest|sw.js|favicon.ico).*)'],
};
