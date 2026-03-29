import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SKILL_CATEGORIES } from '@aresdevunit/shared';

interface AuthorProfile {
  username: string;
  avatar_url: string | null;
  skills_count: number;
  total_downloads: number;
  created_at: string;
  skills: {
    id: string;
    name: string;
    description: string;
    category: string;
    latest_version: string;
    agent_types: string[];
    downloads: number;
    likes: number;
    is_verified: boolean;
    created_at: string;
  }[];
}

async function fetchAuthor(username: string): Promise<AuthorProfile | null> {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  try {
    const res = await fetch(`${baseUrl}/api/v1/users/${encodeURIComponent(username)}`, {
      cache: 'no-store',
    });
    if (!res.ok) return null;
    return res.json();
  } catch {
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  return {
    title: `${username} - AresDevUnit Hub`,
    description: `Skills by ${username}`,
  };
}

export default async function AuthorPage({
  params,
}: {
  params: Promise<{ username: string }>;
}) {
  const { username } = await params;
  const author = await fetchAuthor(username);

  if (!author) {
    notFound();
  }

  return (
    <div className="min-h-screen bg-zinc-50 dark:bg-zinc-950">
      <div className="mx-auto max-w-5xl px-4 py-8 sm:px-6 lg:px-8">
        {/* Author Profile Header */}
        <div className="mb-8 flex items-center gap-5">
          {author.avatar_url ? (
            <img
              src={author.avatar_url}
              alt={author.username}
              className="h-20 w-20 rounded-full"
            />
          ) : (
            <div className="flex h-20 w-20 items-center justify-center rounded-full bg-zinc-200 text-2xl font-bold text-zinc-500 dark:bg-zinc-700 dark:text-zinc-400">
              {author.username[0]?.toUpperCase()}
            </div>
          )}
          <div>
            <h1 className="text-2xl font-bold text-zinc-900 dark:text-zinc-50">
              {author.username}
            </h1>
            <div className="mt-2 flex items-center gap-4 text-sm text-zinc-500 dark:text-zinc-400">
              <span>{author.skills_count} skills</span>
              <span className="text-zinc-300 dark:text-zinc-700">|</span>
              <span>{author.total_downloads.toLocaleString()} total downloads</span>
              <span className="text-zinc-300 dark:text-zinc-700">|</span>
              <span>Joined {new Date(author.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* Skills */}
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Skills ({author.skills.length})
        </h2>

        {author.skills.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            This author has not published any skills yet.
          </div>
        ) : (
          <div className="grid gap-4">
            {author.skills.map((skill) => (
              <Link
                key={skill.id}
                href={`/skills/${skill.name}`}
                className="block rounded-xl border border-zinc-200 bg-white p-5 transition-all hover:border-zinc-300 hover:shadow-sm dark:border-zinc-800 dark:bg-zinc-900 dark:hover:border-zinc-700"
              >
                <div className="flex items-start justify-between">
                  <div className="min-w-0 flex-1">
                    <div className="flex items-center gap-2">
                      <h3 className="font-semibold text-zinc-900 dark:text-zinc-100">
                        {skill.name}
                      </h3>
                      <span className="text-xs text-zinc-500 dark:text-zinc-400">
                        v{skill.latest_version}
                      </span>
                      {skill.is_verified && (
                        <span className="inline-flex items-center rounded-full bg-green-50 px-2 py-0.5 text-xs font-medium text-green-700 dark:bg-green-900/30 dark:text-green-400">
                          Verified
                        </span>
                      )}
                    </div>
                    <p className="mt-1 text-sm text-zinc-600 line-clamp-2 dark:text-zinc-400">
                      {skill.description}
                    </p>
                    <div className="mt-3 flex items-center gap-3 text-xs text-zinc-500 dark:text-zinc-400">
                      <span className="rounded bg-zinc-100 px-2 py-0.5 dark:bg-zinc-800">
                        {SKILL_CATEGORIES[skill.category as keyof typeof SKILL_CATEGORIES] || skill.category}
                      </span>
                      <span>{skill.agent_types.join(', ')}</span>
                    </div>
                  </div>
                  <div className="ml-4 text-right">
                    <p className="text-sm font-medium text-zinc-900 dark:text-zinc-100">
                      {skill.downloads.toLocaleString()}
                    </p>
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">downloads</p>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {skill.likes} likes
                    </p>
                  </div>
                </div>
              </Link>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
