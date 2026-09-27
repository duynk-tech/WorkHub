import Link from 'next/link';
import {
  ListChecks, AlertTriangle, CheckSquare, CalendarDays, Clock, Users,
  ArrowRight, CircleDot, Plane, ShoppingCart, Wallet, FileText, Truck,
  PackageSearch, ClipboardCheck, Wrench, TimerReset, Boxes, Briefcase,
  ShieldCheck, Utensils, Warehouse, TrendingUp,
} from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireAuth, can } from '@/server/auth/context';
import { visibleEmployeeIds } from '@/server/auth/scope';
import { customerDebtReport } from '@/server/modules/report/customer-debt';
import { getCustomerCareList, CARE_REASONS } from '@/server/modules/customer/care';
import { ORDER_STATUSES as CUSTOMER_ORDER_STATUSES } from '@/server/modules/customer/types';
import { ORDER_STATUSES as PO_STATUSES, TRANSACTION_TYPES } from '@/server/modules/spare-parts/types';
import { TICKET_STATUSES, TICKET_PRIORITIES } from '@/server/modules/equipment/types';
import { MonthlyBars, type ChartSeries } from '@/components/domain/dashboard-charts';
import { Card, CardHeader, CardTitle, CardBody, StatCard, Badge, Avatar, EmptyState, Progress, PageHeader } from '@/components/ui';
import { fmtDate } from '@/lib/date';
import { formatDays } from '@/lib/utils';
import { TaskStatusBadge, TaskPriorityBadge } from '@/components/domain/task-badges';

export const metadata = { title: 'Tổng quan' };
export const dynamic = 'force-dynamic';

const money = (n: number) => `${new Intl.NumberFormat('vi-VN').format(Math.round(n || 0))} ₫`;

/**
 * Thẻ danh sách dùng chung cho mọi tab: tiêu đề, phụ đề, link "Xem tất cả" và
 * phần rỗng. Gom lại một chỗ để các tab cao thấp bằng nhau và sửa một lần ăn hết.
 */
function ListCard({
  title, subtitle, href, count, empty, children,
}: {
  title: string;
  subtitle?: React.ReactNode;
  href?: string;
  /** Số dòng thực sự vẽ ra; 0 thì hiện phần rỗng. */
  count: number;
  empty: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <Card style={{ display: 'flex', flexDirection: 'column' }}>
      <CardHeader>
        <div style={{ minWidth: 0 }}>
          <CardTitle>{title}</CardTitle>
          {subtitle && <div className="card-subtitle">{subtitle}</div>}
        </div>
        {href && <Link href={href} className="btn btn-ghost btn-sm">Xem tất cả <ArrowRight /></Link>}
      </CardHeader>
      <CardBody
        style={
          count
            ? { flex: 1, padding: '6px 8px' }
            // Thẻ rỗng bị kéo cao bằng cột bên cạnh, canh giữa cho đỡ trống trên đầu
            : { flex: 1, display: 'grid', placeItems: 'center' }
        }
      >
        {count === 0 ? empty : <div style={{ display: 'flex', flexDirection: 'column' }}>{children}</div>}
      </CardBody>
    </Card>
  );
}

/**
 * Khung 6 tháng gần nhất, tính cả tháng hiện tại.
 *
 * Trả sẵn đủ 6 ô kể cả tháng không phát sinh: biểu đồ phải thấy được khoảng trống
 * chứ không co lại thành 2 cột rồi tưởng là đều.
 */
function lastMonths(count = 6, today = new Date()) {
  const months: { key: string; label: string; from: Date; to: Date }[] = [];
  for (let i = count - 1; i >= 0; i -= 1) {
    const from = new Date(today.getFullYear(), today.getMonth() - i, 1);
    const to = new Date(today.getFullYear(), today.getMonth() - i + 1, 1);
    months.push({
      key: `${from.getFullYear()}-${String(from.getMonth() + 1).padStart(2, '0')}`,
      label: `T${from.getMonth() + 1}`,
      from,
      to,
    });
  }
  return months;
}

/** Khóa tháng của một mốc thời gian, theo giờ địa phương. */
const monthKey = (d: Date | string | null) => {
  if (!d) return null;
  const v = new Date(d);
  return `${v.getFullYear()}-${String(v.getMonth() + 1).padStart(2, '0')}`;
};

/**
 * Thẻ biểu đồ cột theo tháng. Khung thẻ dựng ở server, phần vẽ giao cho client.
 * Kỳ nào cũng trả đủ 6 tháng, nhưng toàn số 0 thì vẽ ra một biểu đồ phẳng vô
 * nghĩa — thà nói thẳng là chưa có dữ liệu.
 */
function MonthlyChartCard({
  title, subtitle, data, series, asMoney, emptyText = 'Chưa có dữ liệu trong kỳ',
}: {
  title: string;
  subtitle?: string;
  data: Record<string, number | string>[];
  series: ChartSeries[];
  asMoney?: boolean;
  emptyText?: string;
}) {
  const hasData = data.some((row) => series.some((s) => Number(row[s.key] || 0) !== 0));
  return (
    <Card>
      <CardHeader>
        <div style={{ minWidth: 0 }}>
          <CardTitle>{title}</CardTitle>
          {subtitle && <div className="card-subtitle">{subtitle}</div>}
        </div>
      </CardHeader>
      <CardBody>
        {hasData
          ? <MonthlyBars data={data} series={series} asMoney={asMoney} />
          : <EmptyState icon={<TrendingUp size={20} />} title={emptyText} />}
      </CardBody>
    </Card>
  );
}

/** Nhãn trạng thái lấy thẳng màu từ bảng cấu hình của từng module. */
function StatusChip({
  cfg, fallback,
}: {
  cfg?: { label: string; color: string; bg: string };
  fallback?: string;
}) {
  if (!cfg) return fallback ? <Badge tone="outline">{fallback}</Badge> : null;
  return <Badge style={{ background: cfg.bg, color: cfg.color }}>{cfg.label}</Badge>;
}

/** Số liệu bán hàng: đơn chưa xong, báo giá đang chờ khách chốt và công nợ phải thu. */
async function loadSalesSummary() {
  const months = lastMonths(6);

  const [
    openOrders, awaitingStock, quotations, debt, care, openOrderList, quotationList, monthlyOrders,
  ] = await Promise.all([
    prisma.customerOrder.count({ where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
    prisma.customerOrder.count({ where: { status: { in: ['AWAITING_STOCK', 'READY_TO_DELIVER'] } } }),
    prisma.customerQuotation.count({ where: { status: { in: ['DRAFT', 'SENT'] } } }),
    customerDebtReport(),
    // Cửa sổ 30 ngày giống mặc định của tab "Bảo hành, bảo dưỡng" bên màn khách hàng
    getCustomerCareList({ within: 30 }),
    prisma.customerOrder.findMany({
      where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } },
      select: {
        id: true, orderCode: true, status: true, orderType: true, orderDate: true, dueDate: true,
        totalAmount: true, goodsAmount: true, paidAmount: true,
        customer: { select: { id: true, name: true } },
      },
      orderBy: { orderDate: 'desc' },
      take: 6,
    }),
    prisma.customerQuotation.findMany({
      where: { status: { in: ['DRAFT', 'SENT'] } },
      select: {
        id: true, quoteCode: true, status: true, totalAmount: true, validUntil: true,
        customer: { select: { id: true, name: true } },
      },
      orderBy: { createdAt: 'desc' },
      take: 5,
    }),
    prisma.customerOrder.findMany({
      where: { status: { not: 'CANCELLED' }, orderDate: { gte: months[0].from } },
      select: { orderDate: true, totalAmount: true, goodsAmount: true, paidAmount: true },
    }),
  ]);

  // Gom theo tháng tại chỗ: dữ liệu một đơn vị trong 6 tháng là vài trăm dòng,
  // không đáng để viết raw SQL group by rồi phải tự lo múi giờ
  const revenueByMonth = months.map((m) => ({ label: m.label, billed: 0, collected: 0 }));
  for (const o of monthlyOrders) {
    const idx = months.findIndex((m) => m.key === monthKey(o.orderDate));
    if (idx < 0) continue;
    revenueByMonth[idx].billed += Number(o.totalAmount ?? o.goodsAmount ?? 0);
    revenueByMonth[idx].collected += Number(o.paidAmount || 0);
  }

  return {
    openOrders,
    awaitingStock,
    quotations,
    outstanding: debt.totals.outstanding,
    overdue: debt.totals.overdue,
    debtors: debt.customerCount,
    careCustomers: care.totals.customers,
    careMachines: care.totals.machines,
    // Khách gấp nhất lên đầu; danh sách đầy đủ nằm ở màn Khách hàng
    careList: care.customers.slice(0, 6),
    openOrderList,
    quotationList,
    revenueByMonth,
    // Nợ nhiều nhất lên đầu, chỉ lấy khách còn dư nợ thật
    debtList: debt.rows.slice(0, 5),
  };
}

/** Số liệu kho: hàng đang trên đường về, mã dưới mức an toàn và phiếu chờ duyệt. */
async function loadStockSummary() {
  const months = lastMonths(6);

  const [
    incoming, pendingApproval, items, machines, incomingList, recentDocs, monthlyDocs,
  ] = await Promise.all([
    prisma.sparePartOrder.count({
      where: { status: { notIn: ['STOCKED', 'COMPLETED', 'CANCELLED'] } },
    }),
    prisma.inventoryTransaction.count({ where: { status: 'PENDING_APPROVAL' } }),
    prisma.inventoryItem.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true, itemCode: true, name: true, unit: true,
        minStockAlert: true, avgCost: true, costPrice: true,
        stocks: { select: { quantity: true } },
      },
    }),
    prisma.fnbEquipment.count({ where: { status: { not: 'LIQUIDATED' } } }),
    prisma.sparePartOrder.findMany({
      where: { status: { notIn: ['STOCKED', 'COMPLETED', 'CANCELLED'] } },
      select: {
        id: true, orderCode: true, supplier: true, status: true,
        totalVnd: true, paidAmount: true, etaDate: true, totalItemsQty: true,
      },
      orderBy: { createdAt: 'desc' },
      take: 6,
    }),
    prisma.inventoryTransaction.findMany({
      select: {
        id: true, transCode: true, type: true, status: true,
        transDate: true, totalValue: true, partnerName: true,
      },
      orderBy: { transDate: 'desc' },
      take: 6,
    }),
    prisma.inventoryTransaction.findMany({
      where: { status: 'COMPLETED', transDate: { gte: months[0].from } },
      select: { transDate: true, type: true, totalValue: true },
    }),
  ]);

  const flowByMonth = months.map((m) => ({ label: m.label, in: 0, out: 0 }));
  for (const t of monthlyDocs) {
    const idx = months.findIndex((m) => m.key === monthKey(t.transDate));
    if (idx < 0) continue;
    // Điều chuyển không làm thay đổi tổng tồn nên không tính vào nhập hay xuất
    if (t.type === 'IN') flowByMonth[idx].in += Number(t.totalValue || 0);
    else if (t.type === 'OUT') flowByMonth[idx].out += Number(t.totalValue || 0);
  }

  // Mức an toàn so trên tổng tồn của tất cả kho, giống cách màn hình phụ tùng cảnh báo
  const lowStock = items.filter((i) => {
    const onHand = i.stocks.reduce((sum, st) => sum + Number(st.quantity || 0), 0);
    return onHand < Number(i.minStockAlert || 0);
  }).length;

  // Giá trị tồn tính theo giá vốn bình quân, rơi về giá vốn danh mục khi chưa có lần nhập nào
  const stockValue = items.reduce((sum, i) => {
    const onHand = i.stocks.reduce((q, st) => q + Number(st.quantity || 0), 0);
    return sum + onHand * (Number(i.avgCost || 0) || Number(i.costPrice || 0));
  }, 0);
  const skuCount = items.length;

  // Thiếu nhiều nhất so với mức an toàn thì lên đầu, đó là mã phải đặt trước
  const lowStockList = items
    .map((i) => {
      const onHand = i.stocks.reduce((q, st) => q + Number(st.quantity || 0), 0);
      return { ...i, onHand, min: Number(i.minStockAlert || 0), gap: Number(i.minStockAlert || 0) - onHand };
    })
    .filter((i) => i.gap > 0)
    .sort((a, b) => b.gap - a.gap)
    .slice(0, 6)
    .map((i) => ({ id: i.id, itemCode: i.itemCode, name: i.name, unit: i.unit, onHand: i.onHand, min: i.min }));

  return {
    incoming, pendingApproval, lowStock, stockValue, skuCount, machines,
    incomingList, recentDocs, lowStockList, flowByMonth,
  };
}

/** Số liệu dịch vụ: phiếu sự cố đang mở và phần đã trễ cam kết SLA. */
async function loadServiceSummary() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const ticketCard = {
    id: true, ticketCode: true, title: true, status: true, priority: true,
    slaDeadline: true, resolvedAt: true,
    equipment: { select: { id: true, machineCode: true, name: true } },
    customer: { select: { id: true, name: true } },
    assignedTo: { select: { id: true, fullName: true, avatarUrl: true } },
  } as const;

  const months = lastMonths(6, now);

  const [
    open, inProgress, overdueSla, resolvedThisMonth, openList, resolvedList, monthlyTickets,
  ] = await Promise.all([
    prisma.serviceTicket.count({ where: { status: { in: ['OPEN', 'ASSIGNED'] } } }),
    prisma.serviceTicket.count({ where: { status: 'IN_PROGRESS' } }),
    prisma.serviceTicket.count({
      where: { status: { notIn: ['RESOLVED', 'CLOSED'] }, slaDeadline: { lt: now } },
    }),
    prisma.serviceTicket.count({
      where: { status: { in: ['RESOLVED', 'CLOSED'] }, resolvedAt: { gte: monthStart } },
    }),
    prisma.serviceTicket.findMany({
      where: { status: { notIn: ['RESOLVED', 'CLOSED'] } },
      select: ticketCard,
      // Phiếu trễ hạn nhất lên đầu: slaDeadline nhỏ nhất là ca gấp nhất
      orderBy: [{ slaDeadline: 'asc' }, { createdAt: 'desc' }],
      take: 6,
    }),
    prisma.serviceTicket.findMany({
      where: { status: { in: ['RESOLVED', 'CLOSED'] }, resolvedAt: { gte: monthStart } },
      select: ticketCard,
      orderBy: { resolvedAt: 'desc' },
      take: 5,
    }),
    prisma.serviceTicket.findMany({
      where: {
        OR: [{ createdAt: { gte: months[0].from } }, { resolvedAt: { gte: months[0].from } }],
      },
      select: { createdAt: true, resolvedAt: true },
    }),
  ]);

  // Một phiếu có thể rơi vào hai tháng khác nhau: mở tháng này, xong tháng sau.
  // Đếm riêng từng mốc mới thấy được tháng nào nhận nhiều hơn xử lý được.
  const ticketsByMonth = months.map((m) => ({ label: m.label, opened: 0, resolved: 0 }));
  for (const t of monthlyTickets) {
    const oi = months.findIndex((m) => m.key === monthKey(t.createdAt));
    if (oi >= 0) ticketsByMonth[oi].opened += 1;
    const ri = months.findIndex((m) => m.key === monthKey(t.resolvedAt));
    if (ri >= 0) ticketsByMonth[ri].resolved += 1;
  }

  return {
    open, inProgress, overdueSla, resolvedThisMonth, openList, resolvedList, now, ticketsByMonth,
  };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string }>;
}) {
  const ctx = await requireAuth();
  const sp = await searchParams;
  const scopeIds = await visibleEmployeeIds(ctx);
  const scopeWhere = scopeIds === null ? {} : { in: scopeIds };
  const today = new Date();
  const todayStart = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const year = today.getFullYear();

  // Mỗi đơn vị chỉ triển khai một phần tính năng, nên chỉ hiện tab của phần họ dùng
  const tabs = [
    can(ctx, 'FEATURE_CUSTOMER_MANAGE') || ctx.isAdmin
      ? { key: 'sales', label: 'Kinh doanh', hint: 'Đơn hàng, báo giá và tiền còn phải thu của khách', icon: Briefcase }
      : null,
    can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') || ctx.isAdmin
      ? { key: 'stock', label: 'Kho & Mua hàng', hint: 'Hàng đang về, tồn dưới mức an toàn và phiếu chờ duyệt', icon: Boxes }
      : null,
    can(ctx, 'FEATURE_EQUIPMENT_MAINTENANCE') || can(ctx, 'FEATURE_EQUIPMENT_MANAGE') || ctx.isAdmin
      ? { key: 'service', label: 'Dịch vụ & Sửa chữa', hint: 'Phiếu sự cố đang xử lý và phần đã trễ cam kết', icon: Wrench }
      : null,
    // Việc và phép của chính mình thì ai cũng xem được
    { key: 'work', label: 'Công việc & Nhân sự', hint: 'Việc được giao, đơn chờ bạn duyệt và tình hình nghỉ phép', icon: Users },
  ].filter((t): t is NonNullable<typeof t> => t !== null);

  const tab = tabs.some((t) => t.key === sp.tab) ? sp.tab! : tabs[0].key;
  const active = tabs.find((t) => t.key === tab)!;

  // Chỉ truy vấn số liệu của tab đang mở
  const [sales, stock, service] = await Promise.all([
    tab === 'sales' ? loadSalesSummary() : Promise.resolve(null),
    tab === 'stock' ? loadStockSummary() : Promise.resolve(null),
    tab === 'service' ? loadServiceSummary() : Promise.resolve(null),
  ]);

  const showWork = tab === 'work';

  const [myOpenTasks, myOverdue, pendingApprovals, balance, onLeaveToday, myTasks, teamTaskStats, upcomingLeaves] =
    showWork
      ? await Promise.all([
      prisma.task.count({ where: { assigneeId: ctx.employeeId, status: { in: ['TODO', 'IN_PROGRESS', 'REVIEW'] } } }),
      prisma.task.count({
        where: { assigneeId: ctx.employeeId, status: { in: ['TODO', 'IN_PROGRESS', 'REVIEW'] }, dueDate: { lt: new Date() } },
      }),
      prisma.approvalTask.count({ where: { approverId: ctx.employeeId, status: 'PENDING' } }),
      prisma.leaveBalance.findUnique({ where: { employeeId_year: { employeeId: ctx.employeeId, year } } }),
      prisma.leaveRequestDay.findMany({
        where: {
          date: todayStart,
          request: { status: 'APPROVED', ...(scopeIds ? { employeeId: { in: scopeIds } } : {}) },
        },
        include: {
          request: {
            select: {
              id: true, code: true, employee: { select: { fullName: true, avatarUrl: true, department: { select: { name: true } } } },
              leaveType: { select: { name: true, color: true } },
            },
          },
        },
        take: 8,
      }),
      prisma.task.findMany({
        where: { assigneeId: ctx.employeeId, status: { in: ['TODO', 'IN_PROGRESS', 'REVIEW'] } },
        orderBy: [{ dueDate: 'asc' }, { priority: 'desc' }],
        take: 6,
        select: { id: true, code: true, title: true, status: true, priority: true, dueDate: true, progress: true },
      }),
      prisma.task.groupBy({
        by: ['status'],
        where: scopeIds === null ? {} : { assigneeId: scopeWhere },
        _count: { _all: true },
      }),
      prisma.leaveRequest.findMany({
        where: {
          status: 'APPROVED',
          startDate: { gte: todayStart },
          ...(scopeIds ? { employeeId: { in: scopeIds } } : {}),
        },
        orderBy: { startDate: 'asc' },
        take: 5,
        select: {
          id: true, code: true, startDate: true, endDate: true, totalDays: true,
          employee: { select: { fullName: true, avatarUrl: true } },
          leaveType: { select: { name: true, color: true } },
        },
      }),
    ])
      : [0, 0, 0, null, [], [], [], []] as const;

  const remaining = balance
    ? Number(balance.standardDays) + Number(balance.bonusDays) + Number(balance.carriedOverDays) - Number(balance.usedDays)
    : 0;
  const statusCount = (s: string) => teamTaskStats.find((t) => t.status === s)?._count._all ?? 0;
  const totalTeamTasks = teamTaskStats.reduce((sum, t) => sum + t._count._all, 0);

  const hour = today.getHours();
  const greeting = hour < 11 ? 'Chào buổi sáng' : hour < 14 ? 'Chào buổi trưa' : hour < 18 ? 'Chào buổi chiều' : 'Chào buổi tối';
  const displayName =
    ctx.username.toLowerCase() === 'admin' || ctx.fullName.toLowerCase().includes('quản trị')
      ? ctx.username
      : ctx.fullName.trim().split(/\s+/).slice(-1)[0] || ctx.username;

  return (
    <div className="stack">
      <PageHeader
        title={`${greeting}, ${displayName}!`}
        description={`Hôm nay là ${fmtDate(today, "EEEE, 'ngày' dd/MM/yyyy")}${ctx.departmentName ? ` · ${ctx.departmentName}` : ''}`}
      />

      {tabs.length > 1 && (
        <div className="tabs" data-tour="dashboard-tabs">
          {tabs.map((t) => (
            <Link key={t.key} href={`/dashboard?tab=${t.key}`} className="tab" data-active={tab === t.key}>
              <t.icon size={13} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />
              {t.label}
            </Link>
          ))}
        </div>
      )}

      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -4 }}>{active.hint}</div>

      {sales && (
        <>
          <div className="grid-stats" data-tour="dashboard-kpi">
            <StatCard
              href="/customers" label="Đơn hàng chưa hoàn tất" value={sales.openOrders} icon={<ShoppingCart size={16} />}
              hint={sales.awaitingStock > 0 ? `${sales.awaitingStock} đơn đang chờ hàng hoặc chờ giao` : 'Không có đơn nào tồn đọng'}
            />
            <StatCard
              href="/customers" label="Báo giá chờ khách chốt" value={sales.quotations} icon={<FileText size={16} />}
              hint={sales.quotations > 0 ? 'Nên gọi lại để chốt' : 'Đã xử lý hết'}
            />
            <StatCard
              href="/reports" label="Còn phải thu" value={money(sales.outstanding)} icon={<Wallet size={16} />}
              hint={sales.debtors > 0 ? `${sales.debtors} khách còn nợ` : 'Không có công nợ'}
            />
            <StatCard
              href="/reports" label="Nợ đã quá hạn" value={money(sales.overdue)} icon={<AlertTriangle size={16} />}
              tone={sales.overdue > 0 ? 'var(--danger)' : undefined}
              hint={sales.overdue > 0 ? 'Cần nhắc khách thanh toán' : 'Không có khoản nào trễ hạn'}
            />
          </div>

          <MonthlyChartCard
            title="Doanh thu 6 tháng gần nhất"
            subtitle="Giá trị đơn đã ghi nhận so với tiền thực thu, không tính đơn đã hủy"
            data={sales.revenueByMonth}
            series={[
              { key: 'billed', name: 'Giá trị đơn', color: '#2447eb' },
              { key: 'collected', name: 'Đã thu', color: '#0f9960' },
            ]}
            asMoney
          />

          <div className="grid-2">
            <ListCard
              title="Đơn hàng"
              subtitle={`${sales.openOrders} đơn chưa hoàn tất`}
              href="/customers"
              empty={<EmptyState icon={<ShoppingCart size={20} />} title="Không có đơn nào đang chạy" description="Mọi đơn hàng đã hoàn tất hoặc đã hủy." />}
              count={sales.openOrderList.length}
            >
              {sales.openOrderList.map((o) => {
                const total = Number(o.totalAmount ?? o.goodsAmount ?? 0);
                const left = Math.max(0, total - Number(o.paidAmount || 0));
                return (
                  <Link key={o.id} href={`/customers/${o.customer.id}`} className="list-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row" style={{ gap: 7, marginBottom: 3 }}>
                        <span className="mono-code">{o.orderCode}</span>
                        <StatusChip cfg={CUSTOMER_ORDER_STATUSES[o.status]} fallback={o.status} />
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 540, color: 'var(--text-strong)' }} className="truncate-2">
                        {o.customer.name}
                      </div>
                      <div className="hint" style={{ marginTop: 4 }}>
                        {fmtDate(o.orderDate)}
                        {left > 0 ? ` · còn thu ${money(left)}` : ' · đã thu đủ'}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', whiteSpace: 'nowrap' }}>
                      {money(total)}
                    </div>
                  </Link>
                );
              })}
            </ListCard>

            <div className="stack">
              <ListCard
                title="Khách hàng tới hạn bảo hành"
                subtitle={
                  sales.careCustomers > 0
                    ? `${sales.careCustomers} khách · ${sales.careMachines} máy tới hạn trong 30 ngày`
                    : 'Cửa sổ 30 ngày'
                }
                href="/customers?within=30"
                count={sales.careList.length}
                empty={<EmptyState icon={<ShieldCheck size={20} />} title="Không có khách nào tới hạn" description="Trong 30 ngày tới không có máy nào hết bảo hành hay đến kỳ bảo dưỡng." />}
              >
                {sales.careList.map((c) => {
                  const late = c.soonestDays < 0;
                  // Gom lý do của mọi máy để một dòng nói đủ việc phải làm khi gọi
                  const reasons = [...new Set(c.machines.flatMap((m) => m.reasons))];
                  return (
                    <Link key={c.customerId} href={`/customers/${c.customerId}`} className="list-row">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row" style={{ gap: 7, marginBottom: 3 }}>
                          {c.code && <span className="mono-code">{c.code}</span>}
                          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{c.phone || '—'}</span>
                        </div>
                        <div style={{ fontSize: 13.5, fontWeight: 540, color: 'var(--text-strong)' }} className="truncate-2">
                          {c.name}
                        </div>
                        <div className="row" style={{ gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                          {reasons.map((r) => (
                            <StatusChip key={r} cfg={CARE_REASONS[r]} />
                          ))}
                          <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{c.machines.length} máy</span>
                        </div>
                      </div>
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        <div style={{
                          fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap',
                          color: late ? 'var(--danger)' : 'var(--warning)',
                        }}>
                          {late ? `Trễ ${Math.abs(c.soonestDays)} ngày` : `Còn ${c.soonestDays} ngày`}
                        </div>
                        <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>
                          {c.machines[0]?.machineCode}
                        </div>
                      </div>
                    </Link>
                  );
                })}
              </ListCard>

              <ListCard
                title="Công nợ"
                subtitle={sales.debtors > 0 ? `${sales.debtors} khách · ${money(sales.outstanding)}` : 'Không có công nợ'}
                href="/reports"
                count={sales.debtList.length}
                empty={<EmptyState icon={<Wallet size={20} />} title="Không có công nợ" description="Khách đã thanh toán hết các đơn đã giao." />}
              >
                {sales.debtList.map((d) => (
                  <Link key={d.customerId} href={`/customers/${d.customerId}`} className="list-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13.5, fontWeight: 540, color: 'var(--text-strong)' }} className="truncate-2">
                        {d.name}
                      </div>
                      <div className="hint" style={{ marginTop: 3 }}>
                        {d.orderCount} đơn
                        {d.maxOverdueDays > 0 ? ` · trễ nhất ${d.maxOverdueDays} ngày` : ' · trong hạn'}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', whiteSpace: 'nowrap' }}>
                        {money(d.outstanding)}
                      </div>
                      {d.overdue > 0 && (
                        <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 3, whiteSpace: 'nowrap' }}>
                          quá hạn {money(d.overdue)}
                        </div>
                      )}
                    </div>
                  </Link>
                ))}
              </ListCard>
            </div>
          </div>
        </>
      )}

      {stock && (
        <>
          <div className="grid-stats">
            <StatCard
              href="/spare-parts?tab=orders"
              label="Đơn hàng đang về" value={stock.incoming} icon={<Truck size={16} />}
              hint={stock.incoming > 0 ? 'Theo dõi tiến trình để nhập kho đúng hạn' : 'Không có lô hàng nào đang về'}
            />
            <StatCard
              href="/spare-parts"
              label="Giá trị tồn kho" value={money(stock.stockValue)} icon={<Warehouse size={16} />}
              hint={`${stock.skuCount} mã đang hoạt động · theo giá vốn bình quân`}
            />
            <StatCard
              href="/spare-parts"
              label="Mã dưới mức an toàn" value={stock.lowStock} icon={<PackageSearch size={16} />}
              tone={stock.lowStock > 0 ? 'var(--warning)' : undefined}
              hint={stock.lowStock > 0 ? 'Cân nhắc đặt bổ sung' : 'Tồn kho đang đủ'}
            />
            <StatCard
              href="/spare-parts?tab=machines"
              label="Thiết bị tại khách" value={stock.machines} icon={<Utensils size={16} />}
              hint={stock.machines > 0 ? 'Hồ sơ thiết bị đang theo dõi bảo hành, bảo dưỡng' : 'Chưa khai thiết bị nào'}
            />
          </div>

          <MonthlyChartCard
            title="Nhập – Xuất kho 6 tháng gần nhất"
            subtitle="Giá trị hàng theo giá vốn, chỉ tính phiếu đã hoàn tất (phiếu điều chuyển không tính)"
            data={stock.flowByMonth}
            series={[
              { key: 'in', name: 'Nhập kho', color: '#0f9960' },
              { key: 'out', name: 'Xuất kho', color: '#c77700' },
            ]}
            asMoney
          />

          <div className="grid-2">
            <ListCard
              title="Đơn hàng đang về"
              subtitle={stock.incoming > 0 ? `${stock.incoming} phiếu chưa nhập kho` : 'Không có lô hàng nào đang về'}
              href="/spare-parts?tab=orders"
              count={stock.incomingList.length}
              empty={<EmptyState icon={<Truck size={20} />} title="Không có lô hàng nào đang về" description="Mọi phiếu đặt hàng đã nhập kho hoặc đã hoàn tất." />}
            >
              {stock.incomingList.map((o) => {
                const cfg = PO_STATUSES[o.status];
                const owed = Math.max(0, Number(o.totalVnd || 0) - Number(o.paidAmount || 0));
                return (
                  <Link key={o.id} href="/spare-parts?tab=orders" className="list-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row" style={{ gap: 7, marginBottom: 3 }}>
                        <span className="mono-code">{o.orderCode}</span>
                        <StatusChip cfg={cfg} fallback={o.status} />
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 540, color: 'var(--text-strong)' }} className="truncate-2">
                        {o.supplier} · {o.totalItemsQty} đv
                      </div>
                      <div className="hint" style={{ marginTop: 4 }}>
                        {o.etaDate ? `Dự kiến về ${fmtDate(o.etaDate)}` : 'Chưa có ngày dự kiến'}
                        {owed > 0 ? ` · còn nợ ${money(owed)}` : ' · đã trả đủ'}
                      </div>
                      {cfg && cfg.step > 0 && (
                        <div style={{ marginTop: 7 }}>
                          <Progress value={Math.round((cfg.step / 8) * 100)} tone={cfg.color} />
                        </div>
                      )}
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', whiteSpace: 'nowrap' }}>
                      {money(Number(o.totalVnd || 0))}
                    </div>
                  </Link>
                );
              })}
            </ListCard>

            <div className="stack">
              <ListCard
                title="Tồn dưới mức an toàn"
                subtitle={stock.lowStock > 0 ? `${stock.lowStock} mã cần đặt bổ sung` : 'Tồn kho đang đủ'}
                href="/spare-parts"
                count={stock.lowStockList.length}
                empty={<EmptyState icon={<PackageSearch size={20} />} title="Tồn kho đang đủ" description="Không có mã nào xuống dưới mức an toàn." />}
              >
                {stock.lowStockList.map((i) => (
                  <Link key={i.id} href="/spare-parts" className="list-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row" style={{ gap: 7, marginBottom: 3 }}>
                        <span className="mono-code">{i.itemCode}</span>
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 540, color: 'var(--text-strong)' }} className="truncate-2">
                        {i.name}
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--warning)', whiteSpace: 'nowrap' }}>
                        {i.onHand} / {i.min} {i.unit}
                      </div>
                      <div style={{ fontSize: 11, color: 'var(--text-faint)', marginTop: 3 }}>tồn / mức an toàn</div>
                    </div>
                  </Link>
                ))}
              </ListCard>

              <ListCard
                title="Phiếu kho gần đây"
                subtitle={stock.pendingApproval > 0 ? `${stock.pendingApproval} phiếu đang chờ duyệt` : 'Không có phiếu nào chờ duyệt'}
                href="/spare-parts?tab=transactions"
                count={stock.recentDocs.length}
                empty={<EmptyState icon={<ClipboardCheck size={20} />} title="Chưa có phiếu kho nào" />}
              >
                {stock.recentDocs.map((d) => {
                  const cfg = TRANSACTION_TYPES[d.type];
                  return (
                    <Link key={d.id} href="/spare-parts?tab=transactions" className="list-row">
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div className="row" style={{ gap: 7, marginBottom: 3 }}>
                          <span className="mono-code">{d.transCode}</span>
                          <StatusChip cfg={cfg} fallback={d.type} />
                          {d.status === 'PENDING_APPROVAL' && (
                            <Badge style={{ background: '#fef3c7', color: '#92400e' }}>Chờ duyệt</Badge>
                          )}
                        </div>
                        <div className="hint">{fmtDate(d.transDate)}{d.partnerName ? ` · ${d.partnerName}` : ''}</div>
                      </div>
                      <div style={{ flexShrink: 0, fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', whiteSpace: 'nowrap' }}>
                        {money(Number(d.totalValue || 0))}
                      </div>
                    </Link>
                  );
                })}
              </ListCard>
            </div>
          </div>
        </>
      )}

      {service && (
        <>
          <div className="grid-stats">
            <StatCard
              href="/tickets" label="Sự cố chờ tiếp nhận" value={service.open} icon={<Wrench size={16} />}
              hint={service.open > 0 ? 'Cần phân công kỹ thuật viên' : 'Đã tiếp nhận hết'}
            />
            <StatCard
              href="/tickets" label="Đang xử lý" value={service.inProgress} icon={<TimerReset size={16} />}
              hint={service.inProgress > 0 ? 'Kỹ thuật đang làm' : 'Không có ca nào đang làm'}
            />
            <StatCard
              href="/tickets" label="Trễ cam kết SLA" value={service.overdueSla} icon={<AlertTriangle size={16} />}
              tone={service.overdueSla > 0 ? 'var(--danger)' : undefined}
              hint={service.overdueSla > 0 ? 'Quá thời hạn đã hứa với khách' : 'Đang đúng hạn'}
            />
            <StatCard
              href="/tickets" label="Đã xong trong tháng" value={service.resolvedThisMonth} icon={<CheckSquare size={16} />}
              tone="var(--success)"
              hint="Phiếu đã hoàn tất hoặc đã đóng"
            />
          </div>

          <MonthlyChartCard
            title="Sự cố 6 tháng gần nhất"
            subtitle="Số phiếu tiếp nhận so với số phiếu xử lý xong trong cùng tháng"
            data={service.ticketsByMonth}
            series={[
              { key: 'opened', name: 'Tiếp nhận', color: '#2447eb' },
              { key: 'resolved', name: 'Xử lý xong', color: '#0f9960' },
            ]}
          />

          <div className="grid-2">
            <ListCard
              title="Sự cố đang mở"
              subtitle={`${service.open + service.inProgress} phiếu · gấp nhất lên đầu`}
              href="/tickets"
              count={service.openList.length}
              empty={<EmptyState icon={<Wrench size={20} />} title="Không có sự cố nào đang mở" description="Toàn bộ phiếu đã được xử lý xong." />}
            >
              {service.openList.map((t) => {
                const late = t.slaDeadline && t.slaDeadline < service.now;
                return (
                  <Link key={t.id} href={`/tickets/${t.id}`} className="list-row">
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div className="row" style={{ gap: 7, marginBottom: 3 }}>
                        <span className="mono-code">{t.ticketCode}</span>
                        <StatusChip cfg={TICKET_PRIORITIES[t.priority]} fallback={t.priority} />
                      </div>
                      <div style={{ fontSize: 13.5, fontWeight: 540, color: 'var(--text-strong)' }} className="truncate-2">
                        {t.title}
                      </div>
                      <div className="row" style={{ gap: 8, marginTop: 5, flexWrap: 'wrap' }}>
                        <StatusChip cfg={TICKET_STATUSES[t.status]} fallback={t.status} />
                        <span className="hint">{t.customer?.name || t.equipment?.name}</span>
                      </div>
                    </div>
                    <div style={{ flexShrink: 0, textAlign: 'right' }}>
                      {t.slaDeadline ? (
                        <div style={{
                          fontSize: 12, fontWeight: 700, whiteSpace: 'nowrap',
                          color: late ? 'var(--danger)' : 'var(--text-muted)',
                        }}>
                          <Clock size={11} style={{ verticalAlign: -1, marginRight: 3 }} />
                          {late ? 'Trễ SLA' : fmtDate(t.slaDeadline)}
                        </div>
                      ) : (
                        <div className="hint">Không đặt SLA</div>
                      )}
                      {t.assignedTo && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: 6 }}>
                          <Avatar name={t.assignedTo.fullName} src={t.assignedTo.avatarUrl} size="sm" />
                        </div>
                      )}
                    </div>
                  </Link>
                );
              })}
            </ListCard>

            <ListCard
              title="Vừa xử lý xong"
              subtitle={`${service.resolvedThisMonth} phiếu hoàn tất trong tháng`}
              href="/tickets"
              count={service.resolvedList.length}
              empty={<EmptyState icon={<CheckSquare size={20} />} title="Chưa có phiếu nào hoàn tất" description="Tháng này chưa đóng phiếu sự cố nào." />}
            >
              {service.resolvedList.map((t) => (
                <Link key={t.id} href={`/tickets/${t.id}`} className="list-row">
                  <div style={{ flex: 1, minWidth: 0 }}>
                    <div className="row" style={{ gap: 7, marginBottom: 3 }}>
                      <span className="mono-code">{t.ticketCode}</span>
                      <StatusChip cfg={TICKET_STATUSES[t.status]} fallback={t.status} />
                    </div>
                    <div style={{ fontSize: 13.5, fontWeight: 540, color: 'var(--text-strong)' }} className="truncate-2">
                      {t.title}
                    </div>
                    <div className="hint" style={{ marginTop: 4 }}>
                      {t.customer?.name || t.equipment?.name}
                      {t.resolvedAt ? ` · xong ${fmtDate(t.resolvedAt)}` : ''}
                    </div>
                  </div>
                  {t.assignedTo && <Avatar name={t.assignedTo.fullName} src={t.assignedTo.avatarUrl} size="sm" />}
                </Link>
              ))}
            </ListCard>
          </div>
        </>
      )}


      {showWork && (
      <div className="grid-stats" data-tour="dashboard-kpi">
        <StatCard
          href="/tasks" label="Việc đang mở của tôi" value={myOpenTasks} icon={<ListChecks size={16} />}
          hint={myOpenTasks === 0 ? 'Không còn việc tồn đọng' : 'Đang chờ bạn xử lý'}
        />
        <StatCard
          href="/tasks" label="Việc quá hạn" value={myOverdue} icon={<AlertTriangle size={16} />}
          tone={myOverdue > 0 ? 'var(--danger)' : undefined}
          hint={myOverdue > 0 ? 'Cần xử lý ngay' : 'Không có việc trễ hạn'}
        />
        <StatCard
          href="/approvals" label="Đơn chờ bạn duyệt" value={pendingApprovals} icon={<CheckSquare size={16} />}
          tone={pendingApprovals > 0 ? 'var(--warning)' : undefined}
          hint={pendingApprovals > 0 ? 'Có đơn đang chờ quyết định' : 'Đã xử lý hết'}
        />
        <StatCard
          href="/leaves" label={`Phép còn lại ${year}`} value={formatDays(remaining)} icon={<CalendarDays size={16} />}
          tone="var(--success)"
          hint={balance ? `Đã dùng ${formatDays(balance.usedDays)} · Chờ duyệt ${formatDays(balance.pendingDays)}` : 'Chưa thiết lập quỹ phép'}
        />
      </div>
      )}

      {showWork && (
      <div className="grid-2">
        <div className="stack">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Công việc của tôi</CardTitle>
                <div className="card-subtitle">Sắp xếp theo hạn gần nhất</div>
              </div>
              <Link href="/tasks" className="btn btn-ghost btn-sm">Xem tất cả <ArrowRight /></Link>
            </CardHeader>
            <CardBody style={{ padding: myTasks.length ? '6px 8px' : undefined }}>
              {myTasks.length === 0 ? (
                <EmptyState icon={<ListChecks size={20} />} title="Không có việc nào đang mở" description="Bạn đã hoàn thành hết công việc được giao." />
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column' }}>
                  {myTasks.map((t) => {
                    const overdue = t.dueDate && t.dueDate < new Date();
                    return (
                      <Link key={t.id} href={`/tasks/${t.id}`} className="list-row">
                        <div style={{ flex: 1, minWidth: 0 }}>
                          <div className="row" style={{ gap: 7, marginBottom: 3 }}>
                            <span style={{ fontSize: 11.5, color: 'var(--text-faint)', fontFamily: 'var(--font-mono)', whiteSpace: 'nowrap' }}>{t.code}</span>
                            <TaskPriorityBadge priority={t.priority} />
                          </div>
                          <div style={{ fontSize: 13.5, fontWeight: 540, color: 'var(--text-strong)' }} className="truncate-2">{t.title}</div>
                          <div className="row" style={{ gap: 9, marginTop: 5 }}>
                            <TaskStatusBadge status={t.status} />
                            {t.dueDate && (
                              <span style={{
                                fontSize: 11.5,
                                color: overdue ? 'var(--danger)' : 'var(--text-muted)',
                                fontWeight: overdue ? 600 : 400,
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: 4,
                                whiteSpace: 'nowrap'
                              }}>
                                <Clock size={11} style={{ flexShrink: 0 }} />
                                <span>{fmtDate(t.dueDate)}</span>
                              </span>
                            )}
                          </div>
                        </div>
                        <div style={{ width: 62, flexShrink: 0 }}>
                          <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', marginBottom: 4 }}>{t.progress}%</div>
                          <Progress value={t.progress} />
                        </div>
                      </Link>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>
        </div>

        <div className="stack">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Nghỉ phép hôm nay</CardTitle>
                <div className="card-subtitle">{onLeaveToday.length} nhân sự vắng mặt</div>
              </div>
              <Link href="/leaves" className="btn btn-ghost btn-sm">Chi tiết <ArrowRight /></Link>
            </CardHeader>
            <CardBody style={{ padding: onLeaveToday.length ? '6px 8px' : undefined }}>
              {onLeaveToday.length === 0 ? (
                <EmptyState icon={<Users size={20} />} title="Không ai nghỉ hôm nay" description="Toàn bộ nhân sự trong phạm vi của bạn đều có mặt." />
              ) : (
                onLeaveToday.map((d) => (
                  <div key={d.id} className="list-row" style={{ cursor: 'default' }}>
                    <Avatar name={d.request.employee.fullName} src={d.request.employee.avatarUrl} size="sm" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 540, color: 'var(--text-strong)' }}>{d.request.employee.fullName}</div>
                      <div className="hint">{d.request.employee.department?.name ?? '—'}</div>
                    </div>
                    <Badge style={{ background: `${d.request.leaveType.color}1f`, color: d.request.leaveType.color }}>
                      {d.request.leaveType.name}
                    </Badge>
                    {Number(d.portion) < 1 && <Badge tone="outline">Nửa ngày</Badge>}
                  </div>
                ))
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Tiến độ công việc {ctx.dataScope === 'SELF' ? 'của tôi' : 'trong phạm vi'}</CardTitle>
                <div className="card-subtitle">Tổng {totalTeamTasks} công việc</div>
              </div>
            </CardHeader>
            <CardBody>
              {totalTeamTasks === 0 ? (
                <EmptyState icon={<CircleDot size={20} />} title="Chưa có dữ liệu công việc" />
              ) : (
                <div className="stack" style={{ gap: 11 }}>
                  {[
                    { key: 'TODO', label: 'Chờ làm', color: 'var(--text-faint)' },
                    { key: 'IN_PROGRESS', label: 'Đang làm', color: 'var(--info)' },
                    { key: 'REVIEW', label: 'Chờ duyệt', color: 'var(--warning)' },
                    { key: 'DONE', label: 'Hoàn thành', color: 'var(--success)' },
                    { key: 'BLOCKED', label: 'Bị chặn', color: 'var(--danger)' },
                  ].map((s) => {
                    const c = statusCount(s.key);
                    const pct = totalTeamTasks ? Math.round((c / totalTeamTasks) * 100) : 0;
                    return (
                      <div key={s.key}>
                        <div className="row-between" style={{ marginBottom: 5 }}>
                          <span style={{ fontSize: 12.5, color: 'var(--text-base)' }}>{s.label}</span>
                          <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }} className="tnum">{c} · {pct}%</span>
                        </div>
                        <Progress value={pct} tone={s.color} />
                      </div>
                    );
                  })}
                </div>
              )}
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Lịch nghỉ sắp tới</CardTitle>
            </CardHeader>
            <CardBody style={{ padding: upcomingLeaves.length ? '6px 8px' : undefined }}>
              {upcomingLeaves.length === 0 ? (
                <EmptyState icon={<Plane size={20} />} title="Không có lịch nghỉ sắp tới" />
              ) : (
                upcomingLeaves.map((l) => (
                  <Link key={l.id} href={`/leaves/${l.id}`} className="list-row">
                    <Avatar name={l.employee.fullName} src={l.employee.avatarUrl} size="sm" />
                    <div style={{ flex: 1, minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 540, color: 'var(--text-strong)' }}>{l.employee.fullName}</div>
                      <div className="hint">{fmtDate(l.startDate)} → {fmtDate(l.endDate)} · {formatDays(l.totalDays)} ngày</div>
                    </div>
                    <Badge style={{ background: `${l.leaveType.color}1f`, color: l.leaveType.color }}>{l.leaveType.name}</Badge>
                  </Link>
                ))
              )}
            </CardBody>
          </Card>
        </div>
      </div>
      )}
    </div>
  );
}
