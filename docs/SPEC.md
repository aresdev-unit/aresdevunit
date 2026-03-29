# AresDevUnit Hub - Technical Specification v3.0

## 1. Executive Summary

AresDevUnit Hub는 AI Agent(Claude Code, Codex 등) 사용자들이 제작한 skill을 공유하고 관리하는 플랫폼이다. CLI를 통해 skill의 게시(publish)와 설치(install)를 수행하고, Web을 통해 현황 조회와 관리를 제공한다.

### 1.1 Core Principles
- **CLI-first**: 모든 실행 기능은 CLI에서 수행, Web은 조회/관리 전용
- **Agent-native**: AI Agent가 직접 CLI를 호출하여 사용하는 것을 1차 사용 시나리오로 설계
- **Simple Hub**: 신규 기능은 CLI 커맨드 + Web 현황 페이지 패턴으로 확장
- **Open by default**: skill 조회 및 설치는 비인증으로 가능, 게시만 인증 필요

### 1.2 Target Users
| 사용자 유형 | 설명 | 주 인터페이스 |
|-------------|------|---------------|
| Skill Author | skill을 제작하고 배포하는 개발자 | CLI |
| Skill Consumer | skill을 검색하고 설치하는 사용자/Agent | CLI + Web |
| Admin | 플랫폼 관리자 | Web |

### 1.3 Monorepo Setup
- **Package Manager**: npm workspaces (corepack으로 npm 버전 고정)
- **Build Order**: shared → cli, web (병렬)
- **Node.js**: 20 LTS (.nvmrc로 고정)
- **Packages**: `packages/cli`, `packages/web`, `packages/shared`
- **Lockfile**: `package-lock.json` Git 커밋 필수. CI에서 `npm ci` 사용.

---

## 2. System Architecture

### 2.1 High-Level Architecture

```
┌─────────────────────────────────────────────────────────────────┐
│                        AresDevUnit Hub                          │
│                                                                 │
│  ┌───────────┐     ┌─────────────────────────┐     ┌─────────┐ │
│  │           │     │      Next.js App         │     │         │ │
│  │  Hub CLI  │────→│  ┌─────────┐ ┌────────┐ │────→│ GitHub  │ │
│  │  (npm)    │←────│  │   API   │ │  Pages │ │←────│  API    │ │
│  │           │     │  │ Routes  │ │        │ │     │         │ │
│  └───────────┘     │  └────┬────┘ └────────┘ │     └─────────┘ │
│                    │       │                  │                 │
│                    └───────┼──────────────────┘                 │
│                            │                                    │
│                    ┌───────────────────────────┐                │
│                    │ Neon Postgres              │                │
│                    │ (Vercel Marketplace 통합)  │                │
│                    └───────────────────────────┘                │
└─────────────────────────────────────────────────────────────────┘
                            │
                    ┌───────┴───────┐
                    │  GitHub Repo  │
                    │ skill-registry│
                    │  (storage)    │
                    └───────────────┘
```

### 2.2 Component Responsibilities

| Component | Responsibility | Technology |
|-----------|---------------|------------|
| Hub CLI | skill publish/install/관리, 인증 | Node.js, Commander.js, TypeScript |
| Next.js Pages | 랜딩, skill 브라우징, 대시보드, admin | Next.js App Router, Tailwind CSS |
| Next.js API Routes | REST API (CLI 및 Web 공용) | Next.js Route Handlers |
| Neon Postgres | 사용자, skill 메타데이터, 활동 로그, refresh token, device code | Prisma ORM (Vercel Marketplace Neon 통합) |
| GitHub Repo | skill 파일 저장, 버전 관리 | GitHub REST API v3 |

### 2.3 API Middleware: Dual Auth

API Route에서 두 가지 인증 소스를 지원한다:
```
1. Authorization: Bearer <jwt> 헤더 → JWT 검증 (CLI 호출)
2. 헤더 없음 → NextAuth.js 세션 쿠키 확인 (Web 호출)
3. 둘 다 없음 → Anonymous (비인증 엔드포인트만 허용)
```
우선순위: Bearer > Cookie > Anonymous

### 2.4 Authentication Flow: Device Code + GitHub OAuth

```
┌──────┐              ┌──────────┐              ┌────────┐        ┌──────┐
│ CLI  │              │  Hub API │              │Hub Web │        │GitHub│
└──┬───┘              └────┬─────┘              └───┬────┘        └──┬───┘
   │ POST /auth/device     │                        │                │
   │──────────────────────→│                        │                │
   │ {device_code,         │                        │                │
   │  user_code, url}      │                        │                │
   │←──────────────────────│                        │                │
   │                       │  [DB에 device_code     │                │
   │                       │   저장, expires_at]    │                │
   │                       │                        │                │
   │ "브라우저에서 코드 입력: ABCD-1234"             │                │
   │                       │                        │                │
   ║ (사용자 브라우저)      │                        │                │
   ║──────────────────────────────────────────────→│                │
   ║                       │   /device 페이지에서    │                │
   ║                       │   user_code 입력       │                │
   ║                       │←───────────────────────│                │
   ║                       │                        │                │
   ║                       │  GitHub OAuth redirect  │                │
   ║                       │────────────────────────────────────────→│
   ║                       │                        │                │
   ║                       │  OAuth callback (code)  │                │
   ║                       │←────────────────────────────────────────│
   ║                       │                        │                │
   ║                       │  [github_id로 User upsert]              │
   ║                       │  [DB: device_code.status = "approved"]  │
   ║                       │  [DB: device_code.user_id = user.id]    │
   │                       │                        │                │
   │ POST /auth/device/token (polling, 5초 간격)     │                │
   │──────────────────────→│                        │                │
   │                       │  [DB에서 device_code 조회]               │
   │                       │  [status == "approved"]                  │
   │                       │  [JWT access token 생성]                 │
   │                       │  [RefreshToken DB 생성]                  │
   │ {access_token,        │                        │                │
   │  refresh_token}       │                        │                │
   │←──────────────────────│                        │                │
   │                       │                        │                │
   │ [~/.aresdevunit/config.json에 저장 (0600)]     │                │
   │                       │                        │                │
```

계정 통합 정책: `github_id`를 기준으로 User를 upsert. Web OAuth와 CLI Device Code Flow 모두 GitHub OAuth를 경유하므로 동일한 `github_id`로 통합된다.

### 2.5 Request Flow

#### Skill Publish Flow
```
Author (CLI)
  │
  ├─ 1. hub publish
  ├─ 2. CLI: skill.json 유효성 검증 (zod, local)
  ├─ 3. CLI → API: POST /api/skills (신규) 또는 POST /api/skills/:name/versions (업데이트)
  │       ├─ Body: { skill metadata + file content (base64) }
  │       └─ Header: Authorization: Bearer <access_token>
  ├─ 4. API: 서버 측 검증 (중복, 버전, 파일 크기, prompt injection 패턴 스캔)
  ├─ 5. API → GitHub: 파일 생성/업데이트 (GitHub App token)
  │       └─ PUT /repos/aresdev-unit/skill-registry/contents/{path}
  ├─ 6. API → DB: skill 메타데이터 upsert
  │       └─ 실패 시: GitHub 파일 롤백 (DELETE)
  ├─ 7. API → DB: publish lock 해제
  └─ 8. API → CLI: 201 Created (신규) 또는 200 OK (업데이트) { skill_id, version, url }
```

#### Skill Install Flow
```
Consumer (CLI)
  │
  ├─ 1. hub install <skill-name>
  ├─ 2. CLI → API: GET /api/skills/{name}/download?version=latest
  │       └─ Header: Authorization: Bearer <access_token> (선택)
  ├─ 3. API → GitHub: 파일 다운로드 (GitHub App token)
  │       └─ 10명 규모에서 캐싱 불필요, GitHub API 직접 호출
  ├─ 5. API → DB: downloads atomic increment
  │       └─ UPDATE skills SET downloads = downloads + 1 WHERE name = ?
  │       └─ 인증 사용자: ActivityLog 기록 (10분 내 동일 skill 중복 제거)
  │       └─ 비인증 사용자: 카운트만 증가, ActivityLog 미기록
  ├─ 6. API → CLI: 200 OK { file_content, metadata }
  ├─ 7. CLI: agent 유형 감지 (Section 5.5)
  │       └─ 감지 실패 시: --agent 플래그 또는 대화형 프롬프트
  ├─ 8. CLI: 파일 배치 + installed.json 업데이트
  └─ 9. CLI: 설치 확인 메시지 + 미검증 skill 경고
```

---

## 3. Data Model

### 3.1 ERD

```
┌──────────────┐     ┌──────────────────┐     ┌──────────────────┐
│    User      │     │     Skill        │     │  SkillVersion    │
├──────────────┤     ├──────────────────┤     ├──────────────────┤
│ id       (PK)│←─┐  │ id           (PK)│←─┐  │ id           (PK)│
│ github_id    │  │  │ author_id    (FK)│  │  │ skill_id     (FK)│
│ username     │  │  │ name (unique*)   │  │  │ version          │
│ email        │  │  │ description      │  │  │ changelog        │
│ avatar_url   │  │  │ readme           │  │  │ repo_path        │
│ role         │  │  │ category         │  │  │ file_hash        │
│ created_at   │  │  │ latest_version   │  │  │ created_at       │
│ updated_at   │  │  │ agent_types      │  │  └──────────────────┘
└──────────────┘  │  │ keywords         │  │
       │          │  │ license          │  │  ┌──────────────────┐
       │          └──│ downloads        │  │  │  ActivityLog     │
       │             │ is_verified      │  │  ├──────────────────┤
       │             │ deprecated       │  └──│ skill_id     (FK)│
       │             │ created_at       │     │ user_id      (FK)│
       │             │ updated_at       │     │ action           │
       │             └──────────────────┘     │ metadata (JSON)  │
       │                                      │ created_at       │
       │             ┌──────────────────┐     └──────────────────┘
       │             │  SkillLike       │
       │             ├──────────────────┤
       └─────────────│ user_id      (FK)│
                     │ skill_id     (FK)│
                     │ created_at       │
                     └──────────────────┘

       ┌──────────────────┐
       │  RefreshToken     │
       ├──────────────────┤
       │ id           (PK)│
       │ token_hash       │
       │ user_id      (FK)│
       │ expires_at       │
       │ revoked_at       │
       │ created_at       │
       └──────────────────┘

* name unique 제약: WHERE deprecated = false (partial unique index)
  deprecated된 skill은 name을 "{name}__deprecated_{timestamp}"로 변경하여 재사용 허용
```

### 3.2 Prisma Schema

```prisma
generator client {
  provider = "prisma-client-js"
}

datasource db {
  provider = "postgresql"
  url      = env("DATABASE_URL")
}

enum UserRole {
  USER
  ADMIN
}

enum ActionType {
  PUBLISH
  INSTALL
  UNINSTALL
  UPDATE
  LIKE
  UNLIKE
}

model User {
  id         String   @id @default(uuid())
  githubId   String   @unique @map("github_id")
  username   String   @unique
  email      String?
  avatarUrl  String?  @map("avatar_url")
  role       UserRole @default(USER)
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  skills        Skill[]
  activities    ActivityLog[]
  likes         SkillLike[]
  refreshTokens RefreshToken[]
  deviceCodes   DeviceCode[]

  @@map("users")
}

model Skill {
  id            String    @id @default(uuid())
  name          String
  description   String
  readme        String?   @db.Text
  category      String
  latestVersion String    @map("latest_version")
  agentTypes    String[]  @map("agent_types")
  keywords      String[]  @default([])
  license       String    @default("MIT")
  downloads     Int       @default(0)
  isVerified    Boolean   @default(false) @map("is_verified")
  deprecated    Boolean   @default(false)
  createdAt     DateTime  @default(now()) @map("created_at")
  updatedAt     DateTime  @updatedAt @map("updated_at")

  authorId  String        @map("author_id")
  author    User          @relation(fields: [authorId], references: [id])
  versions  SkillVersion[]
  activities ActivityLog[]
  likes     SkillLike[]

  @@index([category])
  @@index([authorId])
  @@index([downloads(sort: Desc)])
  @@index([name])
  @@map("skills")
  // Note: unique index on name WHERE deprecated = false is created via raw SQL migration:
  // CREATE UNIQUE INDEX skills_name_unique ON skills(name) WHERE deprecated = false;
}

model SkillVersion {
  id        String   @id @default(uuid())
  version   String
  changelog String?  @db.Text
  repoPath  String   @map("repo_path")
  fileHash  String   @map("file_hash")
  createdAt DateTime @default(now()) @map("created_at")

  skillId String @map("skill_id")
  skill   Skill  @relation(fields: [skillId], references: [id], onDelete: Cascade)

  @@unique([skillId, version])
  @@map("skill_versions")
}

model SkillLike {
  id        String   @id @default(uuid())
  createdAt DateTime @default(now()) @map("created_at")

  userId  String @map("user_id")
  user    User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  skillId String @map("skill_id")
  skill   Skill  @relation(fields: [skillId], references: [id], onDelete: Cascade)

  @@unique([userId, skillId])
  @@map("skill_likes")
}

model ActivityLog {
  id        String     @id @default(uuid())
  action    ActionType
  metadata  Json?
  createdAt DateTime   @default(now()) @map("created_at")

  userId  String @map("user_id")
  user    User   @relation(fields: [userId], references: [id], onDelete: Cascade)
  skillId String @map("skill_id")
  skill   Skill  @relation(fields: [skillId], references: [id], onDelete: Cascade)

  @@index([userId])
  @@index([skillId])
  @@index([createdAt(sort: Desc)])
  @@map("activity_logs")
}

model DeviceCode {
  id        String   @id @default(uuid())
  code      String   @unique @map("device_code")
  userCode  String   @map("user_code")
  clientId  String   @map("client_id")
  status    String   @default("pending") // pending, approved, expired
  expiresAt DateTime @map("expires_at")
  createdAt DateTime @default(now()) @map("created_at")

  userId String? @map("user_id")
  user   User?   @relation(fields: [userId], references: [id])

  @@index([code])
  @@map("device_codes")
}

model RefreshToken {
  id        String    @id @default(uuid())
  tokenHash String    @unique @map("token_hash")
  expiresAt DateTime  @map("expires_at")
  revokedAt DateTime? @map("revoked_at")
  createdAt DateTime  @default(now()) @map("created_at")

  userId String @map("user_id")
  user   User   @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@index([tokenHash])
  @@index([userId])
  @@map("refresh_tokens")
}
```

### 3.3 Indexes & Performance

| Table | Index | Purpose |
|-------|-------|---------|
| skills | `name` (unique) | skill 조회 O(1) |
| skills | `category` | 카테고리 필터링 |
| skills | `author_id` | 작성자별 skill 조회 |
| skills | `downloads DESC` | 인기순 정렬 |
| skill_versions | `[skill_id, version]` (unique) | 버전 중복 방지 |
| skill_likes | `[user_id, skill_id]` (unique) | 중복 좋아요 방지 |
| activity_logs | `created_at DESC` | 최신 활동 조회 |
| refresh_tokens | `token_hash` (unique) | 토큰 조회 O(1) |

### 3.4 Full-Text Search

초기에는 PostgreSQL `ILIKE` + 캐시(2min TTL)로 구현. Skill 1,000개 이상 시 아래로 마이그레이션:
```sql
-- GIN 인덱스 추가
ALTER TABLE skills ADD COLUMN search_vector tsvector
  GENERATED ALWAYS AS (
    setweight(to_tsvector('english', name), 'A') ||
    setweight(to_tsvector('english', description), 'B') ||
    setweight(to_tsvector('english', array_to_string(keywords, ' ')), 'C')
  ) STORED;
CREATE INDEX idx_skills_search ON skills USING GIN (search_vector);
```

### 3.5 ActivityLog Archiving

90일 이상 된 로그는 월 1회 cron으로 `activity_logs_archive` 테이블로 이동. Dashboard 통계는 `daily_stats` materialized view를 별도 cron으로 집계하여 성능 확보 (v1.1에서 구현).

**Cron 실행 주체**: GitHub Actions scheduled workflow (Vercel Cron은 Hobby 미지원). 월 1회 실행으로 API Route를 호출하여 archiving 수행.

### 3.6 RefreshToken Cleanup

만료 + 폐기된 refresh token은 30일 경과 후 자동 삭제. ActivityLog archiving과 동일한 GitHub Actions cron에서 실행.

### 3.7 Version Immutability

**Published versions are immutable.** 한번 publish된 버전의 파일은 수정 불가. 버그 수정 시 새 버전을 publish해야 한다. 이 정책이 immutable 캐싱(TTL ∞)의 전제조건.

---

## 4. API Specification

### 4.1 Base URL & Versioning
- Production: `https://hub.aresdevunit.com/api/v1`
- Preview: `https://<branch>.hub.aresdevunit.com/api/v1`
- Local: `http://localhost:3000/api/v1`

향후 breaking change 시 `/api/v2` 추가. 이전 버전은 최소 6개월 유지.

### 4.2 Authentication
- 인증 필요 API: `Authorization: Bearer <access_token>` 헤더
- 선택적 인증 API: 헤더 있으면 사용자 추적, 없으면 anonymous 허용
- CLI API 클라이언트: 401 응답 시 자동으로 refresh token으로 갱신 후 재시도 (1회)

### 4.3 Error Response Format
```json
{
  "error": {
    "code": "SKILL_NOT_FOUND",
    "message": "Skill 'my-skill' not found",
    "status": 404
  }
}
```

### 4.4 Error Codes
| Code | Status | Description |
|------|--------|-------------|
| `UNAUTHORIZED` | 401 | 인증 토큰 없음 또는 만료 |
| `FORBIDDEN` | 403 | 권한 없음 |
| `SKILL_NOT_FOUND` | 404 | skill 존재하지 않음 |
| `SKILL_ALREADY_EXISTS` | 409 | 동일 이름 skill 존재 |
| `VERSION_ALREADY_EXISTS` | 409 | 동일 버전 존재 |
| `VALIDATION_ERROR` | 422 | 입력 데이터 유효성 실패 |
| `RATE_LIMITED` | 429 | rate limit 초과 |
| `INTERNAL_ERROR` | 500 | 서버 내부 오류 |
| `AUTHORIZATION_PENDING` | 400 | Device Code 인증 대기 중 |

### 4.5 Endpoints

#### Health

**GET /api/v1/health**
서비스 상태 확인. 비인증.

Response (200):
```json
{
  "status": "ok",
  "db": "connected",
  "version": "1.0.0",
  "timestamp": "2026-03-30T00:00:00Z"
}
```

---

#### Auth

**POST /api/v1/auth/device**
Device Code Flow 시작. CLI에서 호출.

Request:
```json
{ "client_id": "hub-cli" }
```
Response (200):
```json
{
  "device_code": "abc123",
  "user_code": "ABCD-1234",
  "verification_url": "https://hub.aresdevunit.com/device",
  "expires_in": 900,
  "interval": 5
}
```
DB 저장: DeviceCode 테이블에 `{device_code, user_code, client_id, status: "pending", user_id: null, expires_at: now()+15min}`

**POST /api/v1/auth/device/token**
Device Code Flow 토큰 교환. CLI에서 polling.

Request:
```json
{ "device_code": "abc123", "client_id": "hub-cli" }
```
Response (200) — 인증 완료:
```json
{
  "access_token": "eyJhbG...",
  "refresh_token": "rft_abc123...",
  "token_type": "Bearer",
  "expires_in": 900
}
```
Response (400) — 아직 인증 대기 중:
```json
{ "error": { "code": "AUTHORIZATION_PENDING", "message": "User has not yet authorized", "status": 400 } }
```

**POST /api/v1/auth/refresh**
Access token 갱신. Refresh token rotation 적용 (사용된 refresh token은 즉시 폐기, 새 refresh token 발급).

Request:
```json
{ "refresh_token": "rft_abc123..." }
```
Response (200):
```json
{
  "access_token": "eyJhbG...",
  "refresh_token": "rft_def456...",
  "expires_in": 900
}
```

**POST /api/v1/auth/revoke**
토큰 폐기 (logout).

Request:
```json
{ "refresh_token": "rft_abc123..." }
```
Response (204): No Content

---

#### Skills

**GET /api/v1/skills**
Skill 목록 조회. 비인증 가능.

Query Params:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `page` | int | 1 | 페이지 번호 |
| `limit` | int | 20 | 페이지 크기 (max: 100) |
| `sort` | string | "downloads" | 정렬: downloads, latest, name, likes |
| `category` | string | - | 카테고리 필터 |
| `agent` | string | - | agent 유형 필터 (claude, codex) |
| `q` | string | - | 검색 키워드 (name, description, keywords) |

Response (200):
```json
{
  "data": [
    {
      "id": "uuid",
      "name": "git-helper",
      "description": "Git 작업 자동화 skill",
      "category": "developer-tools",
      "latest_version": "1.2.0",
      "agent_types": ["claude", "codex"],
      "author": { "username": "johndoe", "avatar_url": "..." },
      "downloads": 1234,
      "likes": 56,
      "is_verified": true,
      "deprecated": false,
      "created_at": "2026-03-30T00:00:00Z"
    }
  ],
  "pagination": {
    "page": 1,
    "limit": 20,
    "total": 150,
    "total_pages": 8
  }
}
```
Deprecated skill은 목록에서 기본 제외. `?include_deprecated=true`로 포함 가능.

**GET /api/v1/skills/:name**
Skill 상세 조회. 비인증 가능.

Response (200):
```json
{
  "id": "uuid",
  "name": "git-helper",
  "description": "Git 작업 자동화 skill",
  "readme": "# Git Helper\n\n...",
  "category": "developer-tools",
  "latest_version": "1.2.0",
  "agent_types": ["claude", "codex"],
  "keywords": ["git", "automation"],
  "license": "MIT",
  "author": { "username": "johndoe", "avatar_url": "..." },
  "downloads": 1234,
  "likes": 56,
  "is_verified": true,
  "deprecated": false,
  "versions": [
    { "version": "1.2.0", "changelog": "...", "created_at": "..." },
    { "version": "1.1.0", "changelog": "...", "created_at": "..." }
  ],
  "created_at": "2026-03-30T00:00:00Z",
  "updated_at": "2026-03-30T00:00:00Z"
}
```

**POST /api/v1/skills** 🔒
Skill 신규 생성.

Request:
```json
{
  "name": "git-helper",
  "description": "Git 작업 자동화 skill",
  "readme": "# Git Helper\n\n...",
  "category": "developer-tools",
  "version": "1.0.0",
  "changelog": "Initial release",
  "agent_types": ["claude", "codex"],
  "keywords": ["git", "automation"],
  "license": "MIT",
  "files": [
    { "path": "git-helper.md", "content": "base64_encoded_content" }
  ]
}
```
Response (201 Created):
```json
{
  "id": "uuid",
  "name": "git-helper",
  "version": "1.0.0",
  "url": "https://hub.aresdevunit.com/skills/git-helper"
}
```

**POST /api/v1/skills/:name/versions** 🔒 (Author only)
기존 skill에 새 버전 추가.

Request:
```json
{
  "version": "1.2.0",
  "changelog": "Added branch management",
  "files": [
    { "path": "git-helper.md", "content": "base64_encoded_content" }
  ]
}
```
Response (200 OK):
```json
{
  "id": "uuid",
  "name": "git-helper",
  "version": "1.2.0",
  "url": "https://hub.aresdevunit.com/skills/git-helper"
}
```

**GET /api/v1/skills/:name/download** (선택적 인증)
Skill 파일 다운로드. 비인증 허용.

Query Params:
| Param | Type | Default | Description |
|-------|------|---------|-------------|
| `version` | string | "latest" | 다운로드할 버전 |

Response (200):
```json
{
  "name": "git-helper",
  "version": "1.2.0",
  "agent_types": ["claude", "codex"],
  "is_verified": false,
  "files": [
    { "path": "git-helper.md", "content": "base64_encoded_content" }
  ]
}
```
Deprecated skill 다운로드 시 `"deprecated": true` + `"deprecated_message": "..."` 포함.

Rate limit: 비인증 30/min, 인증 60/min.

**POST /api/v1/skills/:name/like** 🔒
좋아요 토글.

Response (200):
```json
{ "liked": true, "likes": 57 }
```

**DELETE /api/v1/skills/:name** 🔒 (Admin or Author)
Skill soft delete. `deprecated = true` 설정 후, name을 `{name}__deprecated_{timestamp}`로 변경하여 이름 재사용 허용.

Response (200):
```json
{ "deprecated": true, "message": "Skill has been deprecated. Existing installations will continue to work." }
```

---

#### Users

**GET /api/v1/users/me** 🔒
현재 로그인 사용자 정보.

**GET /api/v1/users/:username**
사용자 프로필 조회. 비인증 가능.

**GET /api/v1/users/me/activity** 🔒
내 활동 로그. (피드에 표시되는 다른 사용자 활동은 username만 표시, 집계 통계 우선)

---

#### Admin (v1.1 이후)

**GET /api/v1/admin/users** 🔒 (Admin)
**PATCH /api/v1/admin/users/:id** 🔒 (Admin)
**PATCH /api/v1/admin/skills/:id** 🔒 (Admin)

---

#### Dashboard (v1.1 이후)

**GET /api/v1/dashboard/stats** 🔒
**GET /api/v1/dashboard/feed** 🔒

---

## 5. CLI Specification

### 5.1 Package Info
| Field | Value |
|-------|-------|
| Package name | `@aresdevunit/hub` |
| Binary name | `hub` |
| Min Node.js | 20.x |
| Install | `npm install -g @aresdevunit/hub` |
| Alternate | `npx @aresdevunit/hub <command>` |

### 5.2 Config File
Location: `~/.aresdevunit/config.json` (file permission: 0600)

```json
{
  "access_token": "eyJhbG...",
  "refresh_token": "rft_abc123...",
  "api_url": "https://hub.aresdevunit.com/api/v1",
  "agents": {
    "claude": {
      "skill_path": "~/.claude/commands"
    },
    "codex": {
      "skill_path": null
    }
  }
}
```

### 5.3 Installed Skills Manifest
Location: `~/.aresdevunit/installed.json`

```json
{
  "skills": {
    "git-helper": {
      "version": "1.2.0",
      "agent": "claude",
      "path": "~/.claude/commands/git-helper.md",
      "file_hash": "sha256:abc123...",
      "installed_at": "2026-03-30T00:00:00Z"
    }
  }
}
```
`hub update`, `hub doctor`, `hub list --installed`에서 이 파일을 참조한다.

### 5.4 CLI Global Flags
| Flag | Description |
|------|-------------|
| `--no-color` | 색상 및 유니코드 기호 비활성화 |
| `--json` | JSON 형식 출력 (파이프/자동화용) |
| `--yes` / `-y` | 모든 확인 프롬프트 자동 승인 (Agent-native 환경 필수) |
| `--agent <type>` | agent 유형 명시 지정 (install/uninstall 시) |

`NO_COLOR` 환경변수 지원 (https://no-color.org/). stdout이 TTY가 아닌 경우 자동 plain text.

**Non-TTY 환경 기본 동작**: stdout이 TTY가 아닌 경우 (파이프, Agent 호출 등):
- 대화형 프롬프트 → `--yes`가 없으면 자동 **거부** (안전 우선) 후 exit code 1
- `--json` 자동 활성화
- Agent에서 호출 시 권장 패턴: `hub install <name> --yes --agent claude --json`

### 5.5 Agent Detection Logic

`hub install` 시 agent 유형을 결정하는 우선순위:
```
1. --agent <type> 플래그 (최우선)
2. config.json의 기본 agent 설정
3. 자동 감지:
   a. ~/.claude/ 디렉토리 존재 → "claude"
   b. Codex 설정 디렉토리 존재 → "codex" (경로 확인 필요)
4. 위 모두 실패 → 대화형 프롬프트:
   "Which agent do you use? (claude/codex/custom path)"
   선택 결과를 config에 저장하여 다음부터 자동 적용
```

### 5.6 Token Refresh Interceptor

CLI API 클라이언트에 자동 토큰 갱신 인터셉터:
```
1. API 호출 → 401 Unauthorized 응답
2. refresh token으로 POST /api/v1/auth/refresh
3. 새 access_token + refresh_token 저장
4. 원래 요청 재시도 (1회만)
5. refresh도 실패 시 → "Session expired. Run `hub login` to re-authenticate."
```

### 5.7 Network Error Handling

```
→ ✗ Network error: Could not reach hub.aresdevunit.com
  Check your connection and retry, or run `hub doctor` for diagnostics.
  (exit code 4)
```
기본 1회 자동 재시도 (1초 딜레이). `--no-retry` 플래그로 비활성화 가능.

### 5.8 Commands Detail

#### `hub login`
```
$ hub login
→ Opening browser for authentication...
→ If browser doesn't open, visit: https://hub.aresdevunit.com/device
→ Enter code: ABCD-1234
→ Waiting for authorization... ✓
→ Logged in as johndoe
```

#### `hub logout`
```
$ hub logout
→ Revoking token... ✓
→ Logged out successfully
```

#### `hub whoami`
```
$ hub whoami
→ johndoe (john@example.com)
→ Role: USER
→ Skills: 5 published
```

#### `hub init`
```
# Interactive mode (default)
$ hub init
→ Skill name: my-skill
→ Description: A helpful skill
→ Category: developer-tools
→ Agent types: claude, codex
→ License: MIT
→ Created skill.json and my-skill.md template
→
→ Next steps:
→   1. Edit my-skill.md to write your skill content
→   2. Run `hub validate` to check your skill
→   3. Run `hub publish` to share it with the world

# Non-interactive mode (Agent-native)
$ hub init --name my-skill --description "A helpful skill" --category developer-tools --agent-types claude,codex
→ Created skill.json and my-skill.md template
```

#### `hub validate`
```
$ hub validate
→ Validating skill.json... ✓
→ Checking file size (< 1MB)... ✓
→ Checking required fields... ✓
→ Checking for template defaults... ⚠ (description is still the default template)
→ Scanning for unsafe patterns... ✓
→ Validation passed (1 warning)
```
템플릿 기본값이 남아있으면 경고. 알려진 prompt injection 패턴 스캔.

#### `hub publish`
```
$ hub publish
→ Validating... ✓
→ Publishing my-skill@1.0.0... ✓
→ Published: https://hub.aresdevunit.com/skills/my-skill
```

#### `hub install <name>`
```
$ hub install git-helper
→ Downloading git-helper@1.2.0... ✓
→ Detected agent: Claude Code
→ Installed to ~/.claude/commands/git-helper.md
→ Run `hub list --installed` to see all installed skills

$ hub install unknown-skill
→ ⚠ This skill is not verified. Install at your own risk.
→ Continue? (y/N): y
→ Downloading unknown-skill@0.1.0... ✓

$ hub install deprecated-skill
→ ⚠ This skill has been deprecated by the author.
→ Continue? (y/N): y
→ Downloading deprecated-skill@1.0.0... ✓
```
`@version` 접미사 지원: `hub install git-helper@1.1.0`
Deprecated skill 설치 시: `→ ⚠ This skill has been deprecated by the author.`

#### `hub uninstall <name>`
```
$ hub uninstall git-helper
→ Removing git-helper from ~/.claude/commands/... ✓
→ Uninstalled git-helper
```

#### `hub update [name]`
```
$ hub update
→ Checking for updates...
→ git-helper: 1.1.0 → 1.2.0 (update available)
→ code-review: 2.0.0 (up to date)
→ Update all? (y/N): y
→ Updating 1/1: git-helper... ✓
→ Updated 1/1 skills successfully.
```
진행률 표시: `Updating n/total: <name>...`. 실패 시 요약 리포트.

**개별 실패 시 롤백 정책**: 각 skill 업데이트는 원자적(atomic). 새 파일 다운로드 → 임시 경로에 저장 → 기존 파일 백업(`.bak`) → 교체 → installed.json 업데이트. 교체 실패 시 `.bak`에서 복원. 개별 실패는 다른 skill 업데이트에 영향 없음.

**버전 자동 범프**: `hub publish --patch` / `--minor` / `--major` 플래그로 skill.json의 version을 자동 증가 후 publish. 수동 버전 입력 실수 방지.

#### `hub list`
```
$ hub list --installed
→ Installed skills:
  git-helper    v1.2.0  claude  ~/.claude/commands/git-helper.md
  code-review   v2.0.0  claude  ~/.claude/commands/code-review.md

$ hub list --mine
→ My published skills:
  git-helper    v1.2.0  ↓1234  ♥56
```
`hub list` (플래그 없음): `--installed`와 동일하게 동작. 레지스트리 탐색은 `hub search` 사용.

#### `hub search <query>`
```
$ hub search "git automation"
→ Results for "git automation":
  git-helper    v1.2.0  ↓1234  "Git 작업 자동화 skill"
  git-branch    v0.5.0  ↓45    "Branch 관리 자동화"
```

#### `hub info <name>`
```
$ hub info git-helper
→ git-helper v1.2.0
→ by johndoe | MIT | ↓1234 | ♥56
→ Category: developer-tools
→ Agents: claude, codex
→ Verified: ✓
→ Description: Git 작업 자동화 skill
→ Install: hub install git-helper
```

#### `hub doctor [name]` (v1.1)
#### `hub config` (v1.1)

### 5.9 Exit Codes
| Code | Meaning |
|------|---------|
| 0 | Success |
| 1 | General error |
| 2 | Validation error |
| 3 | Authentication error |
| 4 | Network error |
| 5 | Skill not found |

---

## 6. skill.json Specification

### 6.1 Schema

```json
{
  "$schema": "https://hub.aresdevunit.com/schemas/skill.json",
  "name": "git-helper",
  "version": "1.2.0",
  "description": "Git 작업 자동화 skill",
  "author": "johndoe",
  "category": "developer-tools",
  "agent_types": ["claude", "codex"],
  "keywords": ["git", "automation", "branch"],
  "license": "MIT",
  "files": {
    "claude": "git-helper.md",
    "codex": "git-helper-codex.md"
  },
  "min_agent_versions": {
    "claude": "1.0.0"
  }
}
```

### 6.2 Validation Rules (Zod)

| Field | Type | Required | Constraints |
|-------|------|----------|-------------|
| `name` | string | Yes | 2-50 chars, lowercase, `^[a-z][a-z0-9-]*$` |
| `version` | string | Yes | valid semver |
| `description` | string | Yes | 10-200 chars |
| `author` | string | Yes | valid username |
| `category` | enum | Yes | predefined list |
| `agent_types` | string[] | Yes | min 1, from allowed list |
| `keywords` | string[] | No | max 10, each max 30 chars |
| `license` | string | No | default "MIT" |
| `files` | object | Yes | agent_type → file path mapping |
| `min_agent_versions` | object | No | agent_type → semver |

Agent type은 enum이 아닌 registry 기반. 새 agent 추가 시 `shared/constants/agents.ts`에 등록:
```typescript
export const KNOWN_AGENTS = {
  claude: { name: "Claude Code", defaultPath: "~/.claude/commands", detectDir: "~/.claude" },
  codex: { name: "Codex", defaultPath: null, detectDir: null },
  // 향후 추가: cursor, windsurf, cline 등
} as const;
```

### 6.3 Categories (Initial)
| Value | Display |
|-------|---------|
| `developer-tools` | Developer Tools |
| `code-review` | Code Review |
| `documentation` | Documentation |
| `testing` | Testing |
| `devops` | DevOps |
| `data-analysis` | Data Analysis |
| `writing` | Writing |
| `productivity` | Productivity |
| `other` | Other |

### 6.4 File Constraints
| Constraint | Value |
|------------|-------|
| Max file size per skill file | 500KB |
| Max total skill size | 1MB |
| Allowed file extensions | .md (향후 .yaml, .json 확장 고려) |
| Max files per skill | 5 |

### 6.5 Prompt Injection Scan

Publish 시 서버 측에서 알려진 prompt injection 패턴을 스캔:
- `ignore previous instructions` 류 패턴
- `system:` 또는 `<system>` 태그 삽입 시도
- 외부 URL fetch 지시 패턴
- 파일 시스템 접근 지시 패턴

스캔 결과는 is_verified와 별개. 스캔 실패 시 publish 차단하지 않되, 경고 플래그를 metadata에 기록.

---

## 7. GitHub Skill Registry Structure

Repository: `aresdev-unit/skill-registry`

```
skill-registry/
├── skills/
│   ├── git-helper/
│   │   ├── skill.json
│   │   ├── git-helper.md
│   │   └── git-helper-codex.md
│   └── ...
├── schemas/
│   └── skill.schema.json
└── README.md
```

### 7.1 GitHub Access Strategy
- **API 서버 → GitHub**: GitHub App (Installation Token) — 5,000/hr per installation
- **Skill publish**: API 서버가 GitHub App 토큰으로 대리 커밋
- **Skill download**: GitHub API 직접 호출 (10명 규모, 캐싱 불필요)
- **Installation Token 관리**: 메모리 내 캐싱 (TTL 50min, 만료 1시간). Serverless 환경이므로 cold start 시 재발급.
- **StorageProvider 추상화**: 향후 S3/R2 전환을 위한 interface 레이어

```typescript
interface SkillStorageProvider {
  upload(name: string, version: string, files: SkillFile[]): Promise<void>;
  download(name: string, version: string): Promise<SkillFile[]>;
  delete(name: string, version: string): Promise<void>;
}
// 초기: GitHubStorageProvider
// 향후: S3StorageProvider, R2StorageProvider
```

### 7.2 Caching Strategy

10명 규모에서는 별도 캐싱 레이어(Redis 등) 없이 GitHub API 직접 호출로 충분하다. GitHub App Installation Token rate limit은 5,000/hr이므로 10명 사용량은 여유.

**향후 사용자 증가 시**: Vercel KV(Upstash Redis) 도입하여 캐싱 레이어 추가. 이때 아래 정책 적용:
| Key Pattern | TTL |
|-------------|-----|
| `skill:content:{name}:{version}` | ∞ (immutable) |
| `skill:content:{name}:latest` | 5 min |

### 7.3 Data Consistency (GitHub + DB)

Publish flow의 정합성 전략:
```
1. API 서버 측 검증 통과
2. DB advisory lock 획득 (pg_advisory_xact_lock(hashtext(skill_name)))
   → 트랜잭션 내에서 동일 skill에 대한 동시 publish 직렬화
3. GitHub에 파일 업로드 → 성공 시 commit SHA 기록
4. DB에 메타데이터 저장 → 실패 시 GitHub 파일 삭제 (롤백)
5. 트랜잭션 커밋 → lock 자동 해제

GitHub 성공 + DB 실패 → GitHub 롤백 시도. 롤백도 실패 시 orphaned file로 남지만,
DB에 없으므로 사용자에게 노출되지 않음. 다음 동일 이름 publish 시 overwrite됨.
```

**동시 publish 방지**: PostgreSQL advisory lock으로 동일 skill에 대한 동시 publish를 직렬화. 트랜잭션 종료 시 자동 해제되므로 orphan lock 불가.

---

## 8. Web Pages Specification

### 8.1 Page Map

| Route | Auth | SSR/CSR | Description |
|-------|------|---------|-------------|
| `/` | No | SSR | 랜딩 페이지 |
| `/login` | No | CSR | GitHub OAuth 로그인 |
| `/device` | No | CSR | Device Code 입력 (CLI 인증) |
| `/skills` | No | SSR | Skill 브라우징 |
| `/skills/[name]` | No | SSR | Skill 상세 |
| `/author/[username]` | No | SSR | 작성자 프로필 |
| `/dashboard` | Yes | CSR | 내 대시보드 (v1.1) |
| `/settings` | Yes | CSR | 설정 (v1.1) |
| `/admin` | Admin | CSR | 관리자 패널 (v1.1) |
| `/docs` | No | SSR | 문서 (v1.1) |

### 8.2 Unauthenticated → Authenticated Transition

비인증 사용자가 인증 필요 액션(좋아요, 대시보드) 시도 시:
- `/login?redirect=<current_url>`로 리다이렉트
- 로그인 완료 후 원래 페이지로 복귀
- 좋아요 버튼 등에 "로그인 후 이용 가능" 툴팁 표시

### 8.3 Landing Page (`/`)

Sections:
1. **Hero**: 한 줄 소개 + CLI 설치 명령어 (OS 감지 + 복사 버튼)
2. **How It Works**: 3단계 (Install CLI → Browse Skills → Use with Agent)
3. **Featured Skills**: 인기 skill 카드 4-6개
4. **Get Started**: GitHub 로그인 CTA

### 8.4 Accessibility
- WCAG 2.1 AA 준수 목표
- 모든 인터랙티브 요소 키보드 접근 보장
- Lighthouse Accessibility 점수 90+ 목표

---

## 9. Security Specification

### 9.1 Authentication

| Layer | Method | Details |
|-------|--------|---------|
| Web | NextAuth.js + GitHub OAuth | session cookie, httpOnly, secure, sameSite |
| CLI | Device Code Flow + JWT | access (15min) + refresh (7day) |
| API | Dual auth middleware | Bearer JWT (CLI) OR session cookie (Web) |

### 9.2 Authorization

| Role | Permissions |
|------|------------|
| Anonymous | skill 목록/상세/다운로드 조회, 작성자 프로필 조회 |
| USER | + publish, like, 본인 skill 삭제 |
| ADMIN | + 모든 skill 관리, 사용자 역할 변경, 검증 |

### 9.3 Token Security
- **Access token**: JWT, 15분 만료, HS256 서명
  - 의사결정 근거: Vercel serverless는 단일 env로 시크릿 공유하므로 HS256 충분. 향후 multi-region/microservice 분리 시 RS256 전환 고려.
  - JWT secret과 NEXTAUTH_SECRET은 별도 값 사용
  - 토큰 검증은 요청 시점에만 수행. publish 등 장시간 작업 중 만료되어도 진행 중인 요청은 영향 없음. 새 요청 시 refresh interceptor가 자동 갱신.
- **Refresh token**: `crypto.randomBytes(32)`로 생성, SHA-256 해싱하여 DB 저장, 7일 만료
- **CLI 로컬 저장**: `~/.aresdevunit/config.json`, file permission 0600
- **Token rotation**: refresh 사용 시 해당 토큰 즉시 폐기 + 새 refresh token 발급 (one-time use)
- **Key rotation**: JWT_SECRET 변경 시 기존 access token은 만료까지 유효 (15분), refresh token은 영향 없음 (DB 기반)

### 9.4 Input Validation
- 모든 API 입력은 zod 스키마로 검증
- skill 파일 업로드: 크기 제한 (500KB/file, 1MB total)
- SQL injection: Prisma parameterized queries
- XSS: Next.js 기본 이스케이핑 + markdown sanitization (DOMPurify)
- Prompt injection: publish 시 알려진 패턴 스캔 (Section 6.5)

### 9.5 Rate Limiting

| Endpoint | Authenticated | Anonymous | Window |
|----------|--------------|-----------|--------|
| `POST /api/v1/auth/*` | 10 | 10 | 15 min |
| `POST /api/v1/skills` | 20 | - | 1 hour |
| `GET /api/v1/skills/*` | 100 | 60 | 1 min |
| `GET /api/v1/skills/*/download` | 60 | 30 | 1 min |
| 기타 인증 API | 60 | - | 1 min |

구현: 10명 규모에서는 간단한 DB 기반 rate limiting (IP/user별 요청 카운트). 사용자 증가 시 Upstash Redis 기반 sliding window로 전환.

### 9.6 CORS Policy

API는 same-origin (hub.aresdevunit.com) + CLI(non-browser) 전용.
- `Access-Control-Allow-Origin`: `https://hub.aresdevunit.com` (production), `http://localhost:3000` (dev)
- 제3자 API 접근은 v2에서 API key 기반으로 허용 예정

### 9.7 Security Headers (next.config.js)

```
Content-Security-Policy: default-src 'self'; script-src 'self' 'nonce-${nonce}'; style-src 'self' 'unsafe-inline'; frame-ancestors 'none'
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Strict-Transport-Security: max-age=31536000; includeSubDomains
Referrer-Policy: strict-origin-when-cross-origin
```
- `script-src`: nonce 기반 (Next.js `experimental.scriptNonce` 활용). `unsafe-inline` 제거.
- `style-src`: Tailwind CSS 특성상 `unsafe-inline` 허용 (nonce 전환은 v1.1 검토)
- `frame-ancestors 'none'`: X-Frame-Options와 이중 방어

---

## 10. Infrastructure & Deployment

### 10.1 Environments

| Environment | URL | Branch | DB |
|-------------|-----|--------|----|
| Local | localhost:3000 | - | Neon dev branch |
| Preview | *.vercel.app | PR branches | Neon dev branch |
| Production | hub.aresdevunit.com | main | Neon prod branch |

GitHub OAuth app: dev/prod 각각 별도 생성 (redirect URI 다름).

### 10.2 CI/CD Pipeline (GitHub Actions)

```
PR → ci.yml:
  ├── lint (eslint)
  ├── typecheck (tsc --noEmit)
  ├── test (vitest, npm ci 사용)
  ├── build (next build + cli build)
  ├── npm audit --audit-level=high
  └── CodeQL security scan

main merge:
  ├── prisma migrate deploy (pre-deploy)
  └── Vercel auto-deploy (Production)
       └── 실패 시: Vercel Instant Rollback

Tag (cli-v*) → publish-cli.yml:
  ├── build + test
  ├── npm publish --provenance --access public
  └── 실패 시: npm deprecate + 이전 버전 재publish 절차 문서화
```

### 10.3 DB Migration Strategy

- `prisma migrate dev --name <name>`: 개발 시 마이그레이션 생성
- `prisma migrate deploy`: 배포 시 실행 (CI/CD pre-deploy hook)
- `prisma/migrations/` 디렉토리: Git에 커밋하여 히스토리 추적
- **파괴적 변경**: expand-contract 패턴 (새 컬럼 추가 → 데이터 마이그레이션 → 이전 컬럼 삭제)
- **롤백**: 마이그레이션 실패 시 이전 마이그레이션 상태로 수동 복구 (롤백 SQL 별도 관리)

### 10.4 Rollback Strategy

| Layer | 방법 |
|-------|------|
| Web (Vercel) | Vercel Instant Rollback — 이전 배포로 즉시 복원 |
| DB | Neon PITR (Point-in-Time Recovery) — 특정 시점으로 복원 |
| CLI (npm) | `npm deprecate @aresdevunit/hub@<bad-version>` + 이전 버전 권장 |
| GitHub Registry | git revert으로 파일 롤백 |

### 10.5 Backup & Disaster Recovery

| Resource | 전략 | RPO | RTO |
|----------|------|-----|-----|
| Neon Postgres | Neon PITR (7일) + 주 1회 pg_dump (GitHub Actions → S3/R2) | < 1시간 (PITR) / < 7일 (dump) | < 30분 |
| GitHub skill-registry | GitHub 자체 이중화 + 월 1회 mirror clone | < 1일 | < 1시간 |
| 전체 서비스 | GitHub 장애 시: 읽기(DB 메타데이터)는 유지, 파일 다운로드/쓰기 일시 중단 | - | - |

### 10.6 Monitoring & Alerting

| Layer | Tool | Purpose | Alert |
|-------|------|---------|-------|
| Error tracking | Vercel Logs | 런타임 에러 확인 | 수동 확인 (10명 규모) |
| Uptime | UptimeRobot (무료) | /api/v1/health 모니터링 | 3회 연속 실패 → Email |
| Logging | Vercel Logs + pino | 구조화된 요청/응답 로깅 | - |

**향후 확장 시**: Sentry 도입 (에러 추적 + APM).

**Logging 표준**:
- 필수 필드: request_id, user_id (또는 "anonymous"), method, path, status, duration_ms
- PII 마스킹: email → `j***@example.com`, token → `[REDACTED]`
- 로그 레벨: dev=debug, prod=info

### 10.7 Secret Management

`.env.example` (커밋):
```env
# Auth
GITHUB_CLIENT_ID=
GITHUB_CLIENT_SECRET=
NEXTAUTH_SECRET=
NEXTAUTH_URL=http://localhost:3000
JWT_SECRET=

# Database (Vercel Marketplace Neon 통합 — 자동 주입)
DATABASE_URL=

# GitHub App (skill-registry access)
GITHUB_APP_ID=
GITHUB_APP_PRIVATE_KEY=
GITHUB_APP_INSTALLATION_ID=
```

총 8개 키. DATABASE_URL은 Vercel에서 자동 주입.

- GitHub App Private Key: Vercel 환경변수에 base64 인코딩하여 저장. 90일 주기 로테이션.
- dev/prod 환경별 별도 값 사용 필수

### 10.8 Cost Estimation

| 단계 | Vercel | Neon | GitHub | 합계 |
|------|--------|------|--------|------|
| 현재 (10명) | Hobby $0 | Free $0 (Marketplace 통합) | Free $0 | **$0/월** |
| 성장 (DAU 500) | Pro $20 | Launch $19 | Free $0 | **~$39/월** |
| 확장 (DAU 5000) | Pro $20 | Scale $69 + Upstash $10 | Free $0 | **~$99/월** |

---

## 11. Testing Strategy

| Level | Tool | Coverage Target | Phase |
|-------|------|-----------------|-------|
| Unit | vitest | shared (validators, utils) 90%+ | MVP |
| Integration | vitest | API Routes 80%+ | MVP |
| CLI | vitest | Commands 80%+ | MVP |
| E2E | Playwright | Critical flows | v1.1 |

### 11.1 Critical Test Scenarios
1. **Auth**: Device Code Flow 전체 흐름 (발급 → polling → 토큰 수령)
2. **Publish**: skill.json 유효성 검증 → GitHub 업로드 → DB 저장 → 롤백
3. **Install**: 버전 해석 → 캐시 확인 → 파일 다운로드 → agent 감지 → 로컬 배치
4. **Concurrency**: 동시 publish 시 버전 충돌 처리
5. **Security**: 인증 없는 보호 API 접근, rate limit 초과, prompt injection 패턴 검출

---

## 12. Implementation Phases

### Phase 0: Boilerplate (Day 1-2)
- [ ] .gitignore, .nvmrc (Node 20), .env.example
- [ ] Root package.json (workspaces, engines, corepack packageManager: npm)
- [ ] tsconfig.base.json, eslint.config.mjs, .prettierrc
- [ ] packages/cli, packages/web, packages/shared scaffolding
- [ ] GitHub Actions CI workflow (ci.yml: lint, typecheck, test, audit, CodeQL)
- [ ] LICENSE (MIT)
- [ ] npm organization (@aresdevunit) 이름 선점

### MVP — Phase 1+2 (Week 1-4)
**Goal: 첫 사용자가 skill을 publish하고 install할 수 있는 상태**

Phase 1: Auth (Week 1-2)
- [ ] shared: zod schemas, constants (agents, categories, error codes)
- [ ] web: Next.js init, Tailwind, NextAuth.js (GitHub OAuth)
- [ ] web: Prisma schema (User, Skill, SkillVersion, SkillLike, ActivityLog, RefreshToken, DeviceCode) + Neon (Vercel Marketplace) + migration
- [ ] web: API — auth endpoints (device, device/token, refresh, revoke)
- [ ] web: API — /api/v1/health
- [ ] web: API middleware (dual auth: Bearer JWT OR session cookie)
- [ ] web: Landing page, Login page, /device page
- [ ] web: Security headers, CORS config
- [ ] cli: Commander.js setup, API client (with token refresh interceptor)
- [ ] cli: hub login, hub logout, hub whoami
- [ ] Vercel deployment (Preview + Production)

Phase 2: Skill Flow (Week 3-4)
- [ ] web: API — /api/v1/skills (create, list, detail, download, versions, like, delete)
- [ ] web: GitHub App setup + StorageProvider abstraction
- [ ] web: /skills page (browse, search, filter)
- [ ] web: /skills/[name] page (detail, install command copy, login redirect for like)
- [ ] cli: hub init, hub validate (with prompt injection scan)
- [ ] cli: hub publish, hub install (with agent detection), hub uninstall, hub update
- [ ] cli: hub search, hub info, hub list (--installed, --mine)
- [ ] cli: installed.json manifest management
- [ ] shared: file hash utility
- [ ] API rate limiting — auth, publish, download (DB 기반)
- [ ] Unit/integration tests (vitest)

### v1.1 — Phase 3+4 (Week 5-8)
- [ ] web: Dashboard (stats, activity feed, trend chart with daily_stats table)
- [ ] web: /settings, /author/[username], /admin, /docs
- [ ] cli: hub doctor, hub config
- [ ] Playwright E2E tests
- [ ] npm publish automation (publish-cli.yml)
- [ ] npm organization registration
- [ ] UptimeRobot setup
- [ ] Activity feed privacy controls (익명화 옵션)

---

## 13. Dependencies (Key Packages)

### CLI (packages/cli)
| Package | Purpose |
|---------|---------|
| commander | CLI framework |
| chalk | Terminal styling (NO_COLOR aware) |
| ora | Spinner |
| inquirer | Interactive prompts (hub init, agent selection) |
| open | Open browser (hub login) |

### Web (packages/web)
| Package | Purpose |
|---------|---------|
| next | Framework |
| next-auth | Authentication |
| @prisma/client | ORM |
| tailwindcss | Styling |
| recharts | Dashboard charts (v1.1) |
| dompurify | Markdown sanitization |
| pino | Structured logging |

### Shared (packages/shared)
| Package | Purpose |
|---------|---------|
| zod | Schema validation |
| semver | Version comparison |

### Dev
| Package | Purpose |
|---------|---------|
| vitest | Unit/integration testing |
| playwright | E2E testing (v1.1) |
| eslint | Linting |
| prettier | Formatting |

---

## 14. Glossary

| Term | Definition |
|------|-----------|
| Skill | Agent가 실행할 수 있는 명령/프롬프트 파일 (.md) |
| Agent | AI 코드 어시스턴트 (Claude Code, Codex, Cursor 등) |
| Hub | AresDevUnit의 skill 관리 플랫폼 전체 |
| Registry | GitHub에 호스팅된 skill 파일 저장소 |
| Publish | skill을 registry에 게시하는 행위 |
| Install | skill을 로컬 agent 경로에 배치하는 행위 |
| MVP | Phase 0+1+2 (4주), 첫 사용자가 publish/install 가능한 상태 |
| v1.1 | Phase 3+4 (4주), 대시보드/admin/docs/polish |
