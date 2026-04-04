# Hub Image Feature — Executable Checklist

## Phase 1: Foundation
- [ ] `packages/shared/src/constants/image.ts` — IMAGE_CATEGORIES, SIZE_PRESETS, POSITION_PRESETS(4개: 중간상단/좌하단/중간하단/우측하단), MODEL_OPTIONS, MAX_PRIORITY(10)
- [ ] `packages/shared/src/types/image.ts` — IconItem, PromoIconRequest, ItemIconRequest, GenerateResponse 타입
- [ ] `packages/shared/src/index.ts` — image constants + types re-export 추가
- [ ] `packages/web/src/lib/gemini.ts` — fetch 기반 Gemini REST client (generateImage 함수)
- [ ] `packages/web/src/lib/image-prompt.ts` — buildPromoPrompt, buildItemIconPrompt 함수
- [ ] `packages/web/src/app/api/v1/image/generate/route.ts` — POST endpoint, Zod validation, requireAuth, Gemini proxy
- [ ] Verify: `npx tsc --noEmit` passes

## Phase 2: Shared UI Components
- [ ] `packages/web/src/components/image/image-sidebar.tsx` — 상품 아이콘/아이템 아이콘 카테고리 nav (usePathname)
- [ ] `packages/web/src/components/image/image-upload-zone.tsx` — 드래그&드롭 파일 업로드 + 썸네일
- [ ] `packages/web/src/components/image/model-selector.tsx` — Flash/Pro 드롭다운
- [ ] `packages/web/src/components/image/size-preset-selector.tsx` — 사이즈 프리셋 드롭다운
- [ ] `packages/web/src/components/image/image-gallery.tsx` — 결과 갤러리 그리드 + 다운로드 + re-generate 슬롯
- [ ] Verify: components import 정상, 타입 에러 없음

## Phase 3: Item Icon Page
- [ ] `packages/web/src/app/image/layout.tsx` — 서버 컴포넌트, sidebar + children
- [ ] `packages/web/src/app/image/page.tsx` — redirect to /image/promo-icon
- [ ] `packages/web/src/components/image/item-icon-form.tsx` — shape ref upload + prompt + reference icons + generate
- [ ] `packages/web/src/app/image/item-icon/page.tsx` — ItemIconForm 렌더
- [ ] Verify: /image/item-icon 페이지 렌더링

## Phase 4: Promo Icon Page
- [ ] `packages/web/src/components/image/canvas-preview.tsx` — HTML5 Canvas + 포인터 이벤트 드래그, priority 기반 auto-arrange
- [ ] `packages/web/src/components/image/icon-config-panel.tsx` — 우선순위(1~10) + 위치 프리셋(4개) 설정 UI
- [ ] `packages/web/src/components/image/promo-icon-form.tsx` — 전체 워크플로우: 사이즈→업로드→템플릿→canvas→generate
- [ ] `packages/web/src/app/image/promo-icon/page.tsx` — PromoIconForm 렌더
- [ ] Verify: /image/promo-icon 페이지 렌더링, canvas 드래그 동작

## Phase 5: Integration
- [ ] `packages/web/src/components/nav.tsx` L26에 `<NavLink href="/image">이미지</NavLink>` 추가
- [ ] `packages/web/src/components/nav.tsx` L93에 `<MobileLink>` 추가
- [ ] `packages/web/next.config.ts` L33 img-src에 `blob:` 추가
- [ ] `.env.local`에 `GEMINI_API_KEY` 추가
- [ ] Verify: nav에 이미지 메뉴 표시, CSP 에러 없음

## Phase 6: Optimization
- [ ] Generate 중 스켈레톤/shimmer placeholder
- [ ] Optimistic UI — 클릭 즉시 갤러리에 로딩 슬롯
- [ ] Canvas requestAnimationFrame 드래그
- [ ] canvas-preview dynamic import (ssr: false)
- [ ] URL.createObjectURL 즉시 썸네일
- [ ] sessionStorage 폼 상태 유지
- [ ] Generate 실패 시 retry 버튼
- [ ] 파일 크기 클라이언트 검증 (5MB)
- [ ] Verify: skeleton 표시, canvas 60fps, lazy load 동작

## Final Audit
- [ ] `npx tsc --noEmit` clean
- [ ] /image/promo-icon E2E flow
- [ ] /image/item-icon E2E flow
- [ ] API route auth check
- [ ] CSP headers correct
- [ ] No console errors
