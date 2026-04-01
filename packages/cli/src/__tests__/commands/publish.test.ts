import { describe, it, expect, beforeEach, vi } from 'vitest';
import { Command } from 'commander';

// Mock dependencies before imports
vi.mock('node:fs', () => ({
  readFileSync: vi.fn(),
  writeFileSync: vi.fn(),
  existsSync: vi.fn(() => true),
  mkdirSync: vi.fn(),
  statSync: vi.fn(() => ({ size: 100 })),
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

const mockPost = vi.fn();
const mockGet = vi.fn();
vi.mock('../../lib/api-client.js', () => ({
  getApiClient: () => ({ post: mockPost, get: mockGet }),
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

const mockValidateSkillDir = vi.fn();
vi.mock('../../commands/validate.js', () => ({
  validateSkillDir: (dir: string) => mockValidateSkillDir(dir),
}));

import { readFileSync, writeFileSync } from 'node:fs';
import { publishCommand } from '../../commands/publish.js';

const VALID_SKILL_JSON = {
  name: 'test-skill',
  version: '1.0.0',
  description: 'A test skill for testing',
  author: 'testuser',
  category: 'developer-tools',
  agent_types: ['claude'],
  keywords: ['test'],
  license: 'MIT',
  files: { claude: 'test-skill.md' },
};

function setupDefaults() {
  mockReadConfig.mockReturnValue({ access_token: 'test-token', agents: {} });
  mockValidateSkillDir.mockReturnValue({ valid: true, errors: [], warnings: [] });
  vi.mocked(readFileSync).mockImplementation((path: any) => {
    if (String(path).endsWith('skill.json')) {
      return JSON.stringify(VALID_SKILL_JSON);
    }
    return Buffer.from('# Test Skill\n\nContent here.');
  });
}

/** Wire publishCommand into a parent program so Commander resolves parent opts. */
function createProgram(globalOpts: Record<string, any> = {}) {
  const program = new Command();
  program
    .option('--json', 'JSON output')
    .option('-y, --yes', 'Auto-approve');
  for (const [k, v] of Object.entries(globalOpts)) {
    program.setOptionValue(k, v);
  }
  program.addCommand(publishCommand);
  return program;
}

describe('publishCommand', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    setupDefaults();
  });

  it('calls validate before publishing', async () => {
    mockPost.mockResolvedValueOnce({ id: '1', name: 'test-skill', version: '1.0.0', url: 'https://hub.example.com/skills/test-skill' });

    const program = createProgram({ json: true });
    await program.parseAsync(['node', 'hub', 'publish']);

    expect(mockValidateSkillDir).toHaveBeenCalled();
  });

  it('calls POST /skills API to publish', async () => {
    mockPost.mockResolvedValueOnce({ id: '1', name: 'test-skill', version: '1.0.0', url: 'https://hub.example.com/skills/test-skill' });

    const program = createProgram({ json: true });
    await program.parseAsync(['node', 'hub', 'publish']);

    expect(mockPost).toHaveBeenCalledWith(
      '/skills',
      expect.objectContaining({
        name: 'test-skill',
        version: '1.0.0',
      }),
    );
  });

  it('retries with version endpoint on 409 (already exists)', async () => {
    const alreadyExistsError = new Error('SKILL_ALREADY_EXISTS');
    mockPost
      .mockRejectedValueOnce(alreadyExistsError)
      .mockResolvedValueOnce({ id: '1', name: 'test-skill', version: '1.0.0', url: 'https://hub.example.com/skills/test-skill' });

    const program = createProgram({ json: true });
    await program.parseAsync(['node', 'hub', 'publish']);

    expect(mockPost).toHaveBeenCalledTimes(2);
    expect(mockPost).toHaveBeenLastCalledWith(
      '/skills/test-skill/versions',
      expect.objectContaining({
        version: '1.0.0',
      }),
    );
  });

  it('bumps patch version with --patch flag', async () => {
    mockPost.mockResolvedValueOnce({ id: '1', name: 'test-skill', version: '1.0.1', url: 'https://hub.example.com/skills/test-skill' });

    const program = createProgram({ json: true });
    await program.parseAsync(['node', 'hub', 'publish', '--patch']);

    expect(mockPost).toHaveBeenCalledWith(
      '/skills',
      expect.objectContaining({
        version: '1.0.1',
      }),
    );
    // Should update skill.json on disk
    expect(writeFileSync).toHaveBeenCalledWith(
      expect.stringContaining('skill.json'),
      expect.stringContaining('"1.0.1"'),
      'utf-8',
    );
  });

  it('exits with code 2 on validation failure', async () => {
    mockValidateSkillDir.mockReturnValue({ valid: false, errors: ['missing field'], warnings: [] });
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('process.exit'); }) as any);

    const program = createProgram({ json: true });
    await expect(program.parseAsync(['node', 'hub', 'publish'])).rejects.toThrow('process.exit');

    expect(mockExit).toHaveBeenCalledWith(2);
    mockExit.mockRestore();
  });

  it('exits with code 3 when not logged in', async () => {
    mockReadConfig.mockReturnValue({ access_token: undefined, agents: {} });
    const mockExit = vi.spyOn(process, 'exit').mockImplementation((() => { throw new Error('process.exit'); }) as any);

    const program = createProgram({ json: true });
    await expect(program.parseAsync(['node', 'hub', 'publish'])).rejects.toThrow('process.exit');

    expect(mockExit).toHaveBeenCalledWith(3);
    mockExit.mockRestore();
  });
});
