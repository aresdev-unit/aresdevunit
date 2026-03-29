import Link from 'next/link';
import { SKILL_CATEGORIES } from '@aresdevunit/shared';
import type { PaginatedResponse, SkillSummary } from '@aresdevunit/shared';

interface SearchParams {
  page?: string;
  sort?: string;
  category?: string;
  q?: string;
}

async function fetchSkills(searchParams: SearchParams): Promise<PaginatedResponse<SkillSummary>> {
  const baseUrl = process.env.NEXTAUTH_URL || 'http://localhost:3000';
  const params = new URLSearchParams();

  if (searchParams.page) params.set('page', searchParams.page);
  if (searchParams.sort) params.set('sort', searchParams.sort);
  if (searchParams.category) params.set('category', searchParams.category);
  if (searchParams.q) params.set('q', searchParams.q);

  const res = await fetch(`${baseUrl}/api/v1/skills?${params.toString()}`, {
    cache: 'no-store',
  });

  if (!res.ok) {
    return { data: [], pagination: { page: 1, limit: 20, total: 0, total_pages: 0 } };
  }

  return res.json();
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
  title: 'Skills - AresDevUnit Hub',
  description: 'Browse and discover AI agent skills',
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
    { value: 'downloads', label: 'Most Downloaded' },
    { value: 'latest', label: 'Latest' },
    { value: 'name', label: 'Name' },
    { value: 'likes', label: 'Most Liked' },
  ];

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Header */}
      <header className="bg-white border-b border-gray-200">
        <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-6">
          <h1 className="text-3xl font-bold text-gray-900">Skills</h1>
          <p className="mt-2 text-gray-600">
            Discover and install AI agent skills for Claude Code, Codex, and more.
          </p>
        </div>
      </header>

      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Sidebar - Categories */}
          <aside className="w-full lg:w-64 shrink-0">
            <div className="bg-white rounded-lg border border-gray-200 p-4">
              <h2 className="font-semibold text-gray-900 mb-3">Categories</h2>
              <nav className="space-y-1">
                <Link
                  href={buildUrl(resolvedParams, { category: undefined, page: undefined })}
                  className={`block px-3 py-2 rounded-md text-sm ${
                    !currentCategory
                      ? 'bg-blue-50 text-blue-700 font-medium'
                      : 'text-gray-700 hover:bg-gray-50'
                  }`}
                >
                  All Categories
                </Link>
                {Object.entries(SKILL_CATEGORIES).map(([key, label]) => (
                  <Link
                    key={key}
                    href={buildUrl(resolvedParams, { category: key, page: undefined })}
                    className={`block px-3 py-2 rounded-md text-sm ${
                      currentCategory === key
                        ? 'bg-blue-50 text-blue-700 font-medium'
                        : 'text-gray-700 hover:bg-gray-50'
                    }`}
                  >
                    {label}
                  </Link>
                ))}
              </nav>
            </div>
          </aside>

          {/* Main Content */}
          <main className="flex-1 min-w-0">
            {/* Search & Sort */}
            <div className="flex flex-col sm:flex-row gap-4 mb-6">
              <form className="flex-1" action="/skills" method="GET">
                {currentCategory && (
                  <input type="hidden" name="category" value={currentCategory} />
                )}
                {currentSort && currentSort !== 'downloads' && (
                  <input type="hidden" name="sort" value={currentSort} />
                )}
                <div className="relative">
                  <input
                    type="text"
                    name="q"
                    defaultValue={currentQuery}
                    placeholder="Search skills..."
                    className="w-full pl-10 pr-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-blue-500 focus:border-transparent text-sm"
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
                    className={`px-3 py-2 text-sm rounded-lg border ${
                      currentSort === opt.value
                        ? 'bg-blue-600 text-white border-blue-600'
                        : 'bg-white text-gray-700 border-gray-300 hover:bg-gray-50'
                    }`}
                  >
                    {opt.label}
                  </Link>
                ))}
              </div>
            </div>

            {/* Results count */}
            <p className="text-sm text-gray-500 mb-4">
              {pagination.total} skill{pagination.total !== 1 ? 's' : ''} found
              {currentQuery && ` for "${currentQuery}"`}
            </p>

            {/* Skill Grid */}
            {skills.length === 0 ? (
              <div className="text-center py-12 bg-white rounded-lg border border-gray-200">
                <p className="text-gray-500">No skills found.</p>
                {currentQuery && (
                  <Link href="/skills" className="text-blue-600 hover:underline mt-2 inline-block">
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
                    className="block bg-white rounded-lg border border-gray-200 p-5 hover:border-blue-300 hover:shadow-sm transition-all"
                  >
                    <div className="flex items-start justify-between">
                      <div className="min-w-0 flex-1">
                        <div className="flex items-center gap-2">
                          <h3 className="font-semibold text-gray-900 truncate">
                            {skill.name}
                          </h3>
                          <span className="text-xs text-gray-500">
                            v{skill.latest_version}
                          </span>
                          {skill.is_verified && (
                            <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                              Verified
                            </span>
                          )}
                        </div>
                        <p className="mt-1 text-sm text-gray-600 line-clamp-2">
                          {skill.description}
                        </p>
                        <div className="mt-3 flex items-center gap-4 text-xs text-gray-500">
                          <span className="inline-flex items-center gap-1 px-2 py-0.5 bg-gray-100 rounded">
                            {SKILL_CATEGORIES[skill.category as keyof typeof SKILL_CATEGORIES] || skill.category}
                          </span>
                          <span>{skill.agent_types.join(', ')}</span>
                          <span>by {skill.author.username}</span>
                        </div>
                      </div>
                      <div className="ml-4 text-right shrink-0">
                        <div className="text-sm font-medium text-gray-900">
                          {skill.downloads.toLocaleString()}
                        </div>
                        <div className="text-xs text-gray-500">downloads</div>
                        <div className="mt-1 text-sm text-gray-600">
                          {skill.likes} likes
                        </div>
                      </div>
                    </div>
                  </Link>
                ))}
              </div>
            )}

            {/* Pagination */}
            {pagination.total_pages > 1 && (
              <div className="mt-8 flex justify-center gap-2">
                {pagination.page > 1 && (
                  <Link
                    href={buildUrl(resolvedParams, {
                      page: String(pagination.page - 1),
                    })}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
                  >
                    Previous
                  </Link>
                )}
                <span className="px-4 py-2 text-sm text-gray-700">
                  Page {pagination.page} of {pagination.total_pages}
                </span>
                {pagination.page < pagination.total_pages && (
                  <Link
                    href={buildUrl(resolvedParams, {
                      page: String(pagination.page + 1),
                    })}
                    className="px-4 py-2 text-sm border border-gray-300 rounded-lg hover:bg-gray-50"
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
