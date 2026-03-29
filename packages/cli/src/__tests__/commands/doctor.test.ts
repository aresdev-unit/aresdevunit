import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';

// Mock dependencies before imports
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
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

const mockGet = vi.fn();
vi.mock('../../lib/api-client.js', () => ({
  getApiClient: () => ({ get: mockGet }),
  AuthError: class AuthError extends Error {
    constructor(msg: string) { super(msg); this.name = 'AuthError'; }
  },
  NetworkError: class NetworkError extends Error {
    constructor(msg: string) { super(msg); this.name = 'NetworkError'; }
  },
}));

const mockReadConfig = vi.fn();
vi.mock('../../lib/config.js', () => ({
  readConfig: () => mockReadConfig(),
}));

const mockListInstalledSkills = vi.fn();
vi.mock('../../lib/installed.js', () => ({
  listInstalledSkills: () => mockListInstalledSkills(),
}));

import { existsSync, readFileSync } from 'node:fs';
import { doctorCommand } from '../../commands/doctor.js';

function createProgram(globalOpts: Record<string, unknown> = {}) {
  const program = new Command();
  program
    .option('--json', 'JSON output')
    .option('-y, --yes', 'Auto-approve')
    .option('--agent <type>', 'Agent type');
  for (const [k, v] of Object.entries(globalOpts)) {
    program.setOptionValue(k, v);
  }
  program.addCommand(doctorCommand);
  return program;
}

describe('doctorCommand', () => {
  let consoleSpy: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    vi.clearAllMocks();
    consoleSpy = vi.spyOn(console, 'log').mockImplementation(() => {});
    vi.spyOn(console, 'error').mockImplementation(() => {});
    vi.spyOn(process.stdout, 'write').mockImplementation(() => true);
    Object.defineProperty(process.stdout, 'isTTY', { value: false, writable: true });

    mockReadConfig.mockReturnValue({
      access_token: 'test-token',
      api_url: 'https://hub.aresdevunit.com/api/v1',
      agents: {
        claude: { skill_path: '~/.claude/commands' },
        codex: { skill_path: null },
      },
    });
    mockListInstalledSkills.mockReturnValue({});
  });

  it('reports auth ok when token valid and API responds', async () => {
    mockGet.mockResolvedValueOnce({ username: 'johndoe' });

    const program = createProgram({ json: true });
    await program.parseAsync(['node', 'hub', 'doctor']);

    const output = consoleSpy.mock.calls.map((c) => c[0]).join('');
    const result = JSON.parse(output);
    const authCheck = result.checks.find((c: any) => c.name === 'authentication');
    expect(authCheck.status).toBe('ok');
    expect(authCheck.message).toBe('johndoe');
  });

  it('reports auth error when no token', async () => {
    mockReadConfig.mockReturnValue({
      agents: { claude: { skill_path: '~/.claude/commands' } },
    });
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('process.exit'); }) as any);

    const program = createProgram({ json: true });
    await expect(program.parseAsync(['node', 'hub', 'doctor'])).rejects.toThrow('process.exit');

    const output = consoleSpy.mock.calls.map((c) => c[0]).join('');
    const result = JSON.parse(output);
    const authCheck = result.checks.find((c: any) => c.name === 'authentication');
    expect(authCheck.status).toBe('error');
    mockExit.mockRestore();
  });

  it('checks agent paths and reports configured vs not-configured', async () => {
    mockGet.mockResolvedValueOnce({ username: 'johndoe' });
    vi.mocked(existsSync).mockImplementation((p) => {
      if (String(p).includes('.claude/commands')) return true;
      return false;
    });

    const program = createProgram({ json: true });
    await program.parseAsync(['node', 'hub', 'doctor']);

    const output = consoleSpy.mock.calls.map((c) => c[0]).join('');
    const result = JSON.parse(output);

    const claudeCheck = result.checks.find((c: any) => c.name === 'agent_path.claude');
    expect(claudeCheck.status).toBe('ok');

    const codexCheck = result.checks.find((c: any) => c.name === 'agent_path.codex');
    expect(codexCheck.status).toBe('warn');
    expect(codexCheck.message).toBe('not configured');
  });

  it('validates skill hash match', async () => {
    mockGet.mockResolvedValueOnce({ username: 'johndoe' });
    mockListInstalledSkills.mockReturnValue({
      'git-helper': {
        version: '1.0.0',
        agent: 'claude',
        path: '~/.claude/commands/git-helper.md',
        file_hash: 'sha256:abc123',
        installed_at: '2024-01-01T00:00:00Z',
      },
    });

    vi.mocked(existsSync).mockReturnValue(true);
    // Mock readFileSync to return content that hashes to a known value
    vi.mocked(readFileSync).mockReturnValue(Buffer.from('test content'));

    const program = createProgram({ json: true });
    await program.parseAsync(['node', 'hub', 'doctor']);

    const output = consoleSpy.mock.calls.map((c) => c[0]).join('');
    const result = JSON.parse(output);

    const skillCheck = result.checks.find((c: any) => c.name === 'skill.git-helper');
    // Hash won't match 'abc123' so it should be warn (modified locally)
    expect(skillCheck.status).toBe('warn');
    expect(skillCheck.message).toBe('file modified locally');
  });

  it('reports skill file missing', async () => {
    mockGet.mockResolvedValueOnce({ username: 'johndoe' });
    mockListInstalledSkills.mockReturnValue({
      'test-skill': {
        version: '1.0.0',
        agent: 'claude',
        path: '~/.claude/commands/test-skill.md',
        file_hash: 'sha256:abc',
        installed_at: '2024-01-01T00:00:00Z',
      },
    });
    vi.mocked(existsSync).mockReturnValue(false);

    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('process.exit'); }) as any);

    const program = createProgram({ json: true });
    await expect(program.parseAsync(['node', 'hub', 'doctor'])).rejects.toThrow('process.exit');

    const output = consoleSpy.mock.calls.map((c) => c[0]).join('');
    const result = JSON.parse(output);
    const skillCheck = result.checks.find((c: any) => c.name === 'skill.test-skill');
    expect(skillCheck.status).toBe('error');
    expect(skillCheck.message).toBe('file missing');
    mockExit.mockRestore();
  });

  it('filters by skill name argument', async () => {
    mockGet.mockResolvedValueOnce({ username: 'johndoe' });
    mockListInstalledSkills.mockReturnValue({
      'git-helper': {
        version: '1.0.0',
        agent: 'claude',
        path: '~/.claude/commands/git-helper.md',
        file_hash: 'sha256:abc',
        installed_at: '2024-01-01T00:00:00Z',
      },
      'code-review': {
        version: '2.0.0',
        agent: 'claude',
        path: '~/.claude/commands/code-review.md',
        file_hash: 'sha256:def',
        installed_at: '2024-01-01T00:00:00Z',
      },
    });
    vi.mocked(existsSync).mockReturnValue(true);
    vi.mocked(readFileSync).mockReturnValue(Buffer.from('content'));

    const program = createProgram({ json: true });
    await program.parseAsync(['node', 'hub', 'doctor', 'git-helper']);

    const output = consoleSpy.mock.calls.map((c) => c[0]).join('');
    const result = JSON.parse(output);

    const skillChecks = result.checks.filter((c: any) => c.name.startsWith('skill.'));
    expect(skillChecks).toHaveLength(1);
    expect(skillChecks[0].name).toBe('skill.git-helper');
  });
});
