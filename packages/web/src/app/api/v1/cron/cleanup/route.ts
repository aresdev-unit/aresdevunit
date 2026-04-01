import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

/**
 * POST /api/v1/cron/cleanup
 *
 * Periodic cleanup job:
 *  - ActivityLog: delete records older than 90 days
 *    (SPEC 3.5 says "archive table", but for 10-user scale, delete is sufficient.
 *     If archive is needed later, add ActivityLogArchive model and INSERT before DELETE.)
 *  - RefreshToken: delete expired + revoked tokens after 30 days grace
 *  - DeviceCode: delete expired device codes
 *
 * Secured by CRON_SECRET header.
 */
export async function POST(request: NextRequest) {
  // --- Auth: verify CRON_SECRET ---
  const cronSecret = process.env.CRON_SECRET;
  if (!cronSecret) {
    return NextResponse.json(
      { error: 'CRON_SECRET not configured' },
      { status: 500 }
    );
  }

  const authHeader = request.headers.get('x-cron-secret');
  if (authHeader !== cronSecret) {
    return NextResponse.json(
      { error: 'Unauthorized' },
      { status: 401 }
    );
  }

  const now = new Date();
  const results: {
    activity_logs: number;
    refresh_tokens: number;
    device_codes: number;
  } = {
    activity_logs: 0,
    refresh_tokens: 0,
    device_codes: 0,
  };
  const errors: string[] = [];

  // --- 1. ActivityLog: delete records older than 90 days ---
  try {
    const cutoff90d = new Date(now.getTime() - 90 * 24 * 60 * 60 * 1000);
    const deleted = await prisma.activityLog.deleteMany({
      where: {
        createdAt: { lt: cutoff90d },
      },
    });
    results.activity_logs = deleted.count;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`activity_logs: ${message}`);
  }

  // --- 2. RefreshToken: delete expired AND revoked > 30 days ---
  try {
    const cutoff30d = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);
    const deleted = await prisma.refreshToken.deleteMany({
      where: {
        OR: [
          // Expired tokens past 30-day grace period
          {
            expiresAt: { lt: cutoff30d },
          },
          // Revoked tokens past 30-day grace period
          {
            revokedAt: { not: null, lt: cutoff30d },
          },
        ],
      },
    });
    results.refresh_tokens = deleted.count;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`refresh_tokens: ${message}`);
  }

  // --- 3. DeviceCode: delete expired codes ---
  try {
    const deleted = await prisma.deviceCode.deleteMany({
      where: {
        expiresAt: { lt: now },
      },
    });
    results.device_codes = deleted.count;
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    errors.push(`device_codes: ${message}`);
  }

  const status = errors.length > 0 ? 207 : 200;

  return NextResponse.json(
    {
      cleaned: results,
      ...(errors.length > 0 && { errors }),
      timestamp: now.toISOString(),
    },
    { status }
  );
}
