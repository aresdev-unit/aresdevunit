'use client';

import { useSession } from 'next-auth/react';
import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

interface DashboardStats {
  skills_count: number;
  total_downloads: number;
  weekly_downloads: number;
  weekly_downloads_delta: number;
  rank: number | null;
  download_trend: { date: string; count: number }[];
}

interface SkillRow {
  id: string;
  name: string;
  latest_version: string;
  downloads: number;
  is_verified: boolean;
  deprecated: boolean;
}

interface FeedItem {
  id: string;
  action: string;
  user: { username: string; avatar_url: string | null };
  skill: { name: string };
  created_at: string;
}

export default function DashboardPage() {
  const { data: session, status } = useSession();
  const router = useRouter();
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [skills, setSkills] = useState<SkillRow[]>([]);
  const [feed, setFeed] = useState<FeedItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    if (status === 'unauthenticated') {
      router.push('/login?callbackUrl=/dashboard');
    }
  }, [status, router]);

  useEffect(() => {
    if (status !== 'authenticated') return;

    async function fetchData() {
      try {
        const [statsRes, skillsRes, feedRes] = await Promise.all([
          fetch('/api/v1/dashboard/stats'),
          fetch('/api/v1/skills?author=me&limit=50'),
          fetch('/api/v1/dashboard/feed?limit=10'),
        ]);

        if (statsRes.ok) setStats(await statsRes.json());
        if (skillsRes.ok) {
          const body = await skillsRes.json();
          setSkills(body.data || []);
        }
        if (feedRes.ok) {
          const body = await feedRes.json();
          setFeed(body.data || []);
        }
      } catch (err) {
        console.error('Failed to load dashboard:', err);
      } finally {
        setLoading(false);
      }
    }

    fetchData();
  }, [status]);

  if (status === 'loading' || loading) {
    return (
      <div className="flex flex-1 items-center justify-center bg-zinc-50 dark:bg-zinc-950">
        <div className="text-zinc-400">Loading dashboard...</div>
      </div>
    );
  }

  if (status === 'unauthenticated') return null;

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Header */}
        <div className="mb-8">
          <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">Dashboard</h1>
          <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
            Welcome back, {session?.user?.username}
          </p>
        </div>

        {/* Stats Cards */}
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatCard
            label="My Skills"
            value={stats?.skills_count ?? 0}
          />
          <StatCard
            label="Total Downloads"
            value={stats?.total_downloads ?? 0}
          />
          <StatCard
            label="Weekly Downloads"
            value={stats?.weekly_downloads ?? 0}
            delta={stats?.weekly_downloads_delta}
          />
          <StatCard
            label="Author Rank"
            value={stats?.rank ? `#${stats.rank}` : '--'}
          />
        </div>

        {/* Download Trend */}
        {stats && stats.download_trend.length > 0 && (
          <div className="mb-8 rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
            <h3 className="mb-4 text-sm font-semibold text-zinc-900 dark:text-zinc-50">
              Download Trend (30 days)
            </h3>
            <div className="flex items-end gap-1 h-32">
              {stats.download_trend.map((d, i) => {
                const maxCount = Math.max(...stats.download_trend.map(t => t.count), 1);
                const height = (d.count / maxCount) * 100;
                return (
                  <div
                    key={i}
                    style={{ height: `${height}%` }}
                    className="flex-1 bg-blue-500 rounded-t transition-all hover:bg-blue-400"
                    title={`${d.date}: ${d.count}`}
                  />
                );
              })}
            </div>
          </div>
        )}

        <div className="grid grid-cols-1 gap-8 lg:grid-cols-3">
          {/* My Skills Table */}
          <div className="lg:col-span-2">
            <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <div className="flex items-center justify-between border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
                <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">My Skills</h2>
                <span className="text-xs text-zinc-500 dark:text-zinc-400">{skills.length} skills</span>
              </div>
              {skills.length === 0 ? (
                <div className="px-6 py-12 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  No skills published yet. Create your first skill with the CLI.
                </div>
              ) : (
                <div className="overflow-x-auto">
                  <table className="w-full text-sm">
                    <thead>
                      <tr className="border-b border-zinc-100 text-left text-xs font-medium uppercase tracking-wider text-zinc-500 dark:border-zinc-800 dark:text-zinc-400">
                        <th className="px-6 py-3">Name</th>
                        <th className="px-6 py-3">Version</th>
                        <th className="px-6 py-3 text-right">Downloads</th>
                        <th className="px-6 py-3">Status</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-zinc-100 dark:divide-zinc-800">
                      {skills.map((skill) => (
                        <tr key={skill.id} className="hover:bg-zinc-50 dark:hover:bg-zinc-800/50">
                          <td className="px-6 py-3">
                            <Link
                              href={`/skills/${skill.name}`}
                              className="font-medium text-zinc-900 hover:text-blue-600 dark:text-zinc-100 dark:hover:text-blue-400"
                            >
                              {skill.name}
                            </Link>
                          </td>
                          <td className="px-6 py-3 text-zinc-500 dark:text-zinc-400">
                            v{skill.latest_version}
                          </td>
                          <td className="px-6 py-3 text-right tabular-nums text-zinc-900 dark:text-zinc-100">
                            {skill.downloads.toLocaleString()}
                          </td>
                          <td className="px-6 py-3">
                            <div className="flex gap-1.5">
                              {skill.is_verified && (
                                <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                                  Verified
                                </span>
                              )}
                              {skill.deprecated && (
                                <span className="inline-flex items-center rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-700 dark:bg-red-900/30 dark:text-red-400">
                                  Deprecated
                                </span>
                              )}
                              {!skill.is_verified && !skill.deprecated && (
                                <span className="inline-flex items-center rounded-full bg-zinc-100 px-2 py-0.5 text-xs font-medium text-zinc-600 dark:bg-zinc-800 dark:text-zinc-400">
                                  Active
                                </span>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>

          {/* Right sidebar */}
          <div className="flex flex-col gap-6">
            {/* Quick Actions */}
            <div className="rounded-xl border border-zinc-200 bg-white p-6 dark:border-zinc-800 dark:bg-zinc-900">
              <h2 className="mb-4 font-semibold text-zinc-900 dark:text-zinc-50">Quick Actions</h2>
              <div className="flex flex-col gap-2">
                <QuickAction href="/docs" label="Read Docs" desc="Getting started guide" />
                <QuickAction href="/skills" label="Browse Skills" desc="Discover skills" />
                <QuickAction
                  href="https://github.com/aresdev-unit/aresdevunit"
                  label="CLI Guide"
                  desc="hub init && hub publish"
                  external
                />
              </div>
            </div>

            {/* Activity Feed */}
            <div className="rounded-xl border border-zinc-200 bg-white dark:border-zinc-800 dark:bg-zinc-900">
              <div className="border-b border-zinc-200 px-6 py-4 dark:border-zinc-800">
                <h2 className="font-semibold text-zinc-900 dark:text-zinc-50">Recent Activity</h2>
              </div>
              {feed.length === 0 ? (
                <div className="px-6 py-8 text-center text-sm text-zinc-500 dark:text-zinc-400">
                  No recent activity on your skills.
                </div>
              ) : (
                <div className="divide-y divide-zinc-100 dark:divide-zinc-800">
                  {feed.map((item) => (
                    <div key={item.id} className="flex items-start gap-3 px-6 py-3">
                      {item.user.avatar_url ? (
                        <img src={item.user.avatar_url} alt="" className="mt-0.5 h-6 w-6 rounded-full" />
                      ) : (
                        <div className="mt-0.5 h-6 w-6 rounded-full bg-zinc-200 dark:bg-zinc-700" />
                      )}
                      <div className="min-w-0 flex-1">
                        <p className="text-sm text-zinc-700 dark:text-zinc-300">
                          <span className="font-medium">{item.user.username}</span>
                          {' '}
                          {item.action === 'INSTALL' ? 'installed' : 'liked'}
                          {' '}
                          <Link
                            href={`/skills/${item.skill.name}`}
                            className="font-medium text-blue-600 hover:underline dark:text-blue-400"
                          >
                            {item.skill.name}
                          </Link>
                        </p>
                        <p className="text-xs text-zinc-400 dark:text-zinc-500">
                          {formatRelativeTime(item.created_at)}
                        </p>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function StatCard({
  label,
  value,
  delta,
}: {
  label: string;
  value: number | string;
  delta?: number | null;
}) {
  return (
    <div className="rounded-xl border border-zinc-200 bg-white p-5 dark:border-zinc-800 dark:bg-zinc-900">
      <p className="text-xs font-medium uppercase tracking-wider text-zinc-500 dark:text-zinc-400">
        {label}
      </p>
      <p className="mt-2 text-2xl font-bold tabular-nums text-zinc-900 dark:text-zinc-50">
        {typeof value === 'number' ? value.toLocaleString() : value}
      </p>
      {delta !== undefined && delta !== null && (
        <p
          className={`mt-1 text-xs font-medium ${
            delta > 0
              ? 'text-green-600 dark:text-green-400'
              : delta < 0
              ? 'text-red-600 dark:text-red-400'
              : 'text-zinc-500 dark:text-zinc-400'
          }`}
        >
          {delta > 0 ? '+' : ''}
          {delta} vs last week
        </p>
      )}
    </div>
  );
}

function QuickAction({
  href,
  label,
  desc,
  external,
}: {
  href: string;
  label: string;
  desc: string;
  external?: boolean;
}) {
  const Tag = external ? 'a' : Link;
  const extraProps = external ? { target: '_blank', rel: 'noopener noreferrer' } : {};

  return (
    <Tag
      href={href}
      {...extraProps}
      className="flex items-center justify-between rounded-lg border border-zinc-200 px-4 py-3 transition-colors hover:border-zinc-300 hover:bg-zinc-50 dark:border-zinc-800 dark:hover:border-zinc-700 dark:hover:bg-zinc-800"
    >
      <div>
        <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">{label}</p>
        <p className="text-xs text-zinc-500 dark:text-zinc-400">{desc}</p>
      </div>
      <svg className="h-4 w-4 text-zinc-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
        <path strokeLinecap="round" strokeLinejoin="round" d="M9 5l7 7-7 7" />
      </svg>
    </Tag>
  );
}

function formatRelativeTime(iso: string): string {
  const diff = Date.now() - new Date(iso).getTime();
  const mins = Math.floor(diff / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins}m ago`;
  const hours = Math.floor(mins / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  if (days < 30) return `${days}d ago`;
  return new Date(iso).toLocaleDateString();
}
