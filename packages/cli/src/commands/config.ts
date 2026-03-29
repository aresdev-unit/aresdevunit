import { Command } from 'commander';
import chalk from 'chalk';
import { readConfig, writeConfig, type HubConfig } from '../lib/config.js';

const TOKEN_FIELDS = ['access_token', 'refresh_token'];

/**
 * Get a nested value from an object using dot notation.
 * e.g. getByPath(obj, 'agents.claude.skill_path')
 */
function getByPath(obj: Record<string, unknown>, path: string): unknown {
  const keys = path.split('.');
  let current: unknown = obj;
  for (const key of keys) {
    if (current === null || current === undefined || typeof current !== 'object') {
      return undefined;
    }
    current = (current as Record<string, unknown>)[key];
  }
  return current;
}

/**
 * Set a nested value on an object using dot notation.
 * Creates intermediate objects as needed.
 */
function setByPath(obj: Record<string, unknown>, path: string, value: unknown): void {
  const keys = path.split('.');
  let current: Record<string, unknown> = obj;
  for (let i = 0; i < keys.length - 1; i++) {
    const key = keys[i]!;
    if (current[key] === undefined || current[key] === null || typeof current[key] !== 'object') {
      current[key] = {};
    }
    current = current[key] as Record<string, unknown>;
  }
  current[keys[keys.length - 1]!] = value;
}

/**
 * Flatten an object into dot-notation key-value pairs.
 * e.g. { agents: { claude: { skill_path: '~/.claude/commands' } } }
 *   => [['agents.claude.skill_path', '~/.claude/commands']]
 */
function flatten(
  obj: Record<string, unknown>,
  prefix = ''
): Array<[string, unknown]> {
  const result: Array<[string, unknown]> = [];
  for (const [key, value] of Object.entries(obj)) {
    const fullKey = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object' && !Array.isArray(value)) {
      result.push(...flatten(value as Record<string, unknown>, fullKey));
    } else {
      result.push([fullKey, value]);
    }
  }
  return result;
}

function maskValue(key: string, value: unknown): string {
  if (TOKEN_FIELDS.some((tf) => key === tf || key.endsWith(`.${tf}`))) {
    return '[REDACTED]';
  }
  if (value === null || value === undefined) {
    return 'null';
  }
  return String(value);
}

// --- Sub-commands ---

const getSubcommand = new Command('get')
  .description('Get a config value')
  .argument('<key>', 'Config key (dot notation)')
  .action((key: string) => {
    const useJson = getSubcommand.parent?.parent?.opts().json ?? false;
    const config = readConfig() as unknown as Record<string, unknown>;
    const value = getByPath(config, key);

    if (value === undefined) {
      if (useJson) {
        console.log(JSON.stringify({ error: { code: 'NOT_FOUND', message: `Key "${key}" not found.` } }));
      } else {
        console.error(chalk.red(`Key "${key}" not found.`));
      }
      process.exit(1);
      return;
    }

    if (useJson) {
      const masked = TOKEN_FIELDS.some((tf) => key === tf || key.endsWith(`.${tf}`))
        ? '[REDACTED]'
        : value;
      console.log(JSON.stringify({ key, value: masked }));
    } else {
      const display = maskValue(key, typeof value === 'object' && value !== null
        ? JSON.stringify(value, null, 2)
        : value);
      console.log(`${chalk.cyan(key)}: ${display}`);
    }
  });

const setSubcommand = new Command('set')
  .description('Set a config value')
  .argument('<key>', 'Config key (dot notation)')
  .argument('<value>', 'Value to set')
  .action((key: string, rawValue: string) => {
    const useJson = setSubcommand.parent?.parent?.opts().json ?? false;

    // Parse value: try JSON first, fallback to string
    let value: unknown = rawValue;
    if (rawValue === 'null') {
      value = null;
    } else if (rawValue === 'true') {
      value = true;
    } else if (rawValue === 'false') {
      value = false;
    } else if (/^\d+$/.test(rawValue)) {
      value = Number(rawValue);
    }

    const config = readConfig() as unknown as Record<string, unknown>;
    setByPath(config, key, value);
    writeConfig(config as unknown as HubConfig);

    if (useJson) {
      console.log(JSON.stringify({ key, value }));
    } else {
      console.log(chalk.cyan('\u2192') + ` Updated ${chalk.bold(key)}`);
    }
  });

const listSubcommand = new Command('list')
  .description('List all config values')
  .action(() => {
    const useJson = listSubcommand.parent?.parent?.opts().json ?? false;
    const config = readConfig() as unknown as Record<string, unknown>;
    const entries = flatten(config);

    if (useJson) {
      const masked: Record<string, unknown> = {};
      for (const [key, value] of entries) {
        masked[key] = TOKEN_FIELDS.some((tf) => key === tf || key.endsWith(`.${tf}`))
          ? '[REDACTED]'
          : value;
      }
      console.log(JSON.stringify(masked));
    } else {
      for (const [key, value] of entries) {
        console.log(`${chalk.cyan(key)}: ${maskValue(key, value)}`);
      }
    }
  });

export const configCommand = new Command('config')
  .description('View and update CLI configuration')
  .addCommand(getSubcommand)
  .addCommand(setSubcommand)
  .addCommand(listSubcommand);
