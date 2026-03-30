import { NextResponse } from 'next/server';

const GUIDE = `# AresDevUnit Hub CLI - Installation Guide

## Prerequisites
- Node.js >= 20
- Git

## Quick Start (one-liner)
curl -fsSL https://aresdevunit.vercel.app/api/v1/install.sh | bash

## Manual Installation
git clone https://github.com/aresdev-unit/aresdevunit.git
cd aresdevunit/packages/cli
npm install
npm run build
npm link

## Verify Installation
aresdevhubcli --version

## Project Documentation
After cloning, the following docs are available in the repo:
- docs/SPEC.md          — Full technical specification
- docs/PLAN.md          — Implementation plan
- docs/SKILLS-SPEC.md   — Skills specification (13 skills)
- CLAUDE.md             — Project guide for Claude Code agents

When setting up Claude Code for this project, the CLAUDE.md at repo root
will be automatically loaded. It contains CSV rules, data paths, CLI usage,
and references to all specification documents.

## Available Commands
aresdevhubcli login            # Authenticate via GitHub OAuth
aresdevhubcli init             # Create a new skill project
aresdevhubcli validate         # Validate skill.json and files
aresdevhubcli publish          # Publish a skill to the registry
aresdevhubcli install <name>   # Install a skill (e.g. aresdevhubcli install my-skill --agent claude)
aresdevhubcli install <name> --type rule  # Install a rule to ~/.aresdevunit/rules/
aresdevhubcli uninstall <name> # Remove an installed skill
aresdevhubcli update           # Update all installed skills
aresdevhubcli search <query>   # Search for skills
aresdevhubcli info <name>      # Show skill details
aresdevhubcli list             # List installed skills (--mine for your published skills)
aresdevhubcli rules list       # List installed rules
aresdevhubcli rules path       # Show rules directory path
aresdevhubcli rules show <name> # Show rule content
aresdevhubcli whoami           # Show current user
aresdevhubcli logout           # Sign out

## Agent Usage (non-interactive)
aresdevhubcli install <name> --yes --json --agent claude
aresdevhubcli publish --yes --json
aresdevhubcli search "keyword" --json

## API Base URL
${process.env.NEXTAUTH_URL || 'https://aresdevunit.vercel.app'}/api/v1

## Endpoints
GET  /api/v1/health          # Service status
GET  /api/v1/skills          # Browse skills
GET  /api/v1/skills/:name    # Skill detail
GET  /api/v1/install-guide   # This guide
GET  /api/v1/cli-guide       # Full CLI reference (all commands, skill.json spec, API list)
`;

export async function GET() {
  return new NextResponse(GUIDE, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
