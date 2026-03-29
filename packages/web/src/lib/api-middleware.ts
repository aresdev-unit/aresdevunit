import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from './auth';
import { verifyAccessToken, type JwtPayload } from './jwt';

export interface AuthUser {
  id: string;
  username: string;
  role: string;
}

export type AuthResult =
  | { authenticated: true; user: AuthUser }
  | { authenticated: false; user: null };

/**
 * Dual auth: Bearer JWT > session cookie > anonymous
 * Priority: Bearer token first, then NextAuth session cookie
 */
export async function getAuthUser(request: NextRequest): Promise<AuthResult> {
  // 1. Check Bearer token (CLI calls)
  const authHeader = request.headers.get('authorization');
  if (authHeader?.startsWith('Bearer ')) {
    const token = authHeader.slice(7);
    const payload = verifyAccessToken(token);
    if (payload) {
      return {
        authenticated: true,
        user: {
          id: payload.sub,
          username: payload.username,
          role: payload.role,
        },
      };
    }
    // Invalid/expired JWT - don't fall through to session
    return { authenticated: false, user: null };
  }

  // 2. Check NextAuth session cookie (Web calls)
  try {
    const session = await getServerSession(authOptions);
    if (session?.user?.id) {
      return {
        authenticated: true,
        user: {
          id: session.user.id,
          username: session.user.username,
          role: session.user.role,
        },
      };
    }
  } catch {
    // Session check failed, treat as anonymous
  }

  // 3. Anonymous
  return { authenticated: false, user: null };
}

/**
 * Require authentication - returns 401 if not authenticated
 */
export async function requireAuth(
  request: NextRequest
): Promise<AuthUser | NextResponse> {
  const result = await getAuthUser(request);
  if (!result.authenticated) {
    return NextResponse.json(
      {
        error: {
          code: 'UNAUTHORIZED',
          message: 'Authentication required',
          status: 401,
        },
      },
      { status: 401 }
    );
  }
  return result.user;
}

/**
 * Create a standardized error response
 */
export function errorResponse(
  code: string,
  message: string,
  status: number
): NextResponse {
  return NextResponse.json(
    { error: { code, message, status } },
    { status }
  );
}

/**
 * Add CORS headers to a response
 */
export function withCors(response: NextResponse): NextResponse {
  const origin =
    process.env.NODE_ENV === 'production'
      ? 'https://hub.aresdevunit.com'
      : 'http://localhost:3000';

  response.headers.set('Access-Control-Allow-Origin', origin);
  response.headers.set('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
  response.headers.set('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  response.headers.set('Access-Control-Allow-Credentials', 'true');
  response.headers.set('Access-Control-Max-Age', '86400');

  return response;
}

/**
 * Handle CORS preflight requests
 */
export function handleCorsPreflightResponse(): NextResponse {
  const response = new NextResponse(null, { status: 204 });
  return withCors(response);
}
