import { NextRequest, NextResponse } from 'next/server';
import * as crypto from 'crypto';
import { prisma } from '@/lib/prisma';
import { errorResponse, withCors, handleCorsPreflightResponse } from '@/lib/api-middleware';

/**
 * Generate a random device code
 */
function generateDeviceCode(): string {
  return crypto.randomBytes(20).toString('hex');
}

/**
 * Generate a user-friendly code in the format ABCD-1234
 */
function generateUserCode(): string {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ'; // no I, O to avoid confusion
  const digits = '0123456789';

  let code = '';
  for (let i = 0; i < 4; i++) {
    code += chars[crypto.randomInt(chars.length)];
  }
  code += '-';
  for (let i = 0; i < 4; i++) {
    code += digits[crypto.randomInt(digits.length)];
  }
  return code;
}

const DEVICE_CODE_EXPIRY_SECONDS = 900; // 15 minutes
const POLL_INTERVAL_SECONDS = 5;

/**
 * POST /api/v1/auth/device
 * Start a device code flow. Called by CLI.
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const clientId = body?.client_id;

    if (!clientId || typeof clientId !== 'string') {
      return withCors(
        errorResponse('VALIDATION_ERROR', 'client_id is required', 422)
      );
    }

    const deviceCode = generateDeviceCode();
    const userCode = generateUserCode();
    const expiresAt = new Date(Date.now() + DEVICE_CODE_EXPIRY_SECONDS * 1000);

    // Store in DB
    await prisma.deviceCode.create({
      data: {
        code: deviceCode,
        userCode,
        clientId,
        status: 'pending',
        expiresAt,
      },
    });

    const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';

    const response = NextResponse.json({
      device_code: deviceCode,
      user_code: userCode,
      verification_url: `${baseUrl}/device`,
      expires_in: DEVICE_CODE_EXPIRY_SECONDS,
      interval: POLL_INTERVAL_SECONDS,
    });

    return withCors(response);
  } catch (error) {
    console.error('Device code creation error:', error);
    return withCors(
      errorResponse('INTERNAL_ERROR', 'Internal server error', 500)
    );
  }
}

export async function OPTIONS() {
  return handleCorsPreflightResponse();
}
