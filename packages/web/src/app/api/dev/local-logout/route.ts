import { NextRequest, NextResponse } from 'next/server';
import { LOCAL_DEV_AUTH_COOKIE } from '@/lib/local-dev-auth-shared';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const callbackUrl = request.nextUrl.searchParams.get('callbackUrl') || '/';
  const response = NextResponse.redirect(new URL(callbackUrl, request.url));
  response.cookies.set({
    name: LOCAL_DEV_AUTH_COOKIE,
    value: '',
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 0,
  });
  return response;
}
