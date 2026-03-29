import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

describe('JWT security', () => {
  const ORIGINAL_ENV = process.env;

  beforeEach(() => {
    vi.resetModules();
    process.env = { ...ORIGINAL_ENV };
  });

  afterEach(() => {
    process.env = ORIGINAL_ENV;
  });

  it('getJwtSecret throws when JWT_SECRET is empty', async () => {
    process.env.JWT_SECRET = '';
    const { generateAccessToken } = await import('@/lib/jwt');
    expect(() =>
      generateAccessToken({ id: '1', username: 'test', role: 'USER' }),
    ).toThrow('FATAL: JWT_SECRET must be set and at least 32 characters');
  });

  it('getJwtSecret throws when JWT_SECRET is too short', async () => {
    process.env.JWT_SECRET = 'short';
    const { generateAccessToken } = await import('@/lib/jwt');
    expect(() =>
      generateAccessToken({ id: '1', username: 'test', role: 'USER' }),
    ).toThrow('FATAL: JWT_SECRET must be set and at least 32 characters');
  });

  it('getJwtSecret throws when JWT_SECRET is undefined', async () => {
    delete process.env.JWT_SECRET;
    const { generateAccessToken } = await import('@/lib/jwt');
    expect(() =>
      generateAccessToken({ id: '1', username: 'test', role: 'USER' }),
    ).toThrow('FATAL: JWT_SECRET must be set and at least 32 characters');
  });

  it('refresh token expiry is 7 days per SPEC', async () => {
    process.env.JWT_SECRET = 'a'.repeat(32);
    const { getRefreshTokenExpiry } = await import('@/lib/jwt');
    const expiry = getRefreshTokenExpiry();
    const sevenDaysMs = 7 * 24 * 60 * 60 * 1000;
    const diff = expiry.getTime() - Date.now();
    // Allow 5 second tolerance
    expect(diff).toBeGreaterThan(sevenDaysMs - 5000);
    expect(diff).toBeLessThan(sevenDaysMs + 5000);
  });

  it('timingSafeEqual handles different length signatures', async () => {
    process.env.JWT_SECRET = 'a'.repeat(32);
    const { verifyAccessToken, generateAccessToken } = await import('@/lib/jwt');
    const token = generateAccessToken({ id: '1', username: 'test', role: 'USER' });
    // Tamper with signature length
    const parts = token.split('.');
    const tamperedToken = `${parts[0]}.${parts[1]}.short`;
    expect(verifyAccessToken(tamperedToken)).toBeNull();
  });
});
