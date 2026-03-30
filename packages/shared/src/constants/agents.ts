export const KNOWN_AGENTS = {
  claude: {
    name: 'Claude Code',
    defaultPath: '~/.claude/commands',
    detectDir: '~/.claude',
  },
  codex: {
    name: 'Codex',
    defaultPath: '~/.codex/skills',
    detectDir: '~/.codex',
  },
} as const;

export type AgentType = keyof typeof KNOWN_AGENTS;

export const AGENT_TYPES = Object.keys(KNOWN_AGENTS) as AgentType[];
