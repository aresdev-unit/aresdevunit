'use client';

import { signOut, useSession } from 'next-auth/react';
import { useRouter } from 'next/navigation';
import { useEffect, useCallback } from 'react';

export default function PendingPage() {
  const { data: session, status, update } = useSession();
  const router = useRouter();

  // Poll session every 15 seconds to detect approval
  useEffect(() => {
    if (status !== 'authenticated') return;
    if (session?.user?.status === 'APPROVED') return;

    const interval = setInterval(() => {
      update(); // triggers JWT callback which re-checks DB
    }, 15000);

    return () => clearInterval(interval);
  }, [status, session, update]);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login');
    } else if (status === 'authenticated' && session?.user?.status === 'APPROVED') {
      router.push('/dashboard');
    }
  }, [status, session, router]);

  if (status === 'loading') {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="text-zinc-400">Loading...</div>
      </div>
    );
  }

  const isRejected = session?.user?.status === 'REJECTED';

  return (
    <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-md px-4 text-center">
        <div className="mb-6 flex justify-center">
          <div className={`flex h-16 w-16 items-center justify-center rounded-full ${
            isRejected
              ? 'bg-red-100 dark:bg-red-900/30'
              : 'bg-amber-100 dark:bg-amber-900/30'
          }`}>
            <svg className={`h-8 w-8 ${
              isRejected
                ? 'text-red-600 dark:text-red-400'
                : 'text-amber-600 dark:text-amber-400'
            }`} fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              {isRejected ? (
                <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
              ) : (
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 8v4l3 3m6-3a9 9 0 11-18 0 9 9 0 0118 0z" />
              )}
            </svg>
          </div>
        </div>

        <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
          {isRejected ? '계정이 거부되었습니다' : '승인 대기 중'}
        </h1>
        <p className="mt-3 text-sm text-zinc-600 dark:text-zinc-400">
          {isRejected
            ? '관리자에 의해 계정 접근이 거부되었습니다. 관리자에게 문의하세요.'
            : '관리자가 계정을 승인할 때까지 기다려 주세요. 승인 후 모든 기능을 사용할 수 있습니다.'}
        </p>

        {session?.user && (
          <p className="mt-4 text-xs text-zinc-400 dark:text-zinc-500">
            로그인: {session.user.username}
          </p>
        )}

        <button
          onClick={() => signOut({ callbackUrl: '/' })}
          className="mt-6 inline-flex items-center rounded-md border border-zinc-200 px-4 py-2 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
        >
          로그아웃
        </button>
      </div>
    </div>
  );
}
