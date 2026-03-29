import Link from 'next/link';
import { notFound } from 'next/navigation';
import { SKILL_CATEGORIES } from '@aresdevunit/shared';
import { prisma } from '@/lib/prisma';
import { LikeButton } from './like-button';
import { CopyButton } from './copy-button';

async function fetchSkill(name: string) {
  try {
    const skill = await prisma.skill.findFirst({
      where: { name, deprecated: false },
      include: {
        author: { select: { username: true, avatarUrl: true } },
        versions: {
          select: { version: true, changelog: true, createdAt: true },
          orderBy: { createdAt: 'desc' },
        },
        _count: { select: { likes: true } },
      },
    });

    if (!skill) return null;

    return {
      id: skill.id,
      name: skill.name,
      description: skill.description,
      readme: skill.readme,
      category: skill.category,
      latest_version: skill.latestVersion,
      agent_types: skill.agentTypes,
      keywords: skill.keywords,
      license: skill.license,
      author: {
        username: skill.author.username,
        avatar_url: skill.author.avatarUrl,
      },
      downloads: skill.downloads,
      likes: skill._count.likes,
      is_verified: skill.isVerified,
      deprecated: skill.deprecated,
      versions: skill.versions.map((v) => ({
        version: v.version,
        changelog: v.changelog,
        created_at: v.createdAt.toISOString(),
      })),
      created_at: skill.createdAt.toISOString(),
      updated_at: skill.updatedAt.toISOString(),
    };
  } catch (error) {
    console.error('Failed to get skill:', error);
    return null;
  }
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const skill = await fetchSkill(name);
  if (!skill) {
    return { title: 'Skill을 찾을 수 없음 - AresDevUnit Hub' };
  }
  return {
    title: `${skill.name} - AresDevUnit Hub`,
    description: skill.description,
  };
}

export default async function SkillDetailPage({
  params,
}: {
  params: Promise<{ name: string }>;
}) {
  const { name } = await params;
  const skill = await fetchSkill(name);

  if (!skill) {
    notFound();
  }

  const installCommand = `npx @aresdevunit/aresdevhubcli install ${skill.name}`;
  const categoryLabel =
    SKILL_CATEGORIES[skill.category as keyof typeof SKILL_CATEGORIES] || skill.category;

  return (
    <div className="min-h-screen bg-gray-50">
      {/* Breadcrumb */}
      <div className="bg-white border-b border-gray-200">
        <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-3">
          <nav className="flex items-center gap-2 text-sm text-gray-500">
            <Link href="/skills" className="hover:text-blue-600">
              Skills
            </Link>
            <span>/</span>
            <span className="text-gray-900 font-medium">{skill.name}</span>
          </nav>
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 sm:px-6 lg:px-8 py-8">
        <div className="flex flex-col lg:flex-row gap-8">
          {/* Main Content */}
          <main className="flex-1 min-w-0">
            {/* Header */}
            <div className="bg-white rounded-lg border border-gray-200 p-6">
              <div className="flex items-start justify-between">
                <div>
                  <div className="flex items-center gap-3">
                    <h1 className="text-2xl font-bold text-gray-900">{skill.name}</h1>
                    {skill.is_verified && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-green-100 text-green-800">
                        인증됨
                      </span>
                    )}
                    {skill.deprecated && (
                      <span className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-red-100 text-red-800">
                        지원 중단
                      </span>
                    )}
                  </div>
                  <p className="mt-2 text-gray-600">{skill.description}</p>
                </div>
                <LikeButton
                  skillName={skill.name}
                  initialLikes={skill.likes}
                />
              </div>

              {/* Install command */}
              <div className="mt-6 bg-gray-900 rounded-lg p-4">
                <div className="flex items-center justify-between">
                  <code className="text-green-400 text-sm font-mono">
                    $ {installCommand}
                  </code>
                  <CopyButton text={installCommand} />
                </div>
              </div>

              {/* Meta */}
              <div className="mt-6 flex flex-wrap items-center gap-4 text-sm text-gray-600">
                <span>
                  작성자:{' '}
                  <span className="font-medium text-gray-900">
                    {skill.author.username}
                  </span>
                </span>
                <span className="text-gray-300">|</span>
                <span className="inline-flex items-center px-2.5 py-0.5 bg-gray-100 rounded text-xs">
                  {categoryLabel}
                </span>
                <span className="text-gray-300">|</span>
                <span>라이선스: {skill.license}</span>
                <span className="text-gray-300">|</span>
                <span>{skill.agent_types.join(', ')}</span>
              </div>

              {/* Keywords */}
              {skill.keywords.length > 0 && (
                <div className="mt-4 flex flex-wrap gap-2">
                  {skill.keywords.map((kw) => (
                    <Link
                      key={kw}
                      href={`/skills?q=${encodeURIComponent(kw)}`}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-blue-50 text-blue-700 hover:bg-blue-100"
                    >
                      {kw}
                    </Link>
                  ))}
                </div>
              )}
            </div>

            {/* README */}
            {skill.readme && (
              <div className="mt-6 bg-white rounded-lg border border-gray-200 p-6">
                <h2 className="text-lg font-semibold text-gray-900 mb-4">README</h2>
                <div className="prose prose-sm max-w-none text-gray-700 whitespace-pre-wrap">
                  {skill.readme}
                </div>
              </div>
            )}

            {/* Versions */}
            <div className="mt-6 bg-white rounded-lg border border-gray-200 p-6">
              <h2 className="text-lg font-semibold text-gray-900 mb-4">버전</h2>
              <div className="space-y-4">
                {skill.versions.map((v, i) => (
                  <div
                    key={v.version}
                    className={`flex items-start justify-between ${
                      i > 0 ? 'pt-4 border-t border-gray-100' : ''
                    }`}
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono text-sm font-medium text-gray-900">
                          v{v.version}
                        </span>
                        {v.version === skill.latest_version && (
                          <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-blue-100 text-blue-800">
                            최신
                          </span>
                        )}
                      </div>
                      {v.changelog && (
                        <p className="mt-1 text-sm text-gray-600">{v.changelog}</p>
                      )}
                    </div>
                    <span className="text-xs text-gray-500 shrink-0">
                      {new Date(v.created_at).toLocaleDateString()}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          </main>

          {/* Sidebar */}
          <aside className="w-full lg:w-72 shrink-0">
            <div className="bg-white rounded-lg border border-gray-200 p-5 sticky top-8">
              <h2 className="font-semibold text-gray-900 mb-4">통계</h2>

              <dl className="space-y-3">
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600">버전</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {skill.latest_version}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600">다운로드</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {skill.downloads.toLocaleString()}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600">좋아요</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {skill.likes}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600">생성일</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {new Date(skill.created_at).toLocaleDateString()}
                  </dd>
                </div>
                <div className="flex justify-between">
                  <dt className="text-sm text-gray-600">수정일</dt>
                  <dd className="text-sm font-medium text-gray-900">
                    {new Date(skill.updated_at).toLocaleDateString()}
                  </dd>
                </div>
              </dl>

              <div className="mt-6 pt-4 border-t border-gray-200">
                <h3 className="text-sm font-medium text-gray-900 mb-2">
                  지원 Agent
                </h3>
                <div className="flex flex-wrap gap-2">
                  {skill.agent_types.map((agent) => (
                    <span
                      key={agent}
                      className="inline-flex items-center px-2.5 py-0.5 rounded-full text-xs font-medium bg-purple-50 text-purple-700"
                    >
                      {agent}
                    </span>
                  ))}
                </div>
              </div>

              <div className="mt-6 pt-4 border-t border-gray-200">
                <h3 className="text-sm font-medium text-gray-900 mb-2">
                  버전 지정 설치
                </h3>
                <code className="block text-xs bg-gray-50 p-2 rounded text-gray-700 break-all">
                  npx @aresdevunit/aresdevhubcli install {skill.name}@{skill.latest_version}
                </code>
              </div>
            </div>
          </aside>
        </div>
      </div>
    </div>
  );
}
