import { readFileSync, writeFileSync, readdirSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const RULES_DIR = join(homedir(), '.aresdevunit', 'rules');

/**
 * Get the rules directory path (~/.aresdevunit/rules/)
 */
export function getRulesDir(): string {
  return RULES_DIR;
}

/**
 * Ensure the rules directory exists
 */
export function ensureRulesDir(): void {
  if (!existsSync(RULES_DIR)) {
    mkdirSync(RULES_DIR, { recursive: true });
  }
}

/**
 * Read all rule files in the rules directory
 * @returns Array of { name, path } for each .md file
 */
export function readRules(): { name: string; path: string }[] {
  ensureRulesDir();

  const files = readdirSync(RULES_DIR).filter((f) => f.endsWith('.md'));
  return files.map((f) => ({
    name: f.replace(/\.md$/, ''),
    path: join(RULES_DIR, f),
  }));
}

/**
 * Install (save) a rule file
 * @param name Rule name (without .md extension)
 * @param content File content (string)
 */
export function installRule(name: string, content: string): string {
  ensureRulesDir();
  const filePath = join(RULES_DIR, `${name}.md`);
  writeFileSync(filePath, content, 'utf-8');
  return filePath;
}

/**
 * Remove a rule file
 * @param name Rule name (without .md extension)
 * @returns true if removed, false if not found
 */
export function removeRule(name: string): boolean {
  const filePath = join(RULES_DIR, `${name}.md`);
  if (existsSync(filePath)) {
    unlinkSync(filePath);
    return true;
  }
  return false;
}

/**
 * Read a specific rule's content
 * @param name Rule name (without .md extension)
 * @returns content string or null if not found
 */
export function readRuleContent(name: string): string | null {
  const filePath = join(RULES_DIR, `${name}.md`);
  if (!existsSync(filePath)) {
    return null;
  }
  return readFileSync(filePath, 'utf-8');
}
