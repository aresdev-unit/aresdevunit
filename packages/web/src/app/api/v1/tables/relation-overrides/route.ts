import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-middleware';
import { getCsvPageIdForTable, getDataset } from '@/lib/tables/data';
import {
  appendEditLog,
  deleteRelationOverride,
  getOverrideStoreKind,
  upsertRelationOverride,
} from '@/lib/tables/override-store';
import type { StoredRelationOverride } from '@/lib/tables/types';

export const runtime = 'nodejs';

function findCurrentRelation(sourceTable: string, sourceColumn: string, dataset: Awaited<ReturnType<typeof getDataset>>) {
  const table = dataset.tables.find((candidate) => candidate.tableId === sourceTable);
  const column = table?.columns.find((candidate) => candidate.name === sourceColumn);
  return column?.relation ?? null;
}

function relationPayload(override: StoredRelationOverride | null) {
  if (!override) {
    return { relation: null };
  }

  return {
    relation: override.mode === 'ignore'
      ? null
      : {
          targetTable: override.targetTable,
          targetColumn: override.targetColumn,
          mode: override.mode,
        },
  };
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
    const targetTable = String(body.targetTable ?? '').trim();
    const targetColumn = String(body.targetColumn ?? '').trim();
    const mode = String(body.mode ?? '').trim();
    const reset = Boolean(body.reset);
    const reason = String(body.reason ?? '').trim();

    if (!sourceTable || !sourceColumn) {
      return NextResponse.json({ error: 'sourceTable and sourceColumn are required' }, { status: 400 });
    }

    const dataset = await getDataset();
    const beforeRelation = findCurrentRelation(sourceTable, sourceColumn, dataset);
    const csvPageId = getCsvPageIdForTable(sourceTable);
    let actionType: 'set_relation' | 'ignore_relation' | 'reset_relation';
    let afterPayload: Record<string, unknown>;

    if (reset) {
      await deleteRelationOverride(sourceTable, sourceColumn);
      actionType = 'reset_relation';
      afterPayload = { relation: null };
    } else if (mode === 'ignore') {
      await upsertRelationOverride({
        sourceTable,
        sourceColumn,
        targetTable: null,
        targetColumn: null,
        mode: 'ignore',
        reason: reason || 'manual ignore',
      });
      actionType = 'ignore_relation';
      afterPayload = relationPayload({
        sourceTable,
        sourceColumn,
        targetTable: null,
        targetColumn: null,
        mode: 'ignore',
        reason: reason || 'manual ignore',
      });
    } else if (targetTable && targetColumn) {
      await upsertRelationOverride({
        sourceTable,
        sourceColumn,
        targetTable,
        targetColumn,
        mode: 'force',
        reason: reason || 'manual override',
      });
      actionType = 'set_relation';
      afterPayload = relationPayload({
        sourceTable,
        sourceColumn,
        targetTable,
        targetColumn,
        mode: 'force',
        reason: reason || 'manual override',
      });
    } else {
      return NextResponse.json({ error: 'targetTable and targetColumn are required' }, { status: 400 });
    }

    await appendEditLog({
      entityType: 'relation',
      actionType,
      sourceTable,
      sourceColumn,
      csvPageId,
      beforeValue: relationPayload(
        beforeRelation
          ? {
              sourceTable,
              sourceColumn,
              targetTable: beforeRelation.targetTable,
              targetColumn: beforeRelation.targetColumn,
              mode: 'force',
              reason: beforeRelation.evidence,
            }
          : null
      ),
      afterValue: afterPayload,
      reason,
      actorUserId: authUser.id,
      actorUsername: authUser.username,
    });

    return NextResponse.json({ ok: true, store: getOverrideStoreKind(), user: authUser.username });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'unknown error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
