import { NextResponse, type NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

const MIME_MAP: Record<string, string> = {
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.webp': 'image/webp',
  '.svg': 'image/svg+xml',
  '.gif': 'image/gif',
  '.ico': 'image/x-icon',
};

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ file: string[] }> }
) {
  try {
    const { file } = await params;
    if (!file || !Array.isArray(file) || file.length === 0) {
      return NextResponse.json({ error: 'File path required' }, { status: 400 });
    }

    const uploadsDir = path.resolve(process.cwd(), 'public', 'uploads');
    const targetPath = path.resolve(uploadsDir, ...file);

    // Prevent directory traversal
    if (!targetPath.startsWith(uploadsDir)) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }

    try {
      const stat = await fs.stat(targetPath);
      if (!stat.isFile()) {
        return NextResponse.json({ error: 'Not found' }, { status: 404 });
      }
    } catch {
      return NextResponse.json({ error: 'Not found' }, { status: 404 });
    }

    const ext = path.extname(targetPath).toLowerCase();
    const contentType = MIME_MAP[ext] || 'application/octet-stream';
    const buffer = await fs.readFile(targetPath);

    const headers: Record<string, string> = {
      'Content-Type': contentType,
      'Cache-Control': 'public, max-age=31536000, immutable',
      'X-Content-Type-Options': 'nosniff',
    };

    if (ext === '.svg') {
      headers['Content-Security-Policy'] = "default-src 'none'; style-src 'unsafe-inline'; sandbox";
    }

    return new NextResponse(buffer, {
      status: 200,
      headers,
    });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Server error';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
