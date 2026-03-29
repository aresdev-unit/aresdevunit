import { Command } from 'commander';
import chalk from 'chalk';
import { getApiClient, NetworkError } from '../lib/api-client.js';
import type { PaginatedResponse, SkillSummary } from '@aresdevunit/shared';

export const searchCommand = new Command('search')
  .description('Search for skills on AresDevUnit Hub')
  .argument('<query>', 'Search keywords')
  .option('--category <category>', 'Filter by category')
  .option('--agent <type>', 'Filter by agent type')
  .option('--sort <sort>', 'Sort by: downloads, latest, name, likes', 'downloads')
  .option('--limit <n>', 'Number of results', '20')
  .action(async (query: string, opts) => {
    const parentOpts = searchCommand.parent?.opts() ?? {};
    const useJson = parentOpts.json ?? false;

    const params = new URLSearchParams();
    params.set('q', query);
    if (opts.category) params.set('category', opts.category);
    if (opts.agent) params.set('agent', opts.agent);
    if (opts.sort) params.set('sort', opts.sort);
    if (opts.limit) params.set('limit', opts.limit);

    try {
      const client = getApiClient();
      const result = await client.get<PaginatedResponse<SkillSummary>>(
        `/skills?${params.toString()}`,
        { skipAuth: true }
      );

      if (useJson) {
        console.log(JSON.stringify(result));
        return;
      }

      if (result.data.length === 0) {
        console.log(`No results for "${query}".`);
        return;
      }

      console.log(chalk.bold(`Results for "${query}":`));
      for (const skill of result.data) {
        const verified = skill.is_verified ? chalk.green(' \u2713') : '';
        const deprecated = skill.deprecated ? chalk.yellow(' [deprecated]') : '';
        const nameCol = chalk.cyan(skill.name.padEnd(20));
        const verCol = (`v${skill.latest_version}`).padEnd(10);
        const dlCol = (`\u2193${skill.downloads}`).padEnd(8);
        console.log(`  ${nameCol} ${verCol} ${dlCol} "${skill.description}"${verified}${deprecated}`);
      }

      if (result.pagination.total_pages > 1) {
        console.log(chalk.dim(`  Page ${result.pagination.page}/${result.pagination.total_pages} (${result.pagination.total} total)`));
      }
    } catch (err) {
      if (err instanceof NetworkError) {
        if (useJson) {
          console.log(JSON.stringify({ error: { code: 'NETWORK_ERROR', message: err.message } }));
        } else {
          console.error(chalk.red(`\nNetwork error: ${err.message}\nCheck your connection and retry, or run \`aresdevhubcli doctor\` for diagnostics.\n(exit code 4)`));
        }
        process.exit(4);
      }

      if (useJson) {
        console.log(JSON.stringify({ error: { code: 'SEARCH_ERROR', message: err instanceof Error ? err.message : 'Unknown error' } }));
      } else {
        console.error(chalk.red(err instanceof Error ? err.message : 'Unknown error'));
      }
      process.exit(1);
    }
  });
