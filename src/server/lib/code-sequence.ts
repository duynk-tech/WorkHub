import { prisma } from '@/lib/prisma';
import { nextSequentialCode } from '@/lib/code-sequence';

/**
 * Sinh mã chứng từ kế tiếp ngay trong DB.
 *
 * Cách cũ tải MỌI mã trong năm về rồi tìm số lớn nhất bằng JS: chậm dần theo số
 * chứng từ, và lỗi DB bị nuốt thành "...0001" gây trùng mã. Ở đây DB tự tính
 * MAX(số thứ tự) trên đúng các mã có hậu tố toàn chữ số, đúng cả khi số thứ tự
 * vượt quá độ rộng pad (0999 → 1000 → 10000) mà sắp xếp chuỗi sẽ sai.
 *
 * Tên bảng/cột lấy từ danh sách cố định bên dưới, không bao giờ từ input.
 */
const CODE_COLUMNS = {
  Customer: 'code',
  CustomerOrder: 'orderCode',
  CustomerQuotation: 'quoteCode',
  CustomerPayment: 'paymentCode',
  CustomerReturn: 'returnCode',
  ServiceTicket: 'ticketCode',
  SparePartOrder: 'orderCode',
  SupplierPayment: 'paymentCode',
  Task: 'code',
} as const;

export type CodeTable = keyof typeof CODE_COLUMNS;

type RawClient = { $queryRawUnsafe?: (sql: string, ...args: unknown[]) => Promise<unknown> };

export async function nextCode(
  table: CodeTable,
  prefix: string,
  pad = 4,
  db: RawClient = prisma as unknown as RawClient,
): Promise<string> {
  const column = CODE_COLUMNS[table];
  // Client giả trong unit test không có raw query: coi như chưa có mã nào
  if (typeof db.$queryRawUnsafe !== 'function') return nextSequentialCode(prefix, [], pad);

  const start = prefix.length + 1;
  const rows = (await db.$queryRawUnsafe(
    `SELECT MAX(CAST(SUBSTRING("${column}" FROM ${start}) AS BIGINT)) AS max
       FROM "${table}"
      WHERE "${column}" LIKE $1
        AND SUBSTRING("${column}" FROM ${start}) ~ '^[0-9]+$'`,
    `${escapeLike(prefix)}%`,
  )) as { max: bigint | number | null }[];

  const max = Number(rows?.[0]?.max ?? 0);
  return `${prefix}${String(max + 1).padStart(pad, '0')}`;
}

function escapeLike(s: string) {
  return s.replace(/[\\%_]/g, (c) => `\\${c}`);
}

/** Lỗi trùng unique của Prisma (P2002), dùng để thử lại khi hai người tạo cùng lúc. */
export function isUniqueViolation(e: unknown): boolean {
  return typeof e === 'object' && e !== null && (e as { code?: string }).code === 'P2002';
}

/**
 * Chạy `create(code)` với mã mới; nếu đụng unique do người khác vừa lấy mất mã
 * đó thì sinh lại và thử tiếp (tối đa `attempts` lần).
 */
export async function withFreshCode<T>(
  gen: () => Promise<string>,
  create: (code: string) => Promise<T>,
  attempts = 4,
): Promise<T> {
  let lastError: unknown;
  for (let i = 0; i < attempts; i++) {
    const code = await gen();
    try {
      return await create(code);
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      lastError = e;
    }
  }
  throw lastError;
}
