import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, can } from '@/server/auth/context';
import { buildReportSheets } from '@/server/modules/report/excel-sheets';
import { getAppBranding } from '@/server/modules/settings/branding';
import { streamXlsxResponse } from '@/server/lib/excel';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/**
 * Xuất báo cáo ra Excel. Dữ liệu luôn đi qua phạm vi dữ liệu của người đăng nhập.
 * Lấy đủ dữ liệu trước rồi mới ghi luồng: lỗi truy vấn vẫn trả mã lỗi HTTP đúng.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_REPORT_EXPORT')) {
    return NextResponse.json({ error: 'Bạn không có quyền xuất báo cáo' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const type = sp.get('type') ?? 'attendance';
  const month = /^\d{4}-\d{2}$/.test(sp.get('month') ?? '') ? sp.get('month')! : new Date().toISOString().slice(0, 7);
  const from = sp.get('from') ?? `${new Date().getFullYear()}-01-01`;
  const to = sp.get('to') ?? new Date().toISOString().slice(0, 10);
  const yearRaw = Number(sp.get('year') ?? new Date().getFullYear());
  const year = Number.isInteger(yearRaw) && yearRaw > 2000 && yearRaw < 2100 ? yearRaw : new Date().getFullYear();

  const built = await buildReportSheets(ctx, type, { month, from, to, year });
  if (!built) return NextResponse.json({ error: 'Loại báo cáo không hợp lệ' }, { status: 400 });
  const { fileName, sheets } = built;

  const branding = await getAppBranding();
  return streamXlsxResponse(
    fileName,
    async (wb) => {
      for (const s of sheets) {
        await wb.sheet(s.name, s.columns, (sheet) => {
          for (const row of s.rows) sheet.add(row);
        });
      }
    },
    { creator: branding.name },
  );
}
