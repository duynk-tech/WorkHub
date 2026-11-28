import { z } from 'zod';
import { TICKET_PRIORITIES } from './types';

const optionalText = (max: number) =>
  z.string().trim().max(max).optional().nullable().transform((v) => (v ? v : undefined));
const optionalId = z.number().int().positive().nullable().optional();

/** Kiểm tra lúc chạy cho phiếu sự cố gửi lên từ form / MCP. */
export const ticketInputSchema = z.object({
  equipmentId: z.number().int().positive({ message: 'Chọn máy gặp sự cố' }),
  customerId: optionalId,
  locationId: optionalId,
  priority: z.string().refine((p) => p in TICKET_PRIORITIES, 'Mức độ không hợp lệ'),
  title: z.string().trim().min(1, 'Nhập tiêu đề sự cố').max(255),
  description: optionalText(5000),
  reportedBy: optionalText(191),
  reportedPhone: optionalText(32),
  assignedToId: optionalId,
});
