import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-middleware';
import { listEditLogs } from '@/lib/tables/override-store';

export const runtime = 'nodejs';

export async function GET(request: NextRequest) {
  const authUser = await requireAuth(request);
  if (authUser instanceof NextResponse) {
    return authUser;
  }

  const pageId = request.nextUrl.searchParams.get('pageId') || undefined;
  const tableId = request.nextUrl.searchParams.get('tableId') || undefined;
  const limit = Number(request.nextUrl.searchParams.get('limit') ?? '100');
  const logs = await listEditLogs({ pageId, tableId, limit });

  return NextResponse.json({ ok: true, data: logs });
}
