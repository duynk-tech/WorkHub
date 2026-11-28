import type { Prisma, RecordSource } from '@prisma/client';
import { prisma } from '@/lib/prisma';

type AuditClient = { auditLog: { create: (args: { data: Prisma.AuditLogUncheckedCreateInput }) => Promise<unknown> } };

export interface AuditEntry {
  actorId?: number | null;
  entityType: string;
  entityId?: string | number | null;
  action: string;
  diff?: unknown;
  source?: RecordSource;
  ip?: string | null;
  userAgent?: string | null;
}

/**
 * Ghi một dòng nhật ký thao tác. Truyền `tx` khi đang trong transaction để nhật ký
 * rollback cùng thay đổi; không truyền thì ghi bằng client mặc định.
 */
export function writeAudit(entry: AuditEntry, db: AuditClient = prisma) {
  return db.auditLog.create({
    data: {
      actorId: entry.actorId ?? null,
      entityType: entry.entityType,
      entityId: entry.entityId === null || entry.entityId === undefined ? null : String(entry.entityId),
      action: entry.action,
      diffJson: entry.diff === undefined ? undefined : (JSON.parse(JSON.stringify(entry.diff)) as Prisma.InputJsonValue),
      ...(entry.source ? { source: entry.source } : {}),
      ...(entry.ip ? { ip: entry.ip.slice(0, 64) } : {}),
      ...(entry.userAgent ? { userAgent: entry.userAgent.slice(0, 255) } : {}),
    },
  });
}

const normalize = (v: unknown) => {
  if (v === undefined || v === '') return null;
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (typeof v === 'object' && v !== null && 'toString' in v && (v as { constructor?: { name?: string } }).constructor?.name === 'Decimal') return Number(String(v));
  return v;
};

/**
 * Các trường đã đổi giữa hai bản ghi: { field: { from, to } }. Ngày so theo ngày,
 * Decimal so theo số — để lịch sử chỉ hiện thay đổi thật, không hiện "0.00 → 0".
 */
export function diffFields<T extends Record<string, unknown>>(before: Partial<T> | null | undefined, after: Partial<T> | null | undefined, keys: readonly (keyof T & string)[]) {
  const out: Record<string, { from: unknown; to: unknown }> = {};
  for (const k of keys) {
    const a = normalize(before?.[k]);
    const b = normalize(after?.[k]);
    if (JSON.stringify(a) !== JSON.stringify(b)) out[k] = { from: a, to: b };
  }
  return out;
}
