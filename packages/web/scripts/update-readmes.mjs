import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

config({ path: resolve(import.meta.dirname, '..', '.env.local') });
const prisma = new PrismaClient();

const readmes = {
  'gear-encyclopedia-generate': `# 장비 백과사전 생성기

장비 7종(주무기/보조무기/아머/글러브/알파성물/베타성물/감마성물)의 백과사전 CSV를 자동 생성합니다.

## 입력 데이터
- item.csv, item_gear.csv, craft.csv, option_stat.csv, item_sys_random_option.csv

## 파라미터
- \`--gear-type\`: 주무기, 보조무기, 아머, 글러브, 알파성물, 베타성물, 감마성물

## 핵심 기능
- 강화 단계별 메인옵션 누적 계산
- 랜덤옵션 평균 전투력 산출
- 등급(C/B/A/S/R)별 정리
- 스토리용 아이템 자동 제외`,

  'mainquest-md-refresh': `# 메인퀘스트 MD 갱신

메인퀘스트 CSV → TSV → MD 갱신 파이프라인을 자동 실행합니다.

## 기능
- quest.csv, quest_reward.csv 등에서 메인퀘스트 데이터 추출
- TSV 중간 포맷으로 변환
- 최종 마크다운 문서 생성
- 역방향(MD → TSV → CSV) 반영도 지원`,

  'recommended-combatpower': `# 권장전투력 계산기

레벨별 권장전투력 CSV를 파라미터 기반으로 재생성합니다.

## 파라미터
- \`--k\`: 기본 계수 (기본값 1.0)
- \`--boss-f\`: 보스 보정 계수
- \`--mainquest-boss-f\`: 메인퀘스트 보스 보정 계수

## 입력
- mob_level_stat.csv, option_stat.csv

## 계산
- 13개 스탯 매핑 기반 전투력 산출
- floor 반올림 규칙 적용`,

  'suit-stat-combatpower': `# 슈트 스탯/전투력

슈트 레벨별 메인/서브 옵션 스탯 및 전투력을 산출합니다.

## 기능
- 슈트(A/S/R 등급) 레벨별 스탯 계산
- 전투력 산출 (옵션값 × combatpower / 100)
- \`--mode reverse\`: 백과사전 CSV → item_gear.csv 역반영
- 메인옵션 타입 해석 (main_option_type_2 = element_type + 9)`,

  'operator-stat-combatpower': `# 오퍼레이터 스탯/전투력

오퍼레이터 레벨별 스탯 및 전투력을 산출합니다. 슈트 스킬과 유사한 구조입니다.

## 기능
- item_type 31* 대상 오퍼레이터 데이터 추출
- A/S/R 등급별 레벨 스탯 계산
- 전투력 산출`,

  'suit-trait-encyclopedia': `# 슈트 특성 백과사전

슈트 특성(패시브) 데이터를 추출하고 스트링 테이블 조건/효과 문구를 자동 조합합니다.

## 입력
- item_sys_awaken.csv, rune.csv, option_stat.csv
- StringTable_Rune.txt, StringTable_Skill.txt

## 핵심 기능
- 조건가중치 기반 특성 추출
- 조건 문구 + 효과 문구 자동 조합
- 상태이상 매핑 (출혈, 기절, 결박, 쇠약, 발화, 냉각, 감전, 오염)
- 특수 옵션 전투력 계산`,

  'suit-skill-encyclopedia': `# 슈트 스킬 백과사전

슈트별 스킬(주무기/보조/SP/버스트/체인지) 정보를 추출하여 백과사전 CSV를 생성합니다.

## 입력
- item_gear.csv, skill_active.csv, skill_buff.csv
- PcSkill_* 프리팹 (fallback: 태그 기반 판별)

## 핵심 기능
- 프리팹 우선 스킬 구분, 태그 기반 fallback
- 상태이상 매핑
- 스킬 타입별 정렬`,

  'mob-level-stat-rebalance': `# 몹 레벨 스탯 리밸런스

몹 레벨별 스탯(HP/ATK/DEF 등)을 가중치 파라미터 기반으로 전체 재계산합니다.

## 파라미터
- 9개 레벨 구간별 가중치: \`--w-lv-1-20\` ~ \`--w-lv-111-120\`
- 스탯별 가중치: W_ATK, W_HP, W_DEF 등

## 핵심 기능
- 레벨 구간별 선형/커브/캡/리셋 패턴 적용
- 불변식 검증 포함
- 원본 .bak 백업 후 갱신`,

  'pc-level-stat-generate': `# PC 레벨 스탯 생성기

PC 레벨별 EXP/HP/ATK/DEF 곡선을 성장배율 파라미터 기반으로 재생성합니다.

## 파라미터
- \`--g\`: 성장배율 (기본값 1.05491694)
- 구간별 배율 파라미터

## 입력/출력
- pc_level.csv 갱신
- 원본 .bak 백업 후 갱신`,

  'weapon-option-calculate': `# 무기 옵션 계산기

주무기/보조무기 주옵션 base 값과 강화 구간별 증가량을 등급/커브별로 산출합니다.

## 핵심 기능
- 등급 진행 순서 (C→B→A→S→R)
- 커브별 가중치 적용
- C기준 등급배수, 구간 배수 산출
- 강화 S1~S5 증가량 계산`,

  'global-translation-apply': `# 글로벌 번역 적용

번역 엑셀(xlsx)을 StringTable_*.txt에 KeyString 기준으로 일괄 매핑 적용합니다.

## 핵심 기능
- 한국어 열 보호 (덮어쓰기 방지)
- JP/CS 컬럼 정규화
- Logo 특수 처리
- UTF-16 LE BOM 인코딩 보존
- 파이프(|) 문자 금지 검증`,

  'stringtable-lint': `# 스트링 테이블 검수

StringTable 한국어 열의 품질을 자동 검수합니다.

## 검출 항목
- 중복 표현
- 이중 마침표
- 공백 누락
- 따옴표 오류
- 인코딩 검증 (UTF-16LE BOM)

## 출력
- 문제 항목 리포트 + 자동 수정 제안`,

  'vehicle-encyclopedia': `# 탈것 백과사전

탈것 데이터를 item_vehicle.csv 기반으로 백과사전 CSV를 생성합니다.

## 핵심 기능
- 탈것 필터링 (대상 item_type)
- 전투력 규칙 적용
- 등급별 정리`,

  'ares-data-rules': `# Ares 데이터 작업 규칙

Ares 게임 데이터 테이블 작업 시 반드시 따라야 하는 공통 규칙입니다.

## CSV 규칙
- 인코딩: UTF-8 with BOM (EF BB BF)
- 줄바꿈: CRLF
- Edit 도구 사용 금지 — Python 바이너리 읽기/쓰기 필수
- 기존 행 삭제 금지 (append-only)

## 주요 시스템 참조
- main_option_type_2 = element_type + 9
- 장비 prefix: 730/740=렐릭, 800=가슴, 810=장갑

## 스트링 테이블
- 인코딩: UTF-16LE with BOM
- Read 도구 불가 → Python decode('utf-16-le') 사용`,
};

let updated = 0;
for (const [name, readme] of Object.entries(readmes)) {
  const skill = await prisma.skill.findFirst({ where: { name, deprecated: false } });
  if (!skill) {
    console.log(`  skip: ${name} (not found)`);
    continue;
  }
  await prisma.skill.update({
    where: { id: skill.id },
    data: { readme },
  });
  console.log(`  updated: ${name}`);
  updated++;
}

console.log(`\nDone: ${updated} readmes updated`);
await prisma.$disconnect();
