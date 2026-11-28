import { NextResponse } from 'next/server';
import { requireAuth } from '@/server/auth/context';
import { IMPORT_DEFINITIONS, type ImportKind } from '@/server/modules/import/definitions';
import { streamXlsxResponse } from '@/server/lib/excel';

export const dynamic = 'force-dynamic';

/** File mẫu: đúng tiêu đề cột (cột bắt buộc có dấu *) và một dòng ví dụ. */
export async function GET(_req: Request, { params }: { params: Promise<{ kind: string }> }) {
  await requireAuth();
  const { kind } = await params;
  if (!(kind in IMPORT_DEFINITIONS)) return NextResponse.json({ error: 'not_found' }, { status: 404 });
  const def = IMPORT_DEFINITIONS[kind as ImportKind];
  const columns = def.columns.map((c) => ({ header: c.required ? `${c.header} *` : c.header, key: c.key, width: c.width ?? 18 }));
  return streamXlsxResponse(`mau-nhap-${def.kind}.xlsx`, (wb) =>
    wb.sheet(def.label, columns, (sheet) => {
      sheet.add(Object.fromEntries(def.columns.map((c) => [c.key, c.example ?? ''])));
    }),
  );
}
