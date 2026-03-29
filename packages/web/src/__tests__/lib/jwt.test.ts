import { describe, it, expect, beforeAll, afterAll, vi } from 'vitest';

// Set JWT_SECRET before importing the module
const ORIGINAL_ENV = process.env;

beforeAll(() => {
  process.env = { ...ORIGINAL_ENV, JWT_SECRET: 'test-secret-key-for-jwt-testing-only' };
});

afterAll(() => {
  process.env = ORIGINAL_ENV;
});

describe('JWT Utility', () => {
  // Dynamic import so env is set first
  async function getJwtModule() {
    // Clear module cache to pick up env changes
    const mod = await import('@/lib/jwt');
    return mod;
  }

  describe('generateAccessToken + verifyAccessToken', () => {
    it('should generate a valid JWT and verify it', async () => {
      const jwt = await getJwtModule();
      const user = { id: 'user-123', username: 'testuser', role: 'USER' };

      const token = jwt.generateAccessToken(user);

      expect(token).toBeDefined();
      expect(typeof token).toBe('string');
      expect(token.split('.')).toHaveLength(3);

      const payload = jwt.verifyAccessToken(token);

      expect(payload).not.toBeNull();
      expect(payload!.sub).toBe('user-123');
      expect(payload!.username).toBe('testuser');
      expect(payload!.role).toBe('USER');
      expect(payload!.iat).toBeDefined();
      expect(payload!.exp).toBeDefined();
      expect(payload!.exp - payload!.iat).toBe(15 * 60); // 15 minutes
    });

    it('should return null for an invalid token', async () => {
      const jwt = await getJwtModule();

      expect(jwt.verifyAccessToken('invalid.token.here')).toBeNull();
      expect(jwt.verifyAccessToken('')).toBeNull();
      expect(jwt.verifyAccessToken('just-a-string')).toBeNull();
    });

    it('should return null for a tampered token', async () => {
      const jwt = await getJwtModule();
      const user = { id: 'user-123', username: 'testuser', role: 'USER' };

      const token = jwt.generateAccessToken(user);
      const parts = token.split('.');
      // Tamper with the payload
      parts[1] = parts[1] + 'x';
      const tamperedToken = parts.join('.');

      expect(jwt.verifyAccessToken(tamperedToken)).toBeNull();
    });

    it('should return null for an expired token', async () => {
      const jwt = await getJwtModule();

      // Mock Date.now to generate a token that's already expired
      const realDateNow = Date.now;
      const pastTime = Date.now() - 20 * 60 * 1000; // 20 minutes ago

      Date.now = vi.fn(() => pastTime);
      const user = { id: 'user-123', username: 'testuser', role: 'USER' };
      const token = jwt.generateAccessToken(user);
      Date.now = realDateNow;

      // Verify with current time - should be expired
      expect(jwt.verifyAccessToken(token)).toBeNull();
    });
  });

  describe('generateRefreshToken', () => {
    it('should generate a token prefixed with rft_', async () => {
      const jwt = await getJwtModule();

      const token = jwt.generateRefreshToken();

      expect(token).toMatch(/^rft_[a-f0-9]{64}$/);
    });

    it('should generate unique tokens', async () => {
      const jwt = await getJwtModule();

      const token1 = jwt.generateRefreshToken();
      const token2 = jwt.generateRefreshToken();

      expect(token1).not.toBe(token2);
    });
  });

  describe('hashRefreshToken', () => {
    it('should return a consistent SHA-256 hash', async () => {
      const jwt = await getJwtModule();

      const token = 'rft_abc123';
      const hash1 = jwt.hashRefreshToken(token);
      const hash2 = jwt.hashRefreshToken(token);

      expect(hash1).toBe(hash2);
      expect(hash1).toMatch(/^[a-f0-9]{64}$/);
    });

    it('should produce different hashes for different tokens', async () => {
      const jwt = await getJwtModule();

      const hash1 = jwt.hashRefreshToken('rft_abc');
      const hash2 = jwt.hashRefreshToken('rft_def');

      expect(hash1).not.toBe(hash2);
    });
  });

  describe('getRefreshTokenExpiry', () => {
    it('should return a date ~30 days in the future', async () => {
      const jwt = await getJwtModule();

      const expiry = jwt.getRefreshTokenExpiry();
      const now = new Date();
      const diffMs = expiry.getTime() - now.getTime();
      const diffDays = diffMs / (1000 * 60 * 60 * 24);

      // Should be approximately 30 days (allow small tolerance)
      expect(diffDays).toBeGreaterThan(29.9);
      expect(diffDays).toBeLessThan(30.1);
    });
  });

  describe('getAccessTokenExpirySeconds', () => {
    it('should return 900 (15 minutes)', async () => {
      const jwt = await getJwtModule();

      expect(jwt.getAccessTokenExpirySeconds()).toBe(900);
    });
  });
});
