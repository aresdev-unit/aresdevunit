# AresDevUnit Hub - Implementation Plan (Final)

## 1. Project Overview

AresDevUnit Hub는 AI Agent(Codex, Claude Code 등) 사용자들이 제작한 skill을 공유하고 관리하는 플랫폼이다.
- **Hub CLI**: 모든 기능의 실행 레이어 (skill publish/install/list 등)
- **Hub Web**: 인증, 대시보드, 현황 조회, admin 관리 레이어
- **GitHub Repo**: skill 저장소 (버전관리, 메타데이터)

## 2. Architecture

```
┌─────────────┐       ┌──────────────────────┐       ┌─────────────────┐
│  Hub CLI    │──────→│  Next.js             │──────→│  GitHub API     │
│  (npm pkg)  │←──────│  (Pages + API Routes)│←──────│  (Skill Repo)   │
└─────────────┘       └──────────┬───────────┘       └─────────────────┘
                                 │
                      ┌──────────┴───────────┐
                      │  Neon Postgres       │
                      │  + Vercel KV (cache) │
                      └──────────────────────┘
```

### 핵심 설계 원칙
- **백엔드 통합**: Express 별도 서비스 없이 Next.js API Routes로 통합
- **인증 통합**: NextAuth.js로 OAuth + JWT를 단일 레이어에서 처리
- **캐싱 필수**: GitHub API rate limit(5,000/hr) 대비 Vercel KV 캐싱 레이어
- **배포 단순화**: Vercel 하나로 Web+API 배포, npm으로 CLI 배포

### 핵심 흐름
1. Hub Web 랜딩에서 CLI 설치 명령어 확인 (비로그인 가능)
2. CLI 설치: `npx @aresdevunit/hub` 또는 `npm install -g @aresdevunit/hub`
3. CLI에서 `hub login` → Device Code Flow로 인증
4. CLI에서 `hub publish/install/list` 등으로 skill 관리
5. Hub Web에서 skill 현황, 인기순, 카테고리 조회

## 3. Tech Stack

| Layer | Stack | 비고 |
|-------|-------|------|
| **CLI** | Node.js + Commander.js + TypeScript | npx 실행도 지원 |
| **Web + API** | Next.js (App Router) + NextAuth.js | Vercel 배포 |
| **DB** | Neon Postgres (serverless) + Prisma | 환경별 인스턴스 분리 |
| **Cache** | Vercel KV (Upstash Redis) | GitHub API 응답 캐싱 |
| **Skill Storage** | GitHub Repository (aresdev-unit/skill-registry) | 중기에 R2/S3 마이그레이션 고려 |
| **Auth** | NextAuth.js (GitHub OAuth) + JWT | Device Code Flow (CLI) |
| **Monorepo** | npm workspaces | cli / web / shared |
| **Test** | vitest + Playwright | Phase 2부터 점진적 |
| **CI/CD** | GitHub Actions | lint, typecheck, test, deploy |
| **Error Tracking** | Sentry | Web + API |

## 4. Directory Structure

```
E:\aresdevunit/
├── packages/
│   ├── cli/                  # Hub CLI
│   │   ├── src/
│   │   │   ├── commands/     # publish, install, list, login, search, ...
│   │   │   ├── lib/          # API client, config, auth
│   │   │   └── index.ts
│   │   ├── package.json      # bin, files, engines 정의
│   │   └── tsconfig.json
│   │
│   ├── web/                  # Hub Web + API (Next.js)
│   │   ├── src/
│   │   │   ├── app/
│   │   │   │   ├── api/      # API Routes (CLI 및 외부 호출)
│   │   │   │   │   ├── auth/
│   │   │   │   │   ├── skills/
│   │   │   │   │   └── users/
│   │   │   │   ├── (auth)/   # login, callback
│   │   │   │   ├── dashboard/
│   │   │   │   ├── skills/
│   │   │   │   │   └── [id]/
│   │   │   │   ├── author/[username]/
│   │   │   │   ├── settings/
│   │   │   │   ├── admin/
│   │   │   │   └── docs/
│   │   │   ├── components/
│   │   │   └── lib/          # DB client, auth config, GitHub API wrapper
│   │   ├── prisma/
│   │   │   └── schema.prisma
│   │   ├── package.json
│   │   └── next.config.js
│   │
│   └── shared/               # 공유 패키지
│       ├── src/
│       │   ├── types/        # skill.json 스키마, API 응답 타입
│       │   ├── constants/    # agent 경로 매핑, 카테고리 목록
│       │   └── validators/   # zod 스키마 (skill.json 유효성 검증)
│       ├── package.json
│       └── tsconfig.json
│
├── .github/
│   └── workflows/
│       ├── ci.yml            # PR 검증: lint, typecheck, test
│       └── publish-cli.yml   # 태그 push 시 npm publish
│
├── package.json              # Monorepo root (workspaces, engines, packageManager)
├── tsconfig.base.json
├── .eslintrc.js
├── .prettierrc
├── .gitignore
├── .nvmrc                    # Node 20 LTS
├── .env.example
├── LICENSE
└── README.md
```

## 5. Data Model

### User
| Field        | Type     | Description          |
|-------------|----------|----------------------|
| id          | UUID     | PK                   |
| github_id   | String   | GitHub user ID       |
| username    | String   | GitHub username      |
| avatar_url  | String   | 프로필 이미지         |
| role        | Enum     | user / admin         |
| created_at  | DateTime |                      |

### Skill
| Field             | Type     | Description           |
|-------------------|----------|-----------------------|
| id                | UUID     | PK                    |
| name              | String   | skill 이름 (unique)   |
| description       | String   | 설명                  |
| readme            | Text     | 상세 설명 (마크다운)   |
| category          | String   | 카테고리              |
| version           | String   | semver                |
| author_id         | UUID     | FK → User             |
| agent_type        | String[] | codex, claude 등      |
| keywords          | String[] | 검색 키워드           |
| repo_path         | String   | GitHub 내 경로        |
| downloads         | Int      | 다운로드 수           |
| likes             | Int      | 좋아요 수             |
| license           | String   | 라이선스              |
| is_verified       | Boolean  | 관리자 검증 여부      |
| deprecated        | Boolean  | 폐기 여부             |
| min_agent_version | String   | 최소 호환 agent 버전  |
| created_at        | DateTime |                       |
| updated_at        | DateTime |                       |

## 6. CLI Commands

| Command              | Description                              |
|----------------------|------------------------------------------|
| `hub login`          | Device Code Flow 인증, 토큰 저장 (0600) |
| `hub logout`         | 토큰 삭제 + 서버 토큰 무효화            |
| `hub whoami`         | 현재 로그인 사용자 확인                  |
| `hub init`           | skill 프로젝트 스캐폴딩 (skill.json 생성)|
| `hub validate`       | publish 전 skill.json 유효성 검증        |
| `hub publish`        | skill을 registry에 게시                  |
| `hub install <name>` | skill 다운로드 → agent 경로에 설치       |
| `hub uninstall <name>` | 설치된 skill 제거                      |
| `hub update [name]`  | skill 최신 버전으로 업데이트             |
| `hub list`           | 등록된 skill 목록 조회                   |
| `hub search <q>`     | skill 검색                               |
| `hub info <name>`    | skill 상세 정보                          |
| `hub doctor`         | 설치 상태 진단                           |
| `hub config`         | agent 경로 등 설정 관리                  |

### CLI 인증 플로우 (Device Code Flow)
```
1. CLI → API: POST /api/auth/device (device code 요청)
2. API → CLI: device_code + user_code + verification_url
3. CLI 출력: "브라우저에서 https://hub.aresdevunit.com/device 접속 후 코드 입력: ABCD-1234"
4. CLI: polling으로 인증 완료 대기
5. 인증 완료 → JWT(access 15min + refresh 7day) → ~/.aresdevunit/config.json (0600)
```

### install 후 출력 예시
```
✓ Installed "my-skill" v1.2.0 → ~/.claude/commands/my-skill.md
  Run `hub doctor my-skill` to verify installation.
```

## 7. Hub Web Pages

| Page                  | Auth 필요 | Description                              |
|-----------------------|-----------|------------------------------------------|
| `/`                   | No        | 랜딩 — CLI 설치 안내, 소개, Get Started  |
| `/login`              | No        | GitHub OAuth 로그인                      |
| `/skills`             | No        | skill 브라우징 (검색, 필터, 카테고리)    |
| `/skills/[id]`        | No        | skill 상세 (설명, 설치 명령어 복사)      |
| `/author/[username]`  | No        | 작성자 프로필, 작성 skill 목록           |
| `/docs`               | No        | 시작 가이드, skill.json 스펙, FAQ        |
| `/dashboard`          | Yes       | 내 skill 통계, 활동 피드, 다운로드 추이  |
| `/settings`           | Yes       | 프로필, API 토큰 관리, agent 경로 설정   |
| `/admin`              | Admin     | 사용자 관리, skill 승인/삭제             |

### 온보딩 플로우 (비로그인부터 시작)
```
랜딩(/) → CLI 설치 명령어 바로 노출
  ├── Skill 브라우징 가능 (/skills) — 비로그인
  └── "Get Started" 클릭
        → [Step 1] GitHub 로그인
        → [Step 2] CLI 설치 (OS 감지 + 복사 버튼) + hub login
        → [Step 3] 첫 skill 설치 체험: hub install popular-skill
        → [Step 4] 첫 skill 만들기 (선택): hub init → hub publish
```

### 대시보드 구성
```
┌──────────────────────────────────────────────────────┐
│  요약 카드                                            │
│  [내 Skill 수] [총 다운로드] [이번 주 증감] [순위]    │
├──────────────────────────────────────────────────────┤
│  내 Skill 목록 (2/3)        │  활동 피드 (1/3)       │
│  - skill명, 버전, 다운로드  │  - 누가 설치했는지     │
│  - 업데이트 필요 여부       │  - 최근 활동 타임라인  │
├──────────────────────────────────────────────────────┤
│  다운로드 추이 차트 (최근 30일)                       │
├──────────────────────────────────────────────────────┤
│  Quick Actions: [+ 새 Skill] [브라우징] [문서]        │
└──────────────────────────────────────────────────────┘
```

## 8. Security

| 항목 | 전략 |
|------|------|
| OAuth state | CSRF 방지 필수 |
| JWT | Access 15min + Refresh 7day, 환경별 다른 시크릿 |
| CLI 토큰 저장 | `~/.aresdevunit/config.json` 파일 권한 0600 |
| GitHub 토큰 스코프 | 최소 권한: `read:user`, repo 접근은 서버 측 GitHub App |
| 토큰 폐기 | `hub logout` 시 서버에도 무효화 요청 |
| skill 검증 | publish 시 파일 크기 제한 + 기본 패턴 검사 |
| Input validation | zod 스키마로 API 입력 및 skill.json 검증 |
| Rate limiting | API에 rate limiter 적용 (Upstash Redis 기반) |

## 9. Secret Management

| Secret | 저장 위치 |
|--------|-----------|
| `GITHUB_CLIENT_ID` / `GITHUB_CLIENT_SECRET` | Vercel 환경변수 (dev/prod 별도 OAuth App) |
| `NEXTAUTH_SECRET` | Vercel 환경변수 (환경별 다른 값) |
| `DATABASE_URL` | Vercel 환경변수 (환경별 다른 DB) |
| `GITHUB_APP_TOKEN` (skill-registry 접근) | Vercel 환경변수 |
| `UPSTASH_REDIS_REST_URL/TOKEN` | Vercel 환경변수 |
| `NPM_TOKEN` (CLI publish) | GitHub Actions secrets |

- `.env` 파일 절대 커밋 금지 (.gitignore에 포함)
- `.env.example`에 키 목록만 기록

## 10. GitHub API Caching Strategy

```
skill install 시:
  1. DB에서 skill 메타데이터 조회 (repo_path, version)
  2. Vercel KV 캐시 확인 (key: skill:{name}:{version}, TTL: 5min)
  3. 캐시 히트 → 즉시 반환
  4. 캐시 미스 → GitHub API 호출 → 캐시 저장 → 반환

skill list/search:
  - DB 직접 조회 (GitHub API 미사용)
  - publish 시에만 GitHub API 호출 → DB 동기화
```

## 11. Agent Path Mapping (install 시 배치 위치)

| Agent       | Skill 배치 경로                          |
|-------------|------------------------------------------|
| Claude Code | `~/.claude/commands/<skill-name>.md`     |
| Codex       | 해당 agent 설정 경로 (확인 필요)         |
| Custom      | `hub config set agent.<name>.path <path>` |

## 12. Implementation Phases

### Phase 0: Boilerplate (Day 1-2)
- [ ] .gitignore, .nvmrc, .env.example 생성
- [ ] 루트 package.json (workspaces, engines, packageManager)
- [ ] tsconfig.base.json, .eslintrc.js, .prettierrc
- [ ] packages/cli, packages/web, packages/shared 디렉토리 생성
- [ ] GitHub Actions CI 워크플로우 (lint + typecheck)
- [ ] LICENSE

### Phase 1: Auth Foundation (Week 1-2)
- [ ] shared: zod 스키마 (skill.json), 공유 타입 정의
- [ ] web: Next.js 프로젝트 초기화, NextAuth.js GitHub OAuth 설정
- [ ] web: Prisma 스키마 + Neon Postgres 연결 + 초기 마이그레이션
- [ ] web: API Routes — /api/auth/device (Device Code Flow)
- [ ] web: 랜딩 페이지 (CLI 설치 안내, Get Started)
- [ ] web: 로그인 페이지
- [ ] cli: 프로젝트 초기화, Commander.js 셋업
- [ ] cli: `hub login` (Device Code Flow), `hub logout`, `hub whoami`
- [ ] Vercel 배포 (Preview + Production)

### Phase 2: Core Skill Flow (Week 3-4)
- [ ] web: API Routes — /api/skills (CRUD)
- [ ] web: GitHub API wrapper + Vercel KV 캐싱 레이어
- [ ] cli: `hub init`, `hub validate`
- [ ] cli: `hub publish` (skill → GitHub repo + DB 등록)
- [ ] cli: `hub install` (skill 다운로드 → agent 경로 배치)
- [ ] cli: `hub uninstall`, `hub update`
- [ ] cli: `hub list`, `hub search`, `hub info`
- [ ] web: /skills 브라우징 페이지 (비로그인)
- [ ] web: /skills/[id] 상세 페이지
- [ ] vitest 단위 테스트 시작 (API + CLI)

### Phase 3: Dashboard & Admin (Week 5-6)
- [ ] web: /dashboard (통계 카드, 활동 피드, 다운로드 추이 차트)
- [ ] web: /settings (프로필, 토큰 관리, agent 경로)
- [ ] web: /author/[username] 프로필 페이지
- [ ] web: /admin (사용자 관리, skill 승인/삭제)
- [ ] web: /docs (시작 가이드, skill.json 스펙)
- [ ] cli: `hub doctor`, `hub config`
- [ ] API rate limiting (Upstash Redis)
- [ ] Sentry 에러 추적 연동

### Phase 4: Polish & Deploy (Week 7-8)
- [ ] GitHub Actions: npm publish 자동화 (태그 기반)
- [ ] npm 조직 등록 (@aresdevunit)
- [ ] Playwright E2E 테스트
- [ ] README, 설치 가이드 문서화
- [ ] 업타임 모니터링 설정
- [ ] 최종 보안 점검

## 13. Environment Strategy

| 환경 | Web | DB | 용도 |
|------|-----|----|------|
| Local | localhost:3000 | .env.local DB | 개발 |
| Preview | Vercel PR Preview | dev DB | PR 검증 |
| Production | hub.aresdevunit.com | prod DB | 운영 |

## 14. Future Considerations

- Skill 버전 히스토리 페이지 (/skills/[id]/versions)
- Skill 리뷰/평점 시스템
- 팀/조직 단위 private skill 공유
- Webhook 연동 (skill 업데이트 시 알림)
- GitHub → R2/S3로 skill 파일 저장 마이그레이션
- 인터랙티브 CLI (`hub` 인자 없이 실행 시 메뉴)
