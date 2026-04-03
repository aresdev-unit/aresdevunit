import Link from 'next/link';
import { Prisma } from '@prisma/client';
import { unstable_cache } from 'next/cache';
import { SKILL_CATEGORIES } from '@aresdevunit/shared';
import { hasDatabaseUrl, prisma } from '@/lib/prisma';

interface SearchParams {
  page?: string;
  sort?: string;
  category?: string;
  q?: string;
}

function parsePositiveInt(value: string | undefined, fallback: number): number {
  const parsed = Number.parseInt(value || '', 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : fallback;
}

async function fetchSkills(searchParams: SearchParams) {
  if (!hasDatabaseUrl) {
    return { data: [], pagination: { page: 1, limit: 20, total: 0, total_pages: 0 } };
  }

  const page = parsePositiveInt(searchParams.page, 1);
  const limit = 20;
  const sort = searchParams.sort || 'downloads';
  const category = searchParams.category;
  const q = searchParams.q;

  const getCachedSkills = unstable_cache(
    async () => {
      const resolvedCategory = category || null;
      const resolvedQuery = q || null;
      const where: Prisma.SkillWhereInput = { deprecated: false };

      if (resolvedCategory) {
        where.category = resolvedCategory;
      }
      if (resolvedQuery) {
        where.OR = [
          { name: { contains: resolvedQuery, mode: 'insensitive' } },
          { description: { contains: resolvedQuery, mode: 'insensitive' } },
          { keywords: { has: resolvedQuery } },
        ];
      }

      let orderBy: Prisma.SkillOrderByWithRelationInput | Prisma.SkillOrderByWithRelationInput[];
      switch (sort) {
        case 'latest':
          orderBy = { createdAt: 'desc' };
          break;
        case 'name':
          orderBy = { name: 'asc' };
          break;
        case 'likes':
          orderBy = [{ likes: { _count: 'desc' } }, { downloads: 'desc' }];
          break;
        case 'downloads':
        default:
          orderBy = { downloads: 'desc' };
          break;
      }

      try {
        const [skills, total] = await Promise.all([
          prisma.skill.findMany({
            where,
            orderBy,
            skip: (page - 1) * limit,
            take: limit,
            include: {
              author: { select: { username: true, avatarUrl: true } },
              _count: { select: { likes: true } },
            },
          }),
          prisma.skill.count({ where }),
        ]);

        const data = skills.map((skill) => ({
          id: skill.id,
          name: skill.name,
          description: skill.description,
          category: skill.category,
          latest_version: skill.latestVersion,
          agent_types: skill.agentTypes,
          author: {
            username: skill.author.username,
            avatar_url: skill.author.avatarUrl,
          },
          downloads: skill.downloads,
          likes: skill._count.likes,
          is_verified: skill.isVerified,
          deprecated: skill.deprecated,
          created_at: skill.createdAt.toISOString(),
        }));

        return {
          data,
          pagination: {
            page,
            limit,
            total,
            total_pages: Math.ceil(total / limit),
          },
        };
      } catch (error) {
        console.error('Failed to list skills:', error);
        return { data: [], pagination: { page: 1, limit: 20, total: 0, total_pages: 0 } };
      }
    },
    ['skills-page', String(page), String(limit), sort, category || '', q || ''],
    { revalidate: 60 }
  );

  return getCachedSkills();
}

function buildUrl(current: SearchParams, overrides: Record<string, string | undefined>): string {
  const params = new URLSearchParams();
  const merged = { ...current, ...overrides };
  for (const [k, v] of Object.entries(merged)) {
    if (v) params.set(k, v);
  }
  return `/skills?${params.toString()}`;
}

export const metadata = {
  title: 'Skill - AresDevUnit Hub',
  description: 'AI Agent Skill browse page',
};

export default async function SkillsPage({
  searchParams,
}: {
  searchParams: Promise<SearchParams>;
}) {
  const resolvedParams = await searchParams;
  const { data: skills, pagination } = await fetchSkills(resolvedParams);
  const currentSort = resolvedParams.sort || 'downloads';
  const currentCategory = resolvedParams.category || '';
  const currentQuery = resolvedParams.q || '';

  const sortOptions = [
    { value: 'downloads', label: 'Downloads' },
    { value: 'latest', label: 'Latest' },
    { value: 'name', label: 'Name' },
    { value: 'likes', label: 'Likes' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">Skill</h1>
          <p className="mt-2 text-gray-600">
            Explore and install AI Agent Skills for Claude Code and Codex.
          </p>
        </div>
      </header>

      <div className="mx-auto max-w-7xl px-4 py-8 sm:px-6 lg:px-8">
        <div className="flex flex-col gap-8 lg:flex-row">
          <aside className="w-full shrink-0 lg:w-64">
            <div className="rounded-lg border border-gray-200 bg-white p-4">
              <h2 className="mb-3 font-semibold text-gray-900">Categories</h2>
              <nav className="space-y-1">
                <Link
                  href={buildUrl(resolvedParams, { category: undefined, page: undefined })}
                  className={`block rounded-md px-3 py-2 text-sm ${
                    !currentCategory
                      ? 'bg-blue-50 font-medium text-blue-700'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  All categories
                </Link>
                {Object.entries(SKILL_CATEGORIES).map(([key, label]) => (
                  <Link
                    key={key}
                    href={buildUrl(resolvedParams, { category: key, page: undefined })}
                    className={`block rounded-md px-3 py-2 text-sm ${
                      currentCategory === key
                        ? 'bg-blue-50 font-medium text-blue-700'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {label}
                  </Link>
                ))}
              </nav>
            </div>
          </aside>

          <main className="min-w-0 flex-1">
            <div className="mb-6 flex flex-col gap-4 sm:flex-row">
              <form className="flex-1" action="/skills" method="GET">
                {currentCategory && <input type="hidden" name="category" value={currentCategory} />}
                {currentSort && currentSort !== 'downloads' && (
                  <input type="hidden" name="sort" value={currentSort} />
                )}
                <div className="relative">
                  <input
                    type="text"
                    name="q"
                    defaultValue={currentQuery}
                    placeholder="Search skills..."
                    className="w-full rounded-lg border border-gray-300 py-2 pl-10 pr-4 text-sm focus:border-transparent focus:ring-2 focus:ring-blue-500"
                  />
                  <svg
                    className="absolute left-3 top-2.5 h-4 w-4 text-gray-400"
                    fill="none"
                    viewBox="0 0 24 24"
                    stroke="currentColor"
                  >
                    <path
                      strokeLinecap="round"
                      strokeLinejoin="round"
                      strokeWidth={2}
                      d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                    />
                  </svg>
                </div>
              </form>

              <div className="flex gap-2">
                {sortOptions.map((opt) => (
                  <Link
                    key={opt.value}
                    href={buildUrl(resolvedParams, { sort: opt.value, page: undefined })}
                    className={`rounded-lg border px-3 py-2 text-sm ${
                      currentSort === opt.value
                        ? 'border-blue-600 bg-blue-600 text-white'
                        : 'border-gray-300 bg-white text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {opt.label}
                  </Link>
                ))}
              </div>
            </div>

            <p className="mb-4 text-sm text-gray-500">
              {pagination.total} skills found
              {currentQuery && ` "${currentQuery}"`}
            </p>

            {skills.length === 0 ? (
              <div className="rounded-lg border border-gray-200 bg-white py-12 text-center">
                <p className="text-gray-500">No skills found.</p>
                {currentQuery && (
                  <Link href="/skills" className="mt-2 inline-block text-blue-600 hover:underline">
                    Clear search
                  </Link>
                )}
              </div>
            ) : (
              <div className="grid gap-4">
                {skills.map((skill) => (
                  <Link
                    key={skill.id}
                    href={`/skills/${skill.name}`}
                    className="block rounded-lg border border-gray-200 bg-white p-5 transition-all hover:border-blue-300 hover:shadow-sm"
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="truncate font-semibold text-gray-900">{skill.name}</h3>
                          <span className="text-xs text-gray-500">v{skill.latest_version}</span>
                          {skill.is_verified && (
                            <span className="inline-flex items-center rounded bg-green-100 px-2 py-0.5 text-xs font-medium text-green-800">
                              Verified
                            </span>
                          )}
                        </div>
                        <p className="mt-1 line-clamp-2 text-sm text-gray-600">{skill.description}</p>
                        <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                          <span className="inline-flex items-center gap-1 rounded bg-gray-100 px-2 py-0.5">
                            {SKILL_CATEGORIES[skill.category as keyof typeof SKILL_CATEGORIES] || skill.category}
                          </span>
                          <span>{skill.agent_types.join(', ')}</span>
                          <span>Author {skill.author.username}</span>
                        </div>
                      </div>
                      <div className="ml-4 shrink-0 text-right">
                        <div className="text-sm font-medium text-gray-900">
                          {skill.downloads.toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-500">Downloads</div>
                        <div className="mt-1 text-sm text-gray-600">{skill.likes} likes</div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {pagination.total_pages > 1 && (
              <div className="mt-8 flex justify-center gap-2">
                {pagination.page > 1 && (
                  <Link
                    href={buildUrl(resolvedParams, { page: String(pagination.page - 1) })}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                  >
                    Previous
                  </Link>
                )}
                <span className="px-4 py-2 text-sm text-gray-700">
                  {pagination.page} / {pagination.total_pages} pages
                </span>
                {pagination.page < pagination.total_pages && (
                  <Link
                    href={buildUrl(resolvedParams, { page: String(pagination.page + 1) })}
                    className="rounded-lg border border-gray-300 px-4 py-2 text-sm hover:bg-gray-50"
                  >
                    Next
                  </Link>
                )}
              </div>
            )}
          </main>
        </div>
      </div>
    </div>
  );
}
