import { NextRequest, NextResponse } from 'next/server';

import { getConfig } from '@/lib/config';
import { db } from '@/lib/db';
import { setSessionCookies } from '@/lib/session-cookie';

export const runtime = 'edge';

export async function POST(req: NextRequest) {
  try {
    if (!process.env.PASSWORD) {
      return NextResponse.json({ error: '尚未設定站台密碼' }, { status: 503 });
    }
    const storageType = process.env.NEXT_PUBLIC_STORAGE_TYPE || 'localstorage';
    const { username, password } = await req.json();
    if (typeof password !== 'string' || !password) {
      return NextResponse.json({ error: '密碼不得為空' }, { status: 400 });
    }
    const response = NextResponse.json(
      { ok: true },
      {
        headers: { 'Cache-Control': 'no-store' },
      }
    );
    if (storageType === 'localstorage') {
      if (password !== process.env.PASSWORD) {
        return NextResponse.json({ error: '密碼錯誤' }, { status: 401 });
      }
      await setSessionCookies(response, req.url);
      return response;
    }
    if (typeof username !== 'string' || !username) {
      return NextResponse.json(
        { error: '使用者名稱不得為空' },
        { status: 400 }
      );
    }
    if (username === process.env.USERNAME) {
      if (password !== process.env.PASSWORD) {
        return NextResponse.json(
          { error: '使用者名稱或密碼錯誤' },
          { status: 401 }
        );
      }
      await setSessionCookies(response, req.url, username, 'owner');
      return response;
    }
    const config = await getConfig();
    const user = config.UserConfig.Users.find(
      (entry) => entry.username === username
    );
    if (user?.banned || !(await db.verifyUser(username, password))) {
      return NextResponse.json(
        { error: '使用者名稱或密碼錯誤' },
        { status: 401 }
      );
    }
    await setSessionCookies(response, req.url, username, user?.role || 'user');
    return response;
  } catch {
    return NextResponse.json(
      { error: '登入服務暫時無法使用' },
      { status: 500 }
    );
  }
}
