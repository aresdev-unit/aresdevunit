'use client';

import { useState, useCallback, useEffect, useRef } from 'react';
import { MODEL_OPTIONS, MAX_ICONS } from '@aresdevunit/shared';
import dynamic from 'next/dynamic';
import { ImageUploadZone } from '@/components/image/image-upload-zone';
import { ModelSelector } from '@/components/image/model-selector';
import { SizePresetSelector } from '@/components/image/size-preset-selector';
import { ImageGallery, type GalleryItem } from '@/components/image/image-gallery';
import type { CanvasIcon, CanvasPreviewRef } from '@/components/image/canvas-preview';
import { IconConfigPanel, type IconConfigItem } from '@/components/image/icon-config-panel';
import { StepCard, stripDataUrlPrefix, formatBytes } from './shared';

const CanvasPreview = dynamic(
  () => import('./canvas-preview').then((m) => ({ default: m.CanvasPreview })),
  {
    ssr: false,
    loading: () => (
      <div className="aspect-square max-w-[480px] animate-pulse rounded-lg bg-zinc-800" />
    ),
  },
);

interface SelectedFile {
  file: File;
  base64: string;
  preview: string;
}

interface TemplateFile {
  file: File;
  base64: string;
  preview: string;
}

const MODEL_KEYS = Object.keys(MODEL_OPTIONS) as (keyof typeof MODEL_OPTIONS)[];

function importanceToSize(importance: string): number {
  switch (importance) {
    case 'highest': return 0.4;
    case 'high': return 0.25;
    case 'medium': return 0.15;
    case 'low': return 0.1;
    default: return 0.15;
  }
}

function defaultImportanceForPriority(priority: number): string {
  if (priority === 1) return 'highest';
  if (priority === 2) return 'high';
  if (priority <= 4) return 'medium';
  return 'low';
}

function defaultCoordsForPriority(priority: number): { x: number; y: number } {
  switch (priority) {
    case 1: return { x: 0.5, y: 0.35 };
    case 2: return { x: 0.3, y: 0.7 };
    case 3: return { x: 0.7, y: 0.7 };
    default: return { x: 0.5, y: 0.75 };
  }
}

function iconToCanvas(icon: IconConfigItem): CanvasIcon {
  const coords = defaultCoordsForPriority(icon.priority);
  const size = importanceToSize(icon.importance);
  return {
    id: icon.id,
    preview: icon.preview,
    priority: icon.priority,
    x: coords.x,
    y: coords.y,
    width: size,
    height: size,
  };
}

export function PromoIconForm() {
  const [sizePreset, setSizePreset] = useState('256x256');
  const [model, setModel] = useState<string>(MODEL_KEYS[0]);
  const [icons, setIcons] = useState<IconConfigItem[]>([]);
  const [template, setTemplate] = useState<TemplateFile | null>(null);
  const [prompt, setPrompt] = useState('');
  const [canvasIcons, setCanvasIcons] = useState<CanvasIcon[]>([]);
  const [results, setResults] = useState<GalleryItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const canvasPreviewRef = useRef<CanvasPreviewRef>(null);

  // Restore form state from sessionStorage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem('hub-image-promo');
    if (saved) {
      try {
        const { prompt: p, model: m, sizePreset: s } = JSON.parse(saved);
        if (p) setPrompt(p);
        if (m) setModel(m);
        if (s) setSizePreset(s);
      } catch {}
    }
  }, []);

  // Persist text form state to sessionStorage (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      sessionStorage.setItem('hub-image-promo', JSON.stringify({ prompt, model, sizePreset }));
    }, 500);
    return () => clearTimeout(timer);
  }, [prompt, model, sizePreset]);

  // Sync icons -> canvasIcons when icons change (preserve drag positions for existing icons)
  const syncCanvasIcons = useCallback((newIcons: IconConfigItem[]) => {
    setCanvasIcons((prev) => {
      const prevMap = new Map(prev.map((c) => [c.id, c]));
      return newIcons.map((icon) => {
        const existing = prevMap.get(icon.id);
        if (existing) {
          // Keep position from canvas but update priority/size
          const size = importanceToSize(icon.importance);
          return {
            ...existing,
            priority: icon.priority,
            width: size,
            height: size,
          };
        }
        return iconToCanvas(icon);
      });
    });
  }, []);

  const handleIconUpload = useCallback(
    (files: SelectedFile[]) => {
      const newIcons: IconConfigItem[] = files.map((f, i) => {
        const priority = icons.length + i + 1;
        return {
          id: crypto.randomUUID(),
          fileName: f.file.name,
          preview: f.preview,
          base64: f.base64,
          mimeType: f.file.type,
          priority,
          importance: defaultImportanceForPriority(priority),
        };
      });
      const updated = [...icons, ...newIcons].slice(0, MAX_ICONS);
      setIcons(updated);
      syncCanvasIcons(updated);
    },
    [icons, syncCanvasIcons],
  );

  const handleIconsChange = useCallback(
    (updated: IconConfigItem[]) => {
      setIcons(updated);
      syncCanvasIcons(updated);
    },
    [syncCanvasIcons],
  );

  const handleIconRemove = useCallback(
    (id: string) => {
      const updated = icons.filter((i) => i.id !== id);
      setIcons(updated);
      syncCanvasIcons(updated);
    },
    [icons, syncCanvasIcons],
  );

  const handleTemplateUpload = useCallback((files: SelectedFile[]) => {
    const f = files[0];
    if (!f) return;
    setTemplate({ file: f.file, base64: f.base64, preview: f.preview });
  }, []);

  const handleCanvasLayoutChange = useCallback((updated: CanvasIcon[]) => {
    setCanvasIcons(updated);
  }, []);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      // Capture canvas layout as image
      const canvasDataUrl = canvasPreviewRef.current?.toDataURL() ?? '';

      const res = await fetch('/api/v1/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'promo-icon',
          payload: {
            model,
            sizePreset,
            icons: icons.map((i) => ({
              base64: stripDataUrlPrefix(i.base64),
              mimeType: i.mimeType,
              priority: i.priority,
              importance: i.importance,
            })),
            templateBase64: template ? stripDataUrlPrefix(template.base64) : undefined,
            templateMimeType: template?.file.type,
            prompt: prompt || undefined,
            canvasImageBase64: canvasDataUrl ? stripDataUrlPrefix(canvasDataUrl) : undefined,
            canvasImageMimeType: canvasDataUrl ? 'image/png' : undefined,
          },
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error?.message || 'Generation failed');

      setResults((prev) => [
        {
          id: crypto.randomUUID(),
          imageBase64: data.imageBase64,
          mimeType: data.mimeType,
          timestamp: Date.now(),
          model: model.includes('flash') ? 'Flash' : 'Pro',
        },
        ...prev,
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Generation failed');
    } finally {
      setGenerating(false);
    }
  }, [model, sizePreset, icons, template, prompt]);

  const canGenerate = icons.length > 0 && !generating;

  return (
    <div>
      {/* Page header */}
      <div className="mb-7">
        <h2 className="text-[22px] font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          상품 아이콘 생성
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          아이템 아이콘을 조합하여 패키지 상품 이미지를 생성합니다.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {/* Step 1: Output Settings */}
        <StepCard number={1} title="출력 설정" subtitle="size & model">
          <div className="flex flex-wrap gap-4">
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                사이즈 프리셋
              </label>
              <SizePresetSelector value={sizePreset} onChange={setSizePreset} />
            </div>
            <div className="flex flex-col gap-1.5">
              <label className="text-xs font-medium uppercase tracking-wider text-zinc-400 dark:text-zinc-500">
                모델
              </label>
              <ModelSelector value={model} onChange={setModel} />
            </div>
          </div>
        </StepCard>

        {/* Step 2: Icon Upload */}
        <StepCard number={2} title="아이콘 업로드" subtitle="importance & priority">
          <ImageUploadZone
            onFilesSelected={handleIconUpload}
            multiple
            maxFiles={MAX_ICONS}
            label="아이콘 파일을 드래그하거나 클릭하여 업로드"
            hint={`PNG, JPG — 최대 ${MAX_ICONS}개`}
            compact
          />

          <IconConfigPanel
            icons={icons}
            onChange={handleIconsChange}
            onRemove={handleIconRemove}
          />
        </StepCard>

        {/* Step 3: Layout Template */}
        <StepCard number={3} title="레이아웃 템플릿" subtitle="style reference">
          <ImageUploadZone
            onFilesSelected={handleTemplateUpload}
            multiple={false}
            compact
            label="스타일 레퍼런스 이미지 업로드"
            hint="기존 패키지 아이콘을 레이아웃 참고용으로 사용"
          />

          {template && (
            <div className="mt-3.5 flex items-center gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3.5 dark:border-zinc-800 dark:bg-zinc-800/50">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900">
                <img
                  src={template.preview}
                  alt="Style reference"
                  className="h-full w-full object-contain"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {template.file.name}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-500">
                  {formatBytes(template.file.size)}
                </p>
                <div className="mt-2 flex gap-1.5">
                  <span className="rounded bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                    Uploaded
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setTemplate(null)}
                className="shrink-0 rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                aria-label="Remove template"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </StepCard>

        {/* Step 4: Canvas Preview */}
        <StepCard number={4} title="Canvas 프리뷰" subtitle="drag to adjust">
          {canvasIcons.length > 0 ? (
            <CanvasPreview
              ref={canvasPreviewRef}
              icons={canvasIcons}
              onLayoutChange={handleCanvasLayoutChange}
            />
          ) : (
            <div className="flex aspect-square max-w-[480px] items-center justify-center rounded-lg border border-dashed border-zinc-300 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800/30">
              <p className="text-sm text-zinc-400 dark:text-zinc-500">
                아이콘을 업로드하면 프리뷰가 표시됩니다
              </p>
            </div>
          )}
        </StepCard>

        {/* Step 5: Generate */}
        <StepCard number={5} title="생성" subtitle="ready" statusDot>
          {/* Optional prompt */}
          <p className="text-xs text-zinc-400 dark:text-zinc-500">추가 프롬프트 (선택)</p>
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="예: 아이템들을 다이아몬드 위에 배치하고 고급스러운 느낌으로 만들어주세요"
            className="mt-1.5 mb-4 w-full resize-y rounded-md border border-zinc-200 bg-zinc-50 px-3.5 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-blue-500"
            rows={2}
          />

          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="inline-flex h-[42px] items-center gap-2 rounded-lg bg-blue-600 px-7 text-sm font-semibold text-white transition-all hover:-translate-y-px hover:bg-blue-500 disabled:pointer-events-none disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
            >
              {generating ? (
                <svg className="h-4 w-4 animate-spin" viewBox="0 0 24 24" fill="none">
                  <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" />
                  <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4z" />
                </svg>
              ) : (
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M13 10V3L4 14h7v7l9-11h-7z" />
                </svg>
              )}
              {generating ? 'Generating...' : 'Generate'}
            </button>

            <span className="ml-auto font-mono text-xs text-zinc-400 dark:text-zinc-500">
              {icons.length} / {MAX_ICONS} icons
            </span>
          </div>

          {error && (
            <div className="mt-3 flex items-center gap-3 rounded-md border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-950/30 dark:text-red-400">
              <span className="flex-1">{error}</span>
              <button
                type="button"
                onClick={handleGenerate}
                disabled={generating}
                className="shrink-0 rounded-md bg-red-600 px-3 py-1 text-xs font-medium text-white transition-colors hover:bg-red-500 disabled:opacity-50"
              >
                다시 시도
              </button>
            </div>
          )}

          {results.length > 0 && (
            <div className="mt-4">
              <ImageGallery items={results} generating={generating} />
            </div>
          )}
        </StepCard>
      </div>
    </div>
  );
}
