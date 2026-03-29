# AresDevUnit Hub - Skills Specification v1.0

> 작성일: 2026-03-30
> 프로젝트: Ares (Unity 게임 클라이언트)
> 데이터 기본 경로: `/mnt/d/gb_trunk/client/Data/`
> 원본 MD 경로: `TRUNK_GL/98_MD작업/`

---

## Overview

초기 스킬 14개의 목적, 입력, 출력, 파라미터, 의존 데이터, 실행 예시를 정의한다. Tier 0(즉시 제작 3개), Tier 1(중간 난이도 6개), Tier 2(특수/유틸 5개)로 구분하며, 각 스킬은 게임 데이터 기획자와 AI Agent(Claude Code, Codex)가 공통으로 사용할 수 있도록 설계한다.

---

## Tier 0: 즉시 제작

---

### 1. gear-encyclopedia-generate

- **목적**: 장비 7종(주무기/보조무기/아머/글러브/알파성물/베타성물/감마성물)의 백과사전 CSV를 생성한다. 각 장비의 강화단계별 메인옵션값, 서브옵션, 랜덤옵션, 평균 전투력을 산출하여 기획자가 밸런스를 일람할 수 있도록 한다.
- **카테고리**: data-analysis
- **Agent**: claude, codex
- **입력 데이터**:

| CSV 파일 | 경로 (Data/ 기준) | 필요 컬럼 |
|---|---|---|
| `item.csv` | `01_아이템 DataTable_GL/item.csv` | `item_type`, `#item_name\|string`, `item_grade`, `item_category` |
| `item_gear.csv` | `01_아이템 DataTable_GL/item_gear.csv` | `item_type`, `main_option_type_1`, `main_option_value_1`, `main_option_enchant_1\|vector<uint>`, `main_option_enchant_section_1\|vector<uint>`, `sub_option_type_1`, `sub_option_value_1`, `random_option_group`, `random_option_count` |
| `craft.csv` | `13_제작 DataTable_GL/craft.csv` | `item_type` (획득처 판정용) |
| `option_stat.csv` | `20_option_stat DataTable_GL/option_stat.csv` | `##OptionType`: `#dispName`, `##StatType`: `#dispName`, `combatpower`, `statType\|vector<uint>` |
| `item_sys_random_option.csv` | `01_아이템 DataTable_GL/item_sys_random_option.csv` | `random_option_group`, `option_type`, `random_option_portion`, `random_option_portion_high`, `option_value_base_min\|int`, `option_value_base_max\|int`, `option_value_base_divide` |

- **파라미터**:
  - `--gear-type <주무기|보조무기|아머|글러브|알파성물|베타성물|감마성물>` (필수)
  - `--data-root <경로>` (선택, 기본값: `/mnt/d/gb_trunk/client/Data/`)
  - `--output <경로>` (선택, 기본값: `98_MD작업/장비/백과사전_장비_{gear-type}.csv`)

- **출력**: `백과사전_장비_{gear-type}.csv` (UTF-8-BOM, CRLF)
  - 좌측 섹션: 장비 상세 (item_type, 명칭, 등급, 티어, 강화단계, 메인옵션명, 메인옵션값, 서브옵션명, 서브옵션값, 획득처, 랜덤옵션ID, 랜덤옵션수, 평균전투력)
  - 우측 섹션 (빈 칸 1개 간격): 랜덤옵션 테이블 (랜덤옵션ID, 옵션ID, 옵션명, portion, high_portion, 최소값, 최대값, 분할수, 전투력)

- **핵심 로직**:
  1. **대상 필터링**: gear-type별 item_type prefix로 필터 (주무기=71, 보조무기=72, 알파성물=73, 베타성물=74, 감마성물=75, 아머=80, 글러브=81). 스토리용 아이템 제외 목록 적용. 제외 목록은 각 gear-type별 원본 MD 참조: `/mnt/d/gb_document/0_데이터 테이블/TRUNK_GL/98_MD작업/장비/백과사전_장비_{type}_인게임가져오기.md`
  2. **등급 매핑**: `item_grade` -> C/B/A/S/R. 티어 = 등급문자 + item_type 끝에서 2~3번째 숫자.
  3. **강화단계 전개**: 등급별 최대 강화 (C:0~5, B:0~10, A:0~15, S:0~20, R:0~25).
  4. **메인옵션값 계산**: `base = main_option_value_1`. 구간별 누적: `value(L) = base + steps1*i1 + steps2*i2 + ... + steps5*i5`. 구간 시작레벨 = `main_option_enchant_section_1`.
  5. **옵션명 해석**: `option_stat.csv`의 `##OptionType #dispName` 우선, 없으면 `##StatType #dispName`.
  6. **랜덤옵션 전투력**: 옵션별 전투력 = `((min+max)/2 * combatpower) / 100`. 그룹 평균 전투력 = `sum(옵션전투력 * high_portion) / sum(high_portion)` (high_portion 합 0이면 단순 평균).
  7. **평균 전투력**: 메인옵션 전투력 + 서브옵션 전투력 + (그룹 평균 전투력 * 랜덤옵션 수).
  8. **획득처**: craft.csv에 존재하면 `제작`, 없으면 `드랍`.

- **실행 예시**:
  ```bash
  hub install gear-encyclopedia-generate
  # Agent 사용 예시
  hub run gear-encyclopedia-generate --gear-type 주무기
  hub run gear-encyclopedia-generate --gear-type 감마성물 --output ./output/감마성물.csv
  ```

- **의존성**: 없음 (단독 실행 가능)
- **난이도**: 중
- **예상 구현 시간**: 3일

---

### 2. mainquest-md-refresh

- **목적**: 메인퀘스트 원본 CSV를 TSV로 변환하고, TSV를 MD로 갱신하는 파이프라인을 실행한다. 선택적으로 TSV 수정 내용을 원본 CSV에 역반영할 수 있다.
- **카테고리**: data-analysis
- **Agent**: claude, codex
- **입력 데이터**:

| CSV 파일 | 경로 (Data/ 기준) | 필요 컬럼 |
|---|---|---|
| `quest.main.seg.csv` | `02_퀘스트 DataTable_GL/quest.main.seg.csv` | `quest_id`, `quest_name`, `quest_name_main`, `reward_id`, `switch_single_zone`, `use_trigger_end` |
| `quest_task.main.seg.csv` | `02_퀘스트 DataTable_GL/quest_task.main.seg.csv` | `quest_id`, `task_id` |
| `quest_reward.csv` | `02_퀘스트 DataTable_GL/quest_reward.csv` | `reward_id`, `item_type`, `item_count` |
| `item.csv` | `01_아이템 DataTable_GL/item.csv` | `item_type`, `#item_name\|string` (이름 매핑용) |

- **파라미터**:
  - `--step <csv2tsv|tsv2md|tsv2csv|all>` (기본값: `all`)
  - `--data-root <경로>` (선택, 기본값: `/mnt/d/gb_trunk/client/Data/`)
  - `--tsv-dir <경로>` (선택, 기본값: `98_MD작업/메인 퀘스트/백과사전_메인퀘스트_TSV/`)
  - `--md-dir <경로>` (선택, 기본값: `98_MD작업/메인 퀘스트/백과사전_메인퀘스트_MD/`)

- **출력**:
  - TSV: `quest_rewards_wide.tsv`, `switch_single_zone_quest_mobs_wide__server_level.tsv`
  - MD: 갱신된 메인퀘스트 백과사전 MD 파일들
  - (역반영 시) 원본 CSV 업데이트

- **핵심 로직**:
  1. **CSV -> TSV**: quest/quest_task/quest_reward를 조인하여 quest_rewards_wide.tsv 생성. 20개 컬럼 (quest_id, quest_name, quest_name_main, reward_id, switch_single_zone, use_trigger_end, 보상1~4_item_type/이름/개수, row_type, task_id).
  2. **TSV -> MD**: TSV를 읽어 Markdown 형식의 백과사전 문서로 변환.
  3. **TSV -> CSV (역반영)**: TSV에서 직접 수정한 내용을 원본 quest CSV에 반영.

- **실행 예시**:
  ```bash
  hub install mainquest-md-refresh
  hub run mainquest-md-refresh --step all
  hub run mainquest-md-refresh --step csv2tsv
  hub run mainquest-md-refresh --step tsv2csv  # TSV 수정 후 역반영
  ```

- **의존성**: 없음
- **난이도**: 중
- **예상 구현 시간**: 2일

---

### 3. recommended-combatpower

- **목적**: 레벨별 권장전투력 CSV(`recommended_combatpower_by_level_k_sweep.csv`)를 재생성한다. 몹 레벨 스탯과 옵션 전투력 가중치를 기반으로 Base Mob CP, 보스 추천 전투력, 메인퀘스트 보스 추천 전투력을 계산한다.
- **카테고리**: data-analysis
- **Agent**: claude, codex
- **입력 데이터**:

| CSV 파일 | 경로 (Data/ 기준) | 필요 컬럼 |
|---|---|---|
| `option_stat.csv` | `20_option_stat DataTable_GL/option_stat.csv` | `##StatType` 섹션: `combatpower` (StatType별 전투력 가중치) |
| `mob_level_stat.csv` | `11_몬스터 DataTable_GL/mob_level_stat.csv` | `level`, `attack_powers`, `defense_powers`, `health`, `shields`, `ignore_defense_damage`, `inc_critical_rate`, `inc_critical_damage`, `defense_blow`, `inc_damage`, `dec_critical_rate`, `dec_critical_damage`, `defense_blow_resist`, `dec_damage` |

- **파라미터**:
  - `--k <float>` (기본값: `1.1`) -- 기본 계수
  - `--boss-f <float>` (기본값: `2.7`) -- 보스 계수
  - `--mainquest-boss-f <float>` (기본값: `1.6`) -- 메인퀘스트 보스 계수
  - `--data-root <경로>` (선택, 기본값: `/mnt/d/gb_trunk/client/Data/`)
  - `--output <경로>` (선택, 기본값: `98_MD작업/권장전투력.csv`)

- **출력**: `recommended_combatpower_by_level_k_sweep.csv` (UTF-8-BOM, CRLF)
  - 컬럼: `level`, `base_mob_cp`, `rec_cp_boss`, `rec_cp_mainquest_boss`

- **핵심 로직**:
  1. **스탯 매핑** (코드 고정): `attack_powers`->StatType 10, `defense_powers`->2, `health`->101, `shields`->102, `ignore_defense_damage`->32, `inc_critical_rate`->30, `inc_critical_damage`->31, `defense_blow`->33, `inc_damage`->37, `dec_critical_rate`->130, `dec_critical_damage`->131, `defense_blow_resist`->34, `dec_damage`->133.
  2. **Base CP 계산**: `base_cp_raw(level) = sum(mob_level_stat[level][col] * weight[StatType(col)]) / 100`.
  3. **반올림**: ROUND_HALF_UP = `floor(x + 0.5)` (x <= 0 또는 NaN/Inf이면 0).
  4. **출력값**: `base_mob_cp = ROUND_HALF_UP(base_cp_raw)`, `rec_cp_boss = ROUND_HALF_UP(base_cp_raw * K * BOSS_F)`, `rec_cp_mainquest_boss = ROUND_HALF_UP(base_cp_raw * K * MAINQUEST_BOSS_F)`.
  5. 주의: `rec_cp_*`는 정수 `base_mob_cp`가 아닌 반올림 전 `base_cp_raw`에 계수를 곱한 뒤 최종 반올림.

- **실행 예시**:
  ```bash
  hub install recommended-combatpower
  hub run recommended-combatpower
  hub run recommended-combatpower --k 1.2 --boss-f 3.0 --mainquest-boss-f 1.8
  ```

- **의존성**: 없음
- **난이도**: 하
- **예상 구현 시간**: 1일

---

## Tier 1: 중간 난이도

---

### 4. suit-stat-combatpower

- **목적**: 슈트 레벨별(1~60) 스탯(실드/공격력/방어력) 및 전투력을 산출하여 `백과사전_슈트_스탯전투력.csv`를 생성하고, 수정 시 원본 `item_gear.csv`에 역반영한다.
- **카테고리**: data-analysis
- **Agent**: claude, codex
- **입력 데이터**:

| CSV 파일 | 경로 (Data/ 기준) | 필요 컬럼 |
|---|---|---|
| `item.csv` | `01_아이템 DataTable_GL/item.csv` | `item_type`, `item_category`(=70), `item_grade`, `#item_name\|string`, `#item_note` |
| `item_gear.csv` | `01_아이템 DataTable_GL/item_gear.csv` | `item_type`, `main_option_type_1~3`, `main_option_value_1~3`, `main_option_enchant_*`, `main_option_enchant_section_*`, `sub_option_type_1~3`, `sub_option_value_1~3` |
| `option_stat.csv` | `20_option_stat DataTable_GL/option_stat.csv` | `##OptionType`: `#dispName`, `##StatType`: `#dispName`, `combatpower`, `statType\|vector<uint>`, `valueType` |

- **파라미터**:
  - `--mode <generate|reverse>` (기본값: `generate`)
  - `--data-root <경로>` (선택, 기본값: `/mnt/d/gb_trunk/client/Data/`)
  - `--output <경로>` (선택)

- **출력**:
  - generate: `백과사전_슈트_스탯전투력.csv` (슈트별 레벨 1~60 행, 실드/공격력/방어력/서브옵션/전투력)
  - reverse: `item_gear.csv` 수정

- **핵심 로직**:
  1. **대상 선정**: `item_category = 70`(SUIT). 이름/노트에 `설정용`, `캐릭터 생성/캐릭터생성` 제외.
  2. **등급 매핑**: `item_grade` 3->A, 4->S, 5->R. `#item_note`의 `_*_` 패턴으로 보조 확인. 슈트/오퍼레이터는 A(3)/S(4)/R(5) 등급만 존재. C(1)/B(2)는 해당 없음.
  3. **티어 매핑**: item_type 4번째 자리(0-indexed 3) = 티어(0~5). 레벨 구간: 1~9->0, 10~19->1, 20~29->2, 30~39->3, 40~49->4, 50~60->5.
  4. **메인 옵션 타입 해석**: 140->실드, 2->방어력, 1/9/10/11/12/13/14->공격력 합산.
  5. **전투력**: `+v`(valueType=0): `옵션값 * combatpower / 100`. `+v%`(valueType=1): `옵션값 * combatpower / 100`. 기반스탯 %옵션: `기반스탯 * (옵션값/10000) * combatpower / 100`. 스킬 레벨(601~604): combatpower=65. 합산 후 floor.
  6. **정렬**: R -> S -> A, 등급 내 1레벨 item_type 오름차순, 슈트 내부 레벨 오름차순.
  7. **역반영**: 레벨1 수정 -> `main_option_value_*`, 구간 수정 -> `main_option_enchant_*` 조정. 역반영 시: 백과사전 CSV의 레벨1 행 -> `item_gear.csv`의 `main_option_value_*` 컬럼에 매핑. 구간별 증가량 -> `main_option_enchant_*` 컬럼에 매핑. 기존 행의 다른 컬럼은 보존.

- **실행 예시**:
  ```bash
  hub install suit-stat-combatpower
  hub run suit-stat-combatpower --mode generate
  hub run suit-stat-combatpower --mode reverse  # CSV 수정 후 item_gear.csv 반영
  ```

- **의존성**: 없음
- **난이도**: 중
- **예상 구현 시간**: 3일

---

### 5. operator-stat-combatpower

- **목적**: 오퍼레이터 레벨별(1~60) 스탯 및 전투력을 산출하여 `백과사전_오퍼레이터_스탯전투력.csv`를 생성한다.
- **카테고리**: data-analysis
- **Agent**: claude, codex
- **입력 데이터**:

| CSV 파일 | 경로 (Data/ 기준) | 필요 컬럼 |
|---|---|---|
| `item.csv` | `01_아이템 DataTable_GL/item.csv` | `item_type`, `item_grade`, `#item_name\|string` |
| `item_gear.csv` | `01_아이템 DataTable_GL/item_gear.csv` | `item_type`, `main_option_type_*`, `main_option_value_*`, `main_option_enchant_*`, `main_option_enchant_section_*`, `sub_option_type_1~3`, `sub_option_value_1~3` |
| `option_stat.csv` | `20_option_stat DataTable_GL/option_stat.csv` | `##OptionType`: `#dispName`, `##StatType`: `#dispName`, `combatpower`, `statType\|vector<uint>` |

- **파라미터**:
  - `--data-root <경로>` (선택, 기본값: `/mnt/d/gb_trunk/client/Data/`)
  - `--output <경로>` (선택, 기본값: `98_MD작업/오퍼레이터/백과사전_오퍼레이터_스탯전투력.csv`)

- **출력**: `백과사전_오퍼레이터_스탯전투력.csv`
  - 컬럼: 오퍼레이터 아이템 타입, 오퍼레이터명, 등급, 레벨, 실드, 공격력, 방어력, 서브옵션1~3(타입/명/값), 메인옵션 전투력, 서브 옵션 전투력, 총 전투력

- **핵심 로직**:
  1. **대상**: `item_type`이 `31`로 시작하는 오퍼레이터.
  2. **등급 매핑**: 3->A, 4->S, 5->R. 슈트/오퍼레이터는 A(3)/S(4)/R(5) 등급만 존재. C(1)/B(2)는 해당 없음.
  3. **티어 매핑**: item_type 4번째 자리 = 티어(0~5). 레벨 구간은 슈트와 동일.
  4. **스탯 계산**: 실드(140), 방어(2), 공격(1,9,10,11,12,13,14 합산). enchant 구간 누적 방식 동일.
  5. **전투력**: `옵션값 * combatpower / 100`, 합산 후 floor. %옵션은 슈트와 동일 규칙.
  6. **정렬**: R -> S -> A, 같은 등급 내 BaseType 오름차순.

- **실행 예시**:
  ```bash
  hub install operator-stat-combatpower
  hub run operator-stat-combatpower
  ```

- **의존성**: 없음
- **난이도**: 중
- **예상 구현 시간**: 2일

---

### 6. suit-trait-encyclopedia

- **목적**: 슈트 특성(각성) 정보를 정리한 `백과사전_슈트_특성.csv`를 생성하고, 수정 시 원본 테이블 + StringTable_Rune에 역반영(스트링 자동 조합 포함)한다.
- **카테고리**: data-analysis
- **keywords**: `string-generation` (역반영 시 StringTable 스트링 자동 생성 포함)
- **Agent**: claude, codex
- **입력 데이터**:

| 파일 | 경로 | 필요 컬럼/키 |
|---|---|---|
| `item_sys_awaken.csv` | `01_아이템 DataTable_GL/item_sys_awaken.csv` | `item_type`, `awaken_level`, `awaken_name_key`, `rune_id`, `option_1_type/value`, `option_2_type/value` |
| `item.csv` | `01_아이템 DataTable_GL/item.csv` | `item_type`, `item_category`(=70), `item_grade`, `#item_note` |
| `rune.csv` | `04_룬 DataTable_GL/rune.csv` | `rune_id`, `condition_type`, `condition_value`, `target_type`, `cooltime`, `act_function_1/2`, `act_value_1/2`, `act_duration_1/2` |
| `rune_condition.csv` | `04_룬 DataTable_GL/rune_condition.csv` | `condition_type`, `#note` |
| `option_stat.csv` | `20_option_stat DataTable_GL/option_stat.csv` | `##OptionType`, `##StatType`, `combatpower` |
| `StringTable_Rune.txt` | `GlobalTrunk/Client/Assets/data/StringTable_Rune.txt` | `rune_XXXX_name`, `rune_XXXX_desc` |
| `StringTable_Skill.txt` | `GlobalTrunk/Client/Assets/data/StringTable_Skill.txt` | `skill_{id}_name` (조건 스킬명 참조) |

- **파라미터**:
  - `--mode <generate|reverse>` (기본값: `generate`)
  - `--data-root <경로>` (선택, 기본값: `/mnt/d/gb_trunk/client/Data/`)

- **출력**:
  - generate: `백과사전_슈트_특성.csv`
  - reverse: `item_sys_awaken.csv`, `rune.csv`, `StringTable_Rune.txt` 수정

- **핵심 로직**:
  1. **대상**: `awaken_level >= 1`만 포함.
  2. **특성명/설명**: `awaken_name_key` -> StringTable_Rune의 `_name`/`_desc` 매핑.
  3. **룬 조건**: `rune.csv`의 `condition_type/value`, `target_type`(1=자신(모든슈트), 2=자신+파티원, 3=적, 4=자신(현재슈트)), `cooltime`.
  4. **옵션 매핑**: `item_sys_awaken`의 option 우선, 비어있으면 `rune.csv`의 `act_function/act_value`로 보정. 상태이상 매핑: 1000=출혈, 1002=기절, 1005=결박, 1009=쇠약, 1100=발화, 1200=냉각, 1300=감전, 1400=오염.
  5. **전투력 계산**: combatpower 기준. 특수 규칙: 601=combatpower 200, 602~604=65, 924=1당0.5, 915=100당10. %옵션 combatpower 대체(4->2, 20->10, 21->11 등).
  6. **조건가중치/실질보유전투력**: 조건타입별 가중치(0=1.0, 71=0.7, 12=0.8, 88=0.7, 83=0.5, 41=0.9, 44=0.2, 11=0.9). 실질보유전투력 = 상승전투력 * 조건가중치.
  7. **역반영 스트링 조합**: 조건문구 + 기간 + 효과를 규칙 기반으로 자동 생성하여 `StringTable_Rune.txt`의 `rune_XXXX_desc` 갱신.

- **실행 예시**:
  ```bash
  hub install suit-trait-encyclopedia
  hub run suit-trait-encyclopedia --mode generate
  hub run suit-trait-encyclopedia --mode reverse
  ```

- **의존성**: 없음
- **난이도**: 상
- **예상 구현 시간**: 5일

---

### 7. suit-skill-encyclopedia

- **목적**: 슈트별 스킬 정보(데미지, 효과, 태그, 인게임 설명)를 정리한 `백과사전_슈트_스킬.csv`를 생성한다.
- **카테고리**: data-analysis
- **Agent**: claude, codex
- **입력 데이터**:

| 파일 | 경로 | 필요 컬럼 |
|---|---|---|
| `item_gear.csv` | `01_아이템 DataTable_GL/item_gear.csv` | `item_type`, `#item_name`, `skill_id` |
| `item.csv` | `01_아이템 DataTable_GL/item.csv` | `item_type`, `item_grade` |
| `skill_active.csv` | `10_스킬 DataTable_GL/skill_active.csv` | `skill_index`, `damage_rate`, `skill_tag`, `cs_type` |
| `skill_buff.csv` | `10_스킬 DataTable_GL/skill_buff.csv` | `skill_index`, `skill_level`, `act_function`, `act_value`, `act_cc_point_type` |
| `tag.csv` | `44_태그_DataTable_GL/tag.csv` | `tag_id`, 태그명 |
| `option_stat.csv` | `20_option_stat DataTable_GL/option_stat.csv` | `##OptionType #dispName`, `#desc`, `#act_note` |
| `StringTable_Skill.txt` | `GlobalTrunk/Client/Assets/data/StringTable_Skill.txt` | `skill_{id}_name`, `skill_{id}_desc` |
| PcSkill 프리팹 | `GlobalTrunk/Client/Assets/Standard Assets/Game/Settings/AresAssetBundles/PcSkill_*` | `_isSuitChangeSkill`, `_isSuitSkill`, `_isSubWeapon`, `_isChargeAttack`, `_skillRangeType`, `_maxStackCount` |

- **파라미터**:
  - `--data-root <경로>` (선택, 기본값: `/mnt/d/gb_trunk/client/Data/`)
  - `--globaltrunk-root <경로>` (선택, 기본값: 자동 탐색)
  - `--output <경로>` (선택)

- **출력**: `백과사전_슈트_스킬.csv`
  - 컬럼: 슈트, 슈트등급, 스킬구분, 스킬ID, 이름, 원거리, 2회사용, 차지, 효과1/2(ID/명/값), 12레벨효과, 15레벨효과, 태그1/2, 기본스킬데미지, 인게임설명

- **핵심 로직**:
  1. **슈트별 스킬 추출**: item_gear.csv에서 같은 슈트의 가장 낮은 item_type 행 기준으로 skill_id 추출.
  2. **스킬구분 판별**: 프리팹 우선. 체인지(30000~39999=일반, 50000~59999=퍼펙트), 버스트(`_isSuitSkill`), SP(`cs_type != 0`), 보조무기/주무기(`_isSubWeapon`).
  3. **효과**: skill_buff의 `skill_level=1` 기준 `act_function`/`act_value`. 상태이상은 `act_cc_point_type` 매핑(1000=출혈, 1100=발화, 1200=냉각, 1300=감전, 1400=오염).
  4. **태그**: skill_active의 `skill_tag` -> tag.csv 이름 변환, 상위 2개.
  5. **정렬**: R->S->A, 등급 내 item_type 최저값 오름차순, 슈트 내 주무기->보조무기->SP->버스트->퍼펙트체인지->일반체인지.

- **실행 예시**:
  ```bash
  hub install suit-skill-encyclopedia
  hub run suit-skill-encyclopedia
  ```

- **의존성**: 없음
- **난이도**: 상
- **예상 구현 시간**: 4일

---

### 8. mob-level-stat-rebalance

- **목적**: `mob_level_stat.csv`(레벨 1~120)의 스탯을 가중치 기반으로 재계산한다. 글로벌 스케일, 스탯별 스케일, 레벨 구간별 스케일을 조합하여 밸런스 조정을 자동화한다.
- **카테고리**: data-analysis
- **Agent**: claude, codex
- **입력 데이터**:

| CSV 파일 | 경로 (Data/ 기준) | 필요 컬럼 |
|---|---|---|
| `mob_level_stat.csv` | `11_몬스터 DataTable_GL/mob_level_stat.csv` | `level`, `attack_powers`, `defense_powers`, `health`, `shields`, `ignore_defense_damage`, `inc_critical_rate`, `inc_critical_damage`, `defense_blow`, `inc_damage`, `fixed_damage_reduction`, `dec_critical_rate`, `dec_critical_damage`, `defense_blow_resist`, `dec_damage`, `damage_bias_attack_rate`, `damage_bias_defense_rate`, `exp`, `gold`, `core_rate\|float`, `core_count\|vector<uint>` |

- **파라미터** (가중치):
  - `--w-global <float>` (기본값: 1.0)
  - `--w-atk <float>` (기본값: 1.0)
  - `--w-hp <float>` (기본값: 1.0)
  - `--w-def <float>` (기본값: 1.0)
  - `--w-ign-def <float>` (기본값: 1.0)
  - `--w-fixed-dr <float>` (기본값: 1.0)
  - `--w-crit <float>` (기본값: 1.0)
  - `--w-blow <float>` (기본값: 1.0)
  - `--w-inc-dmg <float>` (기본값: 1.0)
  - `--w-blow-res <float>` (기본값: 1.0)
  - `--w-dec-dmg <float>` (기본값: 1.0)
  - `--w-exp <float>` (기본값: 1.0)
  - `--w-gold <float>` (기본값: 1.0)
  - `--w-core-rate <float>` (기본값: 1.0)
  - `--w-lv-1-20 <float>` (기본값: 1.0)
  - `--w-lv-21-30 <float>` (기본값: 1.0)
  - `--w-lv-31-40 <float>` (기본값: 1.0)
  - `--w-lv-41-50 <float>` (기본값: 1.0)
  - `--w-lv-51-60 <float>` (기본값: 1.0)
  - `--w-lv-61-80 <float>` (기본값: 1.0)
  - `--w-lv-81-100 <float>` (기본값: 1.0)
  - `--w-lv-101-110 <float>` (기본값: 1.0)
  - `--w-lv-111-120 <float>` (기본값: 1.0)
  - `--output <경로>` (선택)

- **출력**: 갱신된 `mob_level_stat.csv`

- **핵심 로직**:
  1. **적용식**: 정수 컬럼: `final = ROUND_HALF_UP(base * W_GLOBAL * W_LV(level) * W_x)`. float 컬럼(`core_rate`): 동일하나 정수화 안 함. `core_count`: 변경 없음.
  2. **불변식 유지**: `shields == health`, `damage_bias_attack_rate == 10000`, `damage_bias_defense_rate == 10000`.
  3. **캡/리셋 패턴**: Lv100~120 방어/저항/고정감소 캡. Lv111~120 핵심 전투 스탯 Lv100 값 리셋. Lv116~120 exp/gold 고정.
  4. **구간별 규칙**: defense_powers Lv1~80=`667*level`, Lv81~100=`200*level`, Lv101~120=20000 캡. 크리 Lv80~120 선형 `50*level+6800`.
  5. **백업**: 원본 CSV 수정 전 `.bak` 백업 생성. `--no-backup` 플래그로 생략 가능.

- **실행 예시**:
  ```bash
  hub install mob-level-stat-rebalance
  hub run mob-level-stat-rebalance --w-atk 1.2 --w-hp 0.9 --w-lv-51-60 1.15
  ```

- **의존성**: 없음
- **난이도**: 상
- **예상 구현 시간**: 4일

---

### 9. pc-level-stat-generate

- **목적**: `pc_level.csv`(캐릭터 레벨 EXP/기본 스탯 곡선)와 `pc_level_penalty.csv`(레벨차 피해 보정)를 가중치 기반으로 재생성한다.
- **카테고리**: data-analysis
- **Agent**: claude, codex
- **입력 데이터**:

| 파일 | 경로 | 비고 |
|---|---|---|
| `pc_level.csv` | `03_캐릭터 DataTable_GL/pc_level.csv` | 기존 데이터 참조/덮어쓰기 |
| `pc_level_penalty.csv` | `03_캐릭터 DataTable_GL/pc_level_penalty.csv` | 기존 데이터 참조/덮어쓰기 |

- **파라미터** (가중치):
  - `--max-level <int>` (기본값: 60)
  - `--growth-rate <float>` (기본값: 1.05491694) -- 공통 성장배율 g
  - `--base-hp <int>` (기본값: 4000) -- Lv1 addmaxhealth
  - `--base-atk <int>` (기본값: 40) -- Lv1 addphysicattack
  - `--base-def <int>` (기본값: 50) -- Lv1 adddefense
  - `--exp-round-to <int>` (기본값: 1000) -- EXP 반올림 단위
  - `--exp-factor-21-40 <float>` (기본값: 1.10)
  - `--exp-factor-41-50 <float>` (기본값: 1.15)
  - `--exp-factor-51-55 <float>` (기본값: 1.17)
  - `--exp-factor-56-60 <float>` (기본값: 1.20)
  - `--penalty-max-diff <int>` (기본값: 10)
  - `--penalty-base <float>` (기본값: 1.00)
  - `--penalty-step <float>` (기본값: -0.01)
  - `--output <경로>` (선택)

- **출력**: `pc_level.csv`, `pc_level_penalty.csv`
  - pc_level 컬럼: `level|uint|key`, `req_exp|ulong`, `addmaxhealth`, `addphysicattack`, `adddefense`
  - pc_level_penalty 컬럼: `level_difference|uint|key`, `damage_correction|float`

- **핵심 로직**:
  1. **EXP 곡선**: Lv2~20은 고정값 테이블(2500, 10000, ..., 100000). Lv21~60은 재귀식 `delta_exp[L] = ROUND(delta_exp[L-1] * factor(L), -3)`. `req_exp[L] = req_exp[L-1] + delta_exp[L]`.
  2. **기본 스탯**: `value(L) = ROUND(base * POWER(g, L-1), 0)`. ROUND = 0.5 올림(half-up).
  3. **레벨차 페널티**: `damage_correction = penalty_base + penalty_step * level_difference`.
  4. **검증**: key 연속/중복 없음, req_exp 및 스탯 단조 증가, 반올림 규칙(half-up) 유지.
  5. **백업**: 원본 CSV 수정 전 `.bak` 백업 생성. `--no-backup` 플래그로 생략 가능.

- **실행 예시**:
  ```bash
  hub install pc-level-stat-generate
  hub run pc-level-stat-generate
  hub run pc-level-stat-generate --growth-rate 1.06 --base-hp 4500
  ```

- **의존성**: 없음
- **난이도**: 중
- **예상 구현 시간**: 2일

---

## Tier 2: 특수/유틸

---

### 10. weapon-option-calculate

- **목적**: 주무기/보조무기의 주옵션(base) + 강화구간별 증가량을 가중치 기반으로 산출한다. 클래스별 커브, 등급별 배수를 적용하여 `main_option_value_1`과 `main_option_enchant_1`을 생성/검증한다.
- **카테고리**: data-analysis
- **Agent**: claude, codex
- **입력 데이터**:

| 파일 | 경로 | 필요 컬럼 |
|---|---|---|
| `item_gear.csv` | `01_아이템 DataTable_GL/item_gear.csv` | `item_type`, `class`, `main_option_value_1\|int`, `main_option_enchant_1\|vector<uint>`, `main_option_enchant_section_1\|vector<uint>` |

- **파라미터** (가중치):
  - `--weapon-type <주무기|보조무기>` (필수)
  - `--c-base <int>` (기본값: 주무기=100, 보조무기=70) -- C등급 기본값
  - `--grade-coef <float>` (기본값: 2.5) -- 등급 점프 계수
  - `--tier-coef <float>` (기본값: 1.25) -- 티어 점프 계수
  - `--round-unit <int>` (기본값: 10) -- 반올림 단위
  - `--verify-only` (선택) -- 검증만 수행

- **출력**: 검증 리포트 또는 갱신된 `item_gear.csv` 해당 행

- **핵심 로직**:
  1. **등급 진행 순서**: C->B1->B2->B3->A1->A2->A3->S1->S2->S3->R1->R2->R3.
  2. **Lv1 base 산출**: `base[C] = C등급_기본값`. 등급 점프(C->B1, B3->A1, A3->S1, S3->R1): `base[cur] = ROUND_HALF_UP(base[prev] * grade_coef, round_unit)`. 티어 점프: `tier_coef` 적용.
  3. **구간 증가량**: `S1 = ROUND_HALF_UP(C기준_증가량 * C기준_등급배수[등급])`. C기준_등급배수: C=1.0, B1=1.0, ..., R3=5.0. `S2=S1*2, S3=S1*3, S4=S1*4, S5=S1*5`.
  4. **구간 시작레벨**: 항상 `1|6|11|16|21`. 최대 강화 25.
  5. **cap 값**: `value(cap) = base + steps*enchant` (cap별 고정 steps 적용).
  6. **검증**: S2=2*S1 등 비례 관계 유지 확인.

- **실행 예시**:
  ```bash
  hub install weapon-option-calculate
  hub run weapon-option-calculate --weapon-type 주무기 --verify-only
  hub run weapon-option-calculate --weapon-type 보조무기 --c-base 80
  ```

- **의존성**: 없음
- **난이도**: 중
- **예상 구현 시간**: 3일

---

### 11. global-translation-apply

- **목적**: 날짜별 글로벌 번역 엑셀(`StringTable_*_YYYYMMDD.xlsx`)을 `StringTable_*.txt`에 일괄 적용한다. 한국어 덮어쓰기 금지, JP/CS 컬럼 정규화, CSVReader 호환 따옴표 처리를 자동으로 수행한다.
- **카테고리**: productivity
- **Agent**: claude, codex
- **입력 데이터**:

| 파일 | 경로 | 비고 |
|---|---|---|
| `StringTable_*.txt` | `GlobalTrunk/Client/Assets/data/` | 원본 스트링 테이블 (UTF-16 LE BOM) |
| `StringTable_*_YYYYMMDD.xlsx` | 번역 소스 폴더 (날짜별) | 번역 엑셀 |

- **파라미터**:
  - `--string-root <경로>` (필수) -- StringTable 원본 경로
  - `--translation-dir <경로>` (필수) -- 번역 엑셀 폴더 경로
  - `--targets <파일목록>` (선택, 기본값: 전체 16개 파일)
  - `--dry-run` (선택) -- 변경 사항 미리보기만

- **출력**: 갱신된 `StringTable_*.txt` 파일들

- **핵심 로직**:
  1. **매핑**: `KeyString` 기준으로 엑셀과 TXT를 1:1 매칭.
  2. **언어 코드 매핑**: TXT 헤더의 `언어명(코드)` 괄호 안 코드 기준. `JA`->`JP`, `CHS`->`CS` 정규화.
  3. **빈 셀 보호**: 엑셀 셀 값이 비어 있으면 절대 덮어쓰지 않음.
  4. **JP 컬럼**: TXT에 없으면 헤더 끝에 `일본어(JP)` 추가. `???(JP)` -> `일본어(JP)` 정규화.
  5. **JP/CS 순서**: JP가 CS보다 항상 앞에 오도록 정렬.
  6. **StringTable_Logo 특수 처리**: `Chinese_Simplified` -> CS 코드 매핑.
  7. **따옴표 안전**: ASCII `"` -> 유니코드 따옴표 권장 경고.
  8. **인코딩 보존**: UTF-16 LE BOM 유지. Python에서 직접 파일 I/O (PowerShell 파이프 금지).
  9. **대상 파일**: StringTable_AresUI, CaptionCutscene, DialogCall, DialogCall_Contents, DialogTalk, Dungeon, ErrorCode, Global_Buff, Logo, Monster, Normal_Buff, NPC, Quest, Quest_Mission, ServerName, Tutorial.

- **실행 예시**:
  ```bash
  hub install global-translation-apply
  hub run global-translation-apply \
    --string-root "E:\(구)글로벌\client\Assets\data" \
    --translation-dir "C:\...\5_로컬라이제이션\20260330 글로벌 번역"
  hub run global-translation-apply --dry-run --targets StringTable_AresUI,StringTable_Skill
  ```

- **의존성**: 없음
- **난이도**: 중
- **예상 구현 시간**: 3일

---

### 12. stringtable-lint

- **목적**: StringTable TXT 파일의 품질을 검수한다. 중복 표현, 이중 마침표, `사용시` 앞 공백 누락, 연속 빈 줄, 따옴표 짝 오류, 인코딩 불일치 등을 자동 탐지한다.
- **카테고리**: testing
- **Agent**: claude, codex
- **입력 데이터**:

| 파일 | 경로 | 비고 |
|---|---|---|
| `StringTable_*.txt` | `GlobalTrunk/Client/Assets/data/` | 검수 대상 |

- **파라미터**:
  - `--string-root <경로>` (필수)
  - `--targets <파일목록>` (선택, 기본값: 전체)
  - `--fix` (선택) -- 자동 수정 적용
  - `--report <경로>` (선택) -- 리포트 출력 경로

- **출력**: 검수 리포트 (JSON/Markdown) 또는 자동 수정된 파일

- **핵심 로직**:
  1. **중복 표현 탐지**: `합니다.합니다`, `입니다.입니다` 등 문장 중복 패턴.
  2. **이중 마침표**: `[가-힣]` 뒤의 `..` 탐지.
  3. **공백 누락**: `(?<=[가-힣])사용시` -> `사용 시` 교정.
  4. **연속 빈 줄**: 라인 사이 빈 줄 탐지 및 제거.
  5. **따옴표 짝 검사**: ASCII `"` 개수 홀수/CSV 인용부호 오류 -> CSVReader `IndexOutOfRangeException` 예방.
  6. **인코딩 검증**: UTF-16 LE BOM 여부 확인, CP949 한글 `?` 치환 탐지.
  7. **2행 헤더 규칙**: 첫 행 `##StringTable`, 2행이 실제 헤더인지 검증.

- **실행 예시**:
  ```bash
  hub install stringtable-lint
  hub run stringtable-lint --string-root "E:\(구)글로벌\client\Assets\data"
  hub run stringtable-lint --targets StringTable_Skill --fix
  ```

- **의존성**: 없음
- **난이도**: 중
- **예상 구현 시간**: 2일

---

### 13. vehicle-encyclopedia

- **목적**: 탈것 백과사전 CSV(`백과사전_탈것.csv`)를 생성한다. 이동속도, 부스터 속도/시간, 옵션, 전투력을 정리한다.
- **카테고리**: data-analysis
- **Agent**: claude, codex
- **입력 데이터**:

| CSV 파일 | 경로 (Data/ 기준) | 필요 컬럼 |
|---|---|---|
| `item.csv` | `01_아이템 DataTable_GL/item.csv` | `item_type`, `#item_name\|string`, `item_grade` |
| `item_vehicle.csv` | `01_아이템 DataTable_GL/item_vehicle.csv` | `item_type`, `move_speed_max`, `boost_speed_max`, `boost_duration\|float`, `option_type_1`, `option_value_1` |
| `option_stat.csv` | `20_option_stat DataTable_GL/option_stat.csv` | `##OptionType #dispName\|string`, `##StatType combatpower\|int`, `statType\|vector<uint>` |

- **파라미터**:
  - `--data-root <경로>` (선택, 기본값: `/mnt/d/gb_trunk/client/Data/`)
  - `--output <경로>` (선택, 기본값: `98_MD작업/탈것/백과사전_탈것.csv`)

- **출력**: `백과사전_탈것.csv`
  - 컬럼: item_type, 명칭, 등급, 이동속도, 부스터 속도, 부스터시간, 획득 시 옵션ID, 획득 시 옵션명, 옵션값, 전투력

- **핵심 로직**:
  1. **대상**: `item_type`이 `30`으로 시작. 제외: `300020000` (길드 하우스 서핑보드).
  2. **등급 매핑**: 1=C, 2=B, 3=A, 4=S, 5=R.
  3. **전투력**: `option_type_1` / `option_value_1`만 사용. statType 매핑 우선, 없으면 optionType fallback. `floor(option_value_1 * combatpower / 100)`.
  4. **정렬**: R->S->A->B->C, 등급 내 item_type 오름차순.

- **실행 예시**:
  ```bash
  hub install vehicle-encyclopedia
  hub run vehicle-encyclopedia
  ```

- **의존성**: 없음
- **난이도**: 하
- **예상 구현 시간**: 1일

---

## 부록

### A. 공통 규칙

| 항목 | 규칙 |
|---|---|
| CSV 인코딩 | UTF-8-BOM + CRLF |
| StringTable 인코딩 | UTF-16 LE BOM (원본 유지) |
| 반올림 | ROUND_HALF_UP: `floor(x + 0.5)`, Python banker's rounding 사용 금지 |
| CSV 편집 | Edit 도구 사용 금지, 전체 Write로 처리 |
| 기존 행 보호 | CSV 데이터 작업 시 기존 행 삭제 금지 (append-only 원칙) |
| 옵션명 해석 우선순위 | `##OptionType #dispName` > `##StatType #dispName` |
| 전투력 계산 fallback | statType 매핑 없으면 optionType 기준으로 전투력 계산 |
| 데이터 기본 경로 | `/mnt/d/gb_trunk/client/Data/` |
| StringTable 기본 경로 | `/mnt/d/gb_trunk/client/Assets/data/` |

### B. 등급 매핑 표

| item_grade | 등급 |
|---:|---|
| 1 | C |
| 2 | B |
| 3 | A |
| 4 | S |
| 5 | R |

### C. 장비 item_type prefix 매핑

| prefix | 장비 종류 |
|---|---|
| 71 | 주무기 |
| 72 | 보조무기 |
| 73 | 알파성물 (렐릭) |
| 74 | 베타성물 (렐릭) |
| 75 | 감마성물 (렐릭) |
| 80 | 아머 (가슴) |
| 81 | 글러브 (장갑) |

### D. 강화단계 등급별 최대

| 등급군 | 최대 강화 |
|---|---:|
| C | 5 |
| B | 10 |
| A | 15 |
| S | 20 |
| R | 25 |

### E. 구현 우선순위 요약

| 순위 | 스킬 | 난이도 | 예상 일수 |
|---:|---|---|---:|
| 1 | recommended-combatpower | 하 | 1 |
| 2 | vehicle-encyclopedia | 하 | 1 |
| 3 | mainquest-md-refresh | 중 | 2 |
| 4 | gear-encyclopedia-generate | 중 | 3 |
| 5 | operator-stat-combatpower | 중 | 2 |
| 6 | pc-level-stat-generate | 중 | 2 |
| 7 | stringtable-lint | 중 | 2 |
| 8 | suit-stat-combatpower | 중 | 3 |
| 9 | weapon-option-calculate | 중 | 3 |
| 10 | global-translation-apply | 중 | 3 |
| 11 | suit-skill-encyclopedia | 상 | 4 |
| 12 | mob-level-stat-rebalance | 상 | 4 |
| 13 | suit-trait-encyclopedia | 상 | 5 |
| | **합계** | | **35일** |

> circuit-diagram-refresh는 Tier 3(보류)으로 이동. 위 합계에서 제외.

### F. 스킬 파일명 규칙

스킬 파일명 규칙: `{skill-name}.md` (예: `gear-encyclopedia-generate.md`). 초기 버전: 1.0.0

### G. 공통 유틸리티 모듈 (구현 시 추출 권장)

- **option_stat_parser**: `option_stat.csv` 파싱 + 옵션명 해석
- **combatpower_calculator**: 전투력 계산 (`옵션값 * combatpower / 100`, floor)
- **grade_mapper**: `item_grade` -> 등급 문자열 변환
- **csv_io**: CSV 읽기/쓰기 (UTF-8-BOM, CRLF)

---

## Tier 3: 보류

---

### circuit-diagram-refresh

> **보류 사유**: Unity prefab YAML 파싱이 Agent 단독 수행에 불충분. prefab 파싱 도구가 확보된 후 재검토.

- **목적**: `UI_CircuitDiagram_모듈별_회로도.xlsx`를 데이터 기반으로 재생성한다. 프리팹 좌표, 노드 연결, 옵션 수치, 전투력을 시트별로 정리한다.
- **카테고리**: data-analysis
- **Agent**: claude, codex
- **입력 데이터**:

| 파일 | 경로 | 필요 컬럼 |
|---|---|---|
| `UI_CircuitDiagram.prefab` | `GlobalTrunk/Client/Assets/Standard Assets/Game/NUI/AresAssetBundles/AresUI_Circuit/` | 모듈 좌표 기준 |
| `item_operator_node_link.csv` | `Data/item_operator_node_link.csv` | 노드 연결(connected), 모듈/슬롯/위치 |
| `item_operator_tuning.csv` | `Data/item_operator_tuning.csv` | `option_type_1~3`, `option_value_1~3`, `#note` |
| `option_stat.csv` | `20_option_stat DataTable_GL/option_stat.csv` | `#dispName\|string`, `combatpower\|int` |

- **파라미터**:
  - `--data-root <경로>` (선택, 기본값: `/mnt/d/gb_trunk/client/Data/`)
  - `--globaltrunk-root <경로>` (선택)
  - `--output <경로>` (선택)

- **출력**: `UI_CircuitDiagram_모듈별_회로도_vN.xlsx`
  - 시트: `노드_리스트` (노드별 옵션/전투력), `linked_node_전투력` (linked_node_id별 합산), `모듈_전투력` (module_idx별 합산)

- **핵심 로직**:
  1. **전투력 계산**: `#note`(node_note)가 `|`로 구분되면 항목별 분리. `option_stat`의 `#dispName`과 node_note 매칭. `전투력 = option_value * combatpower / 100`.
  2. **행 분리**: `linked_node_ids` 2개 이상이면 행 분리. `node_note`에 `|` 포함 시 행 분리.
  3. **정렬**: `linked_node_ids` 기준 텍스트 오름차순.
  4. **버전 관리**: 기존 파일이 있으면 `_v2`, `_v3` 자동 부여.

- **실행 예시**:
  ```bash
  hub install circuit-diagram-refresh
  hub run circuit-diagram-refresh
  ```

- **의존성**: 없음
- **난이도**: 중
- **예상 구현 시간**: 3일
