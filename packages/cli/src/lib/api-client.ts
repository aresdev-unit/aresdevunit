import { readConfig, updateConfig, clearTokens } from './config.js';

export class AuthError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AuthError';
  }
}

export class NetworkError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'NetworkError';
  }
}

interface RequestOptions extends RequestInit {
  skipAuth?: boolean;
}

export class ApiClient {
  private baseUrl: string;

  constructor(baseUrl?: string) {
    this.baseUrl = baseUrl ?? readConfig().api_url;
  }

  private getAccessToken(): string | undefined {
    return readConfig().access_token;
  }

  private getRefreshToken(): string | undefined {
    return readConfig().refresh_token;
  }

  private async refreshAccessToken(): Promise<boolean> {
    const refreshToken = this.getRefreshToken();
    if (!refreshToken) {
      return false;
    }

    try {
      const res = await fetch(`${this.baseUrl}/auth/refresh`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ refresh_token: refreshToken }),
      });

      if (!res.ok) {
        return false;
      }

      const data = (await res.json()) as {
        access_token: string;
        refresh_token: string;
        expires_in: number;
      };

      updateConfig({
        access_token: data.access_token,
        refresh_token: data.refresh_token,
      });

      return true;
    } catch {
      return false;
    }
  }

  async request<T>(path: string, options: RequestOptions = {}): Promise<T> {
    const { skipAuth = false, headers: customHeaders, ...fetchOptions } = options;

    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      ...(customHeaders as Record<string, string>),
    };

    if (!skipAuth) {
      const token = this.getAccessToken();
      if (token) {
        headers['Authorization'] = `Bearer ${token}`;
      }
    }

    const url = `${this.baseUrl}${path}`;

    let res: Response;
    try {
      res = await fetch(url, { ...fetchOptions, headers });
    } catch (err) {
      const message =
        err instanceof Error ? err.message : 'Unknown network error';
      throw new NetworkError(
        `Could not reach ${new URL(this.baseUrl).hostname}: ${message}`
      );
    }

    // Handle 401 with token refresh (1 attempt)
    if (res.status === 401 && !skipAuth) {
      const refreshed = await this.refreshAccessToken();
      if (refreshed) {
        // Retry the original request with new token
        const newToken = this.getAccessToken();
        if (newToken) {
          headers['Authorization'] = `Bearer ${newToken}`;
        }

        try {
          res = await fetch(url, { ...fetchOptions, headers });
        } catch (err) {
          const message =
            err instanceof Error ? err.message : 'Unknown network error';
          throw new NetworkError(
            `Could not reach ${new URL(this.baseUrl).hostname}: ${message}`
          );
        }

        if (res.status === 401) {
          clearTokens();
          throw new AuthError(
            'Session expired. Run `hub login` to re-authenticate.'
          );
        }
      } else {
        clearTokens();
        throw new AuthError(
          'Session expired. Run `hub login` to re-authenticate.'
        );
      }
    }

    // Handle 204 No Content
    if (res.status === 204) {
      return undefined as T;
    }

    const body = await res.json();

    if (!res.ok) {
      const apiError = body as {
        error?: { code: string; message: string; status: number };
      };
      if (apiError.error) {
        if (res.status === 401 || res.status === 403) {
          throw new AuthError(apiError.error.message);
        }
        throw new Error(apiError.error.message);
      }
      throw new Error(`API error: ${res.status} ${res.statusText}`);
    }

    return body as T;
  }

  async get<T>(path: string, options?: RequestOptions): Promise<T> {
    return this.request<T>(path, { ...options, method: 'GET' });
  }

  async post<T>(
    path: string,
    body?: unknown,
    options?: RequestOptions
  ): Promise<T> {
    return this.request<T>(path, {
      ...options,
      method: 'POST',
      body: body ? JSON.stringify(body) : undefined,
    });
  }
}

let _client: ApiClient | null = null;

export function getApiClient(): ApiClient {
  if (!_client) {
    _client = new ApiClient();
  }
  return _client;
}

/** Reset the singleton (for testing) */
export function resetApiClient(): void {
  _client = null;
}
