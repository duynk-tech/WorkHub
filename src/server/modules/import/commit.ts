import 'server-only';
import { prisma } from '@/lib/prisma';
import { saveCustomer } from '@/server/modules/customer/service';
import { saveSparePart } from '@/server/modules/spare-parts/service';
import type { CustomerImportRow, SparePartImportRow, ImportKind } from './definitions';

export type DuplicateMode = 'update' | 'skip';

export interface CommitResult {
  created: number;
  updated: number;
  skipped: number;
  failed: { row: number; message: string }[];
}

const CHUNK = 200;

/** Ghi từng lô 200 dòng; một dòng lỗi không làm hỏng cả file, được trả lại kèm số dòng. */
export async function commitImport(
  kind: ImportKind,
  rows: { row: number; data: unknown }[],
  mode: DuplicateMode,
): Promise<CommitResult> {
  const out: CommitResult = { created: 0, updated: 0, skipped: 0, failed: [] };

  for (let i = 0; i < rows.length; i += CHUNK) {
    const chunk = rows.slice(i, i + CHUNK);

    if (kind === 'customers') {
      const data = chunk.map((r) => r.data as CustomerImportRow);
      const codes = data.map((d) => d.code).filter(Boolean) as string[];
      const phones = data.filter((d) => !d.code).map((d) => d.phone);
      const existing = await prisma.customer.findMany({
        where: { OR: [{ code: { in: codes } }, { phone: { in: phones } }] },
        select: { id: true, code: true, phone: true },
      });
      const byCode = new Map(existing.map((c) => [c.code.toLowerCase(), c.id]));
      const byPhone = new Map(existing.map((c) => [c.phone, c.id]));
      for (const r of chunk) {
        const d = r.data as CustomerImportRow;
        // Có mã thì khớp theo mã; không có mã thì khớp theo số điện thoại để khỏi tạo khách trùng
        const id = d.code ? byCode.get(d.code.toLowerCase()) : byPhone.get(d.phone);
        try {
          if (id && mode === 'skip') { out.skipped++; continue; }
          await saveCustomer(id ?? null, d);
          if (id) out.updated++; else out.created++;
        } catch (e) {
          out.failed.push({ row: r.row, message: e instanceof Error ? e.message : String(e) });
        }
      }
    } else {
      const data = chunk.map((r) => r.data as SparePartImportRow);
      const existing = await prisma.inventoryItem.findMany({
        where: { itemCode: { in: data.map((d) => d.itemCode) } },
        select: { id: true, itemCode: true },
      });
      const byCode = new Map(existing.map((c) => [c.itemCode.toLowerCase(), c.id]));
      for (const r of chunk) {
        const d = r.data as SparePartImportRow;
        const id = byCode.get(d.itemCode.toLowerCase());
        try {
          if (id && mode === 'skip') { out.skipped++; continue; }
          await saveSparePart(id ?? null, d);
          if (id) out.updated++; else out.created++;
        } catch (e) {
          out.failed.push({ row: r.row, message: e instanceof Error ? e.message : String(e) });
        }
      }
    }
  }
  return out;
}
