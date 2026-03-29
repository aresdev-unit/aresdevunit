import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { readFileSync, writeFileSync, existsSync, mkdirSync, unlinkSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

// Mock homedir to use a temp directory
const TEST_DIR = join(tmpdir(), `aresdevunit-test-${Date.now()}`);
const CONFIG_DIR = join(TEST_DIR, '.aresdevunit');

vi.mock('node:os', async () => {
  const actual = await vi.importActual<typeof import('node:os')>('node:os');
  return {
    ...actual,
    homedir: () => TEST_DIR,
  };
});

// Import after mocking
const {
  readInstalled,
  writeInstalled,
  addInstalledSkill,
  removeInstalledSkill,
  getInstalledSkill,
  listInstalledSkills,
  getInstalledPath,
} = await import('../../lib/installed.js');

describe('installed manifest', () => {
  beforeEach(() => {
    mkdirSync(CONFIG_DIR, { recursive: true });
  });

  afterEach(() => {
    try {
      rmSync(TEST_DIR, { recursive: true, force: true });
    } catch {
      // ignore
    }
  });

  it('returns empty manifest when file does not exist', () => {
    const manifest = readInstalled();
    expect(manifest.skills).toEqual({});
  });

  it('reads and writes manifest correctly', () => {
    const manifest = {
      skills: {
        'test-skill': {
          version: '1.0.0',
          agent: 'claude',
          path: '~/.claude/commands/test-skill.md',
          file_hash: 'sha256:abc123',
          installed_at: '2026-03-30T00:00:00Z',
        },
      },
    };

    writeInstalled(manifest);
    const read = readInstalled();
    expect(read.skills['test-skill']).toEqual(manifest.skills['test-skill']);
  });

  it('adds a skill to manifest', () => {
    addInstalledSkill('my-skill', {
      version: '2.0.0',
      agent: 'claude',
      path: '~/.claude/commands/my-skill.md',
      file_hash: 'sha256:def456',
      installed_at: '2026-03-30T01:00:00Z',
    });

    const skill = getInstalledSkill('my-skill');
    expect(skill).not.toBeNull();
    expect(skill!.version).toBe('2.0.0');
    expect(skill!.agent).toBe('claude');
  });

  it('removes a skill from manifest', () => {
    addInstalledSkill('to-remove', {
      version: '1.0.0',
      agent: 'claude',
      path: '~/.claude/commands/to-remove.md',
      file_hash: 'sha256:rem',
      installed_at: '2026-03-30T00:00:00Z',
    });

    const removed = removeInstalledSkill('to-remove');
    expect(removed).not.toBeNull();
    expect(removed!.version).toBe('1.0.0');

    const check = getInstalledSkill('to-remove');
    expect(check).toBeNull();
  });

  it('returns null when removing non-existent skill', () => {
    const removed = removeInstalledSkill('nonexistent');
    expect(removed).toBeNull();
  });

  it('returns null for non-existent skill', () => {
    const skill = getInstalledSkill('nonexistent');
    expect(skill).toBeNull();
  });

  it('lists all installed skills', () => {
    addInstalledSkill('skill-a', {
      version: '1.0.0',
      agent: 'claude',
      path: '~/.claude/commands/skill-a.md',
      file_hash: 'sha256:aaa',
      installed_at: '2026-03-30T00:00:00Z',
    });
    addInstalledSkill('skill-b', {
      version: '2.0.0',
      agent: 'codex',
      path: '/some/path/skill-b.md',
      file_hash: 'sha256:bbb',
      installed_at: '2026-03-30T01:00:00Z',
    });

    const all = listInstalledSkills();
    expect(Object.keys(all)).toHaveLength(2);
    expect(all['skill-a'].version).toBe('1.0.0');
    expect(all['skill-b'].agent).toBe('codex');
  });

  it('handles corrupt JSON gracefully', () => {
    const installedPath = getInstalledPath();
    writeFileSync(installedPath, '{ broken json', 'utf-8');
    const manifest = readInstalled();
    expect(manifest.skills).toEqual({});
  });

  it('overwrites existing skill when adding same name', () => {
    addInstalledSkill('dup', {
      version: '1.0.0',
      agent: 'claude',
      path: '~/a.md',
      file_hash: 'sha256:111',
      installed_at: '2026-03-30T00:00:00Z',
    });
    addInstalledSkill('dup', {
      version: '2.0.0',
      agent: 'codex',
      path: '~/b.md',
      file_hash: 'sha256:222',
      installed_at: '2026-03-30T01:00:00Z',
    });

    const skill = getInstalledSkill('dup');
    expect(skill!.version).toBe('2.0.0');
    expect(skill!.agent).toBe('codex');
  });
});
