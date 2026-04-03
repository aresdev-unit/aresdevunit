import { unstable_noStore as noStore } from 'next/cache';
import rawData from '@/generated/table-index.json';
import catalogData from '@/generated/catalog.json';
import relationData from '@/generated/relation-index.json';
import { applyColumnOverrides } from '@/lib/tables/column-overrides';
import { applyRelationOverrides } from '@/lib/tables/relation-overrides';
import { listColumnOverrides, listRelationOverrides } from '@/lib/tables/override-store';
import type { CatalogEntry, CsvPage, Dataset, LightweightCsvPage, LightweightTableEntry, RelationEdge, RelationIndex, TableIndex } from '@/lib/tables/types';

const snapshotDataset = rawData as Dataset;
const DATASET_CACHE_TTL_MS = 5_000;

let cachedDataset: Dataset | null = null;
let cachedDatasetExpiresAt = 0;

function compareTableIds(left: string, right: string) {
  if (left === right) return 0;
  if (right.startsWith(`${left}_`) || right.startsWith(`${left}.`)) return -1;
  if (left.startsWith(`${right}_`) || left.startsWith(`${right}.`)) return 1;
  return left.localeCompare(right, 'ko');
}

function buildPageId(csvPath: string) {
  return csvPath.replace(/[^A-Za-z0-9]+/g, '_').replace(/^_+|_+$/g, '').toLowerCase();
}

function getCsvFiles(csvPath: string) {
  return csvPath.split(',').map((part) => part.trim()).filter(Boolean);
}

function getBaseCsvName(csvPath: string) {
  const firstFile = getCsvFiles(csvPath)[0] ?? csvPath;
  const fileName = firstFile.split('/').pop() ?? firstFile;
  return fileName.replace(/\.csv$/i, '');
}

function getPageDisplayName(csvPath: string, tables: { tableId: string }[]) {
  const uniqueTableIds = [...new Set(tables.map((table) => table.tableId))];
  if (uniqueTableIds.length === 1) {
    return uniqueTableIds[0];
  }
  return getBaseCsvName(csvPath);
}

function buildCsvPages(dataset: Dataset): CsvPage[] {
  const groups = new Map<string, TableIndex[]>();

  for (const table of dataset.tables) {
    const list = groups.get(table.csvPath) ?? [];
    list.push(table);
    groups.set(table.csvPath, list);
  }

  return [...groups.entries()]
    .map(([csvPath, tables]) => ({
      pageId: buildPageId(csvPath),
      displayName: getPageDisplayName(csvPath, tables),
      csvName: getPageDisplayName(csvPath, tables),
      csvPath,
      csvFiles: getCsvFiles(csvPath),
      folderName: tables[0].folderName,
      folderGroup: tables[0].folderGroup,
      manualWorkbook:
        [...new Set(tables.map((table) => table.manualWorkbook).filter(Boolean))].join(', ') || null,
      tables: [...tables].sort((left, right) => compareTableIds(left.tableId, right.tableId)),
    }))
    .sort((left, right) => {
      if (left.folderGroup !== right.folderGroup) {
        return left.folderGroup.localeCompare(right.folderGroup, 'ko');
      }
      return left.csvName.localeCompare(right.csvName, 'ko');
    });
}

export function buildTableHref(
  pageIdByTable: Record<string, string> | Map<string, string>,
  tableId: string,
  columnName?: string
) {
  const pageId = pageIdByTable instanceof Map ? pageIdByTable.get(tableId) : pageIdByTable[tableId];
  if (!pageId) return '/tables';
  const params = new URLSearchParams({ page: pageId, tab: tableId });
  const hash = columnName ? `#column-${tableId}-${columnName}` : '';
  return `/tables?${params.toString()}${hash}`;
}

export async function getDataset(): Promise<Dataset> {
  noStore();
  const now = Date.now();
  if (cachedDataset && now < cachedDatasetExpiresAt) {
    return structuredClone(cachedDataset) as Dataset;
  }

  const [relationOverrides, columnOverrides] = await Promise.all([
    listRelationOverrides(),
    listColumnOverrides(),
  ]);
  const next = structuredClone(snapshotDataset) as Dataset;
  applyRelationOverrides(next, relationOverrides);
  applyColumnOverrides(next, columnOverrides);
  cachedDataset = next;
  cachedDatasetExpiresAt = now + DATASET_CACHE_TTL_MS;
  return structuredClone(next) as Dataset;
}

export function invalidateDatasetCache() {
  cachedDataset = null;
  cachedDatasetExpiresAt = 0;
  tableCache.clear();
}

export async function getCsvPages(): Promise<CsvPage[]> {
  const dataset = await getDataset();
  return buildCsvPages(dataset);
}

export async function getCsvPage(pageId: string): Promise<CsvPage | undefined> {
  const pages = await getCsvPages();
  return pages.find((page) => page.pageId === pageId);
}

export async function getCsvPageGroups(): Promise<Array<[string, CsvPage[]]>> {
  const csvPages = await getCsvPages();
  return Object.entries(
    csvPages.reduce<Record<string, CsvPage[]>>((acc, page) => {
      acc[page.folderGroup] ??= [];
      acc[page.folderGroup].push(page);
      return acc;
    }, {})
  )
    .map(
      ([group, pages]) =>
        [group, [...pages].sort((left, right) => left.csvName.localeCompare(right.csvName, 'ko'))] as [
          string,
          CsvPage[],
        ]
    )
    .sort(([left], [right]) => left.localeCompare(right, 'ko'));
}

export function getCsvPageIdForTable(tableId: string) {
  const table = snapshotDataset.tables.find((candidate) => candidate.tableId === tableId);
  return table ? buildPageId(table.csvPath) : null;
}

/* ------------------------------------------------------------------ */
/*  Phase 1-4: catalog / relation-index / per-table lazy accessors    */
/* ------------------------------------------------------------------ */

const catalog = (catalogData as { entries: CatalogEntry[] }).entries;
const relationIndex = relationData as RelationIndex;

export function getCatalog(): CatalogEntry[] {
  return catalog;
}

export function getRelationIndex(): RelationIndex {
  return relationIndex;
}

const tableCache = new Map<string, { table: TableIndex; expiresAt: number }>();
const TABLE_CACHE_TTL_MS = 10_000;

export async function getTableById(tableId: string): Promise<TableIndex | null> {
  if (!/^[A-Za-z0-9_]+$/.test(tableId)) return null;

  const now = Date.now();
  const cached = tableCache.get(tableId);
  if (cached && now < cached.expiresAt) {
    return structuredClone(cached.table) as TableIndex;
  }

  try {
    const mod = await import(`@/generated/tables/${tableId}.json`);
    const table = structuredClone(mod.default ?? mod) as TableIndex;

    const [relationOverrides, columnOverrides] = await Promise.all([
      listRelationOverrides(),
      listColumnOverrides(),
    ]);

    if (relationOverrides.length > 0 || columnOverrides.length > 0) {
      const miniDataset: Dataset = {
        generatedAt: '',
        workspaceRoot: '',
        tableCount: 1,
        relationCount: table.outboundRelations.length,
        tables: [table],
        graph: { nodes: [], edges: [] },
      };
      applyRelationOverrides(miniDataset, relationOverrides);
      applyColumnOverrides(miniDataset, columnOverrides);
    }

    tableCache.set(tableId, { table, expiresAt: now + TABLE_CACHE_TTL_MS });
    return structuredClone(table) as TableIndex;
  } catch {
    return null;
  }
}

export function getRelationsForTable(tableId: string): {
  outbound: RelationEdge[];
  inbound: RelationEdge[];
} {
  return {
    outbound: relationIndex.outbound[tableId] ?? [],
    inbound: relationIndex.inbound[tableId] ?? [],
  };
}

/* ------------------------------------------------------------------ */
/*  Phase 2: lightweight page list (from 84KB catalog, not 7.4MB)     */
/* ------------------------------------------------------------------ */

let lightweightCache: LightweightCsvPage[] | null = null;

export function getLightweightCsvPages(): LightweightCsvPage[] {
  if (lightweightCache) return lightweightCache;

  const groups = new Map<string, CatalogEntry[]>();
  for (const entry of catalog) {
    const list = groups.get(entry.csvPath) ?? [];
    list.push(entry);
    groups.set(entry.csvPath, list);
  }

  const pages: LightweightCsvPage[] = [...groups.entries()]
    .map(([csvPath, entries]) => {
      const sortedEntries = [...entries].sort((left, right) =>
        compareTableIds(left.tableId, right.tableId)
      );
      const displayName = getPageDisplayName(csvPath, sortedEntries);
      return {
        pageId: buildPageId(csvPath),
        displayName,
        csvName: displayName,
        csvPath,
        csvFiles: getCsvFiles(csvPath),
        folderName: entries[0].folderName,
        folderGroup: entries[0].folderGroup,
        manualWorkbook:
          [...new Set(entries.map((e) => e.manualWorkbook).filter(Boolean))].join(', ') || null,
        tables: sortedEntries.map(
          (entry): LightweightTableEntry => ({
            tableId: entry.tableId,
            displayName: entry.displayName,
            columnCount: entry.columnCount,
            keyColumns: entry.keyColumns,
            outboundRelationCount: entry.outboundRelationCount,
            inboundRelationCount: entry.inboundRelationCount,
          })
        ),
      };
    })
    .sort((left, right) => {
      if (left.folderGroup !== right.folderGroup) {
        return left.folderGroup.localeCompare(right.folderGroup, 'ko');
      }
      return left.csvName.localeCompare(right.csvName, 'ko');
    });

  lightweightCache = pages;
  return pages;
}
