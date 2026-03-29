import { Command } from 'commander';
import chalk from 'chalk';
import { readFileSync, statSync, existsSync } from 'node:fs';
import { join, extname, resolve } from 'node:path';
import { skillJsonSchema, FILE_CONSTRAINTS, type SkillJson } from '@aresdevunit/shared';

const TEMPLATE_DEFAULTS = [
  'A helpful skill for AI agents',
  'A helpful skill',
];

const PROMPT_INJECTION_PATTERNS = [
  /ignore\s+(all\s+)?previous\s+instructions/i,
  /ignore\s+(all\s+)?prior\s+instructions/i,
  /disregard\s+(all\s+)?previous/i,
  /forget\s+(all\s+)?previous/i,
  /override\s+(all\s+)?instructions/i,
  /<\s*system\s*>/i,
  /^system\s*:/im,
  /fetch\s+(this\s+)?url/i,
  /download\s+from\s+http/i,
  /curl\s+http/i,
  /wget\s+http/i,
  /read\s+\/etc\//i,
  /cat\s+\/etc\//i,
  /access\s+(the\s+)?file\s+system/i,
  /write\s+to\s+(\/|~)/i,
  /rm\s+-rf/i,
];

export interface ValidationResult {
  valid: boolean;
  errors: string[];
  warnings: string[];
}

export function validateSkillDir(dir: string): ValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];

  // 1. Load skill.json
  const skillJsonPath = join(dir, 'skill.json');
  if (!existsSync(skillJsonPath)) {
    errors.push('skill.json not found in current directory');
    return { valid: false, errors, warnings };
  }

  let rawJson: string;
  let parsed: unknown;
  try {
    rawJson = readFileSync(skillJsonPath, 'utf-8');
    parsed = JSON.parse(rawJson);
  } catch (err) {
    errors.push(`skill.json is not valid JSON: ${err instanceof Error ? err.message : 'parse error'}`);
    return { valid: false, errors, warnings };
  }

  // 2. Zod validation
  const result = skillJsonSchema.safeParse(parsed);
  if (!result.success) {
    for (const issue of result.error.issues) {
      const path = issue.path.join('.');
      errors.push(`${path ? path + ': ' : ''}${issue.message}`);
    }
    return { valid: false, errors, warnings };
  }

  const skillJson: SkillJson = result.data;

  // 3. Check file existence, size, extensions
  let totalSize = 0;
  const seenFiles = new Set<string>();

  for (const [agent, filePath] of Object.entries(skillJson.files)) {
    if (seenFiles.has(filePath)) continue;
    seenFiles.add(filePath);

    const fullPath = join(dir, filePath);

    // Extension check
    const ext = extname(filePath);
    if (!(FILE_CONSTRAINTS.ALLOWED_EXTENSIONS as readonly string[]).includes(ext)) {
      errors.push(`File "${filePath}": extension "${ext}" not allowed (allowed: ${FILE_CONSTRAINTS.ALLOWED_EXTENSIONS.join(', ')})`);
      continue;
    }

    if (!existsSync(fullPath)) {
      errors.push(`File "${filePath}" referenced in skill.json does not exist`);
      continue;
    }

    const stat = statSync(fullPath);
    if (stat.size > FILE_CONSTRAINTS.MAX_FILE_SIZE) {
      errors.push(`File "${filePath}" exceeds max size (${(stat.size / 1024).toFixed(0)}KB > ${FILE_CONSTRAINTS.MAX_FILE_SIZE / 1024}KB)`);
    }
    totalSize += stat.size;
  }

  if (seenFiles.size > FILE_CONSTRAINTS.MAX_FILES) {
    errors.push(`Too many files (${seenFiles.size} > ${FILE_CONSTRAINTS.MAX_FILES})`);
  }

  if (totalSize > FILE_CONSTRAINTS.MAX_TOTAL_SIZE) {
    errors.push(`Total size exceeds limit (${(totalSize / 1024).toFixed(0)}KB > ${FILE_CONSTRAINTS.MAX_TOTAL_SIZE / 1024}KB)`);
  }

  // 4. Template default warnings
  if (TEMPLATE_DEFAULTS.some((d) => skillJson.description === d)) {
    warnings.push('description is still the default template');
  }

  // 5. Prompt injection scan
  for (const filePath of seenFiles) {
    const fullPath = join(dir, filePath);
    if (!existsSync(fullPath)) continue;

    const content = readFileSync(fullPath, 'utf-8');
    for (const pattern of PROMPT_INJECTION_PATTERNS) {
      const match = content.match(pattern);
      if (match) {
        warnings.push(`File "${filePath}": potential unsafe pattern detected: "${match[0]}"`);
      }
    }
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}

export const validateCommand = new Command('validate')
  .description('Validate the current skill project')
  .action(async () => {
    const parentOpts = validateCommand.parent?.opts() ?? {};
    const useJson = parentOpts.json ?? false;
    const cwd = process.cwd();

    const result = validateSkillDir(cwd);

    if (useJson) {
      console.log(JSON.stringify({
        valid: result.valid,
        errors: result.errors,
        warnings: result.warnings,
      }));
      if (!result.valid) {
        process.exit(2);
      }
      return;
    }

    // Human-readable output
    if (result.errors.length === 0) {
      console.log(chalk.green('Validating skill.json... ') + chalk.green('\u2713'));
    } else {
      console.log(chalk.red('Validating skill.json... ') + chalk.red('\u2717'));
    }

    for (const err of result.errors) {
      console.log(chalk.red(`  \u2717 ${err}`));
    }

    for (const warn of result.warnings) {
      console.log(chalk.yellow(`  \u26A0 ${warn}`));
    }

    if (result.valid) {
      const warnCount = result.warnings.length;
      if (warnCount > 0) {
        console.log(chalk.green(`Validation passed`) + chalk.yellow(` (${warnCount} warning${warnCount > 1 ? 's' : ''})`));
      } else {
        console.log(chalk.green('Validation passed'));
      }
    } else {
      console.log(chalk.red(`Validation failed (${result.errors.length} error${result.errors.length > 1 ? 's' : ''})`));
      process.exit(2);
    }
  });
