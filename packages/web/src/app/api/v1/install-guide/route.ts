import { NextResponse } from 'next/server';

const GUIDE = `# AresDevUnit Hub CLI - Installation Guide

## Prerequisites
- Node.js >= 20
- Git

## Installation
git clone https://github.com/aresdev-unit/aresdevunit.git
cd aresdevunit/packages/cli
npm install
npm link

## Quick Start (one-liner)
git clone https://github.com/aresdev-unit/aresdevunit.git && cd aresdevunit/packages/cli && npm install && npm link

## Verify Installation
hub --version

## Available Commands
hub login            # Authenticate via GitHub OAuth
hub init             # Create a new skill project
hub validate         # Validate skill.json and files
hub publish          # Publish a skill to the registry
hub install <name>   # Install a skill (e.g. hub install my-skill --agent claude)
hub uninstall <name> # Remove an installed skill
hub update           # Update all installed skills
hub search <query>   # Search for skills
hub info <name>      # Show skill details
hub list             # List installed skills (--mine for your published skills)
hub whoami           # Show current user
hub logout           # Sign out

## Agent Usage (non-interactive)
hub install <name> --yes --json --agent claude
hub publish --yes --json
hub search "keyword" --json

## API Base URL
${process.env.NEXTAUTH_URL || 'https://aresdevunit.vercel.app'}/api/v1

## Endpoints
GET  /api/v1/health          # Service status
GET  /api/v1/skills          # Browse skills
GET  /api/v1/skills/:name    # Skill detail
GET  /api/v1/install-guide   # This guide
`;

export async function GET() {
  return new NextResponse(GUIDE, {
    headers: { 'Content-Type': 'text/plain; charset=utf-8' },
  });
}
