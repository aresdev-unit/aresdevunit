# Promo Icon Prompt Refactor — Executable Checklist

## 1. Shared Constants (`packages/shared/src/constants/image.ts`)
- [ ] Delete `POSITION_PRESETS` and `PositionPreset` type
- [ ] Add `IMPORTANCE_LEVELS`:
  ```ts
  export const IMPORTANCE_LEVELS = {
    'highest': '최상',
    'high': '상',
    'medium': '중',
    'low': '하',
  } as const;
  export type ImportanceLevel = keyof typeof IMPORTANCE_LEVELS;
  ```
- [ ] Verify: grep for `POSITION_PRESETS` — zero hits outside this file

## 2. Shared Types (`packages/shared/src/types/image.ts`)
- [ ] `IconItem.position: string` → `IconItem.importance: string`
- [ ] `PromoIconRequest.icons[].position` → `importance`
- [ ] Add `canvasImageBase64?: string` and `canvasImageMimeType?: string` to `PromoIconRequest`
- [ ] Verify: grep for `position` in types/image.ts — zero hits

## 3. Prompt Builder (`packages/web/src/lib/image-prompt.ts`)
- [ ] Rewrite `buildPromoPrompt` signature:
  ```ts
  interface PromoIconInfo {
    index: number;        // 1-based, matches image order sent to Gemini
    importance: string;   // ImportanceLevel key
    priority: number;     // z-order (lower = front when overlapping)
  }
  export function buildPromoPrompt(
    icons: PromoIconInfo[],
    width: number,
    height: number,
    hasCanvasCapture: boolean,
    hasTemplate: boolean,
    userPrompt?: string,
  ): string
  ```
- [ ] Prompt structure:
  1. Task description with output size
  2. Per-icon role mapping: "Image N: importance=최상 (render largest, ~40% of canvas), z-order=1 (frontmost when overlapping)"
  3. Importance → size mapping: highest=40%, high=25%, medium=15%, low=10%
  4. z-order explanation: "When icons overlap, lower priority number appears in front"
  5. If hasCanvasCapture: "The next image is a CANVAS LAYOUT REFERENCE showing exact spatial positions. Place each item at the same position."
  6. If hasTemplate: "The last image is a STYLE REFERENCE for visual composition."
  7. General instructions: layered depth, shadows, white bg
  8. Optional userPrompt appended
- [ ] Delete `positionDescription` helper (no longer needed)
- [ ] Verify: no references to `position` in prompt builder

## 4. API Route (`packages/web/src/app/api/v1/image/generate/route.ts`)
- [ ] Update `iconSchema`: `position: z.string()` → `importance: z.string()`
- [ ] Add to `promoPayloadSchema`: `canvasImageBase64: z.string().optional()`, `canvasImageMimeType`
- [ ] Change parts order in `handlePromoIcon`:
  1. Text prompt (FIRST — so Gemini reads instructions before images)
  2. Canvas capture image (if provided) — layout reference
  3. Icon images (sorted by priority for z-order)
  4. Template image (last — style reference)
- [ ] Update `buildPromoPrompt` call: pass `PromoIconInfo[]` with index/importance/priority
- [ ] Verify: zod schema accepts importance, rejects position

## 5. Icon Config Panel (`packages/web/src/components/image/icon-config-panel.tsx`)
- [ ] `IconConfigItem.position` → `IconConfigItem.importance`
- [ ] Replace position dropdown (4 options: 중간상단/좌하단/중간하단/우측하단) with importance dropdown (4 options: 최상/상/중/하)
- [ ] Import `IMPORTANCE_LEVELS` instead of `POSITION_PRESETS`
- [ ] Verify: no references to `position` or `POSITION_PRESETS`

## 6. Canvas Preview (`packages/web/src/components/image/canvas-preview.tsx`)
- [ ] Add `ref` forwarding or `getDataURL()` method via `useImperativeHandle`:
  ```ts
  export interface CanvasPreviewRef {
    toDataURL: () => string;
  }
  ```
- [ ] Use `forwardRef` + `useImperativeHandle` to expose canvas.toDataURL()
- [ ] Verify: ref can be used from parent to capture canvas

## 7. Promo Icon Form (`packages/web/src/components/image/promo-icon-form.tsx`)
- [ ] Replace `position` with `importance` in all icon state
- [ ] Change `defaultPositionForPriority` → `defaultImportanceForPriority`:
  - priority 1 → 'highest'
  - priority 2 → 'high'  
  - priority 3-4 → 'medium'
  - priority 5+ → 'low'
- [ ] Add `canvasRef = useRef<CanvasPreviewRef>(null)` and pass to CanvasPreview
- [ ] In `handleGenerate`: capture canvas via `canvasRef.current?.toDataURL()` and send as `canvasImageBase64`
- [ ] Update fetch payload: `position` → `importance`, add `canvasImageBase64`/`canvasImageMimeType`
- [ ] Verify: no references to `position` or `POSITION_PRESETS`

## 8. Shared Build
- [ ] `cd packages/shared && npm run build` — verify dist compiles clean
- [ ] `npx tsc --noEmit -p packages/web/tsconfig.json` — verify web compiles clean

## 9. Cleanup
- [ ] grep entire codebase for `POSITION_PRESETS` — zero hits
- [ ] grep entire codebase for `PositionPreset` — zero hits  
- [ ] grep for `position.*preset` in image components — zero hits
