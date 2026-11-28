import type { Prisma } from '@prisma/client';
import { prisma } from '@/lib/prisma';
import { pageMeta, type ListQuery } from '@/lib/list-query';
import { QUOTATION_STATUSES } from './types';

export const QUOTATION_SORTS = ['created', 'date', 'total', 'valid'] as const;
export type QuotationSort = (typeof QUOTATION_SORTS)[number];

export interface QuotationListFilter {
  status?: string;
  salespersonId?: number | null;
  customerId?: number | null;
  from?: Date | null;
  to?: Date | null;
}

const ROW_INCLUDE = {
  customer: { select: { id: true, name: true, phone: true, code: true } },
  location: { select: { id: true, name: true, address: true } },
  salesperson: { select: { id: true, fullName: true } },
  items: {
    include: {
      inventoryItem: { select: { id: true, name: true, itemCode: true, unit: true } },
    },
  },
  orders: { select: { id: true, orderCode: true } },
} satisfies Prisma.CustomerQuotationInclude;

function orderBy(sort: QuotationSort): Prisma.CustomerQuotationOrderByWithRelationInput[] {
  switch (sort) {
    case 'date': return [{ quoteDate: 'desc' }, { id: 'desc' }];
    case 'total': return [{ totalAmount: 'desc' }, { id: 'desc' }];
    case 'valid': return [{ validUntil: 'asc' }, { id: 'desc' }];
    default: return [{ createdAt: 'desc' }, { id: 'desc' }];
  }
}

function baseWhere(q: string, f: QuotationListFilter): Prisma.CustomerQuotationWhereInput {
  const and: Prisma.CustomerQuotationWhereInput[] = [];
  if (q) {
    and.push({
      OR: [
        { quoteCode: { contains: q, mode: 'insensitive' } },
        { notes: { contains: q, mode: 'insensitive' } },
        { customer: { name: { contains: q, mode: 'insensitive' } } },
        { customer: { phone: { contains: q } } },
      ],
    });
  }
  if (f.salespersonId) and.push({ salespersonId: f.salespersonId });
  if (f.customerId) and.push({ customerId: f.customerId });
  if (f.from) and.push({ quoteDate: { gte: f.from } });
  if (f.to) and.push({ quoteDate: { lte: f.to } });
  return and.length ? { AND: and } : {};
}

export async function listQuotationsPage(query: ListQuery<QuotationSort>, filter: QuotationListFilter) {
  const base = baseWhere(query.q, filter);
  const status = filter.status && filter.status in QUOTATION_STATUSES ? filter.status : '';
  const where: Prisma.CustomerQuotationWhereInput = status ? { AND: [base, { status }] } : base;

  const [rows, total, groups] = await Promise.all([
    prisma.customerQuotation.findMany({
      where,
      include: ROW_INCLUDE,
      orderBy: orderBy(query.sort),
      skip: query.skip,
      take: query.take,
    }),
    prisma.customerQuotation.count({ where }),
    // Số đếm và giá trị theo trạng thái: theo tìm kiếm đang gõ, không theo trạng thái đang chọn
    prisma.customerQuotation.groupBy({
      by: ['status'],
      where: base,
      _count: { _all: true },
      _sum: { totalAmount: true },
    }),
  ]);

  const statusCounts: Record<string, number> = {};
  let all = 0;
  let totalValue = 0;
  for (const g of groups) {
    statusCounts[g.status] = g._count._all;
    all += g._count._all;
    totalValue += Number(g._sum.totalAmount ?? 0);
  }
  const won = statusCounts.ACCEPTED ?? 0;
  const lost = (statusCounts.REJECTED ?? 0) + (statusCounts.EXPIRED ?? 0);

  return {
    rows,
    summary: {
      all,
      pending: (statusCounts.DRAFT ?? 0) + (statusCounts.SENT ?? 0),
      accepted: won,
      totalValue,
      statusCounts,
      // Tỉ lệ chốt trên các báo giá đã có kết quả (chốt / chốt + từ chối + hết hạn)
      winRate: won + lost > 0 ? won / (won + lost) : null,
    },
    ...pageMeta(total, query.page, query.pageSize),
  };
}
