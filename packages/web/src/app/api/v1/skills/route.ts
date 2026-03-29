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
import { getStorageProvider } from '@/lib/github-storage';
import { z } from 'zod';
import { skillNameSchema, FILE_CONSTRAINTS, CATEGORY_VALUES, AGENT_TYPES } from '@aresdevunit/shared';
import * as crypto from 'crypto';

// --- Validation Schema for POST /api/v1/skills ---
const createSkillSchema = z.object({
  name: skillNameSchema,
  description: z.string().min(10).max(200),
  readme: z.string().optional(),
  category: z.enum(CATEGORY_VALUES as [string, ...string[]]),
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be valid semver'),
  changelog: z.string().optional(),
  agent_types: z
    .array(z.enum(AGENT_TYPES as [string, ...string[]]))
    .min(1, 'At least one agent type required'),
  keywords: z.array(z.string().max(30)).max(10).default([]),
  license: z.string().default('MIT'),
  files: z
    .array(
      z.object({
        path: z.string().min(1),
        content: z.string().min(1), // base64
      })
    )
    .min(1, 'At least one file required')
    .max(FILE_CONSTRAINTS.MAX_FILES),
});

// --- OPTIONS ---
export async function OPTIONS() {
  return handleCorsPreflightResponse();
}

// --- GET /api/v1/skills ---
export async function GET(request: NextRequest) {
  // Rate limit
  const auth = await getAuthUser(request);
  const rateLimited = await checkRateLimit(
    request,
    auth.authenticated ? auth.user.id : undefined
  );
  if (rateLimited) return withCors(rateLimited);

  const { searchParams } = new URL(request.url);
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const limit = Math.min(100, Math.max(1, parseInt(searchParams.get('limit') || '20', 10)));
  const sort = searchParams.get('sort') || 'downloads';
  const category = searchParams.get('category');
  const agent = searchParams.get('agent');
  const q = searchParams.get('q');
  const includeDeprecated = searchParams.get('include_deprecated') === 'true';

  // Build where clause
  const where: Record<string, unknown> = {};
  if (!includeDeprecated) {
    where.deprecated = false;
  }
  if (category) {
    where.category = category;
  }
  if (agent) {
    where.agentTypes = { has: agent };
  }
  if (q) {
    where.OR = [
      { name: { contains: q, mode: 'insensitive' } },
      { description: { contains: q, mode: 'insensitive' } },
      { keywords: { has: q } },
    ];
  }

  // Filter by author if requested
  const authorParam = searchParams.get('author');
  if (authorParam && auth.authenticated) {
    if (authorParam === 'me') {
      where.authorId = auth.user.id;
    } else {
      where.author = { username: authorParam };
    }
  }

  // Build orderBy
  let orderBy: Record<string, string>;
  switch (sort) {
    case 'latest':
      orderBy = { createdAt: 'desc' };
      break;
    case 'name':
      orderBy = { name: 'asc' };
      break;
    case 'likes':
      // We'll use a different approach for likes sorting
      orderBy = { downloads: 'desc' }; // fallback, actual likes sorting below
      break;
    case 'downloads':
    default:
      orderBy = { downloads: 'desc' };
      break;
  }

  try {
    const [skills, total] = await Promise.all([
      prisma.skill.findMany({
        where: where as any,
        orderBy: orderBy as any,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          author: { select: { username: true, avatarUrl: true } },
          _count: { select: { likes: true } },
        },
      }),
      prisma.skill.count({ where: where as any }),
    ]);

    const data = skills.map((skill) => ({
      id: skill.id,
      name: skill.name,
      description: skill.description,
      category: skill.category,
      latest_version: skill.latestVersion,
      agent_types: skill.agentTypes,
      author: {
        username: skill.author.username,
        avatar_url: skill.author.avatarUrl,
      },
      downloads: skill.downloads,
      likes: skill._count.likes,
      is_verified: skill.isVerified,
      deprecated: skill.deprecated,
      created_at: skill.createdAt.toISOString(),
    }));

    // Sort by likes if requested (post-query sort since Prisma can't sort by _count easily in all cases)
    if (sort === 'likes') {
      data.sort((a, b) => b.likes - a.likes);
    }

    const response = NextResponse.json({
      data,
      pagination: {
        page,
        limit,
        total,
        total_pages: Math.ceil(total / limit),
      },
    });

    return withCors(response);
  } catch (error) {
    console.error('Failed to list skills:', error);
    return withCors(errorResponse('INTERNAL_ERROR', 'Failed to list skills', 500));
  }
}

// --- POST /api/v1/skills ---
export async function POST(request: NextRequest) {
  // Auth required
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return withCors(authResult);
  const user = authResult as AuthUser;

  // Rate limit
  const rateLimited = await checkRateLimit(request, user.id);
  if (rateLimited) return withCors(rateLimited);

  // Parse body
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withCors(errorResponse('VALIDATION_ERROR', 'Invalid JSON body', 422));
  }

  // Validate
  const parsed = createSkillSchema.safeParse(body);
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
        errorResponse('VALIDATION_ERROR', `File ${file.path} exceeds ${FILE_CONSTRAINTS.MAX_FILE_SIZE / 1024}KB limit`, 422)
      );
    }
    totalSize += fileSize;
  }
  if (totalSize > FILE_CONSTRAINTS.MAX_TOTAL_SIZE) {
    return withCors(
      errorResponse('VALIDATION_ERROR', `Total file size exceeds ${FILE_CONSTRAINTS.MAX_TOTAL_SIZE / 1024}KB limit`, 422)
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
    const hasInjection = INJECTION_PATTERNS.some((p) => p.test(decoded));
    if (hasInjection) {
      // Don't block, but flag in metadata (SPEC: "스캔 실패 시 publish 차단하지 않되 경고 플래그")
      // Metadata will be stored with the skill version
      input.metadata = { ...((input as any).metadata || {}), prompt_injection_warning: true };
    }
  }

  const storage = getStorageProvider();

  // Compute file hash using shared utility
  const { computeFileHash } = await import('@aresdevunit/shared');
  const fileHash = computeFileHash(input.files.map((f) => f.content).join(''));

  try {
    // 1. Upload to GitHub (outside transaction to avoid holding DB lock during external I/O)
    await storage.upload(input.name, input.version, input.files);

    let result;
    try {
      // 2. DB insert with advisory lock (short transaction - DB operations only)
      result = await prisma.$transaction(async (tx) => {
        // Advisory lock on skill name to prevent concurrent publishes
        const lockKey = crypto.createHash('md5').update(input.name).digest();
        const lockId = lockKey.readInt32BE(0);
        await tx.$executeRaw`SELECT pg_advisory_xact_lock(${lockId})`;

        // Check if skill already exists (active, not deprecated)
        const existing = await tx.skill.findFirst({
          where: { name: input.name, deprecated: false },
        });

        if (existing) {
          throw { code: 'SKILL_ALREADY_EXISTS', status: 409 };
        }

        // Create skill + version in DB
        const skill = await tx.skill.create({
          data: {
            name: input.name,
            description: input.description,
            readme: input.readme || null,
            category: input.category,
            latestVersion: input.version,
            agentTypes: input.agent_types,
            keywords: input.keywords,
            license: input.license,
            authorId: user.id,
            versions: {
              create: {
                version: input.version,
                changelog: input.changelog || null,
                repoPath: `skills/${input.name}/${input.version}`,
                fileHash: fileHash,
              },
            },
          },
        });

        // Log activity
        await tx.activityLog.create({
          data: {
            action: 'PUBLISH',
            userId: user.id,
            skillId: skill.id,
            metadata: {
              version: input.version,
              ...((input as any).metadata?.prompt_injection_warning
                ? { prompt_injection_warning: true }
                : {}),
            },
          },
        });

        return skill;
      });
    } catch (err) {
      // 3. Rollback GitHub on DB failure
      await storage.delete(input.name, input.version).catch(() => {});
      throw err;
    }

    const baseUrl = process.env.NEXTAUTH_URL || 'https://hub.aresdevunit.com';
    const response = NextResponse.json(
      {
        id: result.id,
        name: result.name,
        version: input.version,
        url: `${baseUrl}/skills/${result.name}`,
      },
      { status: 201 }
    );

    return withCors(response);
  } catch (error: any) {
    // Handle known error codes
    if (error?.code === 'SKILL_ALREADY_EXISTS') {
      return withCors(
        errorResponse('SKILL_ALREADY_EXISTS', 'Skill with this name already exists', 409)
      );
    }

    console.error('Failed to create skill:', error);
    return withCors(errorResponse('INTERNAL_ERROR', 'Failed to create skill', 500));
  }
}
