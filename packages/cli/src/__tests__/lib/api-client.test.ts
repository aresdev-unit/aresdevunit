import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';

// Mock homedir for config isolation
const testDir = mkdtempSync(join(tmpdir(), 'hub-api-test-'));

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    homedir: () => testDir,
  };
});

// Mock global fetch
const mockFetch = vi.fn();
vi.stubGlobal('fetch', mockFetch);

const { writeConfig } = await import('../../lib/config.js');
const { ApiClient, AuthError, NetworkError } = await import('../../lib/api-client.js');

function makeJsonResponse(status: number, body: unknown): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    statusText: status === 200 ? 'OK' : 'Error',
    json: () => Promise.resolve(body),
    headers: new Headers(),
  } as Response;
}

describe('ApiClient', () => {
  const baseUrl = 'https://test.api.com/v1';
  let client: InstanceType<typeof ApiClient>;

  beforeEach(() => {
    mockFetch.mockReset();
    writeConfig({
      access_token: 'test-access-token',
      refresh_token: 'test-refresh-token',
      api_url: baseUrl,
      agents: {},
    });
    client = new ApiClient(baseUrl);
  });

  afterEach(() => {
    try {
      rmSync(join(testDir, '.aresdevunit'), { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('basic requests', () => {
    it('should make GET request with auth header', async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse(200, { id: '1', name: 'test' })
      );

      const result = await client.get('/users/me');

      expect(mockFetch).toHaveBeenCalledOnce();
      const [url, options] = mockFetch.mock.calls[0];
      expect(url).toBe(`${baseUrl}/users/me`);
      expect(options.headers['Authorization']).toBe('Bearer test-access-token');
      expect(result).toEqual({ id: '1', name: 'test' });
    });

    it('should make POST request with body', async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse(200, { status: 'ok' })
      );

      await client.post('/auth/device', { client_id: 'hub-cli' });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.method).toBe('POST');
      expect(JSON.parse(options.body)).toEqual({ client_id: 'hub-cli' });
    });

    it('should skip auth header when skipAuth is true', async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse(200, { status: 'ok' })
      );

      await client.post('/auth/device', { client_id: 'hub-cli' }, { skipAuth: true });

      const [, options] = mockFetch.mock.calls[0];
      expect(options.headers['Authorization']).toBeUndefined();
    });

    it('should handle 204 No Content', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: true,
        status: 204,
        statusText: 'No Content',
        headers: new Headers(),
      } as Response);

      const result = await client.post('/auth/revoke', { refresh_token: 'tok' });
      expect(result).toBeUndefined();
    });
  });

  describe('token refresh interceptor', () => {
    it('should refresh token on 401 and retry', async () => {
      // First call: 401
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse(401, {
          error: { code: 'UNAUTHORIZED', message: 'Token expired', status: 401 },
        })
      );

      // Refresh call: success
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse(200, {
          access_token: 'new-access-token',
          refresh_token: 'new-refresh-token',
          expires_in: 900,
        })
      );

      // Retry: success
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse(200, { id: '1', username: 'johndoe' })
      );

      const result = await client.get<{ id: string; username: string }>('/users/me');

      expect(result.username).toBe('johndoe');
      expect(mockFetch).toHaveBeenCalledTimes(3);

      // Verify refresh was called with correct endpoint
      const [refreshUrl, refreshOpts] = mockFetch.mock.calls[1];
      expect(refreshUrl).toBe(`${baseUrl}/auth/refresh`);
      expect(JSON.parse(refreshOpts.body)).toEqual({
        refresh_token: 'test-refresh-token',
      });

      // Verify retry used new token
      const [, retryOpts] = mockFetch.mock.calls[2];
      expect(retryOpts.headers['Authorization']).toBe('Bearer new-access-token');
    });

    it('should throw AuthError when refresh also fails', async () => {
      // First call: 401
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse(401, {
          error: { code: 'UNAUTHORIZED', message: 'Token expired', status: 401 },
        })
      );

      // Refresh call: failure
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse(401, {
          error: { code: 'UNAUTHORIZED', message: 'Refresh token invalid', status: 401 },
        })
      );

      await expect(client.get('/users/me')).rejects.toThrow(
        'Session expired. Run `aresdevhubcli login` to re-authenticate.'
      );
      expect(mockFetch).toHaveBeenCalledTimes(2);
    });

    it('should throw AuthError when no refresh token available', async () => {
      // Remove refresh token
      writeConfig({
        access_token: 'test-access-token',
        api_url: baseUrl,
        agents: {},
      });

      // First call: 401
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse(401, {
          error: { code: 'UNAUTHORIZED', message: 'Token expired', status: 401 },
        })
      );

      await expect(client.get('/users/me')).rejects.toThrow(AuthError);
    });

    it('should not attempt refresh on skipAuth requests', async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse(401, {
          error: { code: 'UNAUTHORIZED', message: 'Token expired', status: 401 },
        })
      );

      // skipAuth: 401 is just an error, no refresh attempt
      await expect(
        client.request('/auth/device', { skipAuth: true })
      ).rejects.toThrow('Token expired');

      expect(mockFetch).toHaveBeenCalledTimes(1);
    });
  });

  describe('network errors', () => {
    it('should throw NetworkError on fetch failure', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      await expect(client.get('/users/me')).rejects.toThrow(NetworkError);
    });

    it('should include hostname in NetworkError message', async () => {
      mockFetch.mockRejectedValueOnce(new TypeError('Failed to fetch'));

      try {
        await client.get('/users/me');
      } catch (err) {
        expect(err).toBeInstanceOf(NetworkError);
        expect((err as Error).message).toContain('test.api.com');
      }
    });
  });

  describe('API error handling', () => {
    it('should throw Error with API error message', async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse(404, {
          error: { code: 'SKILL_NOT_FOUND', message: 'Skill not found', status: 404 },
        })
      );

      await expect(client.get('/skills/nonexistent')).rejects.toThrow('Skill not found');
    });

    it('should throw AuthError for 403', async () => {
      mockFetch.mockResolvedValueOnce(
        makeJsonResponse(403, {
          error: { code: 'FORBIDDEN', message: 'Insufficient permissions', status: 403 },
        })
      );

      await expect(client.get('/admin/users')).rejects.toThrow(AuthError);
    });
  });
});
