import { Command } from 'commander';
import chalk from 'chalk';
import { execSync } from 'node:child_process';
import { existsSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import ora from 'ora';

interface UpdateCliResult {
  success: boolean;
  gitOutput: string;
  npmOutput: string;
  error?: string;
}

function findGitRoot(): string {
  const __filename = fileURLToPath(import.meta.url);
  const __dirname = dirname(__filename);
  let dir = __dirname;
  for (let i = 0; i < 10; i++) {
    if (existsSync(resolve(dir, '.git'))) return dir;
    dir = resolve(dir, '..');
  }
  throw new Error('Could not find git root. Is the CLI installed via git clone?');
}

export const updateCliCommand = new Command('update-cli')
  .description('Update the CLI by pulling latest changes and reinstalling')
  .action(async () => {
    const useJson = updateCliCommand.parent?.opts().json ?? false;

    let gitRoot: string;
    try {
      gitRoot = findGitRoot();
    } catch (err) {
      const message = err instanceof Error ? err.message : 'Unknown error';
      if (useJson) {
        const result: UpdateCliResult = {
          success: false,
          gitOutput: '',
          npmOutput: '',
          error: message,
        };
        console.log(JSON.stringify(result));
      } else {
        console.error(chalk.red('\u2717') + ` ${message}`);
      }
      process.exit(1);
    }

    const cliDir = resolve(gitRoot, 'packages', 'cli');

    if (!useJson) {
      console.log(chalk.cyan('\u2192') + ' Updating CLI...');
    }

    // Step 1: git pull
    let gitOutput = '';
    const gitSpinner = useJson ? null : ora('git pull...').start();
    try {
      gitOutput = execSync('git pull', {
        cwd: gitRoot,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      gitSpinner?.succeed(`git pull... ${chalk.dim(gitOutput)}`);
    } catch (err) {
      const message = err instanceof Error ? (err as any).stderr || err.message : 'Unknown error';
      gitSpinner?.fail('git pull failed');
      if (useJson) {
        const result: UpdateCliResult = {
          success: false,
          gitOutput: message,
          npmOutput: '',
          error: 'git pull failed',
        };
        console.log(JSON.stringify(result));
      } else {
        console.error(chalk.red(message));
      }
      process.exit(1);
    }

    // Step 2: npm install
    let npmOutput = '';
    const npmSpinner = useJson ? null : ora('npm install...').start();
    try {
      npmOutput = execSync('npm install', {
        cwd: cliDir,
        encoding: 'utf-8',
        stdio: ['pipe', 'pipe', 'pipe'],
      }).trim();
      npmSpinner?.succeed('npm install...');
    } catch (err) {
      const message = err instanceof Error ? (err as any).stderr || err.message : 'Unknown error';
      npmSpinner?.fail('npm install failed');
      if (useJson) {
        const result: UpdateCliResult = {
          success: false,
          gitOutput,
          npmOutput: message,
          error: 'npm install failed',
        };
        console.log(JSON.stringify(result));
      } else {
        console.error(chalk.red(message));
      }
      process.exit(1);
    }

    // Success
    if (useJson) {
      const result: UpdateCliResult = {
        success: true,
        gitOutput,
        npmOutput,
      };
      console.log(JSON.stringify(result));
    } else {
      console.log(chalk.green('\u2192') + ' CLI updated successfully');
    }
  });
