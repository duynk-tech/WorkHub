import { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { notify } from '@/server/modules/notify/service';
import { sendEmail, renderEmailHtml, isEmailConfigured } from '@/server/modules/notify/email';
import { getSetting } from '@/server/modules/settings/service';
import { getAppBranding } from '@/server/modules/settings/branding';
import { employeeIdsWithPermission } from '@/server/lib/permission-holders';

/**
 * Nhắc thu công nợ quá hạn — chạy mỗi sáng.
 * Không import server-only: job gọi trực tiếp dưới tsx.
 */

/** Các mốc quá hạn sẽ nhắc; sau mốc cuối thì nhắc lại mỗi 15 ngày. */
export const DEBT_REMINDER_DAYS = [1, 7, 15];

export function shouldRemindDebt(overdueDays: number): boolean {
  if (overdueDays <= 0) return false;
  if (DEBT_REMINDER_DAYS.includes(overdueDays)) return true;
  const last = DEBT_REMINDER_DAYS[DEBT_REMINDER_DAYS.length - 1];
  return overdueDays > last && (overdueDays - last) % 15 === 0;
}

const money = (n: number) => `${new Intl.NumberFormat('vi-VN').format(Math.round(n))} ₫`;

interface DueRow {
  id: number;
  orderCode: string;
  customerId: number;
  customerName: string;
  customerEmail: string | null;
  salespersonId: number | null;
  remaining: unknown;
  days: number;
}

export async function runDebtReminders(): Promise<{ orders: number; staff: number; customerEmails: number }> {
  const total = Prisma.sql`(CASE WHEN o.status = 'CANCELLED' THEN 0 ELSE COALESCE(o."totalAmount", 0) END)`;
  const remaining = Prisma.sql`GREATEST(0, ${total} - LEAST(${total}, GREATEST(0, o."returnedAmount")) - o."paidAmount")`;
  const today = Prisma.sql`(NOW() AT TIME ZONE 'Asia/Ho_Chi_Minh')::date`;

  const rows = await prisma.$queryRaw<DueRow[]>`
    SELECT o.id, o."orderCode", o."customerId", c.name AS "customerName", c.email AS "customerEmail",
           o."salespersonId",
           ${remaining} AS remaining, (${today} - o."dueDate")::int AS days
      FROM "CustomerOrder" o
      JOIN "Customer" c ON c.id = o."customerId"
     WHERE o.status <> 'CANCELLED' AND o."dueDate" IS NOT NULL
       AND o."dueDate" < ${today}
       AND ${remaining} > 0`;

  const due = rows.filter((r) => shouldRemindDebt(Number(r.days)));
  if (!due.length) return { orders: 0, staff: 0, customerEmails: 0 };

  const dateTag = new Date().toISOString().slice(0, 10);
  // Đơn chưa gán nhân viên KD thì nhắc người quản lý khách hàng
  const unassigned = due.some((r) => !r.salespersonId) ? await employeeIdsWithPermission('FEATURE_CUSTOMER_MANAGE') : [];
  let staff = 0;
  for (const r of due) {
    const recipients = r.salespersonId ? [r.salespersonId] : unassigned;
    const owner = recipients[0];
    if (!owner) continue;
    staff += await notify({
      templateCode: 'DEBT_REMINDER_STAFF',
      employeeIds: recipients,
      vars: { customer: r.customerName, amount: money(Number(r.remaining)), orderCode: r.orderCode, days: Number(r.days) },
      linkPath: `/customers/${r.customerId}?tab=debt&view=orders&order=${r.id}`,
      dedupeKey: `DEBT:${r.id}:${dateTag}`,
    });
    // Lưu vết chăm sóc để thấy trên hồ sơ khách là đã nhắc
    await prisma.customerCareActivity.create({
      data: {
        customerId: r.customerId,
        title: `Nhắc thu nợ đơn ${r.orderCode} (quá hạn ${r.days} ngày)`,
        note: `Còn nợ ${money(Number(r.remaining))}. Hệ thống tự nhắc nhân viên phụ trách.`,
        channel: 'SYSTEM',
        assigneeId: owner,
        dueAt: new Date(),
      },
    });
  }

  // Gửi khách: chỉ khi admin bật và có SMTP — gộp mọi đơn quá hạn của một khách vào một email
  let customerEmails = 0;
  if (isEmailConfigured() && (await getSetting<boolean>('sales.debtReminderEmailCustomers', false))) {
    const branding = await getAppBranding();
    const byCustomer = new Map<number, DueRow[]>();
    for (const r of due) if (r.customerEmail) byCustomer.set(r.customerId, [...(byCustomer.get(r.customerId) ?? []), r]);
    for (const list of byCustomer.values()) {
      const sum = list.reduce((s, r) => s + Number(r.remaining), 0);
      const lines = list.map((r) => `• Đơn ${r.orderCode}: ${money(Number(r.remaining))} (quá hạn ${r.days} ngày)`).join('\n');
      const res = await sendEmail({
        to: list[0].customerEmail!,
        subject: `${branding.name} — Nhắc thanh toán ${money(sum)}`,
        html: renderEmailHtml({
          appName: branding.name,
          logoUrl: branding.logoUrl,
          title: 'Thông báo công nợ đến hạn',
          body: `Kính gửi ${list[0].customerName},\n\nTheo ghi nhận của chúng tôi, các đơn hàng sau đã quá hạn thanh toán:\n${lines}\n\nTổng cộng: ${money(sum)}.\nNếu quý khách đã thanh toán, vui lòng bỏ qua email này. Xin cảm ơn!`,
          footer: `Email tự động từ ${branding.name}. Vui lòng liên hệ nhân viên phụ trách nếu cần đối soát.`,
        }),
      });
      if (res.ok) customerEmails++;
    }
  }

  return { orders: due.length, staff, customerEmails };
}
