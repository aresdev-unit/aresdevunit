import { unstable_noStore as noStore } from 'next/cache';
import rawData from '@/generated/table-index.json';
import { applyColumnOverrides } from '@/lib/tables/column-overrides';
import { applyRelationOverrides } from '@/lib/tables/relation-overrides';
import { listColumnOverrides, listRelationOverrides } from '@/lib/tables/override-store';
import type { CsvPage, Dataset, TableIndex } from '@/lib/tables/types';

const snapshotDataset = rawData as Dataset;

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

function getPageDisplayName(csvPath: string, tables: TableIndex[]) {
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
  const [relationOverrides, columnOverrides] = await Promise.all([
    listRelationOverrides(),
    listColumnOverrides(),
  ]);
  const next = structuredClone(snapshotDataset) as Dataset;
  applyRelationOverrides(next, relationOverrides);
  applyColumnOverrides(next, columnOverrides);
  return next;
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
