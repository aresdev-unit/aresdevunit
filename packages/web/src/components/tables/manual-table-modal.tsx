'use client';

import { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import type { ManualSupplementTable } from '@/lib/tables/types';

interface ManualTableModalProps {
  columnName: string;
  tables: ManualSupplementTable[];
}

export function ManualTableModal({ columnName, tables }: ManualTableModalProps) {
  const [open, setOpen] = useState(false);
  const [mounted, setMounted] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) {
      return;
    }

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

  if (tables.length === 0) {
    return null;
  }

  const toSpreadsheetText = () =>
    tables
      .map((table) => {
        const lines = [];
        lines.push(table.headers.map((header, index) => header || `열 ${index + 1}`).join('\t'));
        lines.push(...table.rows.map((row) => row.join('\t')));
        return lines.join('\r\n');
      })
      .join('\r\n\r\n');

  const copyToClipboard = async () => {
    const text = toSpreadsheetText();
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const textarea = document.createElement('textarea');
      textarea.value = text;
      document.body.appendChild(textarea);
      textarea.select();
      document.execCommand('copy');
      document.body.removeChild(textarea);
    }

    setCopied(true);
    window.setTimeout(() => setCopied(false), 2000);
  };

  const modal =
    open && mounted
      ? createPortal(
          <div
            aria-modal="true"
            className="manual-modal-overlay"
            onClick={() => setOpen(false)}
            role="dialog"
          >
            <div className="manual-modal-dialog" onClick={(event) => event.stopPropagation()}>
              <div className="manual-modal-head">
                <div>
                  <p className="eyebrow">참고표</p>
                  <h3>{columnName} 참고표</h3>
                </div>
                <button className="manual-modal-close" onClick={() => setOpen(false)} type="button">
                  닫기
                </button>
              </div>

              <div className="manual-modal-body">
                {tables.map((table) => (
                  <section className="manual-table-card" key={table.id}>
                    <h4>{table.title}</h4>
                    <div className="manual-table-scroll">
                      <table
                        className={
                          table.headers.length >= 8
                            ? 'manual-table manual-table-compact'
                            : table.headers.length >= 6
                              ? 'manual-table manual-table-dense'
                              : 'manual-table'
                        }
                      >
                        <thead>
                          <tr>
                            {table.headers.map((header, index) => (
                              <th key={`${table.id}-header-${index}`}>{header || `열 ${index + 1}`}</th>
                            ))}
                          </tr>
                        </thead>
                        <tbody>
                          {table.rows.map((row, rowIndex) => (
                            <tr key={`${table.id}-row-${rowIndex}`}>
                              {row.map((cell, cellIndex) => (
                                <td key={`${table.id}-cell-${rowIndex}-${cellIndex}`}>{cell}</td>
                              ))}
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </section>
                ))}
              </div>

              <div className="manual-modal-actions">
                <button className="manual-modal-copy" onClick={copyToClipboard} type="button">
                  {copied ? '복사됨' : '엑셀로 복사'}
                </button>
              </div>
            </div>
          </div>,
          document.body
        )
      : null;

  return (
    <>
      <button className="manual-table-trigger" onClick={() => setOpen(true)} type="button">
        참고표 보기
      </button>
      {modal}
    </>
  );
}
