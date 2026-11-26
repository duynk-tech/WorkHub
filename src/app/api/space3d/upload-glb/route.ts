import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import { can, requireAuth } from '@/server/auth/context';
import { uploadFile } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const MAX_GLB_SIZE = 4 * 1024 * 1024; // 4MB (dưới trần Vercel 4.5MB)

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth();
    const allowed =
      ctx.isAdmin ||
      can(ctx, 'FEATURE_EQUIPMENT_MANAGE') ||
      can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') ||
      can(ctx, 'FEATURE_SETTING_GENERAL');
    if (!allowed) {
      return NextResponse.json({ error: 'Bạn không có quyền tải tệp mô hình 3D' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Không tìm thấy tệp .glb' }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_GLB_SIZE) {
      return NextResponse.json({ error: 'Tệp .glb phải dưới 4MB' }, { status: 400 });
    }
    if (!file.name.toLowerCase().endsWith('.glb')) {
      return NextResponse.json({ error: 'Chỉ hỗ trợ định dạng chuẩn .glb (Binary glTF)' }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    // Kiểm tra magic bytes "glTF" (0x67 0x6C 0x54 0x46)
    if (
      buffer.length < 12 ||
      buffer[0] !== 0x67 ||
      buffer[1] !== 0x6c ||
      buffer[2] !== 0x54 ||
      buffer[3] !== 0x46
    ) {
      return NextResponse.json({ error: 'Tệp .glb không đúng định dạng glTF nhị phân' }, { status: 400 });
    }

    const safeBase = file.name
      .replace(/\.glb$/i, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .slice(0, 32) || 'model';
    const objectPath = `models-3d/${safeBase}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.glb`;

    const uploaded = await uploadFile({
      objectPath,
      buffer,
      contentType: 'model/gltf-binary',
    });

    return NextResponse.json({ ok: true, url: uploaded.url });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Tải lên mô hình 3D thất bại';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
