import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, existsSync, chmodSync, statSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import { mkdtempSync, rmSync } from 'node:fs';

// We need to mock homedir before importing config
const testDir = mkdtempSync(join(tmpdir(), 'hub-config-test-'));

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    homedir: () => testDir,
  };
});

// Import after mock
const { readConfig, writeConfig, updateConfig, clearTokens, getConfigPath } = await import(
  '../../lib/config.js'
);

describe('Config Manager', () => {
  const configDir = join(testDir, '.aresdevunit');
  const configFile = join(configDir, 'config.json');

  afterEach(() => {
    // Clean up config file between tests
    try {
      rmSync(configDir, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  describe('readConfig', () => {
    it('should return default config when no file exists', () => {
      const config = readConfig();
      expect(config.api_url).toBe('https://aresdevunit.vercel.app/api/v1');
      expect(config.agents).toBeDefined();
      expect(config.agents.claude.skill_path).toBe('~/.claude/commands');
      expect(config.access_token).toBeUndefined();
      expect(config.refresh_token).toBeUndefined();
    });

    it('should read existing config and merge with defaults', () => {
      writeConfig({
        access_token: 'test-token',
        refresh_token: 'test-refresh',
        api_url: 'https://custom.api.com/v1',
        agents: { claude: { skill_path: '/custom/path' } },
      });

      const config = readConfig();
      expect(config.access_token).toBe('test-token');
      expect(config.refresh_token).toBe('test-refresh');
      expect(config.api_url).toBe('https://custom.api.com/v1');
    });
  });

  describe('writeConfig', () => {
    it('should create config directory and file', () => {
      writeConfig({
        api_url: 'https://aresdevunit.vercel.app/api/v1',
        agents: { claude: { skill_path: '~/.claude/commands' } },
      });

      expect(existsSync(configFile)).toBe(true);
      const raw = readFileSync(configFile, 'utf-8');
      const parsed = JSON.parse(raw);
      expect(parsed.api_url).toBe('https://aresdevunit.vercel.app/api/v1');
    });

    it('should set file permission to 0600', () => {
      writeConfig({
        api_url: 'https://aresdevunit.vercel.app/api/v1',
        agents: {},
      });

      // On Linux/Mac, verify permission
      if (process.platform !== 'win32') {
        const stat = statSync(configFile);
        const mode = stat.mode & 0o777;
        expect(mode).toBe(0o600);
      }
    });
  });

  describe('updateConfig', () => {
    it('should merge partial updates with existing config', () => {
      writeConfig({
        api_url: 'https://aresdevunit.vercel.app/api/v1',
        agents: { claude: { skill_path: '~/.claude/commands' } },
      });

      updateConfig({ access_token: 'new-token' });

      const config = readConfig();
      expect(config.access_token).toBe('new-token');
      expect(config.api_url).toBe('https://aresdevunit.vercel.app/api/v1');
    });
  });

  describe('clearTokens', () => {
    it('should remove tokens but keep other config', () => {
      writeConfig({
        access_token: 'token',
        refresh_token: 'refresh',
        api_url: 'https://aresdevunit.vercel.app/api/v1',
        agents: { claude: { skill_path: '~/.claude/commands' } },
      });

      clearTokens();

      const config = readConfig();
      expect(config.access_token).toBeUndefined();
      expect(config.refresh_token).toBeUndefined();
      expect(config.api_url).toBe('https://aresdevunit.vercel.app/api/v1');
    });
  });

  describe('getConfigPath', () => {
    it('should return correct path', () => {
      const path = getConfigPath();
      expect(path).toContain('.aresdevunit');
      expect(path).toContain('config.json');
    });
  });
});
