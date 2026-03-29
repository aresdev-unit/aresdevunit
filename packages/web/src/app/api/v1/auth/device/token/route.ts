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
 * POST /api/v1/auth/device/token
 * Poll for device code authorization. Called by CLI.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { device_code, client_id } = body || {};

    if (!device_code || !client_id) {
      return withCors(
        errorResponse('VALIDATION_ERROR', 'device_code and client_id are required', 422)
      );
    }

    // Look up device code
    const deviceCodeRecord = await prisma.deviceCode.findUnique({
      where: { code: device_code },
      include: { user: true },
    });

    if (!deviceCodeRecord) {
      return withCors(
        errorResponse('VALIDATION_ERROR', 'Invalid device code', 422)
      );
    }

    // Check client_id matches
    if (deviceCodeRecord.clientId !== client_id) {
      return withCors(
        errorResponse('VALIDATION_ERROR', 'Invalid client_id', 422)
      );
    }

    // Check expiration
    if (new Date() > deviceCodeRecord.expiresAt) {
      // Mark as expired if not already
      if (deviceCodeRecord.status !== 'expired') {
        await prisma.deviceCode.update({
          where: { id: deviceCodeRecord.id },
          data: { status: 'expired' },
        });
      }
      return withCors(
        errorResponse('VALIDATION_ERROR', 'Device code has expired', 422)
      );
    }

    // Check status
    if (deviceCodeRecord.status === 'expired') {
      return withCors(
        errorResponse('VALIDATION_ERROR', 'Device code has expired', 422)
      );
    }

    if (deviceCodeRecord.status === 'pending') {
      return withCors(
        errorResponse('AUTHORIZATION_PENDING', 'User has not yet authorized', 400)
      );
    }

    // status === 'approved' and user exists
    if (deviceCodeRecord.status === 'approved' && deviceCodeRecord.user) {
      const user = deviceCodeRecord.user;

      // Generate tokens
      const accessToken = generateAccessToken({
        id: user.id,
        username: user.username,
        role: user.role,
      });

      const refreshToken = generateRefreshToken();
      const tokenHash = hashRefreshToken(refreshToken);

      // Store refresh token in DB
      await prisma.refreshToken.create({
        data: {
          tokenHash,
          userId: user.id,
          expiresAt: getRefreshTokenExpiry(),
        },
      });

      // Delete the used device code
      await prisma.deviceCode.delete({
        where: { id: deviceCodeRecord.id },
      });

      const response = NextResponse.json({
        access_token: accessToken,
        refresh_token: refreshToken,
        token_type: 'Bearer' as const,
        expires_in: getAccessTokenExpirySeconds(),
      });

      return withCors(response);
    }

    // Unexpected state
    return withCors(
      errorResponse('INTERNAL_ERROR', 'Unexpected device code state', 500)
    );
  } catch (error) {
    console.error('Device token exchange error:', error);
    return withCors(
      errorResponse('INTERNAL_ERROR', 'Internal server error', 500)
    );
  }
}

export async function OPTIONS() {
  return handleCorsPreflightResponse();
}
