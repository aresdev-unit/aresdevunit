import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireApproved,
  withCors,
  errorResponse,
  handleCorsPreflightResponse,
  type AuthUser,
} from '@/lib/api-middleware';

export async function OPTIONS() {
  return handleCorsPreflightResponse();
}

export async function GET(request: NextRequest) {
  const authResult = await requireApproved(request);
  if (authResult instanceof NextResponse) return withCors(authResult);
  const user = authResult as AuthUser;

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(50, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));

  try {
    // Get my skill IDs
    const mySkills = await prisma.skill.findMany({
      where: { authorId: user.id },
      select: { id: true },
    });
    const skillIds = mySkills.map((s) => s.id);

    if (skillIds.length === 0) {
      return withCors(
        NextResponse.json({
          data: [],
          pagination: { page, limit, total: 0, total_pages: 0 },
        })
      );
    }

    // Fetch activities on my skills (INSTALL, LIKE, etc.) excluding my own actions
    const where = {
      skillId: { in: skillIds },
      userId: { not: user.id },
      action: { in: ['INSTALL' as const, 'LIKE' as const] },
    };

    const [activities, total] = await Promise.all([
      prisma.activityLog.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          user: { select: { username: true, avatarUrl: true } },
          skill: { select: { name: true } },
        },
      }),
      prisma.activityLog.count({ where }),
    ]);

    const data = activities.map((a) => ({
      id: a.id,
      action: a.action,
      user: {
        username: a.user.username,
        avatar_url: a.user.avatarUrl,
      },
      skill: {
        name: a.skill.name,
      },
      metadata: a.metadata,
      created_at: a.createdAt.toISOString(),
    }));

    return withCors(
      NextResponse.json({
        data,
        pagination: {
          page,
          limit,
          total,
          total_pages: Math.ceil(total / limit),
        },
      })
    );
  } catch (error) {
    console.error('Failed to fetch dashboard feed:', error);
    return withCors(errorResponse('INTERNAL_ERROR', 'Failed to fetch dashboard feed', 500));
  }
}
