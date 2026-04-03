import { normalizeManualTables } from '@/lib/tables/normalize';
import type { Dataset, StoredColumnOverride } from '@/lib/tables/types';

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
    column.manualTables = normalizeManualTables(override.manualTables);
  }

  return dataset;
}
