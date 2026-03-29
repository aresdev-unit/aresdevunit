import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { readFileSync, writeFileSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { getApiClient, AuthError, NetworkError } from '../lib/api-client.js';
import { readConfig } from '../lib/config.js';
import { validateSkillDir } from './validate.js';
import type { SkillJson } from '@aresdevunit/shared';

function bumpVersion(version: string, type: 'patch' | 'minor' | 'major'): string {
  const parts = version.split('.').map(Number);
  if (parts.length !== 3 || parts.some(isNaN)) {
    throw new Error(`Invalid version: ${version}`);
  }
  switch (type) {
    case 'major':
      return `${parts[0] + 1}.0.0`;
    case 'minor':
      return `${parts[0]}.${parts[1] + 1}.0`;
    case 'patch':
      return `${parts[0]}.${parts[1]}.${parts[2] + 1}`;
  }
}

export const publishCommand = new Command('publish')
  .description('Publish the current skill to AresDevUnit Hub')
  .option('--patch', 'Auto-bump patch version')
  .option('--minor', 'Auto-bump minor version')
  .option('--major', 'Auto-bump major version')
  .option('--changelog <text>', 'Changelog for this version')
  .action(async (opts) => {
    const parentOpts = publishCommand.parent?.opts() ?? {};
    const useJson = parentOpts.json ?? false;
    const spinner = ora();
    const cwd = process.cwd();

    // Check auth
    const config = readConfig();
    if (!config.access_token) {
      if (useJson) {
        console.log(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Not logged in. Run `hub login` first.' } }));
      } else {
        console.error(chalk.red('Not logged in. Run `hub login` first.'));
      }
      process.exit(3);
    }

    // Run validation
    if (!useJson) {
      spinner.start('Validating...');
    }

    const validation = validateSkillDir(cwd);
    if (!validation.valid) {
      if (useJson) {
        console.log(JSON.stringify({ error: { code: 'VALIDATION_ERROR', message: 'Validation failed', details: validation.errors } }));
      } else {
        spinner.fail('Validation failed');
        for (const err of validation.errors) {
          console.error(chalk.red(`  ${err}`));
        }
      }
      process.exit(2);
    }

    if (!useJson) {
      spinner.succeed('Validating...');
    }

    // Read skill.json
    const skillJsonPath = join(cwd, 'skill.json');
    const skillJson: SkillJson = JSON.parse(readFileSync(skillJsonPath, 'utf-8'));

    // Version bump
    let version = skillJson.version;
    const bumpType = opts.major ? 'major' : opts.minor ? 'minor' : opts.patch ? 'patch' : null;
    if (bumpType) {
      version = bumpVersion(version, bumpType);
      // Update skill.json on disk
      skillJson.version = version;
      writeFileSync(skillJsonPath, JSON.stringify(skillJson, null, 2) + '\n', 'utf-8');
    }

    // Collect files (base64)
    const files: { path: string; content: string }[] = [];
    const seenFiles = new Set<string>();

    for (const [_agent, filePath] of Object.entries(skillJson.files)) {
      if (seenFiles.has(filePath)) continue;
      seenFiles.add(filePath);

      const fullPath = join(cwd, filePath);
      const content = readFileSync(fullPath);
      files.push({
        path: filePath,
        content: content.toString('base64'),
      });
    }

    // Determine if new or update — try POST /skills first, if 409 then POST /skills/:name/versions
    if (!useJson) {
      spinner.start(`Publishing ${skillJson.name}@${version}...`);
    }

    try {
      const client = getApiClient();

      // Try new skill first
      try {
        const result = await client.post<{ id: string; name: string; version: string; url: string }>(
          '/skills',
          {
            name: skillJson.name,
            description: skillJson.description,
            readme: null,
            category: skillJson.category,
            version,
            changelog: opts.changelog ?? 'Initial release',
            agent_types: skillJson.agent_types,
            keywords: skillJson.keywords ?? [],
            license: skillJson.license ?? 'MIT',
            files,
          }
        );

        if (useJson) {
          console.log(JSON.stringify({ status: 'ok', ...result }));
        } else {
          spinner.succeed(`Publishing ${skillJson.name}@${version}...`);
          console.log(chalk.green(`Published: ${result.url}`));
        }
        return;
      } catch (err) {
        // If skill already exists (409), try version update
        if (err instanceof Error && (err.message.includes('already exists') || err.message.includes('SKILL_ALREADY_EXISTS'))) {
          const result = await client.post<{ id: string; name: string; version: string; url: string }>(
            `/skills/${encodeURIComponent(skillJson.name)}/versions`,
            {
              version,
              changelog: opts.changelog ?? '',
              files,
            }
          );

          if (useJson) {
            console.log(JSON.stringify({ status: 'ok', ...result }));
          } else {
            spinner.succeed(`Publishing ${skillJson.name}@${version}...`);
            console.log(chalk.green(`Published: ${result.url}`));
          }
          return;
        }
        throw err;
      }
    } catch (err) {
      if (!useJson) {
        spinner.fail(`Publishing ${skillJson.name}@${version} failed`);
      }

      if (err instanceof AuthError) {
        if (useJson) {
          console.log(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: err.message } }));
        } else {
          console.error(chalk.red(err.message));
        }
        process.exit(3);
      }

      if (err instanceof NetworkError) {
        if (useJson) {
          console.log(JSON.stringify({ error: { code: 'NETWORK_ERROR', message: err.message } }));
        } else {
          console.error(chalk.red(`\nNetwork error: ${err.message}\nCheck your connection and retry, or run \`hub doctor\` for diagnostics.\n(exit code 4)`));
        }
        process.exit(4);
      }

      if (useJson) {
        console.log(JSON.stringify({ error: { code: 'PUBLISH_ERROR', message: err instanceof Error ? err.message : 'Unknown error' } }));
      } else {
        console.error(chalk.red(err instanceof Error ? err.message : 'Unknown error'));
      }
      process.exit(1);
    }
  });
