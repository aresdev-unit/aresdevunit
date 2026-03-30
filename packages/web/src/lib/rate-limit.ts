import { NextRequest, NextResponse } from 'next/server';
import { prisma } from './prisma';
import { errorResponse } from './api-middleware';

/**
 * Rate limit configuration per endpoint pattern.
 * SPEC Section 9.5
 */
export interface RateLimitConfig {
  authenticated: number;
  anonymous: number;
  windowSeconds: number;
}

export const RATE_LIMITS: Record<string, RateLimitConfig> = {
  'POST:/api/v1/auth': {
    authenticated: 10,
    anonymous: 10,
    windowSeconds: 15 * 60, // 15 min
  },
  'POST:/api/v1/skills': {
    authenticated: 200,
    anonymous: 0, // auth only
    windowSeconds: 60 * 60, // 1 hour
  },
  'GET:/api/v1/skills': {
    authenticated: 100,
    anonymous: 60,
    windowSeconds: 60, // 1 min
  },
  'GET:/api/v1/skills/download': {
    authenticated: 60,
    anonymous: 30,
    windowSeconds: 60, // 1 min
  },
  'DEFAULT_AUTH': {
    authenticated: 60,
    anonymous: 0,
    windowSeconds: 60, // 1 min
  },
};

/**
 * Determine the rate limit key pattern from a request.
 */
function getRateLimitKey(method: string, pathname: string): string {
  // Download endpoint
  if (method === 'GET' && pathname.match(/\/api\/v1\/skills\/[^/]+\/download/)) {
    return 'GET:/api/v1/skills/download';
  }

  // Auth endpoints
  if (method === 'POST' && pathname.startsWith('/api/v1/auth')) {
    return 'POST:/api/v1/auth';
  }

  // POST skills (create)
  if (method === 'POST' && pathname === '/api/v1/skills') {
    return 'POST:/api/v1/skills';
  }

  // GET skills (list/detail)
  if (method === 'GET' && pathname.startsWith('/api/v1/skills')) {
    return 'GET:/api/v1/skills';
  }

  return 'DEFAULT_AUTH';
}

/**
 * Get the client identifier for rate limiting.
 * Uses user ID if authenticated, IP address otherwise.
 */
function getClientId(request: NextRequest, userId?: string): string {
  if (userId) return `user:${userId}`;
  const forwarded = request.headers.get('x-forwarded-for');
  const ip = forwarded?.split(',')[0]?.trim() || 'unknown';
  return `ip:${ip}`;
}

/**
 * DB-based fixed window rate limiter.
 * Uses a simple rate_limits table for counting requests.
 *
 * Returns null if within limits, or a 429 NextResponse if exceeded.
 */
export async function checkRateLimit(
  request: NextRequest,
  userId?: string
): Promise<NextResponse | null> {
  const method = request.method;
  const pathname = new URL(request.url).pathname;
  const limitKey = getRateLimitKey(method, pathname);
  const config = RATE_LIMITS[limitKey];

  if (!config) return null;

  const isAuth = !!userId;
  const maxRequests = isAuth ? config.authenticated : config.anonymous;

  // If limit is 0, endpoint requires auth (handled elsewhere)
  if (maxRequests === 0 && !isAuth) return null;
  if (maxRequests === 0) return null;

  const clientId = getClientId(request, userId);
  const windowStart = new Date(
    Date.now() - config.windowSeconds * 1000
  );

  try {
    // Count requests in current window using raw SQL for performance
    const result = await prisma.$queryRaw<[{ count: bigint }]>`
      SELECT COUNT(*) as count FROM rate_limits
      WHERE client_id = ${clientId}
        AND endpoint_key = ${limitKey}
        AND created_at > ${windowStart}
    `;

    const currentCount = Number(result[0]?.count ?? 0);

    if (currentCount >= maxRequests) {
      const retryAfter = config.windowSeconds;
      const response = errorResponse('RATE_LIMITED', 'Too many requests', 429);
      response.headers.set('Retry-After', String(retryAfter));
      return response;
    }

    // Record this request
    await prisma.$executeRaw`
      INSERT INTO rate_limits (id, client_id, endpoint_key, created_at)
      VALUES (gen_random_uuid(), ${clientId}, ${limitKey}, NOW())
    `;

    return null;
  } catch (error) {
    // If rate limit table doesn't exist or query fails, allow the request
    // (fail-open for availability)
    console.error('Rate limit check failed:', error);
    return null;
  }
}

/**
 * Cleanup old rate limit records (called periodically).
 * Deletes records older than the maximum window size.
 */
export async function cleanupRateLimits(): Promise<number> {
  const maxWindowSeconds = Math.max(
    ...Object.values(RATE_LIMITS).map((c) => c.windowSeconds)
  );
  const cutoff = new Date(Date.now() - maxWindowSeconds * 2 * 1000);

  try {
    const deleted = await prisma.$executeRaw`
      DELETE FROM rate_limits WHERE created_at < ${cutoff}
    `;
    return deleted;
  } catch (error) {
    console.error('Rate limit cleanup failed:', error);
    return 0;
  }
}
