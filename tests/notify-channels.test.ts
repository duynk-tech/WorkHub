import { describe, it, expect } from 'vitest';
import { isEmailConfigured, renderEmailHtml, htmlToText, sendEmail } from '@/server/modules/notify/email';
import { normalizePrefs, DEFAULT_NOTIFY_PREFS, notifyPrefsKey } from '@/server/modules/notify/prefs';

describe('Kênh email', () => {
  it('chưa có SMTP thì coi như tắt và bỏ qua khi gửi', async () => {
    expect(isEmailConfigured({} as NodeJS.ProcessEnv)).toBe(false);
    expect(isEmailConfigured({ SMTP_HOST: 'h', SMTP_USER: 'u', SMTP_PASS: 'p' } as unknown as NodeJS.ProcessEnv)).toBe(true);
    const saved = { ...process.env };
    delete process.env.SMTP_HOST;
    const r = await sendEmail({ to: 'a@b.c', subject: 's', html: '<p>x</p>' });
    expect(r).toMatchObject({ ok: false, skipped: true });
    process.env = saved;
  });

  it('khung email thoát ký tự HTML và giữ xuống dòng', () => {
    const html = renderEmailHtml({ appName: 'Tim <Corp>', title: 'Đơn <b>mới</b>', body: 'Dòng 1\nDòng 2 & 3', link: 'https://x.vn/a?b=1&c=2' });
    expect(html).toContain('Tim &lt;Corp&gt;');
    expect(html).toContain('Đơn &lt;b&gt;mới&lt;/b&gt;');
    expect(html).toContain('Dòng 1<br>Dòng 2 &amp; 3');
    expect(html).toContain('href="https://x.vn/a?b=1&amp;c=2"');
    expect(htmlToText('<p>A</p><p>B<br>C</p>')).toBe('A\n\nB\nC');
  });
});

describe('Tuỳ chọn kênh thông báo', () => {
  it('thiếu hoặc sai kiểu thì dùng mặc định bật', () => {
    expect(normalizePrefs(null)).toEqual(DEFAULT_NOTIFY_PREFS);
    expect(normalizePrefs({ email: false, push: 'x' })).toEqual({ email: false, push: true, zalo: true });
    expect(notifyPrefsKey(7)).toBe('user.7.notify');
  });
});
