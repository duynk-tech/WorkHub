import { prisma } from '@/lib/prisma';
import { orderDebt } from '@/server/modules/customer/service';
import { computeOrderDebt } from '@/lib/customer-debt';

/**
 * Báo cáo công nợ phải thu.
 *
 * Xếp tuổi nợ theo số ngày quá hạn so với hạn thanh toán của từng đơn. Đơn chưa
 * đặt hạn thanh toán được tính là trong hạn — không suy đoán hạn thay kế toán.
 */

export interface DebtBucket {
  current: number;
  d1to30: number;
  d31to60: number;
  over60: number;
}

export interface CustomerDebtRow {
  customerId: number;
  code: string | null;
  name: string;
  phone: string | null;
  orderCount: number;
  totalBilled: number;
  totalPaid: number;
  outstanding: number;
  overdue: number;
  oldestDueDate: string | null;
  maxOverdueDays: number;
  buckets: DebtBucket;
}

/** Số ngày quá hạn tính đến hôm nay (giờ Việt Nam); chưa tới hạn hoặc không có hạn trả về 0. */
export function overdueDays(dueDate: Date | null, today = new Date()): number {
  if (!dueDate) return 0;
  return computeOrderDebt({ totalAmount: 1, dueDate }, today).overdueDays;
}

/** Xếp một khoản nợ vào ô tuổi nợ tương ứng. */
export function bucketOf(days: number): keyof DebtBucket {
  if (days <= 0) return 'current';
  if (days <= 30) return 'd1to30';
  if (days <= 60) return 'd31to60';
  return 'over60';
}

export async function customerDebtReport(options: { onlyOutstanding?: boolean } = {}) {
  const orders = await prisma.customerOrder.findMany({
    where: { status: { not: 'CANCELLED' } },
    select: {
      customerId: true,
      totalAmount: true,
      paidAmount: true,
      returnedAmount: true,
      dueDate: true,
      status: true,
      customer: { select: { id: true, code: true, name: true, phone: true } },
    },
  });

  const byCustomer = new Map<number, CustomerDebtRow>();

  for (const o of orders) {
    if (!o.customer) continue;

    const row =
      byCustomer.get(o.customerId) ||
      {
        customerId: o.customerId,
        code: o.customer.code,
        name: o.customer.name,
        phone: o.customer.phone,
        orderCount: 0,
        totalBilled: 0,
        totalPaid: 0,
        outstanding: 0,
        overdue: 0,
        oldestDueDate: null,
        maxOverdueDays: 0,
        buckets: { current: 0, d1to30: 0, d31to60: 0, over60: 0 },
      };

    const d = orderDebt(o);
    row.orderCount += 1;
    row.totalBilled += d.total;
    row.totalPaid += Math.min(d.paid, d.total);
    row.outstanding += d.remaining;

    if (d.remaining > 0) {
      const days = overdueDays(d.dueDate);
      row.buckets[bucketOf(days)] += d.remaining;
      if (days > 0) {
        row.overdue += d.remaining;
        row.maxOverdueDays = Math.max(row.maxOverdueDays, days);
        const iso = d.dueDate ? d.dueDate.toISOString().slice(0, 10) : null;
        if (iso && (!row.oldestDueDate || iso < row.oldestDueDate)) row.oldestDueDate = iso;
      }
    }

    byCustomer.set(o.customerId, row);
  }

  let rows = [...byCustomer.values()];
  if (options.onlyOutstanding !== false) rows = rows.filter((r) => r.outstanding > 0);
  rows.sort((a, b) => b.outstanding - a.outstanding);

  const totals = rows.reduce(
    (acc, r) => ({
      totalBilled: acc.totalBilled + r.totalBilled,
      totalPaid: acc.totalPaid + r.totalPaid,
      outstanding: acc.outstanding + r.outstanding,
      overdue: acc.overdue + r.overdue,
      buckets: {
        current: acc.buckets.current + r.buckets.current,
        d1to30: acc.buckets.d1to30 + r.buckets.d1to30,
        d31to60: acc.buckets.d31to60 + r.buckets.d31to60,
        over60: acc.buckets.over60 + r.buckets.over60,
      },
    }),
    {
      totalBilled: 0,
      totalPaid: 0,
      outstanding: 0,
      overdue: 0,
      buckets: { current: 0, d1to30: 0, d31to60: 0, over60: 0 } as DebtBucket,
    },
  );

  return { rows, totals, customerCount: rows.length };
}
