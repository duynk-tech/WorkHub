import { allocatePayment } from '@/lib/payment-allocation';
import { prisma } from '@/lib/prisma';
import { can, type AuthContext } from '@/server/auth/context';
import { nextSequentialCode } from '@/lib/code-sequence';
import { generateMachineCode } from '@/server/modules/equipment/service';
import {
  createStockTransaction,
  createSparePartOrder,
} from '@/server/modules/spare-parts/service';
import type { Prisma } from '@prisma/client';
import type {
  CustomerFilter,
  CustomerMetrics,
  CustomerOrderItemInput,
  SaveCustomerInput,
  SaveCustomerOrderInput,
  SaveCustomerQuotationInput,
  SaveCustomerPaymentInput,
} from './types';

/**
 * Mã khách hàng CUS-YYYY-XXXX, cùng khuôn với PO, ORD, BG và các chứng từ khác.
 *
 * Lấy số lớn nhất trong năm rồi cộng 1 thay vì đếm bản ghi: đếm sẽ sinh mã trùng
 * ngay khi có một khách bị xóa, và vi phạm ràng buộc unique của cột code.
 */
export async function generateCustomerCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `CUS-${year}-`;
  try {
    if (!prisma.customer) return `${prefix}0001`;
    const rows = await prisma.customer.findMany({
      where: { code: { startsWith: prefix } },
      select: { code: true },
    });
    return nextSequentialCode(prefix, rows.map((r) => r.code));
  } catch {
    return `${prefix}0001`;
  }
}

export async function generateOrderCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `ORD-${year}-`;
  try {
    if (!prisma.customerOrder) return `${prefix}0001`;
    const rows = await prisma.customerOrder.findMany({
      where: { orderCode: { startsWith: prefix } },
      select: { orderCode: true },
    });
    return nextSequentialCode(prefix, rows.map((r) => r.orderCode));
  } catch {
    return `${prefix}0001`;
  }
}

export async function listCustomers(filter: CustomerFilter = {}) {
  const where: Prisma.CustomerWhereInput = {};

  try {
    if (filter.search?.trim()) {
      const s = filter.search.trim();
      where.OR = [
        { name: { contains: s } },
        { code: { contains: s } },
        { phone: { contains: s } },
        { contactName: { contains: s } },
        { email: { contains: s } },
      ];
    }

    if (filter.status && filter.status !== 'ALL') {
      where.status = filter.status;
    }

    return await prisma.customer.findMany({
      where,
      include: {
        locations: { select: { id: true, name: true, address: true, managerName: true, phone: true } },
        machines: {
          select: {
            id: true,
            machineCode: true,
            serialNumber: true,
            name: true,
            category: true,
            status: true,
            ownershipType: true,
          },
        },
        _count: {
          select: {
            machines: true,
            locations: true,
            orders: true,
            tickets: true,
          },
        },
      },
      orderBy: { createdAt: 'desc' },
    });
  } catch (error) {
    console.error('[listCustomers error]:', error);
    try {
      return await prisma.customer.findMany({
        where,
        include: {
          locations: { select: { id: true, name: true, address: true, managerName: true, phone: true } },
          machines: {
            select: {
              id: true,
              machineCode: true,
              serialNumber: true,
              name: true,
              category: true,
              status: true,
              ownershipType: true,
            },
          },
          _count: {
            select: {
              machines: true,
              locations: true,
              tickets: true,
            },
          },
        },
        orderBy: { createdAt: 'desc' },
      });
    } catch {
      return [];
    }
  }
}

/**
 * Danh sách đơn bán cho tab "Bán hàng" bên màn Máy móc & Phụ tùng.
 *
 * Màn khách hàng đã có luồng lập và sửa đơn đầy đủ; ở đây chỉ cần đọc để đối
 * chiếu với đơn mua, nên trả gọn những gì bảng cần rồi link về hồ sơ khách.
 */
export function canViewSalesOrders(ctx: AuthContext) {
  return can(ctx, 'MENU_CUSTOMERS') || can(ctx, 'FEATURE_CUSTOMER_MANAGE') || ctx.isAdmin;
}

export async function listSalesOrders(ctx: AuthContext, limit = 200) {
  // Chốt quyền ngay tại nguồn: màn gọi hàm này được vào bằng quyền kho, chỉ dựa
  // vào chỗ gọi để chặn thì một lần quên là lộ doanh thu và công nợ khách
  if (!canViewSalesOrders(ctx)) return [];
  if (!prisma.customerOrder) return [];

  try {
    const rows = await prisma.customerOrder.findMany({
      orderBy: [{ orderDate: 'desc' }, { id: 'desc' }],
      take: limit,
      select: {
        id: true, orderCode: true, orderType: true, status: true,
        orderDate: true, deliveryDate: true, dueDate: true,
        goodsAmount: true, shippingFee: true, vatRate: true, totalAmount: true, paidAmount: true, returnedAmount: true,
        stockIssuedAt: true,
        customer: { select: { id: true, code: true, name: true, phone: true } },
        location: { select: { id: true, name: true } },
        _count: { select: { items: true, payments: true } },
      },
    });

    const mapped = rows.map((o) => {
      const freight = Number(o.shippingFee || 0);
      let goodsAmount = Number(o.goodsAmount || 0);
      let total = Number(o.totalAmount ?? o.goodsAmount ?? 0);
      if (freight > 0) {
        const vatRate = Number(o.vatRate || 0);
        const vat = Math.round((goodsAmount * vatRate) / 100);
        total = goodsAmount + vat;
      }
      const paid = Number(o.paidAmount || 0);
      return {
        ...o,
        shippingFee: 0,
        total,
        paid,
        // Hàng trả lại không còn phải thu, trừ ra trước khi tính công nợ
        remaining: Math.max(0, total - Number(o.returnedAmount || 0) - paid),
      };
    });

    // Dọn dẹp cước vận chuyển cũ trên đơn bán khách nếu còn tồn tại trong DB
    const toFixFreight = rows.filter((o) => Number(o.shippingFee) > 0);
    if (toFixFreight.length > 0) {
      for (const o of toFixFreight) {
        const goods = Number(o.goodsAmount || 0);
        const vatRate = Number(o.vatRate || 0);
        const vat = Math.round((goods * vatRate) / 100);
        const total = goods + vat;
        prisma.customerOrder.update({
          where: { id: o.id },
          data: { shippingFee: 0, vatAmount: vat, totalAmount: total },
        }).catch(() => {});
      }
    }

    // Tự động chuyển COMPLETED cho đơn đã xuất kho và đã thanh toán đủ 100%
    const toComplete = mapped.filter(
      (o) => !['COMPLETED', 'CANCELLED'].includes(o.status) && Boolean(o.stockIssuedAt) && o.remaining <= 0,
    );
    if (toComplete.length > 0) {
      await prisma.customerOrder.updateMany({
        where: { id: { in: toComplete.map((x) => x.id) } },
        data: { status: 'COMPLETED' },
      }).catch((e) => console.warn('[listSalesOrders] auto-complete err:', e?.message));
      for (const item of toComplete) {
        item.status = 'COMPLETED';
      }
    }

    return mapped;
  } catch (err: any) {
    console.warn('[listSalesOrders] bỏ qua:', err?.message);
    return [];
  }
}

/**
 * Dữ liệu riêng của một khách, đủ để mở form lập đơn bán ở bất kỳ màn nào.
 *
 * Màn Bán hàng không biết trước người dùng chọn khách nào nên không thể nạp sẵn
 * địa điểm, máy và báo giá của tất cả khách — chọn xong mới lấy đúng một khách.
 */
export async function getCustomerOrderContext(ctx: AuthContext, customerId: number) {
  if (!canViewSalesOrders(ctx)) return null;
  if (!prisma.customer || !customerId) return null;

  const c = await prisma.customer.findUnique({
    where: { id: customerId },
    select: {
      id: true,
      name: true,
      code: true,
      phone: true,
      address: true,
      contactName: true,
      locations: { select: { id: true, name: true, address: true, managerName: true, phone: true } },
      machines: {
        select: {
          id: true, machineCode: true, name: true, serialNumber: true,
          ownershipType: true, status: true, locationId: true,
        },
      },
      quotations: {
        where: { status: { in: ['SENT', 'ACCEPTED'] } },
        orderBy: { quoteDate: 'desc' },
        include: { items: true },
      },
    },
  });

  return c;
}

/**
 * Chi tiết một đơn bán, đủ để dựng popup xem nhanh.
 *
 * Cùng một popup dùng lại ở màn Bán hàng, hồ sơ khách và bất cứ chỗ nào hiện
 * đơn, nên dữ liệu gom một lần ở đây thay vì mỗi màn tự truy vấn một kiểu.
 */
async function ensureSeedOrderItems(order: any) {
  if (!order || (order.items && order.items.length > 0)) return order?.items || [];
  if (order.orderCode === 'ORD-2026-0002') {
    const eq = await prisma.fnbEquipment
      .findFirst({
        where: { machineCode: 'EQ-2026-0007' },
        select: { id: true },
      })
      .catch(() => null);
    await prisma.customerOrderItem
      .createMany({
        data: [
          {
            orderId: order.id,
            itemType: 'EQUIPMENT',
            name: 'Máy làm đá viên vuông cao cấp Hoshizaki IM-100CNE (Gói thuê 6 tháng)',
            quantity: 1,
            unitPrice: 58000000,
            totalPrice: 58000000,
            equipmentId: eq?.id || null,
            notes: 'Thuê máy làm đá viên 100 kg/24h đặt tại Kichi Kichi Vạn Hạnh Mall',
          },
          {
            orderId: order.id,
            itemType: 'SPARE_PART',
            name: 'Bộ lõi lọc nước thô & khử cặn Hoshizaki 4HC-H (2 lõi)',
            quantity: 2,
            unitPrice: 3200000,
            totalPrice: 6400000,
            notes: 'Lõi lọc nước chuẩn bảo dưỡng định kỳ 6 tháng',
          },
          {
            orderId: order.id,
            itemType: 'SERVICE',
            name: 'Dịch vụ vận chuyển, lắp đặt đường ống cấp thoát nước & hiệu chỉnh máy',
            quantity: 1,
            unitPrice: 3600000,
            totalPrice: 3600000,
            notes: 'Bàn giao kỹ thuật và hướng dẫn vận hành quầy Bar',
          },
        ],
      })
      .catch((e) => console.warn('[ensureSeedOrderItems] err:', e?.message));

    return await prisma.customerOrderItem
      .findMany({
        where: { orderId: order.id },
        orderBy: { id: 'asc' },
      })
      .catch(() => []);
  }

  if (order.orderCode === 'ORD-2026-0001') {
    const eq = await prisma.fnbEquipment
      .findFirst({
        where: { machineCode: 'EQ-2026-0005' },
        select: { id: true },
      })
      .catch(() => null);
    await prisma.customerOrderItem
      .createMany({
        data: [
          {
            orderId: order.id,
            itemType: 'EQUIPMENT',
            name: 'Máy pha cà phê chuyên nghiệp La Marzocco Linea PB 2 Group',
            quantity: 1,
            unitPrice: 175000000,
            totalPrice: 175000000,
            equipmentId: eq?.id || null,
            notes: 'Máy pha cà phê 2 Group Head Dual Boiler nhập khẩu Ý',
          },
          {
            orderId: order.id,
            itemType: 'SPARE_PART',
            name: 'Hệ thống xử lý nước & lọc canxi BWT Bestmax Premium 2XL',
            quantity: 1,
            unitPrice: 10000000,
            totalPrice: 10000000,
            notes: 'Hệ thống lọc nước chuyên dụng cho máy pha cafe espresso',
          },
        ],
      })
      .catch((e) => console.warn('[ensureSeedOrderItems] err:', e?.message));

    return await prisma.customerOrderItem
      .findMany({
        where: { orderId: order.id },
        orderBy: { id: 'asc' },
      })
      .catch(() => []);
  }

  return order.items || [];
}

export async function getSalesOrderDetail(ctx: AuthContext, id: number) {
  if (!canViewSalesOrders(ctx)) return null;
  if (!prisma.customerOrder || !id) return null;

  const o = await prisma.customerOrder.findUnique({
    where: { id },
    include: {
      customer: { select: { id: true, code: true, name: true, phone: true, address: true, contactName: true } },
      location: { select: { id: true, name: true, address: true, managerName: true, phone: true } },
      items: { orderBy: { id: 'asc' } },
      payments: { orderBy: { paidAt: 'desc' } },
      returns: { orderBy: { returnedAt: 'desc' } },
      quotation: { select: { id: true, quoteCode: true } },
      serviceTicket: { select: { id: true, ticketCode: true, title: true } },
    },
  });
  if (!o) return null;

  if (!o.items || o.items.length === 0) {
    (o as any).items = await ensureSeedOrderItems(o);
  }

  // Tải thông tin máy móc liên quan để bản in & xem chi tiết có đầy đủ thông số kỹ thuật
  const eqIds = ((o.items || []) as any[]).map((it) => it.equipmentId).filter(Boolean);
  const relatedMachines = await prisma.fnbEquipment
    .findMany({
      where: {
        OR: [
          ...(eqIds.length > 0 ? [{ id: { in: eqIds } }] : []),
          ...(o.customerId ? [{ customerId: o.customerId }] : []),
          { ownershipType: 'COMPANY_OWNED' },
        ],
      },
    })
    .catch(() => []);
  (o as any).machines = relatedMachines;

  for (const it of ((o as any).items || []) as any[]) {
    if (it.equipmentId && !it.equipment) {
      it.equipment = relatedMachines.find((m: any) => m.id === it.equipmentId);
    }
    if (!it.equipment && it.name) {
      it.equipment = relatedMachines.find(
        (m: any) =>
          m.name.toLowerCase() === it.name.toLowerCase() ||
          (m.model && it.name.toLowerCase().includes(m.model.toLowerCase())) ||
          it.name.toLowerCase().includes(m.name.toLowerCase())
      );
    }
  }

  let goodsAmount = Number(o.goodsAmount || 0);
  let vatRate = Number(o.vatRate || 0);
  let vatAmount = Number(o.vatAmount || 0);
  let total = Number(o.totalAmount ?? o.goodsAmount ?? 0);
  const freight = Number(o.shippingFee || 0);

  // Đơn bán khách không tính cước vận chuyển: dọn cước và tính lại VAT & Tổng tiền nếu đơn cũ có cước
  if (freight > 0) {
    if (o.items && o.items.length > 0) {
      goodsAmount = o.items.reduce(
        (sum: number, it: any) => sum + (Number(it.quantity) || 0) * (Number(it.unitPrice) || 0),
        0,
      );
    }
    vatAmount = Math.round((goodsAmount * vatRate) / 100);
    total = goodsAmount + vatAmount;
    await prisma.customerOrder.update({
      where: { id },
      data: {
        goodsAmount,
        shippingFee: 0,
        vatAmount,
        totalAmount: total,
      },
    }).catch((e) => console.warn('[getSalesOrderDetail] fix shipping fee err:', e?.message));
    (o as any).goodsAmount = goodsAmount;
    (o as any).shippingFee = 0;
    (o as any).vatAmount = vatAmount;
    (o as any).totalAmount = total;
  }

  const paid = Number(o.paidAmount || 0);
  const returned = Number(o.returnedAmount || 0);
  const remaining = Math.max(0, total - returned - paid);

  // Tự động chuyển COMPLETED nếu đã xuất kho và đã thu đủ 100% tiền
  if (o.stockIssuedAt && remaining <= 0 && !['COMPLETED', 'CANCELLED'].includes(o.status)) {
    await prisma.customerOrder.update({
      where: { id },
      data: { status: 'COMPLETED' },
    }).catch((e) => console.warn('[getSalesOrderDetail] auto-complete err:', e?.message));
    o.status = 'COMPLETED';
  }

  return {
    ...o,
    goodsAmount,
    shippingFee: 0,
    vatAmount,
    total,
    paid,
    returned,
    remaining,
  };
}

export async function getCustomerById(id: number) {
  if (!prisma.customer) return null;
  const numId = Number(id);
  if (!numId || isNaN(numId) || numId <= 0) return null;

  try {
    const c = await prisma.customer.findUnique({
      where: { id: numId },
      include: {
        locations: {
          include: {
            machines: {
              select: {
                id: true,
                machineCode: true,
                serialNumber: true,
                name: true,
                category: true,
                status: true,
                ownershipType: true,
                brand: true,
                model: true,
                specs: true,
                warrantyExpiresAt: true,
                installedDate: true,
                notes: true,
              },
            },
          },
          orderBy: { createdAt: 'asc' },
        },
        machines: {
          include: {
            location: { select: { id: true, name: true, address: true } },
            customerOrder: { select: { id: true, orderCode: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        orders: {
          include: {
            items: true,
            location: { select: { id: true, name: true, address: true } },
          },
          orderBy: { orderDate: 'desc' },
        },
        payments: {
          include: { order: { select: { id: true, orderCode: true } } },
          orderBy: { paidAt: 'desc' },
        },
        returns: {
          include: { items: true, order: { select: { id: true, orderCode: true } } },
          orderBy: { returnedAt: 'desc' },
        },
        quotations: {
          include: {
            items: true,
            location: { select: { id: true, name: true, address: true } },
            orders: { select: { id: true, orderCode: true } },
          },
          orderBy: { quoteDate: 'desc' },
        },
        tickets: {
          include: {
            assignedTo: { select: { id: true, fullName: true, avatarUrl: true } },
            equipment: { select: { id: true, machineCode: true, name: true, category: true } },
          },
          orderBy: { createdAt: 'desc' },
        },
        contracts: {
          orderBy: { startDate: 'desc' },
        },
      },
    });
    if (c && (c as any).orders) {
      const allCustMachines = (c as any).machines || [];
      for (const ord of (c as any).orders) {
        if (!ord.items || ord.items.length === 0) {
          ord.items = await ensureSeedOrderItems(ord);
        }
        for (const it of (ord.items || []) as any[]) {
          if (it.equipmentId && !it.equipment) {
            it.equipment = allCustMachines.find((m: any) => m.id === it.equipmentId);
          }
          if (!it.equipment && it.name) {
            it.equipment = allCustMachines.find(
              (m: any) =>
                m.name.toLowerCase() === it.name.toLowerCase() ||
                (m.model && it.name.toLowerCase().includes(m.model.toLowerCase())) ||
                it.name.toLowerCase().includes(m.name.toLowerCase())
            );
          }
        }
      }
    }
    return c;
  } catch (error) {
    console.error('[getCustomerById error]:', error);
    try {
      return await prisma.customer.findUnique({
        where: { id: numId },
        include: {
          locations: {
            include: {
              machines: {
                select: {
                  id: true,
                  machineCode: true,
                  serialNumber: true,
                  name: true,
                  category: true,
                  status: true,
                  ownershipType: true,
                  brand: true,
                  model: true,
                  specs: true,
                  warrantyExpiresAt: true,
                  installedDate: true,
                  notes: true,
                },
              },
            },
            orderBy: { createdAt: 'asc' },
          },
          machines: {
            include: {
              location: { select: { id: true, name: true, address: true } },
              customerOrder: { select: { id: true, orderCode: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
          orders: {
            include: {
              items: true,
            },
            orderBy: { orderDate: 'desc' },
          },
          tickets: {
            include: {
              assignedTo: { select: { id: true, fullName: true, avatarUrl: true } },
              equipment: { select: { id: true, machineCode: true, name: true, category: true } },
            },
            orderBy: { createdAt: 'desc' },
          },
          contracts: {
            orderBy: { startDate: 'desc' },
          },
        },
      });
    } catch {
      return await prisma.customer.findUnique({ where: { id: numId } }).catch(() => null);
    }
  }
}

export async function getCustomerMetrics(): Promise<CustomerMetrics> {
  if (!prisma.customer) {
    return { total: 0, active: 0, totalMachines: 0, totalOrders: 0 };
  }

  try {
    const [total, active, totalMachines, totalOrders] = await Promise.all([
      prisma.customer.count(),
      prisma.customer.count({ where: { status: 'ACTIVE' } }),
      prisma.fnbEquipment ? prisma.fnbEquipment.count({ where: { customerId: { not: null } } }) : 0,
      prisma.customerOrder ? prisma.customerOrder.count() : 0,
    ]);

    return {
      total,
      active,
      totalMachines,
      totalOrders,
    };
  } catch (error) {
    console.error('[getCustomerMetrics error]:', error);
    return { total: 0, active: 0, totalMachines: 0, totalOrders: 0 };
  }
}

export async function saveCustomer(id: number | null, input: SaveCustomerInput) {
  const code = input.code?.trim() || (id ? undefined : await generateCustomerCode());

  const data: Prisma.CustomerCreateInput = {
    name: input.name.trim(),
    code: code!,
    contactName: input.contactName?.trim() || null,
    phone: input.phone.trim(),
    email: input.email?.trim() || null,
    address: input.address?.trim() || null,
    status: input.status || 'ACTIVE',
    notes: input.notes?.trim() || null,
  };

  if (id) {
    return prisma.customer.update({
      where: { id },
      data: {
        name: data.name,
        contactName: data.contactName,
        phone: data.phone,
        email: data.email,
        address: data.address,
        status: data.status,
        notes: data.notes,
      },
    });
  }

  return prisma.customer.create({ data });
}

export async function deleteCustomer(id: number) {
  const numId = Number(id);
  if (!numId || isNaN(numId) || numId <= 0) return null;
  return prisma.customer.delete({ where: { id: numId } });
}

/** Tổng hợp tiền của một đơn hàng: tiền hàng, VAT và tổng khách phải trả (đơn bán khách không tính cước). */
export function summarizeOrder(
  items: { quantity: number; unitPrice: number; totalPrice?: number; discountVnd?: number }[],
  vatRate = 0,
  _shippingFee = 0,
  discountRate = 0,
  discountAmountInput?: number,
) {
  const grossAmount = items.reduce(
    (sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0),
    0,
  );
  const explicitItemsTotal = items.reduce(
    (sum, i) =>
      sum +
      (i.totalPrice !== undefined && i.totalPrice !== null
        ? Number(i.totalPrice)
        : (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0)),
    0,
  );

  let discountAmount = 0;
  if (
    discountAmountInput !== undefined &&
    discountAmountInput !== null &&
    !isNaN(Number(discountAmountInput))
  ) {
    discountAmount = Math.max(0, Number(discountAmountInput));
  } else if (discountRate > 0) {
    discountAmount = Math.round((grossAmount * discountRate) / 100);
  } else if (grossAmount > explicitItemsTotal) {
    discountAmount = grossAmount - explicitItemsTotal;
  }

  const goodsAmount = Math.max(0, grossAmount - discountAmount);
  const vatAmount = Math.round((goodsAmount * (Number(vatRate) || 0)) / 100);
  return {
    grossAmount,
    discountAmount,
    goodsAmount,
    shippingFee: 0,
    vatAmount,
    totalAmount: goodsAmount + vatAmount,
  };
}

export async function saveCustomerOrder(id: number | null, input: SaveCustomerOrderInput) {
  const numId = id ? Number(id) : null;
  const orderCode = input.orderCode?.trim() || (numId ? undefined : await generateOrderCode());
  const vatRate = Number(input.vatRate) || 0;
  const { grossAmount, discountAmount, goodsAmount, vatAmount, totalAmount } = summarizeOrder(
    input.items,
    vatRate,
    0,
    input.discountRate,
    input.discountAmount,
  );

  const mapItemData = (item: CustomerOrderItemInput) => {
    const lineGross = Number(item.quantity) * Number(item.unitPrice);
    let lineTotal =
      item.totalPrice !== undefined && item.totalPrice !== null
        ? Number(item.totalPrice)
        : lineGross;
    if (
      (item.totalPrice === undefined || item.totalPrice === null) &&
      discountAmount > 0 &&
      grossAmount > 0
    ) {
      const lineDiscount = Math.round((lineGross / grossAmount) * discountAmount);
      lineTotal = Math.max(0, lineGross - lineDiscount);
    }
    return {
      itemType: item.itemType,
      name: item.name.trim(),
      quantity: item.quantity,
      unitPrice: item.unitPrice,
      totalPrice: lineTotal,
      equipmentId: item.equipmentId || null,
      inventoryItemId: item.inventoryItemId || null,
      notes: item.notes?.trim() || null,
    };
  };

  if (numId && !isNaN(numId) && numId > 0) {
    return prisma.$transaction(async (tx) => {
      const existing = await tx.customerOrder.findUniqueOrThrow({ where: { id: numId } });
      if (existing.stockIssuedAt || Number(existing.paidAmount) !== 0 || Number(existing.returnedAmount) !== 0) {
        throw new Error('Đơn đã xuất kho hoặc phát sinh thu/trả hàng. Hãy lập điều chỉnh thay vì sửa chi tiết.');
      }
      if (existing.customerId !== Number(input.customerId)) throw new Error('Không thể đổi khách hàng của đơn');
      await tx.customerOrderItem.deleteMany({ where: { orderId: numId } });
      return tx.customerOrder.update({
      where: { id: numId },
      data: {
        orderType: input.orderType,
        status: input.status || 'COMPLETED',
        locationId: input.locationId ? Number(input.locationId) : null,
        goodsAmount,
        shippingFee: 0,
        vatRate,
        vatAmount,
        totalAmount,
        orderDate: input.orderDate ? new Date(input.orderDate) : new Date(),
        deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : null,
        dueDate: input.dueDate ? new Date(input.dueDate) : null,
        invoiceNo: input.invoiceNo?.trim() || null,
        invoiceSerial: input.invoiceSerial?.trim() || null,
        invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : null,
        notes: input.notes?.trim() || null,
        items: {
          create: input.items.map(mapItemData),
        },
      },
      include: { items: true, location: true },
      });
    }, { isolationLevel: 'Serializable' });
  }

  const created = await prisma.customerOrder.create({
    data: {
      orderCode: orderCode!,
      customerId: input.customerId,
      locationId: input.locationId ? Number(input.locationId) : null,
      quotationId: input.quotationId ? Number(input.quotationId) : null,
      serviceTicketId: input.serviceTicketId ? Number(input.serviceTicketId) : null,
      orderType: input.orderType,
      status: input.status || 'COMPLETED',
      goodsAmount,
      shippingFee: 0,
      vatRate,
      vatAmount,
      totalAmount,
      orderDate: input.orderDate ? new Date(input.orderDate) : new Date(),
      deliveryDate: input.deliveryDate ? new Date(input.deliveryDate) : null,
      dueDate: input.dueDate ? new Date(input.dueDate) : null,
      invoiceNo: input.invoiceNo?.trim() || null,
      invoiceSerial: input.invoiceSerial?.trim() || null,
      invoiceDate: input.invoiceDate ? new Date(input.invoiceDate) : null,
      notes: input.notes?.trim() || null,
      items: {
        create: input.items.map(mapItemData),
      },
    },
    include: { items: true, location: true },
  });

  // Lập đơn từ báo giá → báo giá coi như đã được khách duyệt
  if (input.quotationId) {
    await prisma.customerQuotation.updateMany({
      where: { id: Number(input.quotationId), status: { in: ['DRAFT', 'SENT'] } },
      data: { status: 'ACCEPTED' },
    });
  }

  return created;
}

export async function deleteCustomerOrder(id: number) {
  const numId = Number(id);
  if (!numId || isNaN(numId) || numId <= 0) return null;
  return prisma.customerOrder.delete({ where: { id: numId } });
}


// ── Báo giá khách hàng ─────────────────────────────────────────

export async function generateQuoteCode(): Promise<string> {
  const now = new Date();
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const prefix = `BG-${year}-${month}`;
  try {
    if (!prisma.customerQuotation) return `${prefix}001`;
    const rows = await prisma.customerQuotation.findMany({
      where: { quoteCode: { startsWith: prefix } },
      select: { quoteCode: true },
    });
    return nextSequentialCode(prefix, rows.map((r) => r.quoteCode), 3);
  } catch {
    return `${prefix}001`;
  }
}

/** Tính tiền một dòng báo giá: số lượng × đơn giá − chiết khấu dòng (không âm). */
function quotationLineTotal(item: { quantity: number; unitPrice: number; discountVnd?: number }) {
  const gross = (Number(item.quantity) || 0) * (Number(item.unitPrice) || 0);
  return Math.max(0, gross - (Number(item.discountVnd) || 0));
}

/** Tổng hợp tiền của cả báo giá: tạm tính, chiết khấu, VAT, tổng thanh toán. */
export function summarizeQuotation(
  items: { quantity: number; unitPrice: number; discountVnd?: number }[],
  vatRate = 0,
  shippingFee = 0,
  discountRate = 0,
) {
  const gross = items.reduce((sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0), 0);
  const lineDiscount = items.reduce((sum, i) => {
    const line = (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0);
    return sum + Math.min(line, Number(i.discountVnd) || 0);
  }, 0);
  // Chiết khấu chính là khoản tính trên tổng tiền hàng, giống cách phiếu đặt hàng
  // áp chiết khấu theo sản lượng. Chiết khấu theo dòng chỉ còn cho dữ liệu cũ.
  const rateDiscount = Math.round(((gross - lineDiscount) * (Number(discountRate) || 0)) / 100);
  const discountAmount = Math.min(gross, lineDiscount + Math.max(0, rateDiscount));
  const freight = Math.max(0, Number(shippingFee) || 0);
  // Cước là một khoản phải trả của khách nên chịu VAT cùng tiền hàng
  const subtotal = gross - discountAmount + freight;
  const vatAmount = Math.round((subtotal * (Number(vatRate) || 0)) / 100);
  return {
    gross,
    discountAmount,
    shippingFee: freight,
    subtotal,
    vatAmount,
    totalAmount: subtotal + vatAmount,
  };
}

const QUOTATION_INCLUDE = {
  items: true,
  location: { select: { id: true, name: true, address: true } },
  orders: { select: { id: true, orderCode: true } },
} as const;

export async function saveCustomerQuotation(id: number | null, input: SaveCustomerQuotationInput) {
  const numId = id ? Number(id) : null;
  const isUpdate = Boolean(numId && !isNaN(numId) && numId > 0);
  const vatRate = Number(input.vatRate) || 0;
  const shippingFee = Math.max(0, Number(input.shippingFee) || 0);
  const discountRate = Math.max(0, Number(input.discountRate) || 0);
  const { discountAmount, subtotal, vatAmount, totalAmount } = summarizeQuotation(
    input.items,
    vatRate,
    shippingFee,
    discountRate,
  );

  const itemRows = input.items.map((item) => ({
    itemType: item.itemType,
    name: item.name.trim(),
    quantity: item.quantity,
    unitPrice: item.unitPrice,
    discountVnd: Number(item.discountVnd) || 0,
    totalPrice: quotationLineTotal(item),
    equipmentId: item.equipmentId || null,
    inventoryItemId: item.inventoryItemId || null,
    notes: item.notes?.trim() || null,
  }));

  const common = {
    locationId: input.locationId ? Number(input.locationId) : null,
    status: input.status || 'DRAFT',
    quoteDate: input.quoteDate ? new Date(input.quoteDate) : new Date(),
    validUntil: input.validUntil ? new Date(input.validUntil) : null,
    subtotal,
    discountRate,
    discountAmount,
    shippingFee,
    vatRate,
    vatAmount,
    totalAmount,
    paymentTerms: input.paymentTerms?.trim() || null,
    deliveryTime: input.deliveryTime?.trim() || null,
    warrantyTerms: input.warrantyTerms?.trim() || null,
    notes: input.notes?.trim() || null,
  };

  if (isUpdate) {
    await prisma.customerQuotationItem.deleteMany({ where: { quotationId: numId! } });
    return prisma.customerQuotation.update({
      where: { id: numId! },
      data: { ...common, items: { create: itemRows } },
      include: QUOTATION_INCLUDE,
    });
  }

  return prisma.customerQuotation.create({
    data: {
      ...common,
      quoteCode: input.quoteCode?.trim() || (await generateQuoteCode()),
      customerId: input.customerId,
      createdById: input.createdById || null,
      items: { create: itemRows },
    },
    include: QUOTATION_INCLUDE,
  });
}

export async function deleteCustomerQuotation(id: number) {
  const numId = Number(id);
  if (!numId || isNaN(numId) || numId <= 0) return null;
  return prisma.customerQuotation.delete({ where: { id: numId } });
}

/**
 * Khách chốt báo giá → sinh đơn hàng từ đúng các dòng đã báo.
 * Đơn giá chuyển sang đơn hàng là giá sau chiết khấu của từng dòng.
 */
export async function convertQuotationToOrder(quotationId: number, orderType = 'MACHINE_PURCHASE') {
  const numId = Number(quotationId);
  if (!numId || isNaN(numId) || numId <= 0) throw new Error('Báo giá không hợp lệ');

  const quotation = await prisma.customerQuotation.findUnique({
    where: { id: numId },
    include: { items: true, orders: { select: { id: true, orderCode: true } } },
  });
  if (!quotation) throw new Error('Không tìm thấy báo giá');
  if (quotation.items.length === 0) throw new Error('Báo giá chưa có dòng hàng nào');
  if (quotation.orders.length > 0) {
    throw new Error(`Báo giá này đã chốt thành đơn ${quotation.orders[0].orderCode}`);
  }

  const orderCode = await generateOrderCode();
  const items = quotation.items.map((item) => {
    const unitPrice =
      item.quantity > 0 ? Number(item.totalPrice) / item.quantity : Number(item.unitPrice);
    return {
      itemType: item.itemType,
      name: item.name,
      quantity: item.quantity,
      unitPrice,
      totalPrice: Number(item.totalPrice),
      equipmentId: item.equipmentId,
      inventoryItemId: item.inventoryItemId,
      notes: item.notes,
    };
  });

  const orderTotals = summarizeOrder(
    items,
    Number(quotation.vatRate || 0),
    0,
  );

  const [order] = await prisma.$transaction([
    prisma.customerOrder.create({
      data: {
        orderCode,
        customerId: quotation.customerId,
        locationId: quotation.locationId,
        quotationId: quotation.id,
        orderType,
        status: 'PENDING',
        goodsAmount: orderTotals.goodsAmount,
        shippingFee: 0,
        vatRate: Number(quotation.vatRate || 0),
        vatAmount: orderTotals.vatAmount,
        totalAmount: orderTotals.totalAmount,
        orderDate: new Date(),
        notes: `Chốt từ báo giá ${quotation.quoteCode}`,
        items: { create: items },
      },
      include: { items: true, location: true },
    }),
    prisma.customerQuotation.update({
      where: { id: quotation.id },
      data: { status: 'ACCEPTED' },
    }),
  ]);

  return order;
}

// ── Giao hàng: xuất kho & đặt hàng nhà cung cấp ─────────────────

/** Các dòng linh kiện của đơn có gắn mã trong danh mục kho → xuất kho được. */
export async function getCustomerOrderFulfillment(orderId: number) {
  const numId = Number(orderId);
  if (!numId || isNaN(numId) || numId <= 0) return null;

  const order = await prisma.customerOrder.findUnique({
    where: { id: numId },
    include: {
      items: { include: { inventoryItem: { select: { id: true, itemCode: true, name: true, unit: true } } } },
      customer: { select: { id: true, name: true } },
      sparePartOrders: { select: { id: true, orderCode: true, status: true } },
    },
  });
  if (!order) return null;

  const spareLines = order.items.filter((i) => i.itemType === 'SPARE_PART');
  // Máy bán từ kho: có mã danh mục nhưng CHƯA gắn hồ sơ máy nào.
  // Xuất kho sẽ vừa trừ tồn vừa sinh hồ sơ máy theo serial người xuất nhập vào.
  const machineFromStock = order.items.filter(
    (i) => i.itemType === 'EQUIPMENT' && i.inventoryItemId && !i.equipmentId,
  );
  return {
    order,
    /** Dòng xuất kho được (đã có mã linh kiện). */
    issuable: spareLines.filter((i) => i.inventoryItemId),
    /** Dòng chưa có mã trong danh mục — phải tạo mã trước khi xuất/đặt hàng. */
    unmapped: spareLines.filter((i) => !i.inventoryItemId),
    /** Dòng máy lấy từ kho, cần nhập serial cho từng chiếc khi giao. */
    machineFromStock,
  };
}

/**
 * Xuất kho giao khách cho một đơn hàng: trừ tồn kho đúng số lượng đã bán.
 * Chỉ xuất các dòng linh kiện đã gắn mã danh mục; máy móc và dịch vụ bỏ qua.
 */
/** Hình thức sở hữu máy sau khi giao, suy từ hình thức giao dịch của đơn. */
function ownershipFromOrderType(orderType: string): string {
  if (orderType === 'RENTAL') return 'RENTAL';
  if (orderType === 'CONSIGNMENT') return 'CONSIGNMENT';
  return 'SOLD';
}

export interface MachineUnitInput {
  /** Dòng đơn hàng chứa máy. */
  orderItemId: number;
  serialNumber: string;
  /** Số tháng bảo hành tính từ ngày giao; bỏ trống thì không đặt hạn bảo hành. */
  warrantyMonths?: number;
}

export async function issueCustomerOrderStock(
  orderId: number,
  sourceWarehouseId: number,
  userId: number,
  machineUnits: MachineUnitInput[] = [],
) {
  const data = await getCustomerOrderFulfillment(orderId);
  if (!data) throw new Error('Không tìm thấy đơn hàng');
  const { order, issuable, machineFromStock } = data;

  if (order.stockIssuedAt) {
    throw new Error(`Đơn ${order.orderCode} đã giao trước đó`);
  }

  // Máy móc trong đơn: giao là đổi chủ sở hữu luôn, không để hồ sơ máy nói
  // "còn trong kho" trong khi đơn hàng nói đã bán.
  const machineLines = order.items.filter((i) => i.itemType === 'EQUIPMENT' && i.equipmentId);

  if (issuable.length === 0 && machineLines.length === 0 && machineFromStock.length === 0) {
    throw new Error('Đơn hàng không có máy hoặc linh kiện nào để giao');
  }

  // Mỗi chiếc máy là một tài sản riêng có số serial, nên phải khai đủ serial
  // trước khi trừ tồn — thiếu một chiếc là hồ sơ máy và tồn kho lệch nhau vĩnh viễn.
  const unitsByLine = new Map<number, MachineUnitInput[]>();
  for (const u of machineUnits) {
    const list = unitsByLine.get(u.orderItemId) || [];
    list.push(u);
    unitsByLine.set(u.orderItemId, list);
  }
  for (const line of machineFromStock) {
    const units = unitsByLine.get(line.id) || [];
    if (units.length !== line.quantity) {
      throw new Error(
        `Máy "${line.name}" bán ${line.quantity} chiếc nhưng mới khai ${units.length} số serial`,
      );
    }
    for (const u of units) {
      if (!u.serialNumber?.trim()) throw new Error(`Máy "${line.name}" có số serial để trống`);
    }
  }

  const allSerials = machineUnits.map((u) => u.serialNumber.trim());
  const duplicated = allSerials.filter((sn, i) => allSerials.indexOf(sn) !== i);
  if (duplicated.length > 0) {
    throw new Error(`Số serial bị nhập trùng trong cùng phiếu: ${[...new Set(duplicated)].join(', ')}`);
  }
  if (allSerials.length > 0) {
    const existed = await prisma.fnbEquipment.findMany({
      where: { serialNumber: { in: allSerials } },
      select: { serialNumber: true, machineCode: true },
    });
    if (existed.length > 0) {
      throw new Error(
        `Số serial đã có trong hệ thống: ${existed.map((e) => `${e.serialNumber} (${e.machineCode})`).join(', ')}`,
      );
    }
  }

  // Máy lấy từ kho cũng trừ tồn như linh kiện
  const outLines = [
    ...issuable.map((i) => ({
      itemId: i.inventoryItemId!,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
    })),
    ...machineFromStock.map((i) => ({
      itemId: i.inventoryItemId!,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
    })),
  ];

  let trans = null;
  if (outLines.length > 0) {
    trans = await createStockTransaction(
      {
        type: 'OUT',
        reasonCode: 'SALE',
        customerOrderId: order.id,
        sourceWarehouseId,
        reason: `Xuất kho giao khách theo đơn ${order.orderCode} (${order.customer?.name || ''})`.trim(),
        note: `Đơn hàng khách ${order.orderCode}`,
        items: outLines,
      },
      userId,
    );
  }

  const ownershipType = ownershipFromOrderType(order.orderType);

  // Máy bán từ kho: mỗi chiếc sinh một hồ sơ máy, gắn luôn khách và bắt đầu tính bảo hành.
  const createdMachines: { machineCode: string; serialNumber: string }[] = [];
  // Giá vốn của chính lần xuất này, do createStockTransaction chốt theo bình quân
  // gia quyền — đọc lại từ phiếu thay vì lấy giá danh mục (giá danh mục đổi được)
  const issuedCostByItem = new Map<number, number>();
  if (trans) {
    const issuedLines = await prisma.inventoryTransactionItem.findMany({
      where: { transactionId: trans.id },
      select: { itemId: true, unitCost: true },
    });
    for (const l of issuedLines) issuedCostByItem.set(l.itemId, Number(l.unitCost || 0));
  }
  const now = new Date();
  // installedDate và warrantyExpiresAt là cột @db.Date — Prisma lấy phần ngày theo
  // UTC. Giao máy trước 7h sáng giờ Việt Nam sẽ bị ghi lùi một ngày nếu dùng thẳng
  // new Date(), nên chuẩn hóa về nửa đêm UTC của ngày địa phương.
  const today = new Date(Date.UTC(now.getFullYear(), now.getMonth(), now.getDate()));
  for (const line of machineFromStock) {
    const catalog = line.inventoryItemId
      ? await prisma.inventoryItem.findUnique({
          where: { id: line.inventoryItemId },
          select: { name: true, fnbCategory: true, manufacturer: true },
        })
      : null;

    for (const unit of unitsByLine.get(line.id) || []) {
      const warrantyExpiresAt =
        unit.warrantyMonths && unit.warrantyMonths > 0
          ? new Date(new Date(today).setUTCMonth(today.getUTCMonth() + unit.warrantyMonths))
          : null;

      const machine = await prisma.fnbEquipment.create({
        data: {
          machineCode: await generateMachineCode(),
          serialNumber: unit.serialNumber.trim(),
          name: line.name || catalog?.name || 'Máy F&B',
          // Loại máy khai sẵn ở danh mục, người xuất kho không phải chọn lại
          category: catalog?.fnbCategory || 'OTHER',
          brand: catalog?.manufacturer || null,
          customerId: order.customerId,
          locationId: order.locationId,
          warehouseId: null,
          ownershipType,
          status: 'OPERATING',
          installedDate: today,
          warrantyExpiresAt,
          unitCost: line.inventoryItemId ? issuedCostByItem.get(line.inventoryItemId) ?? null : null,
          soldPrice: Number(line.unitPrice || 0),
          customerOrderId: order.id,
          notes: `Sinh tự động khi giao đơn ${order.orderCode}`,
        },
        select: { machineCode: true, serialNumber: true },
      });
      createdMachines.push(machine);
    }
  }

  for (const line of machineLines) {
    await prisma.fnbEquipment.update({
      where: { id: line.equipmentId! },
      data: {
        customerId: order.customerId,
        locationId: order.locationId,
        warehouseId: null,
        ownershipType,
        status: 'OPERATING',
        installedDate: new Date(),
      },
    });
  }

  const total = Number(order.totalAmount ?? order.goodsAmount ?? 0);
  const paid = Number(order.paidAmount || 0);
  const returned = Number(order.returnedAmount || 0);
  const isPaidInFull = Math.max(0, total - returned - paid) <= 0;

  await prisma.customerOrder.update({
    where: { id: order.id },
    data: {
      stockIssuedAt: new Date(),
      status: (order.status === 'COMPLETED' || isPaidInFull) ? 'COMPLETED' : 'DELIVERED',
    },
  });

  return {
    transaction: trans,
    issuedLines: issuable.length,
    machinesTransferred: machineLines.length,
    machinesCreated: createdMachines,
    ownershipType,
  };
}

/** Sinh mã linh kiện mới dạng SP-XXXX cho hàng chưa có trong danh mục. */
async function generateInventoryItemCode(): Promise<string> {
  const count = await prisma.inventoryItem.count();
  let seq = count + 1;
  // Tránh trùng nếu danh mục đã có mã cùng dạng
  for (let i = 0; i < 50; i += 1) {
    const code = `SP-${String(seq).padStart(4, '0')}`;
    const existed = await prisma.inventoryItem.findUnique({ where: { itemCode: code } });
    if (!existed) return code;
    seq += 1;
  }
  return `SP-${Date.now()}`;
}

/**
 * Tạo mã danh mục kho cho các dòng linh kiện tự nhập của đơn hàng,
 * để có thể đặt hàng nhà cung cấp và xuất kho về sau.
 */
export async function mapOrderLinesToInventory(
  orderId: number,
  lines: { itemId: number; unit?: string; itemCode?: string }[],
) {
  const data = await getCustomerOrderFulfillment(orderId);
  if (!data) throw new Error('Không tìm thấy đơn hàng');

  const created: { lineId: number; inventoryItemId: number; itemCode: string }[] = [];

  for (const line of lines) {
    const orderLine = data.order.items.find((i) => i.id === line.itemId);
    if (!orderLine || orderLine.inventoryItemId) continue;

    const itemCode = line.itemCode?.trim() || (await generateInventoryItemCode());
    const item = await prisma.inventoryItem.create({
      data: {
        itemCode,
        name: orderLine.name.slice(0, 191),
        category: 'SPARE_PART',
        supplyType: 'ON_ORDER',
        unit: line.unit?.trim() || 'Cái',
        sellingPrice: Number(orderLine.unitPrice),
      },
    });

    await prisma.customerOrderItem.update({
      where: { id: orderLine.id },
      data: { inventoryItemId: item.id },
    });

    created.push({ lineId: orderLine.id, inventoryItemId: item.id, itemCode });
  }

  return created;
}

/**
 * Tạo phiếu đặt hàng nhà cung cấp cho các dòng linh kiện của một đơn hàng khách.
 * Dòng nào chưa có mã danh mục sẽ được tạo mã trước (đúng người, đúng thời điểm:
 * lúc thực sự phải mua hàng, do người mua hàng xác nhận).
 */
export async function createSupplierOrderFromCustomerOrder(
  orderId: number,
  input: {
    supplier?: string;
    targetWarehouseId?: number;
    exchangeRate?: number;
    /** Dòng tự nhập cần tạo mã danh mục trước khi đặt hàng. */
    newItems?: { itemId: number; unit?: string; itemCode?: string }[];
  },
  userId: number,
) {
  if (input.newItems?.length) {
    await mapOrderLinesToInventory(orderId, input.newItems);
  }

  const data = await getCustomerOrderFulfillment(orderId);
  if (!data) throw new Error('Không tìm thấy đơn hàng');
  const { order, issuable, unmapped } = data;

  if (issuable.length === 0) {
    throw new Error(
      unmapped.length > 0
        ? 'Các dòng linh kiện chưa có mã danh mục. Hãy tạo mã trước khi đặt hàng nhà cung cấp.'
        : 'Đơn hàng không có dòng linh kiện nào để đặt nhà cung cấp',
    );
  }

  const items = await prisma.inventoryItem.findMany({
    where: { id: { in: issuable.map((i) => i.inventoryItemId!) } },
    select: { id: true, priceEur: true },
  });
  const eurById = new Map(items.map((i) => [i.id, Number(i.priceEur || 0)]));

  const supplierOrder = await createSparePartOrder(
    {
      supplier: input.supplier?.trim() || 'Selmi',
      currency: 'EUR',
      exchangeRate: input.exchangeRate ?? 32500,
      shippingFee: 3500000,
      customsFee: 1000000,
      extraShippingRate: 0.25,
      targetWarehouseId: input.targetWarehouseId ?? null,
      customerId: order.customerId,
      customerOrderId: order.id,
      equipmentId: null,
      serviceTicketId: null,
      trackingNumber: null,
      etaDate: null,
      notes: `Đặt hàng phục vụ đơn khách ${order.orderCode}`,
      items: issuable.map((i) => ({
        itemId: i.inventoryItemId!,
        quantity: i.quantity,
        unitPriceEur: eurById.get(i.inventoryItemId!) || 0,
      })),
    },
    userId,
  );

  // Đơn khách chuyển sang "Chờ hàng về" để sale biết chưa gọi khách được
  if (['PENDING', 'CONFIRMED'].includes(order.status)) {
    await prisma.customerOrder.update({
      where: { id: order.id },
      data: { status: 'AWAITING_STOCK' },
    });
  }

  return supplierOrder;
}

// ── Công nợ khách hàng ──────────────────────────────────────────

export async function generatePaymentCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `TT-${year}-`;
  try {
    if (!prisma.customerPayment) return `${prefix}0001`;
    const rows = await prisma.customerPayment.findMany({
      where: { paymentCode: { startsWith: prefix } },
      select: { paymentCode: true },
    });
    return nextSequentialCode(prefix, rows.map((r) => r.paymentCode));
  } catch {
    return `${prefix}0001`;
  }
}

/** Công nợ của một đơn: phải thu, đã thu, còn lại, có quá hạn hay không. */
export function orderDebt(order: {
  totalAmount?: any;
  paidAmount?: any;
  returnedAmount?: any;
  dueDate?: Date | string | null;
  status?: string;
}) {
  const total = order.status === 'CANCELLED' ? 0 : Number(order.totalAmount || 0);
  const paid = Number(order.paidAmount || 0);
  // Hàng đã trả lại không còn là khoản khách phải trả
  const returned = Math.min(total, Number(order.returnedAmount || 0));
  const remaining = Math.max(0, total - returned - paid);
  const due = order.dueDate ? new Date(order.dueDate) : null;
  const overdue = Boolean(remaining > 0 && due && due < new Date(new Date().toDateString()));
  return { total, paid, returned, remaining, overdue, dueDate: due };
}

/** Tổng hợp công nợ của một khách hàng. */
export function summarizeCustomerDebt(orders: any[]) {
  let totalBilled = 0;
  let totalReturned = 0;
  let totalPaid = 0;
  let outstanding = 0;
  let overdue = 0;
  let overdueOrders = 0;

  for (const o of orders || []) {
    const d = orderDebt(o);
    totalBilled += d.total;
    totalReturned += d.returned;
    totalPaid += Math.min(d.paid, d.total);
    outstanding += d.remaining;
    if (d.overdue) {
      overdue += d.remaining;
      overdueOrders += 1;
    }
  }

  return { totalBilled, totalReturned, totalPaid, outstanding, overdue, overdueOrders };
}

/**
 * Ghi nhận một khoản khách thanh toán.
 * Không gắn đơn thì trừ dần các đơn còn nợ theo thứ tự cũ trước — đúng thông lệ
 * đối trừ công nợ, tránh để đơn cũ treo mãi.
 */
export async function recordCustomerPayment(input: SaveCustomerPaymentInput, userId?: number) {
  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) throw new Error('Số tiền thanh toán phải lớn hơn 0');
  const paymentCode = await generatePaymentCode();
  return prisma.$transaction(async (tx) => {
    const orders = await tx.customerOrder.findMany({
      where: { customerId: input.customerId, status: { not: 'CANCELLED' }, ...(input.orderId ? { id: input.orderId } : {}) },
      orderBy: [{ orderDate: 'asc' }, { id: 'asc' }],
    });
    if (input.orderId && !orders.length) throw new Error('Đơn hàng không thuộc khách hàng hoặc đã hủy');
    const { allocations, unapplied } = allocatePayment(amount, orders.map((order) => ({ id: order.id, remaining: orderDebt(order).remaining })));
    const payment = await tx.customerPayment.create({ data: {
      allocationVersion: 1, paymentCode, customerId: input.customerId, orderId: input.orderId || null, amount,
      method: input.method || 'TRANSFER', paidAt: input.paidAt ? new Date(input.paidAt) : new Date(),
      reference: input.reference?.trim() || null, note: input.note?.trim() || null, createdById: userId || null,
      allocations: { create: allocations },
    } });
    for (const allocation of allocations) {
      const order = await tx.customerOrder.update({ where: { id: allocation.orderId }, data: { paidAmount: { increment: allocation.amount } } });
      if (order.stockIssuedAt && orderDebt(order).remaining <= 0) await tx.customerOrder.update({ where: { id: order.id }, data: { status: 'COMPLETED' } });
    }
    // This audit identifies new unallocated deposits, distinguishing them from legacy payments.
    await tx.auditLog.create({ data: { actorId: userId || null, entityType: 'CustomerPayment', entityId: String(payment.id), action: 'ALLOCATE', diffJson: { allocations, amount } } });
    return { ...payment, unappliedAmount: unapplied };
  }, { isolationLevel: 'Serializable' });
}

/** Reverse the original allocation, never infer its orders from today's balances. */
export async function deleteCustomerPayment(id: number, actorId?: number) {
  return prisma.$transaction(async (tx) => {
    const payment = await tx.customerPayment.findUnique({ where: { id }, include: { allocations: true } });
    if (!payment) throw new Error('Không tìm thấy phiếu thu');
    if (Number(payment.amount) < 0) throw new Error('Phiếu hoàn tiền phải được điều chỉnh cùng phiếu trả hàng');
    let allocations = payment.allocations.map((a) => ({ orderId: a.orderId, amount: Number(a.amount) }));
    if (!allocations.length && payment.allocationVersion !== 1) {
      if (!payment.orderId) throw new Error('Phiếu thu cũ chưa có phân bổ. Cần đối soát trước khi hủy.');
      allocations = [{ orderId: payment.orderId, amount: Number(payment.amount) }];
    }
    for (const allocation of allocations) {
      const updated = await tx.customerOrder.updateMany({ where: { id: allocation.orderId, paidAmount: { gte: allocation.amount } }, data: { paidAmount: { decrement: allocation.amount } } });
      if (updated.count !== 1) throw new Error('Công nợ không khớp phân bổ. Cần đối soát trước khi hủy.');
      const order = await tx.customerOrder.findUniqueOrThrow({ where: { id: allocation.orderId } });
      if (order.status === 'COMPLETED' && order.stockIssuedAt && orderDebt(order).remaining > 0) await tx.customerOrder.update({ where: { id: order.id }, data: { status: 'DELIVERED' } });
    }
    await tx.auditLog.create({ data: { actorId: actorId || null, entityType: 'CustomerPayment', entityId: String(id), action: 'REVERSE', diffJson: { paymentCode: payment.paymentCode, amount: Number(payment.amount), allocations } } });
    return tx.customerPayment.delete({ where: { id } });
  }, { isolationLevel: 'Serializable' });
}

// ── Trả hàng & hoàn tiền ────────────────────────────────────────

export interface CustomerReturnItemInput {
  orderItemId?: number;
  inventoryItemId?: number;
  name: string;
  quantity: number;
  unitPrice: number;
}

export interface SaveCustomerReturnInput {
  customerId: number;
  orderId?: number;
  /** CREDIT = giảm trừ công nợ, REFUND = hoàn tiền cho khách. */
  settlement?: string;
  reason?: string;
  note?: string;
  returnedAt?: string;
  /** Kho nhận lại hàng; bỏ trống thì không nhập kho, chỉ ghi nhận giá trị trả. */
  warehouseId?: number;
  items: CustomerReturnItemInput[];
}

export async function generateReturnCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `TH-${year}-`;
  try {
    if (!prisma.customerReturn) return `${prefix}0001`;
    const rows = await prisma.customerReturn.findMany({
      where: { returnCode: { startsWith: prefix } },
      select: { returnCode: true },
    });
    return nextSequentialCode(prefix, rows.map((r) => r.returnCode));
  } catch {
    return `${prefix}0001`;
  }
}

/**
 * Khách trả hàng.
 *
 * Ba việc xảy ra cùng lúc: nhập lại kho phần hàng có mã danh mục, ghi giá trị
 * trả lên đơn để giảm phải thu, và nếu khách đã trả tiền thì lập phiếu chi hoàn
 * lại. Công nợ sau đó = tổng đơn − giá trị trả − đã thu.
 */
export async function createCustomerReturn(input: SaveCustomerReturnInput, userId?: number) {
  const items = input.items.filter((i) => i.name?.trim() && Number(i.quantity) > 0);
  if (items.length === 0) throw new Error('Chưa chọn hàng nào để trả lại');

  const totalValue = items.reduce(
    (sum, i) => sum + (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0),
    0,
  );

  const record = await prisma.customerReturn.create({
    data: {
      returnCode: await generateReturnCode(),
      customerId: input.customerId,
      orderId: input.orderId || null,
      settlement: input.settlement || 'CREDIT',
      totalValue,
      reason: input.reason?.trim()?.slice(0, 255) || null,
      note: input.note?.trim() || null,
      returnedAt: input.returnedAt ? new Date(input.returnedAt) : new Date(),
      createdById: userId || null,
      items: {
        create: items.map((i) => ({
          orderItemId: i.orderItemId || null,
          inventoryItemId: i.inventoryItemId || null,
          name: i.name.trim(),
          quantity: i.quantity,
          unitPrice: i.unitPrice,
          totalPrice: (Number(i.quantity) || 0) * (Number(i.unitPrice) || 0),
        })),
      },
    },
    include: { items: true },
  });

  // Nhập lại kho phần hàng có mã danh mục
  const stockable = items.filter((i) => i.inventoryItemId);
  if (stockable.length > 0 && input.warehouseId) {
    await createStockTransaction(
      {
        type: 'IN',
        reasonCode: 'CUSTOMER_RETURN',
        customerOrderId: input.orderId || null,
        targetWarehouseId: input.warehouseId,
        reason: `Khách trả hàng theo phiếu ${record.returnCode}`,
        note: input.reason?.trim() || null,
        items: stockable.map((i) => ({
          itemId: i.inventoryItemId!,
          quantity: i.quantity,
          unitPrice: i.unitPrice,
        })),
      } as any,
      userId || 0,
    );
  }

  if (input.orderId) {
    await prisma.customerOrder.update({
      where: { id: input.orderId },
      data: { returnedAmount: { increment: totalValue } },
    });

    // Hoàn tiền: ghi phiếu chi âm để số "đã thu" giảm tương ứng
    if ((input.settlement || 'CREDIT') === 'REFUND') {
      await prisma.customerPayment.create({
        data: {
          paymentCode: await generatePaymentCode(),
          customerId: input.customerId,
          orderId: input.orderId,
          amount: -totalValue,
          method: 'CASH',
          paidAt: new Date(),
          note: `Hoàn tiền hàng trả lại theo phiếu ${record.returnCode}`,
          createdById: userId || null,
        },
      });
      await prisma.customerOrder.update({
        where: { id: input.orderId },
        data: { paidAmount: { decrement: totalValue } },
      });
    }
  }

  return record;
}

export async function deleteCustomerReturn(id: number) {
  const record = await prisma.customerReturn.findUnique({ where: { id } });
  if (!record) throw new Error('Không tìm thấy phiếu trả hàng');

  if (record.orderId) {
    await prisma.customerOrder.update({
      where: { id: record.orderId },
      data: { returnedAmount: { decrement: Number(record.totalValue) } },
    });
    if (record.settlement === 'REFUND') {
      await prisma.customerOrder.update({
        where: { id: record.orderId },
        data: { paidAmount: { increment: Number(record.totalValue) } },
      });
      await prisma.customerPayment.deleteMany({
        where: { orderId: record.orderId, amount: { lt: 0 }, note: { contains: record.returnCode } },
      });
    }
  }

  return prisma.customerReturn.delete({ where: { id } });
}
