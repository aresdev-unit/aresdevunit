import { Command } from 'commander';
import chalk from 'chalk';
import { writeFileSync, existsSync } from 'node:fs';
import { join, resolve } from 'node:path';
import inquirer from 'inquirer';
import {
  CATEGORY_VALUES,
  SKILL_CATEGORIES,
  AGENT_TYPES,
  type SkillCategory,
} from '@aresdevunit/shared';

const TEMPLATE_DESCRIPTION = 'A helpful skill for AI agents';

function makeSkillJson(opts: {
  name: string;
  description: string;
  category: string;
  agentTypes: string[];
  license: string;
}): object {
  const files: Record<string, string> = {};
  for (const agent of opts.agentTypes) {
    files[agent] = `${opts.name}.md`;
  }
  return {
    $schema: 'https://hub.aresdevunit.com/schemas/skill.json',
    name: opts.name,
    version: '1.0.0',
    description: opts.description,
    author: '',
    category: opts.category,
    agent_types: opts.agentTypes,
    keywords: [],
    license: opts.license,
    files,
  };
}

function makeTemplateMd(name: string): string {
  return `# ${name}

<!-- Write your skill instructions here -->
<!-- This file will be installed as an AI agent command -->

You are a helpful assistant.

## Usage

Describe how to use this skill.
`;
}

export const initCommand = new Command('init')
  .description('Initialize a new skill project')
  .option('--name <name>', 'Skill name')
  .option('--description <desc>', 'Skill description')
  .option('--category <category>', 'Skill category')
  .option('--agent-types <types>', 'Comma-separated agent types (e.g. claude,codex)')
  .option('--license <license>', 'License (default: MIT)')
  .action(async (opts) => {
    const parentOpts = initCommand.parent?.opts() ?? {};
    const useJson = parentOpts.json ?? false;
    const useYes = parentOpts.yes ?? false;

    const cwd = process.cwd();

    // Check if skill.json already exists
    if (existsSync(join(cwd, 'skill.json'))) {
      if (useJson) {
        console.log(JSON.stringify({ error: { code: 'ALREADY_EXISTS', message: 'skill.json already exists in this directory' } }));
      } else {
        console.error(chalk.red('skill.json already exists in this directory.'));
      }
      process.exit(1);
    }

    let name: string = opts.name ?? '';
    let description: string = opts.description ?? '';
    let category: string = opts.category ?? '';
    let agentTypes: string[] = opts.agentTypes ? opts.agentTypes.split(',').map((s: string) => s.trim()) : [];
    let license: string = opts.license ?? 'MIT';

    const isInteractive = !opts.name && process.stdout.isTTY;

    if (isInteractive) {
      // Interactive mode
      const answers = await inquirer.prompt<{
        name: string;
        description: string;
        category: string;
        agentTypes: string[];
        license: string;
      }>([
        {
          type: 'input',
          name: 'name',
          message: 'Skill name:',
          validate: (val: unknown) => {
            const v = String(val);
            if (!v || v.length < 2) return 'Name must be at least 2 characters';
            if (!/^[a-z][a-z0-9-]*$/.test(v)) return 'Must be lowercase alphanumeric with hyphens, starting with a letter';
            if (v.length > 50) return 'Name must be at most 50 characters';
            return true;
          },
        },
        {
          type: 'input',
          name: 'description',
          message: 'Description:',
          default: TEMPLATE_DESCRIPTION,
          validate: (val: unknown) => {
            const v = String(val);
            if (v.length < 10) return 'Description must be at least 10 characters';
            if (v.length > 200) return 'Description must be at most 200 characters';
            return true;
          },
        },
        {
          type: 'list',
          name: 'category',
          message: 'Category:',
          choices: CATEGORY_VALUES.map((c) => ({
            name: SKILL_CATEGORIES[c as SkillCategory],
            value: c,
          })),
        },
        {
          type: 'checkbox',
          name: 'agentTypes',
          message: 'Agent types:',
          choices: AGENT_TYPES.map((a) => ({ name: a, value: a })),
          validate: (val: unknown) => {
            const v = val as string[];
            if (v.length === 0) return 'Select at least one agent type';
            return true;
          },
        },
        {
          type: 'input',
          name: 'license',
          message: 'License:',
          default: 'MIT',
        },
      ]);

      name = answers.name;
      description = answers.description;
      category = answers.category;
      agentTypes = answers.agentTypes;
      license = answers.license;
    } else if (!opts.name) {
      // Non-TTY without --name: reject
      if (!useYes) {
        if (useJson) {
          console.log(JSON.stringify({ error: { code: 'NON_INTERACTIVE', message: 'Non-TTY environment requires --name flag or --yes' } }));
        } else {
          console.error(chalk.red('Non-TTY environment. Use --name, --description, --category, --agent-types flags.'));
        }
        process.exit(1);
      }
    }

    // Validate required fields
    if (!name) {
      console.error(chalk.red('--name is required'));
      process.exit(1);
    }
    if (!description) {
      description = TEMPLATE_DESCRIPTION;
    }
    if (!category) {
      category = 'other';
    }
    if (agentTypes.length === 0) {
      agentTypes = ['claude'];
    }

    // Generate files
    const skillJson = makeSkillJson({ name, description, category, agentTypes, license });
    const skillJsonPath = join(cwd, 'skill.json');
    const mdPath = join(cwd, `${name}.md`);

    writeFileSync(skillJsonPath, JSON.stringify(skillJson, null, 2) + '\n', 'utf-8');
    writeFileSync(mdPath, makeTemplateMd(name), 'utf-8');

    if (useJson) {
      console.log(JSON.stringify({
        status: 'ok',
        files: ['skill.json', `${name}.md`],
      }));
    } else {
      console.log(chalk.green(`Created skill.json and ${name}.md template`));
      console.log();
      console.log(chalk.bold('Next steps:'));
      console.log(`  1. Edit ${chalk.cyan(`${name}.md`)} to write your skill content`);
      console.log(`  2. Run ${chalk.cyan('hub validate')} to check your skill`);
      console.log(`  3. Run ${chalk.cyan('hub publish')} to share it with the world`);
    }
  });
