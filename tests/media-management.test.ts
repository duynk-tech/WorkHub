import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { promises as fs } from 'fs';
import path from 'path';
import { GET, DELETE } from '@/app/api/media/route';
import * as authContext from '@/server/auth/context';

vi.mock('@/server/auth/context', () => ({
  requireAuth: vi.fn(),
  can: vi.fn(),
}));

const UPLOADS_DIR = path.join(process.cwd(), 'public', 'uploads');

describe('Media Management API (/api/media)', () => {
  const testFile1 = 'media-test-1.png';
  const testFile2 = 'media-test-2.jpg';
  const testFilePath1 = path.join(UPLOADS_DIR, testFile1);
  const testFilePath2 = path.join(UPLOADS_DIR, testFile2);

  beforeEach(async () => {
    vi.clearAllMocks();
    await fs.mkdir(UPLOADS_DIR, { recursive: true });
  });

  afterEach(async () => {
    try {
      await fs.unlink(testFilePath1);
    } catch {}
    try {
      await fs.unlink(testFilePath2);
    } catch {}
  });

  describe('GET /api/media', () => {
    it('trả về danh sách tệp media kèm dung lượng và metadata khi đã đăng nhập', async () => {
      vi.mocked(authContext.requireAuth).mockResolvedValue({ userId: 1 } as any);

      // Tạo 2 tệp test
      await fs.writeFile(testFilePath1, 'content-1');
      await fs.writeFile(testFilePath2, 'content-2-longer');

      const req = new NextRequest('http://localhost:3000/api/media');
      const res = await GET(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(Array.isArray(json.files)).toBe(true);
      expect(json.totalFiles).toBeGreaterThanOrEqual(2);
      expect(json.totalSize).toBeGreaterThan(0);

      const found1 = json.files.find((f: any) => f.name === testFile1);
      expect(found1).toBeDefined();
      expect(found1.url).toBe(`/uploads/${testFile1}`);
      expect(found1.extension).toBe('.png');
      expect(found1.size).toBe(9); // 'content-1' is 9 bytes
    });

    it('từ chối hoặc ném lỗi khi chưa xác thực', async () => {
      vi.mocked(authContext.requireAuth).mockRejectedValue(new Error('Người dùng chưa đăng nhập'));

      const req = new NextRequest('http://localhost:3000/api/media');
      const res = await GET(req);

      expect(res.status).toBe(401);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error).toContain('chưa đăng nhập');
    });
  });

  describe('DELETE /api/media', () => {
    it('chặn xóa khi người dùng không có quyền quản trị hoặc quản lý thiết bị/cài đặt', async () => {
      vi.mocked(authContext.requireAuth).mockResolvedValue({
        userId: 1,
        isAdmin: false,
      } as any);
      vi.mocked(authContext.can).mockReturnValue(false);

      const req = new NextRequest('http://localhost:3000/api/media?filename=any.png', {
        method: 'DELETE',
      });
      const res = await DELETE(req);

      expect(res.status).toBe(403);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error).toContain('không có quyền');
    });

    it('báo lỗi khi thiếu tên tệp cần xóa', async () => {
      vi.mocked(authContext.requireAuth).mockResolvedValue({
        userId: 1,
        isAdmin: true,
      } as any);

      const req = new NextRequest('http://localhost:3000/api/media', {
        method: 'DELETE',
      });
      const res = await DELETE(req);

      expect(res.status).toBe(400);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error).toContain('Thiếu tên tệp');
    });

    it('xóa thành công tệp hợp lệ trong thư mục uploads', async () => {
      vi.mocked(authContext.requireAuth).mockResolvedValue({
        userId: 1,
        isAdmin: true,
      } as any);

      await fs.writeFile(testFilePath1, 'to-be-deleted');

      const req = new NextRequest(`http://localhost:3000/api/media?filename=${testFile1}`, {
        method: 'DELETE',
      });
      const res = await DELETE(req);

      expect(res.status).toBe(200);
      const json = await res.json();
      expect(json.ok).toBe(true);
      expect(json.message).toContain('thành công');

      // Tệp phải không còn tồn tại trên ổ đĩa
      await expect(fs.stat(testFilePath1)).rejects.toThrow();
    });

    it('báo 404 khi tệp không tồn tại', async () => {
      vi.mocked(authContext.requireAuth).mockResolvedValue({
        userId: 1,
        isAdmin: true,
      } as any);

      const req = new NextRequest('http://localhost:3000/api/media?filename=non-existent-file-9999.png', {
        method: 'DELETE',
      });
      const res = await DELETE(req);

      expect(res.status).toBe(404);
      const json = await res.json();
      expect(json.ok).toBe(false);
      expect(json.error).toContain('không tồn tại');
    });

    it('chống tấn công Path Traversal', async () => {
      vi.mocked(authContext.requireAuth).mockResolvedValue({
        userId: 1,
        isAdmin: true,
      } as any);

      // Thử dùng path traversal dạng ../../package.json
      // path.basename('../../package.json') sẽ trả về 'package.json'
      // Khi đó tìm package.json trong uploads -> 404, không thể xóa package.json gốc
      const req = new NextRequest('http://localhost:3000/api/media?filename=../../package.json', {
        method: 'DELETE',
      });
      const res = await DELETE(req);

      // Sẽ là 404 vì không có package.json trong UPLOADS_DIR
      expect(res.status).toBe(404);
    });
  });
});
