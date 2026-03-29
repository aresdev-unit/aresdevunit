import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';

// Mock dependencies before imports
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  chmodSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: () => '/home/testuser',
}));

vi.mock('chalk', () => ({
  default: {
    red: (s: string) => s,
    green: (s: string) => s,
    cyan: (s: string) => s,
    yellow: (s: string) => s,
    bold: (s: string) => s,
  },
}));

const mockReadConfig = vi.fn();
const mockWriteConfig = vi.fn();
vi.mock('../../lib/config.js', () => ({
  readConfig: () => mockReadConfig(),
  writeConfig: (c: any) => mockWriteConfig(c),
}));

import { configCommand } from '../../commands/config.js';

function createProgram(globalOpts: Record<string, unknown> = {}) {
  const program = new Command();
  program
    .option('--json', 'JSON output')
    .option('-y, --yes', 'Auto-approve')
    .option('--agent <type>', 'Agent type');
  for (const [k, v] of Object.entries(globalOpts)) {
    program.setOptionValue(k, v);
  }
  program.addCommand(configCommand);
  return program;
}

const DEFAULT_CONFIG = {
  api_url: 'https://aresdevunit.vercel.app/api/v1',
  access_token: 'secret-jwt-token',
  agents: {
    claude: { skill_path: '~/.claude/commands' },
    codex: { skill_path: null },
  },
};

describe('config get', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    mockReadConfig.mockReturnValue({ ...DEFAULT_CONFIG });
  });

  it('returns a top-level value', async () => {
    const program = createProgram({ json: true });
    await program.parseAsync(['node', 'hub', 'config', 'get', 'api_url']);

    const output = consoleSpy.mock.calls[0]![0] as string;
    const result = JSON.parse(output);
    expect(result.key).toBe('api_url');
    expect(result.value).toBe('https://aresdevunit.vercel.app/api/v1');
  });

  it('returns a nested value via dot notation', async () => {
    const program = createProgram({ json: true });
    await program.parseAsync(['node', 'hub', 'config', 'get', 'agents.claude.skill_path']);

    const output = consoleSpy.mock.calls[0]![0] as string;
    const result = JSON.parse(output);
    expect(result.value).toBe('~/.claude/commands');
  });

  it('exits with error for non-existent key', async () => {
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('process.exit'); }) as any);

    const program = createProgram({ json: true });
    await expect(
      program.parseAsync(['node', 'hub', 'config', 'get', 'nonexistent.key'])
    ).rejects.toThrow('process.exit');

    expect(mockExit).toHaveBeenCalledWith(1);
    mockExit.mockRestore();
  });
});

describe('config set', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockReadConfig.mockReturnValue(JSON.parse(JSON.stringify(DEFAULT_CONFIG)));
  });

  it('sets a top-level string value', async () => {
    const program = createProgram({ json: true });
    await program.parseAsync(['node', 'hub', 'config', 'set', 'api_url', 'https://new.api.com']);

    expect(mockWriteConfig).toHaveBeenCalledWith(
      expect.objectContaining({ api_url: 'https://new.api.com' })
    );
  });

  it('sets a nested value via dot notation', async () => {
    const program = createProgram({ json: true });
    await program.parseAsync(['node', 'hub', 'config', 'set', 'agents.codex.skill_path', '~/.codex/skills']);

    const written = mockWriteConfig.mock.calls[0]![0];
    expect(written.agents.codex.skill_path).toBe('~/.codex/skills');
  });

  it('sets null value', async () => {
    const program = createProgram({ json: true });
    await program.parseAsync(['node', 'hub', 'config', 'set', 'agents.claude.skill_path', 'null']);

    const written = mockWriteConfig.mock.calls[0]![0];
    expect(written.agents.claude.skill_path).toBeNull();
  });

  it('creates intermediate objects for new nested paths', async () => {
    const program = createProgram({ json: true });
    await program.parseAsync(['node', 'hub', 'config', 'set', 'agents.cursor.skill_path', '~/.cursor/skills']);

    const written = mockWriteConfig.mock.calls[0]![0];
    expect(written.agents.cursor.skill_path).toBe('~/.cursor/skills');
  });
});

describe('config list', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    mockReadConfig.mockReturnValue({ ...DEFAULT_CONFIG });
  });

  it('lists all config entries in JSON', async () => {
    const program = createProgram({ json: true });
    await program.parseAsync(['node', 'hub', 'config', 'list']);

    const output = consoleSpy.mock.calls[0]![0] as string;
    const result = JSON.parse(output);
    expect(result['api_url']).toBe('https://aresdevunit.vercel.app/api/v1');
    expect(result['agents.claude.skill_path']).toBe('~/.claude/commands');
  });

  it('masks token fields with [REDACTED]', async () => {
    const program = createProgram({ json: true });
    await program.parseAsync(['node', 'hub', 'config', 'list']);

    const output = consoleSpy.mock.calls[0]![0] as string;
    const result = JSON.parse(output);
    expect(result['access_token']).toBe('[REDACTED]');
  });

  it('outputs human-readable format without --json', async () => {
    const program = createProgram();
    await program.parseAsync(['node', 'hub', 'config', 'list']);

    const lines = consoleSpy.mock.calls.map((c) => String(c[0]));
    expect(lines.some((l) => l.includes('api_url'))).toBe(true);
    expect(lines.some((l) => l.includes('[REDACTED]'))).toBe(true);
    expect(lines.some((l) => l.includes('agents.claude.skill_path'))).toBe(true);
  });
});
