'use client';

import Link from 'next/link';
import { useSearchParams, useRouter } from 'next/navigation';
import { useState, useEffect, useCallback, useMemo, useRef, Suspense, type ReactNode } from 'react';
import { CsvSidebar } from '@/components/tables/csv-sidebar';
import { ColumnMetaEditor } from '@/components/tables/column-meta-editor';
import { GraphView } from '@/components/tables/graph-view';
import { ManualTableModal } from '@/components/tables/manual-table-modal';
import { RelationEditor } from '@/components/tables/relation-editor';
import type {
  CsvPage,
  LightweightCsvPage,
  ManualRemarkBlock,
  RelationEdge,
  TableEditLog,
  TableIndex,
} from '@/lib/tables/types';

/* ------------------------------------------------------------------ */
/*  Types                                                             */
/* ------------------------------------------------------------------ */

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

export type SidebarGroup = {
  group: string;
  pages: { pageId: string; csvName: string; tableCount: number }[];
};

export type TableOption = {
  tableId: string;
  columns: string[];
};

export type TableWorkspaceProps = {
  csvPages: LightweightCsvPage[];
  sidebarGroups: SidebarGroup[];
  initialLogs: TableEditLog[];
  pageIdByTable: Record<string, string>;
  folderGroupByTable: Record<string, string>;
};

/* ------------------------------------------------------------------ */
/*  Lazy-loaded full page data                                        */
/* ------------------------------------------------------------------ */

type FullPageData = {
  tables: TableIndex[];
  tableOptions: TableOption[];
};

type FetchState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'loaded'; data: FullPageData }
  | { status: 'error'; message: string };

async function fetchFullPageData(
  page: LightweightCsvPage
): Promise<FullPageData> {
  const tables: TableIndex[] = [];

  // Fetch all tables for this page in parallel
  const results = await Promise.all(
    page.tables.map(async (entry) => {
      const res = await fetch(`/api/v1/tables/${entry.tableId}`, {
        credentials: 'same-origin',
      });
      if (!res.ok) return null;
      const json = await res.json();
      return json.data?.table as TableIndex | null;
    })
  );

  for (const table of results) {
    if (table) tables.push(table);
  }

  const tableOptions = tables.map((table) => ({
    tableId: table.tableId,
    columns: table.columns.map((column) => column.name),
  }));

  return { tables, tableOptions };
}

/* ------------------------------------------------------------------ */
/*  Helper functions                                                  */
/* ------------------------------------------------------------------ */

function buildTableHref(
  pageIdByTable: Record<string, string>,
  tableId: string,
  columnName?: string
) {
  const pageId = pageIdByTable[tableId];
  if (!pageId) return '/tables';
  const params = new URLSearchParams({ page: pageId, tab: tableId });
  const hash = columnName ? `#column-${tableId}-${columnName}` : '';
  return `/tables?${params.toString()}${hash}`;
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

/* ------------------------------------------------------------------ */
/*  Sub-components                                                    */
/* ------------------------------------------------------------------ */

function buildTablesHref(
  pageId: string,
  currentTableId: string,
  view: string | null,
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

function LogsPanel({
  heading = '최근 변경 이력',
  label = '수정 로그',
  logs,
  pageIdByTable,
  sectionHref,
  currentScope,
  showScopeTabs = true,
  accordionName = 'tables-log-accordion',
  onScopeChange,
}: {
  heading?: string;
  label?: string;
  logs: TableEditLog[];
  pageIdByTable: Record<string, string>;
  sectionHref?: (scope: LogScope) => string;
  currentScope?: LogScope;
  showScopeTabs?: boolean;
  accordionName?: string;
  onScopeChange?: (scope: LogScope) => void;
}) {
  return (
    <div className="tables-log-panel">
      <div className="tables-log-toolbar tables-section-head">
        <div>
          <p className="tables-section-label">{label}</p>
          <h2 className="tables-section-title mt-2">{heading}</h2>
        </div>

        {showScopeTabs && currentScope ? (
          <div className="tables-filter-tabs">
            {onScopeChange ? (
              <>
                <button
                  className={currentScope === 'current' ? 'table-tab active' : 'table-tab'}
                  onClick={() => onScopeChange('current')}
                  type="button"
                >
                  현재 CSV
                </button>
                <button
                  className={currentScope === 'all' ? 'table-tab active' : 'table-tab'}
                  onClick={() => onScopeChange('all')}
                  type="button"
                >
                  전체
                </button>
              </>
            ) : sectionHref ? (
              <>
                <Link className={currentScope === 'current' ? 'table-tab active' : 'table-tab'} href={sectionHref('current')} scroll={false}>
                  현재 CSV
                </Link>
                <Link className={currentScope === 'all' ? 'table-tab active' : 'table-tab'} href={sectionHref('all')} scroll={false}>
                  전체
                </Link>
              </>
            ) : null}
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
              ? buildTablesHref(targetPageId, log.sourceTable, null, 'docs', 'current')
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

/* ------------------------------------------------------------------ */
/*  TablesHome — shown when no page is selected                       */
/* ------------------------------------------------------------------ */

function TablesHome({
  csvPages,
  recentLogs,
  sidebarGroups,
  pageIdByTable,
  onPageSelect,
}: {
  csvPages: LightweightCsvPage[];
  recentLogs: TableEditLog[];
  sidebarGroups: SidebarGroup[];
  pageIdByTable: Record<string, string>;
  onPageSelect: (pageId: string) => void;
}) {
  const tableCount = csvPages.reduce((sum, csvPage) => sum + csvPage.tables.length, 0);

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
          <CsvSidebar groups={sidebarGroups} onPageSelect={onPageSelect} />
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

/* ------------------------------------------------------------------ */
/*  PageDetail — shown when a page is selected (lazy-loads full data) */
/* ------------------------------------------------------------------ */

function PageDetail({
  page,
  csvPages,
  sidebarGroups,
  pageIdByTable,
  folderGroupByTable,
  initialLogs,
  onPageSelect,
}: {
  page: LightweightCsvPage;
  csvPages: LightweightCsvPage[];
  sidebarGroups: SidebarGroup[];
  pageIdByTable: Record<string, string>;
  folderGroupByTable: Record<string, string>;
  initialLogs: TableEditLog[];
  onPageSelect: (pageId: string) => void;
}) {
  const searchParams = useSearchParams();
  const router = useRouter();
  const fullPageCache = useRef<Map<string, FullPageData>>(new Map());

  const currentTabId = searchParams.get('tab');
  const currentView = searchParams.get('view');
  const currentSection: SectionMode = searchParams.get('section') === 'logs' ? 'logs' : 'docs';
  const currentLogScope: LogScope = searchParams.get('logScope') === 'all' ? 'all' : 'current';

  // Lazy-load full page data
  const [fetchState, setFetchState] = useState<FetchState>(() => {
    const cached = fullPageCache.current.get(page.pageId);
    return cached ? { status: 'loaded', data: cached } : { status: 'idle' };
  });

  useEffect(() => {
    const cached = fullPageCache.current.get(page.pageId);
    if (cached) {
      setFetchState({ status: 'loaded', data: cached });
      return;
    }

    let cancelled = false;
    setFetchState({ status: 'loading' });

    fetchFullPageData(page)
      .then((data) => {
        if (cancelled) return;
        fullPageCache.current.set(page.pageId, data);
        setFetchState({ status: 'loaded', data });
      })
      .catch((err) => {
        if (cancelled) return;
        setFetchState({ status: 'error', message: String(err) });
      });

    return () => {
      cancelled = true;
    };
  }, [page]);

  // Build a CsvPage-compatible object when full data is loaded
  const fullPage: CsvPage | null = useMemo(() => {
    if (fetchState.status !== 'loaded') return null;
    return {
      pageId: page.pageId,
      displayName: page.displayName,
      csvName: page.csvName,
      csvPath: page.csvPath,
      csvFiles: page.csvFiles,
      folderName: page.folderName,
      folderGroup: page.folderGroup,
      manualWorkbook: page.manualWorkbook,
      tables: fetchState.data.tables,
    };
  }, [page, fetchState]);

  const currentTable: TableIndex | null = useMemo(() => {
    if (!fullPage) return null;
    return fullPage.tables.find((t) => t.tableId === currentTabId) ?? fullPage.tables[0] ?? null;
  }, [fullPage, currentTabId]);

  const tableOptions = fetchState.status === 'loaded' ? fetchState.data.tableOptions : [];

  // Logs state: fetched on demand when section=logs
  const [logs, setLogs] = useState<TableEditLog[]>([]);
  const [logsLoading, setLogsLoading] = useState(false);
  const [logsFetchKey, setLogsFetchKey] = useState('');

  useEffect(() => {
    if (currentSection !== 'logs') {
      return;
    }
    const currentTableId = currentTable?.tableId ?? page.tables[0]?.tableId ?? '';
    const fetchKey = `${page.pageId}:${currentLogScope}`;
    if (fetchKey === logsFetchKey) return;

    let cancelled = false;
    setLogsLoading(true);

    const params = new URLSearchParams({ limit: '100' });
    if (currentLogScope === 'current') {
      params.set('pageId', page.pageId);
    }

    fetch(`/api/v1/tables/edit-logs?${params.toString()}`, {
        credentials: 'same-origin',
      })
      .then((res) => {
        if (!res.ok) throw new Error(`edit-logs fetch failed: ${res.status}`);
        return res.json();
      })
      .then((json) => {
        if (cancelled) return;
        const { data } = json as { ok: boolean; data: TableEditLog[] };
        const fetched: TableEditLog[] = data ?? [];
        setLogs(sortLogs(fetched, currentTableId));
        setLogsFetchKey(fetchKey);
      })
      .catch(() => {
        if (!cancelled) setLogs([]);
      })
      .finally(() => {
        if (!cancelled) setLogsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [currentSection, currentLogScope, page.pageId, currentTable?.tableId, page.tables, logsFetchKey]);

  // Client-side URL update helpers
  const updateParams = useCallback(
    (updates: Record<string, string | null>) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(updates)) {
        if (value === null) {
          params.delete(key);
        } else {
          params.set(key, value);
        }
      }
      router.replace(`/tables?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  const handleSectionChange = useCallback(
    (section: SectionMode) => {
      const updates: Record<string, string | null> = { section };
      if (section !== 'logs') {
        updates.logScope = null;
      }
      updateParams(updates);
    },
    [updateParams]
  );

  const handleScopeChange = useCallback(
    (scope: LogScope) => {
      updateParams({ logScope: scope });
      setLogsFetchKey('');
    },
    [updateParams]
  );

  const handleTabChange = useCallback(
    (tableId: string) => {
      updateParams({ tab: tableId });
    },
    [updateParams]
  );

  // Loading / error states
  const isLoading = fetchState.status === 'idle' || fetchState.status === 'loading';
  const isError = fetchState.status === 'error';

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
          <CsvSidebar currentPageId={page.pageId} groups={sidebarGroups} onPageSelect={onPageSelect} />
        </aside>

        <main className="min-w-0 flex-1 space-y-6">
          {isLoading ? (
            <div className="rounded-lg border border-gray-200 bg-white p-12 text-center text-gray-500 shadow-sm">
              테이블 데이터를 불러오는 중...
            </div>
          ) : isError ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-12 text-center text-red-600 shadow-sm">
              테이블 데이터를 불러오지 못했습니다.
            </div>
          ) : fullPage && currentTable ? (
            <>
              <GraphView
                currentTableId={currentTable.tableId}
                folderGroupByTable={folderGroupByTable}
                page={fullPage}
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
                      <button
                        className={currentSection === 'docs' ? 'table-tab active' : 'table-tab'}
                        onClick={() => handleSectionChange('docs')}
                        type="button"
                      >
                        컬럼 문서
                      </button>
                      <button
                        className={currentSection === 'logs' ? 'table-tab active' : 'table-tab'}
                        onClick={() => handleSectionChange('logs')}
                        type="button"
                      >
                        수정 로그
                      </button>
                    </div>
                  </div>
                </div>

                {currentSection === 'logs' ? (
                  <div className="mt-6">
                    {logsLoading ? (
                      <div className="tables-log-empty">로그를 불러오는 중...</div>
                    ) : (
                      <LogsPanel
                        currentScope={currentLogScope}
                        logs={logs}
                        onScopeChange={handleScopeChange}
                        pageIdByTable={pageIdByTable}
                      />
                    )}
                  </div>
                ) : (
                  <>
                    {fullPage.tables.length > 1 ? (
                      <div className="mt-5 flex flex-wrap gap-2">
                        {fullPage.tables.map((table) => (
                          <button
                            key={table.tableId}
                            className={
                              table.tableId === currentTable.tableId
                                ? 'inline-flex items-center rounded-full bg-blue-600 px-4 py-2 text-sm font-medium text-white'
                                : 'inline-flex items-center rounded-full border border-gray-300 bg-white px-4 py-2 text-sm font-medium text-gray-700 hover:bg-gray-50'
                            }
                            onClick={() => handleTabChange(table.tableId)}
                            type="button"
                          >
                            {table.tableId}
                          </button>
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
            </>
          ) : null}
        </main>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/*  Inner workspace (reads searchParams)                              */
/* ------------------------------------------------------------------ */

function TableWorkspaceInner({
  csvPages,
  sidebarGroups,
  initialLogs,
  pageIdByTable,
  folderGroupByTable,
}: TableWorkspaceProps) {
  const searchParams = useSearchParams();
  const router = useRouter();

  const currentPageId = searchParams.get('page');

  const page = useMemo(
    () => (currentPageId ? csvPages.find((p) => p.pageId === currentPageId) ?? null : null),
    [csvPages, currentPageId]
  );

  const handlePageSelect = useCallback(
    (pageId: string) => {
      const params = new URLSearchParams(searchParams.toString());
      params.set('page', pageId);
      params.delete('tab');
      params.delete('section');
      params.delete('logScope');
      router.replace(`/tables?${params.toString()}`, { scroll: false });
    },
    [router, searchParams]
  );

  if (!page) {
    return (
      <TablesHome
        csvPages={csvPages}
        onPageSelect={handlePageSelect}
        pageIdByTable={pageIdByTable}
        recentLogs={initialLogs}
        sidebarGroups={sidebarGroups}
      />
    );
  }

  return (
    <PageDetail
      csvPages={csvPages}
      folderGroupByTable={folderGroupByTable}
      initialLogs={initialLogs}
      onPageSelect={handlePageSelect}
      page={page}
      pageIdByTable={pageIdByTable}
      sidebarGroups={sidebarGroups}
    />
  );
}

/* ------------------------------------------------------------------ */
/*  Exported wrapper (Suspense boundary for useSearchParams)          */
/* ------------------------------------------------------------------ */

export function TableWorkspace(props: TableWorkspaceProps) {
  return (
    <Suspense
      fallback={
        <div className="min-h-screen bg-gray-50 flex items-center justify-center">
          <p className="text-gray-500">로딩 중...</p>
        </div>
      }
    >
      <TableWorkspaceInner {...props} />
    </Suspense>
  );
}
