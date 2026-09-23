import { describe, it, expect } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join } from 'node:path';

/**
 * Chặn việc dùng biến CSS chưa khai báo.
 *
 * `var(--khong-ton-tai)` không báo lỗi lúc build, cũng không đỏ ở TypeScript —
 * trình duyệt lặng lẽ bỏ qua và phần tử mất nền. Lỗi này từng làm mũi tên cuộn
 * tab trong suốt và hai hộp thoại luôn trắng ở dark mode, chỉ phát hiện bằng mắt.
 */

const SRC = join(process.cwd(), 'src');

function walk(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const full = join(dir, name);
    if (statSync(full).isDirectory()) walk(full, out);
    else if (/\.(ts|tsx|css)$/.test(name)) out.push(full);
  }
  return out;
}

const files = walk(SRC);

/**
 * Token hợp lệ = khai trong globals.css, hoặc do next/font tạo lúc chạy
 * (khai bằng `variable: '--ten'` trong layout, không có trong file CSS).
 */
function declaredTokens(): Set<string> {
  const css = readFileSync(join(SRC, 'app/globals.css'), 'utf8');
  const tokens = new Set([...css.matchAll(/(--[a-z0-9-]+)\s*:/gi)].map((m) => m[1]));

  const layout = readFileSync(join(SRC, 'app/layout.tsx'), 'utf8');
  for (const m of layout.matchAll(/variable:\s*'(--[a-z0-9-]+)'/gi)) tokens.add(m[1]);

  return tokens;
}

describe('biến CSS', () => {
  const declared = declaredTokens();

  it('globals.css có khai báo các token nền cơ bản', () => {
    for (const t of ['--surface', '--surface-app', '--surface-card', '--surface-sunken']) {
      expect(declared.has(t), `thiếu ${t}`).toBe(true);
    }
  });

  it('--surface-base không còn được dùng ở đâu (token này chưa từng tồn tại)', () => {
    const used = files.filter((f) => readFileSync(f, 'utf8').includes('--surface-base'));
    expect(used.map((f) => f.replace(process.cwd() + '/', ''))).toEqual([]);
  });

  it('mọi var(--token) không có fallback đều phải được khai báo', () => {
    const offenders: string[] = [];
    for (const file of files) {
      const text = readFileSync(file, 'utf8');
      for (const m of text.matchAll(/var\(\s*(--[a-z0-9-]+)\s*\)/gi)) {
        const token = m[1];
        // --col do ScrollTabs/Kanban đặt inline từ JS, không khai trong CSS
        if (token === '--col') continue;
        if (!declared.has(token)) {
          offenders.push(`${file.replace(process.cwd() + '/', '')}: ${token}`);
        }
      }
    }
    expect([...new Set(offenders)]).toEqual([]);
  });
});
