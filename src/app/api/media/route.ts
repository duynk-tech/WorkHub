import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, can } from '@/server/auth/context';
import { deleteUploadedFile, listUploadedFiles } from '@/lib/storage';

export const dynamic = 'force-dynamic';

/** GET: Quét và liệt kê danh sách tệp trong thư viện media */
export async function GET(_req: NextRequest) {
  try {
    await requireAuth();

    const files = await listUploadedFiles();
    const totalSize = files.reduce((acc, f) => acc + f.size, 0);

    return NextResponse.json({
      ok: true,
      files,
      totalFiles: files.length,
      totalSize,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Không thể đọc danh sách media';
    const status = message.includes('chưa đăng nhập') ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}

/** DELETE: Xóa an toàn tệp khỏi thư viện media (chống Path Traversal) */
export async function DELETE(req: NextRequest) {
  try {
    const ctx = await requireAuth();
    const canDelete =
      ctx.isAdmin ||
      can(ctx, 'FEATURE_SETTING_GENERAL') ||
      can(ctx, 'FEATURE_EQUIPMENT_MANAGE') ||
      can(ctx, 'FEATURE_SPARE_PARTS_MANAGE');

    if (!canDelete) {
      return NextResponse.json(
        { ok: false, error: 'Bạn không có quyền xóa tệp trong thư viện media' },
        { status: 403 }
      );
    }

    const { searchParams } = new URL(req.url);
    let filename = searchParams.get('filename');

    if (!filename) {
      try {
        const body = await req.json();
        filename = body.filename;
      } catch {
        // query param was empty and body not json
      }
    }

    if (!filename || typeof filename !== 'string') {
      return NextResponse.json({ ok: false, error: 'Thiếu tên tệp cần xóa' }, { status: 400 });
    }

    try {
      const result = await deleteUploadedFile(filename);
      if (result === 'not_found') {
        return NextResponse.json({ ok: false, error: 'Tệp không tồn tại hoặc đã bị xóa' }, { status: 404 });
      }
      return NextResponse.json({ ok: true, message: `Đã xóa tệp "${filename}" thành công` });
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Xóa tệp thất bại';
      const status = message.includes('không hợp lệ') ? 400 : 500;
      return NextResponse.json({ ok: false, error: message }, { status });
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Xóa tệp thất bại';
    const status = message.includes('chưa đăng nhập') ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
