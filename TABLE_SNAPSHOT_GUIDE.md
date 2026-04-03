# Table Snapshot Guide

`/tables` 페이지는 `packages/web/src/generated/table-index.json` 스냅샷을 읽습니다.

## 목적

- TRUNK_GL의 CSV와 매뉴얼 XLSX를 다시 스캔해서 최신 `table-index.json` 생성
- 컬럼 설명, 참조 정보, `manualSupplements`(비고 블록 포함) 갱신

## 준비

1. `aresdevunit-master` 루트에서 의존성 설치
```powershell
npm.cmd install
```

2. 기본 위치 확인
- 기본값: 현재 저장소의 상위 폴더를 `TRUNK_GL`로 간주
- 다른 위치를 쓰면 `TRUNK_GL_ROOT` 환경변수 지정

예시:
```powershell
$env:TRUNK_GL_ROOT = "E:\Document\가_글로벌 기획\0_데이터 테이블\TRUNK_GL"
```

## 스냅샷 생성

루트에서 실행:
```powershell
npm.cmd run build:data
```

출력 파일:
- `packages/web/src/generated/table-index.json`

## 빌드 검증

스냅샷 생성 후 웹 빌드:
```powershell
cd packages\web
npm.cmd run build
```

## 반영 범위

생성 스크립트는 아래 정보를 다시 읽습니다.

- DataTable CSV 헤더
- 매뉴얼 XLSX의 컬럼 설명
- 매뉴얼 XLSX의 참고표
- 매뉴얼 XLSX의 `manualSupplements` 블록
  - 예: `비고`, 예시 표, 상태값 설명, 운영 메모
- `packages/web/src/config/relation-overrides.json` 수동 참조 override

## 주의

- `/tables` 웹에서 수정한 컬럼 설명/참고표 overlay는 별도 저장층(DB 또는 로컬 override)에 있습니다.
- `build:data`는 기본 스냅샷을 다시 만드는 작업입니다. 웹 overlay를 지우는 작업은 아닙니다.
- 실행 중인 dev 서버가 있으면 Prisma 엔진 파일 잠금 때문에 `npm install` 또는 `build`가 실패할 수 있습니다. 그 경우 `node` 프로세스를 종료하고 다시 실행하세요.

## 관련 파일

- 생성 스크립트: `scripts/build-data.mjs`
- 생성 코어: `packages/web/src/lib/build-data-core.mjs`
- 출력: `packages/web/src/generated/table-index.json`
