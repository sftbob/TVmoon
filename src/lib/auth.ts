import type { NextRequest } from 'next/server';

import { verifySession } from '@/lib/session';

export async function getAuthInfoFromCookie(request: NextRequest) {
  return verifySession(
    request.cookies.get('auth')?.value,
    process.env.PASSWORD || '',
    process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage'
  );
}

// This cookie contains display metadata only, never passwords or auth credentials.
export function getAuthInfoFromBrowserCookie(): {
  username?: string;
  role?: 'owner' | 'admin' | 'user';
} | null {
  if (typeof document === 'undefined') return null;
  try {
    const cookie = document.cookie
      .split(';')
      .map((value) => value.trim())
      .find((value) => value.startsWith('auth_info='));
    if (!cookie) return null;
    const data = JSON.parse(
      decodeURIComponent(cookie.slice('auth_info='.length))
    );
    return { username: data.username, role: data.role };
  } catch {
    return null;
  }
}
