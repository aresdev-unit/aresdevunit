import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';

// Mock environment variables
const ENV = {
  GITHUB_APP_ID: '12345',
  GITHUB_APP_PRIVATE_KEY: '', // set in beforeEach
  GITHUB_APP_INSTALLATION_ID: '67890',
};

// Dummy key for testing (NOT a real key — base64 of "test-dummy-key-content")
const DUMMY_PRIVATE_KEY = Buffer.from('test-dummy-key-for-unit-tests-only').toString('base64');

describe('GitHubStorageProvider', () => {
  let GitHubStorageProvider: any;
  let _resetTokenCache: any;
  let getInstallationToken: any;

  beforeEach(async () => {
    vi.resetModules();

    // Set env vars before import
    ENV.GITHUB_APP_PRIVATE_KEY = Buffer.from(DUMMY_PRIVATE_KEY).toString('base64');
    process.env.GITHUB_APP_ID = ENV.GITHUB_APP_ID;
    process.env.GITHUB_APP_PRIVATE_KEY = ENV.GITHUB_APP_PRIVATE_KEY;
    process.env.GITHUB_APP_INSTALLATION_ID = ENV.GITHUB_APP_INSTALLATION_ID;

    // Mock global fetch
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.restoreAllMocks();
    delete process.env.GITHUB_APP_ID;
    delete process.env.GITHUB_APP_PRIVATE_KEY;
    delete process.env.GITHUB_APP_INSTALLATION_ID;
  });

  describe('getInstallationToken', () => {
    it('should fetch and cache installation token', async () => {
      const mod = await import('@/lib/github-storage');
      getInstallationToken = mod.getInstallationToken;
      _resetTokenCache = mod._resetTokenCache;
      _resetTokenCache();

      const mockFetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({
            token: 'ghs_test_token_123',
            expires_at: new Date(Date.now() + 3600000).toISOString(),
          }),
        });
      global.fetch = mockFetch;

      const token1 = await getInstallationToken();
      expect(token1).toBe('ghs_test_token_123');
      expect(mockFetch).toHaveBeenCalledTimes(1);

      // Second call should use cache
      const token2 = await getInstallationToken();
      expect(token2).toBe('ghs_test_token_123');
      expect(mockFetch).toHaveBeenCalledTimes(1); // still 1, cached
    });

    it('should throw on missing GITHUB_APP_INSTALLATION_ID', async () => {
      delete process.env.GITHUB_APP_INSTALLATION_ID;
      const mod = await import('@/lib/github-storage');
      mod._resetTokenCache();

      await expect(mod.getInstallationToken()).rejects.toThrow(
        'GITHUB_APP_INSTALLATION_ID must be set'
      );
    });

    it('should throw on failed token fetch', async () => {
      const mod = await import('@/lib/github-storage');
      mod._resetTokenCache();

      global.fetch = vi.fn().mockResolvedValueOnce({
        ok: false,
        status: 401,
        text: async () => 'Unauthorized',
      });

      await expect(mod.getInstallationToken()).rejects.toThrow(
        'Failed to get installation token'
      );
    });
  });

  describe('upload', () => {
    it('should upload files to GitHub', async () => {
      const mod = await import('@/lib/github-storage');
      mod._resetTokenCache();
      const provider = new mod.GitHubStorageProvider();

      // Mock: installation token
      const fetchMock = vi.fn()
        // getInstallationToken
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: 'ghs_token', expires_at: new Date(Date.now() + 3600000).toISOString() }),
        })
        // getFileSha (404 = new file)
        .mockResolvedValueOnce({ ok: false, status: 404 })
        // PUT file
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ content: { sha: 'abc123' } }),
        });

      global.fetch = fetchMock;

      await expect(
        provider.upload('test-skill', '1.0.0', [
          { path: 'test.md', content: Buffer.from('# Test').toString('base64') },
        ])
      ).resolves.toBeUndefined();

      // Verify PUT was called with correct path
      const putCall = fetchMock.mock.calls[2];
      expect(putCall[0]).toContain('skills/test-skill/1.0.0/test.md');
      expect(putCall[1].method).toBe('PUT');
    });

    it('should include sha when updating existing file', async () => {
      const mod = await import('@/lib/github-storage');
      mod._resetTokenCache();
      const provider = new mod.GitHubStorageProvider();

      const fetchMock = vi.fn()
        // getInstallationToken
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: 'ghs_token', expires_at: new Date(Date.now() + 3600000).toISOString() }),
        })
        // getFileSha (existing file)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ sha: 'existing_sha' }),
        })
        // PUT file
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ content: { sha: 'new_sha' } }),
        });

      global.fetch = fetchMock;

      await provider.upload('test-skill', '1.0.0', [
        { path: 'test.md', content: Buffer.from('# Updated').toString('base64') },
      ]);

      const putCall = fetchMock.mock.calls[2];
      const body = JSON.parse(putCall[1].body);
      expect(body.sha).toBe('existing_sha');
    });
  });

  describe('download', () => {
    it('should download files from GitHub', async () => {
      const mod = await import('@/lib/github-storage');
      mod._resetTokenCache();
      const provider = new mod.GitHubStorageProvider();

      const fileContent = '# Test Skill\nThis is a test.';

      const fetchMock = vi.fn()
        // getInstallationToken
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: 'ghs_token', expires_at: new Date(Date.now() + 3600000).toISOString() }),
        })
        // List directory
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { name: 'skill.md', type: 'file', download_url: 'https://raw.githubusercontent.com/skill.md', path: 'skills/test/1.0.0/skill.md' },
          ],
        })
        // Download file content
        .mockResolvedValueOnce({
          ok: true,
          text: async () => fileContent,
        });

      global.fetch = fetchMock;

      const files = await provider.download('test', '1.0.0');
      expect(files).toHaveLength(1);
      expect(files[0].path).toBe('skill.md');
      expect(Buffer.from(files[0].content, 'base64').toString()).toBe(fileContent);
    });

    it('should throw on 404', async () => {
      const mod = await import('@/lib/github-storage');
      mod._resetTokenCache();
      const provider = new mod.GitHubStorageProvider();

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: 'ghs_token', expires_at: new Date(Date.now() + 3600000).toISOString() }),
        })
        .mockResolvedValueOnce({
          ok: false,
          status: 404,
          text: async () => 'Not Found',
        });

      await expect(provider.download('nonexistent', '1.0.0')).rejects.toThrow(
        'Skill files not found'
      );
    });
  });

  describe('delete', () => {
    it('should delete files from GitHub', async () => {
      const mod = await import('@/lib/github-storage');
      mod._resetTokenCache();
      const provider = new mod.GitHubStorageProvider();

      const fetchMock = vi.fn()
        // getInstallationToken
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: 'ghs_token', expires_at: new Date(Date.now() + 3600000).toISOString() }),
        })
        // List directory
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [
            { name: 'skill.md', sha: 'file_sha', path: 'skills/test/1.0.0/skill.md' },
          ],
        })
        // DELETE file
        .mockResolvedValueOnce({ ok: true });

      global.fetch = fetchMock;

      await expect(provider.delete('test', '1.0.0')).resolves.toBeUndefined();

      const deleteCall = fetchMock.mock.calls[2];
      expect(deleteCall[1].method).toBe('DELETE');
    });

    it('should silently succeed on 404 (already deleted)', async () => {
      const mod = await import('@/lib/github-storage');
      mod._resetTokenCache();
      const provider = new mod.GitHubStorageProvider();

      global.fetch = vi.fn()
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ token: 'ghs_token', expires_at: new Date(Date.now() + 3600000).toISOString() }),
        })
        .mockResolvedValueOnce({ ok: false, status: 404, text: async () => '' });

      await expect(provider.delete('nonexistent', '1.0.0')).resolves.toBeUndefined();
    });
  });
});
