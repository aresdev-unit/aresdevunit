import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireApproved,
  errorResponse,
  withCors,
  handleCorsPreflightResponse,
  type AuthUser,
} from '@/lib/api-middleware';
import { checkRateLimit } from '@/lib/rate-limit';

// --- OPTIONS ---
export async function OPTIONS() {
  return handleCorsPreflightResponse();
}

// --- POST /api/v1/skills/:name/like ---
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;

  // Auth required
  const authResult = await requireApproved(request);
  if (authResult instanceof NextResponse) return withCors(authResult);
  const user = authResult as AuthUser;

  // Rate limit
  const rateLimited = await checkRateLimit(request, user.id);
  if (rateLimited) return withCors(rateLimited);

  try {
    const skill = await prisma.skill.findFirst({
      where: { name, deprecated: false },
    });

    if (!skill) {
      return withCors(errorResponse('SKILL_NOT_FOUND', `Skill '${name}' not found`, 404));
    }

    // Toggle like
    const existingLike = await prisma.skillLike.findUnique({
      where: {
        userId_skillId: {
          userId: user.id,
          skillId: skill.id,
        },
      },
    });

    let liked: boolean;

    if (existingLike) {
      // Unlike
      await prisma.skillLike.delete({
        where: { id: existingLike.id },
      });
      liked = false;

      // Log unlike activity
      await prisma.activityLog.create({
        data: {
          action: 'UNLIKE',
          userId: user.id,
          skillId: skill.id,
        },
      });
    } else {
      // Like
      await prisma.skillLike.create({
        data: {
          userId: user.id,
          skillId: skill.id,
        },
      });
      liked = true;

      // Log like activity
      await prisma.activityLog.create({
        data: {
          action: 'LIKE',
          userId: user.id,
          skillId: skill.id,
        },
      });
    }

    // Get updated count
    const likesCount = await prisma.skillLike.count({
      where: { skillId: skill.id },
    });

    const response = NextResponse.json({
      liked,
      likes: likesCount,
    });

    return withCors(response);
  } catch (error) {
    console.error('Failed to toggle like:', error);
    return withCors(errorResponse('INTERNAL_ERROR', 'Failed to toggle like', 500));
  }
}
