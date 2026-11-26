import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import { requireAuth, can } from '@/server/auth/context';
import { uploadFile } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB (dưới trần 4.5MB của Vercel Serverless)

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/svg+xml': '.svg',
  'image/gif': '.gif',
  'image/x-icon': '.ico',
  'image/vnd.microsoft.icon': '.ico',
};

function validateMagicBytes(buffer: Buffer, ext: string): boolean {
  if (buffer.length < 4) return false;

  if (ext === '.png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  if (ext === '.jpg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (ext === '.gif') {
    return buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38;
  }
  if (ext === '.webp') {
    // RIFF....WEBP
    return (
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    );
  }
  if (ext === '.svg') {
    const text = buffer.toString('utf8').toLowerCase();
    // Chặn mã độc XSS trong SVG
    const dangerousPatterns = [
      /<script[\s>]/,
      /javascript:/,
      /onload\s*=/,
      /onerror\s*=/,
      /onclick\s*=/,
      /<foreignobject[\s>]/,
      /<iframe[\s>]/,
    ];
    for (const pattern of dangerousPatterns) {
      if (pattern.test(text)) return false;
    }
    return text.includes('<svg');
  }

  // ICO
  if (ext === '.ico') {
    return buffer[0] === 0x00 && buffer[1] === 0x00 && (buffer[2] === 0x01 || buffer[2] === 0x02);
  }

  return true;
}

export async function POST(req: NextRequest) {
  try {
    const ctx = await requireAuth();
    const canUpload =
      ctx.isAdmin ||
      can(ctx, 'FEATURE_SETTING_GENERAL') ||
      can(ctx, 'FEATURE_EQUIPMENT_MANAGE') ||
      can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') ||
      can(ctx, 'FEATURE_ASSET_CREATE') ||
      can(ctx, 'FEATURE_ASSET_EDIT');

    if (!canUpload) {
      return NextResponse.json({ error: 'Bạn không có quyền tải lên tệp' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;

    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Không tìm thấy tệp tải lên' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Kích thước tệp vượt quá giới hạn cho phép (tối đa 4MB)' }, { status: 400 });
    }

    const mimeType = (file.type || '').toLowerCase();
    const ext = ALLOWED_MIME_TYPES[mimeType];
    if (!ext) {
      return NextResponse.json(
        { error: 'Định dạng tệp không được hỗ trợ. Vui lòng chọn ảnh PNG, JPG, WebP, SVG hoặc GIF.' },
        { status: 400 }
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!validateMagicBytes(buffer, ext)) {
      return NextResponse.json(
        { error: 'Nội dung tệp không hợp lệ hoặc chứa mã không an toàn.' },
        { status: 400 }
      );
    }

    const randomSuffix = crypto.randomBytes(6).toString('hex');
    const safeBaseName = (file.name || 'image')
      .replace(/\.[^/.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .slice(0, 30);
    const filename = `${safeBaseName || 'upload'}-${Date.now()}-${randomSuffix}${ext}`;

    const uploaded = await uploadFile({
      objectPath: filename,
      buffer,
      contentType: mimeType,
    });

    return NextResponse.json({ ok: true, url: uploaded.url, filename });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Tải lên thất bại';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
