'use client';

import { SIZE_PRESETS } from '@aresdevunit/shared';

interface SizePresetSelectorProps {
  value: string;
  onChange: (preset: string) => void;
}

export function SizePresetSelector({ value, onChange }: SizePresetSelectorProps) {
  return (
    <select
      value={value}
      onChange={(e) => onChange(e.target.value)}
      className="h-[38px] min-w-[160px] cursor-pointer appearance-none rounded-md border border-zinc-300 bg-white bg-[url('data:image/svg+xml,%3Csvg%20xmlns%3D%22http%3A%2F%2Fwww.w3.org%2F2000%2Fsvg%22%20width%3D%2212%22%20height%3D%2212%22%20fill%3D%22%238a8a96%22%20viewBox%3D%220%200%2016%2016%22%3E%3Cpath%20d%3D%22M8%2011L3%206h10z%22%2F%3E%3C%2Fsvg%3E')] bg-[length:12px_12px] bg-[right_12px_center] bg-no-repeat pl-3 pr-9 text-[13px] text-zinc-900 transition-colors focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:focus:border-blue-400 dark:focus:ring-blue-400/20"
    >
      {Object.entries(SIZE_PRESETS).map(([key, preset]) => (
        <option key={key} value={key}>
          {preset.w} x {preset.h} — {preset.label}
        </option>
      ))}
    </select>
  );
}
