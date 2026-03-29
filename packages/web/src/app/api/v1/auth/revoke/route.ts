import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { hashRefreshToken } from '@/lib/jwt';
import { errorResponse, withCors, handleCorsPreflightResponse } from '@/lib/api-middleware';

/**
 * POST /api/v1/auth/revoke
 * Revoke a refresh token (logout).
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { refresh_token } = body || {};

    if (!refresh_token || typeof refresh_token !== 'string') {
      return withCors(
        errorResponse('VALIDATION_ERROR', 'refresh_token is required', 422)
      );
    }

    const tokenHash = hashRefreshToken(refresh_token);

    // Find and revoke the token
    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (storedToken && !storedToken.revokedAt) {
      await prisma.refreshToken.update({
        where: { id: storedToken.id },
        data: { revokedAt: new Date() },
      });
    }

    // Always return 204 regardless of whether token was found
    // (prevents token enumeration)
    const response = new NextResponse(null, { status: 204 });
    return withCors(response);
  } catch (error) {
    console.error('Token revocation error:', error);
    return withCors(
      errorResponse('INTERNAL_ERROR', 'Internal server error', 500)
    );
  }
}

export async function OPTIONS() {
  return handleCorsPreflightResponse();
}
