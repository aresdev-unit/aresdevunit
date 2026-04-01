import { z } from 'zod';
import { CATEGORY_VALUES } from '../constants/categories.js';
import { AGENT_TYPES } from '../constants/agents.js';

export const skillNameSchema = z
  .string()
  .min(2)
  .max(50)
  .regex(/^[a-z][a-z0-9-]*$/, 'Must be lowercase alphanumeric with hyphens, starting with a letter');

export const SKILL_TYPE_VALUES = ['skill', 'rule'] as const;
export type SkillType = (typeof SKILL_TYPE_VALUES)[number];

export const skillJsonSchema = z.object({
  name: skillNameSchema,
  version: z.string().regex(/^\d+\.\d+\.\d+$/, 'Must be valid semver (e.g. 1.0.0)'),
  description: z.string().min(10).max(200),
  author: z.string().min(1),
  category: z.enum(CATEGORY_VALUES as [string, ...string[]]),
  agent_types: z
    .array(z.enum(AGENT_TYPES as [string, ...string[]]))
    .min(1, 'At least one agent type required'),
  keywords: z.array(z.string().max(30)).max(10).default([]),
  license: z.string().default('MIT'),
  skill_type: z.enum(SKILL_TYPE_VALUES).default('skill').optional(),
  files: z.record(z.string(), z.string()).refine((obj) => Object.keys(obj).length > 0, {
    message: 'At least one file mapping required',
  }),
  min_agent_versions: z.record(z.string(), z.string()).optional(),
});

export type SkillJson = z.infer<typeof skillJsonSchema>;

export const FILE_CONSTRAINTS = {
  MAX_FILE_SIZE: 500 * 1024, // 500KB
  MAX_TOTAL_SIZE: 1024 * 1024, // 1MB
  ALLOWED_EXTENSIONS: ['.md'],
  MAX_FILES: 5,
} as const;
