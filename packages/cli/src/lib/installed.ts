import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';
import { readConfig } from './config.js';

const CONFIG_DIR = join(homedir(), '.aresdevunit');
const INSTALLED_FILE = join(CONFIG_DIR, 'installed.json');

function getEffectiveInstalledFile(): string {
  try {
    const config = readConfig();
    if (config.workspace_path) {
      const skillsDir = join(config.workspace_path, '.skills');
      if (!existsSync(skillsDir)) {
        mkdirSync(skillsDir, { recursive: true });
      }
      return join(skillsDir, 'installed.json');
    }
  } catch {
    // fallback to default
  }
  return INSTALLED_FILE;
}

export interface InstalledSkill {
  version: string;
  agent: string;
  path: string;
  file_hash: string;
  installed_at: string;
  type?: string; // 'skill' | 'rule'
}

export interface InstalledManifest {
  skills: Record<string, InstalledSkill>;
}

const EMPTY_MANIFEST: InstalledManifest = { skills: {} };

export function getInstalledPath(): string {
  return getEffectiveInstalledFile();
}

export function readInstalled(): InstalledManifest {
  const filePath = getEffectiveInstalledFile();
  if (!existsSync(filePath)) {
    return { ...EMPTY_MANIFEST, skills: {} };
  }
  try {
    const raw = readFileSync(filePath, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<InstalledManifest>;
    return {
      skills: parsed.skills ?? {},
    };
  } catch {
    return { ...EMPTY_MANIFEST, skills: {} };
  }
}

export function writeInstalled(manifest: InstalledManifest): void {
  const filePath = getEffectiveInstalledFile();
  const dir = join(filePath, '..');
  if (!existsSync(dir)) {
    mkdirSync(dir, { recursive: true });
  }
  writeFileSync(filePath, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
}

export function addInstalledSkill(
  name: string,
  skill: InstalledSkill
): void {
  const manifest = readInstalled();
  manifest.skills[name] = skill;
  writeInstalled(manifest);
}

export function removeInstalledSkill(name: string): InstalledSkill | null {
  const manifest = readInstalled();
  const existing = manifest.skills[name] ?? null;
  if (existing) {
    delete manifest.skills[name];
    writeInstalled(manifest);
  }
  return existing;
}

export function getInstalledSkill(name: string): InstalledSkill | null {
  const manifest = readInstalled();
  return manifest.skills[name] ?? null;
}

export function listInstalledSkills(): Record<string, InstalledSkill> {
  return readInstalled().skills;
}
