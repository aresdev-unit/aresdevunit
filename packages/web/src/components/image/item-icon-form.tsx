'use client';

import { useState, useCallback, useEffect } from 'react';
import { MODEL_OPTIONS } from '@aresdevunit/shared';
import { ImageUploadZone } from '@/components/image/image-upload-zone';
import { ModelSelector } from '@/components/image/model-selector';
import { ImageGallery, type GalleryItem } from '@/components/image/image-gallery';
import { StepCard, stripDataUrlPrefix, formatBytes } from './shared';

interface SelectedFile {
  file: File;
  base64: string;
  preview: string;
}

interface RefIcon extends SelectedFile {
  id: string;
}

const MODEL_KEYS = Object.keys(MODEL_OPTIONS) as (keyof typeof MODEL_OPTIONS)[];

export function ItemIconForm() {
  const [model, setModel] = useState<string>(MODEL_KEYS[0]);
  const [shapeRef, setShapeRef] = useState<RefIcon | null>(null);
  const [prompt, setPrompt] = useState('');
  const [referenceIcons, setReferenceIcons] = useState<RefIcon[]>([]);
  const [results, setResults] = useState<GalleryItem[]>([]);
  const [generating, setGenerating] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Restore form state from sessionStorage on mount
  useEffect(() => {
    const saved = sessionStorage.getItem('hub-image-item');
    if (saved) {
      try {
        const { prompt: p, model: m } = JSON.parse(saved);
        if (p) setPrompt(p);
        if (m) setModel(m);
      } catch {}
    }
  }, []);

  // Persist text form state to sessionStorage (debounced)
  useEffect(() => {
    const timer = setTimeout(() => {
      sessionStorage.setItem('hub-image-item', JSON.stringify({ prompt, model }));
    }, 500);
    return () => clearTimeout(timer);
  }, [prompt, model]);

  const handleShapeUpload = useCallback((files: SelectedFile[]) => {
    const selected = files[0];
    if (!selected) return;
    setShapeRef({ ...selected, id: crypto.randomUUID() });
  }, []);

  const handleReferenceUpload = useCallback((files: SelectedFile[]) => {
    const newItems = files.map((f) => ({ ...f, id: crypto.randomUUID() }));
    setReferenceIcons((prev) => [...prev, ...newItems]);
  }, []);

  const removeReference = useCallback((id: string) => {
    setReferenceIcons((prev) => prev.filter((r) => r.id !== id));
  }, []);

  const handleGenerate = useCallback(async () => {
    setGenerating(true);
    setError(null);
    try {
      const res = await fetch('/api/v1/image/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'item-icon',
          payload: {
            model,
            shapeRefBase64: shapeRef ? stripDataUrlPrefix(shapeRef.base64) : undefined,
            shapeRefMimeType: shapeRef?.file.type,
            prompt,
            referenceIcons: referenceIcons.map((r) => ({
              base64: stripDataUrlPrefix(r.base64),
              mimeType: r.file.type,
            })),
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
  }, [model, shapeRef, prompt, referenceIcons]);

  const canGenerate = prompt.trim().length > 0 && !generating;

  return (
    <div>
      {/* Page header */}
      <div className="mb-7">
        <h2 className="text-[22px] font-bold tracking-tight text-zinc-900 dark:text-zinc-50">
          아이템 아이콘 생성
        </h2>
        <p className="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
          인게임 아이템 아이콘을 레퍼런스 기반으로 생성합니다.
        </p>
      </div>

      <div className="flex flex-col gap-6">
        {/* Model selector */}
        <ModelSelector value={model} onChange={setModel} />

        {/* Step 1: Shape & Theme Reference */}
        <StepCard number={1} title="Shape & Theme 레퍼런스" subtitle="visual direction">
          <ImageUploadZone
            onFilesSelected={handleShapeUpload}
            multiple={false}
            label="제작할 아이콘의 형태/테마 레퍼런스 이미지 드롭"
            hint="원하는 아이콘 스타일의 참고 이미지"
            compact
          />

          {shapeRef && (
            <div className="mt-3.5 flex items-center gap-4 rounded-lg border border-zinc-200 bg-zinc-50 p-3.5 dark:border-zinc-800 dark:bg-zinc-800/50">
              <div className="flex h-20 w-20 shrink-0 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-100 dark:border-zinc-700 dark:bg-zinc-900">
                <img
                  src={shapeRef.preview}
                  alt="Shape reference"
                  className="h-full w-full object-cover"
                />
              </div>
              <div className="min-w-0 flex-1">
                <p className="truncate text-sm font-medium text-zinc-900 dark:text-zinc-100">
                  {shapeRef.file.name}
                </p>
                <p className="mt-0.5 font-mono text-[11px] text-zinc-500 dark:text-zinc-500">
                  {formatBytes(shapeRef.file.size)}
                </p>
                <div className="mt-2 flex gap-1.5">
                  <span className="rounded bg-blue-500/10 px-2 py-0.5 text-[10px] font-medium text-blue-600 dark:text-blue-400">
                    Uploaded
                  </span>
                </div>
              </div>
              <button
                type="button"
                onClick={() => setShapeRef(null)}
                className="shrink-0 rounded-md p-1.5 text-zinc-400 transition-colors hover:bg-zinc-200 hover:text-zinc-600 dark:hover:bg-zinc-700 dark:hover:text-zinc-300"
                aria-label="Remove shape reference"
              >
                <svg className="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
          )}
        </StepCard>

        {/* Step 2: Prompt */}
        <StepCard number={2} title="프롬프트" subtitle="description">
          <textarea
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="예: 파란색 크리스탈 형태의 스킬 아이콘, 중앙에 빛나는 별 모양, SF 메카닉 스타일, 어두운 배경에 글로우 효과"
            className="w-full resize-y rounded-md border border-zinc-200 bg-zinc-50 px-3.5 py-3 text-sm text-zinc-900 placeholder:text-zinc-400 focus:border-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-500/20 dark:border-zinc-700 dark:bg-zinc-800 dark:text-zinc-100 dark:placeholder:text-zinc-500 dark:focus:border-blue-500"
            rows={3}
          />
        </StepCard>

        {/* Step 3: Reference Icons */}
        <StepCard number={3} title="대표 레퍼런스 아이콘" subtitle="style consistency">
          <ImageUploadZone
            onFilesSelected={handleReferenceUpload}
            multiple
            label="인게임에서 사용 중인 대표 아이콘들을 업로드하세요"
            hint="스타일 일관성을 위한 참고 자료 (복수 선택 가능)"
            compact
          />

          {referenceIcons.length > 0 && (
            <div className="mt-3.5 flex flex-wrap gap-2.5">
              {referenceIcons.map((ref) => (
                <div key={ref.id} className="flex w-[72px] flex-col items-center gap-1.5">
                  <div className="group relative flex h-16 w-16 items-center justify-center overflow-hidden rounded-lg border border-zinc-200 bg-zinc-50 dark:border-zinc-700 dark:bg-zinc-800">
                    <img
                      src={ref.preview}
                      alt={ref.file.name}
                      className="h-12 w-12 rounded-md object-cover"
                    />
                    <button
                      type="button"
                      onClick={() => removeReference(ref.id)}
                      className="absolute right-0.5 top-0.5 flex h-[18px] w-[18px] items-center justify-center rounded-full bg-black/70 text-[12px] text-red-400 opacity-0 transition-opacity group-hover:opacity-100"
                      aria-label={`Remove ${ref.file.name}`}
                    >
                      &times;
                    </button>
                  </div>
                  <span className="w-full truncate text-center font-mono text-[10px] text-zinc-500 dark:text-zinc-500">
                    {ref.file.name.replace(/\.[^.]+$/, '')}
                  </span>
                </div>
              ))}
            </div>
          )}
        </StepCard>

        {/* Step 4: Generate */}
        <StepCard number={4} title="생성" subtitle="ready" statusDot>
          <div className="flex items-center gap-3">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={!canGenerate}
              className="inline-flex h-[42px] items-center gap-2 rounded-lg bg-blue-600 px-7 text-sm font-semibold text-white transition-all hover:bg-blue-500 hover:-translate-y-px disabled:pointer-events-none disabled:opacity-50 dark:bg-blue-600 dark:hover:bg-blue-500"
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

            {results.length > 0 && (
              <button
                type="button"
                onClick={handleGenerate}
                disabled={!canGenerate}
                className="inline-flex h-[42px] items-center rounded-lg border border-zinc-200 px-5 text-sm font-medium text-zinc-600 transition-colors hover:bg-zinc-100 hover:text-zinc-900 disabled:pointer-events-none disabled:opacity-50 dark:border-zinc-700 dark:text-zinc-400 dark:hover:bg-zinc-800 dark:hover:text-zinc-100"
              >
                Re-generate
              </button>
            )}

            <span className="ml-auto font-mono text-xs text-zinc-400 dark:text-zinc-500">
              {results.length} generated
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
              <ImageGallery items={results} generating={generating} onRegenerate={handleGenerate} />
            </div>
          )}
        </StepCard>
      </div>
    </div>
  );
}

