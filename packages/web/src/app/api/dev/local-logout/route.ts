import { NextRequest, NextResponse } from 'next/server';
import { LOCAL_DEV_AUTH_COOKIE } from '@/lib/local-dev-auth-shared';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  if (process.env.NODE_ENV === 'production') {
    return NextResponse.json({ error: 'Not available' }, { status: 404 });
  }

  const rawCallbackUrl = request.nextUrl.searchParams.get('callbackUrl') || '/';
  const callbackUrl = rawCallbackUrl.startsWith('/') ? rawCallbackUrl : '/';
  const response = NextResponse.redirect(new URL(callbackUrl, request.url));
  response.cookies.set({
    name: LOCAL_DEV_AUTH_COOKIE,
    value: '',
    // This cookie must remain readable by client UI code so the dev-only nav toggle can render.
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
