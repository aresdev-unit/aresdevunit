import { Command } from 'commander';
import chalk from 'chalk';
import ora from 'ora';
import { writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { homedir } from 'node:os';
import { createHash } from 'node:crypto';
import inquirer from 'inquirer';
import { getApiClient, AuthError, NetworkError } from '../lib/api-client.js';
import { readConfig, updateConfig } from '../lib/config.js';
import { addInstalledSkill, getInstalledSkill } from '../lib/installed.js';
import { installRule } from '../lib/rules.js';
import { KNOWN_AGENTS, AGENT_TYPES, type AgentType } from '@aresdevunit/shared';
import type { SkillDownload } from '@aresdevunit/shared';

function expandPath(p: string): string {
  if (p.startsWith('~/')) {
    return join(homedir(), p.slice(2));
  }
  return p;
}

async function detectAgent(
  flagAgent: string | undefined,
  useYes: boolean,
  isTTY: boolean,
): Promise<{ agent: string; skillPath: string }> {
  // 1. --agent flag
  if (flagAgent) {
    const info = KNOWN_AGENTS[flagAgent as AgentType];
    if (info && info.defaultPath) {
      return { agent: flagAgent, skillPath: expandPath(info.defaultPath) };
    }
    // Unknown agent or no default path — use flag value as-is
    return { agent: flagAgent, skillPath: process.cwd() };
  }

  // 2. config.json default agent
  const config = readConfig();
  for (const [agentName, agentConfig] of Object.entries(config.agents)) {
    if (agentConfig.skill_path) {
      const expanded = expandPath(agentConfig.skill_path);
      if (existsSync(expanded) || existsSync(dirname(expanded))) {
        return { agent: agentName, skillPath: expanded };
      }
    }
  }

  // 3. Auto-detect
  for (const [agentName, info] of Object.entries(KNOWN_AGENTS)) {
    if (info.detectDir) {
      const detectPath = expandPath(info.detectDir);
      if (existsSync(detectPath)) {
        const skillPath = info.defaultPath ? expandPath(info.defaultPath) : process.cwd();
        return { agent: agentName, skillPath };
      }
    }
  }

  // 4. Interactive prompt
  if (isTTY && !useYes) {
    const answers = await inquirer.prompt<{ agent: string }>([
      {
        type: 'list',
        name: 'agent',
        message: 'Which agent do you use?',
        choices: [
          ...AGENT_TYPES.map((a) => ({ name: KNOWN_AGENTS[a].name, value: a })),
          { name: 'Custom path', value: '_custom' },
        ],
      },
    ]);

    let agent: string = answers.agent;
    let skillPath: string;

    if (agent === '_custom') {
      const pathAnswer = await inquirer.prompt<{ path: string }>([
        { type: 'input', name: 'path', message: 'Enter skill installation path:' },
      ]);
      agent = 'custom';
      skillPath = expandPath(pathAnswer.path);
    } else {
      const info = KNOWN_AGENTS[agent as AgentType];
      skillPath = info.defaultPath ? expandPath(info.defaultPath) : process.cwd();
    }

    // Save to config for next time
    const agentKey: string = agent;
    updateConfig({
      agents: {
        ...config.agents,
        [agentKey]: { skill_path: skillPath.replace(homedir(), '~') },
      },
    });

    return { agent, skillPath };
  }

  // Non-TTY without --agent: fail
  throw new Error('Could not detect agent. Use --agent <type> flag.');
}

export const installCommand = new Command('install')
  .description('Install a skill or rule from AresDevUnit Hub')
  .argument('<name>', 'Skill name (optionally with @version suffix)')
  .option('--type <type>', 'Content type: skill or rule', 'skill')
  .action(async (nameArg: string, cmdOpts: { type?: string }) => {
    const parentOpts = installCommand.parent?.opts() ?? {};
    const useJson = parentOpts.json ?? false;
    const useYes = parentOpts.yes ?? false;
    const flagAgent = parentOpts.agent as string | undefined;
    const isTTY = process.stdout.isTTY ?? false;
    const spinner = ora();
    const installType = cmdOpts.type ?? 'skill';

    // Parse name@version
    let name: string;
    let version: string | undefined;
    if (nameArg.includes('@') && !nameArg.startsWith('@')) {
      const atIdx = nameArg.lastIndexOf('@');
      name = nameArg.slice(0, atIdx);
      version = nameArg.slice(atIdx + 1);
    } else {
      name = nameArg;
    }

    // Download
    if (!useJson) {
      spinner.start(`Downloading ${name}${version ? '@' + version : ''}...`);
    }

    let download: SkillDownload;
    try {
      const client = getApiClient();
      const query = version ? `?version=${encodeURIComponent(version)}` : '';
      download = await client.get<SkillDownload>(
        `/skills/${encodeURIComponent(name)}/download${query}`,
        { skipAuth: false }
      );
    } catch (err) {
      if (!useJson) {
        spinner.fail(`Download failed`);
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
          console.error(chalk.red(`\nNetwork error: ${err.message}\nCheck your connection and retry, or run \`aresdevhubcli doctor\` for diagnostics.\n(exit code 4)`));
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
        console.log(JSON.stringify({ error: { code: 'DOWNLOAD_ERROR', message: err instanceof Error ? err.message : 'Unknown error' } }));
      } else {
        console.error(chalk.red(err instanceof Error ? err.message : 'Unknown error'));
      }
      process.exit(1);
    }

    if (!useJson) {
      spinner.succeed(`Downloading ${download.name}@${download.version}...`);
    }

    // Deprecated warning
    if (download.deprecated) {
      if (!useJson) {
        console.log(chalk.yellow('  \u26A0 This skill has been deprecated by the author.'));
      }
      if (!useYes && isTTY) {
        const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
          { type: 'confirm', name: 'proceed', message: 'Continue?', default: false },
        ]);
        if (!proceed) {
          console.log('Installation cancelled.');
          process.exit(0);
        }
      } else if (!useYes && !isTTY) {
        if (useJson) {
          console.log(JSON.stringify({ error: { code: 'DEPRECATED', message: 'Skill is deprecated. Use --yes to force install.' } }));
        }
        process.exit(1);
      }
    }

    // Unverified warning
    if (!download.is_verified) {
      if (!useJson) {
        console.log(chalk.yellow('  \u26A0 This skill is not verified. Install at your own risk.'));
      }
      if (!useYes && isTTY) {
        const { proceed } = await inquirer.prompt<{ proceed: boolean }>([
          { type: 'confirm', name: 'proceed', message: 'Continue?', default: false },
        ]);
        if (!proceed) {
          console.log('Installation cancelled.');
          process.exit(0);
        }
      } else if (!useYes && !isTTY) {
        if (useJson) {
          console.log(JSON.stringify({ error: { code: 'UNVERIFIED', message: 'Skill is not verified. Use --yes to force install.' } }));
        }
        process.exit(1);
      }
    }

    // --- Resolve workspace .skills/ path ---
    const config = readConfig();
    const workspaceSkillsDir = config.workspace_path
      ? join(config.workspace_path, '.skills')
      : null;

    // --- Rule install path ---
    if (installType === 'rule') {
      let installedPath = '';
      let fileHash = '';

      for (const file of download.files) {
        const content = Buffer.from(file.content, 'base64');

        if (workspaceSkillsDir) {
          // Install to workspace .skills/ directory
          if (!existsSync(workspaceSkillsDir)) {
            mkdirSync(workspaceSkillsDir, { recursive: true });
          }
          const targetPath = join(workspaceSkillsDir, `${download.name}.md`);
          writeFileSync(targetPath, content);
          if (!installedPath) {
            installedPath = targetPath;
          }
        } else {
          // Fallback: install to ~/.aresdevunit/rules/
          const rulePath = installRule(download.name, content.toString('utf-8'));
          if (!installedPath) {
            installedPath = rulePath.replace(homedir(), '~');
          }
        }

        const hash = createHash('sha256').update(content).digest('hex');
        if (!fileHash) {
          fileHash = `sha256:${hash}`;
        }
      }

      // Update installed.json with type field
      addInstalledSkill(download.name, {
        version: download.version,
        agent: 'all',
        path: workspaceSkillsDir ? installedPath : installedPath,
        file_hash: fileHash,
        installed_at: new Date().toISOString(),
        type: 'rule',
      });

      if (useJson) {
        console.log(JSON.stringify({
          status: 'ok',
          name: download.name,
          version: download.version,
          type: 'rule',
          path: installedPath,
        }));
      } else {
        console.log(chalk.green(`  Rule installed to ${installedPath}`));
        console.log(`  Run ${chalk.cyan('aresdevhubcli rules list')} to see all installed rules`);
      }
      return;
    }

    // --- Skill install path ---

    let agent: string;
    let skillPath: string;

    if (workspaceSkillsDir) {
      // Use workspace .skills/ directory
      agent = 'workspace';
      skillPath = workspaceSkillsDir;
      if (!useJson) {
        console.log(`  Using workspace: ${config.workspace_path}`);
      }
    } else {
      // Fallback: detect agent and use agent-specific path
      try {
        const detected = await detectAgent(flagAgent, useYes, isTTY);
        agent = detected.agent;
        skillPath = detected.skillPath;
      } catch (err) {
        if (useJson) {
          console.log(JSON.stringify({ error: { code: 'AGENT_DETECT_FAILED', message: err instanceof Error ? err.message : 'Agent detection failed' } }));
        } else {
          console.error(chalk.red(err instanceof Error ? err.message : 'Agent detection failed'));
        }
        process.exit(1);
      }

      if (!useJson) {
        console.log(`  Detected agent: ${KNOWN_AGENTS[agent as AgentType]?.name ?? agent}`);
      }
    }

    // Ensure target directory exists
    if (!existsSync(skillPath)) {
      mkdirSync(skillPath, { recursive: true });
    }

    // Write files and compute hash
    let installedPath = '';
    let fileHash = '';

    for (const file of download.files) {
      const content = Buffer.from(file.content, 'base64');
      const targetPath = join(skillPath, file.path);

      // Ensure parent dir exists
      const targetDir = dirname(targetPath);
      if (!existsSync(targetDir)) {
        mkdirSync(targetDir, { recursive: true });
      }

      writeFileSync(targetPath, content);

      if (!installedPath) {
        installedPath = workspaceSkillsDir
          ? targetPath
          : targetPath.replace(homedir(), '~');
      }

      const hash = createHash('sha256').update(content).digest('hex');
      if (!fileHash) {
        fileHash = `sha256:${hash}`;
      }
    }

    // Update installed.json
    addInstalledSkill(download.name, {
      version: download.version,
      agent,
      path: installedPath,
      file_hash: fileHash,
      installed_at: new Date().toISOString(),
      type: 'skill',
    });

    if (useJson) {
      console.log(JSON.stringify({
        status: 'ok',
        name: download.name,
        version: download.version,
        agent,
        path: installedPath,
      }));
    } else {
      console.log(chalk.green(`  Installed to ${installedPath}`));
      console.log(`  Run ${chalk.cyan('aresdevhubcli list --installed')} to see all installed skills`);
    }
  });
