'use client';

import { useSession } from 'next-auth/react';
import { useEffect } from 'react';
import { useRouter } from 'next/navigation';

export default function SettingsPage() {
  const { data: session, status } = useSession();
  const router = useRouter();

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?callbackUrl=/settings');
    }
  }, [status, router]);

  if (status === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="text-zinc-400">Loading...</div>
      </div>
    );
  }

  if (status === 'unauthenticated') return null;

  const user = session?.user;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-3xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="mb-8 text-2xl font-bold text-zinc-900 dark:text-zinc-50">Settings</h1>

        {/* Profile Section */}
        <div className="mb-6 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">Profile</h2>
          </div>
          <div className="p-6">
            <div className="flex items-center gap-4">
              {user?.image ? (
                <img src={user.image} alt="" className="h-16 w-16 rounded-full" />
              ) : (
                <div className="flex h-16 w-16 items-center justify-center rounded-full bg-zinc-200 text-xl font-bold text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
                  {user?.username?.[0]?.toUpperCase() || '?'}
                </div>
              )}
              <div>
                <p className="text-lg font-semibold text-zinc-900 dark:text-zinc-50">
                  {user?.username}
                </p>
                <p className="text-sm text-zinc-500 dark:text-zinc-400">{user?.email || 'No email'}</p>
              </div>
            </div>

            <div className="mt-6 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <InfoRow label="GitHub Username" value={user?.username || '--'} />
              <InfoRow label="Role" value={user?.role || 'USER'} />
              <InfoRow label="Email" value={user?.email || 'Not set'} />
              <InfoRow label="User ID" value={user?.id || '--'} mono />
            </div>
          </div>
        </div>

        {/* Agent Configuration Section */}
        <div className="mb-6 rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">Agent Configuration</h2>
          </div>
          <div className="p-6">
            <p className="mb-4 text-sm text-zinc-600 dark:text-zinc-400">
              Agent skill paths are configured via the CLI. Use <code className="rounded bg-zinc-100 px-1.5 py-0.5 text-xs font-mono dark:bg-zinc-800">hub config</code> to manage your agent settings.
            </p>

            <div className="rounded-lg bg-zinc-50 p-4 dark:bg-zinc-800/50">
              <p className="mb-2 text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
                Config file location
              </p>
              <code className="text-sm font-mono text-zinc-800 dark:text-zinc-200">
                ~/.aresdevunit/config.json
              </code>
            </div>

            <div className="mt-4 rounded-lg border border-zinc-200 dark:border-zinc-700">
              <div className="border-b border-zinc-200 px-4 py-2 dark:border-zinc-700">
                <p className="text-xs font-medium text-zinc-500 dark:text-zinc-400">Example config</p>
              </div>
              <pre className="overflow-x-auto p-4 text-xs font-mono text-zinc-700 dark:text-zinc-300">
{`{
  "api_url": "https://hub.aresdevunit.com/api/v1",
  "agents": {
    "claude": {
      "skill_path": "~/.claude/commands"
    },
    "codex": {
      "skill_path": null
    }
  }
}`}
              </pre>
            </div>

            <div className="mt-4 space-y-2 text-sm text-zinc-600 dark:text-zinc-400">
              <p>
                <strong className="text-zinc-900 dark:text-zinc-100">Claude Code:</strong>{' '}
                Skills install to <code className="rounded bg-zinc-100 px-1 text-xs font-mono dark:bg-zinc-800">~/.claude/commands/</code>
              </p>
              <p>
                <strong className="text-zinc-900 dark:text-zinc-100">Codex:</strong>{' '}
                Configure path via <code className="rounded bg-zinc-100 px-1 text-xs font-mono dark:bg-zinc-800">hub config set agents.codex.skill_path &lt;path&gt;</code>
              </p>
            </div>
          </div>
        </div>

        {/* CLI Quick Reference */}
        <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
          <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
            <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">CLI Quick Reference</h2>
          </div>
          <div className="p-6">
            <div className="space-y-2 font-mono text-sm">
              <CLICommand cmd="hub login" desc="Authenticate with GitHub" />
              <CLICommand cmd="hub whoami" desc="Check current user" />
              <CLICommand cmd="hub init" desc="Create a new skill" />
              <CLICommand cmd="hub publish" desc="Publish skill to Hub" />
              <CLICommand cmd="hub install <name>" desc="Install a skill" />
              <CLICommand cmd="hub list --mine" desc="List my published skills" />
              <CLICommand cmd="hub update" desc="Update installed skills" />
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function InfoRow({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className={`mt-1 text-sm text-zinc-900 dark:text-zinc-100 ${mono ? 'font-mono' : ''}`}>
        {value}
      </p>
    </div>
  );
}

function CLICommand({ cmd, desc }: { cmd: string; desc: string }) {
  return (
    <div className="flex items-center justify-between rounded-md bg-zinc-50 px-3 py-2 dark:bg-zinc-800/50">
      <code className="text-zinc-800 dark:text-zinc-200">{cmd}</code>
      <span className="ml-4 text-xs text-zinc-500 dark:text-zinc-400">{desc}</span>
    </div>
  );
}
