import { NextResponse } from 'next/server';
import { getAuthContext } from '@/server/auth/context';
import { loadShellLive } from '@/server/modules/notify/live';

export const dynamic = 'force-dynamic';

/** Khung app gọi định kỳ (khi tab đang mở) để chuông và badge tự cập nhật, không cần F5. */
export async function GET() {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ error: 'unauthorized' }, { status: 401 });
  const live = await loadShellLive(ctx);
  return NextResponse.json(live, { headers: { 'Cache-Control': 'no-store' } });
}
