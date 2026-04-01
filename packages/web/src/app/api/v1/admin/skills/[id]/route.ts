import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireAuth,
  withCors,
  errorResponse,
  handleCorsPreflightResponse,
  type AuthUser,
} from '@/lib/api-middleware';
import { z } from 'zod';

export async function OPTIONS() {
  return handleCorsPreflightResponse();
}

const patchSkillSchema = z.object({
  is_verified: z.boolean().optional(),
  deprecated: z.boolean().optional(),
}).refine((data) => data.is_verified !== undefined || data.deprecated !== undefined, {
  message: 'At least one of is_verified or deprecated must be provided',
});

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return withCors(authResult);
  const user = authResult as AuthUser;

  if (user.role !== 'ADMIN') {
    return withCors(errorResponse('FORBIDDEN', 'Admin access required', 403));
  }

  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withCors(errorResponse('VALIDATION_ERROR', 'Invalid JSON body', 422));
  }

  const parsed = patchSkillSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    return withCors(errorResponse('VALIDATION_ERROR', message, 422));
  }

  try {
    const skill = await prisma.skill.findUnique({ where: { id } });
    if (!skill) {
      return withCors(errorResponse('NOT_FOUND', 'Skill not found', 404));
    }

    const updateData: Record<string, boolean> = {};
    if (parsed.data.is_verified !== undefined) {
      updateData.isVerified = parsed.data.is_verified;
    }
    if (parsed.data.deprecated !== undefined) {
      updateData.deprecated = parsed.data.deprecated;
    }

    const updated = await prisma.skill.update({
      where: { id },
      data: updateData,
    });

    return withCors(
      NextResponse.json({
        id: updated.id,
        name: updated.name,
        is_verified: updated.isVerified,
        deprecated: updated.deprecated,
      })
    );
  } catch (error) {
    console.error('Failed to update skill:', error);
    return withCors(errorResponse('INTERNAL_ERROR', 'Failed to update skill', 500));
  }
}
