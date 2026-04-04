'use client';

import { POSITION_PRESETS, MAX_PRIORITY } from '@aresdevunit/shared';
import { formatBytes, stripDataUrlPrefix } from './shared';

export interface IconConfigItem {
  id: string;
  fileName: string;
  preview: string;
  base64: string;
  mimeType: string;
  priority: number;
  position: string;
}

interface IconConfigPanelProps {
  icons: IconConfigItem[];
  onChange: (icons: IconConfigItem[]) => void;
  onRemove: (id: string) => void;
}

export function IconConfigPanel({ icons, onChange, onRemove }: IconConfigPanelProps) {
  const updateIcon = (id: string, patch: Partial<IconConfigItem>) => {
    onChange(icons.map((icon) => (icon.id === id ? { ...icon, ...patch } : icon)));
  };

  if (icons.length === 0) return null;

  return (
    <div className="mt-4 flex flex-col gap-2.5">
      {icons.map((icon) => (
        <div
          key={icon.id}
          className="flex items-center gap-3.5 rounded-lg border border-zinc-200 bg-zinc-50 px-4 py-3 dark:border-zinc-700 dark:bg-zinc-800/60"
        >
          {/* Priority badge */}
          <span
            className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-bold ${
              icon.priority === 1
                ? 'bg-blue-600 text-white'
                : 'border border-zinc-300 bg-zinc-200 text-zinc-500 dark:border-zinc-600 dark:bg-zinc-700 dark:text-zinc-400'
            }`}
          >
            {icon.priority}
          </span>

          {/* Thumbnail */}
          <div className="flex h-12 w-12 shrink-0 items-center justify-center overflow-hidden rounded-md border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900">
            <img
              src={icon.preview}
              alt={icon.fileName}
              className="h-full w-full object-contain"
            />
          </div>

          {/* Info */}
          <div className="min-w-0 flex-1">
            <p className="truncate text-[13px] font-medium text-zinc-900 dark:text-zinc-100">
              {icon.fileName}
            </p>
            <p className="font-mono text-[11px] text-zinc-400 dark:text-zinc-500">
              {formatBytes(Math.ceil(stripDataUrlPrefix(icon.base64).length * 3 / 4))}
            </p>
          </div>

          {/* Controls */}
          <div className="flex items-center gap-2">
            {/* Priority dropdown */}
            <select
              value={icon.priority}
              onChange={(e) => updateIcon(icon.id, { priority: Number(e.target.value) })}
              className="h-8 cursor-pointer appearance-none rounded-md border border-zinc-300 bg-white bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%2210%22%20fill%3D%22%238a8a96%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20d%3D%22M8%2011L3%206h10z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:10px_10px] bg-[right_8px_center] bg-no-repeat pl-2.5 pr-7 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {Array.from({ length: MAX_PRIORITY }, (_, i) => i + 1).map((p) => (
                <option key={p} value={p}>
                  우선순위 {p}
                </option>
              ))}
            </select>

            {/* Position dropdown */}
            <select
              value={icon.position}
              onChange={(e) => updateIcon(icon.id, { position: e.target.value })}
              className="h-8 cursor-pointer appearance-none rounded-md border border-zinc-300 bg-white bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2210%22%20height%3D%2210%22%20fill%3D%22%238a8a96%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20d%3D%22M8%2011L3%206h10z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:10px_10px] bg-[right_8px_center] bg-no-repeat pl-2.5 pr-7 text-xs text-zinc-900 dark:border-zinc-600 dark:bg-zinc-800 dark:text-zinc-100"
            >
              {Object.entries(POSITION_PRESETS).map(([key, label]) => (
                <option key={key} value={key}>
                  {label}
                </option>
              ))}
            </select>
          </div>

          {/* Remove button */}
          <button
            type="button"
            onClick={() => onRemove(icon.id)}
            className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-zinc-400 transition-colors hover:bg-red-950/30 hover:text-red-400 dark:hover:bg-red-950/30"
            aria-label={`Remove ${icon.fileName}`}
          >
            <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
            </svg>
          </button>
        </div>
      ))}
    </div>
  );
}
