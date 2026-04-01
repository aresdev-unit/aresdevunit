import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { withCors, handleCorsPreflightResponse } from '@/lib/api-middleware';

export async function GET() {
  let dbStatus: 'connected' | 'disconnected' = 'disconnected';

  try {
    await prisma.$queryRaw`SELECT 1`;
    dbStatus = 'connected';
  } catch {
    dbStatus = 'disconnected';
  }

  const status = dbStatus === 'connected' ? 'ok' : 'error';

  const response = NextResponse.json(
    {
      status,
      db: dbStatus,
      version: '1.0.0',
      timestamp: new Date().toISOString(),
    },
    { status: status === 'ok' ? 200 : 503 }
  );

  return withCors(response);
}

export async function OPTIONS() {
  return handleCorsPreflightResponse();
}
