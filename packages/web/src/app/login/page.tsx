'use client';

import Link from 'next/link';
import { signIn } from 'next-auth/react';
import { useSearchParams } from 'next/navigation';
import { Suspense } from 'react';

function LoginContent() {
  const searchParams = useSearchParams();
  const callbackUrl = searchParams.get('callbackUrl') || '/';
  const error = searchParams.get('error');

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-col items-center gap-8 w-full max-w-sm px-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            로그인
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            GitHub 계정으로 AresDevUnit Hub에 로그인하세요.
          </p>
        </div>

        {error && (
          <div className="w-full rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
            {error === 'OAuthAccountNotLinked'
              ? '이 이메일은 이미 다른 계정에 연결되어 있습니다.'
              : '로그인 중 오류가 발생했습니다. 다시 시도해 주세요.'}
          </div>
        )}

        <button
          onClick={() => signIn('github', { callbackUrl })}
          className="flex w-full h-12 items-center justify-center gap-3 rounded-xl bg-zinc-900 px-6 text-white font-medium transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
        >
          <svg className="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path d="M12 0c-6.626 0-12 5.373-12 12 0 5.302 3.438 9.8 8.207 11.387.599.111.793-.261.793-.577v-2.234c-3.338.726-4.033-1.416-4.033-1.416-.546-1.387-1.333-1.756-1.333-1.756-1.089-.745.083-.729.083-.729 1.205.084 1.839 1.237 1.839 1.237 1.07 1.834 2.807 1.304 3.492.997.107-.775.418-1.305.762-1.604-2.665-.305-5.467-1.334-5.467-5.931 0-1.311.469-2.381 1.236-3.221-.124-.303-.535-1.524.117-3.176 0 0 1.008-.322 3.301 1.23.957-.266 1.983-.399 3.003-.404 1.02.005 2.047.138 3.006.404 2.291-1.552 3.297-1.23 3.297-1.23.653 1.653.242 2.874.118 3.176.77.84 1.235 1.911 1.235 3.221 0 4.609-2.807 5.624-5.479 5.921.43.372.823 1.102.823 2.222v3.293c0 .319.192.694.801.576 4.765-1.589 8.199-6.086 8.199-11.386 0-6.627-5.373-12-12-12z" />
          </svg>
          GitHub로 계속하기
        </button>

        {process.env.NODE_ENV !== 'production' ? (
          <Link
            href={`/api/dev/local-login?callbackUrl=${encodeURIComponent(callbackUrl)}`}
            className="flex w-full h-12 items-center justify-center rounded-xl border border-blue-200 bg-blue-50 px-6 text-sm font-medium text-blue-700 transition-colors hover:bg-blue-100"
          >
            로컬 테스트 로그인
          </Link>
        ) : null}

        <p className="text-xs text-zinc-500 dark:text-zinc-500">
          로그인하면 서비스 이용약관 및 개인정보 처리방침에 동의하게 됩니다.
        </p>
      </main>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="text-zinc-400">로딩 중...</div>
      </div>
    }>
      <LoginContent />
    </Suspense>
  );
}
