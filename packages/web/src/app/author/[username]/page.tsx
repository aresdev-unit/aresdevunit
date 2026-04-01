import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SKILL_CATEGORIES } from '@aresdevunit/shared';
import { prisma } from '@/lib/prisma';

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
  try {
    const user = await prisma.user.findUnique({
      where: { username },
      include: {
        skills: {
          where: { deprecated: false },
          orderBy: { downloads: 'desc' },
          include: {
            _count: { select: { likes: true } },
          },
        },
      },
    });

    if (!user) return null;

    const totalDownloads = user.skills.reduce((sum, s) => sum + s.downloads, 0);

    return {
      username: user.username,
      avatar_url: user.avatarUrl,
      skills_count: user.skills.length,
      total_downloads: totalDownloads,
      created_at: user.createdAt.toISOString(),
      skills: user.skills.map((s) => ({
        id: s.id,
        name: s.name,
        description: s.description,
        category: s.category,
        latest_version: s.latestVersion,
        agent_types: s.agentTypes,
        downloads: s.downloads,
        likes: s._count.likes,
        is_verified: s.isVerified,
        created_at: s.createdAt.toISOString(),
      })),
    };
  } catch (error) {
    console.error('Failed to fetch author:', error);
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
    description: `${username}의 Skill`,
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
              <span>{author.skills_count}개 Skill</span>
              <span className="text-zinc-300 dark:text-zinc-700">|</span>
              <span>총 {author.total_downloads.toLocaleString()} 다운로드</span>
              <span className="text-zinc-300 dark:text-zinc-700">|</span>
              <span>가입일 {new Date(author.created_at).toLocaleDateString()}</span>
            </div>
          </div>
        </div>

        {/* Skills */}
        <h2 className="mb-4 text-lg font-semibold text-zinc-900 dark:text-zinc-50">
          Skills ({author.skills.length})
        </h2>

        {author.skills.length === 0 ? (
          <div className="rounded-xl border border-zinc-200 bg-white px-6 py-12 text-center text-sm text-zinc-500 dark:border-zinc-800 dark:bg-zinc-900 dark:text-zinc-400">
            이 작성자는 아직 Skill을 배포하지 않았습니다.
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
                          인증됨
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
                    <p className="text-xs text-zinc-500 dark:text-zinc-400">다운로드</p>
                    <p className="mt-1 text-sm text-zinc-600 dark:text-zinc-400">
                      {skill.likes} 좋아요
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
