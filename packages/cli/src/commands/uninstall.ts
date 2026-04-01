import { Command } from 'commander';
import chalk from 'chalk';
import { unlinkSync, existsSync } from 'node:fs';
import { homedir } from 'node:os';
import { join } from 'node:path';
import { removeInstalledSkill } from '../lib/installed.js';

function expandPath(p: string): string {
  if (p.startsWith('~/')) {
    return join(homedir(), p.slice(2));
  }
  return p;
}

export const uninstallCommand = new Command('uninstall')
  .description('Uninstall a skill')
  .argument('<name>', 'Skill name to uninstall')
  .action(async (name: string) => {
    const parentOpts = uninstallCommand.parent?.opts() ?? {};
    const useJson = parentOpts.json ?? false;

    const removed = removeInstalledSkill(name);

    if (!removed) {
      if (useJson) {
        console.log(JSON.stringify({ error: { code: 'SKILL_NOT_FOUND', message: `Skill '${name}' is not installed` } }));
      } else {
        console.error(chalk.red(`Skill '${name}' is not installed.`));
      }
      process.exit(5);
    }

    // Delete the file(s)
    const filePath = expandPath(removed.path);
    if (existsSync(filePath)) {
      try {
        unlinkSync(filePath);
      } catch (err) {
        if (useJson) {
          console.log(JSON.stringify({ error: { code: 'FILE_DELETE_ERROR', message: `Could not delete ${filePath}: ${err instanceof Error ? err.message : 'unknown'}` } }));
        } else {
          console.error(chalk.yellow(`Warning: Could not delete ${filePath}: ${err instanceof Error ? err.message : 'unknown error'}`));
        }
      }
    }

    if (useJson) {
      console.log(JSON.stringify({ status: 'ok', name, path: removed.path }));
    } else {
      console.log(chalk.green(`Removing ${name} from ${removed.path}... \u2713`));
      console.log(chalk.green(`Uninstalled ${name}`));
    }
  });
