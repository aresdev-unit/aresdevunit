import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock prisma
vi.mock('@/lib/prisma', () => ({
  prisma: {
    $queryRaw: vi.fn(),
  },
}));

describe('GET /api/v1/health', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should return ok when DB is connected', async () => {
    const { prisma } = await import('@/lib/prisma');
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ '?column?': 1 }]);

    const { GET } = await import('@/app/api/v1/health/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(200);
    expect(body.status).toBe('ok');
    expect(body.db).toBe('connected');
    expect(body.version).toBe('1.0.0');
    expect(body.timestamp).toBeDefined();
  });

  it('should return error when DB is disconnected', async () => {
    const { prisma } = await import('@/lib/prisma');
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new Error('Connection refused'));

    // Need to re-import to get fresh module with new mock behavior
    vi.resetModules();

    // Re-setup mock after resetModules
    vi.doMock('@/lib/prisma', () => ({
      prisma: {
        $queryRaw: vi.fn().mockRejectedValueOnce(new Error('Connection refused')),
      },
    }));

    const { GET } = await import('@/app/api/v1/health/route');
    const response = await GET();
    const body = await response.json();

    expect(response.status).toBe(503);
    expect(body.status).toBe('error');
    expect(body.db).toBe('disconnected');
  });

  it('should include CORS headers', async () => {
    const { prisma } = await import('@/lib/prisma');
    (prisma.$queryRaw as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ '?column?': 1 }]);

    const { GET } = await import('@/app/api/v1/health/route');
    const response = await GET();

    expect(response.headers.get('Access-Control-Allow-Origin')).toBeDefined();
    expect(response.headers.get('Access-Control-Allow-Methods')).toContain('GET');
  });
});
