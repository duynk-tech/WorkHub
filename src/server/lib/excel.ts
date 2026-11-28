import { PassThrough, Readable } from 'node:stream';
import ExcelJS from 'exceljs';

/**
 * Xuất Excel theo luồng (streaming) dùng chung cho các route export.
 *
 * Workbook thường giữ toàn bộ ô trong bộ nhớ rồi mới ghi; với vài nghìn dòng có
 * định dạng thì tốn bộ nhớ và trễ byte đầu tiên. Ở đây mỗi dòng được tô màu ngay
 * khi thêm rồi `commit()` xuống luồng, trình duyệt nhận file dần dần.
 *
 * Quy ước định dạng: dòng tiêu đề nền xanh dương đậm chữ trắng, dòng
 * chẵn nền nhạt, viền mảnh, cố định dòng tiêu đề.
 */

export interface SheetColumn {
  header: string;
  key: string;
  width?: number;
  /** Định dạng số của Excel, vd. '#,##0' */
  numFmt?: string;
}

export const XLSX_CONTENT_TYPE = 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet';

// Xanh dương đậm (#1E3A8A), cùng màu tiêu đề bảng của báo cáo kho
const HEADER_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF1E3A8A' } };
const STRIPE_FILL: ExcelJS.Fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };

/** Tô dòng tiêu đề — tô từng ô có tên cột, không tô cả dòng để không loang sang cột trống. */
export function styleHeaderRow(row: ExcelJS.Row, columnCount: number) {
  for (let col = 1; col <= columnCount; col += 1) {
    const cell = row.getCell(col);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = HEADER_FILL;
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF172554' } },
      bottom: { style: 'thin', color: { argb: 'FF172554' } },
      left: { style: 'thin', color: { argb: 'FF1E40AF' } },
      right: { style: 'thin', color: { argb: 'FF1E40AF' } },
    };
  }
  row.height = 26;
}

/** Tô một dòng dữ liệu theo số thứ tự dòng (bắt đầu từ 2 sau tiêu đề). */
export function styleDataRow(row: ExcelJS.Row, rowNumber: number, columnCount: number) {
  const striped = rowNumber % 2 === 1;
  for (let col = 1; col <= columnCount; col += 1) {
    const cell = row.getCell(col);
    if (striped) cell.fill = STRIPE_FILL;
    cell.border = {
      bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
      right: { style: 'thin', color: { argb: 'FFF1F5F9' } },
    };
  }
}

export interface StreamSheet {
  /** Thêm một dòng dữ liệu (theo key của cột), đã tô sẵn và ghi xuống luồng. */
  add(values: Record<string, unknown> | unknown[]): void;
  /** Dòng ghi chú không tô nền/viền (vd. cảnh báo file bị cắt bớt). */
  note(values: Record<string, unknown> | unknown[]): void;
}

export interface SheetOptions {
  /** Bật bộ lọc trên dòng tiêu đề. */
  autoFilter?: boolean;
}

export interface StreamWorkbook {
  sheet(name: string, columns: SheetColumn[], fill: (sheet: StreamSheet) => void | Promise<void>, options?: SheetOptions): Promise<void>;
}

/**
 * Tạo Response tải file .xlsx được ghi theo luồng. `build` thêm từng sheet;
 * lỗi trong lúc dựng sẽ huỷ luồng (trình duyệt nhận file hỏng thay vì treo).
 */
export function streamXlsxResponse(
  fileName: string,
  build: (wb: StreamWorkbook) => Promise<void>,
  meta: { creator?: string } = {},
): Response {
  const pass = new PassThrough();
  const writer = new ExcelJS.stream.xlsx.WorkbookWriter({ stream: pass, useStyles: true, useSharedStrings: false });
  writer.creator = meta.creator ?? 'WorkHub';
  writer.created = new Date();

  const api: StreamWorkbook = {
    async sheet(name, columns, fill, options = {}) {
      // Tên sheet Excel tối đa 31 ký tự và không chứa []:*?/\
      const safeName = name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31);
      const ws = writer.addWorksheet(safeName, { views: [{ state: 'frozen', ySplit: 1 }] });
      ws.columns = columns.map((c) => ({ key: c.key, width: c.width, style: c.numFmt ? { numFmt: c.numFmt } : undefined }));

      if (options.autoFilter) ws.autoFilter = { from: { row: 1, column: 1 }, to: { row: 1, column: columns.length } };

      const header = ws.addRow(columns.map((c) => c.header));
      styleHeaderRow(header, columns.length);
      header.commit();

      let rowNumber = 1;
      await fill({
        add(values) {
          rowNumber += 1;
          const row = ws.addRow(values);
          styleDataRow(row, rowNumber, columns.length);
          row.commit();
        },
        note(values) {
          rowNumber += 1;
          ws.addRow(values).commit();
        },
      });
      ws.commit();
    },
  };

  (async () => {
    try {
      await build(api);
      await writer.commit();
    } catch (e) {
      pass.destroy(e instanceof Error ? e : new Error(String(e)));
    }
  })();

  return new Response(Readable.toWeb(pass) as ReadableStream, {
    headers: {
      'Content-Type': XLSX_CONTENT_TYPE,
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
      'Cache-Control': 'no-store',
    },
  });
}

/**
 * Dựng file .xlsx hoàn chỉnh trong bộ nhớ (để đính kèm email). Cùng định dạng với bản tải về:
 * tiêu đề xanh dương đậm, dòng kẻ sọc, cố định dòng tiêu đề.
 */
export async function buildXlsxBuffer(
  sheets: { name: string; columns: SheetColumn[]; rows: Record<string, unknown>[] }[],
  meta: { creator?: string } = {},
): Promise<Buffer> {
  const wb = new ExcelJS.Workbook();
  wb.creator = meta.creator ?? 'WorkHub';
  wb.created = new Date();
  for (const s of sheets) {
    const ws = wb.addWorksheet(s.name.replace(/[[\]:*?/\\]/g, ' ').slice(0, 31), { views: [{ state: 'frozen', ySplit: 1 }] });
    ws.columns = s.columns.map((c) => ({ key: c.key, width: c.width, style: c.numFmt ? { numFmt: c.numFmt } : undefined }));
    styleHeaderRow(ws.addRow(s.columns.map((c) => c.header)), s.columns.length);
    s.rows.forEach((r, i) => styleDataRow(ws.addRow(r), i + 2, s.columns.length));
  }
  return Buffer.from(await wb.xlsx.writeBuffer());
}
