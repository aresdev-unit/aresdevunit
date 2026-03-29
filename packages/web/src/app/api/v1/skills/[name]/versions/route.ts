import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireAuth,
  errorResponse,
  withCors,
  handleCorsPreflightResponse,
  type AuthUser,
} from '@/lib/api-middleware';
import { checkRateLimit } from '@/lib/rate-limit';
import { getStorageProvider } from '@/lib/github-storage';
import { z } from 'zod';
import { FILE_CONSTRAINTS } from '@aresdevunit/shared';
import * as crypto from 'crypto';

const addVersionSchema = z.object({
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be valid semver'),
  changelog: z.string().optional(),
  files: z
    .array(
      z.object({
        path: z.string().min(1),
        content: z.string().min(1),
      })
    )
    .min(1, 'At least one file required')
    .max(FILE_CONSTRAINTS.MAX_FILES),
});

// --- OPTIONS ---
export async function OPTIONS() {
  return handleCorsPreflightResponse();
}

// --- POST /api/v1/skills/:name/versions ---
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ name: string }> }
) {
  const { name } = await params;

  // Auth required
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return withCors(authResult);
  const user = authResult as AuthUser;

  // Rate limit (using publish limit)
  const rateLimited = await checkRateLimit(request, user.id);
  if (rateLimited) return withCors(rateLimited);

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withCors(errorResponse('VALIDATION_ERROR', 'Invalid JSON body', 422));
  }

  const parsed = addVersionSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    return withCors(errorResponse('VALIDATION_ERROR', message, 422));
  }

  const input = parsed.data;

  // Validate file sizes
  let totalSize = 0;
  for (const file of input.files) {
    const fileSize = Buffer.from(file.content, 'base64').length;
    if (fileSize > FILE_CONSTRAINTS.MAX_FILE_SIZE) {
      return withCors(
        errorResponse('VALIDATION_ERROR', `File ${file.path} exceeds size limit`, 422)
      );
    }
    totalSize += fileSize;
  }
  if (totalSize > FILE_CONSTRAINTS.MAX_TOTAL_SIZE) {
    return withCors(
      errorResponse('VALIDATION_ERROR', 'Total file size exceeds limit', 422)
    );
  }

  // Server-side prompt injection scan (SPEC 6.5)
  const INJECTION_PATTERNS = [
    /ignore\s+(all\s+)?previous\s+instructions/i,
    /ignore\s+(all\s+)?above\s+instructions/i,
    /disregard\s+(all\s+)?previous/i,
    /you\s+are\s+now\s+/i,
    /new\s+instructions?\s*:/i,
    /system\s*:\s*/i,
    /<system>/i,
    /\]\s*\(\s*https?:\/\//i,
  ];

  for (const file of input.files) {
    const decoded = Buffer.from(file.content, 'base64').toString('utf-8');
    if (INJECTION_PATTERNS.some((p) => p.test(decoded))) {
      // Flag but don't block (SPEC 6.5)
      (input as any).prompt_injection_warning = true;
    }
  }

  const storage = getStorageProvider();

  // Compute file hash using shared utility
  const { computeFileHash } = await import('@aresdevunit/shared');
  const fileHash = computeFileHash(input.files.map((f) => f.content).join(''));

  try {
    // Pre-check: verify skill exists and user is authorized (outside transaction, non-authoritative)
    const preCheck = await prisma.skill.findFirst({
      where: { name, deprecated: false },
    });
    if (!preCheck) {
      return withCors(errorResponse('SKILL_NOT_FOUND', `Skill '${name}' not found`, 404));
    }
    if (preCheck.authorId !== user.id) {
      return withCors(errorResponse('FORBIDDEN', 'Only the author can add versions', 403));
    }

    // 1. Upload to GitHub (outside transaction to avoid holding DB lock during external I/O)
    await storage.upload(name, input.version, input.files);

    let result;
    try {
      // 2. DB operations with advisory lock (short transaction - DB only)
      result = await prisma.$transaction(async (tx) => {
        // Advisory lock on skill name
        const lockKey = crypto.createHash('md5').update(name).digest();
        const lockId = lockKey.readInt32BE(0);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;

        // Find existing skill (authoritative check under lock)
        const skill = await tx.skill.findFirst({
          where: { name, deprecated: false },
        });

        if (!skill) {
          throw { code: 'SKILL_NOT_FOUND', status: 404 };
        }

        if (skill.authorId !== user.id) {
          throw { code: 'FORBIDDEN', status: 403 };
        }

        // Check version doesn't already exist
        const existingVersion = await tx.skillVersion.findFirst({
          where: { skillId: skill.id, version: input.version },
        });

        if (existingVersion) {
          throw { code: 'VERSION_ALREADY_EXISTS', status: 409 };
        }

        // Create version and update skill
        await tx.skillVersion.create({
          data: {
            skillId: skill.id,
            version: input.version,
            changelog: input.changelog || null,
            repoPath: `skills/${name}/${input.version}`,
            fileHash: fileHash,
          },
        });

        await tx.skill.update({
          where: { id: skill.id },
          data: { latestVersion: input.version },
        });

        // Log activity
        await tx.activityLog.create({
          data: {
            action: 'UPDATE',
            userId: user.id,
            skillId: skill.id,
            metadata: {
              version: input.version,
              ...((input as any).prompt_injection_warning
                ? { prompt_injection_warning: true }
                : {}),
            },
          },
        });

        return skill;
      });
    } catch (err) {
      // 3. Rollback GitHub on DB failure
      await storage.delete(name, input.version).catch(() => {});
      throw err;
    }

    const baseUrl = process.env.NEXTAUTH_URL || 'https://hub.aresdevunit.com';
    const response = NextResponse.json({
      id: result.id,
      name: result.name,
      version: input.version,
      url: `${baseUrl}/skills/${result.name}`,
    });

    return withCors(response);
  } catch (error: any) {
    if (error?.code === 'SKILL_NOT_FOUND') {
      return withCors(errorResponse('SKILL_NOT_FOUND', `Skill '${name}' not found`, 404));
    }
    if (error?.code === 'FORBIDDEN') {
      return withCors(errorResponse('FORBIDDEN', 'Only the author can add versions', 403));
    }
    if (error?.code === 'VERSION_ALREADY_EXISTS') {
      return withCors(errorResponse('VERSION_ALREADY_EXISTS', 'This version already exists', 409));
    }

    console.error('Failed to add version:', error);
    return withCors(errorResponse('INTERNAL_ERROR', 'Failed to add version', 500));
  }
}
