import { NextResponse, type NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { revalidatePath } from 'next/cache';
import { requireAuth, can } from '@/server/auth/context';
import { writeAudit } from '@/server/lib/audit';
import { IMPORT_DEFINITIONS, type ImportKind } from '@/server/modules/import/definitions';
import { parseImportRows } from '@/server/modules/import/parse';
import { commitImport, type DuplicateMode } from '@/server/modules/import/commit';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PERMISSION: Record<ImportKind, string> = {
  customers: 'FEATURE_CUSTOMER_MANAGE',
  'spare-parts': 'FEATURE_SPARE_PARTS_MANAGE',
};
const MAX_BYTES = 5 * 1024 * 1024;
const MAX_ROWS = 5000;

/**
 * Nhập Excel hai bước trên cùng một endpoint:
 *  - mode=preview: đọc và kiểm tra, KHÔNG ghi DB — trả số dòng hợp lệ, lỗi kèm số dòng.
 *  - mode=commit: đọc lại chính file đó và ghi (khách hàng / phụ tùng).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ kind: string }> }) {
  const ctx = await requireAuth();
  const { kind } = await params;
  if (!(kind in IMPORT_DEFINITIONS)) return NextResponse.json({ ok: false, message: 'Loại dữ liệu không hỗ trợ' }, { status: 404 });
  const k = kind as ImportKind;
  if (!can(ctx, PERMISSION[k])) return NextResponse.json({ ok: false, message: 'Bạn không có quyền nhập dữ liệu này' }, { status: 403 });

  const form = await req.formData();
  const file = form.get('file');
  const mode = form.get('mode') === 'commit' ? 'commit' : 'preview';
  const onDuplicate: DuplicateMode = form.get('onDuplicate') === 'skip' ? 'skip' : 'update';
  if (!(file instanceof File)) return NextResponse.json({ ok: false, message: 'Chưa chọn file' }, { status: 400 });
  if (file.size > MAX_BYTES) return NextResponse.json({ ok: false, message: 'File quá lớn (tối đa 5MB)' }, { status: 400 });
  if (!/\.xlsx$/i.test(file.name)) return NextResponse.json({ ok: false, message: 'Chỉ nhận file .xlsx (Excel 2007 trở lên)' }, { status: 400 });

  const wb = new ExcelJS.Workbook();
  try {
    await wb.xlsx.load(Buffer.from(await file.arrayBuffer()) as unknown as ArrayBuffer);
  } catch {
    return NextResponse.json({ ok: false, message: 'Không đọc được file — hãy lưu lại bằng Excel dạng .xlsx' }, { status: 400 });
  }
  const ws = wb.worksheets[0];
  if (!ws) return NextResponse.json({ ok: false, message: 'File không có sheet nào' }, { status: 400 });

  const rows: unknown[][] = [];
  ws.eachRow({ includeEmpty: false }, (row, rowNumber) => {
    rows[rowNumber - 1] = (row.values as unknown[]).slice(1);
  });
  if (rows.length - 1 > MAX_ROWS) return NextResponse.json({ ok: false, message: `Tối đa ${MAX_ROWS} dòng mỗi lần nhập` }, { status: 400 });

  const def = IMPORT_DEFINITIONS[k];
  const parsed = parseImportRows<unknown>(Array.from(rows, (r) => r ?? []), def as never);
  if (parsed.missingColumns.length) {
    return NextResponse.json({ ok: false, message: `Thiếu cột bắt buộc: ${parsed.missingColumns.join(', ')}. Hãy dùng file mẫu.` }, { status: 400 });
  }

  if (mode === 'preview') {
    return NextResponse.json({
      ok: true,
      totalRows: parsed.totalRows,
      validCount: parsed.valid.length,
      errors: parsed.errors.slice(0, 100),
      errorCount: parsed.errors.length,
      sample: parsed.valid.slice(0, 8),
    });
  }

  const result = await commitImport(k, parsed.valid, onDuplicate);
  await writeAudit({
    actorId: ctx.userId,
    entityType: k === 'customers' ? 'Customer' : 'InventoryItem',
    entityId: null,
    action: 'IMPORT_EXCEL',
    diff: { file: file.name, created: result.created, updated: result.updated, skipped: result.skipped, failed: result.failed.length, invalid: parsed.errors.length },
  });
  revalidatePath(k === 'customers' ? '/customers' : '/spare-parts');
  return NextResponse.json({ ok: true, ...result, invalid: parsed.errors.length });
}
