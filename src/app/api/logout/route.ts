import { NextRequest, NextResponse } from 'next/server';

import { clearSessionCookies } from '@/lib/session-cookie';

export const runtime = 'edge';

export async function POST(request: NextRequest) {
  const response = NextResponse.json({ ok: true });
  clearSessionCookies(response, request.url);
  return response;
}
