'use server';

import { revalidatePath } from 'next/cache';
import { requireAuth, can } from '@/server/auth/context';
import {
  listServiceTickets,
  getServiceTicket,
  saveServiceTicket,
  assignServiceTicket,
  updateTicketStatus,
  deleteServiceTicket,
  type SaveTicketInput,
  type TicketFilter,
} from './ticket-service';

function canManageTickets(ctx: any) {
  return (
    can(ctx, 'FEATURE_EQUIPMENT_MAINTENANCE') || can(ctx, 'FEATURE_EQUIPMENT_MANAGE') || ctx.isAdmin
  );
}

export async function listTicketsAction(filter: TicketFilter) {
  await requireAuth();
  try {
    const tickets = await listServiceTickets(filter);
    return { ok: true, message: '', tickets: JSON.parse(JSON.stringify(tickets)) };
  } catch (error: any) {
    console.error('[listTicketsAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi đọc danh sách phiếu sự cố' };
  }
}

export async function getTicketAction(id: number) {
  await requireAuth();
  try {
    const ticket = await getServiceTicket(id);
    if (!ticket) return { ok: false, message: 'Không tìm thấy phiếu sự cố' };
    return { ok: true, message: '', ticket: JSON.parse(JSON.stringify(ticket)) };
  } catch (error: any) {
    return { ok: false, message: error.message || 'Lỗi khi đọc phiếu sự cố' };
  }
}

export async function saveTicketAction(id: number | null, input: SaveTicketInput) {
  const ctx = await requireAuth();
  if (!canManageTickets(ctx)) {
    return { ok: false, message: 'Bạn không có quyền xử lý phiếu sự cố' };
  }

  try {
    const ticket = await saveServiceTicket(id, input);
    revalidatePath('/tickets');
    revalidatePath('/spare-parts');
    if (input.customerId) revalidatePath(`/customers/${input.customerId}`);
    return {
      ok: true,
      message: id ? 'Đã cập nhật phiếu sự cố' : `Đã tạo phiếu sự cố ${ticket.ticketCode}`,
      ticket: JSON.parse(JSON.stringify(ticket)),
    };
  } catch (error: any) {
    console.error('[saveTicketAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi lưu phiếu sự cố' };
  }
}

export async function assignTicketAction(id: number, assignedToId: number) {
  const ctx = await requireAuth();
  if (!canManageTickets(ctx)) {
    return { ok: false, message: 'Bạn không có quyền phân công kỹ thuật' };
  }

  try {
    const ticket = await assignServiceTicket(id, assignedToId);
    revalidatePath('/tickets');
    return {
      ok: true,
      message: `Đã phân công ${ticket.assignedTo?.fullName || ''} xử lý ${ticket.ticketCode}`.trim(),
      ticket: JSON.parse(JSON.stringify(ticket)),
    };
  } catch (error: any) {
    console.error('[assignTicketAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi phân công' };
  }
}

export async function updateTicketStatusAction(id: number, status: string, resolutionNote?: string) {
  const ctx = await requireAuth();
  if (!canManageTickets(ctx)) {
    return { ok: false, message: 'Bạn không có quyền đổi trạng thái phiếu' };
  }

  try {
    const ticket = await updateTicketStatus(id, status, resolutionNote);
    revalidatePath('/tickets');
    revalidatePath('/spare-parts');
    if (ticket.customerId) revalidatePath(`/customers/${ticket.customerId}`);
    return {
      ok: true,
      message: 'Đã cập nhật trạng thái phiếu sự cố',
      ticket: JSON.parse(JSON.stringify(ticket)),
    };
  } catch (error: any) {
    console.error('[updateTicketStatusAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi cập nhật trạng thái' };
  }
}

export async function deleteTicketAction(id: number) {
  const ctx = await requireAuth();
  if (!canManageTickets(ctx)) {
    return { ok: false, message: 'Bạn không có quyền xóa phiếu sự cố' };
  }

  try {
    await deleteServiceTicket(id);
    revalidatePath('/tickets');
    return { ok: true, message: 'Đã xóa phiếu sự cố' };
  } catch (error: any) {
    console.error('[deleteTicketAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi xóa phiếu sự cố' };
  }
}

/**
 * Đóng phiếu và lập đơn dịch vụ thu tiền.
 * Linh kiện lấy từ phiếu kho đã xuất cho ca sửa này, cộng thêm tiền công.
 */
export async function closeTicketWithBillingAction(
  id: number,
  input: { resolutionNote?: string; laborFee?: number; billParts?: boolean; vatRate?: number },
) {
  const ctx = await requireAuth();
  if (!canManageTickets(ctx)) {
    return { ok: false, message: 'Bạn không có quyền đóng phiếu sự cố' };
  }

  try {
    const ticket = await getServiceTicket(id);
    if (!ticket) return { ok: false, message: 'Không tìm thấy phiếu sự cố' };

    const labor = Math.max(0, Number(input.laborFee) || 0);
    const parts = input.billParts ? ticket.partsUsed || [] : [];

    let orderCode: string | null = null;

    if (ticket.customerId && (labor > 0 || parts.length > 0)) {
      const { saveCustomerOrder } = await import('@/server/modules/customer/service');
      const order = await saveCustomerOrder(null, {
        customerId: ticket.customerId,
        locationId: ticket.locationId || undefined,
        orderType: 'SERVICE',
        status: 'DELIVERED',
        // Quy doanh thu ca sửa về đúng máy khi tính lãi/lỗ vòng đời
        serviceTicketId: ticket.id,
        vatRate: Number(input.vatRate) || 0,
        notes: `Sửa chữa theo phiếu ${ticket.ticketCode} — ${ticket.title}`,
        items: [
          ...(labor > 0
            ? [
                {
                  itemType: 'SERVICE',
                  name: `Công sửa chữa theo phiếu ${ticket.ticketCode}`,
                  quantity: 1,
                  unitPrice: labor,
                },
              ]
            : []),
          ...parts.map((p: any) => ({
            itemType: 'SPARE_PART',
            name: p.item?.name || 'Linh kiện thay thế',
            quantity: p.quantity,
            // Linh kiện đã xuất kho rồi nên đơn này chỉ để thu tiền, không trừ kho lần nữa
            unitPrice: Number(p.item?.sellingPrice || p.unitPrice || 0),
          })),
        ],
      });
      orderCode = order.orderCode;

      // Đơn sinh từ sửa chữa coi như đã giao hàng, không cần xuất kho lại
      await import('@/lib/prisma').then(({ prisma }) =>
        prisma.customerOrder.update({
          where: { id: order.id },
          data: { stockIssuedAt: new Date() },
        }),
      );
    }

    await updateTicketStatus(id, 'CLOSED', input.resolutionNote);

    revalidatePath('/tickets');
    revalidatePath('/spare-parts');
    if (ticket.customerId) revalidatePath(`/customers/${ticket.customerId}`);

    return {
      ok: true,
      message: orderCode
        ? `Đã đóng phiếu và lập đơn dịch vụ ${orderCode}`
        : 'Đã đóng phiếu (không thu tiền)',
      orderCode,
    };
  } catch (error: any) {
    console.error('[closeTicketWithBillingAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi đóng phiếu' };
  }
}
