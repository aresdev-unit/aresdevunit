import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { prisma } from '@/lib/prisma';
import { errorResponse, withCors } from '@/lib/api-middleware';

/**
 * POST /api/v1/auth/device/approve
 * Approve a device code. Called from the /device web page after user logs in.
 * Requires NextAuth session (web-only endpoint).
 */
export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);

    if (!session?.user?.id) {
      return withCors(
        errorResponse('UNAUTHORIZED', 'Authentication required', 401)
      );
    }

    const body = await request.json();
    const { user_code } = body || {};

    if (!user_code || typeof user_code !== 'string') {
      return withCors(
        errorResponse('VALIDATION_ERROR', 'user_code is required', 422)
      );
    }

    // Find pending device code by user_code
    const deviceCode = await prisma.deviceCode.findFirst({
      where: {
        userCode: user_code.toUpperCase(),
        status: 'pending',
        expiresAt: { gt: new Date() },
      },
    });

    if (!deviceCode) {
      return withCors(
        errorResponse(
          'VALIDATION_ERROR',
          'Invalid or expired code. Please check the code and try again.',
          422
        )
      );
    }

    // Approve the device code
    await prisma.deviceCode.update({
      where: { id: deviceCode.id },
      data: {
        status: 'approved',
        userId: session.user.id,
      },
    });

    const response = NextResponse.json({ status: 'approved' });
    return withCors(response);
  } catch (error) {
    console.error('Device approval error:', error);
    return withCors(
      errorResponse('INTERNAL_ERROR', 'Internal server error', 500)
    );
  }
}
