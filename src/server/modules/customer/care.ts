import { prisma } from '@/lib/prisma';

/**
 * Danh sách máy cần chăm sóc khách hàng.
 *
 * Gom ba loại việc mà nhân viên CSKH phải gọi khách:
 *  - Bảo hành sắp hết: còn kịp mời gia hạn hoặc bán hợp đồng dịch vụ
 *  - Bảo hành vừa hết: những ca đã lỡ, còn cứu được nếu gọi sớm
 *  - Đến hạn bảo dưỡng: hẹn lịch kỹ thuật viên xuống
 *
 * Kết quả gom theo KHÁCH chứ không theo máy: một cuộc gọi xử lý được nhiều máy
 * của cùng khách, gọi rời từng máy là làm phiền khách và tốn công.
 */

export type CareReason = 'WARRANTY_SOON' | 'WARRANTY_JUST_EXPIRED' | 'PM_DUE' | 'PM_OVERDUE';

export const CARE_REASONS: Record<CareReason, { label: string; color: string; bg: string }> = {
  PM_OVERDUE: { label: 'Quá hạn bảo dưỡng', color: '#b91c1c', bg: '#fee2e2' },
  WARRANTY_JUST_EXPIRED: { label: 'Bảo hành vừa hết', color: '#c2410c', bg: '#ffedd5' },
  WARRANTY_SOON: { label: 'Sắp hết bảo hành', color: '#b45309', bg: '#fef3c7' },
  PM_DUE: { label: 'Đến hạn bảo dưỡng', color: '#0369a1', bg: '#e0f2fe' },
};

export interface CareMachine {
  id: number;
  machineCode: string;
  name: string;
  serialNumber: string;
  locationName: string | null;
  ownershipType: string;
  status: string;
  warrantyExpiresAt: string | null;
  nextPmDate: string | null;
  reasons: CareReason[];
  /** Số ngày tới mốc gần nhất; âm nghĩa là đã quá hạn. */
  daysLeft: number;
}

export interface CareCustomer {
  customerId: number;
  code: string | null;
  name: string;
  phone: string | null;
  machines: CareMachine[];
  /** Số ngày của máy gấp nhất, dùng để xếp khách nào gọi trước. */
  soonestDays: number;
}

const DAY = 24 * 60 * 60 * 1000;

/** Số ngày từ hôm nay tới mốc; âm là đã qua. Tính theo ngày địa phương. */
export function daysUntil(date: Date | null, today = new Date()): number | null {
  if (!date) return null;
  const a = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
  const b = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
  return Math.round((b - a) / DAY);
}

/**
 * Xác định máy có cần chăm sóc không và vì lý do gì.
 * `within` là cửa sổ nhìn tới trước; `graceDays` là khoảng nhìn lại quá khứ cho
 * các mốc vừa lỡ.
 */
export function classifyMachine(
  m: { warrantyExpiresAt: Date | null; nextPmDate: Date | null },
  within: number,
  graceDays: number,
  today = new Date(),
): { reasons: CareReason[]; daysLeft: number } | null {
  const reasons: CareReason[] = [];
  const marks: number[] = [];

  const w = daysUntil(m.warrantyExpiresAt, today);
  if (w !== null) {
    if (w >= 0 && w <= within) { reasons.push('WARRANTY_SOON'); marks.push(w); }
    else if (w < 0 && w >= -graceDays) { reasons.push('WARRANTY_JUST_EXPIRED'); marks.push(w); }
  }

  const pm = daysUntil(m.nextPmDate, today);
  if (pm !== null) {
    if (pm >= 0 && pm <= within) { reasons.push('PM_DUE'); marks.push(pm); }
    else if (pm < 0) { reasons.push('PM_OVERDUE'); marks.push(pm); }
  }

  if (reasons.length === 0) return null;
  return { reasons, daysLeft: Math.min(...marks) };
}

export async function getCustomerCareList(options: { within?: number; graceDays?: number } = {}) {
  const within = Math.min(365, Math.max(1, Number(options.within) || 30));
  const graceDays = Math.max(0, Number(options.graceDays ?? 30));
  const today = new Date();

  const machines = await prisma.fnbEquipment.findMany({
    where: {
      customerId: { not: null },
      // Máy đã thanh lý thì không còn gì để chăm sóc
      status: { not: 'LIQUIDATED' },
      OR: [{ warrantyExpiresAt: { not: null } }, { nextPmDate: { not: null } }],
    },
    select: {
      id: true, machineCode: true, name: true, serialNumber: true,
      ownershipType: true, status: true, warrantyExpiresAt: true, nextPmDate: true,
      location: { select: { name: true } },
      customer: { select: { id: true, code: true, name: true, phone: true } },
    },
  });

  const byCustomer = new Map<number, CareCustomer>();

  for (const m of machines) {
    if (!m.customer) continue;
    const hit = classifyMachine(m, within, graceDays, today);
    if (!hit) continue;

    const row = byCustomer.get(m.customer.id) || {
      customerId: m.customer.id,
      code: m.customer.code,
      name: m.customer.name,
      phone: m.customer.phone,
      machines: [],
      soonestDays: Number.POSITIVE_INFINITY,
    };

    row.machines.push({
      id: m.id,
      machineCode: m.machineCode,
      name: m.name,
      serialNumber: m.serialNumber,
      locationName: m.location?.name ?? null,
      ownershipType: m.ownershipType,
      status: m.status,
      warrantyExpiresAt: m.warrantyExpiresAt ? m.warrantyExpiresAt.toISOString() : null,
      nextPmDate: m.nextPmDate ? m.nextPmDate.toISOString() : null,
      reasons: hit.reasons,
      daysLeft: hit.daysLeft,
    });
    row.soonestDays = Math.min(row.soonestDays, hit.daysLeft);
    byCustomer.set(m.customer.id, row);
  }

  const customers = [...byCustomer.values()];
  // Việc trễ nhất lên đầu, trong mỗi khách cũng vậy
  for (const c of customers) c.machines.sort((a, b) => a.daysLeft - b.daysLeft);
  customers.sort((a, b) => a.soonestDays - b.soonestDays);

  const all = customers.flatMap((c) => c.machines);
  const countBy = (r: CareReason) => all.filter((m) => m.reasons.includes(r)).length;

  return {
    within,
    customers,
    totals: {
      customers: customers.length,
      machines: all.length,
      warrantySoon: countBy('WARRANTY_SOON'),
      warrantyJustExpired: countBy('WARRANTY_JUST_EXPIRED'),
      pmDue: countBy('PM_DUE'),
      pmOverdue: countBy('PM_OVERDUE'),
    },
  };
}
