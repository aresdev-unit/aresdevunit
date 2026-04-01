import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import {
  requireAuth,
  withCors,
  errorResponse,
  handleCorsPreflightResponse,
  type AuthUser,
} from '@/lib/api-middleware';

export async function OPTIONS() {
  return handleCorsPreflightResponse();
}

export async function GET(request: NextRequest) {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return withCors(authResult);
  const user = authResult as AuthUser;

  try {
    const [skillsCount, totalAgg, mySkillIds] = await Promise.all([
      prisma.skill.count({
        where: { authorId: user.id, deprecated: false },
      }),
      prisma.skill.aggregate({
        where: { authorId: user.id, deprecated: false },
        _sum: { downloads: true },
      }),
      prisma.skill.findMany({
        where: { authorId: user.id, deprecated: false },
        select: { id: true },
      }),
    ]);
    const totalDownloads = totalAgg._sum.downloads || 0;

    const now = new Date();
    const weekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);
    const twoWeeksAgo = new Date(now.getTime() - 14 * 24 * 60 * 60 * 1000);
    const ids = mySkillIds.map((s) => s.id);

    let weeklyDownloads = 0;
    let prevWeeklyDownloads = 0;
    let rank: number | null = null;
    let downloadTrend: { date: string; count: number }[] = [];

    if (ids.length > 0) {
      const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000);

      const [currentWeekCount, previousWeekCount, rankResult, rawTrend] = await Promise.all([
        prisma.activityLog.count({
          where: {
            skillId: { in: ids },
            action: 'INSTALL',
            createdAt: { gte: weekAgo },
          },
        }),
        prisma.activityLog.count({
          where: {
            skillId: { in: ids },
            action: 'INSTALL',
            createdAt: { gte: twoWeeksAgo, lt: weekAgo },
          },
        }),
        prisma.$queryRaw<{ cnt: bigint }[]>`
          SELECT COUNT(*) as cnt FROM (
            SELECT author_id FROM skills
            WHERE deprecated = false AND author_id != ${user.id}
            GROUP BY author_id
            HAVING SUM(downloads) > ${totalDownloads}
          ) t
        `,
        prisma.$queryRaw<{ day: Date; count: bigint }[]>`
          SELECT DATE(created_at) as day, COUNT(*) as count
          FROM activity_logs
          WHERE skill_id = ANY(${ids})
            AND action = 'INSTALL'
            AND created_at >= ${thirtyDaysAgo}
          GROUP BY DATE(created_at)
          ORDER BY day ASC
        `,
      ]);

      weeklyDownloads = currentWeekCount;
      prevWeeklyDownloads = previousWeekCount;
      rank = totalDownloads > 0 ? Number(rankResult[0]?.cnt ?? 0) + 1 : null;
      downloadTrend = rawTrend.map((r) => ({
        date: r.day.toISOString().split('T')[0],
        count: Number(r.count),
      }));
    }

    const weeklyDelta = weeklyDownloads - prevWeeklyDownloads;

    return withCors(
      NextResponse.json({
        skills_count: skillsCount,
        total_downloads: totalDownloads,
        weekly_downloads: weeklyDownloads,
        weekly_downloads_delta: weeklyDelta,
        rank,
        download_trend: downloadTrend,
      })
    );
  } catch (error) {
    console.error('Failed to fetch dashboard stats:', error);
    return withCors(errorResponse('INTERNAL_ERROR', 'Failed to fetch dashboard stats', 500));
  }
}
