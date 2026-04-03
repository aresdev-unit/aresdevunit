import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { prisma } from '@/lib/prisma';
import type {
  ManualSupplementTable,
  RelationOverrideMode,
  StoredColumnOverride,
  StoredRelationOverride,
  TableEditActionType,
  TableEditEntityType,
  TableEditLog,
} from '@/lib/tables/types';

const FILE_OVERRIDE_PATH = path.join(process.cwd(), 'src', 'config', 'relation-overrides.json');
const FILE_COLUMN_OVERRIDE_PATH = path.join(process.cwd(), 'src', 'config', 'column-overrides.json');
const FILE_EDIT_LOG_PATH = path.join(process.cwd(), 'src', 'config', 'table-edit-logs.json');
const LOCAL_EDIT_LOG_PATH = path.join(process.cwd(), '.local', 'table-edit-logs.json');

type EditLogRecordInput = {
  entityType: TableEditEntityType;
  actionType: TableEditActionType;
  sourceTable: string;
  sourceColumn: string;
  csvPageId: string | null;
  beforeValue: Record<string, unknown>;
  afterValue: Record<string, unknown>;
  reason: string;
  actorUserId: string;
  actorUsername: string;
};

type EditLogListOptions = {
  pageId?: string;
  tableId?: string;
  limit?: number;
};

function hasDatabase() {
  return Boolean(process.env.DATABASE_URL);
}

function normalizeManualTables(tables: ManualSupplementTable[] | unknown): ManualSupplementTable[] {
  if (!Array.isArray(tables)) {
    return [];
  }

  return tables.map((table, tableIndex) => {
    const rawTable = (table ?? {}) as Record<string, unknown>;
    const rawHeaders = Array.isArray(rawTable.headers) ? rawTable.headers : [];
    const rawRows = Array.isArray(rawTable.rows) ? rawTable.rows : [];
    const rowLengths = rawRows.map((row) => (Array.isArray(row) ? row.length : 0));
    const width = Math.max(rawHeaders.length, ...rowLengths, 1);
    const headers = Array.from({ length: width }, (_, index) => String(rawHeaders[index] ?? ''));

    return {
      id: String(rawTable.id ?? `manual-${tableIndex + 1}`).trim() || `manual-${tableIndex + 1}`,
      title: String(rawTable.title ?? '').trim(),
      headers,
      rows: rawRows.map((row) =>
        Array.from({ length: width }, (_, index) =>
          Array.isArray(row) ? String(row[index] ?? '') : ''
        )
      ),
    };
  });
}

function normalizeRelationOverride(value: Partial<StoredRelationOverride>): StoredRelationOverride {
  return {
    sourceTable: String(value.sourceTable ?? '').trim(),
    sourceColumn: String(value.sourceColumn ?? '').trim(),
    targetTable: value.targetTable ? String(value.targetTable).trim() : null,
    targetColumn: value.targetColumn ? String(value.targetColumn).trim() : null,
    mode: value.mode === 'ignore' ? 'ignore' : 'force',
    reason: String(value.reason ?? '').trim(),
    updatedAt: value.updatedAt ? String(value.updatedAt) : undefined,
  };
}

function normalizeColumnOverride(value: Partial<StoredColumnOverride>): StoredColumnOverride {
  return {
    sourceTable: String(value.sourceTable ?? '').trim(),
    sourceColumn: String(value.sourceColumn ?? '').trim(),
    description: String(value.description ?? ''),
    note: String(value.note ?? ''),
    manualTables: normalizeManualTables(value.manualTables),
    updatedAt: value.updatedAt ? String(value.updatedAt) : undefined,
    updatedByUsername: value.updatedByUsername ? String(value.updatedByUsername) : undefined,
  };
}

function normalizeEditLog(row: {
  id: string;
  entity_type: TableEditEntityType;
  action_type: TableEditActionType;
  source_table: string;
  source_column: string;
  csv_page_id: string | null;
  before_value: unknown;
  after_value: unknown;
  reason: string;
  actor_username: string;
  created_at: Date;
}): TableEditLog {
  return {
    id: row.id,
    entityType: row.entity_type,
    actionType: row.action_type,
    sourceTable: row.source_table,
    sourceColumn: row.source_column,
    csvPageId: row.csv_page_id,
    beforeValue: ((row.before_value as Record<string, unknown> | null) ?? {}) as Record<string, unknown>,
    afterValue: ((row.after_value as Record<string, unknown> | null) ?? {}) as Record<string, unknown>,
    reason: row.reason,
    actorUsername: row.actor_username,
    createdAt: row.created_at.toISOString(),
  };
}

function readFileOverrides() {
  if (!fs.existsSync(FILE_OVERRIDE_PATH)) return [];
  const parsed = JSON.parse(fs.readFileSync(FILE_OVERRIDE_PATH, 'utf8')) as Array<Record<string, unknown>>;
  return parsed
    .map((item) =>
      normalizeRelationOverride({
        sourceTable: item.sourceTable as string,
        sourceColumn: item.sourceColumn as string,
        targetTable: (item.targetTable as string | undefined) ?? null,
        targetColumn: (item.targetColumn as string | undefined) ?? null,
        mode: item.mode as RelationOverrideMode,
        reason: item.reason as string,
      })
    )
    .filter((item) => item.sourceTable && item.sourceColumn);
}

function writeFileOverrides(overrides: StoredRelationOverride[]) {
  const payload = overrides.map((item) => ({
    sourceTable: item.sourceTable,
    sourceColumn: item.sourceColumn,
    targetTable: item.targetTable,
    targetColumn: item.targetColumn,
    mode: item.mode,
    reason: item.reason,
  }));

  // File fallback is for local single-user development only; concurrent writes are not protected.
  fs.writeFileSync(FILE_OVERRIDE_PATH, `${JSON.stringify(payload, null, 2)}\n`, 'utf8');
}

function readFileColumnOverrides() {
  if (!fs.existsSync(FILE_COLUMN_OVERRIDE_PATH)) return [];
  const parsed = JSON.parse(fs.readFileSync(FILE_COLUMN_OVERRIDE_PATH, 'utf8')) as Array<Record<string, unknown>>;
  return parsed
    .map((item) =>
      normalizeColumnOverride({
        sourceTable: item.sourceTable as string,
        sourceColumn: item.sourceColumn as string,
        description: item.description as string,
        note: item.note as string,
        manualTables: item.manualTables as ManualSupplementTable[],
        updatedAt: item.updatedAt as string,
        updatedByUsername: item.updatedByUsername as string,
      })
    )
    .filter((item) => item.sourceTable && item.sourceColumn);
}

function writeFileColumnOverrides(overrides: StoredColumnOverride[]) {
  // File fallback is for local single-user development only; concurrent writes are not protected.
  fs.writeFileSync(FILE_COLUMN_OVERRIDE_PATH, `${JSON.stringify(overrides, null, 2)}\n`, 'utf8');
}

function readFileEditLogs() {
  const targetPath = fs.existsSync(LOCAL_EDIT_LOG_PATH) ? LOCAL_EDIT_LOG_PATH : FILE_EDIT_LOG_PATH;
  if (!fs.existsSync(targetPath)) return [];
  const parsed = JSON.parse(fs.readFileSync(targetPath, 'utf8')) as TableEditLog[];
  return Array.isArray(parsed) ? parsed : [];
}

function writeFileEditLogs(logs: TableEditLog[]) {
  fs.mkdirSync(path.dirname(LOCAL_EDIT_LOG_PATH), { recursive: true });
  // File fallback is for local single-user development only; concurrent writes are not protected.
  fs.writeFileSync(LOCAL_EDIT_LOG_PATH, `${JSON.stringify(logs, null, 2)}\n`, 'utf8');
}

let ensureTablesPromise: Promise<void> | null = null;

async function createTables() {
  await prisma.$executeRawUnsafe(`
    create table if not exists table_relation_overrides (
      source_table text not null,
      source_column text not null,
      target_table text,
      target_column text,
      mode text not null,
      reason text not null default '',
      updated_at timestamptz not null default now(),
      primary key (source_table, source_column)
    )
  `);

  await prisma.$executeRawUnsafe(`
    create table if not exists table_column_overrides (
      source_table text not null,
      source_column text not null,
      description text not null default '',
      note text not null default '',
      manual_tables jsonb not null default '[]'::jsonb,
      updated_by_user_id text not null,
      updated_by_username text not null,
      updated_at timestamptz not null default now(),
      primary key (source_table, source_column)
    )
  `);

  await prisma.$executeRawUnsafe(`
    create table if not exists table_edit_logs (
      id text not null primary key,
      entity_type text not null,
      action_type text not null,
      source_table text not null,
      source_column text not null,
      csv_page_id text,
      before_value jsonb not null default '{}'::jsonb,
      after_value jsonb not null default '{}'::jsonb,
      reason text not null default '',
      actor_user_id text not null,
      actor_username text not null,
      created_at timestamptz not null default now()
    )
  `);

  await prisma.$executeRawUnsafe(`
    create index if not exists table_edit_logs_created_at_idx
    on table_edit_logs (created_at desc)
  `);

  await prisma.$executeRawUnsafe(`
    create index if not exists table_edit_logs_csv_page_id_idx
    on table_edit_logs (csv_page_id)
  `);

  await prisma.$executeRawUnsafe(`
    create index if not exists table_edit_logs_source_table_idx
    on table_edit_logs (source_table)
  `);
}

async function ensureTables() {
  if (!ensureTablesPromise) {
    ensureTablesPromise = createTables().catch((error) => {
      ensureTablesPromise = null;
      throw error;
    });
  }

  await ensureTablesPromise;
}

export function getOverrideStoreKind() {
  return hasDatabase() ? 'database' : 'file';
}

export async function listRelationOverrides(): Promise<StoredRelationOverride[]> {
  if (!hasDatabase()) {
    return readFileOverrides();
  }

  try {
    await ensureTables();
    const rows = await prisma.$queryRawUnsafe<Array<{
      source_table: string;
      source_column: string;
      target_table: string | null;
      target_column: string | null;
      mode: RelationOverrideMode;
      reason: string;
      updated_at: Date;
    }>>(`
      select
        source_table,
        source_column,
        target_table,
        target_column,
        mode,
        reason,
        updated_at
      from table_relation_overrides
    `);

    return rows.map((row) =>
      normalizeRelationOverride({
        sourceTable: row.source_table,
        sourceColumn: row.source_column,
        targetTable: row.target_table,
        targetColumn: row.target_column,
        mode: row.mode,
        reason: row.reason,
        updatedAt: row.updated_at.toISOString(),
      })
    );
  } catch {
    return readFileOverrides();
  }
}

export async function listColumnOverrides(): Promise<StoredColumnOverride[]> {
  if (!hasDatabase()) {
    return readFileColumnOverrides();
  }

  await ensureTables();
  const rows = await prisma.$queryRawUnsafe<Array<{
    source_table: string;
    source_column: string;
    description: string;
    note: string;
    manual_tables: unknown;
    updated_by_username: string;
    updated_at: Date;
  }>>(`
    select
      source_table,
      source_column,
      description,
      note,
      manual_tables,
      updated_by_username,
      updated_at
    from table_column_overrides
  `);

  return rows.map((row) =>
    normalizeColumnOverride({
      sourceTable: row.source_table,
      sourceColumn: row.source_column,
      description: row.description,
      note: row.note,
      manualTables: row.manual_tables as ManualSupplementTable[],
      updatedAt: row.updated_at.toISOString(),
      updatedByUsername: row.updated_by_username,
    })
  );
}

export async function upsertRelationOverride(override: StoredRelationOverride) {
  const normalized = normalizeRelationOverride(override);

  if (!normalized.sourceTable || !normalized.sourceColumn) {
    throw new Error('sourceTable and sourceColumn are required');
  }

  if (normalized.mode === 'force' && (!normalized.targetTable || !normalized.targetColumn)) {
    throw new Error('targetTable and targetColumn are required for force mode');
  }

  if (!hasDatabase()) {
    const overrides = readFileOverrides().filter(
      (item) =>
        !(item.sourceTable === normalized.sourceTable && item.sourceColumn === normalized.sourceColumn)
    );
    overrides.push(normalized);
    writeFileOverrides(overrides);
    return;
  }

  await ensureTables();
  await prisma.$executeRawUnsafe(
    `
      insert into table_relation_overrides (
        source_table,
        source_column,
        target_table,
        target_column,
        mode,
        reason
      )
      values ($1, $2, $3, $4, $5, $6)
      on conflict (source_table, source_column)
      do update set
        target_table = excluded.target_table,
        target_column = excluded.target_column,
        mode = excluded.mode,
        reason = excluded.reason,
        updated_at = now()
    `,
    normalized.sourceTable,
    normalized.sourceColumn,
    normalized.targetTable,
    normalized.targetColumn,
    normalized.mode,
    normalized.reason
  );
}

export async function deleteRelationOverride(sourceTable: string, sourceColumn: string) {
  if (!sourceTable || !sourceColumn) {
    throw new Error('sourceTable and sourceColumn are required');
  }

  if (!hasDatabase()) {
    const overrides = readFileOverrides().filter(
      (item) => !(item.sourceTable === sourceTable && item.sourceColumn === sourceColumn)
    );
    writeFileOverrides(overrides);
    return;
  }

  await ensureTables();
  await prisma.$executeRawUnsafe(
    `
      delete from table_relation_overrides
      where source_table = $1 and source_column = $2
    `,
    sourceTable,
    sourceColumn
  );
}

export async function upsertColumnOverride(
  override: StoredColumnOverride,
  actor: { userId: string; username: string }
) {
  const normalized = normalizeColumnOverride(override);

  if (!normalized.sourceTable || !normalized.sourceColumn) {
    throw new Error('sourceTable and sourceColumn are required');
  }

  if (!hasDatabase()) {
    const current = readFileColumnOverrides().filter(
      (item) => !(item.sourceTable === normalized.sourceTable && item.sourceColumn === normalized.sourceColumn)
    );
    current.push({
      ...normalized,
      updatedAt: new Date().toISOString(),
      updatedByUsername: actor.username,
    });
    writeFileColumnOverrides(current);
    return normalized;
  }

  await ensureTables();
  await prisma.$executeRawUnsafe(
    `
      insert into table_column_overrides (
        source_table,
        source_column,
        description,
        note,
        manual_tables,
        updated_by_user_id,
        updated_by_username
      )
      values ($1, $2, $3, $4, $5::jsonb, $6, $7)
      on conflict (source_table, source_column)
      do update set
        description = excluded.description,
        note = excluded.note,
        manual_tables = excluded.manual_tables,
        updated_by_user_id = excluded.updated_by_user_id,
        updated_by_username = excluded.updated_by_username,
        updated_at = now()
    `,
    normalized.sourceTable,
    normalized.sourceColumn,
    normalized.description,
    normalized.note,
    JSON.stringify(normalized.manualTables),
    actor.userId,
    actor.username
  );

  return normalized;
}

export async function appendEditLog(input: EditLogRecordInput) {
  if (!hasDatabase()) {
    const current = readFileEditLogs();
    current.unshift({
      id: crypto.randomUUID(),
      entityType: input.entityType,
      actionType: input.actionType,
      sourceTable: input.sourceTable,
      sourceColumn: input.sourceColumn,
      csvPageId: input.csvPageId,
      beforeValue: input.beforeValue,
      afterValue: input.afterValue,
      reason: input.reason,
      actorUsername: input.actorUsername,
      createdAt: new Date().toISOString(),
    });
    writeFileEditLogs(current.slice(0, 500));
    return;
  }

  await ensureTables();
  await prisma.$executeRawUnsafe(
    `
      insert into table_edit_logs (
        id,
        entity_type,
        action_type,
        source_table,
        source_column,
        csv_page_id,
        before_value,
        after_value,
        reason,
        actor_user_id,
        actor_username
      )
      values ($1, $2, $3, $4, $5, $6, $7::jsonb, $8::jsonb, $9, $10, $11)
    `,
    crypto.randomUUID(),
    input.entityType,
    input.actionType,
    input.sourceTable,
    input.sourceColumn,
    input.csvPageId,
    JSON.stringify(input.beforeValue),
    JSON.stringify(input.afterValue),
    input.reason,
    input.actorUserId,
    input.actorUsername
  );
}

export async function listEditLogs(options: EditLogListOptions = {}): Promise<TableEditLog[]> {
  if (!hasDatabase()) {
    return readFileEditLogs()
      .filter((log) => (options.pageId ? log.csvPageId === options.pageId : true))
      .filter((log) => (options.tableId ? log.sourceTable === options.tableId : true))
      .slice(0, Math.max(1, Math.min(options.limit ?? 100, 200)));
  }

  await ensureTables();
  const conditions: string[] = [];
  const values: Array<string | number> = [];

  if (options.pageId) {
    values.push(options.pageId);
    conditions.push(`csv_page_id = $${values.length}`);
  }

  if (options.tableId) {
    values.push(options.tableId);
    conditions.push(`source_table = $${values.length}`);
  }

  values.push(Math.max(1, Math.min(options.limit ?? 100, 200)));
  const limitParameter = `$${values.length}`;

  const whereClause = conditions.length > 0 ? `where ${conditions.join(' and ')}` : '';
  const rows = await prisma.$queryRawUnsafe<Array<{
    id: string;
    entity_type: TableEditEntityType;
    action_type: TableEditActionType;
    source_table: string;
    source_column: string;
    csv_page_id: string | null;
    before_value: unknown;
    after_value: unknown;
    reason: string;
    actor_username: string;
    created_at: Date;
  }>>(
    `
      select
        id,
        entity_type,
        action_type,
        source_table,
        source_column,
        csv_page_id,
        before_value,
        after_value,
        reason,
        actor_username,
        created_at
      from table_edit_logs
      ${whereClause}
      order by created_at desc
      limit ${limitParameter}
    `,
    ...values
  );

  return rows.map(normalizeEditLog);
}
