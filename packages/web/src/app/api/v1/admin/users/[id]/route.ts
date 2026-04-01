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
  role: z.enum(['USER', 'ADMIN']).optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
}).refine(data => data.role !== undefined || data.status !== undefined, {
  message: 'At least one of role or status is required',
}).refine(data => !(data.role === 'ADMIN' && data.status === 'REJECTED'), {
  message: 'Cannot set ADMIN role with REJECTED status',
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

  // Prevent self modification
  if (id === user.id) {
    return withCors(errorResponse('VALIDATION_ERROR', 'Cannot modify your own account', 422));
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

    const updateData: Record<string, string> = {};
    if (parsed.data.role !== undefined) updateData.role = parsed.data.role;
    if (parsed.data.status !== undefined) updateData.status = parsed.data.status;

    // Cross-check: prevent ADMIN + REJECTED combination (even across separate requests)
    const finalRole = updateData.role || targetUser.role;
    const finalStatus = updateData.status || targetUser.status;
    if (finalRole === 'ADMIN' && finalStatus === 'REJECTED') {
      return withCors(errorResponse('VALIDATION_ERROR', 'Cannot set ADMIN role with REJECTED status', 422));
    }

    const updated = await prisma.user.update({
      where: { id },
      data: updateData,
    });

    // Revoke all refresh tokens when rejecting a user
    if (parsed.data.status === 'REJECTED') {
      await prisma.refreshToken.updateMany({
        where: { userId: id, revokedAt: null },
        data: { revokedAt: new Date() },
      });
    }

    return withCors(
      NextResponse.json({
        id: updated.id,
        username: updated.username,
        role: updated.role,
        status: updated.status,
      })
    );
  } catch (error) {
    console.error('Failed to update user:', error);
    return withCors(errorResponse('INTERNAL_ERROR', 'Failed to update user', 500));
  }
}
