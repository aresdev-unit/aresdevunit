import { readFileSync, writeFileSync, mkdirSync, chmodSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_DIR = join(homedir(), '.aresdevunit');
const CONFIG_FILE = join(CONFIG_DIR, 'config.json');
const FILE_PERMISSION = 0o600;

export interface AgentConfig {
  skill_path: string | null;
}

export interface HubConfig {
  access_token?: string;
  refresh_token?: string;
  api_url: string;
  agents: Record<string, AgentConfig>;
  workspace_path?: string;
}

const DEFAULT_CONFIG: HubConfig = {
  api_url: 'https://aresdevunit.vercel.app/api/v1',
  agents: {
    claude: { skill_path: '~/.claude/commands' },
    codex: { skill_path: '~/.codex/skills' },
  },
};

export function getConfigDir(): string {
  return CONFIG_DIR;
}

export function getConfigPath(): string {
  return CONFIG_FILE;
}

export function readConfig(): HubConfig {
  if (!existsSync(CONFIG_FILE)) {
    return { ...DEFAULT_CONFIG };
  }
  try {
    const raw = readFileSync(CONFIG_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<HubConfig>;
    return {
      ...DEFAULT_CONFIG,
      ...parsed,
    };
  } catch {
    return { ...DEFAULT_CONFIG };
  }
}

export function writeConfig(config: HubConfig): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(CONFIG_FILE, JSON.stringify(config, null, 2) + '\n', 'utf-8');
  chmodSync(CONFIG_FILE, FILE_PERMISSION);
}

export function updateConfig(partial: Partial<HubConfig>): void {
  const current = readConfig();
  writeConfig({ ...current, ...partial });
}

export function clearTokens(): void {
  const current = readConfig();
  delete current.access_token;
  delete current.refresh_token;
  writeConfig(current);
}
