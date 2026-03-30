import { readFileSync, writeFileSync, mkdirSync, existsSync } from 'node:fs';
import { join } from 'node:path';
import { homedir } from 'node:os';

const CONFIG_DIR = join(homedir(), '.aresdevunit');
const INSTALLED_FILE = join(CONFIG_DIR, 'installed.json');

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
  return INSTALLED_FILE;
}

export function readInstalled(): InstalledManifest {
  if (!existsSync(INSTALLED_FILE)) {
    return { ...EMPTY_MANIFEST, skills: {} };
  }
  try {
    const raw = readFileSync(INSTALLED_FILE, 'utf-8');
    const parsed = JSON.parse(raw) as Partial<InstalledManifest>;
    return {
      skills: parsed.skills ?? {},
    };
  } catch {
    return { ...EMPTY_MANIFEST, skills: {} };
  }
}

export function writeInstalled(manifest: InstalledManifest): void {
  if (!existsSync(CONFIG_DIR)) {
    mkdirSync(CONFIG_DIR, { recursive: true });
  }
  writeFileSync(INSTALLED_FILE, JSON.stringify(manifest, null, 2) + '\n', 'utf-8');
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
