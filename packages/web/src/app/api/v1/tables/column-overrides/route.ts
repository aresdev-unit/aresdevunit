import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-middleware';
import { hasDatabaseUrl, prisma } from '@/lib/prisma';
import { getCsvPageIdForTable, getDataset, invalidateDatasetCache } from '@/lib/tables/data';
import { normalizeManualTables } from '@/lib/tables/normalize';
import { appendEditLog, upsertColumnOverride } from '@/lib/tables/override-store';

export const runtime = 'nodejs';

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

    let logWarning: string | null = null;
    const overridePayload = {
      sourceTable,
      sourceColumn,
      description,
      note,
      manualTables,
    };
    const actor = {
      userId: authUser.id,
      username: authUser.username,
    };
    const logPayload = {
      entityType: 'column_meta' as const,
      actionType: 'update_column_meta' as const,
      sourceTable,
      sourceColumn,
      csvPageId: getCsvPageIdForTable(sourceTable),
      beforeValue,
      afterValue,
      reason,
      actorUserId: authUser.id,
      actorUsername: authUser.username,
    };

    if (hasDatabaseUrl) {
      await prisma.$transaction(async (tx) => {
        await upsertColumnOverride(overridePayload, actor, tx);
        await appendEditLog(logPayload, tx);
      });
    } else {
      await upsertColumnOverride(overridePayload, actor);
      try {
        await appendEditLog(logPayload);
      } catch (logError) {
        console.error('Column override saved but edit log append failed:', logError);
        logWarning = 'saved_without_log';
      }
    }

    invalidateDatasetCache();

    return NextResponse.json({ ok: true, user: authUser.username, logWarning });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
