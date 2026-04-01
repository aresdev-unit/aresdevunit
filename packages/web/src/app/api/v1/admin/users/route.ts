import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireAuth,
  withCors,
  errorResponse,
  handleCorsPreflightResponse,
  type AuthUser,
} from '@/lib/api-middleware';

export async function OPTIONS() {
  return handleCorsPreflightResponse();
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return withCors(authResult);
  const user = authResult as AuthUser;

  if (user.role !== 'ADMIN') {
    return withCors(errorResponse('FORBIDDEN', 'Admin access required', 403));
  }

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
  const q = searchParams.get('q');

  const where: Record<string, unknown> = {};
  if (q) {
    where.OR = [
      { username: { contains: q, mode: 'insensitive' } },
      { email: { contains: q, mode: 'insensitive' } },
    ];
  }

  try {
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where: where as any,
        orderBy: { createdAt: 'desc' },
        skip: (page - 1) * limit,
        take: limit,
        include: {
          _count: { select: { skills: true } },
        },
      }),
      prisma.user.count({ where: where as any }),
    ]);

    const data = users.map((u) => ({
      id: u.id,
      username: u.username,
      email: u.email,
      avatar_url: u.avatarUrl,
      role: u.role,
      skills_count: u._count.skills,
      created_at: u.createdAt.toISOString(),
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
    console.error('Failed to fetch users:', error);
    return withCors(errorResponse('INTERNAL_ERROR', 'Failed to fetch users', 500));
  }
}
