import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import open from 'open';
import type { DeviceCodeResponse, TokenResponse } from '@aresdevunit/shared';
import { ApiClient, NetworkError } from '../lib/api-client.js';
import { readConfig, updateConfig } from '../lib/config.js';

const POLL_INTERVAL_MS = 5000;
const CLIENT_ID = 'hub-cli';

export const loginCommand = new Command('login')
  .description('Authenticate with AresDevUnit Hub via GitHub')
  .action(async () => {
    const config = readConfig();
    const client = new ApiClient(config.api_url);
    const useJson = loginCommand.parent?.opts().json ?? false;

    const spinner = ora();

    try {
      // Step 1: Request device code
      spinner.start('Requesting device code...');

      const deviceCode = await client.post<DeviceCodeResponse>(
        '/auth/device',
        { client_id: CLIENT_ID },
        { skipAuth: true }
      );

      spinner.stop();

      // Step 2: Show user code and open browser
      // Always print clearly — even in JSON mode, user needs to see the code
      console.log();
      console.log(`  ============================================`);
      console.log(`  브라우저에서 아래 URL을 열고 코드를 입력하세요:`);
      console.log();
      console.log(`  URL:  ${useJson ? deviceCode.verification_url : chalk.cyan(deviceCode.verification_url)}`);
      console.log(`  코드: ${useJson ? deviceCode.user_code : chalk.bold.yellow(deviceCode.user_code)}`);
      console.log(`  ============================================`);
      console.log();

      if (useJson) {
        console.log(
          JSON.stringify({
            action: 'open_browser_and_enter_code',
            user_code: deviceCode.user_code,
            verification_url: deviceCode.verification_url,
          })
        );
      }

      // Try to open browser (ignore failure)
      try {
        await open(deviceCode.verification_url);
      } catch {
        // Browser open is best-effort
      }

      // Step 3: Poll for token
      spinner.start('Waiting for authorization...');

      const expiresAt = Date.now() + deviceCode.expires_in * 1000;
      let tokenResponse: TokenResponse | null = null;

      while (Date.now() < expiresAt) {
        await sleep(POLL_INTERVAL_MS);

        try {
          tokenResponse = await client.post<TokenResponse>(
            '/auth/device/token',
            {
              device_code: deviceCode.device_code,
              client_id: CLIENT_ID,
            },
            { skipAuth: true }
          );

          // Success
          break;
        } catch (err) {
          if (err instanceof Error) {
            // Check if it's "authorization_pending" — keep polling
            if (err.message.includes('not yet authorized')) {
              continue;
            }
            // Check for expired
            if (err.message.includes('expired')) {
              spinner.fail('Device code expired. Please try again.');
              process.exit(3);
            }
          }
          // For network errors, keep trying within the timeout
          if (err instanceof NetworkError) {
            continue;
          }
          throw err;
        }
      }

      if (!tokenResponse) {
        spinner.fail('Authorization timed out (15 minutes). Please try again.');
        process.exit(3);
      }

      // Step 4: Save tokens
      updateConfig({
        access_token: tokenResponse.access_token,
        refresh_token: tokenResponse.refresh_token,
      });

      spinner.succeed('Logged in successfully!');

      if (useJson) {
        console.log(JSON.stringify({ status: 'ok' }));
      } else {
        console.log(
          chalk.green('  Tokens saved to ~/.aresdevunit/config.json')
        );
      }
    } catch (err) {
      spinner.fail('Login failed');

      if (err instanceof NetworkError) {
        console.error(
          chalk.red(
            `\n  Network error: ${err.message}\n  Check your connection and retry, or run \`aresdevhubcli doctor\` for diagnostics.\n  (exit code 4)`
          )
        );
        process.exit(4);
      }

      console.error(
        chalk.red(`\n  ${err instanceof Error ? err.message : 'Unknown error'}`)
      );
      process.exit(3);
    }
  });

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
