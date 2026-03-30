import * as crypto from 'crypto';

// --- SkillFile type ---
export interface SkillFile {
  path: string;
  content: string; // base64 encoded
}

// --- StorageProvider interface ---
export interface SkillStorageProvider {
  upload(name: string, version: string, files: SkillFile[]): Promise<void>;
  download(name: string, version: string): Promise<SkillFile[]>;
  delete(name: string, version: string): Promise<void>;
}

// --- Installation Token cache ---
interface CachedToken {
  token: string;
  expiresAt: number; // ms timestamp
}

let cachedInstallationToken: CachedToken | null = null;

const GITHUB_API = 'https://api.github.com';
const REPO_OWNER = 'aresdev-unit';
const REPO_NAME = 'skill-registry';

/**
 * Create a JWT for GitHub App authentication.
 * Uses RS256 (RSASSA-PKCS1-v1_5 with SHA-256).
 */
function createAppJwt(): string {
  const appId = process.env.GITHUB_APP_ID;
  const privateKeyRaw = process.env.GITHUB_APP_PRIVATE_KEY;
  if (!appId || !privateKeyRaw) {
    throw new Error('GITHUB_APP_ID and GITHUB_APP_PRIVATE_KEY must be set');
  }

  // Support both raw PEM and base64-encoded PEM
  const privateKey = privateKeyRaw.startsWith('-----')
    ? privateKeyRaw
    : Buffer.from(privateKeyRaw, 'base64').toString('utf-8');
  const now = Math.floor(Date.now() / 1000);

  const header = { alg: 'RS256', typ: 'JWT' };
  const payload = {
    iat: now - 60, // 60s clock skew
    exp: now + 10 * 60, // 10 min
    iss: appId,
  };

  const b64url = (data: string) =>
    Buffer.from(data).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');

  const headerB64 = b64url(JSON.stringify(header));
  const payloadB64 = b64url(JSON.stringify(payload));
  const sigInput = `${headerB64}.${payloadB64}`;

  const sign = crypto.createSign('RSA-SHA256');
  sign.update(sigInput);
  const signature = sign
    .sign(privateKey, 'base64')
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '');

  return `${headerB64}.${payloadB64}.${signature}`;
}

/**
 * Get a GitHub App Installation Token, using a memory cache (50 min TTL).
 */
export async function getInstallationToken(): Promise<string> {
  const CACHE_TTL_MS = 50 * 60 * 1000; // 50 minutes

  if (cachedInstallationToken && Date.now() < cachedInstallationToken.expiresAt) {
    return cachedInstallationToken.token;
  }

  const installationId = process.env.GITHUB_APP_INSTALLATION_ID;
  if (!installationId) {
    throw new Error('GITHUB_APP_INSTALLATION_ID must be set');
  }

  const jwt = createAppJwt();
  const response = await fetch(
    `${GITHUB_API}/app/installations/${installationId}/access_tokens`,
    {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${jwt}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    }
  );

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Failed to get installation token: ${response.status} ${body}`);
  }

  const data = (await response.json()) as { token: string; expires_at: string };
  cachedInstallationToken = {
    token: data.token,
    expiresAt: Date.now() + CACHE_TTL_MS,
  };

  return data.token;
}

/**
 * Build the GitHub API path for a skill file.
 * Layout: skills/{name}/{version}/{filename}
 */
function buildRepoPath(name: string, version: string, filePath: string): string {
  return `skills/${name}/${version}/${filePath}`;
}

/**
 * Get the SHA of an existing file (needed for updates/deletes).
 */
async function getFileSha(token: string, repoPath: string): Promise<string | null> {
  const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${repoPath}`;
  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: 'application/vnd.github+json',
      'X-GitHub-Api-Version': '2022-11-28',
    },
  });

  if (response.status === 404) return null;
  if (!response.ok) return null;

  const data = (await response.json()) as { sha: string };
  return data.sha;
}

// --- GitHubStorageProvider ---

export class GitHubStorageProvider implements SkillStorageProvider {
  async upload(name: string, version: string, files: SkillFile[]): Promise<void> {
    const token = await getInstallationToken();

    for (const file of files) {
      const repoPath = buildRepoPath(name, version, file.path);
      const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${repoPath}`;

      // Check if file already exists (for update with sha)
      const existingSha = await getFileSha(token, repoPath);

      const body: Record<string, string> = {
        message: `publish ${name}@${version}: ${file.path}`,
        content: file.content,
      };
      if (existingSha) {
        body.sha = existingSha;
      }

      const response = await fetch(url, {
        method: 'PUT',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errBody = await response.text();
        throw new Error(
          `GitHub upload failed for ${repoPath}: ${response.status} ${errBody}`
        );
      }
    }
  }

  async download(name: string, version: string): Promise<SkillFile[]> {
    const token = await getInstallationToken();
    const dirPath = `skills/${name}/${version}`;
    const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${dirPath}`;

    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (!response.ok) {
      if (response.status === 404) {
        throw new Error(`Skill files not found: ${name}@${version}`);
      }
      const errBody = await response.text();
      throw new Error(`GitHub download failed: ${response.status} ${errBody}`);
    }

    const items = (await response.json()) as Array<{
      name: string;
      type: string;
      download_url: string;
      path: string;
    }>;

    const files: SkillFile[] = [];
    for (const item of items) {
      if (item.type !== 'file') continue;

      // Get file content
      const fileResponse = await fetch(item.download_url, {
        headers: {
          Authorization: `Bearer ${token}`,
        },
      });
      if (!fileResponse.ok) continue;

      const rawContent = await fileResponse.text();
      const content = Buffer.from(rawContent).toString('base64');
      files.push({ path: item.name, content });
    }

    return files;
  }

  async delete(name: string, version: string): Promise<void> {
    const token = await getInstallationToken();
    const dirPath = `skills/${name}/${version}`;
    const url = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${dirPath}`;

    // List files in directory
    const response = await fetch(url, {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
      },
    });

    if (response.status === 404) return; // Already deleted
    if (!response.ok) {
      const errBody = await response.text();
      throw new Error(`GitHub list failed: ${response.status} ${errBody}`);
    }

    const items = (await response.json()) as Array<{ name: string; sha: string; path: string }>;

    for (const item of items) {
      const deleteUrl = `${GITHUB_API}/repos/${REPO_OWNER}/${REPO_NAME}/contents/${item.path}`;
      const deleteResponse = await fetch(deleteUrl, {
        method: 'DELETE',
        headers: {
          Authorization: `Bearer ${token}`,
          Accept: 'application/vnd.github+json',
          'Content-Type': 'application/json',
          'X-GitHub-Api-Version': '2022-11-28',
        },
        body: JSON.stringify({
          message: `delete ${name}@${version}: ${item.name}`,
          sha: item.sha,
        }),
      });

      if (!deleteResponse.ok && deleteResponse.status !== 404) {
        const errBody = await deleteResponse.text();
        throw new Error(
          `GitHub delete failed for ${item.path}: ${deleteResponse.status} ${errBody}`
        );
      }
    }
  }
}

// Singleton
let storageProvider: SkillStorageProvider | null = null;

export function getStorageProvider(): SkillStorageProvider {
  if (!storageProvider) {
    storageProvider = new GitHubStorageProvider();
  }
  return storageProvider;
}

/**
 * For testing: reset the cached installation token
 */
export function _resetTokenCache(): void {
  cachedInstallationToken = null;
}
