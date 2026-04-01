import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { getApiClient, NetworkError, AuthError } from '../lib/api-client.js';
import { readConfig, clearTokens } from '../lib/config.js';

export const logoutCommand = new Command('logout')
  .description('Log out and revoke tokens')
  .action(async () => {
    const useJson = logoutCommand.parent?.opts().json ?? false;
    const spinner = ora();

    const config = readConfig();

    if (!config.refresh_token) {
      if (useJson) {
        console.log(JSON.stringify({ status: 'ok', message: 'Already logged out' }));
      } else {
        console.log(chalk.yellow('Already logged out.'));
      }
      return;
    }

    try {
      spinner.start('Revoking token...');

      const client = getApiClient();
      await client.post('/auth/revoke', {
        refresh_token: config.refresh_token,
      });

      clearTokens();
      spinner.succeed('Logged out successfully');

      if (useJson) {
        console.log(JSON.stringify({ status: 'ok' }));
      }
    } catch (err) {
      // Even if revoke fails server-side, clear local tokens
      clearTokens();

      if (err instanceof NetworkError) {
        spinner.warn('Could not reach server, but local tokens have been cleared.');
        if (useJson) {
          console.log(JSON.stringify({ status: 'ok', warning: 'Server unreachable, local tokens cleared' }));
        }
        return;
      }

      if (err instanceof AuthError) {
        // Token was already invalid, that's fine for logout
        spinner.succeed('Logged out successfully');
        if (useJson) {
          console.log(JSON.stringify({ status: 'ok' }));
        }
        return;
      }

      spinner.fail('Logout encountered an error');
      console.error(
        chalk.red(`  ${err instanceof Error ? err.message : 'Unknown error'}`)
      );
      process.exit(1);
    }
  });
