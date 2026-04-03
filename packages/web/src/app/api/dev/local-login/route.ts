import { NextRequest, NextResponse } from 'next/server';
import { getLocalDevAuthUser } from '@/lib/local-dev-auth';
import { LOCAL_DEV_AUTH_COOKIE } from '@/lib/local-dev-auth-shared';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const callbackUrl = request.nextUrl.searchParams.get('callbackUrl') || '/tables';
  const user = await getLocalDevAuthUser('1');

  if (!user) {
    return NextResponse.json({ error: 'Local dev auth is not configured.' }, { status: 404 });
  }

  const response = NextResponse.redirect(new URL(callbackUrl, request.url));
  response.cookies.set({
    name: LOCAL_DEV_AUTH_COOKIE,
    value: '1',
    httpOnly: false,
    sameSite: 'lax',
    path: '/',
    maxAge: 60 * 60 * 24 * 14,
  });

  return response;
}
