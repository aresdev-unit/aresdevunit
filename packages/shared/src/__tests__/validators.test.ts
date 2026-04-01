import { describe, it, expect } from 'vitest';
import { skillJsonSchema, skillNameSchema, FILE_CONSTRAINTS } from '../validators/skill.js';

describe('skillNameSchema', () => {
  it('accepts valid names', () => {
    expect(skillNameSchema.safeParse('git-helper').success).toBe(true);
    expect(skillNameSchema.safeParse('my-skill-v2').success).toBe(true);
    expect(skillNameSchema.safeParse('ab').success).toBe(true);
  });

  it('accepts exactly 50 chars', () => {
    expect(skillNameSchema.safeParse('a'.repeat(50)).success).toBe(true);
  });

  it('rejects 51 chars', () => {
    expect(skillNameSchema.safeParse('a'.repeat(51)).success).toBe(false);
  });

  it('rejects single char (too short)', () => {
    expect(skillNameSchema.safeParse('a').success).toBe(false);
  });

  it('rejects uppercase', () => {
    expect(skillNameSchema.safeParse('Git-Helper').success).toBe(false);
  });

  it('rejects starting with hyphen', () => {
    expect(skillNameSchema.safeParse('-invalid').success).toBe(false);
  });

  it('rejects starting with number', () => {
    expect(skillNameSchema.safeParse('123abc').success).toBe(false);
  });

  it('rejects spaces', () => {
    expect(skillNameSchema.safeParse('has space').success).toBe(false);
  });

  it('rejects empty string', () => {
    expect(skillNameSchema.safeParse('').success).toBe(false);
  });
});

describe('skillJsonSchema', () => {
  const validSkill = {
    name: 'git-helper',
    version: '1.0.0',
    description: 'A skill that helps with git operations',
    author: 'johndoe',
    category: 'developer-tools',
    agent_types: ['claude'],
    keywords: ['git', 'automation'],
    license: 'MIT',
    files: { claude: 'git-helper.md' },
  };

  it('accepts valid skill.json', () => {
    const result = skillJsonSchema.safeParse(validSkill);
    expect(result.success).toBe(true);
  });

  // Test each required field missing individually
  const requiredFields = ['name', 'version', 'description', 'author', 'category', 'agent_types', 'files'] as const;
  for (const field of requiredFields) {
    it(`rejects missing ${field}`, () => {
      const { [field]: _, ...rest } = validSkill;
      expect(skillJsonSchema.safeParse(rest).success).toBe(false);
    });
  }

  it('rejects invalid version', () => {
    expect(skillJsonSchema.safeParse({ ...validSkill, version: 'abc' }).success).toBe(false);
    expect(skillJsonSchema.safeParse({ ...validSkill, version: '1.0' }).success).toBe(false);
  });

  it('rejects empty agent_types', () => {
    expect(skillJsonSchema.safeParse({ ...validSkill, agent_types: [] }).success).toBe(false);
  });

  it('rejects invalid category', () => {
    expect(skillJsonSchema.safeParse({ ...validSkill, category: 'nope' }).success).toBe(false);
  });

  it('rejects empty files', () => {
    expect(skillJsonSchema.safeParse({ ...validSkill, files: {} }).success).toBe(false);
  });

  it('rejects description too short', () => {
    expect(skillJsonSchema.safeParse({ ...validSkill, description: 'short' }).success).toBe(false);
  });

  it('rejects description too long', () => {
    expect(skillJsonSchema.safeParse({ ...validSkill, description: 'x'.repeat(201) }).success).toBe(false);
  });

  it('rejects empty author', () => {
    expect(skillJsonSchema.safeParse({ ...validSkill, author: '' }).success).toBe(false);
  });

  it('accepts optional min_agent_versions', () => {
    const result = skillJsonSchema.safeParse({
      ...validSkill,
      min_agent_versions: { claude: '1.0.0' },
    });
    expect(result.success).toBe(true);
  });

  it('defaults keywords and license', () => {
    const { keywords: _, license: __, ...minimal } = validSkill;
    const result = skillJsonSchema.safeParse(minimal);
    expect(result.success).toBe(true);
    if (result.success) {
      expect(result.data.keywords).toEqual([]);
      expect(result.data.license).toBe('MIT');
    }
  });

  it('rejects too many keywords', () => {
    const keywords = Array.from({ length: 11 }, (_, i) => `kw${i}`);
    expect(skillJsonSchema.safeParse({ ...validSkill, keywords }).success).toBe(false);
  });

  it('rejects keyword too long', () => {
    expect(
      skillJsonSchema.safeParse({ ...validSkill, keywords: ['x'.repeat(31)] }).success,
    ).toBe(false);
  });
});

describe('FILE_CONSTRAINTS', () => {
  it('has correct values', () => {
    expect(FILE_CONSTRAINTS.MAX_FILE_SIZE).toBe(500 * 1024);
    expect(FILE_CONSTRAINTS.MAX_TOTAL_SIZE).toBe(1024 * 1024);
    expect(FILE_CONSTRAINTS.ALLOWED_EXTENSIONS).toContain('.md');
    expect(FILE_CONSTRAINTS.MAX_FILES).toBe(5);
  });
});
