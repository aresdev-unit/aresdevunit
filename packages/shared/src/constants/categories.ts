export const SKILL_CATEGORIES = {
  'developer-tools': 'Developer Tools',
  'code-review': 'Code Review',
  documentation: 'Documentation',
  testing: 'Testing',
  devops: 'DevOps',
  'data-analysis': 'Data Analysis',
  writing: 'Writing',
  productivity: 'Productivity',
  other: 'Other',
} as const;

export type SkillCategory = keyof typeof SKILL_CATEGORIES;

export const CATEGORY_VALUES = Object.keys(SKILL_CATEGORIES) as SkillCategory[];
