import * as crypto from 'crypto';

function getJwtSecret(): string {
  const secret = process.env.JWT_SECRET;
  if (!secret || secret.length < 32) {
    throw new Error('FATAL: JWT_SECRET must be set and at least 32 characters');
  }
  return secret;
}

const ACCESS_TOKEN_EXPIRY = 15 * 60; // 15 minutes in seconds
const REFRESH_TOKEN_EXPIRY = 7 * 24 * 60 * 60; // 7 days per SPEC 9.1

export interface JwtPayload {
  sub: string; // user id
  username: string;
  role: string;
  iat: number;
  exp: number;
}

/**
 * Base64url encode a buffer
 */
function base64urlEncode(data: Buffer | string): string {
  const buf = typeof data === 'string' ? Buffer.from(data) : data;
  return buf.toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/**
 * Base64url decode a string
 */
function base64urlDecode(str: string): Buffer {
  let s = str.replace(/-/g, '+').replace(/_/g, '/');
  while (s.length % 4) {
    s += '=';
  }
  return Buffer.from(s, 'base64');
}

/**
 * Create HMAC-SHA256 signature
 */
function sign(input: string, secret: string): string {
  return base64urlEncode(
    crypto.createHmac('sha256', secret).update(input).digest()
  );
}

/**
 * Generate a JWT access token (HS256, 15min expiry)
 */
export function generateAccessToken(user: {
  id: string;
  username: string;
  role: string;
}): string {
  const secret = getJwtSecret();

  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'HS256', typ: 'JWT' };
  const payload: JwtPayload = {
    sub: user.id,
    username: user.username,
    role: user.role,
    iat: now,
    exp: now + ACCESS_TOKEN_EXPIRY,
  };

  const headerB64 = base64urlEncode(JSON.stringify(header));
  const payloadB64 = base64urlEncode(JSON.stringify(payload));
  const signature = sign(`${headerB64}.${payloadB64}`, secret);

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Verify and decode a JWT access token
 * Returns the payload if valid, null if invalid/expired
 */
export function verifyAccessToken(token: string): JwtPayload | null {
  const secret = getJwtSecret();

  try {
    const parts = token.split('.');
    if (parts.length !== 3) return null;

    const [headerB64, payloadB64, signatureB64] = parts;

    // Verify signature
    const expectedSignature = sign(`${headerB64}.${payloadB64}`, secret);
    const sigBuf = Buffer.from(signatureB64);
    const expectedBuf = Buffer.from(expectedSignature);
    if (sigBuf.length !== expectedBuf.length || !crypto.timingSafeEqual(sigBuf, expectedBuf)) {
      return null;
    }

    // Decode payload
    const payload: JwtPayload = JSON.parse(
      base64urlDecode(payloadB64).toString('utf-8')
    );

    // Check expiration
    const now = Math.floor(Date.now() / 1000);
    if (payload.exp < now) {
      return null;
    }

    return payload;
  } catch {
    return null;
  }
}

/**
 * Generate a random refresh token string prefixed with "rft_"
 */
export function generateRefreshToken(): string {
  const randomBytes = crypto.randomBytes(32);
  return `rft_${randomBytes.toString('hex')}`;
}

/**
 * Hash a refresh token with SHA-256 for storage
 */
export function hashRefreshToken(token: string): string {
  return crypto.createHash('sha256').update(token).digest('hex');
}

/**
 * Get refresh token expiry date (7 days from now per SPEC 9.1)
 */
export function getRefreshTokenExpiry(): Date {
  return new Date(Date.now() + REFRESH_TOKEN_EXPIRY * 1000);
}

/**
 * Get access token expiry in seconds
 */
export function getAccessTokenExpirySeconds(): number {
  return ACCESS_TOKEN_EXPIRY;
}
