import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

config({ path: resolve(__dirname, '..', '.env.local') });

const prisma = new PrismaClient();

async function main() {
  // 1. admin user upsert
  const admin = await prisma.user.upsert({
    where: { githubId: 'admin' },
    update: {},
    create: {
      githubId: 'admin',
      username: 'aresdev-unit',
      email: 'aorying@seconddive.co.kr',
      role: 'ADMIN',
    },
  });

  console.log(`Admin user: ${admin.username} (${admin.id})`);

  // 2. All 13 skills from SKILLS-SPEC.md
  const skills = [
    // --- Tier 0 ---
    {
      name: 'gear-encyclopedia-generate',
      description: '장비 7종(주무기/보조무기/아머/글러브/알파/베타/감마성물) 백과사전 CSV를 --gear-type 파라미터로 자동 생성합니다',
      category: 'data-analysis',
      agentTypes: ['claude', 'codex'],
      keywords: ['gear', 'encyclopedia', 'csv', 'item', 'weapon', 'armor', 'relic'],
      version: '1.0.0',
    },
    {
      name: 'mainquest-md-refresh',
      description: '메인퀘스트 CSV→TSV→MD 갱신 파이프라인을 자동으로 실행합니다',
      category: 'data-analysis',
      agentTypes: ['claude'],
      keywords: ['mainquest', 'pipeline', 'csv', 'tsv', 'md'],
      version: '1.0.0',
    },
    {
      name: 'recommended-combatpower',
      description: '레벨별 권장전투력 CSV를 K, BOSS_F, MAINQUEST_BOSS_F 파라미터 기반으로 재생성합니다',
      category: 'data-analysis',
      agentTypes: ['claude', 'codex'],
      keywords: ['combatpower', 'balance', 'mob', 'dungeon'],
      version: '1.0.0',
    },
    // --- Tier 1 ---
    {
      name: 'suit-stat-combatpower',
      description: '슈트 레벨별 메인/서브 옵션 스탯 및 전투력을 산출하고, 역반영(CSV 갱신)도 지원합니다',
      category: 'data-analysis',
      agentTypes: ['claude', 'codex'],
      keywords: ['suit', 'stat', 'combatpower', 'option', 'reverse'],
      version: '1.0.0',
    },
    {
      name: 'operator-stat-combatpower',
      description: '오퍼레이터 레벨별 스탯 및 전투력을 산출합니다. 슈트 스킬과 유사한 구조입니다',
      category: 'data-analysis',
      agentTypes: ['claude', 'codex'],
      keywords: ['operator', 'stat', 'combatpower'],
      version: '1.0.0',
    },
    {
      name: 'suit-trait-encyclopedia',
      description: '슈트 특성(패시브) 데이터를 추출하고 스트링 테이블 조건/효과 문구를 자동 조합합니다',
      category: 'data-analysis',
      agentTypes: ['claude'],
      keywords: ['suit', 'trait', 'passive', 'rune', 'string-generation'],
      version: '1.0.0',
    },
    {
      name: 'suit-skill-encyclopedia',
      description: '슈트별 스킬(주무기/보조/SP/버스트/체인지) 정보를 추출하여 백과사전 CSV를 생성합니다',
      category: 'data-analysis',
      agentTypes: ['claude'],
      keywords: ['suit', 'skill', 'active', 'buff', 'prefab'],
      version: '1.0.0',
    },
    {
      name: 'mob-level-stat-rebalance',
      description: '몹 레벨별 스탯(HP/ATK/DEF 등)을 가중치 파라미터 기반으로 전체 재계산합니다',
      category: 'data-analysis',
      agentTypes: ['claude', 'codex'],
      keywords: ['mob', 'monster', 'level', 'stat', 'balance', 'rebalance'],
      version: '1.0.0',
    },
    {
      name: 'pc-level-stat-generate',
      description: 'PC 레벨별 EXP/HP/ATK/DEF 곡선을 성장배율 파라미터 기반으로 재생성합니다',
      category: 'data-analysis',
      agentTypes: ['claude', 'codex'],
      keywords: ['pc', 'player', 'level', 'exp', 'stat', 'curve'],
      version: '1.0.0',
    },
    // --- Tier 2 ---
    {
      name: 'weapon-option-calculate',
      description: '주무기/보조무기 주옵션 base 값과 강화 구간별 증가량을 등급/커브별로 산출합니다',
      category: 'data-analysis',
      agentTypes: ['claude', 'codex'],
      keywords: ['weapon', 'option', 'enchant', 'grade', 'curve'],
      version: '1.0.0',
    },
    {
      name: 'global-translation-apply',
      description: '번역 엑셀(xlsx)을 StringTable_*.txt에 KeyString 기준으로 일괄 매핑 적용합니다',
      category: 'productivity',
      agentTypes: ['claude'],
      keywords: ['translation', 'localization', 'stringtable', 'xlsx', 'jp', 'cs'],
      version: '1.0.0',
    },
    {
      name: 'stringtable-lint',
      description: 'StringTable 한국어 열의 품질을 검수합니다 (중복표현, 이중마침표, 공백누락, 인코딩 등)',
      category: 'testing',
      agentTypes: ['claude'],
      keywords: ['stringtable', 'lint', 'quality', 'spacing', 'encoding'],
      version: '1.0.0',
    },
    {
      name: 'vehicle-encyclopedia',
      description: '탈것 데이터를 item_vehicle.csv 기반으로 백과사전 CSV를 생성합니다',
      category: 'data-analysis',
      agentTypes: ['claude'],
      keywords: ['vehicle', 'mount', 'encyclopedia'],
      version: '1.0.0',
    },
  ];

  let created = 0;
  let skipped = 0;

  for (const skill of skills) {
    const existing = await prisma.skill.findFirst({
      where: { name: skill.name, deprecated: false },
    });

    if (existing) {
      console.log(`  skip: ${existing.name}`);
      skipped++;
      continue;
    }

    const result = await prisma.skill.create({
      data: {
        name: skill.name,
        description: skill.description,
        category: skill.category,
        latestVersion: skill.version,
        agentTypes: skill.agentTypes,
        keywords: skill.keywords,
        license: 'MIT',
        authorId: admin.id,
        versions: {
          create: {
            version: skill.version,
            repoPath: `skills/${skill.name}/${skill.name}.md`,
            fileHash: 'sha256:placeholder',
          },
        },
      },
    });
    console.log(`  add: ${result.name}`);
    created++;
  }

  console.log(`\nSeed complete: ${created} created, ${skipped} skipped (total ${skills.length} skills)`);
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
