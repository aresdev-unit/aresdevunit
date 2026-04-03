# Tables Refactor — Executable Checklist

## Phase 1: Snapshot Structure Refactoring

### 1-1. types.ts — 새 타입 추가
- [ ] `CatalogEntry` 타입 추가 (tableId, folderName, folderGroup, csvPath, keyColumns, manualWorkbook, displayName)
- [ ] `TableCatalog` 타입 추가 (generatedAt, workspaceRoot, tableCount, relationCount, entries: CatalogEntry[])
- [ ] `RelationIndex` 타입 추가 (outbound, inbound, graph)
- [ ] 기존 `Dataset`, `TableIndex` 타입 유지 (하위 호환)
- **검증**: `npx tsc --noEmit` 통과

### 1-2. build-data-core.mjs — 출력 구조 변경
- [ ] `buildDataset()` 반환값에 `catalog`, `relationIndex` 추가
- [ ] 새 export: `buildCatalog(tables)` — catalog.json 생성용
- [ ] 새 export: `buildRelationIndex(tables)` — relation-index.json 생성용
- [ ] 새 export: `buildPerTableJson(table)` — 개별 테이블 JSON 생성
- [ ] XLSX mtime 캐시: `loadWorkbookSheets()` → mtime 기반 캐시 레이어 추가
  - `.manual-cache.json` 읽기/쓰기 (path, mtime, sheets 해시)
  - 변경 없으면 캐시된 sheets 반환
- [ ] `buildTables()` → 선택적 folders 파라미터 추가 (증분 빌드용)
- [ ] 기존 `buildDataset()` 시그니처 하위 호환 유지
- **검증**: `npm run build:data` 실행 후 출력 파일 확인

### 1-3. build-data.mjs — 파일 출력 분기
- [ ] `generated/catalog.json` 쓰기
- [ ] `generated/relation-index.json` 쓰기
- [ ] `generated/tables/{tableId}.json` 개별 파일 쓰기 (162개)
- [ ] `generated/table-index.json` 유지 (웹 빌드 하위 호환, Phase 2에서 제거)
- [ ] 출력 통계 로그 (테이블 수, relation 수, 캐시 히트율)
- **검증**: `ls packages/web/src/generated/tables/ | wc -l` = 162, `catalog.json` + `relation-index.json` 존재

### 1-4. data.ts — catalog/relation-index 기반 로드 (하위 호환)
- [ ] `catalog.json` import 추가
- [ ] `relation-index.json` import 추가
- [ ] `getCatalog()` export 추가 — CatalogEntry[] 반환
- [ ] `getRelationIndex()` export 추가 — RelationIndex 반환
- [ ] `getTableById(tableId)` export 추가 — 개별 테이블 lazy 로드
- [ ] 기존 `getDataset()`, `getCsvPages()` 등은 유지 (Phase 2에서 마이그레이션)
- **검증**: 기존 API routes가 깨지지 않음 — `npx tsc --noEmit`

### 1-5. TABLE_SNAPSHOT_GUIDE.md 업데이트
- [ ] 새 출력 구조 문서화 (catalog.json, relation-index.json, tables/*.json)
- [ ] 증분 빌드 사용법 문서화
- [ ] XLSX 캐시 설명 추가

### 1-6. .gitignore 조정
- [ ] `packages/web/src/generated/tables/` 디렉토리 gitignore 추가 (162개 개별 파일은 git 추적 불필요)
- [ ] `.manual-cache.json` gitignore 추가
- [ ] `catalog.json`, `relation-index.json`은 git 추적 유지

---

## Phase 2: /tables Page Performance

### 2-1. page.tsx — 서버 측 병렬화
- [ ] `getServerSession()` + `cookies()` → `Promise.all`
- [ ] `getCsvPages()` + `listEditLogs()` → `Promise.all`
- **검증**: 페이지 로드 시 직렬 await 없음 (코드 검색)

### 2-2. page.tsx — 서버/클라이언트 분리
- [ ] 서버 컴포넌트: auth 체크 + csvPages(catalog 기반) 전달만
- [ ] 새 클라이언트 컴포넌트 `TableWorkspace` 생성 — 테이블 전환/탭 상태 관리
- [ ] searchParams 변경 시 서버 왕복 대신 클라이언트 state 전환
- [ ] 테이블 상세 데이터는 개별 JSON lazy import 또는 API fetch
- [ ] 수정 로그는 로그 탭 진입 시 `/api/v1/tables/edit-logs` fetch
- **검증**: 테이블 탭 클릭 시 네트워크 탭에서 full document 재요청 없음

### 2-3. Suspense 스트리밍
- [ ] 사이드바/헤더 즉시 렌더
- [ ] 테이블 상세 영역 Suspense boundary
- [ ] 로딩 스켈레톤 fallback
- **검증**: `npm run build` 성공, 페이지 동작 확인

### 2-4. 새 API 엔드포인트 (필요시)
- [ ] `GET /api/v1/tables/[tableId]` — 개별 테이블 데이터 반환 (클라이언트 fetch용)
- [ ] `GET /api/v1/tables/catalog` — catalog 반환 (선택적)
- **검증**: API 응답 확인

---

## Phase 3: tables-ref CLI Skill

### 3-1. 스킬 파일 생성
- [ ] `/home/aory/.claude/skills/tables-ref/SKILL.md` 생성
- [ ] 주 기능: 의존성 조회 (inbound/outbound relations)
- [ ] 주 기능: 타겟 파일 서치 (tableId → csvPath → TRUNK_GL 실제 경로)
- [ ] 주 기능: 변경 영향 범위 리포트
- [ ] 서브 기능: 스냅샷 업데이트 (build:data 호출)
- [ ] 서브 기능: 선택적 git push + Vercel 배포
- [ ] `ares-data-rules`에 tables-ref 참조 추가

### 3-2. relation-index.json 파싱 로직
- [ ] 스킬 내에서 relation-index.json 읽는 방법 기술
- [ ] inbound/outbound 탐색 패턴 예시
- [ ] 영향 범위 계산 알고리즘 (1-hop, 2-hop)
- **검증**: 스킬 로드 후 `tables-ref` 트리거 시 동작 확인
