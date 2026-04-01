import { Command } from 'commander';
import chalk from 'chalk';
import { listInstalledSkills } from '../lib/installed.js';
import { getApiClient, AuthError, NetworkError } from '../lib/api-client.js';
import { readConfig } from '../lib/config.js';
import type { PaginatedResponse, SkillSummary } from '@aresdevunit/shared';

export const listCommand = new Command('list')
  .description('List skills')
  .option('--installed', 'List locally installed skills (default)')
  .option('--mine', 'List my published skills')
  .action(async (opts) => {
    const parentOpts = listCommand.parent?.opts() ?? {};
    const useJson = parentOpts.json ?? false;

    // --mine: list published skills
    if (opts.mine) {
      const config = readConfig();
      if (!config.access_token) {
        if (useJson) {
          console.log(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Not logged in. Run `aresdevhubcli login` first.' } }));
        } else {
          console.error(chalk.red('Not logged in. Run `aresdevhubcli login` first.'));
        }
        process.exit(3);
      }

      try {
        const client = getApiClient();
        const result = await client.get<PaginatedResponse<SkillSummary>>(
          '/skills?author=me'
        );

        if (useJson) {
          console.log(JSON.stringify(result));
          return;
        }

        if (result.data.length === 0) {
          console.log('No published skills yet.');
          return;
        }

        console.log(chalk.bold('My published skills:'));
        for (const skill of result.data) {
          const nameCol = chalk.cyan(skill.name.padEnd(20));
          const verCol = (`v${skill.latest_version}`).padEnd(10);
          const dlCol = `\u2193${skill.downloads}`;
          const likeCol = `\u2665${skill.likes}`;
          console.log(`  ${nameCol} ${verCol} ${dlCol}  ${likeCol}`);
        }
      } catch (err) {
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
            console.error(chalk.red(`\nNetwork error: ${err.message}\nCheck your connection and retry, or run \`aresdevhubcli doctor\` for diagnostics.\n(exit code 4)`));
          }
          process.exit(4);
        }

        if (useJson) {
          console.log(JSON.stringify({ error: { code: 'LIST_ERROR', message: err instanceof Error ? err.message : 'Unknown error' } }));
        } else {
          console.error(chalk.red(err instanceof Error ? err.message : 'Unknown error'));
        }
        process.exit(1);
      }
      return;
    }

    // Default: --installed
    const skills = listInstalledSkills();

    if (useJson) {
      console.log(JSON.stringify({ skills }));
      return;
    }

    const entries = Object.entries(skills);
    if (entries.length === 0) {
      console.log('No skills installed. Run `aresdevhubcli search <query>` to find skills.');
      return;
    }

    console.log(chalk.bold('Installed skills:'));
    for (const [name, info] of entries) {
      const nameCol = chalk.cyan(name.padEnd(18));
      const verCol = (`v${info.version}`).padEnd(10);
      const agentCol = info.agent.padEnd(8);
      console.log(`  ${nameCol} ${verCol} ${agentCol} ${info.path}`);
    }
  });
