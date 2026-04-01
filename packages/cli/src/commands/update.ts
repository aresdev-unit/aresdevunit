import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { writeFileSync, renameSync, unlinkSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import inquirer from 'inquirer';
import semver from 'semver';
import { getApiClient, AuthError, NetworkError } from '../lib/api-client.js';
import { normalizeSkillContentForAgent } from '../lib/agent-skill-format.js';
import { readInstalled, writeInstalled, type InstalledSkill } from '../lib/installed.js';
import type { SkillDownload } from '@aresdevunit/shared';

function expandPath(p: string): string {
  if (p.startsWith('~/')) {
    return join(homedir(), p.slice(2));
  }
  return p;
}

interface UpdateCheck {
  name: string;
  currentVersion: string;
  latestVersion: string;
  hasUpdate: boolean;
}

export const updateCommand = new Command('update')
  .description('Update installed skills')
  .argument('[name]', 'Specific skill to update')
  .option('--all', 'Update all skills without prompting')
  .action(async (nameArg: string | undefined, opts) => {
    const parentOpts = updateCommand.parent?.opts() ?? {};
    const useJson = parentOpts.json ?? false;
    const useYes = parentOpts.yes ?? false;
    const isTTY = process.stdout.isTTY ?? false;
    const spinner = ora();

    const manifest = readInstalled();
    const skills = manifest.skills;

    if (Object.keys(skills).length === 0) {
      if (useJson) {
        console.log(JSON.stringify({ status: 'ok', message: 'No skills installed', updates: [] }));
      } else {
        console.log('No skills installed.');
      }
      return;
    }

    // Determine which skills to check
    const toCheck: string[] = nameArg ? [nameArg] : Object.keys(skills);

    if (nameArg && !skills[nameArg]) {
      if (useJson) {
        console.log(JSON.stringify({ error: { code: 'SKILL_NOT_FOUND', message: `Skill '${nameArg}' is not installed` } }));
      } else {
        console.error(chalk.red(`Skill '${nameArg}' is not installed.`));
      }
      process.exit(5);
    }

    // Check for updates
    if (!useJson) {
      spinner.start('Checking for updates...');
    }

    const client = getApiClient();
    const checks: UpdateCheck[] = [];

    for (const name of toCheck) {
      try {
        const info = await client.get<{ latest_version: string }>(
          `/skills/${encodeURIComponent(name)}`,
          { skipAuth: false }
        );
        const current = skills[name].version;
        const latest = info.latest_version;
        checks.push({
          name,
          currentVersion: current,
          latestVersion: latest,
          hasUpdate: semver.valid(current) && semver.valid(latest)
            ? semver.lt(current, latest)
            : current !== latest,
        });
      } catch (err) {
        if (err instanceof NetworkError) {
          if (!useJson) spinner.fail('Network error');
          if (useJson) {
            console.log(JSON.stringify({ error: { code: 'NETWORK_ERROR', message: err.message } }));
          } else {
            console.error(chalk.red(`\nNetwork error: ${err.message}\nCheck your connection and retry, or run \`aresdevhubcli doctor\` for diagnostics.\n(exit code 4)`));
          }
          process.exit(4);
        }
        if (err instanceof AuthError) {
          if (!useJson) spinner.fail('Auth error');
          if (useJson) {
            console.log(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: err.message } }));
          } else {
            console.error(chalk.red(err.message));
          }
          process.exit(3);
        }
        // Skill might have been removed from registry — skip it
        checks.push({
          name,
          currentVersion: skills[name].version,
          latestVersion: skills[name].version,
          hasUpdate: false,
        });
      }
    }

    if (!useJson) {
      spinner.stop();
    }

    const updatable = checks.filter((c) => c.hasUpdate);

    // Display status
    if (!useJson) {
      for (const check of checks) {
        if (check.hasUpdate) {
          console.log(`  ${check.name}: ${check.currentVersion} \u2192 ${check.latestVersion} (update available)`);
        } else {
          console.log(`  ${check.name}: ${check.currentVersion} (up to date)`);
        }
      }
    }

    if (updatable.length === 0) {
      if (useJson) {
        console.log(JSON.stringify({ status: 'ok', message: 'All skills up to date', updates: [] }));
      } else {
        console.log(chalk.green('All skills are up to date.'));
      }
      return;
    }

    // Confirm update
    if (!opts.all && !useYes && !nameArg) {
      if (isTTY) {
        const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
          { type: 'confirm', name: 'proceed', message: 'Update all?', default: false },
        ]);
        if (!proceed) {
          console.log('Update cancelled.');
          return;
        }
      } else {
        if (useJson) {
          console.log(JSON.stringify({ error: { code: 'NON_INTERACTIVE', message: 'Use --all or --yes to update in non-interactive mode' } }));
        }
        process.exit(1);
      }
    }

    // Perform updates
    const total = updatable.length;
    const results: { name: string; success: boolean; error?: string }[] = [];

    for (let i = 0; i < updatable.length; i++) {
      const check = updatable[i];
      const progress = `${i + 1}/${total}`;

      if (!useJson) {
        spinner.start(`Updating ${progress}: ${check.name}...`);
      }

      try {
        // Download new version
        const download = await client.get<SkillDownload>(
          `/skills/${encodeURIComponent(check.name)}/download`,
          { skipAuth: false }
        );

        const installed = skills[check.name];
        const filePath = expandPath(installed.path);
        const bakPath = filePath + '.bak';

        // Atomic update: backup -> write new -> update manifest -> remove backup
        // Backup existing file
        if (existsSync(filePath)) {
          renameSync(filePath, bakPath);
        }

        try {
          // Write new files
          let newHash = '';
          for (const file of download.files) {
            const originalContent = Buffer.from(file.content, 'base64');
            const content = normalizeSkillContentForAgent(installed.agent, check.name, file.path, originalContent);
            const targetPath = join(dirname(filePath), file.path);

            const targetDir = dirname(targetPath);
            if (!existsSync(targetDir)) {
              mkdirSync(targetDir, { recursive: true });
            }

            writeFileSync(targetPath, content);

            if (!newHash) {
              const hash = createHash('sha256').update(content).digest('hex');
              newHash = `sha256:${hash}`;
            }
          }

          // Update manifest
          const currentManifest = readInstalled();
          currentManifest.skills[check.name] = {
            ...installed,
            version: download.version,
            file_hash: newHash,
            installed_at: new Date().toISOString(),
          };
          writeInstalled(currentManifest);

          // Clean up backup
          if (existsSync(bakPath)) {
            unlinkSync(bakPath);
          }

          if (!useJson) {
            spinner.succeed(`Updating ${progress}: ${check.name}...`);
          }
          results.push({ name: check.name, success: true });
        } catch (writeErr) {
          // Restore from backup
          if (existsSync(bakPath)) {
            try {
              renameSync(bakPath, filePath);
            } catch {
              // Best effort restore
            }
          }
          throw writeErr;
        }
      } catch (err) {
        if (!useJson) {
          spinner.fail(`Updating ${progress}: ${check.name} failed`);
        }
        results.push({
          name: check.name,
          success: false,
          error: err instanceof Error ? err.message : 'Unknown error',
        });
      }
    }

    // Summary
    const succeeded = results.filter((r) => r.success).length;
    const failed = results.filter((r) => !r.success);

    if (useJson) {
      console.log(JSON.stringify({
        status: failed.length === 0 ? 'ok' : 'partial',
        updated: succeeded,
        failed: failed.length,
        results,
      }));
    } else {
      console.log(`Updated ${succeeded}/${total} skills successfully.`);
      for (const f of failed) {
        console.error(chalk.red(`  ${f.name}: ${f.error}`));
      }
    }

    if (failed.length > 0) {
      process.exit(1);
    }
  });
