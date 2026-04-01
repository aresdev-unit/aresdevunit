import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireApproved,
  errorResponse,
  withCors,
  handleCorsPreflightResponse,
  type AuthUser,
} from '@/lib/api-middleware';
import { z } from 'zod';

export async function OPTIONS() {
  return handleCorsPreflightResponse();
}

function getKSTDate(): Date {
  const now = new Date();
  // Convert to KST (UTC+9)
  const kst = new Date(now.getTime() + 9 * 60 * 60 * 1000);
  const dateStr = kst.toISOString().split('T')[0]; // YYYY-MM-DD
  return new Date(dateStr + 'T00:00:00.000Z');
}

const createWorklogSchema = z.object({
  summary: z.string().min(1).max(50000),
  unfinished: z.string().max(10000).optional(),
  metadata: z.record(z.unknown()).optional(),
});

// POST /api/v1/worklog — Save daily work log
export async function POST(request: NextRequest) {
  const authResult = await requireApproved(request);
  if (authResult instanceof NextResponse) return withCors(authResult);
  const user = authResult as AuthUser;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withCors(errorResponse('VALIDATION_ERROR', 'Invalid JSON body', 422));
  }

  const parsed = createWorklogSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    return withCors(errorResponse('VALIDATION_ERROR', message, 422));
  }

  const date = getKSTDate();

  try {
    const worklog = await prisma.worklog.upsert({
      where: {
        userId_date: { userId: user.id, date },
      },
      create: {
        userId: user.id,
        date,
        summary: parsed.data.summary,
        unfinished: parsed.data.unfinished || null,
        metadata: parsed.data.metadata || null,
      },
      update: {
        summary: parsed.data.summary,
        unfinished: parsed.data.unfinished || null,
        metadata: parsed.data.metadata || null,
      },
    });

    return withCors(
      NextResponse.json({
        id: worklog.id,
        date: worklog.date.toISOString().split('T')[0],
        summary: worklog.summary,
        unfinished: worklog.unfinished,
        metadata: worklog.metadata,
        created_at: worklog.createdAt.toISOString(),
        updated_at: worklog.updatedAt.toISOString(),
      })
    );
  } catch (error) {
    console.error('Failed to save worklog:', error);
    return withCors(errorResponse('INTERNAL_ERROR', 'Failed to save worklog', 500));
  }
}

// GET /api/v1/worklog — Get own work logs
export async function GET(request: NextRequest) {
  const authResult = await requireApproved(request);
  if (authResult instanceof NextResponse) return withCors(authResult);
  const user = authResult as AuthUser;

  const { searchParams } = new URL(request.url);
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '3', 10)));

  try {
    const [worklogs, total] = await Promise.all([
      prisma.worklog.findMany({
        where: { userId: user.id },
        orderBy: { date: 'desc' },
        take: limit,
      }),
      prisma.worklog.count({ where: { userId: user.id } }),
    ]);

    const data = worklogs.map((w) => ({
      id: w.id,
      date: w.date.toISOString().split('T')[0],
      summary: w.summary,
      unfinished: w.unfinished,
      metadata: w.metadata,
      created_at: w.createdAt.toISOString(),
      updated_at: w.updatedAt.toISOString(),
    }));

    return withCors(
      NextResponse.json({ data, pagination: { limit, total } })
    );
  } catch (error) {
    console.error('Failed to fetch worklogs:', error);
    return withCors(errorResponse('INTERNAL_ERROR', 'Failed to fetch worklogs', 500));
  }
}
