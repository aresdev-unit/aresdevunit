'use client';

import { useRouter } from 'next/navigation';
import { useMemo, useState } from 'react';
import type { RelationRef } from '@/lib/tables/types';

interface TableOption {
  tableId: string;
  columns: string[];
}

interface RelationEditorProps {
  sourceTable: string;
  sourceColumn: string;
  currentRelation: RelationRef | null;
  tableOptions: TableOption[];
}

export function RelationEditor({
  sourceTable,
  sourceColumn,
  currentRelation,
  tableOptions,
}: RelationEditorProps) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [targetTable, setTargetTable] = useState(currentRelation?.targetTable ?? '');
  const [targetColumn, setTargetColumn] = useState(currentRelation?.targetColumn ?? '');
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  const sortedTableOptions = useMemo(
    () => [...tableOptions].sort((left, right) => left.tableId.localeCompare(right.tableId, 'en')),
    [tableOptions]
  );

  const columns = useMemo(
    () => sortedTableOptions.find((item) => item.tableId === targetTable)?.columns ?? [],
    [sortedTableOptions, targetTable]
  );

  const requestSave = async (payload: Record<string, string | boolean>) => {
    setSaving(true);
    setError('');

    try {
      const response = await fetch('/api/v1/tables/relation-overrides', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          sourceTable,
          sourceColumn,
          ...payload,
        }),
      });
      
      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: '저장 실패' }));
        throw new Error(data.error || '저장 실패');
      }

      setOpen(false);
      setSaving(false);
      router.refresh();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : '저장 실패');
      setSaving(false);
    }
  };

  return (
    <div className="relation-editor">
      <button className="relation-editor-toggle" onClick={() => setOpen((prev) => !prev)} type="button">
        참조 수정
      </button>

      {open ? (
        <div className="relation-editor-panel">
          <label>
            <span>대상 테이블</span>
            <select
              disabled={saving}
              onChange={(event) => {
                const nextTable = event.target.value;
                setTargetTable(nextTable);
                const nextColumns = sortedTableOptions.find((item) => item.tableId === nextTable)?.columns ?? [];
                setTargetColumn(nextColumns[0] ?? '');
              }}
              value={targetTable}
            >
              <option value="">선택</option>
              {sortedTableOptions.map((table) => (
                <option key={table.tableId} value={table.tableId}>
                  {table.tableId}
                </option>
              ))}
            </select>
          </label>

          <label>
            <span>대상 컬럼</span>
            <select
              disabled={saving || !targetTable}
              onChange={(event) => setTargetColumn(event.target.value)}
              value={targetColumn}
            >
              <option value="">선택</option>
              {columns.map((column) => (
                <option key={column} value={column}>
                  {column}
                </option>
              ))}
            </select>
          </label>

          {error ? <p className="relation-editor-error">{error}</p> : null}

          <div className="relation-editor-actions">
            <button
              className="relation-editor-save"
              disabled={saving || !targetTable || !targetColumn}
              onClick={() =>
                requestSave({
                  targetTable,
                  targetColumn,
                  reason: 'manual override',
                })
              }
              type="button"
            >
              저장
            </button>
            <button
              className="relation-editor-clear"
              disabled={saving}
              onClick={() =>
                requestSave({
                  mode: 'ignore',
                  reason: 'manual ignore',
                })
              }
              type="button"
            >
              참조 없음
            </button>
            <button
              className="relation-editor-reset"
              disabled={saving}
              onClick={() =>
                requestSave({
                  reset: true,
                })
              }
              type="button"
            >
              초기화
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}
