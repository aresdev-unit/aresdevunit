import type { ManualSupplementTable } from '@/lib/tables/types';

export function normalizeManualTables(value: ManualSupplementTable[] | unknown): ManualSupplementTable[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.map((table, tableIndex) => {
    const raw = (table ?? {}) as Record<string, unknown>;
    const rawHeaders = Array.isArray(raw.headers) ? raw.headers : [];
    const rawRows = Array.isArray(raw.rows) ? raw.rows : [];
    const width = Math.max(
      rawHeaders.length,
      ...rawRows.map((row) => (Array.isArray(row) ? row.length : 0)),
      1
    );

    return {
      id: String(raw.id ?? `manual-${tableIndex + 1}`).trim() || `manual-${tableIndex + 1}`,
      title: String(raw.title ?? '').trim(),
      headers: Array.from({ length: width }, (_, index) => String(rawHeaders[index] ?? '')),
      rows: rawRows.map((row) =>
        Array.from({ length: width }, (_, index) => (Array.isArray(row) ? String(row[index] ?? '') : ''))
      ),
    };
  });
}
