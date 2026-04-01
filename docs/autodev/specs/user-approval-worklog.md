# Spec: User Approval + Worklog

## 1. Prisma Schema Changes

### 1-1. New enum
```prisma
enum UserStatus {
  PENDING
  APPROVED
  REJECTED
}
```

### 1-2. User model additions
```prisma
model User {
  // ... existing fields ...
  status    UserStatus @default(PENDING) @map("status")
  worklogs  Worklog[]
}
```

### 1-3. Worklog model
```prisma
model Worklog {
  id         String   @id @default(uuid())
  summary    String   @db.Text
  unfinished String?  @db.Text
  metadata   Json?
  date       DateTime @db.Date
  createdAt  DateTime @default(now()) @map("created_at")
  updatedAt  DateTime @updatedAt @map("updated_at")

  userId String? @map("user_id")
  user   User?   @relation(fields: [userId], references: [id], onDelete: SetNull)

  @@unique([userId, date])
  @@index([userId, date(sort: Desc)])
  @@map("worklogs")
}
```

### 1-4. Migration SQL sequence
Prisma generates migration with this order:
1. `CREATE TYPE "UserStatus" AS ENUM ('PENDING', 'APPROVED', 'REJECTED');`
2. `ALTER TABLE "users" ADD COLUMN "status" "UserStatus" NOT NULL DEFAULT 'PENDING';`
3. Manual backfill appended to migration SQL:
```sql
-- Backfill existing users as APPROVED (runs after column added with PENDING default)
UPDATE "users" SET "status" = 'APPROVED';
```

---

## 2. api-middleware.ts — requireApproved()

```typescript
export async function requireApproved(
  request: NextRequest
): Promise<AuthUser | NextResponse> {
  const authResult = await requireAuth(request);
  if (authResult instanceof NextResponse) return authResult;
  const user = authResult as AuthUser;

  // DB lookup — status only
  const dbUser = await prisma.user.findUnique({
    where: { id: user.id },
    select: { status: true },
  });

  if (!dbUser || dbUser.status !== 'APPROVED') {
    return errorResponse('ACCOUNT_PENDING', 'Account not yet approved. Contact admin.', 403);
  }

  return user;
}
```

---

## 3. auth.ts changes

### 3-1. jwt callback — query status every time
```typescript
async jwt({ token, account, profile }) {
  if (account?.provider === 'github' && profile) {
    const githubId = String(account.providerAccountId);
    const dbUser = await prisma.user.findUnique({ where: { githubId } });
    if (dbUser) {
      token.userId = dbUser.id;
      token.username = dbUser.username;
      token.role = dbUser.role;
      token.status = dbUser.status;
    }
  } else if (token.userId) {
    // Subsequent calls — refresh status from DB
    const dbUser = await prisma.user.findUnique({
      where: { id: token.userId as string },
      select: { status: true, role: true, username: true },
    });
    if (dbUser) {
      token.status = dbUser.status;
      token.role = dbUser.role;
      token.username = dbUser.username;
    }
  }
  return token;
},
```

### 3-2. session callback — include status
```typescript
async session({ session, token }) {
  if (token) {
    session.user = {
      ...session.user,
      id: token.userId as string,
      username: token.username as string,
      role: token.role as string,
      status: token.status as string,
    };
  }
  return session;
},
```

### 3-3. Type augmentation
```typescript
// next-auth Session
interface Session {
  user: {
    id: string;
    username: string;
    role: string;
    status: string;
    name?: string | null;
    email?: string | null;
    image?: string | null;
  };
}

// next-auth/jwt JWT
interface JWT {
  userId?: string;
  username?: string;
  role?: string;
  status?: string;
}
```

---

## 4. API Routes Changes

### 4-1. Routes that change `requireAuth` → `requireApproved`
Each route: replace `requireAuth(request)` call with `requireApproved(request)`. No other changes needed since return type is identical (`AuthUser | NextResponse`).

**Write/auth-only operations (requireApproved):**
- `POST /api/v1/skills` (route.ts) — 배포
- `POST /api/v1/skills/[name]/versions` (route.ts) — 버전 추가
- `GET  /api/v1/skills/[name]/download` (route.ts) — 다운로드
- `POST /api/v1/skills/[name]/like` (route.ts) — 좋아요
- `GET  /api/v1/dashboard/stats` (route.ts)
- `GET  /api/v1/dashboard/feed` (route.ts)

**Public read routes (변경 없음 — 익명 접근 유지):**
- `GET  /api/v1/skills` — 기존 `getAuthUser` 유지 (랜딩 페이지/익명 브라우징)
- `GET  /api/v1/skills/[name]` — 기존 유지 (Skill 상세 페이지 공개)

### 4-2. Refresh token route — add status check
In `POST /api/v1/auth/refresh`:
After finding user by refresh token, check `user.status`:
```typescript
if (user.status === 'REJECTED') {
  // Revoke this refresh token
  await prisma.refreshToken.update({ where: { id: tokenRecord.id }, data: { revokedAt: new Date() } });
  return errorResponse('ACCOUNT_REJECTED', 'Account has been rejected', 403);
}
```

### 4-3. PATCH /api/v1/admin/users/[id] — add status field
```typescript
const patchUserSchema = z.object({
  role: z.enum(['USER', 'ADMIN']).optional(),
  status: z.enum(['PENDING', 'APPROVED', 'REJECTED']).optional(),
}).refine(data => data.role !== undefined || data.status !== undefined, {
  message: 'At least one of role or status is required',
});
```

Validation:
- Prevent self-change (existing)
- Block `role: ADMIN` + `status: REJECTED` combo
- On `status: REJECTED` → revoke all refresh tokens for that user:
```typescript
if (parsed.data.status === 'REJECTED') {
  await prisma.refreshToken.updateMany({
    where: { userId: id, revokedAt: null },
    data: { revokedAt: new Date() },
  });
}
```

### 4-4. GET /api/v1/admin/users — add status to response
Add `status: user.status` to the serialized user object.

---

## 5. New API Routes

### 5-1. POST /api/v1/worklog
```
Auth: requireApproved
Body: { summary: string, unfinished?: string, metadata?: object }
Response 200: { id, date, summary, unfinished, metadata, created_at, updated_at }
```
Logic:
- date = dayjs KST today
- prisma.worklog.upsert({ where: { userId_date: { userId, date } }, create: {...}, update: {...} })

### 5-2. GET /api/v1/worklog
```
Auth: requireApproved
Query: ?limit=3 (max 100)
Response 200: { data: Worklog[], pagination: { limit, total } }
```
Logic:
- prisma.worklog.findMany({ where: { userId }, orderBy: { date: 'desc' }, take: limit })

### 5-3. GET /api/v1/admin/worklog
```
Auth: requireAuth + ADMIN check
Query: ?username=xxx&limit=20&cursor=<uuid> (max 100)
Response 200: { data: WorklogWithUser[], pagination: { limit, next_cursor } }
```
Logic:
- If username filter: find user first, then filter worklogs
- Cursor: `{ where: { createdAt: { lt: cursorDate } }, orderBy: [{ createdAt: 'desc' }, { id: 'desc' }] }` (createdAt 기반, UUID는 비순차적이므로 id로 커서 불가)
- Include user.username, user.avatarUrl

---

## 6. Web Pages

### 6-1. /pending/page.tsx
Static page. "계정 승인 대기 중입니다. 관리자에게 문의하세요."
Logout button.

### 6-2. nav.tsx changes
- Check `session.user.status`
- If `PENDING` or `REJECTED`: only show Hub logo + 로그아웃
- If `APPROVED`: show all menus (existing behavior)

### 6-3. Layout/redirect logic
- In client pages (dashboard, settings, admin): check `session.user.status !== 'APPROVED'` → redirect to `/pending`
- In server pages (skills, skills/[name], author/[username]): these go through API which handles 403

### 6-4. Admin page — approval tab
New tab "승인 대기" showing PENDING users with approve/reject buttons.
Existing users tab shows status badge.
New tab "업무 기록" showing worklog history with username filter.

---

## 7. CLI Changes

### 7-1. api-client.ts — AccountPendingError
```typescript
export class AccountPendingError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'AccountPendingError';
  }
}
```

In `request()` method, after checking `res.status === 403`:
```typescript
if (res.status === 403) {
  const apiError = body as { error?: { code: string; message: string } };
  if (apiError.error?.code === 'ACCOUNT_PENDING' || apiError.error?.code === 'ACCOUNT_REJECTED') {
    throw new AccountPendingError(apiError.error.message);
  }
  throw new AuthError(apiError.error?.message || 'Forbidden');
}
```

### 7-2. work.ts command
```typescript
const workCommand = new Command('work')
  .description('Manage daily work logs');

workCommand
  .command('start')
  .description('Fetch previous work context')
  .option('--limit <n>', 'Number of recent logs to fetch', '3')
  .action(async (opts) => { ... });

workCommand
  .command('end')
  .description('Save today\'s work summary')
  .requiredOption('--summary <text>', 'Work summary (compacted by agent)')
  .option('--unfinished <text>', 'Unfinished/carry-over items')
  .action(async (opts) => { ... });
```

### 7-3. index.ts — register
```typescript
import { workCommand } from './commands/work.js';
program.addCommand(workCommand);
```

---

## 8. Dependencies

- `dayjs` + `dayjs/plugin/timezone` + `dayjs/plugin/utc` — for KST date in worklog API
- Add to `packages/web/package.json`
