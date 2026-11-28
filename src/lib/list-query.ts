/**
 * Tham số danh sách đọc từ URL (page, pageSize, sort, q), dùng chung cho mọi màn
 * phân trang phía server. Hàm thuần, không phụ thuộc Prisma, để kiểm thử được.
 *
 * Quy ước URL: ?page=2&size=50&sort=created&q=abc
 */

export const LIST_PAGE_SIZES = [20, 50, 100] as const;
export const MAX_PAGE_SIZE = 100;

export interface ListQuery<S extends string = string> {
  page: number;
  pageSize: number;
  sort: S;
  q: string;
  skip: number;
  take: number;
}

type RawParams = Record<string, string | string[] | undefined>;

function first(v: string | string[] | undefined): string | undefined {
  return Array.isArray(v) ? v[0] : v;
}

export function parseListQuery<S extends string>(
  sp: RawParams,
  opts: { sorts: readonly S[]; defaultSort: S; defaultPageSize?: number },
): ListQuery<S> {
  const rawPage = Number(first(sp.page));
  const page = Number.isFinite(rawPage) && rawPage >= 1 ? Math.floor(rawPage) : 1;

  const rawSize = Number(first(sp.size));
  const fallback = opts.defaultPageSize ?? 20;
  const pageSize =
    Number.isFinite(rawSize) && rawSize >= 1 ? Math.min(MAX_PAGE_SIZE, Math.floor(rawSize)) : fallback;

  const rawSort = first(sp.sort) as S | undefined;
  const sort = rawSort && opts.sorts.includes(rawSort) ? rawSort : opts.defaultSort;

  const q = (first(sp.q) ?? '').trim().slice(0, 120);

  return { page, pageSize, sort, q, skip: (page - 1) * pageSize, take: pageSize };
}

export interface PageMeta {
  total: number;
  page: number;
  pageSize: number;
  totalPages: number;
  offset: number;
}

export function pageMeta(total: number, page: number, pageSize: number): PageMeta {
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  return { total, page, pageSize, totalPages, offset: (page - 1) * pageSize };
}

export interface Paged<T> extends PageMeta {
  rows: T[];
}

/** Đọc một tham số dạng danh sách phân tách dấu phẩy, chỉ giữ giá trị hợp lệ. */
export function parseListParam<T extends string>(
  v: string | string[] | undefined,
  allowed?: readonly T[],
): T[] {
  const raw = first(v);
  if (!raw) return [];
  const parts = raw.split(',').map((s) => s.trim()).filter(Boolean) as T[];
  return allowed ? parts.filter((p) => allowed.includes(p)) : parts;
}

/** Đọc id số dương từ URL, sai định dạng thì trả null. */
export function parseIdParam(v: string | string[] | undefined): number | null {
  const n = Number(first(v));
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** Đọc ngày yyyy-mm-dd từ URL, sai định dạng thì trả null. */
export function parseDateParam(v: string | string[] | undefined): Date | null {
  const raw = first(v);
  if (!raw || !/^\d{4}-\d{2}-\d{2}$/.test(raw)) return null;
  const d = new Date(`${raw}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}
