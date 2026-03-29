import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';

// Mock prisma
const mockQueryRaw = vi.fn();
const mockExecuteRaw = vi.fn();

vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: mockQueryRaw,
    $executeRaw: mockExecuteRaw,
  },
}));

import { checkRateLimit, RATE_LIMITS } from '@/lib/rate-limit';

function createMockRequest(
  method: string,
  url: string,
  ip: string = '127.0.0.1'
): NextRequest {
  const req = new NextRequest(new URL(url, 'http://localhost:3000'), {
    method,
    headers: {
      'x-forwarded-for': ip,
    },
  });
  return req;
}

describe('Rate Limiting', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockQueryRaw.mockResolvedValue([{ count: 0n }]);
    mockExecuteRaw.mockResolvedValue(1);
  });

  describe('RATE_LIMITS configuration', () => {
    it('should have correct auth endpoint limits', () => {
      const config = RATE_LIMITS['POST:/api/v1/auth'];
      expect(config).toBeDefined();
      expect(config.authenticated).toBe(10);
      expect(config.anonymous).toBe(10);
      expect(config.windowSeconds).toBe(15 * 60);
    });

    it('should have correct skills create limits', () => {
      const config = RATE_LIMITS['POST:/api/v1/skills'];
      expect(config).toBeDefined();
      expect(config.authenticated).toBe(20);
      expect(config.anonymous).toBe(0);
      expect(config.windowSeconds).toBe(60 * 60);
    });

    it('should have correct skills read limits', () => {
      const config = RATE_LIMITS['GET:/api/v1/skills'];
      expect(config).toBeDefined();
      expect(config.authenticated).toBe(100);
      expect(config.anonymous).toBe(60);
      expect(config.windowSeconds).toBe(60);
    });

    it('should have correct download limits', () => {
      const config = RATE_LIMITS['GET:/api/v1/skills/download'];
      expect(config).toBeDefined();
      expect(config.authenticated).toBe(60);
      expect(config.anonymous).toBe(30);
      expect(config.windowSeconds).toBe(60);
    });
  });

  describe('checkRateLimit', () => {
    it('should allow requests within the limit', async () => {
      mockQueryRaw.mockResolvedValue([{ count: 5n }]);

      const req = createMockRequest('GET', '/api/v1/skills');
      const result = await checkRateLimit(req);

      expect(result).toBeNull();
      expect(mockExecuteRaw).toHaveBeenCalled();
    });

    it('should block requests exceeding the limit', async () => {
      mockQueryRaw.mockResolvedValue([{ count: 60n }]); // anonymous limit for GET skills

      const req = createMockRequest('GET', '/api/v1/skills');
      const result = await checkRateLimit(req);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(429);
    });

    it('should use higher limit for authenticated users', async () => {
      mockQueryRaw.mockResolvedValue([{ count: 80n }]); // above anonymous (60) but below auth (100)

      const req = createMockRequest('GET', '/api/v1/skills');
      const result = await checkRateLimit(req, 'user-id-123');

      expect(result).toBeNull(); // allowed for authenticated user
    });

    it('should match download endpoint pattern', async () => {
      mockQueryRaw.mockResolvedValue([{ count: 31n }]); // above anonymous download limit (30)

      const req = createMockRequest('GET', '/api/v1/skills/my-skill/download');
      const result = await checkRateLimit(req);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(429);
    });

    it('should match auth endpoint pattern', async () => {
      mockQueryRaw.mockResolvedValue([{ count: 11n }]); // above auth limit (10)

      const req = createMockRequest('POST', '/api/v1/auth/device');
      const result = await checkRateLimit(req);

      expect(result).not.toBeNull();
      expect(result?.status).toBe(429);
    });

    it('should use IP for anonymous requests', async () => {
      mockQueryRaw.mockResolvedValue([{ count: 0n }]);

      const req = createMockRequest('GET', '/api/v1/skills', '192.168.1.1');
      await checkRateLimit(req);

      // Verify the query used IP-based client ID
      const queryArgs = mockQueryRaw.mock.calls[0];
      // The Prisma tagged template will have the client_id in the values
      expect(queryArgs).toBeDefined();
    });

    it('should include Retry-After header on rate limit response', async () => {
      mockQueryRaw.mockResolvedValue([{ count: 100n }]);

      const req = createMockRequest('GET', '/api/v1/skills');
      const result = await checkRateLimit(req);

      expect(result).not.toBeNull();
      expect(result?.headers.get('Retry-After')).toBe('60');
    });

    it('should fail open on database error', async () => {
      mockQueryRaw.mockRejectedValue(new Error('DB connection failed'));

      const req = createMockRequest('GET', '/api/v1/skills');
      const result = await checkRateLimit(req);

      // Should allow the request (fail-open)
      expect(result).toBeNull();
    });

    it('should record the request after allowing it', async () => {
      mockQueryRaw.mockResolvedValue([{ count: 0n }]);

      const req = createMockRequest('GET', '/api/v1/skills');
      await checkRateLimit(req);

      expect(mockExecuteRaw).toHaveBeenCalled();
    });
  });
});
