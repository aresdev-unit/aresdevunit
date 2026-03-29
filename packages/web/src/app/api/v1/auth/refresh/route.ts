import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  generateAccessToken,
  generateRefreshToken,
  hashRefreshToken,
  getRefreshTokenExpiry,
  getAccessTokenExpirySeconds,
} from '@/lib/jwt';
import { errorResponse, withCors, handleCorsPreflightResponse } from '@/lib/api-middleware';

/**
 * POST /api/v1/auth/refresh
 * Refresh access token using a refresh token.
 * Implements refresh token rotation: old token is revoked, new one issued.
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

    // Find the refresh token in DB
    const storedToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!storedToken) {
      return withCors(
        errorResponse('UNAUTHORIZED', 'Invalid refresh token', 401)
      );
    }

    // Check if revoked
    if (storedToken.revokedAt) {
      return withCors(
        errorResponse('UNAUTHORIZED', 'Refresh token has been revoked', 401)
      );
    }

    // Check if expired
    if (new Date() > storedToken.expiresAt) {
      return withCors(
        errorResponse('UNAUTHORIZED', 'Refresh token has expired', 401)
      );
    }

    const user = storedToken.user;

    // Revoke old refresh token (rotation)
    await prisma.refreshToken.update({
      where: { id: storedToken.id },
      data: { revokedAt: new Date() },
    });

    // Generate new tokens
    const newAccessToken = generateAccessToken({
      id: user.id,
      username: user.username,
      role: user.role,
    });

    const newRefreshToken = generateRefreshToken();
    const newTokenHash = hashRefreshToken(newRefreshToken);

    // Store new refresh token
    await prisma.refreshToken.create({
      data: {
        tokenHash: newTokenHash,
        userId: user.id,
        expiresAt: getRefreshTokenExpiry(),
      },
    });

    const response = NextResponse.json({
      access_token: newAccessToken,
      refresh_token: newRefreshToken,
      expires_in: getAccessTokenExpirySeconds(),
    });

    return withCors(response);
  } catch (error) {
    console.error('Token refresh error:', error);
    return withCors(
      errorResponse('INTERNAL_ERROR', 'Internal server error', 500)
    );
  }
}

export async function OPTIONS() {
  return handleCorsPreflightResponse();
}
