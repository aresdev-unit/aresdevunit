import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { requireAuth, withCors, errorResponse, type AuthUser } from '@/lib/api-middleware';

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);

  // If requireAuth returned a NextResponse, it's a 401 error
  if (authResult instanceof NextResponse) {
    return withCors(authResult);
  }

  const user = authResult as AuthUser;

  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    include: {
      _count: {
        select: { skills: true },
      },
    },
  });

  if (!dbUser) {
    return withCors(errorResponse('UNAUTHORIZED', 'User not found', 401));
  }

  const totalDownloads = await prisma.skill.aggregate({
    where: { authorId: dbUser.id },
    _sum: { downloads: true },
  });

  return withCors(
    NextResponse.json({
      id: dbUser.id,
      username: dbUser.username,
      email: dbUser.email,
      avatar_url: dbUser.avatarUrl,
      role: dbUser.role,
      skills_count: dbUser._count.skills,
      total_downloads: totalDownloads._sum.downloads || 0,
      created_at: dbUser.createdAt.toISOString(),
    }),
  );
}
