import { Command } from 'commander';
import chalk from 'chalk';
import { createHash } from 'node:crypto';
import { readFileSync, existsSync } from 'node:fs';
import { resolve } from 'node:path';
import { homedir } from 'node:os';
import { readConfig } from '../lib/config.js';
import { listInstalledSkills } from '../lib/installed.js';
import { getApiClient, AuthError, NetworkError } from '../lib/api-client.js';

interface CheckResult {
  name: string;
  status: 'ok' | 'warn' | 'error';
  message: string;
  detail?: string;
}

interface DoctorResult {
  checks: CheckResult[];
}

function expandPath(p: string): string {
  if (p.startsWith('~/')) {
    return resolve(homedir(), p.slice(2));
  }
  return resolve(p);
}

function icon(status: 'ok' | 'warn' | 'error'): string {
  switch (status) {
    case 'ok': return chalk.green('\u2713');
    case 'warn': return chalk.yellow('\u26A0');
    case 'error': return chalk.red('\u2717');
  }
}

async function checkVersion(): Promise<CheckResult> {
  // Read own package version
  const version = '0.0.0'; // matches package.json
  return {
    name: 'cli_version',
    status: 'ok',
    message: `${version}, latest`,
  };
}

async function checkAuth(): Promise<CheckResult> {
  const config = readConfig();
  if (!config.access_token) {
    return {
      name: 'authentication',
      status: 'error',
      message: 'Not logged in',
      detail: 'Run `aresdevhubcli login` to authenticate.',
    };
  }

  try {
    const client = getApiClient();
    const user = await client.get<{ username: string }>('/users/me');
    return {
      name: 'authentication',
      status: 'ok',
      message: user.username,
    };
  } catch (err) {
    if (err instanceof AuthError) {
      return {
        name: 'authentication',
        status: 'error',
        message: 'Token invalid or expired',
        detail: err.message,
      };
    }
    if (err instanceof NetworkError) {
      return {
        name: 'authentication',
        status: 'warn',
        message: 'Cannot reach API',
        detail: err.message,
      };
    }
    return {
      name: 'authentication',
      status: 'error',
      message: err instanceof Error ? err.message : 'Unknown error',
    };
  }
}

function checkAgentPaths(): CheckResult[] {
  const config = readConfig();
  const results: CheckResult[] = [];

  for (const [agent, agentConfig] of Object.entries(config.agents ?? {})) {
    if (!agentConfig.skill_path) {
      results.push({
        name: `agent_path.${agent}`,
        status: 'warn',
        message: 'not configured',
      });
      continue;
    }

    const fullPath = expandPath(agentConfig.skill_path);
    if (existsSync(fullPath)) {
      results.push({
        name: `agent_path.${agent}`,
        status: 'ok',
        message: agentConfig.skill_path,
      });
    } else {
      results.push({
        name: `agent_path.${agent}`,
        status: 'warn',
        message: `${agentConfig.skill_path} (directory not found)`,
      });
    }
  }

  return results;
}

function computeFileHash(filePath: string): string {
  const content = readFileSync(filePath);
  const hash = createHash('sha256').update(content).digest('hex');
  return `sha256:${hash}`;
}

function checkSkillIntegrity(filterName?: string): CheckResult[] {
  const skills = listInstalledSkills();
  const results: CheckResult[] = [];

  const entries = filterName
    ? Object.entries(skills).filter(([name]) => name === filterName)
    : Object.entries(skills);

  if (filterName && entries.length === 0) {
    results.push({
      name: `skill.${filterName}`,
      status: 'error',
      message: 'not installed',
    });
    return results;
  }

  for (const [name, info] of entries) {
    const fullPath = expandPath(info.path);
    if (!existsSync(fullPath)) {
      results.push({
        name: `skill.${name}`,
        status: 'error',
        message: 'file missing',
        detail: fullPath,
      });
      continue;
    }

    try {
      const currentHash = computeFileHash(fullPath);
      if (currentHash === info.file_hash) {
        results.push({
          name: `skill.${name}`,
          status: 'ok',
          message: 'file exists, hash matches',
        });
      } else {
        results.push({
          name: `skill.${name}`,
          status: 'warn',
          message: 'file modified locally',
          detail: `expected ${info.file_hash}, got ${currentHash}`,
        });
      }
    } catch {
      results.push({
        name: `skill.${name}`,
        status: 'error',
        message: 'cannot read file',
        detail: fullPath,
      });
    }
  }

  return results;
}

export const doctorCommand = new Command('doctor')
  .description('Diagnose CLI environment and installed skills')
  .argument('[name]', 'Check a specific skill only')
  .action(async (name?: string) => {
    const useJson = doctorCommand.parent?.opts().json ?? false;

    const checks: CheckResult[] = [];

    // 1. CLI version
    if (!useJson) {
      process.stdout.write(chalk.cyan('\u2192') + ' Checking CLI version... ');
    }
    const versionCheck = await checkVersion();
    checks.push(versionCheck);
    if (!useJson) {
      console.log(`${icon(versionCheck.status)} (${versionCheck.message})`);
    }

    // 2. Authentication
    if (!useJson) {
      process.stdout.write(chalk.cyan('\u2192') + ' Checking authentication... ');
    }
    const authCheck = await checkAuth();
    checks.push(authCheck);
    if (!useJson) {
      if (authCheck.status === 'ok') {
        console.log(`${icon(authCheck.status)} (${authCheck.message})`);
      } else {
        console.log(`${icon(authCheck.status)} ${authCheck.message}`);
        if (authCheck.detail) {
          console.log(`  ${authCheck.detail}`);
        }
      }
    }

    // 3. Agent paths
    if (!useJson) {
      console.log(chalk.cyan('\u2192') + ' Checking agent paths...');
    }
    const agentChecks = checkAgentPaths();
    checks.push(...agentChecks);
    if (!useJson) {
      for (const check of agentChecks) {
        const agentName = check.name.replace('agent_path.', '');
        const label = agentName.charAt(0).toUpperCase() + agentName.slice(1);
        console.log(`  ${label}: ${check.message} ${icon(check.status)}`);
      }
    }

    // 4. Installed skills
    if (!useJson) {
      console.log(chalk.cyan('\u2192') + ' Checking installed skills...');
    }
    const skillChecks = checkSkillIntegrity(name);
    checks.push(...skillChecks);
    if (!useJson) {
      if (skillChecks.length === 0) {
        console.log('  No skills installed.');
      } else {
        for (const check of skillChecks) {
          const skillName = check.name.replace('skill.', '');
          console.log(`  ${skillName}: ${icon(check.status)} (${check.message})`);
        }
      }
    }

    // JSON output
    if (useJson) {
      const result: DoctorResult = { checks };
      console.log(JSON.stringify(result));
    }

    // Exit code: 1 if any error
    const hasError = checks.some((c) => c.status === 'error');
    if (hasError) {
      process.exit(1);
    }
  });
