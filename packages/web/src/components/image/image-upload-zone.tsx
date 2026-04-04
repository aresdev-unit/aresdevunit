'use client';

import { useRef, useState, useCallback } from 'react';

interface SelectedFile {
  file: File;
  base64: string;
  preview: string;
}

interface ImageUploadZoneProps {
  onFilesSelected?: (files: SelectedFile[]) => void;
  accept?: string;
  maxFiles?: number;
  maxFileSize?: number;
  multiple?: boolean;
  compact?: boolean;
  label?: string;
  hint?: string;
}

export function ImageUploadZone({
  onFilesSelected,
  accept = 'image/png,image/jpeg,image/webp',
  maxFiles = 14,
  maxFileSize = 5 * 1024 * 1024,
  multiple = true,
  compact = false,
  label,
  hint,
}: ImageUploadZoneProps) {
  const inputRef = useRef<HTMLInputElement>(null);
  const [dragOver, setDragOver] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const processFiles = useCallback(
    async (fileList: FileList) => {
      setError(null);
      const allFiles = Array.from(fileList).slice(0, maxFiles);

      const oversized = allFiles.filter((f) => f.size > maxFileSize);
      const validFiles = allFiles.filter((f) => f.size <= maxFileSize);

      if (oversized.length > 0) {
        const maxMB = Math.round(maxFileSize / 1024 / 1024);
        const names = oversized.map((f) => f.name).join(', ');
        setError(
          `파일 크기가 ${maxMB}MB를 초과합니다: ${names}`,
        );
      }

      if (validFiles.length === 0) return;

      const results: SelectedFile[] = await Promise.all(
        validFiles.map(
          (file) =>
            new Promise<SelectedFile>((resolve) => {
              const reader = new FileReader();
              reader.onload = () => {
                resolve({
                  file,
                  base64: reader.result as string,
                  preview: URL.createObjectURL(file),
                });
              };
              reader.readAsDataURL(file);
            }),
        ),
      );

      onFilesSelected?.(results);
    },
    [maxFiles, maxFileSize, onFilesSelected],
  );

  const handleDrop = useCallback(
    (e: React.DragEvent) => {
      e.preventDefault();
      setDragOver(false);
      if (e.dataTransfer.files.length > 0) {
        processFiles(e.dataTransfer.files);
      }
    },
    [processFiles],
  );

  const handleDragOver = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(true);
  }, []);

  const handleDragLeave = useCallback((e: React.DragEvent) => {
    e.preventDefault();
    setDragOver(false);
  }, []);

  const handleClick = useCallback(() => {
    inputRef.current?.click();
  }, []);

  const handleChange = useCallback(
    (e: React.ChangeEvent<HTMLInputElement>) => {
      if (e.target.files && e.target.files.length > 0) {
        processFiles(e.target.files);
      }
      // Reset so the same file can be selected again
      e.target.value = '';
    },
    [processFiles],
  );

  return (
    <div>
      <div
        role="button"
        tabIndex={0}
        onClick={handleClick}
        onDrop={handleDrop}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onKeyDown={(e) => {
          if (e.key === 'Enter' || e.key === ' ') handleClick();
        }}
        className={`cursor-pointer rounded-lg border-2 border-dashed text-center transition-colors ${
          compact ? 'px-5 py-5' : 'px-8 py-8'
        } ${
          dragOver
            ? 'border-blue-500 bg-blue-500/10 dark:border-blue-400 dark:bg-blue-500/10'
            : 'border-zinc-300 hover:border-blue-500 hover:bg-blue-500/5 dark:border-zinc-700 dark:hover:border-blue-400 dark:hover:bg-blue-500/5'
        }`}
      >
        {!compact && (
          <svg
            className="mx-auto mb-3 h-10 w-10 text-zinc-400 dark:text-zinc-500"
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
            strokeWidth={1.5}
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              d="M12 16V4m0 0L8 8m4-4l4 4M4 20h16"
            />
          </svg>
        )}
        <div
          className={`text-zinc-600 dark:text-zinc-400 ${compact ? 'text-[13px]' : 'text-sm'}`}
        >
          {label || '아이콘 파일을 드래그하거나 클릭하여 업로드'}
        </div>
        <div className="mt-1 text-xs text-zinc-400 dark:text-zinc-500">
          {hint || `PNG, JPG — 최대 ${maxFiles}개`}
        </div>
      </div>

      {error && (
        <p className="mt-2 text-xs text-red-500 dark:text-red-400">{error}</p>
      )}

      <input
        ref={inputRef}
        type="file"
        accept={accept}
        multiple={multiple}
        onChange={handleChange}
        className="hidden"
      />
    </div>
  );
}
