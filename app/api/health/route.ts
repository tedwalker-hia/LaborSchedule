import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import logger from '@/lib/logger';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ status: 'healthy', database: 'connected' });
  } catch (error) {
    logger.error({ err: error }, 'Health check failed');
    return NextResponse.json({ status: 'unhealthy', database: 'disconnected' }, { status: 503 });
  }
}
