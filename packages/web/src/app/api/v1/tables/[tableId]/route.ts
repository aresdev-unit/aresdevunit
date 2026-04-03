import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/api-middleware';
import { getTableById } from '@/lib/tables/data';

export const runtime = 'nodejs';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ tableId: string }> }
) {
  const authUser = await requireAuth(request);
  if (authUser instanceof NextResponse) {
    return authUser;
  }

  const { tableId } = await params;

  if (!/^[A-Za-z0-9_]+$/.test(tableId)) {
    return NextResponse.json({ ok: false, error: 'Invalid tableId' }, { status: 400 });
  }

  const table = await getTableById(tableId);
  if (!table) {
    return NextResponse.json({ ok: false, error: 'Table not found' }, { status: 404 });
  }

  return NextResponse.json(
    {
      ok: true,
      data: {
        table,
        relations: {
          outbound: table.outboundRelations,
          inbound: table.inboundRelations,
        },
      },
    },
    {
      headers: {
        'Cache-Control': 'private, max-age=10, stale-while-revalidate=60',
      },
    }
  );
}
