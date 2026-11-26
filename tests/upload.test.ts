import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { POST } from '@/app/api/upload/route';
import { GET } from '@/app/uploads/[...file]/route';
import * as authContext from '@/server/auth/context';

vi.mock('@/server/auth/context', () => ({
  requireAuth: vi.fn(),
  can: vi.fn(),
}));

describe('File Upload & Static Serving API', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('POST /api/upload', () => {
    it('từ chối người dùng không có quyền quản lý cài đặt', async () => {
      vi.mocked(authContext.requireAuth).mockResolvedValue({ user: { id: 1 } } as any);
      vi.mocked(authContext.can).mockReturnValue(false);

      const formData = new FormData();
      const file = new File(['fake content'], 'test.png', { type: 'image/png' });
      formData.append('file', file);

      const req = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const res = await POST(req);
      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.error).toContain('không có quyền');
    });

    it('từ chối khi không có file trong request', async () => {
      vi.mocked(authContext.requireAuth).mockResolvedValue({ user: { id: 1 } } as any);
      vi.mocked(authContext.can).mockReturnValue(true);

      const formData = new FormData();
      const req = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Không tìm thấy tệp');
    });

    it('từ chối định dạng tệp không được hỗ trợ', async () => {
      vi.mocked(authContext.requireAuth).mockResolvedValue({ user: { id: 1 } } as any);
      vi.mocked(authContext.can).mockReturnValue(true);

      const formData = new FormData();
      const file = new File(['malicious'], 'script.exe', { type: 'application/x-msdownload' });
      formData.append('file', file);

      const req = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('Định dạng tệp không được hỗ trợ');
    });

    it('từ chối tệp vượt quá giới hạn 4MB', async () => {
      vi.mocked(authContext.requireAuth).mockResolvedValue({ user: { id: 1 } } as any);
      vi.mocked(authContext.can).mockReturnValue(true);

      const largeContent = new Uint8Array(4.5 * 1024 * 1024);
      const formData = new FormData();
      const file = new File([largeContent], 'big.png', { type: 'image/png' });
      formData.append('file', file);

      const req = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('4MB');
    });

    it('tải lên thành công ảnh PNG và trả về URL bắt đầu bằng /uploads/', async () => {
      vi.mocked(authContext.requireAuth).mockResolvedValue({ user: { id: 1 } } as any);
      vi.mocked(authContext.can).mockReturnValue(true);

      const formData = new FormData();
      const pngBytes = new Uint8Array([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
      const file = new File([pngBytes], 'company-logo.png', { type: 'image/png' });
      formData.append('file', file);

      const req = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const res = await POST(req);
      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.url).toMatch(/^\/uploads\/company-logo-.*\.png$/);

      // Dọn dẹp tệp test
      const savedPath = path.join(process.cwd(), 'public', json.url.replace(/^\//, ''));
      try {
        await fs.unlink(savedPath);
      } catch {
        // ignore
      }
    });

    it('chặn tệp SVG chứa mã script độc hại (Stored XSS)', async () => {
      vi.mocked(authContext.requireAuth).mockResolvedValue({ user: { id: 1 } } as any);
      vi.mocked(authContext.can).mockReturnValue(true);

      const maliciousSvg = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>';
      const formData = new FormData();
      const file = new File([maliciousSvg], 'attack.svg', { type: 'image/svg+xml' });
      formData.append('file', file);

      const req = new NextRequest('http://localhost:3000/api/upload', {
        method: 'POST',
        body: formData,
      });

      const res = await POST(req);
      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.error).toContain('chứa mã không an toàn');
    });
  });

  describe('GET /uploads/[...file]', () => {
    it('chặn tấn công path traversal (..)', async () => {
      const req = new NextRequest('http://localhost:3000/uploads/../../etc/passwd');
      const res = await GET(req, {
        params: Promise.resolve({ file: ['..', '..', 'etc', 'passwd'] }),
      });
      expect([403, 404]).toContain(res.status);
    });

    it('trả về 404 khi tệp không tồn tại', async () => {
      const req = new NextRequest('http://localhost:3000/uploads/non-existent.png');
      const res = await GET(req, {
        params: Promise.resolve({ file: ['non-existent.png'] }),
      });
      expect(res.status).toBe(404);
    });

    it('phục vụ đúng tệp đã tải lên và trả về Content-Type phù hợp', async () => {
      const uploadsDir = path.join(process.cwd(), 'public', 'uploads');
      await fs.mkdir(uploadsDir, { recursive: true });
      const testFile = 'test-watermark-sample.png';
      const testPath = path.join(uploadsDir, testFile);
      await fs.writeFile(testPath, Buffer.from('test-png-data'));

      try {
        const req = new NextRequest(`http://localhost:3000/uploads/${testFile}`);
        const res = await GET(req, {
          params: Promise.resolve({ file: [testFile] }),
        });
        expect(res.status).toBe(200);
        expect(res.headers.get('content-type')).toBe('image/png');
        expect(res.headers.get('cache-control')).toContain('public');
      } finally {
        await fs.unlink(testPath);
      }
    });
  });
});
