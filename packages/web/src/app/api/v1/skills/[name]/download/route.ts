import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  getAuthUser,
  errorResponse,
  withCors,
  handleCorsPreflightResponse,
} from '@/lib/api-middleware';
import { checkRateLimit } from '@/lib/rate-limit';
import { getStorageProvider } from '@/lib/github-storage';

// --- OPTIONS ---
export async function OPTIONS() {
  return handleCorsPreflightResponse();
}

// --- GET /api/v1/skills/:name/download ---
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;

  // Optional auth
  const auth = await getAuthUser(request);
  const userId = auth.authenticated ? auth.user.id : undefined;

  // Rate limit
  const rateLimited = await checkRateLimit(request, userId);
  if (rateLimited) return withCors(rateLimited);

  const { searchParams } = new URL(request.url);
  const requestedVersion = searchParams.get('version') || 'latest';

  try {
    // Find skill (allow deprecated downloads with warning)
    const skill = await prisma.skill.findFirst({
      where: { name },
      include: {
        versions: {
          select: { version: true, repoPath: true },
          orderBy: { createdAt: 'desc' },
        },
      },
    });

    // Also try deprecated name pattern
    if (!skill) {
      return withCors(errorResponse('SKILL_NOT_FOUND', `Skill '${name}' not found`, 404));
    }

    // Determine version to download
    let version: string;
    if (requestedVersion === 'latest') {
      version = skill.latestVersion;
    } else {
      const versionExists = skill.versions.find((v) => v.version === requestedVersion);
      if (!versionExists) {
        return withCors(
          errorResponse('SKILL_NOT_FOUND', `Version '${requestedVersion}' not found`, 404)
        );
      }
      version = requestedVersion;
    }

    // Download from GitHub
    const storage = getStorageProvider();
    const files = await storage.download(name, version);

    // Atomic downloads increment
    await prisma.skill.update({
      where: { id: skill.id },
      data: { downloads: { increment: 1 } },
    });

    // Log activity for authenticated users (with 10min dedup)
    if (userId) {
      const tenMinAgo = new Date(Date.now() - 10 * 60 * 1000);
      const recentLog = await prisma.activityLog.findFirst({
        where: {
          userId,
          skillId: skill.id,
          action: 'INSTALL',
          createdAt: { gt: tenMinAgo },
        },
      });

      if (!recentLog) {
        await prisma.activityLog.create({
          data: {
            action: 'INSTALL',
            userId,
            skillId: skill.id,
            metadata: { version },
          },
        });
      }
    }

    const responseData: Record<string, unknown> = {
      name: skill.name,
      version,
      agent_types: skill.agentTypes,
      is_verified: skill.isVerified,
      files: files.map((f) => ({ path: f.path, content: f.content })),
    };

    if (skill.deprecated) {
      responseData.deprecated = true;
      responseData.deprecated_message =
        'This skill has been deprecated. Consider finding an alternative.';
    }

    const response = NextResponse.json(responseData);
    return withCors(response);
  } catch (error) {
    console.error('Failed to download skill:', error);
    return withCors(errorResponse('INTERNAL_ERROR', 'Failed to download skill', 500));
  }
}
