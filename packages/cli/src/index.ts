#!/usr/bin/env node

import { readFileSync } from 'node:fs';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { Command } from 'commander';
import chalk from 'chalk';
import { loginCommand } from './commands/login.js';
import { logoutCommand } from './commands/logout.js';
import { whoamiCommand } from './commands/whoami.js';
import { initCommand } from './commands/init.js';
import { validateCommand } from './commands/validate.js';
import { publishCommand } from './commands/publish.js';
import { installCommand } from './commands/install.js';
import { uninstallCommand } from './commands/uninstall.js';
import { updateCommand } from './commands/update.js';
import { searchCommand } from './commands/search.js';
import { infoCommand } from './commands/info.js';
import { listCommand } from './commands/list.js';
import { doctorCommand } from './commands/doctor.js';
import { configCommand } from './commands/config.js';
import { updateCliCommand } from './commands/update-cli.js';
import { rulesCommand } from './commands/rules.js';
import { workCommand } from './commands/work.js';

// NO_COLOR support (https://no-color.org/)
if (process.env['NO_COLOR'] !== undefined) {
  chalk.level = 0;
}

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);
const pkg = JSON.parse(readFileSync(resolve(__dirname, '..', 'package.json'), 'utf-8'));

const program = new Command();

program
  .name('aresdevhubcli')
  .description('AresDevUnit Hub CLI — AI Agent skill manager')
  .version(pkg.version)
  .option('--no-color', 'Disable colors and unicode symbols')
  .option('--json', 'Output in JSON format')
  .option('-y, --yes', 'Auto-approve all confirmation prompts')
  .option('--agent <type>', 'Specify agent type (e.g. claude, codex)');

// Non-TTY: auto-enable --json
if (!process.stdout.isTTY) {
  program.setOptionValue('json', true);
}

// Handle --no-color flag
program.hook('preAction', () => {
  const opts = program.opts();
  if (opts.color === false) {
    chalk.level = 0;
  }
});

// Register commands
program.addCommand(loginCommand);
program.addCommand(logoutCommand);
program.addCommand(whoamiCommand);
program.addCommand(initCommand);
program.addCommand(validateCommand);
program.addCommand(publishCommand);
program.addCommand(installCommand);
program.addCommand(uninstallCommand);
program.addCommand(updateCommand);
program.addCommand(searchCommand);
program.addCommand(infoCommand);
program.addCommand(listCommand);
program.addCommand(doctorCommand);
program.addCommand(configCommand);
program.addCommand(updateCliCommand);
program.addCommand(rulesCommand);
program.addCommand(workCommand);

program.parse();
