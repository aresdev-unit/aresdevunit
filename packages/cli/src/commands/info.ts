import { Command } from 'commander';
import chalk from 'chalk';
import { getApiClient, NetworkError } from '../lib/api-client.js';
import type { SkillDetail } from '@aresdevunit/shared';

export const infoCommand = new Command('info')
  .description('Show detailed information about a skill')
  .argument('<name>', 'Skill name')
  .action(async (name: string) => {
    const parentOpts = infoCommand.parent?.opts() ?? {};
    const useJson = parentOpts.json ?? false;

    try {
      const client = getApiClient();
      const skill = await client.get<SkillDetail>(
        `/skills/${encodeURIComponent(name)}`,
        { skipAuth: true }
      );

      if (useJson) {
        console.log(JSON.stringify(skill));
        return;
      }

      console.log(chalk.bold(`${skill.name}`) + ` v${skill.latest_version}`);
      console.log(
        `by ${skill.author.username} | ${skill.license} | \u2193${skill.downloads} | \u2665${skill.likes}`
      );
      console.log(`Category: ${skill.category}`);
      console.log(`Agents: ${skill.agent_types.join(', ')}`);
      console.log(`Verified: ${skill.is_verified ? chalk.green('\u2713') : chalk.yellow('No')}`);
      if (skill.deprecated) {
        console.log(chalk.yellow('Status: DEPRECATED'));
      }
      console.log(`Description: ${skill.description}`);
      if (skill.keywords.length > 0) {
        console.log(`Keywords: ${skill.keywords.join(', ')}`);
      }
      console.log(`Install: ${chalk.cyan(`hub install ${skill.name}`)}`);

      if (skill.versions.length > 0) {
        console.log();
        console.log(chalk.bold('Versions:'));
        for (const v of skill.versions.slice(0, 5)) {
          const date = new Date(v.created_at).toLocaleDateString();
          const changelog = v.changelog ? ` - ${v.changelog}` : '';
          console.log(`  ${v.version} (${date})${changelog}`);
        }
        if (skill.versions.length > 5) {
          console.log(chalk.dim(`  ... and ${skill.versions.length - 5} more`));
        }
      }
    } catch (err) {
      if (err instanceof NetworkError) {
        if (useJson) {
          console.log(JSON.stringify({ error: { code: 'NETWORK_ERROR', message: err.message } }));
        } else {
          console.error(chalk.red(`\nNetwork error: ${err.message}\nCheck your connection and retry, or run \`hub doctor\` for diagnostics.\n(exit code 4)`));
        }
        process.exit(4);
      }

      // Skill not found
      if (err instanceof Error && (err.message.includes('not found') || err.message.includes('NOT_FOUND'))) {
        if (useJson) {
          console.log(JSON.stringify({ error: { code: 'SKILL_NOT_FOUND', message: `Skill '${name}' not found` } }));
        } else {
          console.error(chalk.red(`Skill '${name}' not found.`));
        }
        process.exit(5);
      }

      if (useJson) {
        console.log(JSON.stringify({ error: { code: 'INFO_ERROR', message: err instanceof Error ? err.message : 'Unknown error' } }));
      } else {
        console.error(chalk.red(err instanceof Error ? err.message : 'Unknown error'));
      }
      process.exit(1);
    }
  });
