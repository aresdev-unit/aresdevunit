'use client';

import { useState } from 'react';
import Link from 'next/link';

const INSTALL_COMMAND = 'curl -fsSL https://aresdevunit.vercel.app/api/v1/install.sh | bash';

const MANUAL_INSTALL_STEPS = [
  'git clone https://github.com/aresdev-unit/aresdevunit.git',
  'cd aresdevunit/packages/cli',
  'npm install',
  'npm run build',
  'npm link',
];

export default function LandingPage() {
  const [copied, setCopied] = useState(false);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(INSTALL_COMMAND);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = INSTALL_COMMAND;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    }
  };

  return (
    <>
      {/* Agent-readable structured data */}
      <script
        type="application/ld+json"
        dangerouslySetInnerHTML={{
          __html: JSON.stringify({
            '@context': 'https://schema.org',
            '@type': 'SoftwareApplication',
            name: 'AresDevUnit Hub CLI',
            description: 'AI Agent skill manager CLI. Install skills for Claude Code, Codex, and other AI agents.',
            applicationCategory: 'DeveloperApplication',
            operatingSystem: 'Cross-platform (Node.js 20+)',
            softwareRequirements: 'Node.js >= 20',
            codeRepository: 'https://github.com/aresdev-unit/aresdevunit',
            installUrl: 'https://github.com/aresdev-unit/aresdevunit',
            downloadUrl: 'https://github.com/aresdev-unit/aresdevunit',
            offers: { '@type': 'Offer', price: '0', priceCurrency: 'USD' },
          }),
        }}
      />

      {/*
        === AGENT INSTRUCTIONS ===
        This is AresDevUnit Hub — an AI Agent skill sharing platform.

        INSTALL CLI:
        curl -fsSL https://aresdevunit.vercel.app/api/v1/install.sh | bash

        FULL CLI GUIDE: GET /api/v1/cli-guide (plain text, all commands + examples + skill.json spec)
        INSTALL GUIDE:  GET /api/v1/install-guide (plain text)
        API HEALTH:     GET /api/v1/health
        BROWSE SKILLS:  GET /api/v1/skills

        QUICK REFERENCE:
        aresdevhubcli login | aresdevhubcli init | aresdevhubcli publish | aresdevhubcli install <name> --agent claude
        aresdevhubcli search <q> | aresdevhubcli info <name> | aresdevhubcli list | aresdevhubcli update | aresdevhubcli whoami

        For non-interactive agent usage: --yes --json --agent <type>
        === END AGENT INSTRUCTIONS ===
      */}

      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
        <main className="flex flex-1 w-full max-w-4xl flex-col items-center justify-center gap-12 py-24 px-6">
          {/* Hero */}
          <div className="flex flex-col items-center gap-6 text-center">
            <div className="flex items-center gap-2 text-sm font-medium text-zinc-500 dark:text-zinc-400">
              <span className="inline-block h-2 w-2 rounded-full bg-emerald-500" />
              내부 도구
            </div>

            <h1 className="max-w-2xl text-5xl font-bold leading-tight tracking-tight text-zinc-900 dark:text-zinc-50 sm:text-6xl">
              AresDevUnit Hub
            </h1>

            <p className="max-w-xl text-lg leading-8 text-zinc-600 dark:text-zinc-400">
              AI Agent Skill 공유 플랫폼. Claude Code, Codex 등을 위한
              Skill을 공유하고 탐색하세요.
            </p>
          </div>

          {/* Install command */}
          <section aria-label="Installation" className="w-full max-w-2xl">
            <p className="mb-2 text-sm text-zinc-500 dark:text-zinc-400 text-center">
              CLI 설치 (Agent에게 아래 명령어를 붙여넣기하세요)
            </p>
            <div className="flex items-center rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <code className="flex-1 px-5 py-4 text-xs font-mono text-zinc-800 dark:text-zinc-200 select-all overflow-x-auto" data-install-command={INSTALL_COMMAND}>
                $ {INSTALL_COMMAND}
              </code>
              <button
                onClick={handleCopy}
                className="flex-shrink-0 flex items-center gap-1.5 px-4 py-4 text-sm font-medium text-zinc-500 hover:text-zinc-800 dark:text-zinc-400 dark:hover:text-zinc-200 transition-colors border-l border-zinc-200 dark:border-zinc-800"
                aria-label="Copy install command"
              >
                {copied ? (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
                    </svg>
                    복사됨
                  </>
                ) : (
                  <>
                    <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" strokeWidth={2} stroke="currentColor">
                      <path strokeLinecap="round" strokeLinejoin="round" d="M15.666 3.888A2.25 2.25 0 0013.5 2.25h-3c-1.03 0-1.9.693-2.166 1.638m7.332 0c.055.194.084.4.084.612v0a.75.75 0 01-.75.75H9.75a.75.75 0 01-.75-.75v0c0-.212.03-.418.084-.612m7.332 0c.646.049 1.288.11 1.927.184 1.1.128 1.907 1.077 1.907 2.185V19.5a2.25 2.25 0 01-2.25 2.25H6.75A2.25 2.25 0 014.5 19.5V6.257c0-1.108.806-2.057 1.907-2.185a48.208 48.208 0 011.927-.184" />
                    </svg>
                    복사
                  </>
                )}
              </button>
            </div>

            {/* Manual install fallback */}
            <details className="mt-4 text-sm text-zinc-500 dark:text-zinc-400">
              <summary className="cursor-pointer hover:text-zinc-700 dark:hover:text-zinc-300">수동 설치</summary>
              <ol className="mt-2 ml-4 list-decimal space-y-1 font-mono text-xs">
                {MANUAL_INSTALL_STEPS.map((step, i) => (
                  <li key={i}><code>{step}</code></li>
                ))}
              </ol>
              <p className="mt-2">설치 후 <code className="bg-zinc-100 dark:bg-zinc-800 px-1 rounded">aresdevhubcli</code> 명령어를 사용할 수 있습니다.</p>
            </details>
          </section>

          {/* CTA buttons */}
          <div className="flex flex-col gap-4 text-base font-medium sm:flex-row">
            <Link
              className="flex h-12 items-center justify-center gap-2 rounded-full bg-zinc-900 px-8 text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              href="/skills"
            >
              Skill 둘러보기
            </Link>
            <a
              className="flex h-12 items-center justify-center rounded-full border border-zinc-200 px-8 transition-colors hover:border-zinc-400 dark:border-zinc-700 dark:hover:border-zinc-500"
              href="https://github.com/aresdev-unit/aresdevunit"
              target="_blank"
              rel="noopener noreferrer"
            >
              GitHub
            </a>
          </div>

          {/* Features */}
          <div className="grid grid-cols-1 gap-6 w-full max-w-2xl sm:grid-cols-3">
            <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">CLI 우선</h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                터미널에서 직접 Skill을 배포하고 설치하세요.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">Agent 네이티브</h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                AI Agent가 CLI를 통해 직접 호출할 수 있도록 설계되었습니다.
              </p>
            </div>
            <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">기본 공개</h3>
              <p className="mt-2 text-sm text-zinc-600 dark:text-zinc-400">
                계정 없이도 Skill을 둘러보고 설치할 수 있습니다.
              </p>
            </div>
          </div>
        </main>
      </div>
    </>
  );
}
