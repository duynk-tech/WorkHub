import { Fragment } from 'react';
import Link from 'next/link';
import { redirect } from 'next/navigation';
import {
  ListChecks, AlertTriangle, CheckSquare, CalendarDays, Clock, Users,
  ArrowRight, CircleDot, Plane, ShoppingCart, Wallet, FileText, Truck,
  PackageSearch, ClipboardCheck, Wrench, TimerReset, Boxes, Briefcase,
  ShieldCheck, Utensils, Warehouse, TrendingUp,
} from 'lucide-react';
import { prisma } from '@/lib/prisma';
import { requireAuth, can } from '@/server/auth/context';
import { visibleEmployeeIds } from '@/server/auth/scope';
import { getSalesAggregates, getSalesKpis, getStockAggregates, getTicketsByMonth } from '@/server/modules/dashboard/aggregates';
import { getCustomerCareList, CARE_REASONS } from '@/server/modules/customer/care';
import { ORDER_STATUSES as CUSTOMER_ORDER_STATUSES } from '@/server/modules/customer/types';
import { ORDER_STATUSES as PO_STATUSES, TRANSACTION_TYPES } from '@/server/modules/spare-parts/types';
import { TICKET_STATUSES, TICKET_PRIORITIES } from '@/server/modules/equipment/types';
import { MonthlyBars, MonthlyAreaChart, StatusDonutChart, type ChartSeries, type DonutSlice } from '@/components/domain/dashboard-charts-lazy';
import { Card, CardHeader, CardTitle, CardBody, StatCard, Badge, Avatar, EmptyState, Progress, PageHeader } from '@/components/ui';
import { fmtDate } from '@/lib/date';
import { formatDays } from '@/lib/utils';
import { TaskStatusBadge, TaskPriorityBadge } from '@/components/domain/task-badges';
import { DashboardBoardBar } from '@/components/domain/dashboard-board-bar';
import { DashboardLayoutGrid, type DashboardGridItemData } from '@/components/domain/dashboard-layout-grid';
import { getAccessibleDashboardBoards } from '@/server/modules/dashboard/service';
import { DASHBOARD_WIDGETS, WIDGET_BY_KEY, canSeeDashboardWidget } from '@/lib/dashboard-widgets';

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
  title, subtitle, data, series, asMoney, variant = 'bar', emptyText = 'Chưa có dữ liệu trong kỳ',
}: {
  title: string;
  subtitle?: string;
  data: Record<string, number | string>[];
  series: ChartSeries[];
  asMoney?: boolean;
  variant?: 'bar' | 'area';
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
          ? (variant === 'area'
              ? <MonthlyAreaChart data={data} series={series} asMoney={asMoney} />
              : <MonthlyBars data={data} series={series} asMoney={asMoney} />)
          : <EmptyState icon={<TrendingUp size={20} />} title={emptyText} />}
      </CardBody>
    </Card>
  );
}

function DonutChartCard({
  title, subtitle, data, centerLabel = 'Tổng', emptyText = 'Chưa có dữ liệu',
}: {
  title: string;
  subtitle?: string;
  data: DonutSlice[];
  centerLabel?: string;
  emptyText?: string;
}) {
  const hasData = data.some((d) => d.value > 0);
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
          ? <StatusDonutChart data={data} centerLabel={centerLabel} />
          : <EmptyState icon={<CircleDot size={20} />} title={emptyText} />}
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
    openOrders, awaitingStock, quotations, agg, kpis, care, openOrderList, quotationList, orderStatusGroups,
  ] = await Promise.all([
    prisma.customerOrder.count({ where: { status: { notIn: ['COMPLETED', 'CANCELLED'] } } }),
    prisma.customerOrder.count({ where: { status: { in: ['AWAITING_STOCK', 'READY_TO_DELIVER'] } } }),
    prisma.customerQuotation.count({ where: { status: { in: ['DRAFT', 'SENT'] } } }),
    // Doanh thu theo tháng và công nợ tính trong DB, cache 60 giây (dashboard/aggregates.ts)
    getSalesAggregates(),
    getSalesKpis(),
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
    prisma.customerOrder.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
  ]);

  const revenueByMonth = months.map((m) => {
    const row = agg.revenueByMonth.find((r) => r.key === m.key);
    return { label: m.label, billed: row?.billed ?? 0, collected: row?.collected ?? 0 };
  });

  return {
    openOrders,
    awaitingStock,
    quotations,
    outstanding: agg.outstanding,
    overdue: agg.overdue,
    debtors: agg.debtors,
    careCustomers: care.totals.customers,
    careMachines: care.totals.machines,
    // Khách gấp nhất lên đầu; danh sách đầy đủ nằm ở màn Khách hàng
    careList: care.customers.slice(0, 6),
    openOrderList,
    quotationList,
    revenueByMonth,
    orderStatusPie: orderStatusGroups.map((g) => ({
      name: CUSTOMER_ORDER_STATUSES[g.status]?.label ?? g.status,
      value: g._count._all,
      color: CUSTOMER_ORDER_STATUSES[g.status]?.color ?? '#64748b',
    })),
    // Nợ nhiều nhất lên đầu, chỉ lấy khách còn dư nợ thật
    debtList: agg.debtList,
    kpis,
  };
}

/** Số liệu kho: hàng đang trên đường về, mã dưới mức an toàn và phiếu chờ duyệt. */
async function loadStockSummary() {
  const months = lastMonths(6);

  const [
    incoming, pendingApproval, agg, machines, incomingList, recentDocs,
  ] = await Promise.all([
    prisma.sparePartOrder.count({
      where: { status: { notIn: ['STOCKED', 'COMPLETED', 'CANCELLED'] } },
    }),
    prisma.inventoryTransaction.count({ where: { status: 'PENDING_APPROVAL' } }),
    // Tồn, giá trị tồn, mã dưới mức an toàn và luồng nhập/xuất tính trong DB
    getStockAggregates(),
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
  ]);

  const flowByMonth = months.map((m) => {
    const row = agg.flowByMonth.find((r) => r.key === m.key);
    return { label: m.label, in: row?.in ?? 0, out: row?.out ?? 0 };
  });
  const { lowStock, stockValue, skuCount, lowStockList } = agg;

  return {
    incoming, pendingApproval, lowStock, stockValue, skuCount, machines,
    incomingList, recentDocs, lowStockList, flowByMonth,
  };
}

/** Số liệu dịch vụ: phiếu sự cố đang mở và đã hoàn tất. */
async function loadServiceSummary() {
  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const ticketCard = {
    id: true, ticketCode: true, title: true, status: true, priority: true,
    resolvedAt: true,
    equipment: { select: { id: true, machineCode: true, name: true } },
    customer: { select: { id: true, name: true } },
    assignedTo: { select: { id: true, fullName: true, avatarUrl: true } },
  } as const;

  const months = lastMonths(6, now);

  const [
    open, inProgress, resolvedThisMonth, openList, resolvedList, monthlyTickets, ticketStatusGroups,
  ] = await Promise.all([
    prisma.serviceTicket.count({ where: { status: { in: ['OPEN', 'ASSIGNED'] } } }),
    prisma.serviceTicket.count({ where: { status: 'IN_PROGRESS' } }),
    prisma.serviceTicket.count({
      where: { status: { in: ['RESOLVED', 'CLOSED'] }, resolvedAt: { gte: monthStart } },
    }),
    prisma.serviceTicket.findMany({
      where: { status: { notIn: ['RESOLVED', 'CLOSED'] } },
      select: ticketCard,
      orderBy: { createdAt: 'desc' },
      take: 6,
    }),
    prisma.serviceTicket.findMany({
      where: { status: { in: ['RESOLVED', 'CLOSED'] }, resolvedAt: { gte: monthStart } },
      select: ticketCard,
      orderBy: { resolvedAt: 'desc' },
      take: 5,
    }),
    getTicketsByMonth(),
    prisma.serviceTicket.groupBy({
      by: ['status'],
      _count: { _all: true },
    }),
  ]);

  // Một phiếu có thể rơi vào hai tháng khác nhau: mở tháng này, xong tháng sau.
  // Đếm riêng từng mốc mới thấy được tháng nào nhận nhiều hơn xử lý được.
  const ticketsByMonth = months.map((m) => {
    const row = monthlyTickets.find((r) => r.key === m.key);
    return { label: m.label, opened: row?.opened ?? 0, resolved: row?.resolved ?? 0 };
  });

  return {
    open, inProgress, resolvedThisMonth, openList, resolvedList, ticketsByMonth,
    ticketStatusPie: ticketStatusGroups.map((g) => ({
      name: TICKET_STATUSES[g.status]?.label ?? g.status,
      value: g._count._all,
      color: TICKET_STATUSES[g.status]?.color ?? '#64748b',
    })),
  };
}

export default async function DashboardPage({
  searchParams,
}: {
  searchParams: Promise<{ board?: string; tab?: string; report?: string; month?: string; from?: string; to?: string; year?: string }>;
}) {
  const ctx = await requireAuth();
  const sp = await searchParams;
  if (sp.tab === 'reports') {
    const params = new URLSearchParams();
    if (sp.report) params.set('tab', sp.report);
    for (const key of ['month', 'from', 'to', 'year'] as const) {
      if (sp[key]) params.set(key, sp[key]!);
    }
    const qs = params.toString();
    redirect(qs ? `/reports?${qs}` : '/reports');
  }
  const scopeIds = await visibleEmployeeIds(ctx);
  const scopeWhere = scopeIds === null ? {} : { in: scopeIds };
  const today = new Date();
  const todayStart = new Date(Date.UTC(today.getFullYear(), today.getMonth(), today.getDate()));
  const year = today.getFullYear();

  const requestedBoardId = sp.board ? Number(sp.board) : null;
  const [{ boards, activeBoard }, adminRoles, adminUsers] = await Promise.all([
    getAccessibleDashboardBoards(ctx, Number.isFinite(requestedBoardId) ? requestedBoardId : null),
    ctx.isAdmin
      ? prisma.role.findMany({ orderBy: { sortOrder: 'asc' }, select: { code: true, name: true } })
      : Promise.resolve([]),
    ctx.isAdmin
      ? prisma.user.findMany({
          where: { isActive: true },
          orderBy: { username: 'asc' },
          select: { id: true, username: true, employee: { select: { fullName: true } } },
        })
      : Promise.resolve([]),
  ]);

  const allowedWidgetKeys = DASHBOARD_WIDGETS.filter((w) =>
    canSeeDashboardWidget(ctx.permissions, ctx.isAdmin, w.key),
  ).map((w) => w.key);

  const useCustomBoard = Boolean(activeBoard) && !sp.tab;
  const activeWidgetKeys = useCustomBoard && activeBoard ? activeBoard.visibleWidgets : [];
  const activeDataSources = new Set(
    activeWidgetKeys.map((k) => WIDGET_BY_KEY.get(k)?.dataSource).filter(Boolean),
  );

  // Khi chưa có bảng tùy chỉnh/chia sẻ nào, dùng các tab mặc định theo quyền
  const tabs = [
    can(ctx, 'FEATURE_CUSTOMER_MANAGE')
      ? { key: 'sales', label: 'Kinh doanh', hint: 'Đơn hàng, báo giá và tiền còn phải thu của khách', icon: Briefcase }
      : null,
    can(ctx, 'FEATURE_SPARE_PARTS_MANAGE')
      ? { key: 'stock', label: 'Kho & Mua hàng', hint: 'Hàng đang về, tồn dưới mức an toàn và phiếu chờ duyệt', icon: Boxes }
      : null,
    can(ctx, 'FEATURE_EQUIPMENT_MAINTENANCE') || can(ctx, 'FEATURE_EQUIPMENT_MANAGE')
      ? { key: 'service', label: 'Dịch vụ & Sửa chữa', hint: 'Phiếu sự cố đang xử lý và phần đã trễ cam kết', icon: Wrench }
      : null,
    { key: 'work', label: 'Công việc & Nhân sự', hint: 'Việc được giao, đơn chờ bạn duyệt và tình hình nghỉ phép', icon: Users },
  ].filter((t): t is NonNullable<typeof t> => t !== null);

  const tab = tabs.some((t) => t.key === sp.tab) ? sp.tab! : tabs[0].key;
  const active = tabs.find((t) => t.key === tab)!;

  const needSales = useCustomBoard ? activeDataSources.has('sales') : tab === 'sales';
  const needStock = useCustomBoard ? activeDataSources.has('stock') : tab === 'stock';
  const needService = useCustomBoard ? activeDataSources.has('service') : tab === 'service';
  const showWork = useCustomBoard ? activeDataSources.has('work') : tab === 'work';

  // Chỉ truy vấn số liệu của các khối thực sự hiển thị
  // Khởi động mọi khối cùng lúc: phần Công việc không phải đợi Kinh doanh/Kho/Dịch vụ xong
  const sectionsPromise = Promise.all([
    needSales ? loadSalesSummary() : Promise.resolve(null),
    needStock ? loadStockSummary() : Promise.resolve(null),
    needService ? loadServiceSummary() : Promise.resolve(null),
  ]);

  const workPromise =
    showWork
      ? Promise.all([
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
      : Promise.resolve([0, 0, 0, null, [], [], [], []] as const);

  const [[sales, stock, service], [myOpenTasks, myOverdue, pendingApprovals, balance, onLeaveToday, myTasks, teamTaskStats, upcomingLeaves]] =
    await Promise.all([sectionsPromise, workPromise]);

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

  const widgetSet = new Set(activeWidgetKeys);
  const showWidget = (key: string, defaultTab: string) =>
    useCustomBoard ? widgetSet.has(key) : tab === defaultTab;

  // Khi đang dùng bảng tùy chỉnh: gom từng widget vào bản đồ để DashboardLayoutGrid render đúng thứ tự & độ rộng cột đã thiết kế
  // Bản đồ widget dùng chung cho bảng tùy chỉnh lẫn các tab mặc định (trước đây mỗi nơi tự vẽ một bản)
  const customWidgets: Record<string, React.ReactNode> = {};
  {
    if (sales) {
      customWidgets.sales_stats = (
        <div className="grid-stats">
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
      );
      customWidgets.sales_chart = (
        <MonthlyChartCard
          title="Doanh thu 6 tháng gần nhất"
          subtitle="Giá trị đơn đã ghi nhận so với tiền thực thu, không tính đơn đã hủy"
          data={sales.revenueByMonth}
          series={[
            { key: 'billed', name: 'Giá trị đơn', color: '#2563eb' },
            { key: 'collected', name: 'Đã thu', color: '#166534' },
          ]}
          asMoney
        />
      );
      customWidgets.sales_trend_area = (
        <MonthlyChartCard
          title="Xu hướng Doanh thu & Thực thu"
          subtitle="Biểu đồ miền 6 tháng gần nhất"
          data={sales.revenueByMonth}
          series={[
            { key: 'billed', name: 'Giá trị đơn', color: '#2563eb' },
            { key: 'collected', name: 'Đã thu', color: '#16a34a' },
          ]}
          asMoney
          variant="area"
        />
      );
      customWidgets.sales_status_pie = (
        <DonutChartCard
          title="Cơ cấu đơn hàng theo trạng thái"
          subtitle="Phân bổ toàn bộ đơn bán hàng"
          data={sales.orderStatusPie}
          centerLabel="Đơn hàng"
        />
      );
      customWidgets.sales_orders = (
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
      );
      customWidgets.sales_care = (
        <ListCard
          title="Khách hàng tới hạn bảo hành"
          subtitle={sales.careCustomers > 0 ? `${sales.careCustomers} khách · ${sales.careMachines} máy tới hạn trong 30 ngày` : 'Cửa sổ 30 ngày'}
          href="/customers?within=30"
          count={sales.careList.length}
          empty={<EmptyState icon={<ShieldCheck size={20} />} title="Không có khách nào tới hạn" description="Trong 30 ngày tới không có máy nào hết bảo hành hay đến kỳ bảo dưỡng." />}
        >
          {sales.careList.map((c) => {
            const late = c.soonestDays < 0;
            const reasons = [...new Set(c.machines.flatMap((m) => m.reasons))];
            return (
              <Link key={c.customerId} href={`/customers/${c.customerId}`} className="list-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 7, marginBottom: 3 }}>
                    {c.code && <span className="mono-code">{c.code}</span>}
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{c.phone || '—'}</span>
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 540, color: 'var(--text-strong)' }} className="truncate-2">{c.name}</div>
                  <div className="row" style={{ gap: 6, marginTop: 5, flexWrap: 'wrap' }}>
                    {reasons.map((r) => <StatusChip key={r} cfg={CARE_REASONS[r]} />)}
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>{c.machines.length} máy</span>
                  </div>
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right' }}>
                  <div style={{ fontSize: 13, fontWeight: 700, whiteSpace: 'nowrap', color: late ? 'var(--danger)' : 'var(--warning)' }}>
                    {late ? `Trễ ${Math.abs(c.soonestDays)} ngày` : `Còn ${c.soonestDays} ngày`}
                  </div>
                </div>
              </Link>
            );
          })}
        </ListCard>
      );
      customWidgets.sales_quotations = (
        <ListCard
          title="Công nợ phải thu"
          subtitle={sales.debtors > 0 ? `${sales.debtors} khách · ${money(sales.outstanding)}` : 'Không có công nợ'}
          href="/reports"
          count={sales.debtList.length}
          empty={<EmptyState icon={<Wallet size={20} />} title="Không có công nợ" description="Khách đã thanh toán hết các đơn đã giao." />}
        >
          {sales.debtList.map((d) => (
            <Link key={d.customerId} href={`/customers/${d.customerId}`} className="list-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13.5, fontWeight: 540, color: 'var(--text-strong)' }} className="truncate-2">{d.name}</div>
                <div className="hint" style={{ marginTop: 3 }}>
                  {d.orderCount} đơn{d.maxOverdueDays > 0 ? ` · trễ nhất ${d.maxOverdueDays} ngày` : ' · trong hạn'}
                </div>
              </div>
              <div style={{ flexShrink: 0, textAlign: 'right' }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)', whiteSpace: 'nowrap' }}>{money(d.outstanding)}</div>
                {d.overdue > 0 && <div style={{ fontSize: 11, color: 'var(--danger)', marginTop: 3, whiteSpace: 'nowrap' }}>quá hạn {money(d.overdue)}</div>}
              </div>
            </Link>
          ))}
        </ListCard>
      );
      customWidgets.sales_kpis = (
        <Card>
                <CardHeader>
                  <div>
                    <CardTitle>Hiệu quả kinh doanh</CardTitle>
                    <div className="card-subtitle">
                      {sales.kpis.quotes.winRate !== null
                        ? `Chốt ${Math.round(sales.kpis.quotes.winRate * 100)}% báo giá 90 ngày qua`
                        : 'Chưa có báo giá có kết quả trong 90 ngày'}
                      {sales.kpis.quotes.avgDaysToWin !== null && ` · trung bình ${sales.kpis.quotes.avgDaysToWin} ngày để chốt`}
                    </div>
                  </div>
                </CardHeader>
                <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                  <div>
                    <div className="hint" style={{ marginBottom: 6 }}>Doanh số tháng này theo nhân viên KD</div>
                    {sales.kpis.bySalesperson.length === 0 ? (
                      <div className="hint">Chưa có đơn trong tháng.</div>
                    ) : (
                      sales.kpis.bySalesperson.map((r) => (
                        <div key={r.employeeId ?? 'none'} className="row-between" style={{ padding: '5px 0', fontSize: 13 }}>
                          <span className="truncate-2">{r.name} <span className="hint">· {r.orders} đơn</span></span>
                          <strong style={{ whiteSpace: 'nowrap' }}>{money(r.billed)}</strong>
                        </div>
                      ))
                    )}
                  </div>
                  <div>
                    <div className="hint" style={{ marginBottom: 6 }}>Tuổi nợ phải thu</div>
                    {([
                      ['current', 'Chưa tới hạn'],
                      ['d1to30', 'Quá 1–30 ngày'],
                      ['d31to60', 'Quá 31–60 ngày'],
                      ['d61to90', 'Quá 61–90 ngày'],
                      ['over90', 'Quá trên 90 ngày'],
                    ] as const).map(([k, label]) => (
                      <div key={k} className="row-between" style={{ padding: '4px 0', fontSize: 13 }}>
                        <span>{label}</span>
                        <strong style={{ whiteSpace: 'nowrap', color: k === 'current' ? undefined : sales.kpis.aging[k] > 0 ? 'var(--danger)' : undefined }}>
                          {money(sales.kpis.aging[k])}
                        </strong>
                      </div>
                    ))}
                  </div>
                </CardBody>
              </Card>
      );
    }

    if (stock) {
      customWidgets.stock_stats = (
        <div className="grid-stats">
          <StatCard href="/spare-parts" label="Giá trị tồn kho" value={money(stock.stockValue)} icon={<Warehouse size={16} />} hint={`${stock.skuCount} mã đang hoạt động`} />
          <StatCard href="/spare-parts" label="Mã dưới mức an toàn" value={stock.lowStock} icon={<PackageSearch size={16} />} tone={stock.lowStock > 0 ? 'var(--warning)' : undefined} hint={stock.lowStock > 0 ? 'Cân nhắc đặt bổ sung' : 'Tồn kho đang đủ'} />
          <StatCard href="/spare-parts?tab=machines" label="Thiết bị tại khách" value={stock.machines} icon={<Utensils size={16} />} hint="Hồ sơ thiết bị theo dõi bảo hành" />
        </div>
      );
      customWidgets.purchase_stats = (
        <div className="grid-stats">
          <StatCard href="/purchases" label="Đơn hàng đang về" value={stock.incoming} icon={<Truck size={16} />} hint={stock.incoming > 0 ? 'Theo dõi tiến trình nhập kho' : 'Không có lô hàng đang về'} />
          <StatCard href="/spare-parts?tab=transactions" label="Phiếu kho chờ duyệt" value={stock.pendingApproval} icon={<ClipboardCheck size={16} />} tone={stock.pendingApproval > 0 ? 'var(--warning)' : undefined} hint="Cần phê duyệt nhập/xuất kho" />
        </div>
      );
      customWidgets.purchase_chart = (
        <MonthlyChartCard
          title="Nhập – Xuất kho 6 tháng gần nhất"
          subtitle="Giá trị hàng theo giá vốn, chỉ tính phiếu đã hoàn tất"
          data={stock.flowByMonth}
          series={[
            { key: 'in', name: 'Nhập kho', color: '#166534' },
            { key: 'out', name: 'Xuất kho', color: '#d97706' },
          ]}
          asMoney
        />
      );
      customWidgets.purchase_orders = (
        <ListCard
          title="Đơn hàng đang về"
          subtitle={stock.incoming > 0 ? `${stock.incoming} phiếu chưa nhập kho` : 'Không có lô hàng đang về'}
          href="/purchases"
          count={stock.incomingList.length}
          empty={<EmptyState icon={<Truck size={20} />} title="Không có lô hàng đang về" />}
        >
          {stock.incomingList.map((o) => {
            const cfg = PO_STATUSES[o.status];
            return (
              <Link key={o.id} href="/purchases" className="list-row">
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div className="row" style={{ gap: 7, marginBottom: 3 }}>
                    <span className="mono-code">{o.orderCode}</span>
                    <StatusChip cfg={cfg} fallback={o.status} />
                  </div>
                  <div style={{ fontSize: 13.5, fontWeight: 540, color: 'var(--text-strong)' }}>{o.supplier}</div>
                </div>
                <div style={{ flexShrink: 0, textAlign: 'right', fontSize: 13, fontWeight: 700 }}>{money(Number(o.totalVnd || 0))}</div>
              </Link>
            );
          })}
        </ListCard>
      );
      customWidgets.stock_low = (
        <ListCard
          title="Vật tư dưới mức an toàn"
          subtitle={stock.lowStock > 0 ? `${stock.lowStock} mã cần đặt bổ sung` : 'Tồn kho đang đủ'}
          href="/spare-parts"
          count={stock.lowStockList.length}
          empty={<EmptyState icon={<PackageSearch size={20} />} title="Không có mã thiếu hàng" />}
        >
          {stock.lowStockList.map((i) => (
            <Link key={i.id} href="/spare-parts" className="list-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <span className="mono-code">{i.itemCode}</span>
                <div style={{ fontSize: 13.5, fontWeight: 540, color: 'var(--text-strong)' }} className="truncate-2">{i.name}</div>
              </div>
              <div style={{ flexShrink: 0, textAlign: 'right', fontSize: 13, fontWeight: 700, color: 'var(--warning)' }}>
                {i.onHand} / {i.min} {i.unit}
              </div>
            </Link>
          ))}
        </ListCard>
      );
      customWidgets.stock_transactions = (
        <ListCard
          title="Phiếu kho gần đây"
          subtitle={stock.pendingApproval > 0 ? `${stock.pendingApproval} phiếu đang chờ duyệt` : 'Không có phiếu chờ duyệt'}
          href="/spare-parts?tab=transactions"
          count={stock.recentDocs.length}
          empty={<EmptyState icon={<ClipboardCheck size={20} />} title="Chưa có phiếu kho nào" />}
        >
          {stock.recentDocs.map((d) => (
            <Link key={d.id} href="/spare-parts?tab=transactions" className="list-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 7, marginBottom: 3 }}>
                  <span className="mono-code">{d.transCode}</span>
                  <StatusChip cfg={TRANSACTION_TYPES[d.type]} fallback={d.type} />
                </div>
                <div className="hint">{fmtDate(d.transDate)}{d.partnerName ? ` · ${d.partnerName}` : ''}</div>
              </div>
              <div style={{ flexShrink: 0, fontSize: 13, fontWeight: 700 }}>{money(Number(d.totalValue || 0))}</div>
            </Link>
          ))}
        </ListCard>
      );
    }

    if (service) {
      customWidgets.service_stats = (
        <div className="grid-stats">
          <StatCard href="/tickets" label="Sự cố chờ tiếp nhận" value={service.open} icon={<Wrench size={16} />} hint={service.open > 0 ? 'Cần phân công kỹ thuật viên' : 'Đã tiếp nhận hết'} />
          <StatCard href="/tickets" label="Đang xử lý" value={service.inProgress} icon={<TimerReset size={16} />} hint="Kỹ thuật đang xử lý" />
          <StatCard href="/tickets" label="Đã xong trong tháng" value={service.resolvedThisMonth} icon={<CheckSquare size={16} />} tone="var(--success)" hint="Phiếu đã hoàn tất" />
        </div>
      );
      customWidgets.service_chart = (
        <MonthlyChartCard
          title="Sự cố 6 tháng gần nhất"
          subtitle="Số phiếu tiếp nhận so với xử lý xong"
          data={service.ticketsByMonth}
          series={[
            { key: 'opened', name: 'Tiếp nhận', color: '#2563eb' },
            { key: 'resolved', name: 'Xử lý xong', color: '#166534' },
          ]}
        />
      );
      customWidgets.service_status_pie = (
        <DonutChartCard
          title="Cơ cấu phiếu sự cố"
          subtitle="Phân bổ phiếu bảo trì theo trạng thái"
          data={service.ticketStatusPie}
          centerLabel="Phiếu"
        />
      );
      customWidgets.service_tickets = (
        <ListCard
          title="Sự cố đang mở"
          subtitle={`${service.open + service.inProgress} phiếu đang theo dõi`}
          href="/tickets"
          count={service.openList.length}
          empty={<EmptyState icon={<Wrench size={20} />} title="Không có sự cố nào đang mở" />}
        >
          {service.openList.map((t) => (
            <Link key={t.id} href={`/tickets/${t.id}`} className="list-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 7, marginBottom: 3 }}>
                  <span className="mono-code">{t.ticketCode}</span>
                  <StatusChip cfg={TICKET_PRIORITIES[t.priority]} fallback={t.priority} />
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 540, color: 'var(--text-strong)' }} className="truncate-2">{t.title}</div>
                <div className="hint" style={{ marginTop: 3 }}>{t.customer?.name || t.equipment?.name}</div>
              </div>
              {t.assignedTo && <Avatar name={t.assignedTo.fullName} src={t.assignedTo.avatarUrl} size="sm" />}
            </Link>
          ))}
        </ListCard>
      );
    }

    if (showWork) {
      customWidgets.work_stats = (
        <div className="grid-stats">
          <StatCard href="/tasks" label="Việc đang mở của tôi" value={myOpenTasks} icon={<ListChecks size={16} />} hint={myOpenTasks === 0 ? 'Không còn việc tồn đọng' : 'Đang chờ bạn xử lý'} />
          <StatCard href="/tasks" label="Việc quá hạn" value={myOverdue} icon={<AlertTriangle size={16} />} tone={myOverdue > 0 ? 'var(--danger)' : undefined} hint={myOverdue > 0 ? 'Cần xử lý ngay' : 'Không có việc trễ hạn'} />
          <StatCard href="/approvals" label="Đơn chờ bạn duyệt" value={pendingApprovals} icon={<CheckSquare size={16} />} tone={pendingApprovals > 0 ? 'var(--warning)' : undefined} hint={pendingApprovals > 0 ? 'Có đơn chờ quyết định' : 'Đã xử lý hết'} />
          <StatCard href="/leaves" label={`Phép còn lại ${year}`} value={formatDays(remaining)} icon={<CalendarDays size={16} />} tone="var(--success)" hint={balance ? `Đã dùng ${formatDays(balance.usedDays)}` : 'Chưa thiết lập quỹ phép'} />
        </div>
      );
      customWidgets.work_status_pie = (
        <DonutChartCard
          title={`Cơ cấu công việc ${ctx.dataScope === 'SELF' ? 'của tôi' : 'trong phạm vi'}`}
          subtitle={`Tổng ${totalTeamTasks} công việc theo trạng thái`}
          centerLabel="Công việc"
          data={[
            { name: 'Chờ làm', value: statusCount('TODO'), color: '#94a3b8' },
            { name: 'Đang làm', value: statusCount('IN_PROGRESS'), color: '#2563eb' },
            { name: 'Chờ nghiệm thu', value: statusCount('REVIEW'), color: '#d97706' },
            { name: 'Hoàn thành', value: statusCount('DONE'), color: '#16a34a' },
            { name: 'Bị chặn', value: statusCount('BLOCKED'), color: '#dc2626' },
          ]}
        />
      );
      customWidgets.work_tasks = (
        <ListCard
          title="Công việc của tôi"
          subtitle="Sắp xếp theo hạn gần nhất"
          href="/tasks"
          count={myTasks.length}
          empty={<EmptyState icon={<ListChecks size={20} />} title="Không có việc nào đang mở" />}
        >
          {myTasks.map((t) => (
            <Link key={t.id} href={`/tasks/${t.id}`} className="list-row">
              <div style={{ flex: 1, minWidth: 0 }}>
                <div className="row" style={{ gap: 7, marginBottom: 3 }}>
                  <span className="mono-code">{t.code}</span>
                  <TaskPriorityBadge priority={t.priority} />
                </div>
                <div style={{ fontSize: 13.5, fontWeight: 540, color: 'var(--text-strong)' }} className="truncate-2">{t.title}</div>
              </div>
              <div style={{ width: 58, flexShrink: 0 }}>
                <div style={{ fontSize: 11, color: 'var(--text-muted)', textAlign: 'right', marginBottom: 4 }}>{t.progress}%</div>
                <Progress value={t.progress} />
              </div>
            </Link>
          ))}
        </ListCard>
      );
      customWidgets.work_team = (
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
      );
      customWidgets.hr_leaves = (
        <ListCard
          title="Nghỉ phép hôm nay"
          subtitle={`${onLeaveToday.length} nhân sự vắng mặt`}
          href="/leaves"
          count={onLeaveToday.length}
          empty={<EmptyState icon={<Users size={20} />} title="Không ai nghỉ hôm nay" />}
        >
          {onLeaveToday.map((d) => (
            <div key={d.id} className="list-row" style={{ cursor: 'default' }}>
              <Avatar name={d.request.employee.fullName} src={d.request.employee.avatarUrl} size="sm" />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 540, color: 'var(--text-strong)' }}>{d.request.employee.fullName}</div>
                <div className="hint">{d.request.employee.department?.name ?? '—'}</div>
              </div>
              <Badge style={{ background: `${d.request.leaveType.color}1f`, color: d.request.leaveType.color }}>
                {d.request.leaveType.name}
              </Badge>
            </div>
          ))}
        </ListCard>
      );
      customWidgets.hr_leaves_upcoming = (
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
      );
    }
  }

  const customGridItems: DashboardGridItemData[] =
    useCustomBoard && activeBoard
      ? activeBoard.visibleLayout
          .filter((item) => customWidgets[item.key] !== undefined)
          .map((item) => ({
            key: item.key,
            label: WIDGET_BY_KEY.get(item.key)?.label ?? item.key,
            colSpan: item.colSpan,
            content: customWidgets[item.key],
          }))
      : [];

  return (
    <div className="stack">
      <PageHeader
        title={`${greeting}, ${displayName}!`}
        description={`Hôm nay là ${fmtDate(today, "EEEE, 'ngày' dd/MM/yyyy")}${ctx.departmentName ? ` · ${ctx.departmentName}` : ''}`}
      />

      <DashboardBoardBar
        boards={boards}
        activeBoardId={activeBoard?.id ?? null}
        isAdmin={ctx.isAdmin}
        allowedWidgetKeys={allowedWidgetKeys}
        roles={adminRoles}
        users={adminUsers.map((u) => ({
          id: u.id,
          username: u.username,
          fullName: u.employee?.fullName || u.username,
        }))}
      />

      {!useCustomBoard && boards.length === 0 && tabs.length > 1 && (
        <div className="tabs">
          {tabs.map((t) => (
            <Link key={t.key} href={`/dashboard?tab=${t.key}`} className="tab" data-active={tab === t.key}>
              <t.icon size={13} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />
              {t.label}
            </Link>
          ))}
        </div>
      )}

      {useCustomBoard && activeBoard && (
        <>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -4 }}>
            {activeBoard.description || `Bảng "${activeBoard.name}"`}
            {activeBoard.isShared && !activeBoard.isOwn && ` · Chia sẻ bởi ${activeBoard.ownerName}`}
          </div>
          <DashboardLayoutGrid
            boardId={activeBoard.id}
            canEdit={activeBoard.isOwn || ctx.isAdmin}
            items={customGridItems}
          />
        </>
      )}
      {!useCustomBoard && (
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: -4 }}>{active.hint}</div>
      )}

      {!useCustomBoard && (
        <DefaultTabLayout
          tab={tab}
          widgets={customWidgets}
          visible={(key) => showWidget(key, tab) && customWidgets[key] !== undefined}
        />
      )}
    </div>
  );
}

/**
 * Bố cục cố định của các tab mặc định, sắp từ cùng bản đồ widget với bảng tùy chỉnh.
 * Mỗi hàng là danh sách cột; mỗi cột là danh sách widget xếp chồng.
 */
const DEFAULT_LAYOUTS: Record<string, string[][][]> = {
  sales: [
    [['sales_stats']],
    [['sales_chart']],
    [['sales_trend_area'], ['sales_status_pie']],
    [['sales_orders'], ['sales_care', 'sales_quotations', 'sales_kpis']],
  ],
  stock: [
    [['purchase_stats'], ['stock_stats']],
    [['purchase_chart']],
    [['purchase_orders'], ['stock_low', 'stock_transactions']],
  ],
  service: [
    [['service_stats']],
    [['service_chart'], ['service_status_pie']],
    [['service_tickets']],
  ],
  work: [
    [['work_stats']],
    [['work_status_pie']],
    [['work_tasks'], ['hr_leaves', 'work_team', 'hr_leaves_upcoming']],
  ],
};

/** Widget phụ chỉ hiện khi widget chính của nó được bật. */
const COMPANION_OF: Record<string, string> = { sales_kpis: 'sales_quotations', hr_leaves_upcoming: 'hr_leaves' };

function DefaultTabLayout({
  tab,
  widgets,
  visible,
}: {
  tab: string;
  widgets: Record<string, React.ReactNode>;
  visible: (key: string) => boolean;
}) {
  const isOn = (key: string) => (COMPANION_OF[key] ? visible(COMPANION_OF[key]) && widgets[key] !== undefined : visible(key));
  const rows = (DEFAULT_LAYOUTS[tab] ?? [])
    .map((row) => row.map((col) => col.filter(isOn)).filter((col) => col.length > 0))
    .filter((row) => row.length > 0);

  return (
    <>
      {rows.map((row, ri) => {
        const cols = row.map((col) =>
          col.length === 1 ? (
            <Fragment key={col[0]}>{widgets[col[0]]}</Fragment>
          ) : (
            <div key={col.join('+')} className="stack">
              {col.map((k) => <Fragment key={k}>{widgets[k]}</Fragment>)}
            </div>
          ),
        );
        if (cols.length === 1) return <Fragment key={ri}>{cols[0]}</Fragment>;
        // Hai thẻ ngang hàng: thẻ thống kê nằm chung một lưới, còn lại chia đôi
        const allStats = row.every((col) => col.every((k) => k.endsWith('_stats')));
        return (
          <div key={ri} className={allStats ? 'stack' : 'grid-2'}>
            {cols}
          </div>
        );
      })}
    </>
  );
}
