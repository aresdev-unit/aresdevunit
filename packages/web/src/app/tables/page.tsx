import Link from 'next/link';
import { cookies } from 'next/headers';
import { redirect } from 'next/navigation';
import type { ReactNode } from 'react';
import { getServerSession } from 'next-auth';
import { CsvSidebar } from '@/components/tables/csv-sidebar';
import { ColumnMetaEditor } from '@/components/tables/column-meta-editor';
import { GraphView } from '@/components/tables/graph-view';
import { ManualTableModal } from '@/components/tables/manual-table-modal';
import { RelationEditor } from '@/components/tables/relation-editor';
import { authOptions } from '@/lib/auth';
import { getLocalDevAuthUser } from '@/lib/local-dev-auth';
import { LOCAL_DEV_AUTH_COOKIE } from '@/lib/local-dev-auth-shared';
import { buildTableHref, getCsvPages } from '@/lib/tables/data';
import { listEditLogs } from '@/lib/tables/override-store';
import type { ManualRemarkBlock, TableEditLog } from '@/lib/tables/types';

export const metadata = {
  title: '테이블 - AresDevUnit Hub',
  description: 'TRUNK_GL 데이터 테이블 탐색',
};

export const dynamic = 'force-dynamic';

type SectionMode = 'docs' | 'logs';
type LogScope = 'current' | 'all';

type ManualLikeTable = {
  headers?: unknown[];
  rows?: unknown[];
};

type LogSection = {
  label: string;
  before: ReactNode;
  after: ReactNode;
};

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

function renderColumnName(name: string) {
  return name
    .replace(/_/g, '_\u200b')
    .replace(/([a-z0-9])([A-Z])/g, '$1\u200b$2')
    .split('\u200b')
    .map((segment, index) => (
      <span className="column-name-part" key={`${name}-${index}`}>
        {segment}
      </span>
    ));
}

function buildSidebarGroups(csvPages: Awaited<ReturnType<typeof getCsvPages>>) {
  const grouped = csvPages.reduce<Array<{ group: string; pages: typeof csvPages }>>((groups, csvPage) => {
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

function buildTablesHref(
  pageId: string,
  currentTableId: string,
  view: string | undefined,
  section: SectionMode,
  logScope: LogScope
) {
  const params = new URLSearchParams({ page: pageId, tab: currentTableId });
  if (view) params.set('view', view);
  params.set('section', section);
  if (section === 'logs') {
    params.set('logScope', logScope);
  }
  return `/tables?${params.toString()}`;
}

function getActionLabel(log: TableEditLog) {
  switch (log.actionType) {
    case 'set_relation':
      return '참조 지정';
    case 'ignore_relation':
      return '참조 제외';
    case 'reset_relation':
      return '참조 초기화';
    case 'update_column_meta':
      return '컬럼 설명 수정';
    default:
      return log.actionType;
  }
}

function sortLogs(logs: TableEditLog[], currentTableId: string) {
  return [...logs].sort((left, right) => {
    const leftPriority = left.sourceTable === currentTableId ? 0 : 1;
    const rightPriority = right.sourceTable === currentTableId ? 0 : 1;
    if (leftPriority !== rightPriority) {
      return leftPriority - rightPriority;
    }
    return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
  });
}

function isPlainRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isManualTableArray(value: unknown): value is ManualLikeTable[] {
  return Array.isArray(value);
}

function renderTextValue(value: string) {
  return <span className="tables-log-diff-inline">{value || '없음'}</span>;
}

function renderRelationPayload(value: unknown) {
  if (!isPlainRecord(value)) {
    return <span className="tables-log-value-empty">없음</span>;
  }

  const relation = isPlainRecord(value.relation) ? value.relation : value;
  const targetTable = typeof relation.targetTable === 'string' ? relation.targetTable : '';
  const targetColumn = typeof relation.targetColumn === 'string' ? relation.targetColumn : '';

  if (!targetTable && !targetColumn) {
    return <span className="tables-log-value-empty">없음</span>;
  }

  return (
    <span className="tables-log-diff-inline">
      {targetTable ? <strong>{targetTable}</strong> : null}
      {targetColumn ? <span> ({targetColumn})</span> : null}
    </span>
  );
}

function getHeaderValue(table: ManualLikeTable | undefined, headerIndex: number) {
  const headers = Array.isArray(table?.headers) ? table.headers : [];
  const value = headers[headerIndex];
  return typeof value === 'string' ? value : '';
}

function getCellValue(table: ManualLikeTable | undefined, rowIndex: number, cellIndex: number) {
  const rows = Array.isArray(table?.rows) ? table.rows : [];
  const row = Array.isArray(rows[rowIndex]) ? (rows[rowIndex] as unknown[]) : [];
  const value = row[cellIndex];
  return typeof value === 'string' ? value : '';
}

function uniqueStrings(values: string[]) {
  const seen = new Set<string>();
  return values.filter((value) => {
    if (!value || seen.has(value)) {
      return false;
    }
    seen.add(value);
    return true;
  });
}


type ManualTableChangeView = {
  label: string;
  value: string;
};

function formatManualLogValue(value: string) {
  return value === '' ? '(공백)' : value;
}

function collectManualTableChangesForView(
  currentValue: unknown,
  otherValue: unknown
): ManualTableChangeView[] {
  const currentTables = isManualTableArray(currentValue) ? currentValue : [];
  const otherTables = isManualTableArray(otherValue) ? otherValue : [];
  const changes: ManualTableChangeView[] = [];
  const tableCount = Math.max(currentTables.length, otherTables.length);

  for (let tableIndex = 0; tableIndex < tableCount; tableIndex += 1) {
    const currentTable = currentTables[tableIndex];
    const otherTable = otherTables[tableIndex];

    const headerCount = Math.max(
      Array.isArray(currentTable?.headers) ? currentTable.headers.length : 0,
      Array.isArray(otherTable?.headers) ? otherTable.headers.length : 0
    );

    for (let headerIndex = 0; headerIndex < headerCount; headerIndex += 1) {
      const currentHeader = getHeaderValue(currentTable, headerIndex);
      const otherHeader = getHeaderValue(otherTable, headerIndex);
      if (currentHeader !== otherHeader) {
        changes.push({
          label: `헤더 ${headerIndex + 1}열`,
          value: formatManualLogValue(currentHeader),
        });
      }
    }

    const currentRows = Array.isArray(currentTable?.rows) ? currentTable.rows : [];
    const otherRows = Array.isArray(otherTable?.rows) ? otherTable.rows : [];
    const rowCount = Math.max(currentRows.length, otherRows.length);

    for (let rowIndex = 0; rowIndex < rowCount; rowIndex += 1) {
      const currentRow: unknown[] = Array.isArray(currentRows[rowIndex]) ? (currentRows[rowIndex] as unknown[]) : [];
      const otherRow: unknown[] = Array.isArray(otherRows[rowIndex]) ? (otherRows[rowIndex] as unknown[]) : [];
      const cellCount = Math.max(currentRow.length, otherRow.length);

      for (let cellIndex = 0; cellIndex < cellCount; cellIndex += 1) {
        const currentCell = getCellValue(currentTable, rowIndex, cellIndex);
        const otherCell = getCellValue(otherTable, rowIndex, cellIndex);
        if (currentCell !== otherCell) {
          changes.push({
            label: `${rowIndex + 1}행 ${cellIndex + 1}열`,
            value: formatManualLogValue(currentCell),
          });
        }
      }
    }
  }

  const seen = new Set<string>();
  return changes.filter((entry) => {
    const key = `${entry.label}::${entry.value}`;
    if (seen.has(key)) {
      return false;
    }
    seen.add(key);
    return true;
  });
}

function renderManualTableChangesView(
  currentValue: unknown,
  otherValue: unknown,
  side: 'before' | 'after'
) {
  const values = collectManualTableChangesForView(currentValue, otherValue);
  if (values.length === 0) {
    return <span className="tables-log-value-empty">없음</span>;
  }

  return (
    <div className="tables-log-multi-value">
      {values.map((entry, index) => (
        <div className="tables-log-change-entry" key={`${side}-${index}-${entry.label}-${entry.value}`}>
          <span className="tables-log-change-label">{entry.label}</span>
          <span className="tables-log-change-separator">:</span>
          <span className="tables-log-change-value">{entry.value}</span>
        </div>
      ))}
    </div>
  );
}


function buildLogSectionsStable(log: TableEditLog): LogSection[] {
  const before = log.beforeValue ?? {};
  const after = log.afterValue ?? {};

  if (log.entityType === 'column_meta') {
    const sections: LogSection[] = [];

    if (JSON.stringify(before.description) !== JSON.stringify(after.description)) {
      sections.push({
        label: '설명',
        before: renderTextValue(typeof before.description === 'string' ? before.description : ''),
        after: renderTextValue(typeof after.description === 'string' ? after.description : ''),
      });
    }

    if (JSON.stringify(before.note) !== JSON.stringify(after.note)) {
      sections.push({
        label: '노트',
        before: renderTextValue(typeof before.note === 'string' ? before.note : ''),
        after: renderTextValue(typeof after.note === 'string' ? after.note : ''),
      });
    }

    if (JSON.stringify(before.manualTables) !== JSON.stringify(after.manualTables)) {
      sections.push({
        label: '참고표',
        before: renderManualTableChangesView(before.manualTables, after.manualTables, 'before'),
        after: renderManualTableChangesView(after.manualTables, before.manualTables, 'after'),
      });
    }

    return sections.length > 0
      ? sections
      : [
          {
            label: '설명',
            before: renderTextValue('없음'),
            after: renderTextValue('없음'),
          },
        ];
  }

  return [
    {
      label: '참조',
      before: renderRelationPayload(before),
      after: renderRelationPayload(after),
    },
  ];
}

function ExternalPageIcon() {
  return (
    <svg aria-hidden="true" viewBox="0 0 16 16">
      <path
        d="M6 3.5h6.5V10"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M12.5 3.5 7 9"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
      <path
        d="M12 8.5v4H3.5v-8h4"
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.5"
      />
    </svg>
  );
}

function TablesHome({
  csvPages,
  recentLogs,
  sidebarGroups,
}: {
  csvPages: Awaited<ReturnType<typeof getCsvPages>>;
  recentLogs: TableEditLog[];
  sidebarGroups: ReturnType<typeof buildSidebarGroups>;
}) {
  const tableCount = csvPages.reduce((sum, csvPage) => sum + csvPage.tables.length, 0);
  const pageIdByTable = Object.fromEntries(
    csvPages.flatMap((csvPage) => csvPage.tables.map((table) => [table.tableId, csvPage.pageId]))
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">테이블</h1>
          <p className="mt-2 text-gray-600">CSV 기준으로 테이블 구조, 컬럼 설명, 연결 관계를 탐색합니다.</p>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:flex-row lg:px-8">
        <aside className="w-full shrink-0 lg:w-72">
          <CsvSidebar groups={sidebarGroups} />
        </aside>

        <main className="min-w-0 flex-1">
          <section className="tables-home">
            <div className="tables-home-hero">
              <p className="tables-home-eyebrow">Table Explorer</p>
              <h2>게임 데이터 테이블을 빠르게 찾고 연결 관계를 확인하는 화면입니다.</h2>
              <p className="tables-home-copy">
                왼쪽 CSV 목록에서 원하는 항목을 선택하면 컬럼 문서와 연결 테이블, 수동 참조 편집 기능을 바로 확인할 수 있습니다.
              </p>
            </div>

            <div className="tables-home-grid">
              <article className="tables-home-card">
                <h3>무엇을 볼 수 있나</h3>
                <ul>
                  <li>CSV별 테이블 목록과 멀티 테이블 구조</li>
                  <li>컬럼별 설명, 참고표, 참조 대상 컬럼</li>
                  <li>테이블 간 연결 관계 요약과 그래프</li>
                </ul>
              </article>

              <article className="tables-home-card">
                <h3>어떻게 보면 되나</h3>
                <ul>
                  <li>왼쪽 폴더를 펼쳐 CSV를 선택</li>
                  <li>상단에서 연결 테이블 또는 컬럼 문서 확인</li>
                  <li>필요하면 수동 참조와 컬럼 설명 수정</li>
                </ul>
              </article>

              <article className="tables-home-card">
                <h3>현재 데이터 범위</h3>
                <ul>
                  <li>CSV 페이지 {csvPages.length}개</li>
                  <li>테이블 {tableCount}개</li>
                  <li>폴더 그룹 {sidebarGroups.length}개</li>
                </ul>
              </article>
            </div>

            <LogsPanel
              heading="전체 수정 로그"
              label="최근 변경"
              logs={recentLogs}
              pageIdByTable={pageIdByTable}
              showScopeTabs={false}
            />
          </section>
        </main>
      </div>
    </div>
  );
}

function LogsPanel({
  heading = '최근 변경 이력',
  label = '수정 로그',
  logs,
  pageIdByTable,
  sectionHref,
  currentScope,
  showScopeTabs = true,
  accordionName = 'tables-log-accordion',
}: {
  heading?: string;
  label?: string;
  logs: TableEditLog[];
  pageIdByTable: Record<string, string>;
  sectionHref?: (scope: LogScope) => string;
  currentScope?: LogScope;
  showScopeTabs?: boolean;
  accordionName?: string;
}) {
  return (
    <div className="tables-log-panel">
      <div className="tables-log-toolbar tables-section-head">
        <div>
          <p className="tables-section-label">{label}</p>
          <h2 className="tables-section-title mt-2">{heading}</h2>
        </div>

        {showScopeTabs && sectionHref && currentScope ? (
          <div className="tables-filter-tabs">
            <Link className={currentScope === 'current' ? 'table-tab active' : 'table-tab'} href={sectionHref('current')} scroll={false}>
              현재 CSV
            </Link>
            <Link className={currentScope === 'all' ? 'table-tab active' : 'table-tab'} href={sectionHref('all')} scroll={false}>
              전체
            </Link>
          </div>
        ) : null}
      </div>

      {logs.length === 0 ? (
        <div className="tables-log-empty">아직 표시할 수정 로그가 없습니다.</div>
      ) : (
        <div className="tables-log-list">
          {logs.map((log) => {
            const targetPageId = log.csvPageId ?? pageIdByTable[log.sourceTable];
            const targetHref = targetPageId
              ? buildTablesHref(targetPageId, log.sourceTable, undefined, 'docs', 'current')
              : null;
            const sections = buildLogSectionsStable(log);

            return (
              <details className="tables-log-card" key={log.id} name={accordionName}>
                <summary className="tables-log-summary">
                  <div className="tables-log-summary-main">
                    <span className="tables-log-badge">{getActionLabel(log)}</span>
                    <strong>{log.sourceTable}</strong>
                    <span className="tables-log-column">{log.sourceColumn}</span>
                  </div>
                  <div className="tables-log-summary-meta">
                    <span>{log.actorUsername}</span>
                    <span>{new Date(log.createdAt).toLocaleString('ko-KR')}</span>
                  </div>
                </summary>

                <div className="tables-log-body">
                  <div className="tables-log-body-head">
                    <div className="tables-log-compare-head">
                      <span>Before</span>
                      <span>After</span>
                    </div>

                    {targetHref ? (
                      <Link
                        aria-label="해당 테이블 페이지로 이동"
                        className="tables-log-jump"
                        href={targetHref}
                        scroll={false}
                      >
                        <ExternalPageIcon />
                      </Link>
                    ) : null}
                  </div>

                  <div className="tables-log-compare-grid">
                    <div className="tables-log-side">
                      {sections.map((section) => (
                        <div className="tables-log-value-card tables-log-value-card-before" key={`before-${log.id}-${section.label}`}>
                          <span className="tables-log-value-tag">{section.label}</span>
                          <div className="tables-log-value-copy">{section.before}</div>
                        </div>
                      ))}
                    </div>

                    <div className="tables-log-side">
                      {sections.map((section) => (
                        <div className="tables-log-value-card tables-log-value-card-after" key={`after-${log.id}-${section.label}`}>
                          <span className="tables-log-value-tag">{section.label}</span>
                          <div className="tables-log-value-copy">{section.after}</div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>
              </details>
            );
          })}
        </div>
      )}
    </div>
  );
}

function RemarksPanel({
  heading = '비고',
  remarks,
}: {
  heading?: string;
  remarks: ManualRemarkBlock[];
}) {
  return (
    <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
      <div className="tables-remarks-head">
        <p className="tables-section-label">비고</p>
        <h2 className="tables-section-title mt-2">{heading}</h2>
      </div>

      {remarks.length === 0 ? (
        <div className="tables-log-empty">등록된 비고가 없습니다.</div>
      ) : (
        <div className="tables-remarks-list">
          {remarks.map((remark) => {
            const maxColumns = Math.max(...remark.rows.map((row) => row.length), 1);
            const tableClassName =
              maxColumns >= 8
                ? 'manual-table manual-table-compact'
                : maxColumns >= 6
                  ? 'manual-table manual-table-dense'
                  : 'manual-table';
            const treatFirstRowAsHeader =
              remark.rows.length >= 2 && remark.rows[0].length >= 2 && remark.rows.slice(1).some((row) => row.length >= 2);

            return (
              <section className="manual-table-card tables-remark-card" key={remark.id}>
                <h3>{remark.title || '비고'}</h3>

                {maxColumns === 1 ? (
                  <div className="tables-remark-copy">
                    {remark.rows.map((row, index) => (
                      <p key={`${remark.id}-line-${index}`}>{row[0]}</p>
                    ))}
                  </div>
                ) : (
                  <div className="manual-table-scroll">
                    <table className={tableClassName}>
                      {treatFirstRowAsHeader ? (
                        <thead>
                          <tr>
                            {Array.from({ length: maxColumns }, (_, index) => (
                              <th key={`${remark.id}-header-${index}`}>{remark.rows[0][index] || `열 ${index + 1}`}</th>
                            ))}
                          </tr>
                        </thead>
                      ) : null}
                      <tbody>
                        {remark.rows.slice(treatFirstRowAsHeader ? 1 : 0).map((row, rowIndex) => (
                          <tr key={`${remark.id}-row-${rowIndex}`}>
                            {Array.from({ length: maxColumns }, (_, cellIndex) => (
                              <td key={`${remark.id}-cell-${rowIndex}-${cellIndex}`}>{row[cellIndex] || ' '}</td>
                            ))}
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </section>
            );
          })}
        </div>
      )}
    </section>
  );
}

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
  const session = await getServerSession(authOptions);
  const cookieStore = await cookies();
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

  const csvPages = await getCsvPages();
  const sidebarGroups = buildSidebarGroups(csvPages);
  const recentLogs = await listEditLogs({ limit: 30 });

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

  const page = resolvedParams.page ? csvPages.find((item) => item.pageId === resolvedParams.page) ?? null : null;
  const pageIdByTable = Object.fromEntries(
    csvPages.flatMap((csvPage) => csvPage.tables.map((table) => [table.tableId, csvPage.pageId]))
  );

  if (!page) {
    return <TablesHome csvPages={csvPages} recentLogs={recentLogs} sidebarGroups={sidebarGroups} />;
  }

  const currentTable = page.tables.find((table) => table.tableId === resolvedParams.tab) ?? page.tables[0];
  const section = resolvedParams.section === 'logs' ? 'logs' : 'docs';
  const logScope = resolvedParams.logScope === 'all' ? 'all' : 'current';
  const folderGroupByTable = Object.fromEntries(
    csvPages.flatMap((csvPage) => csvPage.tables.map((table) => [table.tableId, table.folderGroup]))
  );
  const tableOptions = csvPages.flatMap((csvPage) =>
    csvPage.tables.map((table) => ({
      tableId: table.tableId,
      columns: table.columns.map((column) => column.name),
    }))
  );
  const logs =
    section === 'logs'
      ? sortLogs(
          await listEditLogs({
            pageId: logScope === 'current' ? page.pageId : undefined,
            limit: 100,
          }),
          currentTable.tableId
        )
      : [];

  const sectionHref = (nextSection: SectionMode, nextScope: LogScope = logScope) =>
    buildTablesHref(page.pageId, currentTable.tableId, resolvedParams.view, nextSection, nextScope);

  return (
    <div className="min-h-screen bg-gray-50">
      <header className="border-b border-gray-200 bg-white">
        <div className="mx-auto max-w-7xl px-4 py-6 sm:px-6 lg:px-8">
          <h1 className="text-3xl font-bold text-gray-900">테이블</h1>
          <p className="mt-2 text-gray-600">CSV 기준으로 테이블 구조, 컬럼 설명, 연결 관계를 탐색합니다.</p>
        </div>
      </header>

      <div className="mx-auto flex max-w-7xl flex-col gap-8 px-4 py-8 sm:px-6 lg:flex-row lg:px-8">
        <aside className="w-full shrink-0 lg:w-72">
          <CsvSidebar currentPageId={page.pageId} groups={sidebarGroups} />
        </aside>

        <main className="min-w-0 flex-1 space-y-6">
          <GraphView
            currentTableId={currentTable.tableId}
            folderGroupByTable={folderGroupByTable}
            page={page}
            pageIdByTable={pageIdByTable}
          />

          <section className="rounded-lg border border-gray-200 bg-white p-6 shadow-sm">
            <div className="tables-section-head border-b border-gray-200 pb-5">
              <div className="tables-section-main">
                <p className="tables-section-label">컬럼 설명</p>
                <h2 className="tables-section-title mt-2">{page.csvName}</h2>

                {page.csvFiles.length > 1 ? (
                  <div className="mt-4 rounded-lg border border-gray-200 bg-gray-50 px-4 py-3 text-sm text-gray-600 tables-source-panel">
                    <p className="tables-muted-label">원본 CSV</p>
                    <ul className="space-y-1">
                      {page.csvFiles.map((file) => (
                        <li key={file}>{file.split('/').pop() ?? file}</li>
                      ))}
                    </ul>
                  </div>
                ) : null}
              </div>

              <div className="tables-header-side">
                <div className="tables-filter-tabs">
                  <Link className={section === 'docs' ? 'table-tab active' : 'table-tab'} href={sectionHref('docs')} scroll={false}>
                    컬럼 문서
                  </Link>
                  <Link className={section === 'logs' ? 'table-tab active' : 'table-tab'} href={sectionHref('logs')} scroll={false}>
                    수정 로그
                  </Link>
                </div>
              </div>
            </div>

            {section === 'logs' ? (
              <div className="mt-6">
                <LogsPanel
                  currentScope={logScope}
                  logs={logs}
                  pageIdByTable={pageIdByTable}
                  sectionHref={(scope) => sectionHref('logs', scope)}
                />
              </div>
            ) : (
              <>
                {page.tables.length > 1 ? (
                  <div className="mt-5 flex flex-wrap gap-2">
                    {page.tables.map((table) => (
                      <Link
                        key={table.tableId}
                        className={
                          table.tableId === currentTable.tableId
                            ? 'inline-flex items-center rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white'
                            : 'inline-flex items-center rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50'
                        }
                        href={buildTablesHref(page.pageId, table.tableId, resolvedParams.view, 'docs', logScope)}
                        scroll={false}
                      >
                        {table.tableId}
                      </Link>
                    ))}
                  </div>
                ) : null}

                <div className="mt-6">
                  <table className="tables-columns-table min-w-full table-fixed text-sm">
                    <thead>
                      <tr className="border-b border-gray-200 text-left text-xs uppercase tracking-[0.12em] text-gray-500">
                        <th className="w-[18%] px-3 py-3">컬럼</th>
                        <th className="w-[14%] px-3 py-3">타입</th>
                        <th className="w-[48%] px-3 py-3">설명</th>
                        <th className="w-[20%] px-3 py-3">참조</th>
                      </tr>
                    </thead>
                    <tbody>
                      {currentTable.columns.map((column) => {
                        const href = column.relation
                          ? buildTableHref(pageIdByTable, column.relation.targetTable, column.relation.targetColumn)
                          : null;
                        const nameClassName = column.isKey
                          ? 'text-red-600'
                          : column.isComment
                            ? 'text-gray-400'
                            : 'text-gray-900';

                        return (
                          <tr
                            className={`border-b border-gray-100 align-top${column.isComment ? ' bg-gray-50/40' : ''}`}
                            id={`column-${currentTable.tableId}-${column.name}`}
                            key={column.name}
                          >
                            <td className="px-3 py-4">
                              <div className="flex flex-wrap items-start gap-2">
                                <strong className={`column-name-text tables-column-cell ${nameClassName}`}>{renderColumnName(column.name)}</strong>
                                {column.isKey ? (
                                  <span className="rounded-full border border-red-200 bg-red-50 px-2 py-0.5 text-xs text-red-700">키</span>
                                ) : null}
                                {column.isComment ? (
                                  <span className="rounded-full border border-gray-200 bg-white px-2 py-0.5 text-xs text-gray-500">주석</span>
                                ) : null}
                              </div>
                            </td>
                            <td className="px-3 py-4 text-gray-700">{column.dataType}</td>
                            <td className="px-3 py-4 text-gray-700">
                              <div className="tables-description-cell">
                                <div className="tables-description-copy">
                                  <span className="whitespace-pre-wrap">{column.description || '설명 없음'}</span>
                                  {column.note ? <span className="whitespace-pre-wrap text-sm text-gray-500">{column.note}</span> : null}
                                </div>

                                <ColumnMetaEditor
                                  currentDescription={column.description}
                                  currentManualTables={column.manualTables}
                                  currentNote={column.note}
                                  sourceColumn={column.name}
                                  sourceTable={currentTable.tableId}
                                />
                              </div>

                              {column.manualTables.length > 0 ? (
                                <div className="mt-3">
                                  <ManualTableModal columnName={column.name} tables={column.manualTables} />
                                </div>
                              ) : null}
                            </td>
                            <td className="px-3 py-4">
                              <div className="tables-reference-cell flex min-h-16 flex-col items-start gap-2">
                                {column.relation && href ? (
                                  <Link className="tables-reference-link font-semibold text-blue-600 hover:underline" href={href}>
                                    <span>{column.relation.targetTable}</span>{' '}
                                    <span className="font-normal text-blue-800">({column.relation.targetColumn})</span>
                                  </Link>
                                ) : (
                                  <span className="text-gray-500">참조 없음</span>
                                )}

                                <RelationEditor
                                  currentRelation={column.relation}
                                  sourceColumn={column.name}
                                  sourceTable={currentTable.tableId}
                                  tableOptions={tableOptions}
                                />
                              </div>
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </>
            )}
          </section>

          <RemarksPanel heading={currentTable.tableId} remarks={currentTable.manualRemarks ?? []} />
        </main>
      </div>
    </div>
  );
}
