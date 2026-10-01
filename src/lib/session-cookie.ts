import { NextResponse } from 'next/server';

import { createSession, Session, SESSION_MAX_AGE } from '@/lib/session';

function options(url: string) {
  return {
    path: '/',
    sameSite: 'lax' as const,
    secure:
      process.env.NODE_ENV === 'production' ||
      new URL(url).protocol === 'https:',
    maxAge: SESSION_MAX_AGE,
  };
}

export async function setSessionCookies(
  response: NextResponse,
  url: string,
  username?: string,
  role: Session['role'] = 'user'
) {
  const cookie = await createSession(
    process.env.PASSWORD || '',
    process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage',
    username,
    role
  );
  response.cookies.set('auth', cookie, { ...options(url), httpOnly: true });
  // Display/cache identity only. Never accepted by server authorization.
  response.cookies.set(
    'auth_info',
    encodeURIComponent(JSON.stringify({ username, role })),
    {
      ...options(url),
      httpOnly: false,
    }
  );
}

export function clearSessionCookies(response: NextResponse, url: string) {
  for (const name of ['auth', 'auth_info']) {
    response.cookies.set(name, '', {
      ...options(url),
      maxAge: 0,
      httpOnly: name === 'auth',
    });
  }
}
