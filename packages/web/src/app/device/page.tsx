'use client';

import { useState, useEffect, Suspense } from 'react';
import { useSearchParams } from 'next/navigation';
import { useSession, signIn } from 'next-auth/react';

function DeviceContent() {
  const searchParams = useSearchParams();
  const { data: session, status } = useSession();
  const [userCode, setUserCode] = useState(searchParams.get('code') || '');
  const [submitting, setSubmitting] = useState(false);
  const [result, setResult] = useState<'success' | 'error' | null>(null);
  const [errorMessage, setErrorMessage] = useState('');

  // Auto-format user code (uppercase, add dash)
  const handleCodeChange = (value: string) => {
    // Remove non-alphanumeric chars except dash
    let clean = value.toUpperCase().replace(/[^A-Z0-9-]/g, '');

    // Auto-insert dash after 4 chars if not present
    if (clean.length === 4 && !clean.includes('-')) {
      clean = clean + '-';
    }

    // Limit to 9 chars (ABCD-1234)
    setUserCode(clean.slice(0, 9));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (status !== 'authenticated') {
      // Redirect to login with callback to this page
      signIn('github', { callbackUrl: `/device?code=${userCode}` });
      return;
    }

    setSubmitting(true);
    setResult(null);

    try {
      const res = await fetch('/api/v1/auth/device/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_code: userCode }),
      });

      if (res.ok) {
        setResult('success');
      } else {
        const data = await res.json();
        setResult('error');
        setErrorMessage(data?.error?.message || '기기 인증에 실패했습니다');
      }
    } catch {
      setResult('error');
      setErrorMessage('네트워크 오류. 다시 시도해 주세요.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 font-sans dark:bg-black">
      <main className="flex flex-col items-center gap-8 w-full max-w-sm px-6">
        <div className="flex flex-col items-center gap-3 text-center">
          <h1 className="text-3xl font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
            기기 인증
          </h1>
          <p className="text-zinc-600 dark:text-zinc-400">
            CLI에 표시된 코드를 입력하여 이 기기를 인증하세요.
          </p>
        </div>

        {result === 'success' ? (
          <div className="w-full rounded-xl border border-emerald-200 bg-emerald-50 p-6 text-center dark:border-emerald-800 dark:bg-emerald-900/20">
            <div className="text-lg font-semibold text-emerald-700 dark:text-emerald-400">
              기기 인증 완료
            </div>
            <p className="mt-2 text-sm text-emerald-600 dark:text-emerald-500">
              이 창을 닫고 CLI로 돌아가세요.
            </p>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="w-full flex flex-col gap-4">
            <div>
              <label
                htmlFor="user-code"
                className="block text-sm font-medium text-zinc-700 dark:text-zinc-300 mb-2"
              >
                인증 코드
              </label>
              <input
                id="user-code"
                type="text"
                value={userCode}
                onChange={(e) => handleCodeChange(e.target.value)}
                placeholder="ABCD-1234"
                className="w-full h-14 text-center text-2xl font-mono tracking-[0.3em] rounded-xl border border-zinc-300 bg-white px-4 text-zinc-900 placeholder:text-zinc-400 focus:border-zinc-500 focus:outline-none focus:ring-2 focus:ring-zinc-200 dark:border-zinc-700 dark:bg-zinc-900 dark:text-zinc-100 dark:placeholder:text-zinc-600 dark:focus:border-zinc-500 dark:focus:ring-zinc-800"
                maxLength={9}
                required
                autoFocus
                autoComplete="off"
                spellCheck={false}
              />
            </div>

            {result === 'error' && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-800 dark:bg-red-900/20 dark:text-red-400">
                {errorMessage}
              </div>
            )}

            <button
              type="submit"
              disabled={submitting || userCode.length < 9}
              className="flex w-full h-12 items-center justify-center rounded-xl bg-zinc-900 px-6 text-white font-medium transition-colors hover:bg-zinc-700 disabled:opacity-50 disabled:cursor-not-allowed dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              {submitting
                ? '인증 중...'
                : status !== 'authenticated'
                  ? '로그인 후 인증'
                  : '기기 인증'}
            </button>
          </form>
        )}

        {status === 'authenticated' && session?.user && (
          <p className="text-xs text-zinc-500 dark:text-zinc-500">
            로그인: <span className="font-medium">{session.user.username || session.user.name}</span>
          </p>
        )}
      </main>
    </div>
  );
}

export default function DevicePage() {
  return (
    <Suspense fallback={
      <div className="flex flex-col flex-1 items-center justify-center bg-zinc-50 dark:bg-black">
        <div className="text-zinc-400">로딩 중...</div>
      </div>
    }>
      <DeviceContent />
    </Suspense>
  );
}
