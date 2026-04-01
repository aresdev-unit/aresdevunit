import { basename } from 'node:path';

function escapeYamlString(value: string): string {
  return value.replace(/\\/g, '\\\\').replace(/"/g, '\\"');
}

function extractDescription(markdown: string, skillName: string): string {
  const lines = markdown.split(/\r?\n/);
  for (const line of lines) {
    const trimmed = line.trim();
    if (!trimmed || trimmed === '---' || trimmed.startsWith('#')) {
      continue;
    }
    return trimmed;
  }
  return `Skill instructions for ${skillName}.`;
}

export function ensureCodexFrontmatter(skillName: string, markdown: string): string {
  if (markdown.startsWith('---\n') || markdown.startsWith('---\r\n')) {
    return markdown;
  }

  const description = escapeYamlString(extractDescription(markdown, skillName));
  const name = escapeYamlString(skillName);
  return `---\nname: "${name}"\ndescription: "${description}"\n---\n\n${markdown}`;
}

export function normalizeSkillContentForAgent(
  agent: string,
  skillName: string,
  relativePath: string,
  content: Buffer,
): Buffer {
  const normalizedPath = relativePath.replace(/\\/g, '/');
  if (agent !== 'codex' || basename(normalizedPath) !== 'SKILL.md') {
    return content;
  }

  const markdown = content.toString('utf-8');
  return Buffer.from(ensureCodexFrontmatter(skillName, markdown), 'utf-8');
}
