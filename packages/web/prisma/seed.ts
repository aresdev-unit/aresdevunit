import { config } from 'dotenv';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';
import { PrismaClient } from '@prisma/client';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Load .env.local (Vercel env pull output)
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

  // 2. sample skills
  const skills = [
    {
      name: 'gear-encyclopedia-generate',
      description:
        '장비 7종(주무기/보조무기/아머/글러브/알파/베타/감마성물) 백과사전 CSV를 자동 생성합니다',
      category: 'data-analysis',
      agentTypes: ['claude', 'codex'],
      keywords: ['gear', 'encyclopedia', 'csv', 'item'],
      version: '1.0.0',
    },
    {
      name: 'recommended-combatpower',
      description:
        '레벨별 권장전투력 CSV를 K, BOSS_F, MAINQUEST_BOSS_F 파라미터 기반으로 재생성합니다',
      category: 'data-analysis',
      agentTypes: ['claude', 'codex'],
      keywords: ['combatpower', 'balance', 'mob'],
      version: '1.0.0',
    },
    {
      name: 'mainquest-md-refresh',
      description:
        '메인퀘스트 CSV→TSV→MD 갱신 파이프라인을 자동으로 실행합니다',
      category: 'data-analysis',
      agentTypes: ['claude'],
      keywords: ['mainquest', 'pipeline', 'csv', 'tsv'],
      version: '1.0.0',
    },
  ];

  for (const skill of skills) {
    // name is not @unique in Prisma schema (partial unique index via raw SQL),
    // so we use findFirst + conditional create instead of upsert.
    const existing = await prisma.skill.findFirst({
      where: { name: skill.name, deprecated: false },
    });

    if (existing) {
      console.log(`  Skill: ${existing.name} (${existing.id}) — already exists, skipped`);
      continue;
    }

    const created = await prisma.skill.create({
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
    console.log(`  Skill: ${created.name} (${created.id})`);
  }

  console.log('Seed complete: 1 admin user + 3 skills');
}

main()
  .catch(console.error)
  .finally(() => prisma.$disconnect());
