# Plan: User Approval + Worklog (v2 — post-review)

## Overview
유저 승인 시스템 + 업무 시작/마감(Worklog) 기능 추가.
GitHub 가입 후 ADMIN 승인 필요. Worklog는 에이전트 세션 간 컨텍스트 연속성 제공.

---

## Phase 1: DB Schema + Migration

### 1-1. User 모델에 status 추가
- `UserStatus` enum: `PENDING | APPROVED | REJECTED`
- `User.status` 필드 추가, 기본값 `PENDING`
- **기존 유저는 migration에서 전부 `APPROVED`로 설정** (하위호환)
- Migration SQL 순서: `CREATE TYPE "UserStatus"` → `ALTER TABLE users ADD COLUMN`

### 1-2. Worklog 모델 신규
```prisma
model Worklog {
  id         String   @id @default(uuid())
  summary    String   @db.Text
  unfinished String?  @db.Text
  metadata   Json?
  date       DateTime @db.Date
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  userId String? @map("user_id")
  user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@unique([userId, date])
  @@index([userId, date(sort: Desc)])
  @@map("worklogs")
}
```
- `onDelete: SetNull` — 유저 삭제해도 worklog 기록 보존 (감사 목적)
- userId `String?`, user `User?` — nullable FK (Prisma SetNull 요구사항)
- `@@unique([userId, date])` — NULL userId는 PostgreSQL에서 unique 제약 안 걸림 (고아 레코드 허용, 의도된 동작)

### 1-3. User에 relation 추가
```prisma
worklogs Worklog[]
```

### 파일 변경:
- `packages/web/prisma/schema.prisma`
- 새 migration SQL

---

## Phase 2: 접근 제어 (API 미들웨어 + 웹)

### 2-1. `requireApproved()` 헬퍼 추가
- `api-middleware.ts`에 `requireApproved()` 함수 추가
- `requireAuth()` 후 DB에서 `user.status`만 SELECT (전체 row 아님)
- `status !== APPROVED` → 403 `ACCOUNT_PENDING` 에러
- 반환 타입: `AuthUser` (기존과 동일, status는 gate 전용 — 하위에 전달 안 함)
- 현재 규모에서 DB 쿼리 부담 없음. 향후 필요시 30s TTL 캐시 고려

### 2-2. 기존 API에 적용
승인 필요 (requireAuth → requireApproved 교체):
- `GET /api/v1/skills` (목록)
- `GET /api/v1/skills/[name]` (상세)
- `POST /api/v1/skills` (배포)
- `POST /api/v1/skills/[name]/versions` (버전 추가)
- `GET /api/v1/skills/[name]/download` (다운로드)
- `POST /api/v1/skills/[name]/like` (좋아요)
- `GET /api/v1/dashboard/*` (대시보드)

승인 불필요:
- `GET /api/v1/users/me` (whoami — 본인 상태 확인용)
- `GET /api/v1/health`
- `/api/v1/auth/*` (인증 플로우)
- `GET /api/v1/cli-guide`, `GET /api/v1/install-guide`, `GET /api/v1/install.sh`

### 2-3. Device code token endpoint
- 토큰 발급 자체는 허용 (PENDING 유저도 토큰 받음)
- CLI는 per-request `requireApproved()` 에서 403 처리
- 이유: 토큰이 있어야 whoami로 본인 상태 확인 가능

### 2-4. Refresh token + REJECTED 처리
- `POST /api/v1/auth/refresh` — 토큰 갱신 시 DB에서 user.status 조회
  - `REJECTED` → 403 반환 + refresh token 폐기
- 어드민이 `REJECTED` 설정 시 → 해당 유저의 모든 refresh token revoke

### 2-5. REJECTED 상태 정의
- REJECTED 유저: 로그인 가능하나 모든 API 차단 (whoami 제외)
- refresh token 갱신 시 거부 → 자연스럽게 접근 불가
- 어드민이 다시 APPROVED로 변경 가능 (복구 가능)

### 2-6. 웹 페이지 접근 제어
- auth.ts `jwt` callback: **매 호출마다** DB에서 status 조회 (account 존재 여부와 무관)
  - 이렇게 해야 승인 즉시 반영됨 (30일 JWT 만료 기다릴 필요 없음)
- session에 `status` 필드 포함
- 미승인 유저 → `/pending` 페이지로 리다이렉트
- `/pending` 페이지 신규 생성: "승인 대기 중" 안내

### 파일 변경:
- `packages/web/src/lib/api-middleware.ts` — `requireApproved()` 추가
- `packages/web/src/lib/auth.ts` — jwt callback에서 매번 status 조회, session에 status 포함
- `packages/web/src/app/api/v1/auth/refresh/route.ts` — status 체크 추가
- `packages/web/src/app/api/v1/skills/route.ts` — GET에 승인 체크
- `packages/web/src/app/api/v1/skills/[name]/route.ts`
- `packages/web/src/app/api/v1/skills/[name]/download/route.ts`
- `packages/web/src/app/api/v1/skills/[name]/like/route.ts`
- `packages/web/src/app/api/v1/skills/[name]/versions/route.ts`
- `packages/web/src/app/api/v1/dashboard/stats/route.ts`
- `packages/web/src/app/api/v1/dashboard/feed/route.ts`
- `packages/web/src/app/pending/page.tsx` — 신규
- `packages/web/src/components/nav.tsx` — 미승인 시 메뉴 제한

---

## Phase 3: 어드민 유저 승인

### 3-1. API 변경
- `PATCH /api/v1/admin/users/[id]`:
  - `z.object({ role?: enum, status?: enum }).refine(at least one)`
  - 본인 상태/역할 변경 금지 (기존 self-check 확장)
  - `status: REJECTED` 설정 시 → 해당 유저의 모든 refresh token revoke
  - `role: ADMIN` + `status: REJECTED` 동시 설정 금지 (validation)
- `GET /api/v1/admin/users` — 응답에 `status` 필드 추가

### 3-2. 어드민 웹 UI
- 어드민 페이지 탭에 '승인 대기' 추가
- PENDING 유저 목록 + 승인/거절 버튼
- 기존 사용자 탭에도 status 표시

### 파일 변경:
- `packages/web/src/app/api/v1/admin/users/[id]/route.ts`
- `packages/web/src/app/api/v1/admin/users/route.ts`
- `packages/web/src/app/admin/page.tsx`

---

## Phase 4: Worklog API

### 4-1. `POST /api/v1/worklog` — 마감 기록 저장
- 인증 + 승인 필요 (`requireApproved`)
- Body: `{ summary: string, unfinished?: string, metadata?: object }`
- date: `dayjs().tz('Asia/Seoul').format('YYYY-MM-DD')` (명시적 KST)
- Prisma `upsert` on `(userId, date)` — 동시 요청 시 ON CONFLICT로 안전

### 4-2. `GET /api/v1/worklog` — 본인 기록 조회
- 인증 + 승인 필요
- Query: `?limit=3` (기본 3, **최대 100**)
- 최신순 정렬

### 4-3. `GET /api/v1/admin/worklog` — 전체 인원 히스토리
- ADMIN 전용
- Query: `?username=xxx&limit=20&cursor=<last-id>` (커서 기반 pagination, **최대 100**)
- username 필터 선택

### 파일 변경:
- `packages/web/src/app/api/v1/worklog/route.ts` — 신규
- `packages/web/src/app/api/v1/admin/worklog/route.ts` — 신규

---

## Phase 5: 어드민 Worklog 히스토리 UI

- 어드민 페이지에 `업무 기록` 탭 추가
- 인원별 필터
- 요약/미완료 내용 표시

### 파일 변경:
- `packages/web/src/app/admin/page.tsx` — 탭 추가

---

## Phase 6: CLI 커맨드

### 6-1. `aresdevhubcli work start`
- `GET /api/v1/worklog?limit=3` 호출
- stdout으로 이전 기록 출력
- `--json` 모드: JSON, 아니면 마크다운
- 403 `ACCOUNT_PENDING` → "계정 승인 대기 중입니다. 관리자에게 문의하세요."

### 6-2. `aresdevhubcli work end`
- `--summary` 플래그 필수 (stdin 미지원 — 에이전트 환경에서 hang 방지)
- `--unfinished` 플래그로 이월 항목 별도 전달 가능 (선택)
- `--summary` 없으면 에러 + usage 출력
- `POST /api/v1/worklog` 호출
- 403 → "계정 승인 대기 중입니다."

### 6-3. CLI 전역 403 처리
- `api-client.ts`에서 403 + `ACCOUNT_PENDING` 코드 감지
- 전용 에러 클래스 `AccountPendingError` 추가
- 모든 커맨드에서 자동 처리 (whoami 포함 — whoami는 서버에서 200 반환하므로 문제 없음)

### 파일 변경:
- `packages/cli/src/commands/work.ts` — 신규
- `packages/cli/src/index.ts` — 커맨드 등록
- `packages/cli/src/lib/api-client.ts` — 403 처리

---

## 작업 순서 요약

| Phase | 내용 | 신규 파일 | 변경 파일 |
|-------|------|-----------|-----------|
| 1 | DB Schema | migration SQL | schema.prisma |
| 2 | 접근 제어 | pending/page.tsx | api-middleware, auth, skills routes, dashboard routes, refresh route, nav |
| 3 | 어드민 승인 | - | admin users API, admin page |
| 4 | Worklog API | worklog/route.ts, admin/worklog/route.ts | - |
| 5 | Worklog UI | - | admin/page.tsx |
| 6 | CLI | work.ts | index.ts, api-client.ts |
