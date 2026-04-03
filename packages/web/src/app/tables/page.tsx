import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import { getServerSession } from 'next-auth';
import { TableWorkspace } from '@/components/tables/table-workspace';
import type { SidebarGroup, TableOption } from '@/components/tables/table-workspace';
import { authOptions } from '@/lib/auth';
import { getLocalDevAuthUser } from '@/lib/local-dev-auth';
import { LOCAL_DEV_AUTH_COOKIE } from '@/lib/local-dev-auth-shared';
import { getCsvPages } from '@/lib/tables/data';
import { listEditLogs } from '@/lib/tables/override-store';
import type { CsvPage } from '@/lib/tables/types';

export const metadata = {
  title: '테이블 - AresDevUnit Hub',
  description: 'TRUNK_GL 데이터 테이블 탐색',
};

export const dynamic = 'force-dynamic';

/* ------------------------------------------------------------------ */
/*  Helpers                                                           */
/* ------------------------------------------------------------------ */

function getFolderOrder(folderGroup: string) {
  const match = folderGroup.match(/^(\d+)/);
  return match ? Number(match[1]) : Number.MAX_SAFE_INTEGER;
}

function compareFolderGroups(left: string, right: string) {
  const leftOrder = getFolderOrder(left);
  const rightOrder = getFolderOrder(right);
  if (leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }
  return left.localeCompare(right, 'ko');
}

function buildSidebarGroups(csvPages: CsvPage[]): SidebarGroup[] {
  const grouped = csvPages.reduce<Array<{ group: string; pages: CsvPage[] }>>((groups, csvPage) => {
    const existing = groups.find((item) => item.group === csvPage.folderGroup);
    if (existing) {
      existing.pages.push(csvPage);
      return groups;
    }
    groups.push({ group: csvPage.folderGroup, pages: [csvPage] });
    return groups;
  }, []);

  return grouped
    .sort((left, right) => compareFolderGroups(left.group, right.group))
    .map((group) => ({
      group: group.group,
      pages: group.pages
        .slice()
        .sort((left, right) => left.csvName.localeCompare(right.csvName, 'ko'))
        .map((csvPage) => ({
          pageId: csvPage.pageId,
          csvName: csvPage.csvName,
          tableCount: csvPage.tables.length,
        })),
    }));
}

/* ------------------------------------------------------------------ */
/*  Page component                                                    */
/* ------------------------------------------------------------------ */

export default async function TablesPage({
  searchParams,
}: {
  searchParams: Promise<{
    page?: string;
    tab?: string;
    view?: string;
    section?: string;
    logScope?: string;
  }>;
}) {
  const resolvedParams = await searchParams;
  const [session, cookieStore] = await Promise.all([getServerSession(authOptions), cookies()]);
  const localDevUser = await getLocalDevAuthUser(cookieStore.get(LOCAL_DEV_AUTH_COOKIE)?.value);

  if (!session?.user?.id && !localDevUser) {
    const params = new URLSearchParams();
    if (resolvedParams.page) params.set('page', resolvedParams.page);
    if (resolvedParams.tab) params.set('tab', resolvedParams.tab);
    if (resolvedParams.view) params.set('view', resolvedParams.view);
    if (resolvedParams.section) params.set('section', resolvedParams.section);
    if (resolvedParams.logScope) params.set('logScope', resolvedParams.logScope);
    const callbackUrl = params.size > 0 ? `/tables?${params.toString()}` : '/tables';
    redirect(`/login?callbackUrl=${encodeURIComponent(callbackUrl)}`);
  }

  const [csvPages, recentLogs] = await Promise.all([getCsvPages(), listEditLogs({ limit: 30 })]);

  if (csvPages.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50">
        <div className="mx-auto max-w-7xl px-4 py-12 sm:px-6 lg:px-8">
          <div className="rounded-lg border border-gray-200 bg-white p-8 text-sm text-gray-600">
            테이블을 불러올 데이터가 없습니다.
          </div>
        </div>
      </div>
    );
  }

  const sidebarGroups = buildSidebarGroups(csvPages);

  const pageIdByTable = Object.fromEntries(
    csvPages.flatMap((csvPage) => csvPage.tables.map((table) => [table.tableId, csvPage.pageId]))
  );

  const folderGroupByTable = Object.fromEntries(
    csvPages.flatMap((csvPage) => csvPage.tables.map((table) => [table.tableId, table.folderGroup]))
  );

  const tableOptions: TableOption[] = csvPages.flatMap((csvPage) =>
    csvPage.tables.map((table) => ({
      tableId: table.tableId,
      columns: table.columns.map((column) => column.name),
    }))
  );

  return (
    <TableWorkspace
      csvPages={csvPages}
      folderGroupByTable={folderGroupByTable}
      initialLogs={recentLogs}
      pageIdByTable={pageIdByTable}
      sidebarGroups={sidebarGroups}
      tableOptions={tableOptions}
    />
  );
}
