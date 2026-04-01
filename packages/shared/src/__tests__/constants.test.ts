import { describe, it, expect } from 'vitest';
import { KNOWN_AGENTS, AGENT_TYPES } from '../constants/agents.js';
import { SKILL_CATEGORIES, CATEGORY_VALUES } from '../constants/categories.js';
import { ERROR_CODES } from '../constants/errors.js';

describe('agents', () => {
  it('AGENT_TYPES contains claude and codex', () => {
    expect(AGENT_TYPES).toContain('claude');
    expect(AGENT_TYPES).toContain('codex');
  });

  it('KNOWN_AGENTS has correct structure', () => {
    expect(KNOWN_AGENTS.claude.name).toBe('Claude Code');
    expect(KNOWN_AGENTS.claude.defaultPath).toBe('~/.claude/commands');
    expect(KNOWN_AGENTS.claude.detectDir).toBe('~/.claude');
    expect(KNOWN_AGENTS.codex.defaultPath).toBeNull();
  });

  it('AGENT_TYPES matches KNOWN_AGENTS keys', () => {
    expect(AGENT_TYPES).toEqual(Object.keys(KNOWN_AGENTS));
  });
});

describe('categories', () => {
  it('has 9 categories', () => {
    expect(CATEGORY_VALUES).toHaveLength(9);
  });

  it('CATEGORY_VALUES matches SKILL_CATEGORIES keys', () => {
    expect(CATEGORY_VALUES).toEqual(Object.keys(SKILL_CATEGORIES));
  });

  it('includes expected categories', () => {
    expect(CATEGORY_VALUES).toContain('developer-tools');
    expect(CATEGORY_VALUES).toContain('testing');
    expect(CATEGORY_VALUES).toContain('other');
  });
});

describe('errors', () => {
  it('has all expected error codes', () => {
    const expectedCodes = [
      'UNAUTHORIZED',
      'FORBIDDEN',
      'SKILL_NOT_FOUND',
      'SKILL_ALREADY_EXISTS',
      'VERSION_ALREADY_EXISTS',
      'VALIDATION_ERROR',
      'RATE_LIMITED',
      'INTERNAL_ERROR',
      'AUTHORIZATION_PENDING',
    ];
    expect(Object.keys(ERROR_CODES)).toEqual(expect.arrayContaining(expectedCodes));
    expect(Object.keys(ERROR_CODES)).toHaveLength(expectedCodes.length);
  });

  it('each error has status and message', () => {
    for (const [, value] of Object.entries(ERROR_CODES)) {
      expect(value).toHaveProperty('status');
      expect(value).toHaveProperty('message');
      expect(typeof value.status).toBe('number');
      expect(typeof value.message).toBe('string');
    }
  });

  it('UNAUTHORIZED is 401', () => {
    expect(ERROR_CODES.UNAUTHORIZED.status).toBe(401);
  });

  it('RATE_LIMITED is 429', () => {
    expect(ERROR_CODES.RATE_LIMITED.status).toBe(429);
  });
});
