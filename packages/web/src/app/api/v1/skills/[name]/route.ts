import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getAuthUser,
  requireAuth,
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

// --- GET /api/v1/skills/:name ---
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;

  // Rate limit
  const auth = await getAuthUser(request);
  const rateLimited = await checkRateLimit(
    request,
    auth.authenticated ? auth.user.id : undefined
  );
  if (rateLimited) return withCors(rateLimited);

  try {
    const skill = await prisma.skill.findFirst({
      where: { name, deprecated: false },
      include: {
        author: { select: { username: true, avatarUrl: true } },
        versions: {
          select: { version: true, changelog: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { likes: true } },
      },
    });

    if (!skill) {
      return withCors(errorResponse('SKILL_NOT_FOUND', `Skill '${name}' not found`, 404));
    }

    // Check if current user has liked this skill
    let userLiked = false;
    if (auth.authenticated) {
      const like = await prisma.skillLike.findUnique({
        where: {
          userId_skillId: {
            userId: auth.user.id,
            skillId: skill.id,
          },
        },
      });
      userLiked = !!like;
    }

    const response = NextResponse.json({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      readme: skill.readme,
      category: skill.category,
      latest_version: skill.latestVersion,
      agent_types: skill.agentTypes,
      keywords: skill.keywords,
      license: skill.license,
      author: {
        username: skill.author.username,
        avatar_url: skill.author.avatarUrl,
      },
      downloads: skill.downloads,
      likes: skill._count.likes,
      user_liked: userLiked,
      is_verified: skill.isVerified,
      deprecated: skill.deprecated,
      versions: skill.versions.map((v) => ({
        version: v.version,
        changelog: v.changelog,
        created_at: v.createdAt.toISOString(),
      })),
      created_at: skill.createdAt.toISOString(),
      updated_at: skill.updatedAt.toISOString(),
    });

    return withCors(response);
  } catch (error) {
    console.error('Failed to get skill:', error);
    return withCors(errorResponse('INTERNAL_ERROR', 'Failed to get skill', 500));
  }
}

// --- DELETE /api/v1/skills/:name ---
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;

  // Auth required
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return withCors(authResult);
  const user = authResult as AuthUser;

  try {
    const skill = await prisma.skill.findFirst({
      where: { name, deprecated: false },
    });

    if (!skill) {
      return withCors(errorResponse('SKILL_NOT_FOUND', `Skill '${name}' not found`, 404));
    }

    // Only author or admin can delete
    if (skill.authorId !== user.id && user.role !== 'ADMIN') {
      return withCors(errorResponse('FORBIDDEN', 'Only the author or admin can deprecate this skill', 403));
    }

    // Soft delete: set deprecated = true, rename to free up the name
    const timestamp = Date.now();
    await prisma.skill.update({
      where: { id: skill.id },
      data: {
        deprecated: true,
        name: `${name}__deprecated_${timestamp}`,
      },
    });

    const response = NextResponse.json({
      deprecated: true,
      message: 'Skill has been deprecated. Existing installations will continue to work.',
    });

    return withCors(response);
  } catch (error) {
    console.error('Failed to deprecate skill:', error);
    return withCors(errorResponse('INTERNAL_ERROR', 'Failed to deprecate skill', 500));
  }
}
