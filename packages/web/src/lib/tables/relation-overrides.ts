import type { Dataset, RelationEdge, StoredRelationOverride, TableIndex } from '@/lib/tables/types';

function relationKey(edge: RelationEdge) {
  return `${edge.sourceTable}::${edge.sourceColumn}::${edge.targetTable}::${edge.targetColumn}`;
}

function buildGraph(tables: TableIndex[]) {
  const edgeMap = new Map<string, { source: string; target: string; weight: number }>();

  for (const table of tables) {
    for (const relation of table.outboundRelations) {
      const key = [relation.sourceTable, relation.targetTable].sort().join('::');
      const current = edgeMap.get(key) ?? {
        source: relation.sourceTable,
        target: relation.targetTable,
        weight: 0,
      };
      current.weight += 1;
      edgeMap.set(key, current);
    }
  }

  return {
    nodes: tables.map((table) => ({
      id: table.tableId,
      label: table.tableId,
      group: table.folderGroup,
      outboundCount: table.outboundRelations.length,
      inboundCount: table.inboundRelations.length,
    })),
    edges: [...edgeMap.values()],
  };
}

function removeExistingRelation(dataset: Dataset, override: StoredRelationOverride) {
  const sourceTable = dataset.tables.find((table) => table.tableId === override.sourceTable);
  if (!sourceTable) return;

  sourceTable.outboundRelations = sourceTable.outboundRelations.filter((edge) => {
    const matched = edge.sourceTable === override.sourceTable && edge.sourceColumn === override.sourceColumn;
    if (matched) {
      const targetTable = dataset.tables.find((table) => table.tableId === edge.targetTable);
      if (targetTable) {
        targetTable.inboundRelations = targetTable.inboundRelations.filter(
          (candidate) => relationKey(candidate) !== relationKey(edge)
        );
      }
    }
    return !matched;
  });

  const sourceColumn = sourceTable.columns.find((column) => column.name === override.sourceColumn);
  if (sourceColumn) {
    sourceColumn.relation = null;
  }
}

function applyForcedRelation(dataset: Dataset, override: StoredRelationOverride) {
  if (!override.targetTable || !override.targetColumn) return;

  const sourceTable = dataset.tables.find((table) => table.tableId === override.sourceTable);
  const targetTable = dataset.tables.find((table) => table.tableId === override.targetTable);
  if (!sourceTable || !targetTable) return;

  const edge: RelationEdge = {
    sourceTable: override.sourceTable,
    sourceColumn: override.sourceColumn,
    targetTable: override.targetTable,
    targetColumn: override.targetColumn,
    confidence: 'override',
    evidence: override.reason || 'db override',
  };

  sourceTable.outboundRelations.push(edge);
  targetTable.inboundRelations.push(edge);

  const sourceColumn = sourceTable.columns.find((column) => column.name === override.sourceColumn);
  if (sourceColumn) {
    sourceColumn.relation = {
      targetTable: override.targetTable,
      targetColumn: override.targetColumn,
      confidence: 'override',
      evidence: override.reason || 'db override',
    };
  }
}

export function applyRelationOverrides(dataset: Dataset, overrides: StoredRelationOverride[]) {
  if (overrides.length === 0) return dataset;

  const next = structuredClone(dataset) as Dataset;

  for (const override of overrides) {
    removeExistingRelation(next, override);
    if (override.mode === 'force') {
      applyForcedRelation(next, override);
    }
  }

  next.relationCount = next.tables.reduce((sum, table) => sum + table.outboundRelations.length, 0);
  next.graph = buildGraph(next.tables);
  return next;
}
