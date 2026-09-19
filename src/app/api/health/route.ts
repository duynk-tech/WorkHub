import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    await prisma.$queryRaw`SELECT 1`;
    return NextResponse.json({ ok: true, database: 'up', time: new Date().toISOString() });
  } catch (e) {
    return NextResponse.json(
      { ok: false, database: 'down', error: e instanceof Error ? e.message : 'unknown' },
      { status: 503 },
    );
  }
}
