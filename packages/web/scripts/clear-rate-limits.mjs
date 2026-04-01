import { config } from 'dotenv';
import { resolve } from 'node:path';
import { PrismaClient } from '@prisma/client';

config({ path: resolve(import.meta.dirname, '..', '.env.local') });

const prisma = new PrismaClient();
const result = await prisma.rateLimit.deleteMany({});
console.log('Cleared rate limit records:', result.count);
await prisma.$disconnect();
