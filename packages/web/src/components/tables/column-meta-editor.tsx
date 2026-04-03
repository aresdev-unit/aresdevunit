'use client';

import { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ManualSupplementTable } from '@/lib/tables/types';

type ColumnMetaEditorProps = {
  sourceTable: string;
  sourceColumn: string;
  currentDescription: string;
  currentNote: string;
  currentManualTables: ManualSupplementTable[];
};

type TableSizeDraft = {
  columns: string;
  rows: string;
};

function createEmptyTable(index: number): ManualSupplementTable {
  return {
    id: `manual-${Date.now()}-${index}`,
    title: '',
    headers: [''],
    rows: [['']],
  };
}

function cloneTables(tables: ManualSupplementTable[]) {
  return tables.map((table) => ({
    id: table.id,
    title: table.title,
    headers: [...table.headers],
    rows: table.rows.map((row) => [...row]),
  }));
}

function parseSpreadsheetPaste(raw: string) {
  const rows = raw
    .replace(/\r\n/g, '\n')
    .replace(/\r/g, '\n')
    .split('\n')
    .filter((line) => line.length > 0)
    .map((line) => line.split('\t'));

  if (rows.length === 0) {
    return null;
  }

  const width = Math.max(...rows.map((row) => row.length), 1);
  const normalizedRows = rows.map((row) =>
    Array.from({ length: width }, (_, index) => String(row[index] ?? ''))
  );

  return {
    headers: normalizedRows[0],
    rows: normalizedRows.slice(1),
  };
}

function normalizeTableSize(table: ManualSupplementTable, columnCount: number, rowCount: number): ManualSupplementTable {
  const safeColumns = Math.max(1, columnCount);
  const safeRows = Math.max(1, rowCount);

  const headers = Array.from({ length: safeColumns }, (_, index) => table.headers[index] ?? '');
  const rows = Array.from({ length: safeRows }, (_, rowIndex) =>
    Array.from({ length: safeColumns }, (_, cellIndex) => table.rows[rowIndex]?.[cellIndex] ?? '')
  );

  return {
    ...table,
    headers,
    rows,
  };
}

function GridScrollArea({ children }: { children: React.ReactNode }) {
  const topScrollRef = useRef<HTMLDivElement | null>(null);
  const topInnerRef = useRef<HTMLDivElement | null>(null);
  const bottomScrollRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const topScroll = topScrollRef.current;
    const topInner = topInnerRef.current;
    const bottomScroll = bottomScrollRef.current;

    if (!topScroll || !topInner || !bottomScroll) {
      return;
    }

    let syncingFromTop = false;
    let syncingFromBottom = false;

    const syncWidths = () => {
      topInner.style.width = `${bottomScroll.scrollWidth}px`;
      topScroll.scrollLeft = bottomScroll.scrollLeft;
    };

    const onTopScroll = () => {
      if (syncingFromBottom) {
        syncingFromBottom = false;
        return;
      }

      syncingFromTop = true;
      bottomScroll.scrollLeft = topScroll.scrollLeft;
    };

    const onBottomScroll = () => {
      if (syncingFromTop) {
        syncingFromTop = false;
        return;
      }

      syncingFromBottom = true;
      topScroll.scrollLeft = bottomScroll.scrollLeft;
    };

    syncWidths();

    const resizeObserver = new ResizeObserver(syncWidths);
    resizeObserver.observe(bottomScroll);
    if (bottomScroll.firstElementChild instanceof HTMLElement) {
      resizeObserver.observe(bottomScroll.firstElementChild);
    }

    topScroll.addEventListener('scroll', onTopScroll);
    bottomScroll.addEventListener('scroll', onBottomScroll);

    return () => {
      resizeObserver.disconnect();
      topScroll.removeEventListener('scroll', onTopScroll);
      bottomScroll.removeEventListener('scroll', onBottomScroll);
    };
  }, []);

  return (
    <div className="column-meta-grid-shell">
      <div className="column-meta-grid-top-scroll" ref={topScrollRef}>
        <div className="column-meta-grid-top-inner" ref={topInnerRef} />
      </div>
      <div className="column-meta-grid-scroll" ref={bottomScrollRef}>
        {children}
      </div>
    </div>
  );
}

export function ColumnMetaEditor({
  sourceTable,
  sourceColumn,
  currentDescription,
  currentNote,
  currentManualTables,
}: ColumnMetaEditorProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [description, setDescription] = useState(currentDescription);
  const [note, setNote] = useState(currentNote);
  const [manualTables, setManualTables] = useState<ManualSupplementTable[]>(cloneTables(currentManualTables));
  const [tableSizeDrafts, setTableSizeDrafts] = useState<Record<string, TableSizeDraft>>({});
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      setDescription(currentDescription);
      setNote(currentNote);
      setManualTables(cloneTables(currentManualTables));
      setTableSizeDrafts({});
      setError('');
      setSaving(false);
    }
  }, [open, currentDescription, currentNote, currentManualTables]);

  useEffect(() => {
    setTableSizeDrafts((current) => {
      const next: Record<string, TableSizeDraft> = {};

      manualTables.forEach((table) => {
        next[table.id] = {
          columns: String(table.headers.length),
          rows: String(table.rows.length),
        };
      });

      const currentKeys = Object.keys(current);
      const nextKeys = Object.keys(next);
      const sameKeys =
        currentKeys.length === nextKeys.length &&
        currentKeys.every((key) => nextKeys.includes(key));

      const sameValues =
        sameKeys &&
        nextKeys.every(
          (key) =>
            current[key]?.columns === next[key].columns &&
            current[key]?.rows === next[key].rows
        );

      return sameValues ? current : next;
    });
  }, [manualTables]);

  useEffect(() => {
    if (!open) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = 'hidden';

    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  const updateTable = (tableIndex: number, updater: (table: ManualSupplementTable) => ManualSupplementTable) => {
    setManualTables((current) =>
      current.map((table, index) => (index === tableIndex ? updater(table) : table))
    );
  };

  const updateTableSizeDraft = (
    tableId: string,
    key: keyof TableSizeDraft,
    value: string
  ) => {
    setTableSizeDrafts((current) => ({
      ...current,
      [tableId]: {
        columns: current[tableId]?.columns ?? '1',
        rows: current[tableId]?.rows ?? '1',
        [key]: value,
      },
    }));
  };

  const applyTableSize = (tableIndex: number, table: ManualSupplementTable) => {
    const draft = tableSizeDrafts[table.id];
    const nextColumns = Number.parseInt(draft?.columns ?? String(table.headers.length), 10);
    const nextRows = Number.parseInt(draft?.rows ?? String(table.rows.length), 10);

    updateTable(tableIndex, (current) =>
      normalizeTableSize(
        current,
        Number.isFinite(nextColumns) ? nextColumns : current.headers.length,
        Number.isFinite(nextRows) ? nextRows : current.rows.length
      )
    );
  };

  const save = async () => {
    setSaving(true);
    setError('');

    try {
      const response = await fetch('/api/v1/tables/column-overrides', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sourceTable,
          sourceColumn,
          description,
          note,
          manualTables,
          reason: 'manual column edit',
        }),
      });

      if (!response.ok) {
        const data = await response.json().catch(() => ({ error: 'save failed' }));
        throw new Error(data.error || 'save failed');
      }

      window.location.reload();
    } catch (caughtError) {
      setError(caughtError instanceof Error ? caughtError.message : 'save failed');
      setSaving(false);
    }
  };

  const modal =
    open && mounted
      ? createPortal(
          <div
            aria-modal="true"
            className="column-meta-modal-overlay"
            onClick={() => setOpen(false)}
            role="dialog"
          >
            <div className="column-meta-modal-dialog" onClick={(event) => event.stopPropagation()}>
              <div className="column-meta-modal-head">
                <div>
                  <p className="tables-section-label">컬럼 설명 수정</p>
                  <h3>{sourceTable}.{sourceColumn}</h3>
                </div>
                <button className="column-meta-close" onClick={() => setOpen(false)} type="button">
                  닫기
                </button>
              </div>

              <div className="column-meta-modal-body">
                <label className="column-meta-field">
                  <span>설명</span>
                  <textarea onChange={(event) => setDescription(event.target.value)} rows={4} value={description} />
                </label>

                <label className="column-meta-field">
                  <span>노트</span>
                  <textarea onChange={(event) => setNote(event.target.value)} rows={3} value={note} />
                </label>

                <div className="column-meta-table-head">
                  <div>
                    <p className="tables-section-label">참고표</p>
                    <h4>연결된 참고표 편집</h4>
                  </div>
                  <button
                    className="column-meta-add-button"
                    onClick={() => setManualTables((current) => [...current, createEmptyTable(current.length + 1)])}
                    type="button"
                  >
                    참고표 추가
                  </button>
                </div>

                <div className="column-meta-table-list">
                  {manualTables.length === 0 ? (
                    <div className="column-meta-empty">등록된 참고표가 없습니다.</div>
                  ) : (
                    manualTables.map((table, tableIndex) => (
                      <section className="column-meta-table-card" key={table.id}>
                        <div className="column-meta-table-card-head">
                          <input
                            className="column-meta-table-title"
                            onChange={(event) =>
                              updateTable(tableIndex, (current) => ({ ...current, title: event.target.value }))
                            }
                            placeholder="참고표 제목"
                            value={table.title}
                          />
                          <button
                            className="column-meta-remove-button"
                            onClick={() =>
                              setManualTables((current) => current.filter((_, index) => index !== tableIndex))
                            }
                            type="button"
                          >
                            삭제
                          </button>
                        </div>

                        <div className="column-meta-input-grid">
                          <label className="column-meta-paste-field">
                            <span>엑셀 범위 붙여넣기</span>
                            <textarea
                              onPaste={(event) => {
                                event.preventDefault();
                                const pasted = event.clipboardData.getData('text');
                                const parsed = parseSpreadsheetPaste(pasted);
                                if (!parsed) {
                                  return;
                                }

                                updateTable(tableIndex, (current) => ({
                                  ...current,
                                  headers: parsed.headers,
                                  rows:
                                    parsed.rows.length > 0
                                      ? parsed.rows
                                      : [Array.from({ length: parsed.headers.length }, () => '')],
                                }));
                              }}
                              placeholder={'엑셀에서 복사한 범위를 그대로 붙여넣으세요.\n첫 줄은 헤더로 처리됩니다.'}
                              rows={3}
                            />
                          </label>

                          <div className="column-meta-size-panel">
                            <p className="column-meta-size-title">표 크기 직접 입력</p>
                            <p className="column-meta-size-help">현재 표 기준으로 행/열 수를 맞춥니다.</p>

                            <div className="column-meta-size-fields">
                              <label className="column-meta-size-field">
                                <span>열 수</span>
                                <input
                                  inputMode="numeric"
                                  min={1}
                                  onChange={(event) =>
                                    updateTableSizeDraft(table.id, 'columns', event.target.value)
                                  }
                                  type="number"
                                  value={tableSizeDrafts[table.id]?.columns ?? String(table.headers.length)}
                                />
                              </label>

                              <label className="column-meta-size-field">
                                <span>행 수</span>
                                <input
                                  inputMode="numeric"
                                  min={1}
                                  onChange={(event) =>
                                    updateTableSizeDraft(table.id, 'rows', event.target.value)
                                  }
                                  type="number"
                                  value={tableSizeDrafts[table.id]?.rows ?? String(table.rows.length)}
                                />
                              </label>
                            </div>

                            <button
                              className="column-meta-size-apply"
                              onClick={() => applyTableSize(tableIndex, table)}
                              type="button"
                            >
                              크기 적용
                            </button>
                          </div>
                        </div>

                        <GridScrollArea>
                          <table className="column-meta-grid">
                            <thead>
                              <tr>
                                {table.headers.map((header, headerIndex) => (
                                  <th key={`${table.id}-header-${headerIndex}`}>
                                    <input
                                      onChange={(event) =>
                                        updateTable(tableIndex, (current) => ({
                                          ...current,
                                          headers: current.headers.map((item, index) =>
                                            index === headerIndex ? event.target.value : item
                                          ),
                                        }))
                                      }
                                      placeholder={`헤더 ${headerIndex + 1}`}
                                      value={header}
                                    />
                                  </th>
                                ))}
                              </tr>
                            </thead>
                            <tbody>
                              {table.rows.map((row, rowIndex) => (
                                <tr key={`${table.id}-row-${rowIndex}`}>
                                  {row.map((cell, cellIndex) => (
                                    <td key={`${table.id}-cell-${rowIndex}-${cellIndex}`}>
                                      <input
                                        onChange={(event) =>
                                          updateTable(tableIndex, (current) => ({
                                            ...current,
                                            rows: current.rows.map((currentRow, currentRowIndex) =>
                                              currentRowIndex === rowIndex
                                                ? currentRow.map((item, currentCellIndex) =>
                                                    currentCellIndex === cellIndex ? event.target.value : item
                                                  )
                                                : currentRow
                                            ),
                                          }))
                                        }
                                        value={cell}
                                      />
                                    </td>
                                  ))}
                                </tr>
                              ))}
                            </tbody>
                          </table>
                        </GridScrollArea>
                      </section>
                    ))
                  )}
                </div>

                {error ? <p className="column-meta-error">{error}</p> : null}
              </div>

              <div className="column-meta-modal-actions">
                <button className="column-meta-secondary" onClick={() => setOpen(false)} type="button">
                  취소
                </button>
                <button className="column-meta-primary" disabled={saving} onClick={save} type="button">
                  {saving ? '저장 중...' : '저장'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button
        aria-label="컬럼 설명 수정"
        className="column-meta-trigger"
        onClick={() => setOpen(true)}
        type="button"
      >
        <svg aria-hidden="true" viewBox="0 0 20 20">
          <path
            d="M13.6 3.4a1.9 1.9 0 0 1 2.7 2.7l-8 8-3.6.8.8-3.6 8-8Zm-7.4 9.2 2.2 2.2"
            fill="none"
            stroke="currentColor"
            strokeLinecap="round"
            strokeLinejoin="round"
            strokeWidth="1.6"
          />
        </svg>
      </button>
      {modal}
    </>
  );
}
