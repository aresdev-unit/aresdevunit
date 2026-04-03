import type { Dataset, StoredColumnOverride } from '@/lib/tables/types';

function normalizeManualTables(override: StoredColumnOverride) {
  return override.manualTables.map((table, tableIndex) => {
    const headers = Array.isArray(table.headers) ? table.headers.map((header) => String(header ?? '')) : [];
    const normalizedHeaderCount = Math.max(headers.length, ...table.rows.map((row) => row.length), 1);
    const normalizedHeaders =
      headers.length >= normalizedHeaderCount
        ? headers.slice(0, normalizedHeaderCount)
        : [...headers, ...Array.from({ length: normalizedHeaderCount - headers.length }, () => '')];

    return {
      id: table.id || `${override.sourceTable}-${override.sourceColumn}-manual-${tableIndex + 1}`,
      title: String(table.title ?? '').trim(),
      headers: normalizedHeaders,
      rows: Array.isArray(table.rows)
        ? table.rows.map((row) =>
            Array.from({ length: normalizedHeaderCount }, (_, cellIndex) => String(row[cellIndex] ?? ''))
          )
        : [],
    };
  });
}

export function applyColumnOverrides(dataset: Dataset, overrides: StoredColumnOverride[]) {
  if (overrides.length === 0) {
    return dataset;
  }

  for (const override of overrides) {
    const table = dataset.tables.find((candidate) => candidate.tableId === override.sourceTable);
    const column = table?.columns.find((candidate) => candidate.name === override.sourceColumn);
    if (!column) {
      continue;
    }

    column.description = override.description;
    column.note = override.note;
    column.manualTables = normalizeManualTables(override);
  }

  return dataset;
}
