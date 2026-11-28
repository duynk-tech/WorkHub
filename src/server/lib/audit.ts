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
