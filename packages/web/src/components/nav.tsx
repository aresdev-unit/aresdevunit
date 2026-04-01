'use client';

import Link from 'next/link';
import { useSession, signOut } from 'next-auth/react';
import { useState } from 'react';

export function Nav() {
  const { data: session, status } = useSession();
  const [mobileOpen, setMobileOpen] = useState(false);

  const isAdmin = session?.user?.role === 'ADMIN';
  const isApproved = session?.user?.status === 'APPROVED';

  return (
    <nav className="border-b border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-950">
      <div className="mx-auto flex h-14 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8">
        {/* Left: Logo + Links */}
        <div className="flex items-center gap-6">
          <Link
            href="/"
            className="text-lg font-bold tracking-tight text-zinc-900 dark:text-zinc-50"
          >
            Hub
          </Link>

          <div className="hidden items-center gap-1 sm:flex">
            {isApproved && <NavLink href="/skills">Skill</NavLink>}
            <NavLink href="/docs">문서</NavLink>
            {status === 'authenticated' && isApproved && (
              <>
                <NavLink href="/dashboard">대시보드</NavLink>
                <NavLink href="/settings">설정</NavLink>
              </>
            )}
            {isAdmin && isApproved && <NavLink href="/admin">관리자</NavLink>}
          </div>
        </div>

        {/* Right: Auth */}
        <div className="hidden items-center gap-3 sm:flex">
          {status === 'loading' && (
            <div className="h-8 w-20 animate-pulse rounded-md bg-zinc-100 dark:bg-zinc-800" />
          )}
          {status === 'unauthenticated' && (
            <Link
              href="/login"
              className="inline-flex h-8 items-center rounded-md bg-zinc-900 px-3 text-sm font-medium text-white transition-colors hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
            >
              로그인
            </Link>
          )}
          {status === 'authenticated' && session?.user && (
            <div className="flex items-center gap-3">
              <span className="text-sm text-zinc-600 dark:text-zinc-400">
                {session.user.username}
              </span>
              {session.user.image && (
                <img
                  src={session.user.image}
                  alt=""
                  className="h-7 w-7 rounded-full"
                />
              )}
              <button
                onClick={() => signOut({ callbackUrl: '/' })}
                className="inline-flex h-8 items-center rounded-md border border-zinc-200 px-3 text-sm font-medium text-zinc-700 transition-colors hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                로그아웃
              </button>
            </div>
          )}
        </div>

        {/* Mobile hamburger */}
        <button
          className="sm:hidden p-2 text-zinc-600 dark:text-zinc-400"
          onClick={() => setMobileOpen(!mobileOpen)}
          aria-label="Toggle menu"
        >
          <svg className="h-5 w-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
            {mobileOpen ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 6h16M4 12h16M4 18h16" />
            )}
          </svg>
        </button>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <div className="border-t border-zinc-200 px-4 py-3 sm:hidden dark:border-zinc-800">
          <div className="flex flex-col gap-1">
            {isApproved && <MobileLink href="/skills" onClick={() => setMobileOpen(false)}>Skill</MobileLink>}
            <MobileLink href="/docs" onClick={() => setMobileOpen(false)}>문서</MobileLink>
            {status === 'authenticated' && isApproved && (
              <>
                <MobileLink href="/dashboard" onClick={() => setMobileOpen(false)}>대시보드</MobileLink>
                <MobileLink href="/settings" onClick={() => setMobileOpen(false)}>설정</MobileLink>
              </>
            )}
            {isAdmin && isApproved && (
              <MobileLink href="/admin" onClick={() => setMobileOpen(false)}>관리자</MobileLink>
            )}
            <div className="my-2 border-t border-zinc-200 dark:border-zinc-800" />
            {status === 'unauthenticated' && (
              <MobileLink href="/login" onClick={() => setMobileOpen(false)}>로그인</MobileLink>
            )}
            {status === 'authenticated' && (
              <button
                onClick={() => { signOut({ callbackUrl: '/' }); setMobileOpen(false); }}
                className="w-full rounded-md px-3 py-2 text-left text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
              >
                로그아웃
              </button>
            )}
          </div>
        </div>
      )}
    </nav>
  );
}

function NavLink({ href, children }: { href: string; children: React.ReactNode }) {
  return (
    <Link
      href={href}
      className="rounded-md px-3 py-1.5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
    >
      {children}
    </Link>
  );
}

function MobileLink({
  href,
  onClick,
  children,
}: {
  href: string;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      onClick={onClick}
      className="rounded-md px-3 py-2 text-sm text-zinc-700 hover:bg-zinc-100 dark:text-zinc-300 dark:hover:bg-zinc-800"
    >
      {children}
    </Link>
  );
}
