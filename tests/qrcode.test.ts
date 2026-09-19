import { describe, it, expect } from 'vitest';
import { generateQrSvg, generateQrDataUrl, createQrMatrix } from '@/lib/qrcode';

describe('QR Code Generator', () => {
  it('tạo matrix QR hợp lệ với các góc định vị', () => {
    const matrix = createQrMatrix('AST-2026-0001');
    expect(matrix.length).toBeGreaterThanOrEqual(21);
    expect(matrix[0].length).toBe(matrix.length);

    // Góc trên bên trái Finder Pattern (7x7) có tâm đen
    expect(matrix[0][0]).toBe(true);
    expect(matrix[1][1]).toBe(false);
    expect(matrix[2][2]).toBe(true);
    expect(matrix[3][3]).toBe(true);
  });

  it('sinh mã SVG vector hợp lệ với thẻ path và rect', () => {
    const svg = generateQrSvg('https://workhub.local/assets/1', { size: 180, color: '#1e293b' });
    expect(svg).toContain('<svg');
    expect(svg).toContain('xmlns="http://www.w3.org/2000/svg"');
    expect(svg).toContain('viewBox="0 0');
    expect(svg).toContain('fill="#1e293b"');
    expect(svg).toContain('width="180"');
    expect(svg).toContain('height="180"');
  });

  it('sinh data URL SVG hợp lệ bắt đầu bằng data:image/svg+xml;base64', () => {
    const dataUrl = generateQrDataUrl('AST-2026-0002');
    expect(dataUrl.startsWith('data:image/svg+xml;base64,')).toBe(true);
  });
});
