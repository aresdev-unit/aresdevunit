import { Command } from 'commander';
import chalk from 'chalk';
import { getApiClient, AuthError, NetworkError } from '../lib/api-client.js';
import { readConfig } from '../lib/config.js';

interface UserMeResponse {
  id: string;
  username: string;
  email: string;
  avatar_url: string | null;
  role: string;
  skills_count: number;
  created_at: string;
}

export const whoamiCommand = new Command('whoami')
  .description('Show current authenticated user')
  .action(async () => {
    const useJson = whoamiCommand.parent?.opts().json ?? false;

    const config = readConfig();
    if (!config.access_token) {
      if (useJson) {
        console.log(
          JSON.stringify({
            error: { code: 'UNAUTHORIZED', message: 'Not logged in. Run `aresdevhubcli login` first.' },
          })
        );
      } else {
        console.error(chalk.red('Not logged in. Run `aresdevhubcli login` first.'));
      }
      process.exit(3);
    }

    try {
      const client = getApiClient();
      const user = await client.get<UserMeResponse>('/users/me');

      if (useJson) {
        console.log(JSON.stringify(user));
      } else {
        console.log(`${chalk.bold(user.username)} (${user.email})`);
        console.log(`Role: ${user.role}`);
        console.log(`Skills: ${user.skills_count} published`);
      }
    } catch (err) {
      if (err instanceof AuthError) {
        if (useJson) {
          console.log(
            JSON.stringify({
              error: { code: 'UNAUTHORIZED', message: err.message },
            })
          );
        } else {
          console.error(chalk.red(err.message));
        }
        process.exit(3);
      }

      if (err instanceof NetworkError) {
        if (useJson) {
          console.log(
            JSON.stringify({
              error: { code: 'NETWORK_ERROR', message: err.message },
            })
          );
        } else {
          console.error(
            chalk.red(
              `\nNetwork error: ${err.message}\nCheck your connection and retry, or run \`aresdevhubcli doctor\` for diagnostics.\n(exit code 4)`
            )
          );
        }
        process.exit(4);
      }

      console.error(
        chalk.red(err instanceof Error ? err.message : 'Unknown error')
      );
      process.exit(1);
    }
  });
