'use client';

import { useCallback } from 'react';

export interface GalleryItem {
  id: string;
  imageBase64: string;
  mimeType: string;
  timestamp: number;
  model: string;
}

interface ImageGalleryProps {
  items: GalleryItem[];
  generating?: boolean;
  onRegenerate?: () => void;
}

function modelLabel(model: string): string {
  if (model.includes('flash')) return 'Flash';
  if (model.includes('pro')) return 'Pro';
  return model;
}

export function ImageGallery({ items, generating, onRegenerate }: ImageGalleryProps) {
  const handleDownload = useCallback((item: GalleryItem) => {
    const byteString = atob(item.imageBase64);
    const bytes = new Uint8Array(byteString.length);
    for (let i = 0; i < byteString.length; i++) {
      bytes[i] = byteString.charCodeAt(i);
    }
    const blob = new Blob([bytes], { type: item.mimeType });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    const ext = item.mimeType.split('/')[1] || 'png';
    a.download = `generated-${item.id}.${ext}`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  }, []);

  return (
    <div className="grid grid-cols-[repeat(auto-fill,minmax(200px,1fr))] gap-3">
      {/* Shimmer placeholder while generating */}
      {generating && (
        <div className="aspect-square overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-800">
          <div className="h-full w-full animate-pulse bg-gradient-to-r from-zinc-200 via-zinc-100 to-zinc-200 dark:from-zinc-800 dark:via-zinc-700 dark:to-zinc-800" />
        </div>
      )}

      {/* Result items */}
      {items.map((item, idx) => (
        <div
          key={item.id}
          className="group relative aspect-square cursor-pointer overflow-hidden rounded-lg border border-zinc-200 transition-all hover:-translate-y-0.5 hover:border-blue-500 dark:border-zinc-700 dark:hover:border-blue-400"
        >
          <img
            src={`data:${item.mimeType};base64,${item.imageBase64}`}
            alt={`Generated #${idx + 1}`}
            className="h-full w-full object-contain p-3"
          />
          <div className="absolute inset-x-0 bottom-0 flex items-center justify-between bg-gradient-to-t from-black/80 to-transparent px-2.5 py-2 opacity-0 transition-opacity group-hover:opacity-100">
            <span className="font-mono text-[10px] text-zinc-400">
              #{idx + 1} · {modelLabel(item.model)}
            </span>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleDownload(item);
              }}
              className="flex h-7 w-7 items-center justify-center rounded-md bg-blue-500 text-sm text-white transition-colors hover:bg-blue-600"
              aria-label="Download"
            >
              <svg
                className="h-3.5 w-3.5"
                fill="none"
                viewBox="0 0 24 24"
                stroke="currentColor"
                strokeWidth={2}
              >
                <path
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  d="M4 16v2a2 2 0 002 2h12a2 2 0 002-2v-2M12 4v12m0 0l-4-4m4 4l4-4"
                />
              </svg>
            </button>
          </div>
        </div>
      ))}

      {/* Re-generate slot */}
      {onRegenerate && (
        <button
          onClick={onRegenerate}
          disabled={generating}
          className="flex aspect-square cursor-pointer flex-col items-center justify-center rounded-lg border-2 border-dashed border-zinc-300 text-zinc-400 transition-colors hover:border-blue-500 hover:text-blue-500 disabled:cursor-not-allowed disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-500 dark:hover:border-blue-400 dark:hover:text-blue-400"
        >
          <span className="text-2xl leading-none">+</span>
          <span className="mt-1 text-[11px]">Re-generate</span>
        </button>
      )}
    </div>
  );
}
