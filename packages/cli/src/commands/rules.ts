import { Command } from 'commander';
import chalk from 'chalk';
import { getRulesDir, readRules, readRuleContent } from '../lib/rules.js';

export const rulesCommand = new Command('rules')
  .description('Manage installed rules (~/.aresdevunit/rules/)');

rulesCommand
  .command('list')
  .description('List all installed rules')
  .action(() => {
    const parentOpts = rulesCommand.parent?.opts() ?? {};
    const useJson = parentOpts.json ?? false;

    const rules = readRules();

    if (useJson) {
      console.log(JSON.stringify({ rules: rules.map((r) => ({ name: r.name, path: r.path })) }));
      return;
    }

    if (rules.length === 0) {
      console.log(chalk.yellow('No rules installed.'));
      console.log(`Install one with: ${chalk.cyan('aresdevhubcli install <name> --type rule')}`);
      return;
    }

    console.log(chalk.bold(`Installed rules (${rules.length}):\n`));
    for (const rule of rules) {
      console.log(`  ${chalk.green(rule.name)}`);
      console.log(`    ${chalk.dim(rule.path)}`);
    }
  });

rulesCommand
  .command('path')
  .description('Show the rules directory path')
  .action(() => {
    const parentOpts = rulesCommand.parent?.opts() ?? {};
    const useJson = parentOpts.json ?? false;

    const dir = getRulesDir();

    if (useJson) {
      console.log(JSON.stringify({ path: dir }));
    } else {
      console.log(dir);
    }
  });

rulesCommand
  .command('show <name>')
  .description('Show content of an installed rule')
  .action((name: string) => {
    const parentOpts = rulesCommand.parent?.opts() ?? {};
    const useJson = parentOpts.json ?? false;

    const content = readRuleContent(name);

    if (content === null) {
      if (useJson) {
        console.log(JSON.stringify({ error: { code: 'RULE_NOT_FOUND', message: `Rule '${name}' not found` } }));
      } else {
        console.error(chalk.red(`Rule '${name}' not found.`));
        console.log(`Run ${chalk.cyan('aresdevhubcli rules list')} to see installed rules.`);
      }
      process.exit(1);
    }

    if (useJson) {
      console.log(JSON.stringify({ name, content }));
    } else {
      console.log(chalk.bold(`--- ${name} ---\n`));
      console.log(content);
    }
  });
