import { normalizeHeader, type ImportDefinition } from './definitions';

/** Giá trị ô ExcelJS có thể là số, ngày, công thức, rich text, hyperlink — quy về chuỗi. */
export function cellText(v: unknown): string {
  if (v === null || v === undefined) return '';
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object') {
    const o = v as { result?: unknown; text?: unknown; richText?: { text: string }[]; hyperlink?: string };
    if (o.richText) return o.richText.map((r) => r.text).join('').trim();
    if (o.text !== undefined) return cellText(o.text);
    if (o.result !== undefined) return cellText(o.result);
    if (o.hyperlink) return String(o.hyperlink);
    return '';
  }
  return String(v).trim();
}

export interface ParsedImport<T> {
  valid: { row: number; data: T }[];
  errors: { row: number; message: string }[];
  /** Cột bắt buộc không tìm thấy trong dòng tiêu đề. */
  missingColumns: string[];
  totalRows: number;
}

/**
 * Đọc mảng dòng (dòng đầu là tiêu đề) theo khai báo cột. Dòng trống bị bỏ qua;
 * mã trùng trong cùng file báo lỗi ở lần xuất hiện sau để người dùng sửa.
 */
export function parseImportRows<T>(rows: unknown[][], def: ImportDefinition<T>): ParsedImport<T> {
  const header = (rows[0] ?? []).map((h) => normalizeHeader(cellText(h)));
  const colIndex = new Map<string, number>();
  for (const col of def.columns) {
    const names = [col.header, ...(col.aliases ?? [])].map(normalizeHeader);
    const idx = header.findIndex((h) => names.includes(h));
    if (idx >= 0) colIndex.set(col.key, idx);
  }
  const missingColumns = def.columns.filter((c) => c.required && !colIndex.has(c.key)).map((c) => c.header);
  const result: ParsedImport<T> = { valid: [], errors: [], missingColumns, totalRows: 0 };
  if (missingColumns.length) return result;

  const seen = new Map<string, number>();
  for (let i = 1; i < rows.length; i += 1) {
    const cells = rows[i] ?? [];
    const raw: Record<string, string> = {};
    for (const [key, idx] of colIndex) raw[key] = cellText(cells[idx]);
    if (Object.values(raw).every((v) => v === '')) continue;
    result.totalRows += 1;
    const rowNo = i + 1; // số dòng như người dùng thấy trong Excel

    const key = raw[def.keyField]?.trim();
    if (key) {
      const prev = seen.get(key.toLowerCase());
      if (prev) { result.errors.push({ row: rowNo, message: `Mã "${key}" trùng với dòng ${prev}` }); continue; }
      seen.set(key.toLowerCase(), rowNo);
    }

    const parsed = def.parse(raw);
    if (parsed.ok) result.valid.push({ row: rowNo, data: parsed.data });
    else result.errors.push({ row: rowNo, message: parsed.message });
  }
  return result;
}
