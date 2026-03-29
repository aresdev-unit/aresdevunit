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

const patchUserSchema = z.object({
  role: z.enum(['USER', 'ADMIN']),
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

  // Prevent self role change
  if (id === user.id) {
    return withCors(errorResponse('VALIDATION_ERROR', 'Cannot change your own role', 422));
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return withCors(errorResponse('VALIDATION_ERROR', 'Invalid JSON body', 422));
  }

  const parsed = patchUserSchema.safeParse(body);
  if (!parsed.success) {
    const message = parsed.error.errors.map((e) => `${e.path.join('.')}: ${e.message}`).join(', ');
    return withCors(errorResponse('VALIDATION_ERROR', message, 422));
  }

  try {
    const targetUser = await prisma.user.findUnique({ where: { id } });
    if (!targetUser) {
      return withCors(errorResponse('NOT_FOUND', 'User not found', 404));
    }

    const updated = await prisma.user.update({
      where: { id },
      data: { role: parsed.data.role },
    });

    return withCors(
      NextResponse.json({
        id: updated.id,
        username: updated.username,
        role: updated.role,
      })
    );
  } catch (error) {
    console.error('Failed to update user:', error);
    return withCors(errorResponse('INTERNAL_ERROR', 'Failed to update user', 500));
  }
}
