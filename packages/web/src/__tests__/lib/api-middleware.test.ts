import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock jwt module
vi.mock('@/lib/jwt', () => ({
  verifyAccessToken: vi.fn(),
}));

// Mock next-auth
vi.mock('next-auth', () => ({
  getServerSession: vi.fn(),
}));

// Mock auth config
vi.mock('@/lib/auth', () => ({
  authOptions: {},
}));

import { verifyAccessToken } from '@/lib/jwt';
import { getServerSession } from 'next-auth';

// We need to test the logic, so let's import after mocks
import { getAuthUser } from '@/lib/api-middleware';

describe('getAuthUser', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns user from Bearer JWT when valid', async () => {
    const mockPayload = { sub: 'user-1', username: 'john', role: 'USER' };
    vi.mocked(verifyAccessToken).mockReturnValue({
      ...mockPayload,
      iat: 1000,
      exp: 2000,
    });

    const request = new Request('http://localhost/api/test', {
      headers: { Authorization: 'Bearer valid-token' },
    });

    const result = await getAuthUser(request as any);
    expect(result).toEqual({
      userId: 'user-1',
      username: 'john',
      role: 'USER',
    });
    expect(verifyAccessToken).toHaveBeenCalledWith('valid-token');
  });

  it('returns null for invalid Bearer JWT without falling back to session', async () => {
    vi.mocked(verifyAccessToken).mockReturnValue(null);

    const request = new Request('http://localhost/api/test', {
      headers: { Authorization: 'Bearer invalid-token' },
    });

    const result = await getAuthUser(request as any);
    expect(result).toBeNull();
    // Should NOT check session when Bearer is present but invalid
    expect(getServerSession).not.toHaveBeenCalled();
  });

  it('falls back to session when no Bearer header', async () => {
    vi.mocked(getServerSession).mockResolvedValue({
      user: { id: 'user-2', name: 'jane', role: 'ADMIN' },
    } as any);

    const request = new Request('http://localhost/api/test');

    const result = await getAuthUser(request as any);
    expect(result).toEqual({
      userId: 'user-2',
      username: 'jane',
      role: 'ADMIN',
    });
  });

  it('returns null when no auth at all', async () => {
    vi.mocked(getServerSession).mockResolvedValue(null);

    const request = new Request('http://localhost/api/test');

    const result = await getAuthUser(request as any);
    expect(result).toBeNull();
  });
});
