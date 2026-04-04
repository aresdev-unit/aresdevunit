# Hub Image 생성 기능 구현 계획

## Context

AresDevUnit Hub 웹사이트에 이미지 생성 기능을 추가한다. 인게임 상품(프로모션) 패키지 아이콘과 아이템 아이콘을 Gemini Image Generation API(nanobanana pro)를 통해 제작하는 기능이다. 기존 Skills 페이지의 사이드바+콘텐츠 레이아웃 패턴을 재활용한다.

---

## 파일 구조 (신규 20개 + 수정 3개)

### 신규 파일

```
packages/shared/src/
├── constants/image.ts              # SIZE_PRESETS, POSITION_PRESETS, MODEL_OPTIONS
└── types/image.ts                  # TS 타입 정의

packages/web/src/
├── lib/
│   ├── gemini.ts                   # Gemini REST API 클라이언트 (fetch 기반)
│   └── image-prompt.ts             # Canvas 레이아웃 → 프롬프트 변환 로직
├── app/
│   └── image/
│       ├── layout.tsx              # 서버 컴포넌트, 사이드바 + {children} 셸
│       ├── page.tsx                # /image → /image/promo-icon 리다이렉트
│       ├── promo-icon/page.tsx     # 클라이언트 컴포넌트, PromoIconForm 렌더
│       └── item-icon/page.tsx       # 클라이언트 컴포넌트, ItemIconForm 렌더
├── components/image/
│   ├── image-sidebar.tsx           # 좌측 카테고리 네비게이션
│   ├── image-upload-zone.tsx       # 파일 드롭존 (재사용 가능)
│   ├── model-selector.tsx          # Flash/Pro 드롭다운
│   ├── size-preset-selector.tsx    # 출력 사이즈 프리셋 선택
│   ├── image-gallery.tsx           # 생성 결과 갤러리 + re-generate + 다운로드
│   ├── canvas-preview.tsx          # HTML5 Canvas + 네이티브 포인터 이벤트 드래그
│   ├── icon-config-panel.tsx       # 아이콘별 우선순위 + 위치 프리셋 설정
│   ├── promo-icon-form.tsx         # 상품 아이콘 전체 워크플로우
│   └── item-icon-form.tsx           # 아이템 아이콘 전체 워크플로우
└── app/api/v1/image/
    └── generate/route.ts           # POST — Gemini API 프록시
```

### 수정 파일

| 파일 | 변경 내용 |
|---|---|
| `packages/web/src/components/nav.tsx` (L26, L93) | `<NavLink href="/image">이미지</NavLink>`, `<MobileLink>` 추가 |
| `packages/shared/src/index.ts` | `export * from './constants/image.js'`, `export * from './types/image.js'` 추가 |
| `packages/web/next.config.ts` (L33) | `img-src`에 `blob:` 추가 (Canvas toDataURL용) |

---

## 신규 라이브러리: 없음

- Canvas 드래그: 네이티브 `onPointerDown/Move/Up` + `useState` (아이콘 1~5개 수준이라 충분)
- 이미지 업로드: `<input type="file">` + `FileReader.readAsDataURL()`
- Gemini API: `fetch()` (기존 패턴 유지, SDK 불필요)

---

## 상세 설계

### 1. Shared Constants (`packages/shared/src/constants/image.ts`)

```typescript
export const IMAGE_CATEGORIES = {
  'promo-icon': '상품 아이콘',
  'item-icon': '아이템 아이콘',
} as const;

export const SIZE_PRESETS = {
  '256x256': { w: 256, h: 256, label: '상품 Product (대)' },
  '180x180': { w: 180, h: 180, label: '상품 Product (소)' },
  '112x112': { w: 112, h: 112, label: '무기/아머/코스튬' },
  '106x106': { w: 106, h: 106, label: '기본 아이콘' },
  '150x150': { w: 150, h: 150, label: '렐릭' },
  '200x200': { w: 200, h: 200, label: '모듈' },
  '100x100': { w: 100, h: 100, label: '재료' },
  '142x182': { w: 142, h: 182, label: 'Large 카드' },
  '106x136': { w: 106, h: 136, label: 'Piece 카드' },
  '68x80':   { w: 68, h: 80,  label: 'HUD' },
} as const;

export const POSITION_PRESETS = {
  'top-center': '중간상단',
  'bottom-left': '좌하단',
  'bottom-center': '중간하단',
  'bottom-right': '우측하단',
} as const;

export const MODEL_OPTIONS = {
  'gemini-3.1-flash-image-preview': 'Flash (빠름)',
  'gemini-3-pro-image-preview': 'Pro (품질)',
} as const;
```

### 2. API Route (`app/api/v1/image/generate/route.ts`)

```
POST /api/v1/image/generate
Body: {
  model: string,
  prompt: string,           // 자동 구성된 프롬프트
  images: string[],         // base64 이미지 배열
  aspectRatio?: string,
}
Response: {
  image: string,            // base64 생성 결과
  text?: string,            // Gemini 텍스트 응답
}
```

- `requireAuth()` 인증 필수
- `checkRateLimit()` 적용
- Zod 유효성 검사
- 서버에서 Gemini API 호출 (API 키 노출 방지)
- env: `GEMINI_API_KEY`

### 3. Gemini 클라이언트 (`lib/gemini.ts`)

- `fetch()` 기반 REST 호출
- `POST https://generativelanguage.googleapis.com/v1beta/models/{model}:generateContent`
- base64 이미지를 `inlineData`로 변환
- `responseModalities: ['TEXT', 'IMAGE']` 설정

### 4. 프롬프트 빌더 (`lib/image-prompt.ts`)

Canvas 레이아웃 정보를 Gemini 프롬프트로 변환:

```typescript
interface IconLayout {
  priority: number;        // 1=메인, 2,3...=서브
  position: { x: number, y: number };  // Canvas 상 좌표 (0~1 정규화)
  size: number;            // 상대 크기 (0~1)
}

function buildPromoPrompt(icons: IconLayout[], userPrompt?: string): string
function buildAppIconPrompt(userPrompt: string): string
```

프롬프트 예시:
```
Create a game shop package icon.
LAYOUT: item1(priority 1, main) at top-center, large. item2(priority 2) at bottom-left, small. item3(priority 3) at bottom-right, small.
Items should overlap with layered depth. White background, shadows and glow effects.
{userPrompt}
```

### 5. 컴포넌트 구조

#### 상품 아이콘 (`promo-icon-form.tsx`)

```
┌─────────────────────────────────────────────┐
│ ① 사이즈 프리셋 [드롭다운]  모델 [Flash ▾]  │
├─────────────────────────────────────────────┤
│ ② 아이콘 업로드 영역                        │
│  [드롭존] + 업로드된 아이콘 목록             │
│  각 아이콘: [썸네일] 우선순위[1▾] 위치[상단▾]│
│  (선택) 추가 프롬프트 [텍스트 입력]          │
├─────────────────────────────────────────────┤
│ ③ 레이아웃 템플릿 업로드 [드롭존]            │
├─────────────────────────────────────────────┤
│ ④ Canvas 프리뷰                             │
│  ┌──────────────────┐                       │
│  │  [드래그 가능한    │                       │
│  │   아이콘 배치]    │                       │
│  └──────────────────┘                       │
├─────────────────────────────────────────────┤
│ ⑤ [Generate]  [Re-generate]                 │
│  생성 결과 갤러리 (썸네일 그리드 + 다운로드) │
└─────────────────────────────────────────────┘
```

상태: `useState`로 관리
- `icons: { file, base64, priority(1~10), position }[]`
- `template: { file, base64 } | null`
- `sizePreset: string`
- `model: string`
- `prompt: string`
- `results: { base64, timestamp }[]`
- `generating: boolean`

#### 아이템 아이콘 (`item-icon-form.tsx`)

```
┌─────────────────────────────────────────────┐
│ 모델 [Flash ▾]                              │
├─────────────────────────────────────────────┤
│ ① Shape & Theme 레퍼런스 [드롭존]            │
├─────────────────────────────────────────────┤
│ ② 프롬프트 [텍스트 입력]                     │
├─────────────────────────────────────────────┤
│ ③ 대표 레퍼런스 아이콘들 [드롭존 (복수)]     │
├─────────────────────────────────────────────┤
│ ④ [Generate]  [Re-generate]                  │
│  생성 결과 갤러리                            │
└─────────────────────────────────────────────┘
```

#### Canvas Preview (`canvas-preview.tsx`)

- HTML5 `<canvas>` 위에 업로드된 아이콘을 `drawImage()`로 렌더
- 우선순위 기반 초기 배치: priority 1 → 크게 중앙상단, 2+ → 작게 하단
- 네이티브 포인터 이벤트로 드래그 구현:
  - `onPointerDown`: 히트 테스트로 클릭된 아이콘 식별
  - `onPointerMove`: 좌표 업데이트 + 재렌더
  - `onPointerUp`: 위치 확정
- 위치는 0~1 정규화 좌표로 저장 → 프롬프트 빌더에 전달

### 6. 레이아웃 (`app/image/layout.tsx`)

Skills 페이지 패턴 복제 — 서버 컴포넌트:

```tsx
export default function ImageLayout({ children }) {
  return (
    <div className="min-h-screen bg-gray-50">
      <header>...</header>
      <div className="max-w-7xl mx-auto px-4">
        <div className="flex flex-col lg:flex-row gap-8">
          <aside className="w-full lg:w-64 shrink-0">
            <ImageSidebar />
          </aside>
          <main className="flex-1 min-w-0">
            {children}
          </main>
        </div>
      </div>
    </div>
  );
}
```

---

## 구현 순서

### Phase 1: Foundation
1. `packages/shared/src/constants/image.ts` — 상수 정의
2. `packages/shared/src/types/image.ts` — 타입 정의
3. `packages/shared/src/index.ts` — re-export 추가
4. `packages/web/src/lib/gemini.ts` — Gemini REST 클라이언트
5. `packages/web/src/lib/image-prompt.ts` — 프롬프트 빌더
6. `packages/web/src/app/api/v1/image/generate/route.ts` — API 엔드포인트

### Phase 2: Shared UI Components
7. `components/image/image-sidebar.tsx`
8. `components/image/image-upload-zone.tsx`
9. `components/image/model-selector.tsx`
10. `components/image/size-preset-selector.tsx`
11. `components/image/image-gallery.tsx`

### Phase 3: App Icon (단순한 쪽 먼저)
12. `app/image/layout.tsx`
13. `app/image/page.tsx` (리다이렉트)
14. `components/image/item-icon-form.tsx`
15. `app/image/item-icon/page.tsx`

### Phase 4: Promo Icon (Canvas 포함)
16. `components/image/canvas-preview.tsx`
17. `components/image/icon-config-panel.tsx`
18. `components/image/promo-icon-form.tsx`
19. `app/image/promo-icon/page.tsx`

### Phase 5: Integration
20. `nav.tsx` — 이미지 메뉴 추가
21. `next.config.ts` — CSP img-src에 `blob:` 추가
22. `.env.local` — `GEMINI_API_KEY` 추가

---

## 이미지 저장

### v1: 클라이언트 메모리 + 다운로드
- 생성 이미지는 클라이언트 메모리(useState)에만 보관
- 사용자가 직접 다운로드로 저장
- DB 변경 없음, 서버 저장 없음

### v2 (추후): 정적 파일 + DB 메타데이터
- `public/generated/{userId}/` 에 파일 저장 → Vercel 정적 서빙 (Neon egress 0)
- DB에 메타데이터만 저장 (GeneratedImage 모델)
- 유저당 최근 20개 FIFO 유지

---

## Phase 6: 최적화

기능 구현 후 성능/반응성 최적화 단계.

### 6-1. 캐싱
- **히스토리 API 응답 캐싱**: `Cache-Control: private, max-age=60` — 갤러리 페이지 재방문 시 불필요한 DB 쿼리 방지
- **생성된 이미지 정적 캐싱**: `Cache-Control: public, max-age=31536000, immutable` — 파일명에 hash 포함이라 영구 캐싱 가능
- **업로드된 레퍼런스 이미지 클라이언트 캐싱**: `URL.createObjectURL()` 재사용, 같은 파일 중복 base64 변환 방지

### 6-2. 반응성 (UX)
- **Generate 중 스켈레톤 UI**: 갤러리에 shimmer placeholder 표시 (Gemini 응답 10~30초 소요)
- **Optimistic UI**: Generate 클릭 즉시 갤러리에 로딩 슬롯 추가, 완료 시 이미지로 교체
- **Canvas 드래그 성능**: `requestAnimationFrame` 사용, 불필요한 re-render 방지
- **이미지 업로드 즉시 프리뷰**: FileReader 완료 전 `URL.createObjectURL()`로 즉시 썸네일 표시
- **폼 상태 유지**: 페이지 이동 후 돌아와도 입력값 유지 (sessionStorage)

### 6-3. 번들/로딩
- **Canvas 컴포넌트 lazy load**: `dynamic(() => import('./canvas-preview'), { ssr: false })` — Canvas는 클라이언트 전용
- **이미지 갤러리 lazy load**: 뷰포트 진입 시 로드 (`IntersectionObserver`)
- **API route streaming**: Gemini 응답이 크므로 chunked response 검토

### 6-4. 에러 복원력
- **Generate 실패 시 재시도**: 자동 1회 retry + 수동 retry 버튼
- **네트워크 끊김 감지**: `navigator.onLine` 체크, 오프라인 시 Generate 비활성화
- **파일 크기 초과 사전 차단**: 업로드 시 클라이언트에서 즉시 검증 (5MB 제한)

---

## 환경 변수

```env
GEMINI_API_KEY=AIzaSy...  # Gemini Image Generation API 키
```

## 검증 방법

1. `npm run dev` 로 로컬 서버 실행
2. `/image` 접속 → 사이드바에 상품 아이콘/아이템 아이콘 카테고리 표시 확인
3. 아이템 아이콘: 레퍼런스 이미지 업로드 → 프롬프트 입력 → Generate → 결과 이미지 표시 + Re-generate
4. 상품 아이콘: 아이콘 여러개 업로드 → 우선순위/위치 설정 → Canvas 프리뷰 확인 → 드래그로 위치 조정 → Generate
5. 생성된 이미지 다운로드 → 정상 PNG 파일 확인
6. 최적화: Generate 중 스켈레톤 표시, Canvas 드래그 60fps 확인
