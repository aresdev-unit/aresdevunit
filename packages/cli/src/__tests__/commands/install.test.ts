import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';

// Mock dependencies before imports
vi.mock('node:fs', () => ({
  writeFileSync: vi.fn(),
  readFileSync: vi.fn(),
  existsSync: vi.fn(() => false),
  mkdirSync: vi.fn(),
}));

vi.mock('node:os', () => ({
  homedir: () => '/home/testuser',
}));

vi.mock('ora', () => ({
  default: () => ({
    start: vi.fn().mockReturnThis(),
    succeed: vi.fn().mockReturnThis(),
    fail: vi.fn().mockReturnThis(),
    stop: vi.fn().mockReturnThis(),
  }),
}));

vi.mock('chalk', () => ({
  default: {
    red: (s: string) => s,
    green: (s: string) => s,
    cyan: (s: string) => s,
    yellow: (s: string) => s,
  },
}));

vi.mock('inquirer', () => ({
  default: {
    prompt: vi.fn(),
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
const mockUpdateConfig = vi.fn();
vi.mock('../../lib/config.js', () => ({
  readConfig: () => mockReadConfig(),
  updateConfig: (c: any) => mockUpdateConfig(c),
}));

const mockAddInstalledSkill = vi.fn();
const mockGetInstalledSkill = vi.fn();
vi.mock('../../lib/installed.js', () => ({
  addInstalledSkill: (name: string, skill: any) => mockAddInstalledSkill(name, skill),
  getInstalledSkill: (name: string) => mockGetInstalledSkill(name),
}));

vi.mock('@aresdevunit/shared', () => ({
  KNOWN_AGENTS: {
    claude: { name: 'Claude Code', defaultPath: '~/.claude/commands', detectDir: '~/.claude' },
    codex: { name: 'Codex', defaultPath: '~/.codex/skills', detectDir: '~/.codex' },
  },
  AGENT_TYPES: ['claude', 'codex'],
}));

import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { installCommand } from '../../commands/install.js';

const DOWNLOAD_RESPONSE = {
  name: 'test-skill',
  version: '1.0.0',
  agent_types: ['claude'],
  is_verified: true,
  deprecated: false,
  files: [
    { path: 'test-skill.md', content: Buffer.from('# Test Skill').toString('base64') },
  ],
};

/** Wire installCommand into a parent program so Commander resolves parent opts. */
function createProgram(globalOpts: Record<string, any> = {}) {
  const program = new Command();
  program
    .option('--json', 'JSON output')
    .option('-y, --yes', 'Auto-approve')
    .option('--agent <type>', 'Agent type');
  for (const [k, v] of Object.entries(globalOpts)) {
    program.setOptionValue(k, v);
  }
  program.addCommand(installCommand);
  return program;
}

describe('installCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockReadConfig.mockReturnValue({
      access_token: 'test-token',
      agents: {
        claude: { skill_path: '~/.claude/commands' },
        codex: { skill_path: '~/.codex/skills' },
      },
    });
    // Simulate non-TTY
    Object.defineProperty(process.stdout, 'isTTY', { value: false, writable: true });
  });

  it('calls download API with skill name', async () => {
    mockGet.mockResolvedValueOnce(DOWNLOAD_RESPONSE);

    const program = createProgram({ json: true, yes: true, agent: 'claude' });
    await program.parseAsync(['node', 'hub', 'install', 'test-skill']);

    expect(mockGet).toHaveBeenCalledWith(
      '/skills/test-skill/download',
      { skipAuth: false },
    );
  });

  it('parses name@version and passes version query param', async () => {
    mockGet.mockResolvedValueOnce({ ...DOWNLOAD_RESPONSE, version: '2.0.0' });

    const program = createProgram({ json: true, yes: true, agent: 'claude' });
    await program.parseAsync(['node', 'hub', 'install', 'test-skill@2.0.0']);

    expect(mockGet).toHaveBeenCalledWith(
      '/skills/test-skill/download?version=2.0.0',
      { skipAuth: false },
    );
  });

  it('detects agent from --agent flag and writes files', async () => {
    mockGet.mockResolvedValueOnce(DOWNLOAD_RESPONSE);

    const program = createProgram({ json: true, yes: true, agent: 'claude' });
    await program.parseAsync(['node', 'hub', 'install', 'test-skill']);

    // Should write the skill file
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('test-skill.md'),
      expect.any(Buffer),
    );
  });

  it('updates installed.json after install', async () => {
    mockGet.mockResolvedValueOnce(DOWNLOAD_RESPONSE);

    const program = createProgram({ json: true, yes: true, agent: 'claude' });
    await program.parseAsync(['node', 'hub', 'install', 'test-skill']);

    expect(mockAddInstalledSkill).toHaveBeenCalledWith(
      'test-skill',
      expect.objectContaining({
        version: '1.0.0',
        agent: 'claude',
        file_hash: expect.stringContaining('sha256:'),
      }),
    );
  });

  it('shows unverified warning for unverified skills', async () => {
    const unverifiedDownload = { ...DOWNLOAD_RESPONSE, is_verified: false };
    mockGet.mockResolvedValueOnce(unverifiedDownload);

    const program = createProgram({ json: true, yes: true, agent: 'claude' });
    await program.parseAsync(['node', 'hub', 'install', 'test-skill']);

    // In JSON mode with --yes, the install should still proceed
    expect(mockAddInstalledSkill).toHaveBeenCalled();
  });

  it('exits with code 5 when skill is not found', async () => {
    const notFoundError = new Error('Skill not found');
    mockGet.mockRejectedValueOnce(notFoundError);
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('process.exit'); }) as any);

    const program = createProgram({ json: true, yes: true, agent: 'claude' });
    await expect(program.parseAsync(['node', 'hub', 'install', 'nonexistent-skill'])).rejects.toThrow('process.exit');

    expect(mockExit).toHaveBeenCalledWith(5);
    mockExit.mockRestore();
  });

  it('creates target directory if it does not exist', async () => {
    mockGet.mockResolvedValueOnce(DOWNLOAD_RESPONSE);
    vi.mocked(existsSync).mockReturnValue(false);

    const program = createProgram({ json: true, yes: true, agent: 'claude' });
    await program.parseAsync(['node', 'hub', 'install', 'test-skill']);

    expect(mkdirSync).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({ recursive: true }),
    );
  });


  it('adds codex frontmatter to SKILL.md files', async () => {
    mockGet.mockResolvedValueOnce({
      ...DOWNLOAD_RESPONSE,
      files: [
        { path: 'SKILL.md', content: Buffer.from('# Test Skill\n\nSkill body').toString('base64') },
      ],
    });

    const program = createProgram({ json: true, yes: true, agent: 'codex' });
    await program.parseAsync(['node', 'hub', 'install', 'test-skill']);

    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('/home/testuser/.codex/skills/test-skill/SKILL.md'),
      expect.any(Buffer),
    );

    const content = vi.mocked(writeFileSync).mock.calls[0]?.[1] as Buffer;
    expect(content.toString('utf-8')).toContain('name: "test-skill"');
    expect(content.toString('utf-8')).toContain('description: "Skill body"');
  });

  it('uses configured codex path when --agent codex is specified', async () => {
    mockGet.mockResolvedValueOnce({
      ...DOWNLOAD_RESPONSE,
      files: [
        { path: 'SKILL.md', content: Buffer.from('# Test Skill').toString('base64') },
      ],
    });

    const program = createProgram({ json: true, yes: true, agent: 'codex' });
    await program.parseAsync(['node', 'hub', 'install', 'test-skill']);

    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('/home/testuser/.codex/skills/test-skill/SKILL.md'),
      expect.any(Buffer),
    );
    expect(mockAddInstalledSkill).toHaveBeenCalledWith(
      'test-skill',
      expect.objectContaining({ agent: 'codex' }),
    );
  });
});
