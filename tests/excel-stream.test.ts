import { describe, it, expect } from 'vitest';
import ExcelJS from 'exceljs';
import { streamXlsxResponse } from '@/server/lib/excel';

describe('Xuất Excel theo luồng', () => {
  it('sinh file đọc lại được: đúng tiêu đề, dữ liệu, định dạng và tên file', async () => {
    const res = streamXlsxResponse('bao-cao thử.xlsx', async (wb) => {
      await wb.sheet('Theo nhân sự', [
        { header: 'Mã', key: 'code', width: 10 },
        { header: 'Số tiền', key: 'amount', width: 14, numFmt: '#,##0' },
      ], (s) => {
        for (let i = 1; i <= 1500; i += 1) s.add({ code: `NV${i}`, amount: i * 1000 });
      });
      await wb.sheet('Tên: có/ký tự [lạ]', [{ header: 'A', key: 'a' }], (s) => s.add({ a: 1 }));
    });

    expect(res.headers.get('Content-Disposition')).toContain(encodeURIComponent('bao-cao thử.xlsx'));
    const wb = new ExcelJS.Workbook();
    await wb.xlsx.load(await res.arrayBuffer());

    const ws = wb.getWorksheet('Theo nhân sự')!;
    expect(ws.getRow(1).getCell(1).value).toBe('Mã');
    expect(ws.getRow(1).getCell(1).font?.bold).toBe(true);
    // Tiêu đề nền xanh dương đậm, chữ trắng
    expect((ws.getRow(1).getCell(1).fill as any)?.fgColor?.argb).toBe('FF1E3A8A');
    expect(ws.getRow(1).getCell(1).font?.color?.argb).toBe('FFFFFFFF');
    expect(ws.getRow(2).getCell(1).value).toBe('NV1');
    expect(ws.getRow(1501).getCell(2).value).toBe(1_500_000);
    expect(ws.rowCount).toBe(1501);
    // Tên sheet đã bỏ ký tự Excel cấm
    expect(wb.worksheets[1].name).not.toMatch(/[[\]:*?/\\]/);
  });

  it('lỗi khi dựng file thì luồng bị huỷ, không treo', async () => {
    const res = streamXlsxResponse('x.xlsx', async () => {
      throw new Error('boom');
    });
    await expect(res.arrayBuffer()).rejects.toBeTruthy();
  });
});
