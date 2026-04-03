export type RelationConfidence = 'explicit' | 'inferred' | 'override';

export interface RelationRef {
  targetTable: string;
  targetColumn: string;
  confidence: RelationConfidence;
  evidence: string;
}

export interface ManualSupplementTable {
  id: string;
  title: string;
  headers: string[];
  rows: string[][];
}

export interface ManualRemarkBlock {
  id: string;
  title: string;
  rows: string[][];
}

export interface ColumnDoc {
  name: string;
  rawHeader: string;
  dataType: string;
  isKey: boolean;
  isComment: boolean;
  description: string;
  note: string;
  relation: RelationRef | null;
  manualTables: ManualSupplementTable[];
}

export interface RelationEdge {
  sourceTable: string;
  sourceColumn: string;
  targetTable: string;
  targetColumn: string;
  confidence: RelationConfidence;
  evidence: string;
}

export interface UnresolvedCandidate {
  columnName: string;
  reason: string;
  candidates: Array<{
    targetTable: string;
    targetColumn?: string;
    evidence?: string;
  }>;
}

export interface TableIndex {
  tableId: string;
  tableSlug: string;
  displayName: string;
  folderName: string;
  folderGroup: string;
  csvPath: string;
  manualWorkbook: string | null;
  manualSheet: string | null;
  tableIntro: string;
  manualSupplements: ManualSupplementTable[];
  manualRemarks: ManualRemarkBlock[];
  keyColumns: string[];
  columns: ColumnDoc[];
  outboundRelations: RelationEdge[];
  inboundRelations: RelationEdge[];
  unresolvedCandidates: UnresolvedCandidate[];
}

export interface GraphData {
  nodes: Array<{
    id: string;
    label: string;
    group: string;
    outboundCount: number;
    inboundCount: number;
  }>;
  edges: Array<{
    source: string;
    target: string;
    weight: number;
  }>;
}

export interface Dataset {
  generatedAt: string;
  workspaceRoot: string;
  tableCount: number;
  relationCount: number;
  tables: TableIndex[];
  graph: GraphData;
}

export type RelationOverrideMode = 'force' | 'ignore';

export interface StoredRelationOverride {
  sourceTable: string;
  sourceColumn: string;
  targetTable: string | null;
  targetColumn: string | null;
  mode: RelationOverrideMode;
  reason: string;
  updatedAt?: string;
}

export interface StoredColumnOverride {
  sourceTable: string;
  sourceColumn: string;
  description: string;
  note: string;
  manualTables: ManualSupplementTable[];
  updatedAt?: string;
  updatedByUsername?: string;
}

export type TableEditEntityType = 'relation' | 'column_meta';

export type TableEditActionType =
  | 'set_relation'
  | 'ignore_relation'
  | 'reset_relation'
  | 'update_column_meta';

export interface TableEditLog {
  id: string;
  entityType: TableEditEntityType;
  actionType: TableEditActionType;
  sourceTable: string;
  sourceColumn: string;
  csvPageId: string | null;
  beforeValue: Record<string, unknown>;
  afterValue: Record<string, unknown>;
  reason: string;
  actorUsername: string;
  createdAt: string;
}

export interface CsvPage {
  pageId: string;
  displayName: string;
  csvName: string;
  csvPath: string;
  csvFiles: string[];
  folderName: string;
  folderGroup: string;
  manualWorkbook: string | null;
  tables: TableIndex[];
}
