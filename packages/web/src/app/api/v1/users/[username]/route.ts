import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  withCors,
  errorResponse,
  handleCorsPreflightResponse,
} from '@/lib/api-middleware';

export async function OPTIONS() {
  return handleCorsPreflightResponse();
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ username: string }> }
) {
  const { username } = await params;

  try {
    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        skills: {
          where: { deprecated: false },
          orderBy: { downloads: 'desc' },
          include: {
            _count: { select: { likes: true } },
          },
        },
      },
    });

    if (!user) {
      return withCors(errorResponse('NOT_FOUND', 'User not found', 404));
    }

    const totalDownloads = user.skills.reduce((sum, s) => sum + s.downloads, 0);

    const skills = user.skills.map((s) => ({
      id: s.id,
      name: s.name,
      description: s.description,
      category: s.category,
      latest_version: s.latestVersion,
      agent_types: s.agentTypes,
      downloads: s.downloads,
      likes: s._count.likes,
      is_verified: s.isVerified,
      created_at: s.createdAt.toISOString(),
    }));

    return withCors(
      NextResponse.json({
        username: user.username,
        avatar_url: user.avatarUrl,
        skills_count: user.skills.length,
        total_downloads: totalDownloads,
        created_at: user.createdAt.toISOString(),
        skills,
      })
    );
  } catch (error) {
    console.error('Failed to fetch user profile:', error);
    return withCors(errorResponse('INTERNAL_ERROR', 'Failed to fetch user profile', 500));
  }
}
