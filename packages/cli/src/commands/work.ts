import { Command } from 'commander';
import chalk from 'chalk';
import { getApiClient, AuthError, NetworkError, AccountPendingError } from '../lib/api-client.js';
import { readConfig } from '../lib/config.js';

interface WorklogEntry {
  id: string;
  date: string;
  summary: string;
  unfinished: string | null;
  metadata: unknown;
  created_at: string;
  updated_at: string;
}

interface WorklogListResponse {
  data: WorklogEntry[];
  pagination: { limit: number; total: number };
}

interface WorklogCreateResponse {
  id: string;
  date: string;
  summary: string;
  unfinished: string | null;
}

function handleError(err: unknown, useJson: boolean): never {
  if (err instanceof AccountPendingError) {
    if (useJson) {
      console.log(JSON.stringify({ error: { code: 'ACCOUNT_PENDING', message: err.message } }));
    } else {
      console.error(chalk.yellow(err.message));
    }
    process.exit(3);
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
      console.error(chalk.red(`Network error: ${err.message}`));
    }
    process.exit(4);
  }

  console.error(chalk.red(err instanceof Error ? err.message : 'Unknown error'));
  process.exit(1);
}

export const workCommand = new Command('work')
  .description('Manage daily work logs for session context continuity');

workCommand
  .command('start')
  .description('Fetch previous work context for today\'s session')
  .option('--limit <n>', 'Number of recent logs to fetch', '3')
  .action(async (opts) => {
    const useJson = workCommand.parent?.opts().json ?? false;

    const config = readConfig();
    if (!config.access_token) {
      if (useJson) {
        console.log(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Not logged in.' } }));
      } else {
        console.error(chalk.red('Not logged in. Run `aresdevhubcli login` first.'));
      }
      process.exit(3);
    }

    try {
      const client = getApiClient();
      const result = await client.get<WorklogListResponse>(`/worklog?limit=${opts.limit}`);

      if (useJson) {
        console.log(JSON.stringify(result));
      } else {
        if (result.data.length === 0) {
          console.log(chalk.dim('No previous work logs found. Starting fresh.'));
        } else {
          console.log(chalk.bold('=== Previous Work Context ===\n'));
          for (const entry of result.data) {
            console.log(chalk.cyan(`--- ${entry.date} ---`));
            console.log(entry.summary);
            if (entry.unfinished) {
              console.log(chalk.yellow(`\n[Unfinished] ${entry.unfinished}`));
            }
            console.log();
          }
        }
      }
    } catch (err) {
      handleError(err, useJson);
    }
  });

workCommand
  .command('end')
  .description('Save today\'s work summary')
  .requiredOption('--summary <text>', 'Work summary (compacted by agent)')
  .option('--unfinished <text>', 'Unfinished/carry-over items')
  .action(async (opts) => {
    const useJson = workCommand.parent?.opts().json ?? false;

    const config = readConfig();
    if (!config.access_token) {
      if (useJson) {
        console.log(JSON.stringify({ error: { code: 'UNAUTHORIZED', message: 'Not logged in.' } }));
      } else {
        console.error(chalk.red('Not logged in. Run `aresdevhubcli login` first.'));
      }
      process.exit(3);
    }

    try {
      const client = getApiClient();
      const body: Record<string, string> = { summary: opts.summary };
      if (opts.unfinished) {
        body.unfinished = opts.unfinished;
      }

      const result = await client.post<WorklogCreateResponse>('/worklog', body);

      if (useJson) {
        console.log(JSON.stringify(result));
      } else {
        console.log(chalk.green(`Work log saved for ${result.date}`));
        if (result.unfinished) {
          console.log(chalk.yellow(`Carry-over: ${result.unfinished}`));
        }
      }
    } catch (err) {
      handleError(err, useJson);
    }
  });
