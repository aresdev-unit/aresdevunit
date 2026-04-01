# AresDevUnit Hub CLI — Handoff Document

작성일: 2026-03-31
작성자: Claude Opus 4.6 (1M context)

---

## 1. 프로젝트 개요

AresDevUnit Hub는 AI Agent(Claude Code, Codex 등) 사용자들이 제작한 skill을 공유하고 관리하는 내부 플랫폼입니다.

- **Hub CLI** (`aresdevhubcli`): skill publish/install/관리 CLI 도구
- **Hub Web**: 현황 조회, 대시보드, admin 관리 (https://aresdevunit.vercel.app)
- **Skill Registry**: GitHub repo에 skill 파일 저장 (`aresdev-unit/skill-registry`)

## 2. 아키텍처

```
사용자 CLI ──→ Hub API (Next.js on Vercel) ──→ GitHub App (skill-registry)
                    │
              Neon Postgres (Vercel Marketplace)
```

- **Monorepo**: npm workspaces (`packages/shared`, `packages/web`, `packages/cli`)
- **Web + API**: Next.js App Router, Vercel 배포 (수동 `vercel --prod`)
- **DB**: Neon Postgres (Vercel Marketplace 통합, DATABASE_URL 자동 주입)
- **인증**: NextAuth.js (Web) + Device Code Flow + JWT (CLI)
- **Git 자동 배포 꺼져 있음** — 수동 배포만

## 3. 주요 경로

| 경로 | 설명 |
|------|------|
| `/mnt/e/aresdevunit/` | Hub 프로젝트 소스코드 |
| `packages/shared/` | 공유 라이브러리 (zod validators, 타입, 상수) |
| `packages/web/` | Next.js 웹 + API |
| `packages/cli/` | CLI (Commander.js) |
| `docs/SPEC.md` | 기술 스펙 v3.0 |
| `docs/PLAN.md` | 구현 플랜 |
| `docs/SKILLS-SPEC.md` | 스킬 스펙 v1.0 (13개 + 1보류) |
| `keys.txt` | 시크릿 (git 미추적) |
| `*.pem` | GitHub App PEM 키 (git 미추적) |

## 4. 기술 스택

| Layer | Stack |
|-------|-------|
| CLI | Node.js 20, Commander.js, chalk, ora, inquirer |
| Web + API | Next.js (App Router), NextAuth.js, Prisma, Tailwind CSS |
| DB | Neon Postgres (Vercel Marketplace) |
| 인증 | GitHub OAuth + JWT (HS256) + Device Code Flow (RFC 8628) |
| 배포 | Vercel (수동), npm link (CLI) |
| Skill 저장소 | GitHub repo (aresdev-unit/skill-registry), GitHub App 토큰 접근 |

## 5. 환경변수 (Vercel에 설정됨)

| Key | 설명 |
|-----|------|
| `GITHUB_CLIENT_ID` | GitHub OAuth App ID |
| `GITHUB_CLIENT_SECRET` | GitHub OAuth Secret |
| `NEXTAUTH_SECRET` | NextAuth.js 세션 암호화 |
| `NEXTAUTH_URL` | `https://aresdevunit.vercel.app` |
| `JWT_SECRET` | CLI JWT 서명 |
| `DATABASE_URL` | Neon Postgres (자동 주입) |
| `GITHUB_APP_ID` | 3218044 |
| `GITHUB_APP_PRIVATE_KEY` | PEM base64 인코딩 (PKCS#8) |
| `GITHUB_APP_INSTALLATION_ID` | 119917581 |
| `CRON_SECRET` | Cron cleanup API 인증 |

## 6. CLI 커맨드 목록 (v0.1.2)

| 커맨드 | 설명 |
|--------|------|
| `aresdevhubcli login` | GitHub OAuth 로그인 (Device Code Flow) |
| `aresdevhubcli logout` | 로그아웃 |
| `aresdevhubcli whoami` | 현재 사용자 확인 |
| `aresdevhubcli init` | 새 skill 프로젝트 생성 |
| `aresdevhubcli validate` | skill.json 유효성 검증 |
| `aresdevhubcli publish` | skill 게시 (--patch/--minor/--major) |
| `aresdevhubcli install <name>` | skill 설치 (--agent, --type rule) |
| `aresdevhubcli uninstall <name>` | skill 제거 |
| `aresdevhubcli update` | 설치된 skill 업데이트 |
| `aresdevhubcli update-cli` | CLI 자체 업데이트 (git pull + rebuild) |
| `aresdevhubcli search <query>` | skill 검색 |
| `aresdevhubcli info <name>` | skill 상세 정보 |
| `aresdevhubcli list` | 설치된 skill 목록 (--mine: 내가 publish한 것) |
| `aresdevhubcli doctor` | CLI 상태 진단 |
| `aresdevhubcli config` | 설정 관리 (get/set/list) |
| `aresdevhubcli rules list/path/show` | 설치된 rule 관리 |

## 7. API 엔드포인트

| Method | Path | 인증 | 설명 |
|--------|------|------|------|
| GET | /api/v1/health | - | 서비스 상태 |
| POST | /api/v1/auth/device | - | Device Code 발급 |
| POST | /api/v1/auth/device/token | - | Device Code 토큰 교환 |
| POST | /api/v1/auth/refresh | - | Access token 갱신 |
| POST | /api/v1/auth/revoke | - | 토큰 폐기 |
| GET | /api/v1/skills | - | Skill 목록 |
| POST | /api/v1/skills | 🔒 | Skill 생성 |
| GET | /api/v1/skills/:name | - | Skill 상세 |
| GET | /api/v1/skills/:name/download | 선택 | Skill 다운로드 |
| POST | /api/v1/skills/:name/versions | 🔒 | 버전 추가 (누구나 가능) |
| POST | /api/v1/skills/:name/like | 🔒 | 좋아요 토글 |
| DELETE | /api/v1/skills/:name | 🔒 | Soft delete |
| GET | /api/v1/users/me | 🔒 | 내 프로필 |
| GET | /api/v1/users/:username | - | 작성자 프로필 |
| GET | /api/v1/dashboard/stats | 🔒 | 대시보드 통계 |
| GET | /api/v1/dashboard/feed | 🔒 | 활동 피드 |
| GET/PATCH | /api/v1/admin/* | Admin | 관리자 기능 |
| POST | /api/v1/cron/cleanup | CRON_SECRET | DB 정리 (월 1회) |
| GET | /api/v1/install.sh | - | 설치 스크립트 |
| GET | /api/v1/install-guide | - | 설치 가이드 (plain text) |
| GET | /api/v1/cli-guide | - | CLI 가이드 (plain text) |

## 8. DB 모델 (Prisma)

User, Skill, SkillVersion, SkillLike, ActivityLog, DeviceCode, RefreshToken, RateLimit

## 9. 등록된 Skill (21개)

### Seed (14개 — SKILLS-SPEC 기반)
gear-encyclopedia-generate, mainquest-md-refresh, recommended-combatpower, suit-stat-combatpower, operator-stat-combatpower, suit-trait-encyclopedia, suit-skill-encyclopedia, mob-level-stat-rebalance, pc-level-stat-generate, weapon-option-calculate, global-translation-apply, stringtable-lint, vehicle-encyclopedia, ares-data-rules

### User Published (7개)
dark-dimension-reward, deimos-battlefield, dungeon-drop-table, mobius-sector-reward, operator-rebalance, suit-rebalance, doc-collector

## 10. 배포 방법

```bash
# Vercel 배포 (수동)
vercel --prod --token <VERCEL_TOKEN> --scope aresdevunit --cwd /mnt/e/aresdevunit --yes

# CLI 버전 범프
cd packages/cli && bash scripts/bump-version.sh

# DB seed 실행
cd packages/web && npx tsx prisma/seed.ts

# DB README 업데이트
cd packages/web && node scripts/update-readmes.mjs

# Rate limit 초기화
cd packages/web && node scripts/clear-rate-limits.mjs

# Prisma migration
cd packages/web && npx prisma migrate dev --name <name>
```

## 11. 알려진 이슈 / 주의사항

1. **Git 자동 배포 꺼져 있음** — push 후 수동으로 `vercel --prod` 필요
2. **CI 제거됨** — lint/test는 로컬에서 수동 확인
3. **GITHUB_APP_PRIVATE_KEY** — PKCS#8 포맷 + base64 인코딩으로 Vercel에 저장. PKCS#1이면 `ERR_OSSL_UNSUPPORTED` 발생
4. **Rate limit** — publish 200/hr, download 60/min(인증)/30/min(비인증)
5. **version 추가** — author 제한 없음 (내부팀 누구나 가능)
6. **workspace_path** — `aresdevhubcli config set workspace_path "경로"` 설정 시 `.skills/`에 통합 설치
7. **NEXTAUTH_URL** — Vercel에 `https://aresdevunit.vercel.app` 설정 필수 (안 하면 Device Code Flow에서 localhost 참조)
8. **seed 스킬** — DB 레코드 + GitHub registry 파일 모두 있어야 download 가능

## 12. 테스트

```bash
# shared (39 tests)
cd packages/shared && npx vitest run

# cli (73 tests)
cd packages/cli && npx vitest run

# 총 112 tests
```

web 테스트는 Node 20 + mock 환경 필요 (CI에서 제외됨).

## 13. 향후 작업 (미구현)

- Playwright E2E 테스트
- UptimeRobot 모니터링 설정
- Activity feed privacy controls (익명화 옵션)
- daily_stats materialized view (대시보드 성능 최적화)
- circuit-diagram-refresh 스킬 (Tier 3 보류 — Unity prefab 파싱 필요)
- Sentry 에러 추적 (사용자 증가 시)
