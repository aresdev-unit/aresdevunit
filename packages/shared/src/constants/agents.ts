export const KNOWN_AGENTS = {
  claude: {
    name: 'Claude Code',
    defaultPath: '~/.claude/commands',
    detectDir: '~/.claude',
  },
  codex: {
    name: 'Codex',
    defaultPath: null,
    detectDir: null,
  },
} as const;

export type AgentType = keyof typeof KNOWN_AGENTS;

export const AGENT_TYPES = Object.keys(KNOWN_AGENTS) as AgentType[];
