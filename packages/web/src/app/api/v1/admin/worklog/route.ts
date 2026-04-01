import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireAuth,
  errorResponse,
  withCors,
  handleCorsPreflightResponse,
  type AuthUser,
} from '@/lib/api-middleware';

export async function OPTIONS() {
  return handleCorsPreflightResponse();
}

// GET /api/v1/admin/worklog — Admin: all worklogs with filters
export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return withCors(authResult);
  const user = authResult as AuthUser;

  if (user.role !== 'ADMIN') {
    return withCors(errorResponse('FORBIDDEN', 'Admin access required', 403));
  }

  const { searchParams } = new URL(request.url);
  const username = searchParams.get('username');
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
  const cursor = searchParams.get('cursor'); // createdAt ISO string

  const where: Record<string, unknown> = {};

  if (username) {
    const targetUser = await prisma.user.findUnique({
      where: { username },
      select: { id: true },
    });
    if (!targetUser) {
      return withCors(errorResponse('NOT_FOUND', 'User not found', 404));
    }
    where.userId = targetUser.id;
  }

  if (cursor) {
    // Composite cursor: "createdAt|id" for deterministic pagination
    const parts = cursor.split('|');
    const cursorDate = new Date(parts[0]);
    const cursorId = parts[1];
    if (isNaN(cursorDate.getTime()) || !cursorId) {
      return withCors(errorResponse('VALIDATION_ERROR', 'Invalid cursor format. Expected: ISO_DATE|UUID', 422));
    }
    where.OR = [
      { createdAt: { lt: cursorDate } },
      { createdAt: cursorDate, id: { lt: cursorId } },
    ];
  }

  try {
    const worklogs = await prisma.worklog.findMany({
      where: where as any,
      orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
      take: limit,
      include: {
        user: {
          select: { username: true, avatarUrl: true },
        },
      },
    });

    const data = worklogs.map((w) => ({
      id: w.id,
      date: w.date.toISOString().split('T')[0],
      summary: w.summary,
      unfinished: w.unfinished,
      metadata: w.metadata,
      user: w.user
        ? { username: w.user.username, avatar_url: w.user.avatarUrl }
        : null,
      created_at: w.createdAt.toISOString(),
      updated_at: w.updatedAt.toISOString(),
    }));

    const lastItem = worklogs[worklogs.length - 1];
    const nextCursor = worklogs.length === limit && lastItem
      ? `${lastItem.createdAt.toISOString()}|${lastItem.id}`
      : null;

    return withCors(
      NextResponse.json({
        data,
        pagination: { limit, next_cursor: nextCursor },
      })
    );
  } catch (error) {
    console.error('Failed to fetch admin worklogs:', error);
    return withCors(errorResponse('INTERNAL_ERROR', 'Failed to fetch worklogs', 500));
  }
}
