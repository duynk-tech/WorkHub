import { z } from 'zod';

/** Kiểm tra lúc chạy cho dữ liệu khách hàng gửi lên từ form (trước đây chỉ có kiểu TS). */
const optionalText = (max: number) =>
  z.string().trim().max(max).optional().or(z.literal('')).transform((v) => (v ? v : undefined));

export const customerInputSchema = z.object({
  name: z.string().trim().min(1, 'Nhập tên khách hàng').max(191),
  code: optionalText(64),
  contactName: optionalText(191),
  phone: z.string().trim().min(6, 'Số điện thoại không hợp lệ').max(32).regex(/^[0-9+().\s-]+$/, 'Số điện thoại chỉ gồm số và + ( ) - .'),
  email: z.string().trim().max(191).email('Email không hợp lệ').optional().or(z.literal('')).transform((v) => (v ? v : undefined)),
  address: optionalText(500),
  notes: optionalText(5000),
});

export function firstZodMessage(err: z.ZodError) {
  return err.issues[0]?.message ?? 'Dữ liệu không hợp lệ';
}
