import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import { GET } from '@/app/api/cron/[job]/route';

describe('Cron Security (/api/cron/[job])', () => {
  const originalEnv = process.env.CRON_SECRET;

  afterEach(() => {
    process.env.CRON_SECRET = originalEnv;
  });

  it('từ chối 500 khi CRON_SECRET chưa được cấu hình trong env (chống bypass)', async () => {
    delete process.env.CRON_SECRET;

    const req = new NextRequest('http://localhost:3000/api/cron/reminder');
    const res = await GET(req, { params: Promise.resolve({ job: 'reminder' }) });

    expect(res.status).toBe(500);
    const json = await res.json();
    expect(json.ok).toBe(false);
    expect(json.error).toContain('CRON_SECRET chưa được cấu hình');
  });

  it('từ chối 401 khi không truyền secret hoặc secret sai', async () => {
    process.env.CRON_SECRET = 'super-secret-cron-token-32chars';

    const req = new NextRequest('http://localhost:3000/api/cron/reminder');
    const res = await GET(req, { params: Promise.resolve({ job: 'reminder' }) });

    expect(res.status).toBe(401);
    const json = await res.json();
    expect(json.error).toBe('unauthorized');
  });

  it('từ chối 404 khi secret đúng nhưng job không tồn tại', async () => {
    process.env.CRON_SECRET = 'super-secret-cron-token-32chars';

    const req = new NextRequest('http://localhost:3000/api/cron/non-existent-job?secret=super-secret-cron-token-32chars');
    const res = await GET(req, { params: Promise.resolve({ job: 'non-existent-job' }) });

    expect(res.status).toBe(404);
    const json = await res.json();
    expect(json.error).toBe('unknown_job');
  });
});
