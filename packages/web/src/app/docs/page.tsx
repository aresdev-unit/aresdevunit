import { Metadata } from 'next';

export const metadata: Metadata = {
  title: 'Documentation - AresDevUnit Hub',
  description: 'Getting started guide, skill.json spec, and CLI commands',
};

export default function DocsPage() {
  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-4xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="mb-2 text-3xl font-bold text-zinc-900 dark:text-zinc-50">
          Documentation
        </h1>
        <p className="mb-8 text-zinc-600 dark:text-zinc-400">
          Everything you need to get started with AresDevUnit Hub.
        </p>

        {/* Table of Contents */}
        <nav className="mb-10 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
          <h2 className="mb-3 text-sm font-semibold uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
            On this page
          </h2>
          <ul className="space-y-1 text-sm">
            <TocLink href="#getting-started">Getting Started</TocLink>
            <TocLink href="#skill-json-spec">skill.json Specification</TocLink>
            <TocLink href="#cli-commands">CLI Commands</TocLink>
            <TocLink href="#agent-integration">Agent Integration</TocLink>
            <TocLink href="#faq">FAQ</TocLink>
          </ul>
        </nav>

        <div className="space-y-12">
          {/* Getting Started */}
          <Section id="getting-started" title="Getting Started">
            <Step number={1} title="Install the CLI">
              <p>Clone the repository and link the CLI globally:</p>
              <CodeBlock>{`git clone https://github.com/aresdev-unit/aresdevunit.git
cd aresdevunit/packages/cli
npm install
npm link`}</CodeBlock>
              <p>Verify the installation:</p>
              <CodeBlock>hub --version</CodeBlock>
            </Step>

            <Step number={2} title="Authenticate">
              <p>Sign in with your GitHub account:</p>
              <CodeBlock>hub login</CodeBlock>
              <p>
                This opens your browser for GitHub OAuth authentication.
                Once complete, your tokens are saved locally.
              </p>
            </Step>

            <Step number={3} title="Create a Skill">
              <p>Initialize a new skill project:</p>
              <CodeBlock>{`# Interactive mode
hub init

# Non-interactive (for agents)
hub init --name my-skill --description "Automates X" --category developer-tools --agent-types claude`}</CodeBlock>
              <p>
                This creates a <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs font-mono dark:bg-zinc-800">skill.json</code> and
                a template <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs font-mono dark:bg-zinc-800">.md</code> file.
                Edit the <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs font-mono dark:bg-zinc-800">.md</code> file with your skill content.
              </p>
            </Step>

            <Step number={4} title="Publish">
              <p>Validate and publish your skill:</p>
              <CodeBlock>{`hub validate   # Check before publish
hub publish    # Publish to registry`}</CodeBlock>
            </Step>

            <Step number={5} title="Install Skills">
              <p>Browse and install skills created by others:</p>
              <CodeBlock>{`hub search "code review"
hub install code-review-helper --agent claude`}</CodeBlock>
            </Step>
          </Section>

          {/* skill.json Spec */}
          <Section id="skill-json-spec" title="skill.json Specification">
            <CodeBlock>{`{
  "name": "my-skill",
  "version": "1.0.0",
  "description": "Short description (10-200 chars)",
  "author": "your-github-username",
  "category": "developer-tools",
  "agent_types": ["claude"],
  "keywords": ["git", "automation"],
  "license": "MIT",
  "files": {
    "claude": "my-skill.md"
  }
}`}</CodeBlock>

            <div className="mt-6 space-y-4">
              <FieldTable
                title="Required Fields"
                fields={[
                  { name: 'name', desc: '2-50 chars, lowercase, a-z0-9 and hyphens only' },
                  { name: 'version', desc: 'Semantic versioning (e.g., 1.0.0)' },
                  { name: 'description', desc: '10-200 characters' },
                  { name: 'author', desc: 'Your GitHub username' },
                  { name: 'category', desc: 'One of the valid categories (see below)' },
                  { name: 'agent_types', desc: 'Array with at least one: claude, codex' },
                  { name: 'files', desc: 'Map of agent type to .md file path' },
                ]}
              />

              <FieldTable
                title="Optional Fields"
                fields={[
                  { name: 'keywords', desc: 'Up to 10 keywords, max 30 chars each' },
                  { name: 'license', desc: 'Default: MIT' },
                  { name: 'min_agent_versions', desc: 'Minimum agent version requirements' },
                ]}
              />

              <div>
                <h4 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  Valid Categories
                </h4>
                <div className="flex flex-wrap gap-2">
                  {[
                    'developer-tools',
                    'code-review',
                    'documentation',
                    'testing',
                    'devops',
                    'data-analysis',
                    'writing',
                    'productivity',
                    'other',
                  ].map((cat) => (
                    <span
                      key={cat}
                      className="rounded-full bg-zinc-100 px-3 py-1 text-xs font-mono text-zinc-700 dark:bg-zinc-800 dark:text-zinc-300"
                    >
                      {cat}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <h4 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                  File Constraints
                </h4>
                <ul className="list-inside list-disc space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                  <li>Max 500KB per file</li>
                  <li>Max 1MB total across all files</li>
                  <li>Only .md files allowed</li>
                  <li>Max 5 files per skill</li>
                </ul>
              </div>
            </div>
          </Section>

          {/* CLI Commands */}
          <Section id="cli-commands" title="CLI Commands">
            <div className="space-y-1">
              <CommandRow cmd="hub login" desc="Authenticate with GitHub OAuth" />
              <CommandRow cmd="hub logout" desc="Sign out and revoke tokens" />
              <CommandRow cmd="hub whoami" desc="Show current user info" />
              <CommandRow cmd="hub init" desc="Create a new skill project" />
              <CommandRow cmd="hub validate" desc="Validate skill before publishing" />
              <CommandRow cmd="hub publish" desc="Publish skill to registry" />
              <CommandRow cmd="hub install <name>" desc="Install a skill" />
              <CommandRow cmd="hub uninstall <name>" desc="Remove an installed skill" />
              <CommandRow cmd="hub update [name]" desc="Update installed skills" />
              <CommandRow cmd="hub search <query>" desc="Search the skill registry" />
              <CommandRow cmd="hub info <name>" desc="Show skill details" />
              <CommandRow cmd="hub list" desc="List installed or published skills" />
            </div>

            <div className="mt-6">
              <h4 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Global Flags
              </h4>
              <div className="space-y-1">
                <CommandRow cmd="--json" desc="Output in JSON format" />
                <CommandRow cmd="--yes / -y" desc="Auto-approve all prompts" />
                <CommandRow cmd="--no-color" desc="Disable colors and symbols" />
                <CommandRow cmd="--agent <type>" desc="Specify agent type (claude, codex)" />
              </div>
            </div>

            <div className="mt-4 rounded-lg border border-blue-100 bg-blue-50 p-4 text-sm text-blue-800 dark:border-blue-900 dark:bg-blue-950 dark:text-blue-300">
              <strong>Agent-friendly pattern:</strong>
              <code className="ml-1 rounded bg-blue-100 px-1.5 py-0.5 text-xs font-mono dark:bg-blue-900">
                hub install &lt;name&gt; --yes --json --agent claude
              </code>
            </div>

            <div className="mt-4">
              <h4 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Exit Codes
              </h4>
              <div className="space-y-1">
                <CommandRow cmd="0" desc="Success" />
                <CommandRow cmd="1" desc="General error" />
                <CommandRow cmd="2" desc="Validation error" />
                <CommandRow cmd="3" desc="Authentication error" />
                <CommandRow cmd="4" desc="Network error" />
                <CommandRow cmd="5" desc="Skill not found" />
              </div>
            </div>
          </Section>

          {/* Agent Integration */}
          <Section id="agent-integration" title="Agent Integration">
            <p>
              Skills are installed as <code className="rounded bg-zinc-100 px-1 py-0.5 text-xs font-mono dark:bg-zinc-800">.md</code> files
              in your agent&apos;s commands directory. After installation, the agent can
              use the skill as a slash command.
            </p>

            <div className="mt-4">
              <h4 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Install Locations
              </h4>
              <div className="space-y-1">
                <CommandRow cmd="Claude Code" desc="~/.claude/commands/<name>.md" />
                <CommandRow cmd="Codex" desc="Configurable via hub config" />
              </div>
            </div>

            <div className="mt-4">
              <h4 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">
                Agent Detection Priority
              </h4>
              <ol className="list-inside list-decimal space-y-1 text-sm text-zinc-600 dark:text-zinc-400">
                <li><code className="rounded bg-zinc-100 px-1 text-xs font-mono dark:bg-zinc-800">--agent</code> flag (highest priority)</li>
                <li><code className="rounded bg-zinc-100 px-1 text-xs font-mono dark:bg-zinc-800">~/.aresdevunit/config.json</code> default agent</li>
                <li>Auto-detect (<code className="rounded bg-zinc-100 px-1 text-xs font-mono dark:bg-zinc-800">~/.claude/</code> exists = claude)</li>
                <li>Interactive prompt (or error in non-TTY)</li>
              </ol>
            </div>
          </Section>

          {/* FAQ */}
          <Section id="faq" title="FAQ">
            <div className="space-y-6">
              <FAQ
                q="Can I update a published version?"
                a="No. Published versions are immutable. To fix a bug, publish a new version using hub publish --patch (e.g., 1.0.0 -> 1.0.1)."
              />
              <FAQ
                q="Do I need an account to install skills?"
                a="No. Browsing and installing skills works without authentication. You only need to sign in to publish or like skills."
              />
              <FAQ
                q="What file formats are supported?"
                a="Only .md (Markdown) files are allowed. Each skill can have up to 5 files, with a max of 500KB per file and 1MB total."
              />
              <FAQ
                q="How do I deprecate a skill?"
                a="Use the CLI: hub deprecate <name>. Or contact an admin to deprecate it from the admin panel."
              />
              <FAQ
                q="Where is the full API documentation?"
                a="The CLI guide includes all API endpoints. Access it at GET /api/v1/cli-guide or run hub --help for command-specific help."
              />
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}

/* -- Helper Components -- */

function Section({
  id,
  title,
  children,
}: {
  id: string;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section id={id} className="scroll-mt-20">
      <h2 className="mb-4 text-xl font-bold text-zinc-900 dark:text-zinc-50">
        {title}
      </h2>
      <div className="space-y-4 text-sm text-zinc-700 dark:text-zinc-300">
        {children}
      </div>
    </section>
  );
}

function Step({
  number,
  title,
  children,
}: {
  number: number;
  title: string;
  children: React.ReactNode;
}) {
  return (
    <div className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
      <div className="mb-3 flex items-center gap-3">
        <span className="flex h-7 w-7 items-center justify-center rounded-full bg-zinc-900 text-xs font-bold text-white dark:bg-zinc-100 dark:text-zinc-900">
          {number}
        </span>
        <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">{title}</h3>
      </div>
      <div className="space-y-3 text-sm text-zinc-600 dark:text-zinc-400">{children}</div>
    </div>
  );
}

function CodeBlock({ children }: { children: string }) {
  return (
    <pre className="overflow-x-auto rounded-lg bg-zinc-900 p-4 text-xs font-mono text-zinc-100 dark:bg-zinc-800">
      <code>{children}</code>
    </pre>
  );
}

function CommandRow({ cmd, desc }: { cmd: string; desc: string }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-zinc-50 px-4 py-2.5 dark:bg-zinc-800/50">
      <code className="text-sm font-mono font-medium text-zinc-800 dark:text-zinc-200">
        {cmd}
      </code>
      <span className="ml-4 text-xs text-zinc-500 dark:text-zinc-400">{desc}</span>
    </div>
  );
}

function FieldTable({
  title,
  fields,
}: {
  title: string;
  fields: { name: string; desc: string }[];
}) {
  return (
    <div>
      <h4 className="mb-2 text-sm font-semibold text-zinc-900 dark:text-zinc-100">{title}</h4>
      <div className="overflow-hidden rounded-lg border border-zinc-200 dark:border-zinc-800">
        <table className="w-full text-sm">
          <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
            {fields.map((f) => (
              <tr key={f.name}>
                <td className="w-40 bg-zinc-50 px-4 py-2 font-mono text-xs font-medium text-zinc-800 dark:bg-zinc-800/50 dark:text-zinc-200">
                  {f.name}
                </td>
                <td className="px-4 py-2 text-zinc-600 dark:text-zinc-400">{f.desc}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function FAQ({ q, a }: { q: string; a: string }) {
  return (
    <div className="rounded-lg border border-zinc-200 p-5 dark:border-zinc-800">
      <h4 className="font-semibold text-zinc-900 dark:text-zinc-100">{q}</h4>
      <p className="mt-2 text-zinc-600 dark:text-zinc-400">{a}</p>
    </div>
  );
}

function TocLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <li>
      <a
        href={href}
        className="text-zinc-600 transition-colors hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100"
      >
        {children}
      </a>
    </li>
  );
}
