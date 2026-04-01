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
  status: string;
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

interface WorklogEntry {
  id: string;
  date: string;
  summary: string;
  unfinished: string | null;
  user: { username: string; avatar_url: string | null } | null;
  created_at: string;
}

export default function AdminPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [tab, setTab] = useState<'pending' | 'users' | 'skills' | 'worklog'>('pending');
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [skills, setSkills] = useState<AdminSkill[]>([]);
  const [worklogs, setWorklogs] = useState<WorklogEntry[]>([]);
  const [worklogFilter, setWorklogFilter] = useState('');
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

  const fetchWorklogs = useCallback(async (username?: string) => {
    try {
      const params = new URLSearchParams({ limit: '50' });
      if (username) params.set('username', username);
      const res = await fetch(`/api/v1/admin/worklog?${params}`);
      if (res.ok) {
        const body = await res.json();
        setWorklogs(body.data || []);
      }
    } catch (err) {
      console.error('Failed to fetch worklogs:', err);
    }
  }, []);

  useEffect(() => {
    if (status !== 'authenticated' || session?.user?.role !== 'ADMIN') return;

    async function load() {
      setLoading(true);
      await Promise.all([fetchUsers(), fetchSkills(), fetchWorklogs()]);
      setLoading(false);
    }
    load();
  }, [status, session, fetchUsers, fetchSkills, fetchWorklogs]);

  async function updateUserStatus(userId: string, newStatus: string) {
    setActionLoading(userId);
    try {
      const res = await fetch(`/api/v1/admin/users/${userId}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status: newStatus }),
      });
      if (res.ok) {
        setUsers((prev) =>
          prev.map((u) => (u.id === userId ? { ...u, status: newStatus } : u))
        );
      } else {
        const body = await res.json();
        alert(body.error?.message || '상태 변경에 실패했습니다');
      }
    } catch (err) {
      console.error('Failed to update status:', err);
    } finally {
      setActionLoading(null);
    }
  }

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

  const pendingUsers = users.filter((u) => u.status === 'PENDING');

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
          사용자, Skill 및 업무 기록 관리
        </p>

        {/* Tabs */}
        <div className="mb-6 flex gap-1 rounded-lg border border-zinc-200 bg-white p-1 dark:border-zinc-800 dark:bg-zinc-900">
          <TabButton active={tab === 'pending'} onClick={() => setTab('pending')}>
            승인 대기 ({pendingUsers.length})
          </TabButton>
          <TabButton active={tab === 'users'} onClick={() => setTab('users')}>
            사용자 ({users.length})
          </TabButton>
          <TabButton active={tab === 'skills'} onClick={() => setTab('skills')}>
            Skill ({skills.length})
          </TabButton>
          <TabButton active={tab === 'worklog'} onClick={() => setTab('worklog')}>
            업무 기록
          </TabButton>
        </div>

        {/* Pending Tab */}
        {tab === 'pending' && (
          <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
            {pendingUsers.length === 0 ? (
              <div className="px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
                승인 대기 중인 사용자가 없습니다.
              </div>
            ) : (
              <div className="overflow-x-auto">
                <table className="w-full text-sm">
                  <thead>
                    <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                      <th className="px-6 py-3">사용자</th>
                      <th className="px-6 py-3">이메일</th>
                      <th className="px-6 py-3">가입일</th>
                      <th className="px-6 py-3">작업</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                    {pendingUsers.map((u) => (
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
                        <td className="px-6 py-3 text-zinc-500 dark:text-zinc-400">
                          {new Date(u.created_at).toLocaleDateString()}
                        </td>
                        <td className="px-6 py-3">
                          <div className="flex gap-2">
                            <button
                              onClick={() => updateUserStatus(u.id, 'APPROVED')}
                              disabled={actionLoading === u.id}
                              className="rounded-md bg-green-600 px-3 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                            >
                              {actionLoading === u.id ? '...' : '승인'}
                            </button>
                            <button
                              onClick={() => updateUserStatus(u.id, 'REJECTED')}
                              disabled={actionLoading === u.id}
                              className="rounded-md border border-red-200 px-3 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400 dark:hover:bg-red-900/20"
                            >
                              {actionLoading === u.id ? '...' : '거절'}
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}
          </div>
        )}

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
                    <th className="px-6 py-3">상태</th>
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
                      <td className="px-6 py-3">
                        <StatusBadge status={u.status} />
                      </td>
                      <td className="px-6 py-3 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                        {u.skills_count}
                      </td>
                      <td className="px-6 py-3 text-zinc-500 dark:text-zinc-400">
                        {new Date(u.created_at).toLocaleDateString()}
                      </td>
                      <td className="px-6 py-3">
                        <div className="flex gap-2">
                          {u.id !== session?.user?.id && (
                            <>
                              <button
                                onClick={() => toggleUserRole(u.id, u.role)}
                                disabled={actionLoading === u.id}
                                className="rounded-md border border-zinc-200 px-2.5 py-1 text-xs font-medium text-zinc-700 transition-colors hover:bg-zinc-50 disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-300 dark:hover:bg-zinc-800"
                              >
                                {actionLoading === u.id ? '...' : u.role === 'ADMIN' ? '강등' : '승격'}
                              </button>
                              {u.status !== 'APPROVED' && (
                                <button
                                  onClick={() => updateUserStatus(u.id, 'APPROVED')}
                                  disabled={actionLoading === u.id}
                                  className="rounded-md bg-green-600 px-2.5 py-1 text-xs font-medium text-white hover:bg-green-700 disabled:opacity-50"
                                >
                                  승인
                                </button>
                              )}
                              {u.status === 'APPROVED' && (
                                <button
                                  onClick={() => updateUserStatus(u.id, 'REJECTED')}
                                  disabled={actionLoading === u.id}
                                  className="rounded-md border border-red-200 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-50 disabled:opacity-50 dark:border-red-800 dark:text-red-400"
                                >
                                  거절
                                </button>
                              )}
                            </>
                          )}
                        </div>
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
                            {actionLoading === s.id ? '...' : s.deprecated ? '복원' : '지원 중단'}
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

        {/* Worklog Tab */}
        {tab === 'worklog' && (
          <div className="space-y-4">
            <div className="flex gap-2">
              <input
                type="text"
                placeholder="사용자명으로 필터..."
                value={worklogFilter}
                onChange={(e) => setWorklogFilter(e.target.value)}
                className="rounded-lg border border-zinc-300 px-3 py-2 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100"
              />
              <button
                onClick={() => fetchWorklogs(worklogFilter || undefined)}
                className="rounded-lg bg-zinc-900 px-4 py-2 text-sm font-medium text-white hover:bg-zinc-700 dark:bg-zinc-100 dark:text-zinc-900 dark:hover:bg-zinc-300"
              >
                조회
              </button>
            </div>

            <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              {worklogs.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  업무 기록이 없습니다.
                </div>
              ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {worklogs.map((w) => (
                    <div key={w.id} className="px-6 py-4">
                      <div className="flex items-center gap-3 mb-2">
                        {w.user?.avatar_url ? (
                          <img src={w.user.avatar_url} alt="" className="h-6 w-6 rounded-full" />
                        ) : (
                          <div className="h-6 w-6 rounded-full bg-zinc-200 dark:bg-zinc-700" />
                        )}
                        <span className="font-medium text-zinc-900 dark:text-zinc-100">
                          {w.user?.username || '(삭제된 사용자)'}
                        </span>
                        <span className="text-xs text-zinc-400">{w.date}</span>
                      </div>
                      <div className="ml-9">
                        <p className="text-sm text-zinc-700 dark:text-zinc-300 whitespace-pre-wrap">
                          {w.summary}
                        </p>
                        {w.unfinished && (
                          <div className="mt-2 rounded-md bg-amber-50 px-3 py-2 text-xs text-amber-800 dark:bg-amber-900/20 dark:text-amber-300">
                            <span className="font-medium">미완료:</span> {w.unfinished}
                          </div>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: string }) {
  const styles: Record<string, string> = {
    APPROVED: 'bg-green-50 text-green-700 dark:bg-green-900/30 dark:text-green-400',
    PENDING: 'bg-amber-50 text-amber-700 dark:bg-amber-900/30 dark:text-amber-400',
    REJECTED: 'bg-red-50 text-red-700 dark:bg-red-900/30 dark:text-red-400',
  };
  const labels: Record<string, string> = {
    APPROVED: '승인됨',
    PENDING: '대기',
    REJECTED: '거절됨',
  };

  return (
    <span className={`inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ${styles[status] || styles.PENDING}`}>
      {labels[status] || status}
    </span>
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
