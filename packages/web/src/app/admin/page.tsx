'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState, useCallback } from 'react';
import { useRouter } from 'next/navigation';

interface AdminUser {
  id: string;
  username: string;
  email: string | null;
  avatar_url: string | null;
  role: string;
  skills_count: number;
  created_at: string;
}

interface AdminSkill {
  id: string;
  name: string;
  description: string;
  latest_version: string;
  downloads: number;
  is_verified: boolean;
  deprecated: boolean;
  author: { username: string };
  created_at: string;
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<'users' | 'skills'>('users');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [skills, setSkills] = useState<AdminSkill[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState<string | null>(null);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?callbackUrl=/admin');
    } else if (status === 'authenticated' && session?.user?.role !== 'ADMIN') {
      router.push('/dashboard');
    }
  }, [status, session, router]);

  const fetchUsers = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/admin/users?limit=100');
      if (res.ok) {
        const body = await res.json();
        setUsers(body.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch users:', err);
    }
  }, []);

  const fetchSkills = useCallback(async () => {
    try {
      const res = await fetch('/api/v1/skills?limit=100&include_deprecated=true');
      if (res.ok) {
        const body = await res.json();
        setSkills(body.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch skills:', err);
    }
  }, []);

  useEffect(() => {
    if (status !== 'authenticated' || session?.user?.role !== 'ADMIN') return;

    async function load() {
      setLoading(true);
      await Promise.all([fetchUsers(), fetchSkills()]);
      setLoading(false);
    }
    load();
  }, [status, session, fetchUsers, fetchSkills]);

  async function toggleUserRole(userId: string, currentRole: string) {
    setActionLoading(userId);
    try {
      const newRole = currentRole === 'ADMIN' ? 'USER' : 'ADMIN';
      const res = await fetch(`/api/v1/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, role: newRole } : u))
        );
      } else {
        const body = await res.json();
        alert(body.error?.message || '역할 변경에 실패했습니다');
      }
    } catch (err) {
      console.error('Failed to toggle role:', err);
    } finally {
      setActionLoading(null);
    }
  }

  async function toggleSkillProp(skillId: string, prop: 'is_verified' | 'deprecated', current: boolean) {
    setActionLoading(skillId);
    try {
      const res = await fetch(`/api/v1/admin/skills/${skillId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [prop]: !current }),
      });
      if (res.ok) {
        setSkills((prev) =>
          prev.map((s) => (s.id === skillId ? { ...s, [prop]: !current } : s))
        );
      } else {
        const body = await res.json();
        alert(body.error?.message || 'Skill 업데이트에 실패했습니다');
      }
    } catch (err) {
      console.error('Failed to toggle skill prop:', err);
    } finally {
      setActionLoading(null);
    }
  }

  if (status === 'loading' || loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="text-zinc-400">관리자 패널 로딩 중...</div>
      </div>
    );
  }

  if (status === 'unauthenticated' || session?.user?.role !== 'ADMIN') return null;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <h1 className="mb-2 text-2xl font-bold text-zinc-900 dark:text-zinc-50">관리자 패널</h1>
        <p className="mb-6 text-sm text-zinc-500 dark:text-zinc-400">
          사용자 및 Skill 관리
        </p>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
          <TabButton active={tab === 'users'} onClick={() => setTab('users')}>
            사용자 ({users.length})
          </TabButton>
          <TabButton active={tab === 'skills'} onClick={() => setTab('skills')}>
            Skill ({skills.length})
          </TabButton>
        </div>

        {/* Users Tab */}
        {tab === 'users' && (
          <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th className="px-6 py-3">사용자</th>
                    <th className="px-6 py-3">이메일</th>
                    <th className="px-6 py-3">역할</th>
                    <th className="px-6 py-3 text-right">Skill</th>
                    <th className="px-6 py-3">가입일</th>
                    <th className="px-6 py-3">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {users.map((u) => (
                    <tr key={u.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                      <td className="px-6 py-3">
                        <div className="flex items-center gap-2">
                          {u.avatar_url ? (
                            <img src={u.avatar_url} alt="" className="h-6 w-6 rounded-full" />
                          ) : (
                            <div className="h-6 w-6 rounded-full bg-zinc-200 dark:bg-zinc-700" />
                          )}
                          <span className="font-medium text-zinc-900 dark:text-zinc-100">
                            {u.username}
                          </span>
                        </div>
                      </td>
                      <td className="px-6 py-3 text-zinc-500 dark:text-zinc-400">
                        {u.email || '--'}
                      </td>
                      <td className="px-6 py-3">
                        <span
                          className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${
                            u.role === 'ADMIN'
                              ? 'bg-purple-50 text-purple-700 dark:bg-purple-900/30 dark:text-purple-400'
                              : 'bg-zinc-100 text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400'
                          }`}
                        >
                          {u.role}
                        </span>
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                        {u.skills_count}
                      </td>
                      <td className="px-6 py-3 text-zinc-500 dark:text-zinc-400">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-3">
                        {u.id !== session?.user?.id && (
                          <button
                            onClick={() => toggleUserRole(u.id, u.role)}
                            disabled={actionLoading === u.id}
                            className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                          >
                            {actionLoading === u.id
                              ? '...'
                              : u.role === 'ADMIN'
                              ? '강등'
                              : '승격'}
                          </button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* Skills Tab */}
        {tab === 'skills' && (
          <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            <div className="overflow-x-auto">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                    <th className="px-6 py-3">Skill</th>
                    <th className="px-6 py-3">작성자</th>
                    <th className="px-6 py-3 text-right">다운로드</th>
                    <th className="px-6 py-3">상태</th>
                    <th className="px-6 py-3">작업</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {skills.map((s) => (
                    <tr key={s.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                      <td className="px-6 py-3">
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          {s.name}
                        </span>
                        <span className="ml-2 text-xs text-zinc-400">v{s.latest_version}</span>
                      </td>
                      <td className="px-6 py-3 text-zinc-500 dark:text-zinc-400">
                        {s.author.username}
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                        {s.downloads.toLocaleString()}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex gap-1.5">
                          {s.is_verified && (
                            <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                              인증됨
                            </span>
                          )}
                          {s.deprecated && (
                            <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                              지원 중단
                            </span>
                          )}
                          {!s.is_verified && !s.deprecated && (
                            <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                              활성
                            </span>
                          )}
                        </div>
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex gap-2">
                          <button
                            onClick={() => toggleSkillProp(s.id, 'is_verified', s.is_verified)}
                            disabled={actionLoading === s.id}
                            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                              s.is_verified
                                ? 'border-green-200 text-green-700 hover:bg-green-50 dark:border-green-800 dark:text-green-400 dark:hover:bg-green-900/20'
                                : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
                            }`}
                          >
                            {actionLoading === s.id ? '...' : s.is_verified ? '인증 해제' : '인증'}
                          </button>
                          <button
                            onClick={() => toggleSkillProp(s.id, 'deprecated', s.deprecated)}
                            disabled={actionLoading === s.id}
                            className={`rounded-md border px-2.5 py-1 text-xs font-medium transition-colors disabled:opacity-50 ${
                              s.deprecated
                                ? 'border-red-200 text-red-700 hover:bg-red-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20'
                                : 'border-zinc-200 text-zinc-700 hover:bg-zinc-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800'
                            }`}
                          >
                            {actionLoading === s.id
                              ? '...'
                              : s.deprecated
                              ? '복원'
                              : '지원 중단'}
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function TabButton({
  active,
  onClick,
  children,
}: {
  active: boolean;
  onClick: () => void;
  children: React.ReactNode;
}) {
  return (
    <button
      onClick={onClick}
      className={`flex-1 rounded-md px-4 py-2 text-sm font-medium transition-colors ${
        active
          ? 'bg-zinc-900 text-white dark:bg-zinc-100 dark:text-zinc-900'
          : 'text-zinc-600 hover:text-zinc-900 dark:text-zinc-400 dark:hover:text-zinc-100'
      }`}
    >
      {children}
    </button>
  );
}
