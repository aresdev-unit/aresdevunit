import { readFile } from 'node:fs/promises';
import path from 'node:path';
import { LOCAL_DEV_AUTH_COOKIE } from './local-dev-auth-shared';

type LocalDevAuthConfig = {
  enabled?: boolean;
  id?: string;
  username?: string;
  role?: string;
};

export type LocalDevAuthUser = {
  id: string;
  username: string;
  role: string;
};

async function loadLocalDevAuthConfig(): Promise<LocalDevAuthConfig | null> {
  if (process.env.NODE_ENV === 'production') {
    return null;
  }

  const filePath = path.join(process.cwd(), '.local-dev-auth.json');

  try {
    const raw = await readFile(filePath, 'utf8');
    const parsed = JSON.parse(raw) as LocalDevAuthConfig;
    if (parsed.enabled === false) {
      return null;
    }
    return parsed;
  } catch {
    return null;
  }
}

export async function getLocalDevAuthUser(cookieValue?: string | null): Promise<LocalDevAuthUser | null> {
  if (cookieValue !== '1') {
    return null;
  }

  const config = await loadLocalDevAuthConfig();
  if (!config) {
    return null;
  }

  return {
    id: config.id?.trim() || 'local-dev-user',
    username: config.username?.trim() || 'local-dev',
    role: config.role?.trim() || 'ADMIN',
  };
}

export async function hasLocalDevAuthConfig() {
  return Boolean(await loadLocalDevAuthConfig());
}
