import { NextRequest, NextResponse } from 'next/server';
import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import {
  getAuthUser,
  requireApproved,
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

function parsePositiveInt(value: string | null, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

function isSafeSkillFilePath(path: string): boolean {
  if (!path || path.startsWith('/') || path.startsWith('\\')) {
    return false;
  }

  const normalized = path.replace(/\\/g, '/');
  if (!/^[A-Za-z0-9._/-]+$/.test(normalized)) {
    return false;
  }

  const segments = normalized.split('/');
  return segments.every((segment) => segment.length > 0 && segment !== '.' && segment !== '..');
}

function isStrictBase64(value: string): boolean {
  if (!/^[A-Za-z0-9+/]+={0,2}$/.test(value) || value.length % 4 !== 0) {
    return false;
  }

  try {
    return Buffer.from(value, 'base64').toString('base64') === value;
  } catch {
    return false;
  }
}

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
  const page = parsePositiveInt(searchParams.get('page'), 1);
  const limit = Math.min(100, parsePositiveInt(searchParams.get('limit'), 20));
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
  if (authorParam) {
    if (authorParam === 'me' && auth.authenticated) {
      where.authorId = auth.user.id;
    } else if (authorParam !== 'me') {
      where.author = { username: authorParam };
    }
  }

  // Build orderBy
  let orderBy: Prisma.SkillOrderByWithRelationInput | Prisma.SkillOrderByWithRelationInput[];
  switch (sort) {
    case 'latest':
      orderBy = { createdAt: 'desc' };
      break;
    case 'name':
      orderBy = { name: 'asc' };
      break;
    case 'likes':
      orderBy = [{ likes: { _count: 'desc' } }, { downloads: 'desc' }];
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
        orderBy,
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
  const authResult = await requireApproved(request);
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
    if (!isSafeSkillFilePath(file.path)) {
      return withCors(
        errorResponse(
          'VALIDATION_ERROR',
          `File path ${file.path} is invalid`,
          422
        )
      );
    }

    if (!isStrictBase64(file.content)) {
      return withCors(
        errorResponse(
          'VALIDATION_ERROR',
          `File ${file.path} content must be valid base64`,
          422
        )
      );
    }

    const hasAllowedExtension = FILE_CONSTRAINTS.ALLOWED_EXTENSIONS.some((ext) =>
      file.path.toLowerCase().endsWith(ext)
    );
    if (!hasAllowedExtension) {
      return withCors(
        errorResponse(
          'VALIDATION_ERROR',
          `File ${file.path} must use one of: ${FILE_CONSTRAINTS.ALLOWED_EXTENSIONS.join(', ')}`,
          422
        )
      );
    }

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

  let promptInjectionWarning = false;
  for (const file of input.files) {
    const decoded = Buffer.from(file.content, 'base64').toString('utf-8');
    if (INJECTION_PATTERNS.some((p) => p.test(decoded))) {
      promptInjectionWarning = true;
      break;
    }
  }

  const storage = getStorageProvider();

  // Compute file hash using shared utility
  const { computeFileHash } = await import('@aresdevunit/shared');
  const fileHash = computeFileHash(input.files.map((f) => f.content).join(''));

  try {
    const existingSkill = await prisma.skill.findFirst({
      where: { name: input.name, deprecated: false },
      select: { id: true },
    });
    if (existingSkill) {
      return withCors(
        errorResponse('SKILL_ALREADY_EXISTS', 'Skill with this name already exists', 409)
      );
    }

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
              ...(promptInjectionWarning ? { prompt_injection_warning: true } : {}),
            },
          },
        });

        return skill;
      });
    } catch (err) {
      const publishedVersion = await prisma.skillVersion.findFirst({
        where: {
          version: input.version,
          skill: {
            name: input.name,
            deprecated: false,
          },
        },
        select: { id: true },
      });

      if (!publishedVersion) {
        await storage.delete(input.name, input.version).catch(() => {});
      }
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
