import { NextResponse } from 'next/server';

const GUIDE = `# AresDevUnit Hub CLI — Complete Usage Guide
# For AI Agents and developers using Claude Code, Codex, etc.

## OVERVIEW
AresDevUnit Hub is an AI Agent skill sharing platform.
Skills are .md files that agents can execute as commands/prompts.
The Hub CLI ("hub") manages publishing, installing, and sharing skills.

## PREREQUISITES
- Node.js >= 20
- Git
- GitHub account (for publishing)

## INSTALLATION
git clone https://github.com/aresdev-unit/aresdevunit.git
cd aresdevunit/packages/cli
npm install
npm link
# Verify: hub --version

================================================================================

## AUTHENTICATION

### hub login
Authenticate via GitHub OAuth using Device Code Flow.
Opens browser for GitHub authorization, then saves tokens locally.

  $ hub login
  → Opening browser for authentication...
  → Enter code: ABCD-1234
  → Logged in as johndoe

### hub logout
Sign out and revoke tokens.

  $ hub logout
  → Logged out successfully

### hub whoami
Show current authenticated user.

  $ hub whoami
  → johndoe (john@example.com)
  → Role: USER
  → Skills: 5 published

  $ hub whoami --json
  {"username":"johndoe","email":"john@example.com","role":"USER","skills_count":5}

================================================================================

## CREATING & PUBLISHING SKILLS

### hub init
Create a new skill project with skill.json and template .md file.

  # Interactive mode
  $ hub init

  # Non-interactive mode (for agents)
  $ hub init --name my-skill --description "Automates X for Y" --category developer-tools --agent-types claude,codex

  Output files:
  - skill.json    (metadata)
  - my-skill.md   (skill content — edit this)

### hub validate
Validate skill.json and files before publishing.

  $ hub validate
  → Validating skill.json... ✓
  → Checking file size... ✓
  → Checking for unsafe patterns... ✓
  → Validation passed

  Checks: schema validation, file size (<500KB each, <1MB total),
  .md extension only, prompt injection pattern scan.

### hub publish
Publish a skill to the registry. Runs validate automatically.

  $ hub publish
  → Publishing my-skill@1.0.0... ✓
  → Published: https://aresdevunit.vercel.app/skills/my-skill

  # Auto version bump
  $ hub publish --patch    # 1.0.0 → 1.0.1
  $ hub publish --minor    # 1.0.0 → 1.1.0
  $ hub publish --major    # 1.0.0 → 2.0.0

  # Agent usage (non-interactive)
  $ hub publish --yes --json

================================================================================

## INSTALLING & MANAGING SKILLS

### hub install <name>
Download and install a skill to your agent's command directory.

  $ hub install git-helper
  → Downloading git-helper@1.2.0... ✓
  → Detected agent: Claude Code
  → Installed to ~/.claude/commands/git-helper.md

  # Install specific version
  $ hub install git-helper@1.1.0

  # Specify agent explicitly
  $ hub install git-helper --agent claude

  # Agent usage (skip confirmation prompts)
  $ hub install git-helper --yes --agent claude --json

  Agent detection priority:
  1. --agent flag (highest)
  2. ~/.aresdevunit/config.json default agent
  3. Auto-detect (~/.claude/ exists → claude)
  4. Interactive prompt (or error in non-TTY without --agent)

  Install location per agent:
  - Claude Code: ~/.claude/commands/<name>.md
  - Others: configurable via hub config

### hub uninstall <name>
Remove an installed skill.

  $ hub uninstall git-helper
  → Uninstalled git-helper

### hub update [name]
Update installed skills to latest versions.

  $ hub update              # Check all installed skills
  $ hub update git-helper   # Update specific skill
  $ hub update --all --yes  # Update all without prompts (agent-friendly)

  Uses atomic updates: backup → replace → verify. Rolls back on failure.

================================================================================

## BROWSING & SEARCHING

### hub search <query>
Search the skill registry.

  $ hub search "git automation"
  → git-helper    v1.2.0  ↓1234  "Git workflow automation"
  → git-branch    v0.5.0  ↓45    "Branch management"

  # With filters
  $ hub search "testing" --category testing --agent claude

  # Agent usage
  $ hub search "code review" --json

### hub info <name>
Show detailed information about a skill.

  $ hub info git-helper
  → git-helper v1.2.0
  → by johndoe | MIT | ↓1234
  → Category: developer-tools
  → Agents: claude, codex
  → Install: hub install git-helper

  $ hub info git-helper --json

### hub list
List skills.

  $ hub list              # Show locally installed skills (default)
  $ hub list --installed  # Same as above
  $ hub list --mine       # Show my published skills (requires login)
  $ hub list --json       # Agent-friendly output

================================================================================

## GLOBAL FLAGS (apply to all commands)

  --no-color     Disable colors and unicode symbols
  --json         Output in JSON format (auto-enabled in non-TTY)
  --yes / -y     Auto-approve all confirmation prompts
  --agent <type> Specify agent type (claude, codex)

  Environment variable: NO_COLOR=1 disables colors

## NON-TTY / AGENT BEHAVIOR
When stdout is not a TTY (piped, agent-called):
- --json is auto-enabled
- Prompts without --yes will auto-REJECT and exit code 1
- Recommended pattern: hub <command> --yes --json --agent claude

## EXIT CODES
  0  Success
  1  General error
  2  Validation error (hub validate / hub publish)
  3  Authentication error (not logged in, token expired)
  4  Network error (API unreachable)
  5  Skill not found

================================================================================

## skill.json SPECIFICATION

{
  "name": "my-skill",           // 2-50 chars, lowercase, a-z0-9 and hyphens
  "version": "1.0.0",           // semver
  "description": "Does X",      // 10-200 chars
  "author": "username",
  "category": "developer-tools", // see categories below
  "agent_types": ["claude"],     // at least one
  "keywords": ["git"],           // optional, max 10
  "license": "MIT",              // optional, default MIT
  "files": {                     // at least one entry
    "claude": "my-skill.md"
  },
  "min_agent_versions": {        // optional
    "claude": "1.0.0"
  }
}

Categories: developer-tools, code-review, documentation, testing,
            devops, data-analysis, writing, productivity, other

File constraints: max 500KB per file, 1MB total, .md only, max 5 files per skill.

================================================================================

## TYPICAL WORKFLOW

1. hub login                    # Authenticate
2. hub init --name my-skill ... # Create skill project
3. (edit my-skill.md)           # Write skill content
4. hub validate                 # Check before publish
5. hub publish                  # Publish to registry
6. hub search "keyword"         # Find skills
7. hub install some-skill       # Install a skill
8. hub update                   # Keep skills updated

## API ENDPOINTS (for direct API access)
Base URL: ${process.env.NEXTAUTH_URL || 'https://aresdevunit.vercel.app'}/api/v1

GET  /health              # Service status
GET  /skills              # List skills (?q=, &category=, &sort=, &page=, &limit=)
GET  /skills/:name        # Skill detail
GET  /skills/:name/download # Download skill files (?version=)
POST /skills              # Create skill (auth required)
POST /skills/:name/versions # Add version (auth required)
POST /skills/:name/like   # Toggle like (auth required)
DELETE /skills/:name       # Deprecate skill (auth required, author/admin)
GET  /users/me            # Current user (auth required)
GET  /install-guide       # Installation guide (plain text)
GET  /cli-guide           # This guide (plain text)
`;

export async function GET() {
  return new NextResponse(GUIDE, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
