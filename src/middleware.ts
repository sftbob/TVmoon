import { NextRequest, NextResponse } from 'next/server';

import { getAuthInfoFromCookie } from '@/lib/auth';

const publicPaths = new Set([
  '/login',
  '/warning',
  '/api/login',
  '/api/register',
  '/api/logout',
  '/api/cron',
  '/api/server-config',
]);

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl;
  const origin = request.headers.get('origin');
  if (
    !['GET', 'HEAD', 'OPTIONS'].includes(request.method) &&
    origin &&
    origin !== request.nextUrl.origin
  )
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });

  if (publicPaths.has(pathname) || isStaticPath(pathname))
    return NextResponse.next();
  if (!process.env.PASSWORD) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: '尚未設定站台密碼' }, { status: 503 });
    }
    return NextResponse.redirect(new URL('/warning', request.url));
  }
  if (await getAuthInfoFromCookie(request)) return NextResponse.next();
  if (pathname.startsWith('/api/')) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }
  const loginUrl = new URL('/login', request.url);
  loginUrl.searchParams.set('redirect', pathname + request.nextUrl.search);
  return NextResponse.redirect(loginUrl);
}

function isStaticPath(pathname: string) {
  return (
    pathname.startsWith('/_next/') ||
    pathname.startsWith('/icons/') ||
    [
      '/favicon.ico',
      '/robots.txt',
      '/manifest.json',
      '/logo.png',
      '/sw.js',
      '/screenshot1.png',
      '/screenshot2.png',
      '/screenshot3.png',
    ].includes(pathname) ||
    /^\/workbox-[a-zA-Z0-9.-]+\.js$/.test(pathname)
  );
}

export const config = { matcher: ['/:path*'] };
