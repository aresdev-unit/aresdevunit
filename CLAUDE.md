# CLAUDE.md — AresDevUnit Hub

이 프로젝트는 **AresDevUnit Hub** — AI Agent(Claude Code, Codex 등) skill 공유 플랫폼입니다.

---

## 프로젝트 구조

```
aresdevunit/
├── packages/
│   ├── shared/     # 공유 라이브러리 (zod validators, 타입, 상수)
│   ├── web/        # Hub Web (Next.js App Router + API Routes)
│   └── cli/        # Hub CLI (Commander.js, npm link로 설치)
├── docs/
│   ├── SPEC.md          # 기술 스펙 v3.0
│   ├── PLAN.md          # 구현 플랜
│   └── SKILLS-SPEC.md   # 스킬 스펙 v1.0 (13개 구현 + 1개 보류)
├── keys.txt        # ⚠ 시크릿 (git 미추적)
└── *.pem           # ⚠ GitHub App 키 (git 미추적)
```

## 기술 스택

- **Monorepo**: npm workspaces, TypeScript, Node.js 20 LTS
- **Web**: Next.js (App Router) + NextAuth.js + Prisma + Neon Postgres (Vercel Marketplace)
- **CLI**: Commander.js + chalk + ora + inquirer
- **배포**: Vercel (수동 `vercel --prod`), Git 자동 배포 꺼져 있음
- **DB**: Neon Postgres (Vercel Marketplace 통합, DATABASE_URL 자동 주입)
- **Skill 저장소**: GitHub repo `aresdev-unit/skill-registry`

## 핵심 규칙

### CSV 작업 (Ares 게임 데이터)
- **인코딩**: UTF-8 with BOM (EF BB BF), 줄바꿈 CRLF
- **Edit 도구 사용 금지** — Python으로 바이너리 읽기/쓰기 필수
- **기존 행 삭제 금지** — append-only 원칙
- `main_option_type_2 = element_type + 9` (10이 아님)
- 장비 prefix: 730/740=렐릭, 800=가슴, 810=장갑

### 커밋
- 사용자 명시적 지시 시에만 커밋
- SVN conflict 시 mine-full 금지 → 상대방 변경사항 확인 후 머지

### 배포
- Vercel Git 자동 배포 꺼져 있음
- 수동 배포: `vercel --prod --token <TOKEN> --scope aresdevunit --cwd /mnt/e/aresdevunit --yes`
- 커밋/푸시 전 코드 리뷰 서브에이전트 돌릴 것

## Hub CLI 사용법

```bash
# 설치
git clone https://github.com/aresdev-unit/aresdevunit.git
cd aresdevunit/packages/cli && npm install && npm link

# 인증
aresdevhubcli login

# 스킬 관리
aresdevhubcli init --name <name> --description "..." --category <cat> --agent-types claude
aresdevhubcli validate
aresdevhubcli publish
aresdevhubcli install <name> --agent claude
aresdevhubcli search <query>
aresdevhubcli list --installed

# 룰 관리 (agent 무관, ~/.aresdevunit/rules/에 설치)
aresdevhubcli install ares-data-rules --type rule
aresdevhubcli rules list
aresdevhubcli rules path
aresdevhubcli rules show <name>
```

Agent 호출 시: `aresdevhubcli <command> --yes --json --agent claude`

## 데이터 경로

| 경로 | 용도 |
|------|------|
| `/mnt/d/gb_trunk/client/Data/` | Ares 게임 데이터 CSV |
| `/mnt/d/gb_trunk/client/Assets/data/` | StringTable (UTF-16LE) |
| `/mnt/d/gb_document/0_데이터 테이블/TRUNK_GL/` | 데이터 테이블 워크스페이스 |
| `/mnt/d/gb_document/0_데이터 테이블/TRUNK_GL/98_MD작업/` | 백과사전 MD (스킬 원본) |
| `/mnt/e/aresdevunit/` | Hub 프로젝트 소스코드 |

## 참조 문서

- `docs/SPEC.md` — 전체 기술 스펙 (아키텍처, API, 인증, 보안, 인프라)
- `docs/PLAN.md` — 구현 플랜 (Phase 0-2 완료, v1.1 예정)
- `docs/SKILLS-SPEC.md` — 스킬 13개(+1 보류) 상세 스펙 (입력/출력/로직/파라미터)
- 웹 가이드: `GET /api/v1/cli-guide` (CLI 전체 사용법)
- 웹 가이드: `GET /api/v1/install-guide` (설치 가이드)
