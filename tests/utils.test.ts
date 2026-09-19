import { describe, it, expect } from 'vitest';
import { initials, formatDays, formatMinutes, slugifyCode, randomLinkCode, generateWebhookSecret } from '@/lib/utils';
import { isWorkDay, workDaysToLabels, minutesBetweenTimes, dateOnly } from '@/lib/date';
import { renderTemplate } from '@/server/modules/notify/service';

describe('Tiện ích hiển thị', () => {
  it('viết tắt tên tiếng Việt', () => {
    expect(initials('Nguyễn Văn An')).toBe('NA');
    expect(initials('Dũng')).toBe('DŨ');
    expect(initials(null)).toBe('?');
  });

  it('định dạng số ngày phép', () => {
    expect(formatDays(3)).toBe('3');
    expect(formatDays(1.5)).toBe('1,5');
    expect(formatDays('2.0')).toBe('2');
    expect(formatDays(null)).toBe('0');
  });

  it('định dạng phút thành giờ', () => {
    expect(formatMinutes(30)).toBe('30 phút');
    expect(formatMinutes(60)).toBe('1 giờ');
    expect(formatMinutes(95)).toBe('1 giờ 35 phút');
    expect(formatMinutes(-15)).toBe('-15 phút');
  });

  it('sinh mã từ tên tiếng Việt có dấu', () => {
    expect(slugifyCode('Phòng Phát triển phần mềm')).toBe('PHONG_PHAT_TRIEN_PHAN_MEM');
    expect(slugifyCode('Khối Kinh doanh')).toBe('KHOI_KINH_DOANH');
    expect(slugifyCode('Đội xe')).toBe('DOI_XE');
  });

  it('mã liên kết Zalo không chứa ký tự dễ nhầm', () => {
    for (let i = 0; i < 50; i++) {
      const code = randomLinkCode(6);
      expect(code).toHaveLength(6);
      expect(code).not.toMatch(/[01IO]/);
    }
  });

  it('tự động tạo webhook secret bảo mật cao có tiền tố whsec_', () => {
    const s1 = generateWebhookSecret();
    const s2 = generateWebhookSecret();
    expect(s1).toMatch(/^whsec_[a-f0-9]{32}$/);
    expect(s2).toMatch(/^whsec_[a-f0-9]{32}$/);
    expect(s1).not.toBe(s2);
  });
});

describe('Xử lý ngày và ca làm việc', () => {
  it('bitmask ngày làm việc T2–T6', () => {
    const mask = 62;
    expect(isWorkDay(new Date(2026, 8, 18), mask)).toBe(true);  // thứ Sáu
    expect(isWorkDay(new Date(2026, 8, 19), mask)).toBe(false); // thứ Bảy
    expect(isWorkDay(new Date(2026, 8, 20), mask)).toBe(false); // Chủ nhật
    expect(workDaysToLabels(mask)).toBe('T2, T3, T4, T5, T6');
  });

  it('tính số phút giữa hai mốc giờ, kể cả ca qua đêm', () => {
    expect(minutesBetweenTimes('08:00', '17:30')).toBe(570);
    expect(minutesBetweenTimes('22:00', '06:00')).toBe(480);
  });

  it('dateOnly chuẩn hóa về UTC midnight', () => {
    const d = dateOnly(new Date(2026, 8, 18, 15, 30));
    expect(d.toISOString()).toBe('2026-09-18T00:00:00.000Z');
  });
});

describe('Mẫu thông báo', () => {
  it('thay biến trong mẫu', () => {
    const out = renderTemplate('Chào {{name}}, bạn có {{count}} việc', { name: 'An', count: 3 });
    expect(out).toBe('Chào An, bạn có 3 việc');
  });

  it('biến thiếu trả về rỗng thay vì in ra dấu ngoặc', () => {
    expect(renderTemplate('Xin chào {{ten}}!', {})).toBe('Xin chào !');
  });
});

describe('Định dạng Markdown cho Zalo Bot', () => {
  it('chuyển đổi heading markdown thành in đậm', async () => {
    const { formatMarkdownForZalo } = await import('@/server/modules/notify/zalo');
    const input = '# Tiêu đề 1\n## Tiêu đề 2\nNội dung thường với **in đậm** và _in nghiêng_.';
    const output = formatMarkdownForZalo(input);
    expect(output).toContain('**Tiêu đề 1**');
    expect(output).toContain('**Tiêu đề 2**');
    expect(output).toContain('Nội dung thường với **in đậm** và _in nghiêng_.');
  });

  it('xử lý chuỗi rỗng an toàn', async () => {
    const { formatMarkdownForZalo } = await import('@/server/modules/notify/zalo');
    expect(formatMarkdownForZalo('')).toBe('');
  });
});
