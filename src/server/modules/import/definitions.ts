import { z } from 'zod';
import { customerInputSchema } from '@/server/modules/customer/schemas';
import { SaveSparePartSchema } from '@/server/modules/spare-parts/types';

/**
 * Khai báo cột cho từng loại nhập Excel. Tiêu đề cột trong file mẫu chính là `header`;
 * khi đọc file, so khớp không phân biệt hoa thường/dấu cách và bỏ dấu "*".
 */

export interface ImportColumn {
  key: string;
  header: string;
  required?: boolean;
  example?: string | number;
  width?: number;
  /** Tên khác người dùng hay gõ, cũng nhận. */
  aliases?: string[];
}

export interface ImportDefinition<T> {
  kind: string;
  label: string;
  columns: ImportColumn[];
  /** Mã dùng để nhận ra dòng đã có trong hệ thống. */
  keyField: string;
  parse: (raw: Record<string, string>) => { ok: true; data: T } | { ok: false; message: string };
}

const firstMessage = (e: z.ZodError) => {
  const i = e.issues[0];
  return i ? `${i.path.join('.') || 'Dòng'}: ${i.message}` : 'Dữ liệu không hợp lệ';
};

const num = (v: string | undefined) => {
  if (v === undefined || v.trim() === '') return undefined;
  const n = Number(v.replace(/[\s,₫]/g, '').replace(/\.(?=\d{3}(\D|$))/g, ''));
  return Number.isFinite(n) ? n : NaN;
};

export type CustomerImportRow = z.infer<typeof customerInputSchema>;

export const CUSTOMER_IMPORT: ImportDefinition<CustomerImportRow> = {
  kind: 'customers',
  label: 'Khách hàng',
  keyField: 'code',
  columns: [
    { key: 'code', header: 'Mã khách hàng', example: 'KH-0001', width: 16, aliases: ['ma kh', 'ma'] },
    { key: 'name', header: 'Tên khách hàng', required: true, example: 'Quán Cà Phê Sông Hàn', width: 32, aliases: ['ten', 'ten kh'] },
    { key: 'contactName', header: 'Người liên hệ', example: 'Nguyễn Văn A', width: 22 },
    { key: 'phone', header: 'Số điện thoại', required: true, example: '0905123456', width: 16, aliases: ['sdt', 'dien thoai'] },
    { key: 'email', header: 'Email', example: 'lienhe@songhan.vn', width: 26 },
    { key: 'address', header: 'Địa chỉ', example: '12 Bạch Đằng, Đà Nẵng', width: 36 },
    { key: 'notes', header: 'Ghi chú', example: '', width: 30 },
  ],
  parse: (raw) => {
    const r = customerInputSchema.safeParse(raw);
    return r.success ? { ok: true, data: r.data } : { ok: false, message: firstMessage(r.error) };
  },
};

export type SparePartImportRow = z.infer<typeof SaveSparePartSchema>;

const CATEGORY_ALIASES: Record<string, string> = {
  'phu tung': 'SPARE_PART', spare_part: 'SPARE_PART', 'vat tu': 'CONSUMABLE', consumable: 'CONSUMABLE',
  'may': 'MACHINE', machine: 'MACHINE', 'thiet bi': 'EQUIPMENT', equipment: 'EQUIPMENT',
};

export const SPARE_PART_IMPORT: ImportDefinition<SparePartImportRow> = {
  kind: 'spare-parts',
  label: 'Phụ tùng & vật tư',
  keyField: 'itemCode',
  columns: [
    { key: 'itemCode', header: 'Mã phụ tùng', required: true, example: 'PT-0001', width: 16, aliases: ['ma', 'ma pt'] },
    { key: 'name', header: 'Tên phụ tùng', required: true, example: 'Gioăng cao su máy kem', width: 32, aliases: ['ten'] },
    { key: 'category', header: 'Loại', example: 'Phụ tùng', width: 14 },
    { key: 'unit', header: 'Đơn vị tính', required: true, example: 'Cái', width: 12, aliases: ['dvt'] },
    { key: 'minStockAlert', header: 'Ngưỡng tồn an toàn', example: 5, width: 18 },
    { key: 'costPrice', header: 'Giá vốn (VND)', example: 120000, width: 16 },
    { key: 'sellingPrice', header: 'Giá bán (VND)', example: 180000, width: 16 },
    { key: 'priceEur', header: 'Giá EUR', example: '', width: 12 },
    { key: 'manufacturer', header: 'Hãng / Nhà cung cấp', example: 'Selmi', width: 20 },
    { key: 'compatibleWith', header: 'Dùng cho máy', example: 'Carpigiani 191', width: 24 },
    { key: 'description', header: 'Mô tả', example: '', width: 30 },
  ],
  parse: (raw) => {
    const category = CATEGORY_ALIASES[normalizeHeader(raw.category ?? '')] ?? (raw.category?.toUpperCase() || undefined);
    const numbers = { minStockAlert: num(raw.minStockAlert), costPrice: num(raw.costPrice), sellingPrice: num(raw.sellingPrice), priceEur: num(raw.priceEur) };
    const bad = Object.entries(numbers).find(([, v]) => Number.isNaN(v));
    if (bad) return { ok: false, message: `${SPARE_PART_IMPORT.columns.find((c) => c.key === bad[0])?.header}: phải là số` };
    const r = SaveSparePartSchema.safeParse({
      ...raw,
      category,
      ...Object.fromEntries(Object.entries(numbers).filter(([, v]) => v !== undefined)),
    });
    return r.success ? { ok: true, data: r.data } : { ok: false, message: firstMessage(r.error) };
  },
};

export const IMPORT_DEFINITIONS = {
  customers: CUSTOMER_IMPORT,
  'spare-parts': SPARE_PART_IMPORT,
} as const;

export type ImportKind = keyof typeof IMPORT_DEFINITIONS;

/** "Mã khách hàng *" → "ma khach hang" để so khớp tiêu đề cột. */
export function normalizeHeader(s: string): string {
  return s
    .normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/đ/gi, 'd')
    .replace(/\*/g, '').replace(/\s+/g, ' ').trim().toLowerCase();
}
