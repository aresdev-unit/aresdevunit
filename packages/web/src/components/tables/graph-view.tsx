'use client';

import Link from 'next/link';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { useEffect, useMemo, useRef, useState } from 'react';
import type { CsvPage, RelationEdge } from '@/lib/tables/types';

type GraphViewProps = {
  currentTableId: string;
  page: CsvPage;
  pageIdByTable: Record<string, string>;
  folderGroupByTable: Record<string, string>;
};

type TabMode = 'summary' | 'graph';
type SummarySide = 'outbound' | 'inbound';

type MappingPair = {
  referencedColumn: string;
  referencingColumn: string;
  currentSide: 'left' | 'right';
};

type SummaryItem = {
  tableId: string;
  href: string;
  mappings: MappingPair[];
};

type SummaryGroup = {
  key: string;
  folderGroup: string;
  sameFolder: boolean;
  items: SummaryItem[];
};

type GraphNode = {
  tableId: string;
  href: string;
  folderGroup: string;
  summary: string;
  summaryColumns: string[];
  connections: string[];
};

type Rect = {
  left: number;
  top: number;
  width: number;
  height: number;
};

type GraphPath = {
  key: string;
  d: string;
  sourceTableId: string;
  targetTableId: string;
  color: 'left' | 'right';
};

const MODE_KEY = 'datatable-explorer.relation-mode';
const PANEL_HEIGHT_KEY = 'datatable-explorer.relation-panel-height';
const PANEL_DEFAULT_HEIGHT = 375;
const PANEL_MIN_HEIGHT = 320;
const PANEL_MAX_HEIGHT = 980;

function compareTableIds(left: string, right: string) {
  if (left === right) return 0;
  if (right.startsWith(`${left}_`) || right.startsWith(`${left}.`)) return -1;
  if (left.startsWith(`${right}_`) || left.startsWith(`${right}.`)) return 1;
  return left.localeCompare(right, 'ko');
}

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

function summarizeColumns(columns: string[]) {
  const unique = [...new Set(columns.filter(Boolean))];
  if (unique.length === 0) return '';
  if (unique.length === 1) return unique[0];
  return `${unique[0]} 외 ${unique.length - 1}개`;
}

function getTableTitleSize(name: string, center = false) {
  const length = name.length;
  if (center) {
    if (length > 28) return '1.02rem';
    if (length > 22) return '1.12rem';
    if (length > 16) return '1.22rem';
    return '1.34rem';
  }
  if (length > 30) return '0.74rem';
  if (length > 24) return '0.8rem';
  if (length > 18) return '0.88rem';
  return '0.98rem';
}

function clamp(value: number, min: number, max: number) {
  return Math.max(min, Math.min(max, value));
}

function appendViewParam(href: string, mode: TabMode) {
  try {
    const url = new URL(href, 'http://local.test');
    url.searchParams.set('view', mode);
    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return href;
  }
}

function getTableHref(pageIdByTable: Record<string, string>, tableId: string) {
  const pageId = pageIdByTable[tableId];
  if (!pageId) return '/tables';
  const params = new URLSearchParams({ page: pageId, tab: tableId });
  return `/tables?${params.toString()}`;
}

function buildSummaryGroups(
  relations: RelationEdge[],
  side: SummarySide,
  currentFolderGroup: string,
  folderGroupByTable: Record<string, string>,
  pageIdByTable: Record<string, string>,
  mode: TabMode
) {
  const byTable = new Map<string, SummaryItem>();

  for (const relation of relations) {
    const otherTable = side === 'outbound' ? relation.targetTable : relation.sourceTable;
    const item =
      byTable.get(otherTable) ?? {
        tableId: otherTable,
        href: appendViewParam(getTableHref(pageIdByTable, otherTable), mode),
        mappings: [],
      };

    const pair: MappingPair = {
      referencedColumn: relation.targetColumn,
      referencingColumn: relation.sourceColumn,
      currentSide: side === 'outbound' ? 'right' : 'left',
    };

    if (
      !item.mappings.some(
        (mapping) =>
          mapping.referencedColumn === pair.referencedColumn &&
          mapping.referencingColumn === pair.referencingColumn &&
          mapping.currentSide === pair.currentSide
      )
    ) {
      item.mappings.push(pair);
    }

    byTable.set(otherTable, item);
  }

  const grouped = new Map<string, SummaryItem[]>();
  for (const item of byTable.values()) {
    const folderGroup = folderGroupByTable[item.tableId] ?? '기타';
    const list = grouped.get(folderGroup) ?? [];
    list.push(item);
    grouped.set(folderGroup, list);
  }

  return [...grouped.entries()]
    .map(([folderGroup, items]) => ({
      key: `${side}-${folderGroup}`,
      folderGroup,
      sameFolder: folderGroup === currentFolderGroup,
      items: items.sort((left, right) => compareTableIds(left.tableId, right.tableId)),
    }))
    .sort((left, right) => {
      if (left.sameFolder !== right.sameFolder) return left.sameFolder ? -1 : 1;
      return left.folderGroup.localeCompare(right.folderGroup, 'ko');
    });
}

function buildExternalNodes(
  page: CsvPage,
  side: 'left' | 'right',
  folderGroupByTable: Record<string, string>,
  pageIdByTable: Record<string, string>,
  mode: TabMode
) {
  const pageTableIds = new Set(page.tables.map((table) => table.tableId));
  const centerOrder = new Map(page.tables.map((table, index) => [table.tableId, index]));
  const byTable = new Map<string, GraphNode>();

  for (const table of page.tables) {
    const relations = side === 'left' ? table.outboundRelations : table.inboundRelations;

    for (const relation of relations) {
      const otherTable = side === 'left' ? relation.targetTable : relation.sourceTable;
      if (pageTableIds.has(otherTable)) continue;

      const item =
        byTable.get(otherTable) ?? {
          tableId: otherTable,
          href: appendViewParam(getTableHref(pageIdByTable, otherTable), mode),
          folderGroup: folderGroupByTable[otherTable] ?? '',
          summary: '',
          summaryColumns: [],
          connections: [],
        };

      const connectedCenter = side === 'left' ? relation.sourceTable : relation.targetTable;
      if (!item.connections.includes(connectedCenter)) {
        item.connections.push(connectedCenter);
      }

      const summaryColumn = side === 'left' ? relation.targetColumn : relation.sourceColumn;
      if (summaryColumn && !item.summaryColumns.includes(summaryColumn)) {
        item.summaryColumns.push(summaryColumn);
        item.summary = summarizeColumns(item.summaryColumns);
      }

      byTable.set(otherTable, item);
    }
  }

  return [...byTable.values()].sort((left, right) => {
    const leftGroupOrder = Math.min(
      ...left.connections.map((tableId) => centerOrder.get(tableId) ?? Number.MAX_SAFE_INTEGER)
    );
    const rightGroupOrder = Math.min(
      ...right.connections.map((tableId) => centerOrder.get(tableId) ?? Number.MAX_SAFE_INTEGER)
    );
    if (leftGroupOrder !== rightGroupOrder) {
      return leftGroupOrder - rightGroupOrder;
    }

    const folderCompare = compareFolderGroups(left.folderGroup, right.folderGroup);
    if (folderCompare !== 0) {
      return folderCompare;
    }

    return compareTableIds(left.tableId, right.tableId);
  });
}

function buildCenterSummary(table: CsvPage['tables'][number]) {
  return summarizeColumns([
    ...table.outboundRelations.map((relation) => relation.sourceColumn),
    ...table.inboundRelations.map((relation) => relation.targetColumn),
  ]);
}

function buildCurve(from: Rect, to: Rect, direction: 'left' | 'right') {
  const fromX = direction === 'left' ? from.left + from.width : from.left + from.width;
  const toX = direction === 'left' ? to.left : to.left;
  const fromY = from.top + from.height / 2;
  const toY = to.top + to.height / 2;
  const distance = Math.abs(toX - fromX);
  const curve = clamp(distance * 0.32, 28, 72);
  const c1x = fromX + curve;
  const c2x = toX - curve;
  return `M ${fromX} ${fromY} C ${c1x} ${fromY}, ${c2x} ${toY}, ${toX} ${toY}`;
}

function graphNodeKey(side: 'left' | 'center' | 'right', tableId: string) {
  return `${side}:${tableId}`;
}

function ChevronIcon({ collapsed }: { collapsed: boolean }) {
  return (
    <svg aria-hidden="true" className="rv2-chevron-icon" viewBox="0 0 12 12">
      <path
        d={collapsed ? 'M2 4.25 6 8l4-3.75' : 'M2 7.75 6 4l4 3.75'}
        fill="none"
        stroke="currentColor"
        strokeLinecap="round"
        strokeLinejoin="round"
        strokeWidth="1.8"
      />
    </svg>
  );
}

function isPathActive(path: GraphPath, hoveredTableId: string | null) {
  if (!hoveredTableId) return true;
  return path.sourceTableId === hoveredTableId || path.targetTableId === hoveredTableId;
}

function usePersistentPanelHeight() {
  const [panelHeight, setPanelHeight] = useState(PANEL_DEFAULT_HEIGHT);
  const dragStateRef = useRef<{ startY: number; startHeight: number } | null>(null);

  useEffect(() => {
    try {
      const saved = Number(window.localStorage.getItem(PANEL_HEIGHT_KEY) ?? '');
      if (Number.isFinite(saved)) {
        setPanelHeight(clamp(saved, PANEL_MIN_HEIGHT, PANEL_MAX_HEIGHT));
      }
    } catch {
      // ignore
    }
  }, []);

  useEffect(() => {
    try {
      window.localStorage.setItem(PANEL_HEIGHT_KEY, String(panelHeight));
    } catch {
      // ignore
    }
  }, [panelHeight]);

  useEffect(() => {
    const onMove = (event: MouseEvent) => {
      const dragState = dragStateRef.current;
      if (!dragState) return;
      const nextHeight = dragState.startHeight + (event.clientY - dragState.startY);
      setPanelHeight(clamp(nextHeight, PANEL_MIN_HEIGHT, PANEL_MAX_HEIGHT));
    };

    const onUp = () => {
      dragStateRef.current = null;
      document.body.style.userSelect = '';
      document.body.style.cursor = '';
    };

    window.addEventListener('mousemove', onMove);
    window.addEventListener('mouseup', onUp);
    return () => {
      window.removeEventListener('mousemove', onMove);
      window.removeEventListener('mouseup', onUp);
    };
  }, []);

  const startResize = (event: React.MouseEvent<HTMLDivElement>) => {
    dragStateRef.current = {
      startY: event.clientY,
      startHeight: panelHeight,
    };
    document.body.style.userSelect = 'none';
    document.body.style.cursor = 'ns-resize';
  };

  return { panelHeight, startResize };
}

function SummaryTab({
  mode,
  currentTableId,
  page,
  folderGroupByTable,
  pageIdByTable,
}: {
  mode: TabMode;
  currentTableId: string;
  page: CsvPage;
  folderGroupByTable: Record<string, string>;
  pageIdByTable: Record<string, string>;
}) {
  const currentTable = page.tables.find((table) => table.tableId === currentTableId) ?? page.tables[0];
  const outboundGroups = useMemo(
    () =>
      buildSummaryGroups(currentTable.outboundRelations, 'outbound', page.folderGroup, folderGroupByTable, pageIdByTable, mode),
    [currentTable, page.folderGroup, folderGroupByTable, pageIdByTable, mode]
  );
  const inboundGroups = useMemo(
    () =>
      buildSummaryGroups(currentTable.inboundRelations, 'inbound', page.folderGroup, folderGroupByTable, pageIdByTable, mode),
    [currentTable, page.folderGroup, folderGroupByTable, pageIdByTable, mode]
  );

  const [collapsedByGroup, setCollapsedByGroup] = useState<Record<string, boolean>>({});

  useEffect(() => {
    setCollapsedByGroup({});
  }, [currentTableId]);

  const toggleGroup = (key: string) => {
    setCollapsedByGroup((current) => ({ ...current, [key]: !current[key] }));
  };

  const toggleAll = (groups: SummaryGroup[]) => {
    const keys = groups.map((group) => group.key);
    const allCollapsed = keys.every((key) => collapsedByGroup[key]);
    setCollapsedByGroup((current) => {
      const next = { ...current };
      for (const key of keys) {
        next[key] = !allCollapsed;
      }
      return next;
    });
  };

  const renderPanel = (title: string, groups: SummaryGroup[]) => {
    const allCollapsed = groups.length > 0 && groups.every((group) => collapsedByGroup[group.key]);

    return (
      <section className="rv2-summary-panel">
        <div className="rv2-summary-head">
          <h3>{title}</h3>
          <button className="rv2-summary-toggle" onClick={() => toggleAll(groups)} type="button">
            {allCollapsed ? '모든 폴더 펼치기' : '모든 폴더 접기'}
          </button>
        </div>

        <div className="rv2-summary-body">
          {groups.length === 0 ? (
            <div className="rv2-summary-empty">연결된 테이블이 없습니다.</div>
          ) : (
            groups.map((group) => (
              <div className="rv2-summary-group" key={group.key}>
                <div className="rv2-summary-group-head">
                  <div className="rv2-summary-group-label">
                    <strong>{group.folderGroup}</strong>
                    {group.sameFolder ? <span className="rv2-summary-same-folder">같은 폴더</span> : null}
                  </div>
                  <button className="rv2-summary-group-toggle" onClick={() => toggleGroup(group.key)} type="button">
                    <ChevronIcon collapsed={!!collapsedByGroup[group.key]} />
                  </button>
                </div>

                {!collapsedByGroup[group.key] ? (
                  <div className="rv2-summary-group-cards">
                    {group.items.map((item) => (
                      <Link className="rv2-summary-card" href={item.href} key={item.tableId}>
                        <strong>{item.tableId}</strong>
                        <div className="rv2-summary-mappings">
                          {item.mappings.map((mapping, index) => (
                            <div
                              className="rv2-summary-mapping"
                              key={`${item.tableId}-${mapping.referencedColumn}-${mapping.referencingColumn}-${index}`}
                            >
                              <span className={mapping.currentSide === 'left' ? 'current' : ''}>
                                {mapping.referencedColumn}
                              </span>
                              <span className="arrow">→</span>
                              <span className={mapping.currentSide === 'right' ? 'current' : ''}>
                                {mapping.referencingColumn}
                              </span>
                            </div>
                          ))}
                        </div>
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            ))
          )}
        </div>
      </section>
    );
  };

  return (
    <div className="rv2-summary-grid">
      {renderPanel('참조 대상 테이블', outboundGroups)}
      {renderPanel('참조 주체 테이블', inboundGroups)}
    </div>
  );
}

function GraphTab({
  mode,
  currentTableId,
  page,
  pageIdByTable,
  leftNodes,
  rightNodes,
}: {
  mode: TabMode;
  currentTableId: string;
  page: CsvPage;
  pageIdByTable: Record<string, string>;
  leftNodes: GraphNode[];
  rightNodes: GraphNode[];
}) {
  const shellRef = useRef<HTMLDivElement | null>(null);
  const stageRef = useRef<HTMLDivElement | null>(null);
  const cardRefs = useRef<Record<string, HTMLAnchorElement | null>>({});
  const [rects, setRects] = useState<Record<string, Rect>>({});
  const [hoveredTableId, setHoveredTableId] = useState<string | null>(null);
  const centerTables = useMemo(
    () =>
      page.tables.map((table) => ({
        tableId: table.tableId,
        href: appendViewParam(getTableHref(pageIdByTable, table.tableId), mode),
        summary: buildCenterSummary(table),
        selected: table.tableId === currentTableId,
      })),
    [page, pageIdByTable, mode, currentTableId]
  );

  useEffect(() => {
    const measure = () => {
      const stage = stageRef.current;
      if (!stage) return;
      const stageRect = stage.getBoundingClientRect();
      const nextRects: Record<string, Rect> = {};
      for (const [tableId, element] of Object.entries(cardRefs.current)) {
        if (!element) continue;
        const rect = element.getBoundingClientRect();
        nextRects[tableId] = {
          left: rect.left - stageRect.left,
          top: rect.top - stageRect.top,
          width: rect.width,
          height: rect.height,
        };
      }
      setRects(nextRects);
    };

    measure();
    const observer = new ResizeObserver(measure);
    if (stageRef.current) observer.observe(stageRef.current);
    const frame = requestAnimationFrame(measure);
    return () => {
      cancelAnimationFrame(frame);
      observer.disconnect();
    };
  }, [currentTableId, centerTables, leftNodes, rightNodes]);

  useEffect(() => {
    const shell = shellRef.current;
    const stage = stageRef.current;
    if (!shell || !stage) return;
    const centerRects = centerTables.map((table) => rects[table.tableId]).filter(Boolean);
    if (centerRects.length === 0) return;
    const top = Math.min(...centerRects.map((rect) => rect.top));
    const bottom = Math.max(...centerRects.map((rect) => rect.top + rect.height));
    shell.scrollTop = Math.max(0, (top + bottom) / 2 - shell.clientHeight / 2);
  }, [currentTableId, centerTables, rects]);

  const paths = useMemo<GraphPath[]>(() => {
    const centerById = new Map(
      centerTables.map((table) => [table.tableId, rects[graphNodeKey('center', table.tableId)]])
    );

    const leftPaths = leftNodes.flatMap((node) =>
      node.connections.flatMap((centerTableId) => {
        const from = rects[graphNodeKey('left', node.tableId)];
        const to = centerById.get(centerTableId);
        if (!from || !to) return [];
        return [
          {
            key: `left-${node.tableId}-${centerTableId}`,
            d: buildCurve(from, to, 'left'),
            sourceTableId: centerTableId,
            targetTableId: node.tableId,
            color: 'left' as const,
          },
        ];
      })
    );

    const rightPaths = rightNodes.flatMap((node) =>
      node.connections.flatMap((centerTableId) => {
        const from = centerById.get(centerTableId);
        const to = rects[graphNodeKey('right', node.tableId)];
        if (!from || !to) return [];
        return [
          {
            key: `right-${centerTableId}-${node.tableId}`,
            d: buildCurve(from, to, 'right'),
            sourceTableId: centerTableId,
            targetTableId: node.tableId,
            color: 'right' as const,
          },
        ];
      })
    );

    return [...leftPaths, ...rightPaths];
  }, [centerTables, leftNodes, rects, rightNodes]);

  const isTableActive = (tableId: string) => {
    if (!hoveredTableId) return true;
    if (tableId === hoveredTableId) return true;
    return paths.some(
      (path) =>
        isPathActive(path, hoveredTableId) &&
        (path.sourceTableId === tableId || path.targetTableId === tableId)
    );
  };

  return (
    <div className="rv3-graph-shell" ref={shellRef}>
      <div className="rv3-graph-stage" ref={stageRef}>
        <svg className="rv3-graph-svg">
          {paths.map((path) => (
            <path
              className={`rv3-graph-path rv3-graph-path-${path.color}${isPathActive(path, hoveredTableId) ? '' : ' dimmed'}`}
              d={path.d}
              key={path.key}
            />
          ))}
        </svg>

        <div className="rv3-graph-layout">
          <div className="rv3-graph-column rv3-graph-column-left">
            {leftNodes.map((node) => (
              <Link
                className={`rv3-graph-card rv3-graph-card-left${isTableActive(node.tableId) ? '' : ' dimmed'}`}
                href={node.href}
                key={node.tableId}
                onMouseEnter={() => setHoveredTableId(node.tableId)}
                onMouseLeave={() => setHoveredTableId(null)}
                ref={(element) => {
                  cardRefs.current[graphNodeKey('left', node.tableId)] = element;
                }}
              >
                <span className="rv3-graph-folder">{node.folderGroup}</span>
                <strong style={{ fontSize: getTableTitleSize(node.tableId) }}>{node.tableId}</strong>
                <span>{node.summary}</span>
              </Link>
            ))}
          </div>

          <div className="rv3-graph-column rv3-graph-column-center">
            {centerTables.map((table) => (
              <Link
                className={`rv3-graph-card rv3-graph-card-center${table.selected ? ' selected' : ''}${isTableActive(table.tableId) ? '' : ' dimmed'}`}
                href={table.href}
                key={table.tableId}
                onMouseEnter={() => setHoveredTableId(table.tableId)}
                onMouseLeave={() => setHoveredTableId(null)}
                ref={(element) => {
                  cardRefs.current[graphNodeKey('center', table.tableId)] = element;
                }}
              >
                <strong style={{ fontSize: getTableTitleSize(table.tableId, true) }}>{table.tableId}</strong>
              </Link>
            ))}
          </div>

          <div className="rv3-graph-column rv3-graph-column-right">
            {rightNodes.map((node) => (
              <Link
                className={`rv3-graph-card rv3-graph-card-right${isTableActive(node.tableId) ? '' : ' dimmed'}`}
                href={node.href}
                key={node.tableId}
                onMouseEnter={() => setHoveredTableId(node.tableId)}
                onMouseLeave={() => setHoveredTableId(null)}
                ref={(element) => {
                  cardRefs.current[graphNodeKey('right', node.tableId)] = element;
                }}
              >
                <span className="rv3-graph-folder">{node.folderGroup}</span>
                <strong style={{ fontSize: getTableTitleSize(node.tableId) }}>{node.tableId}</strong>
                <span>{node.summary}</span>
              </Link>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}

export function GraphView({ currentTableId, page, pageIdByTable, folderGroupByTable }: GraphViewProps) {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { panelHeight, startResize } = usePersistentPanelHeight();
  const [mode, setMode] = useState<TabMode>('summary');

  useEffect(() => {
    const fromSearch = searchParams.get('view');
    if (fromSearch === 'graph' || fromSearch === 'summary') {
      setMode(fromSearch);
      return;
    }

    try {
      const saved = window.localStorage.getItem(MODE_KEY);
      if (saved === 'graph' || saved === 'summary') {
        setMode(saved);
      }
    } catch {
      // ignore
    }
  }, [searchParams]);

  useEffect(() => {
    try {
      window.localStorage.setItem(MODE_KEY, mode);
    } catch {
      // ignore
    }
  }, [mode]);

  const leftNodes = useMemo(
    () => buildExternalNodes(page, 'left', folderGroupByTable, pageIdByTable, mode),
    [page, folderGroupByTable, pageIdByTable, mode]
  );
  const rightNodes = useMemo(
    () => buildExternalNodes(page, 'right', folderGroupByTable, pageIdByTable, mode),
    [page, folderGroupByTable, pageIdByTable, mode]
  );
  const title = page.tables.length > 1 ? `${page.csvName} (${currentTableId})` : page.csvName;

  const setViewMode = (next: TabMode) => {
    setMode(next);
    const params = new URLSearchParams(searchParams.toString());
    params.set('view', next);
    router.replace(`${pathname}?${params.toString()}`, { scroll: false });
  };

  return (
    <section className="rv2-shell rounded-lg border border-gray-200 bg-white shadow-sm">
      <div aria-hidden="true" className="rv2-head-outer" hidden>
        <div>
          <p className="eyebrow">연결 테이블</p>
          <h1 className="rv2-title">{title}</h1>
        </div>

        <div className="rv2-tabs">
          <button className={mode === 'summary' ? 'table-tab active' : 'table-tab'} onClick={() => setViewMode('summary')} type="button">
            테이블 목록
          </button>
          <button className={mode === 'graph' ? 'table-tab active' : 'table-tab'} onClick={() => setViewMode('graph')} type="button">
            그래프
          </button>
        </div>
      </div>

      <div className="rv2-panel" style={{ height: panelHeight }}>
        <div className="rv2-panel-head tables-section-head">
          <div className="rv2-head">
            <div>
              <p className="eyebrow">연결 테이블</p>
              <h1 className="rv2-title tables-section-title">{title}</h1>
            </div>

            <div className="rv2-tabs">
              <button className={mode === 'summary' ? 'table-tab active' : 'table-tab'} onClick={() => setViewMode('summary')} type="button">
                테이블 목록
              </button>
              <button className={mode === 'graph' ? 'table-tab active' : 'table-tab'} onClick={() => setViewMode('graph')} type="button">
                  그래프
                </button>
            </div>
          </div>
        </div>

        {mode === 'summary' ? (
          <SummaryTab
            currentTableId={currentTableId}
            folderGroupByTable={folderGroupByTable}
            mode={mode}
            page={page}
            pageIdByTable={pageIdByTable}
          />
        ) : (
          <GraphTab
            currentTableId={currentTableId}
            leftNodes={leftNodes}
            mode={mode}
            page={page}
            pageIdByTable={pageIdByTable}
            rightNodes={rightNodes}
          />
        )}
      </div>

      <div className="rv2-resize-handle" onMouseDown={startResize} />
    </section>
  );
}
