import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-middleware';
import { getCsvPageIdForTable, getDataset } from '@/lib/tables/data';
import { appendEditLog, upsertColumnOverride } from '@/lib/tables/override-store';
import type { ManualSupplementTable } from '@/lib/tables/types';

export const runtime = 'nodejs';

function normalizeManualTables(value: unknown): ManualSupplementTable[] {
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

export async function POST(request: NextRequest) {
  try {
    const authUser = await requireAuth(request);
    if (authUser instanceof NextResponse) {
      return authUser;
    }

    const body = await request.json();
    const sourceTable = String(body.sourceTable ?? '').trim();
    const sourceColumn = String(body.sourceColumn ?? '').trim();
    const description = String(body.description ?? '');
    const note = String(body.note ?? '');
    const manualTables = normalizeManualTables(body.manualTables);
    const reason = String(body.reason ?? '').trim() || 'manual column edit';

    if (!sourceTable || !sourceColumn) {
      return NextResponse.json({ error: 'sourceTable and sourceColumn are required' }, { status: 400 });
    }

    const dataset = await getDataset();
    const table = dataset.tables.find((candidate) => candidate.tableId === sourceTable);
    const column = table?.columns.find((candidate) => candidate.name === sourceColumn);

    if (!column) {
      return NextResponse.json({ error: 'column not found' }, { status: 404 });
    }

    const beforeValue = {
      description: column.description,
      note: column.note,
      manualTables: column.manualTables,
    };

    const afterValue = {
      description,
      note,
      manualTables,
    };

    if (JSON.stringify(beforeValue) === JSON.stringify(afterValue)) {
      return NextResponse.json({ ok: true, unchanged: true });
    }

    await upsertColumnOverride(
      {
        sourceTable,
        sourceColumn,
        description,
        note,
        manualTables,
      },
      {
        userId: authUser.id,
        username: authUser.username,
      }
    );

    await appendEditLog({
      entityType: 'column_meta',
      actionType: 'update_column_meta',
      sourceTable,
      sourceColumn,
      csvPageId: getCsvPageIdForTable(sourceTable),
      beforeValue,
      afterValue,
      reason,
      actorUserId: authUser.id,
      actorUsername: authUser.username,
    });

    return NextResponse.json({ ok: true, user: authUser.username });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
