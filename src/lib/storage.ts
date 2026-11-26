import 'server-only';
import { promises as fs } from 'node:fs';
import path from 'node:path';

export interface StoredFileItem {
  name: string;
  url: string;
  size: number;
  createdAt: Date;
  extension: string;
}

const LOCAL_UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

function getSupabaseStorageConfig() {
  const url = (process.env.SUPABASE_URL || process.env.NEXT_PUBLIC_SUPABASE_URL)?.trim().replace(/\/+$/, '');
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  const bucket = process.env.SUPABASE_STORAGE_BUCKET?.trim() || 'uploads';

  if (!url || !serviceRoleKey) {
    return null;
  }
  return { url, serviceRoleKey, bucket };
}

export function isSupabaseStorageEnabled(): boolean {
  return getSupabaseStorageConfig() !== null;
}

function encodeObjectPath(objectPath: string): string {
  return objectPath
    .split('/')
    .filter(Boolean)
    .map((segment) => encodeURIComponent(segment))
    .join('/');
}

/**
 * Upload một file lên Supabase Storage (khi đã cấu hình SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY),
 * hoặc lưu vào `public/uploads` khi chạy local dev.
 */
export async function uploadFile(params: {
  objectPath: string;
  buffer: Buffer;
  contentType: string;
}): Promise<{ url: string; objectPath: string }> {
  const cleanPath = params.objectPath.replace(/^\/+/, '');
  const cfg = getSupabaseStorageConfig();

  if (cfg) {
    const encodedPath = encodeObjectPath(cleanPath);
    const endpoint = `${cfg.url}/storage/v1/object/${encodeURIComponent(cfg.bucket)}/${encodedPath}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.serviceRoleKey}`,
        apikey: cfg.serviceRoleKey,
        'Content-Type': params.contentType,
        'x-upsert': 'true',
      },
      body: new Uint8Array(params.buffer),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Không thể tải tệp lên Supabase Storage (${res.status}): ${detail || res.statusText}`);
    }

    const publicUrl = `${cfg.url}/storage/v1/object/public/${encodeURIComponent(cfg.bucket)}/${encodedPath}`;
    return { url: publicUrl, objectPath: cleanPath };
  }

  if (process.env.VERCEL) {
    throw new Error(
      'Chưa cấu hình SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY. Không thể lưu tệp trên ổ đĩa chỉ đọc của Vercel.',
    );
  }

  const targetPath = path.resolve(LOCAL_UPLOADS_DIR, cleanPath);
  if (!targetPath.startsWith(path.resolve(LOCAL_UPLOADS_DIR))) {
    throw new Error('Đường dẫn tệp không hợp lệ');
  }
  await fs.mkdir(path.dirname(targetPath), { recursive: true });
  await fs.writeFile(targetPath, params.buffer);

  return { url: `/uploads/${cleanPath}`, objectPath: cleanPath };
}

/** Liệt kê tệp ở thư mục gốc của bucket/uploads (phục vụ màn hình Media Library). */
export async function listUploadedFiles(): Promise<StoredFileItem[]> {
  const cfg = getSupabaseStorageConfig();

  if (cfg) {
    const endpoint = `${cfg.url}/storage/v1/object/list/${encodeURIComponent(cfg.bucket)}`;
    const res = await fetch(endpoint, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${cfg.serviceRoleKey}`,
        apikey: cfg.serviceRoleKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        prefix: '',
        limit: 500,
        offset: 0,
        sortBy: { column: 'created_at', order: 'desc' },
      }),
    });

    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Không thể đọc danh sách Supabase Storage (${res.status}): ${detail || res.statusText}`);
    }

    const rows = (await res.json()) as Array<{
      name: string;
      id: string | null;
      created_at?: string;
      updated_at?: string;
      metadata?: { size?: number } | null;
    }>;

    return rows
      .filter((row) => row.id !== null && row.name && !row.name.startsWith('.'))
      .map((row) => {
        const ext = path.extname(row.name).toLowerCase();
        const encoded = encodeObjectPath(row.name);
        return {
          name: row.name,
          url: `${cfg.url}/storage/v1/object/public/${encodeURIComponent(cfg.bucket)}/${encoded}`,
          size: Number(row.metadata?.size ?? 0),
          createdAt: new Date(row.created_at || row.updated_at || Date.now()),
          extension: ext,
        };
      });
  }

  if (process.env.VERCEL) {
    return [];
  }

  await fs.mkdir(LOCAL_UPLOADS_DIR, { recursive: true });
  const dirEntries = await fs.readdir(LOCAL_UPLOADS_DIR, { withFileTypes: true });
  const files = await Promise.all(
    dirEntries
      .filter((entry) => entry.isFile() && !entry.name.startsWith('.'))
      .map(async (entry) => {
        const filePath = path.join(LOCAL_UPLOADS_DIR, entry.name);
        const stat = await fs.stat(filePath);
        return {
          name: entry.name,
          url: `/uploads/${entry.name}`,
          size: stat.size,
          createdAt: stat.birthtime || stat.mtime,
          extension: path.extname(entry.name).toLowerCase(),
        };
      }),
  );

  files.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  return files;
}

/** Xóa tệp khỏi Supabase Storage hoặc `public/uploads` (chống Path Traversal). */
export async function deleteUploadedFile(filename: string): Promise<'deleted' | 'not_found'> {
  const safeFilename = path.basename(filename);
  if (!safeFilename || safeFilename.startsWith('.')) {
    throw new Error('Đường dẫn tệp không hợp lệ');
  }

  const cfg = getSupabaseStorageConfig();

  if (cfg) {
    const endpoint = `${cfg.url}/storage/v1/object/${encodeURIComponent(cfg.bucket)}`;
    const res = await fetch(endpoint, {
      method: 'DELETE',
      headers: {
        Authorization: `Bearer ${cfg.serviceRoleKey}`,
        apikey: cfg.serviceRoleKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ prefixes: [safeFilename] }),
    });

    if (res.status === 404) return 'not_found';
    if (!res.ok) {
      const detail = await res.text().catch(() => '');
      throw new Error(`Không thể xóa tệp trên Supabase Storage (${res.status}): ${detail || res.statusText}`);
    }
    return 'deleted';
  }

  if (process.env.VERCEL) {
    throw new Error('Chưa cấu hình SUPABASE_URL và SUPABASE_SERVICE_ROLE_KEY.');
  }

  const targetPath = path.resolve(LOCAL_UPLOADS_DIR, safeFilename);
  if (!targetPath.startsWith(path.resolve(LOCAL_UPLOADS_DIR))) {
    throw new Error('Đường dẫn tệp không hợp lệ');
  }

  try {
    await fs.unlink(targetPath);
    return 'deleted';
  } catch (err: unknown) {
    if ((err as { code?: string })?.code === 'ENOENT') {
      return 'not_found';
    }
    throw err;
  }
}
