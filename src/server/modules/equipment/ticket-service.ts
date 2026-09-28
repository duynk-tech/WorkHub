import { prisma } from '@/lib/prisma';
import { nextSequentialCode } from '@/lib/code-sequence';

/**
 * Phiếu sự cố & sửa chữa máy F&B.
 *
 * Vòng đời: Chờ tiếp nhận → Đã phân công → Đang xử lý → Đã hoàn tất → Đã đóng phiếu.
 * Linh kiện thay thế được xuất kho qua phiếu kho có gắn ticketId, nên giá vốn của
 * ca sửa chữa lấy thẳng từ sổ kho chứ không nhập tay.
 */

export interface SaveTicketInput {
  equipmentId: number;
  customerId?: number | null;
  locationId?: number | null;
  priority: string;
  title: string;
  description?: string;
  reportedBy?: string;
  reportedPhone?: string;
  assignedToId?: number | null;
}

export interface TicketFilter {
  status?: string;
  priority?: string;
  customerId?: number;
  assignedToId?: number;
  search?: string;
  /** Chỉ lấy phiếu chưa đóng. */
  openOnly?: boolean;
}

export async function generateTicketCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `TICK-${year}-`;
  try {
    if (!prisma.serviceTicket) return `${prefix}0001`;
    const rows = await prisma.serviceTicket.findMany({
      where: { ticketCode: { startsWith: prefix } },
      select: { ticketCode: true },
    });
    return nextSequentialCode(prefix, rows.map((r) => r.ticketCode));
  } catch {
    return `${prefix}0001`;
  }
}

const TICKET_INCLUDE = {
  equipment: {
    select: {
      id: true,
      machineCode: true,
      name: true,
      category: true,
      serialNumber: true,
      warrantyExpiresAt: true,
      ownershipType: true,
    },
  },
  customer: { select: { id: true, name: true, phone: true } },
  location: { select: { id: true, name: true, address: true } },
  assignedTo: { select: { id: true, fullName: true, code: true, avatarUrl: true } },
  partsUsed: {
    include: {
      item: { select: { id: true, itemCode: true, name: true, unit: true } },
      transaction: { select: { id: true, transCode: true, createdAt: true } },
    },
  },
} as const;

export async function listServiceTickets(filter: TicketFilter = {}) {
  if (!prisma.serviceTicket) return [];

  const where: any = {};
  if (filter.status && filter.status !== 'ALL') where.status = filter.status;
  if (filter.priority && filter.priority !== 'ALL') where.priority = filter.priority;
  if (filter.customerId) where.customerId = filter.customerId;
  if (filter.assignedToId) where.assignedToId = filter.assignedToId;
  if (filter.openOnly) where.status = { notIn: ['RESOLVED', 'CLOSED'] };
  if (filter.search?.trim()) {
    const q = filter.search.trim();
    where.OR = [
      { ticketCode: { contains: q } },
      { title: { contains: q } },
      { description: { contains: q } },
      { equipment: { machineCode: { contains: q } } },
      { equipment: { name: { contains: q } } },
    ];
  }

  return prisma.serviceTicket.findMany({
    where,
    include: TICKET_INCLUDE,
    orderBy: [{ status: 'asc' }, { createdAt: 'desc' }],
  });
}

export async function getServiceTicket(id: number) {
  if (!prisma.serviceTicket) return null;
  return prisma.serviceTicket.findUnique({ where: { id }, include: TICKET_INCLUDE });
}

export async function getTicketMetrics() {
  if (!prisma.serviceTicket) {
    return { open: 0, inProgress: 0, resolvedThisMonth: 0 };
  }

  const now = new Date();
  const monthStart = new Date(now.getFullYear(), now.getMonth(), 1);

  const [open, inProgress, resolvedThisMonth] = await Promise.all([
    prisma.serviceTicket.count({ where: { status: { in: ['OPEN', 'ASSIGNED'] } } }),
    prisma.serviceTicket.count({ where: { status: 'IN_PROGRESS' } }),
    prisma.serviceTicket.count({
      where: { status: { in: ['RESOLVED', 'CLOSED'] }, resolvedAt: { gte: monthStart } },
    }),
  ]);

  return { open, inProgress, resolvedThisMonth };
}

/** Máy còn bảo hành tại thời điểm báo hỏng thì mặc định không thu tiền. */
export function isUnderWarranty(equipment: { warrantyExpiresAt?: Date | string | null } | null) {
  if (!equipment?.warrantyExpiresAt) return false;
  return new Date(equipment.warrantyExpiresAt) >= new Date(new Date().toDateString());
}

export async function saveServiceTicket(id: number | null, input: SaveTicketInput) {
  const numId = id ? Number(id) : null;
  const data: any = {
    equipmentId: input.equipmentId,
    customerId: input.customerId || null,
    locationId: input.locationId || null,
    priority: input.priority,
    title: input.title.trim(),
    description: input.description?.trim() || null,
    reportedBy: input.reportedBy?.trim() || null,
    reportedPhone: input.reportedPhone?.trim() || null,
    assignedToId: input.assignedToId || null,
  };

  if (numId && !isNaN(numId) && numId > 0) {
    return prisma.serviceTicket.update({
      where: { id: numId },
      data,
      include: TICKET_INCLUDE,
    });
  }

  return prisma.serviceTicket.create({
    data: {
      ...data,
      ticketCode: await generateTicketCode(),
      status: input.assignedToId ? 'ASSIGNED' : 'OPEN',
    },
    include: TICKET_INCLUDE,
  });
}

/** Phân công kỹ thuật viên; phiếu mới tiếp nhận sẽ tự chuyển sang "Đã phân công". */
export async function assignServiceTicket(id: number, assignedToId: number) {
  const ticket = await prisma.serviceTicket.findUnique({ where: { id } });
  if (!ticket) throw new Error('Không tìm thấy phiếu sự cố');

  return prisma.serviceTicket.update({
    where: { id },
    data: {
      assignedToId,
      status: ticket.status === 'OPEN' ? 'ASSIGNED' : ticket.status,
    },
    include: TICKET_INCLUDE,
  });
}

export async function updateTicketStatus(id: number, status: string, resolutionNote?: string) {
  const ticket = await prisma.serviceTicket.findUnique({ where: { id } });
  if (!ticket) throw new Error('Không tìm thấy phiếu sự cố');

  const data: any = { status };
  if (resolutionNote !== undefined) data.resolutionNote = resolutionNote?.trim() || null;
  if ((status === 'RESOLVED' || status === 'CLOSED') && !ticket.resolvedAt) {
    data.resolvedAt = new Date();
  }

  return prisma.serviceTicket.update({ where: { id }, data, include: TICKET_INCLUDE });
}

/** Chi phí linh kiện đã dùng cho phiếu, lấy theo giá vốn đã chốt trên phiếu kho. */
export function ticketPartsCost(ticket: { partsUsed?: any[] }) {
  return (ticket.partsUsed || []).reduce(
    (sum, p) => sum + Number(p.unitCost || p.unitPrice || 0) * p.quantity,
    0,
  );
}

export async function deleteServiceTicket(id: number) {
  const ticket = await prisma.serviceTicket.findUnique({
    where: { id },
    include: { partsUsed: true },
  });
  if (!ticket) return null;
  if (ticket.partsUsed.length > 0) {
    throw new Error(
      'Phiếu đã xuất linh kiện khỏi kho nên không xóa được. Hãy đóng phiếu thay vì xóa.',
    );
  }
  return prisma.serviceTicket.delete({ where: { id } });
}
