import { NextResponse, type NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { requireAuth, can } from '@/server/auth/context';

export const dynamic = 'force-dynamic';

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

/** GET: Quét và liệt kê danh sách tệp trong thư viện media */
export async function GET(req: NextRequest) {
  try {
    await requireAuth();

    await fs.mkdir(UPLOADS_DIR, { recursive: true });
    const dirEntries = await fs.readdir(UPLOADS_DIR, { withFileTypes: true });

    const files = await Promise.all(
      dirEntries
        .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
        .map(async (entry) => {
          const filePath = path.join(UPLOADS_DIR, entry.name);
          const stat = await fs.stat(filePath);
          const ext = path.extname(entry.name).toLowerCase();

          return {
            name: entry.name,
            url: `/uploads/${entry.name}`,
            size: stat.size,
            createdAt: stat.birthtime || stat.mtime,
            extension: ext,
          };
        })
    );

    // Sắp xếp mới nhất lên đầu
    files.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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

    // Bảo vệ Path Traversal: chỉ lấy basename
    const safeFilename = path.basename(filename);
    const targetPath = path.resolve(UPLOADS_DIR, safeFilename);

    // Đảm bảo đường dẫn nằm trong UPLOADS_DIR
    if (!targetPath.startsWith(path.resolve(UPLOADS_DIR))) {
      return NextResponse.json({ ok: false, error: 'Đường dẫn tệp không hợp lệ' }, { status: 400 });
    }

    try {
      await fs.unlink(targetPath);
      return NextResponse.json({ ok: true, message: `Đã xóa tệp "${safeFilename}" thành công` });
    } catch (err: any) {
      if (err.code === 'ENOENT') {
        return NextResponse.json({ ok: false, error: 'Tệp không tồn tại hoặc đã bị xóa' }, { status: 404 });
      }
      throw err;
    }
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Xóa tệp thất bại';
    const status = message.includes('chưa đăng nhập') ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
