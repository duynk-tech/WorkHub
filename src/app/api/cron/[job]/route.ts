import { NextResponse, type NextRequest } from 'next/server';
import { JOBS, type JobName } from '@/server/jobs';
import { safeEqual } from '@/lib/crypto';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Điểm chạy job theo lịch từ bên ngoài (cron hệ thống, Vercel Cron, n8n…).
 * Bảo vệ bằng CRON_SECRET để tránh bị gọi tùy tiện.
 */
export async function GET(req: NextRequest, { params }: { params: Promise<{ job: string }> }) {
  const secret = process.env.CRON_SECRET;
  if (!secret || secret.trim().length < 8) {
    return NextResponse.json(
      { ok: false, error: 'CRON_SECRET chưa được cấu hình an toàn trên máy chủ' },
      { status: 500 }
    );
  }

  const provided = req.headers.get('authorization')?.replace(/^Bearer\s+/i, '')
    ?? req.nextUrl.searchParams.get('secret') ?? '';
  if (!provided || !safeEqual(provided.trim(), secret.trim())) {
    return NextResponse.json({ ok: false, error: 'unauthorized' }, { status: 401 });
  }

  const { job } = await params;
  const runner = JOBS[job as JobName];
  if (!runner) {
    return NextResponse.json({ ok: false, error: 'unknown_job', available: Object.keys(JOBS) }, { status: 404 });
  }

  try {
    const started = Date.now();
    const result = await runner();
    return NextResponse.json({ ok: true, ...result, durationMs: Date.now() - started });
  } catch (e) {
    return NextResponse.json(
      { ok: false, job, error: e instanceof Error ? e.message : 'unknown_error' },
      { status: 500 },
    );
  }
}
