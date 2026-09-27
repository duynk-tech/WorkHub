import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { hashPassword } from '../src/server/auth/password';
import { seedPermissions, seedRoles, seedPositions, seedWorkShifts, seedLeaveTypes, seedHolidays, seedSystemSettings, seedNotificationTemplates, seedDefaultWorkflow } from '../prisma/seed/core';
import { seedDemoOrg, seedDemoEmployees, seedDemoTasks, seedDemoAttendance, seedDemoLeaves, seedDemoAdminApprovals } from '../prisma/seed/demo';
import { seedDemoFnbEquipment } from '../prisma/seed/fnb-equipment';
import { allocatePayment } from '../src/lib/payment-allocation';

const prisma = new PrismaClient();
const PREFIX = 'DEMO-';
const DEMO_NOTE = 'DEMO_DATA_WORKHUB_V1';
const TODAY = new Date();
const dateAt = (daysAgo: number) => {
  const d = new Date(TODAY);
  d.setDate(d.getDate() - daysAgo);
  d.setHours(12, 0, 0, 0);
  return d;
};

async function ensureMasterData() {
  const admin = await prisma.employee.findUnique({ where: { code: 'ADMIN' } });
  const adminUser = admin ? await prisma.user.findUnique({ where: { employeeId: admin.id } }) : null;
  if (!admin || !adminUser) throw new Error('Chưa có tài khoản ADMIN; chạy npm run db:seed trước.');

  const customers = await Promise.all([
    prisma.customer.upsert({ where: { code: `${PREFIX}CUS-001` }, update: { name: 'DEMO · Chuỗi Cà phê Mộc' }, create: { code: `${PREFIX}CUS-001`, name: 'DEMO · Chuỗi Cà phê Mộc', phone: '0900000001', email: 'demo-customer-1@example.invalid', address: 'Quận 1, TP. Hồ Chí Minh', notes: DEMO_NOTE } }),
    prisma.customer.upsert({ where: { code: `${PREFIX}CUS-002` }, update: { name: 'DEMO · Bếp Nhà Phố' }, create: { code: `${PREFIX}CUS-002`, name: 'DEMO · Bếp Nhà Phố', phone: '0900000002', email: 'demo-customer-2@example.invalid', address: 'Quận Ba Đình, Hà Nội', notes: DEMO_NOTE } }),
  ]);
  const warehouses = await Promise.all([
    prisma.warehouse.upsert({ where: { code: `${PREFIX}HN` }, update: { name: 'DEMO · Kho Hà Nội' }, create: { code: `${PREFIX}HN`, name: 'DEMO · Kho Hà Nội', type: 'CENTRAL', address: 'Long Biên, Hà Nội' } }),
    prisma.warehouse.upsert({ where: { code: `${PREFIX}HCM` }, update: { name: 'DEMO · Kho TP.HCM' }, create: { code: `${PREFIX}HCM`, name: 'DEMO · Kho TP.HCM', type: 'BRANCH', address: 'Tân Bình, TP. Hồ Chí Minh' } }),
  ]);
  const products = await Promise.all([
    prisma.inventoryItem.upsert({ where: { itemCode: `${PREFIX}FILTER-01` }, update: { name: 'DEMO · Lõi lọc nước máy pha', status: 'ACTIVE' }, create: { itemCode: `${PREFIX}FILTER-01`, name: 'DEMO · Lõi lọc nước máy pha', category: 'CONSUMABLE', unit: 'cái', costPrice: 250000, sellingPrice: 450000, avgCost: 250000, minStockAlert: 3, manufacturer: 'WorkHub Demo', description: DEMO_NOTE } }),
    prisma.inventoryItem.upsert({ where: { itemCode: `${PREFIX}GASKET-01` }, update: { name: 'DEMO · Gioăng silicone chịu nhiệt', status: 'ACTIVE' }, create: { itemCode: `${PREFIX}GASKET-01`, name: 'DEMO · Gioăng silicone chịu nhiệt', category: 'SPARE_PART', unit: 'cái', costPrice: 180000, sellingPrice: 320000, avgCost: 180000, minStockAlert: 4, manufacturer: 'WorkHub Demo', description: DEMO_NOTE } }),
    prisma.inventoryItem.upsert({ where: { itemCode: `${PREFIX}PUMP-01` }, update: { name: 'DEMO · Bơm nước máy pha', status: 'ACTIVE' }, create: { itemCode: `${PREFIX}PUMP-01`, name: 'DEMO · Bơm nước máy pha', category: 'SPARE_PART', unit: 'cái', costPrice: 1500000, sellingPrice: 2200000, avgCost: 1500000, minStockAlert: 2, manufacturer: 'WorkHub Demo', description: DEMO_NOTE } }),
  ]);
  const supplier = `${PREFIX}Nhà cung cấp thiết bị mẫu`;
  return { admin, adminUser, customers, warehouses, products, supplier };
}

async function postStock(input: { type: 'IN' | 'OUT'; warehouseId: number; userId: number; orderId?: number; purchaseId?: number; code: string; date: Date; partner: string; items: { itemId: number; quantity: number; unitPrice: number }[] }) {
  await prisma.$transaction(async (tx) => {
    for (const line of input.items) {
      const stock = await tx.inventoryStock.findUnique({ where: { warehouseId_itemId: { warehouseId: input.warehouseId, itemId: line.itemId } } });
      const currentCost = Number((await tx.inventoryItem.findUnique({ where: { id: line.itemId }, select: { avgCost: true, costPrice: true } }))?.avgCost ?? 0);
      if (input.type === 'IN') {
        const total = await tx.inventoryStock.aggregate({ where: { itemId: line.itemId }, _sum: { quantity: true } });
        const nextCost = Math.round(((total._sum.quantity ?? 0) * currentCost + line.quantity * line.unitPrice) / Math.max(1, (total._sum.quantity ?? 0) + line.quantity));
        await tx.inventoryItem.update({ where: { id: line.itemId }, data: { avgCost: nextCost } });
        await tx.inventoryStock.upsert({ where: { warehouseId_itemId: { warehouseId: input.warehouseId, itemId: line.itemId } }, create: { warehouseId: input.warehouseId, itemId: line.itemId, quantity: line.quantity }, update: { quantity: { increment: line.quantity } } });
      } else {
        const changed = await tx.inventoryStock.updateMany({ where: { warehouseId: input.warehouseId, itemId: line.itemId, quantity: { gte: line.quantity } }, data: { quantity: { decrement: line.quantity } } });
        if (changed.count !== 1) throw new Error(`Thiếu tồn kho demo cho mặt hàng ${line.itemId} (đang có ${stock?.quantity ?? 0}).`);
      }
    }
    const totalValue = input.items.reduce((sum, row) => sum + row.quantity * row.unitPrice, 0);
    await tx.inventoryTransaction.create({ data: {
      transCode: input.code, type: input.type, ...(input.type === 'IN' ? { targetWarehouseId: input.warehouseId, sparePartOrderId: input.purchaseId } : { sourceWarehouseId: input.warehouseId, customerOrderId: input.orderId }),
      reasonCode: input.type === 'IN' ? 'PO_RECEIPT' : 'SALE', reason: DEMO_NOTE, partnerName: input.partner,
      transDate: input.date, totalValue, createdById: input.userId, status: 'COMPLETED',
      items: { create: input.items.map((line) => ({ itemId: line.itemId, quantity: line.quantity, unitCost: line.unitPrice, unitPrice: line.unitPrice })) },
    } });
  }, { isolationLevel: 'Serializable' });
}

async function postCustomerPayment(input: { orderId: number; customerId: number; paymentCode: string; amount: number; userId: number; paidAt: Date }) {
  await prisma.$transaction(async (tx) => {
    const order = await tx.customerOrder.findUniqueOrThrow({ where: { id: input.orderId } });
    if (order.customerId !== input.customerId) throw new Error('Khách hàng demo không khớp đơn bán.');
    const outstanding = Math.max(0, Number(order.totalAmount ?? 0) - Number(order.returnedAmount) - Number(order.paidAmount));
    const allocated = allocatePayment(input.amount, [{ id: order.id, remaining: outstanding }]);
    await tx.customerPayment.create({ data: {
      paymentCode: input.paymentCode, customerId: input.customerId, orderId: input.orderId,
      amount: input.amount, method: 'TRANSFER', paidAt: input.paidAt, createdById: input.userId,
      note: DEMO_NOTE, allocationVersion: 1,
      allocations: { create: allocated.allocations.map((row) => ({ orderId: row.orderId, amount: row.amount })) },
    } });
    for (const row of allocated.allocations) await tx.customerOrder.update({ where: { id: row.orderId }, data: { paidAmount: { increment: row.amount } } });
    await tx.auditLog.create({ data: { entityType: 'CustomerPayment', entityId: input.paymentCode, action: 'ALLOCATE', diffJson: { demo: true, unapplied: allocated.unapplied, allocations: allocated.allocations } } });
  }, { isolationLevel: 'Serializable' });
}

async function seedTransactions() {
  const { admin, adminUser, customers, warehouses, products, supplier } = await ensureMasterData();
  const inboundCodes = [`DEMO-IN-001`, `DEMO-IN-002`];
  const salesCodes = [`${PREFIX}ORD-001`, `${PREFIX}ORD-002`];
  const outboundCodes = [`DEMO-OUT-001`, `DEMO-OUT-002`];
  const paymentCodes = [`${PREFIX}PT-001`, `${PREFIX}PT-002`];
  const supplierPaymentCodes = [`${PREFIX}CTT-001`, `${PREFIX}CTT-002`];
  const poCodes = [`${PREFIX}PO-001`, `${PREFIX}PO-002`];
  const returnCodes: string[] = [];
  const allCodes = [...inboundCodes, ...outboundCodes];
  const [demoRunCount, demoOrderCount, demoPOCount, demoPaymentCount] = await Promise.all([
    prisma.inventoryTransaction.count({ where: { transCode: { in: allCodes } } }),
    prisma.customerOrder.count({ where: { orderCode: { in: salesCodes } } }),
    prisma.sparePartOrder.count({ where: { orderCode: { in: poCodes } } }),
    prisma.customerPayment.count({ where: { paymentCode: { in: paymentCodes } } }),
  ]);
  if (demoRunCount + demoOrderCount + demoPOCount + demoPaymentCount > 0) {
    await prisma.$transaction(async (tx) => {
      const oldOrders = await tx.customerOrder.findMany({ where: { orderCode: { in: salesCodes } }, select: { id: true } });
      const oldPOs = await tx.sparePartOrder.findMany({ where: { orderCode: { in: poCodes } }, select: { id: true } });
      const oldStockLines = await tx.inventoryTransactionItem.findMany({ where: { transaction: { transCode: { in: allCodes } } }, select: { itemId: true, quantity: true, transaction: { select: { type: true, sourceWarehouseId: true, targetWarehouseId: true } } } });
      const oldPayments = await tx.customerPayment.findMany({ where: { paymentCode: { in: paymentCodes } }, include: { allocations: true } });
      for (const payment of oldPayments) for (const allocation of payment.allocations) await tx.customerOrder.update({ where: { id: allocation.orderId }, data: { paidAmount: { decrement: allocation.amount } } });
      await tx.customerPayment.deleteMany({ where: { paymentCode: { in: paymentCodes } } });
      await tx.customerReturn.deleteMany({ where: { returnCode: { in: returnCodes } } });
      await tx.inventoryTransactionItem.deleteMany({ where: { transaction: { transCode: { in: allCodes } } } });
      await tx.inventoryTransaction.deleteMany({ where: { transCode: { in: allCodes } } });
      for (const line of oldStockLines) {
        const warehouseId = line.transaction.type === 'IN' ? line.transaction.targetWarehouseId : line.transaction.sourceWarehouseId;
        if (!warehouseId) continue;
        const reverse = line.transaction.type === 'IN' ? -line.quantity : line.quantity;
        await tx.inventoryStock.updateMany({ where: { warehouseId, itemId: line.itemId }, data: reverse < 0 ? { quantity: { decrement: -reverse } } : { quantity: { increment: reverse } } });
      }
      for (const order of oldOrders) {
        const allocations = await tx.customerPaymentAllocation.findMany({ where: { orderId: order.id }, select: { amount: true } });
        const paid = allocations.reduce((sum, row) => sum + Number(row.amount), 0);
        await tx.customerOrder.update({ where: { id: order.id }, data: { paidAmount: paid } });
      }
      await tx.customerOrder.deleteMany({ where: { orderCode: { in: salesCodes } } });
      await tx.supplierPaymentAllocation.deleteMany({ where: { payment: { paymentCode: { in: supplierPaymentCodes } } } });
      await tx.supplierPayment.deleteMany({ where: { paymentCode: { in: supplierPaymentCodes } } });

      await tx.sparePartOrder.deleteMany({ where: { orderCode: { in: poCodes } } });
    });
  }

  const po1 = await prisma.sparePartOrder.create({ data: {
    orderCode: `${PREFIX}PO-001`, supplier, status: 'COMPLETED', currency: 'VND', exchangeRate: 1,
    shippingFee: 100000, customsFee: 0, extraShippingRate: 0, totalItemsQty: 30, subtotalVnd: 6800000,
    totalVnd: 6900000, stockedAt: dateAt(28), targetWarehouseId: warehouses[0].id, notes: DEMO_NOTE,
    createdById: adminUser.id, createdAt: dateAt(28),
    items: { create: [
      { itemId: products[0].id, quantity: 20, unitPriceVnd: 250000, finalPriceVnd: 5000000 },
      { itemId: products[1].id, quantity: 10, unitPriceVnd: 180000, finalPriceVnd: 1800000 },
    ] },
  } });
  await postStock({ type: 'IN', warehouseId: warehouses[0].id, purchaseId: po1.id, userId: adminUser.id, code: inboundCodes[0], date: dateAt(28), partner: supplier, items: [{ itemId: products[0].id, quantity: 20, unitPrice: 250000 }, { itemId: products[1].id, quantity: 10, unitPrice: 180000 }] });
  await prisma.supplierPayment.create({ data: { paymentCode: supplierPaymentCodes[0], supplier, orderId: po1.id, amount: 3000000, paidAt: dateAt(27), method: 'TRANSFER', note: DEMO_NOTE, createdById: adminUser.id, allocationVersion: 1, allocations: { create: [{ orderId: po1.id, amount: 3000000 }] } } });
  await prisma.sparePartOrder.update({ where: { id: po1.id }, data: { paidAmount: 3000000 } });

  const po2 = await prisma.sparePartOrder.create({ data: {
    orderCode: `${PREFIX}PO-002`, supplier, status: 'COMPLETED', currency: 'VND', exchangeRate: 1,
    shippingFee: 150000, customsFee: 0, extraShippingRate: 0, totalItemsQty: 8, subtotalVnd: 12000000,
    totalVnd: 12150000, stockedAt: dateAt(12), targetWarehouseId: warehouses[1].id, notes: DEMO_NOTE,
    createdById: adminUser.id, createdAt: dateAt(12),
    items: { create: [{ itemId: products[2].id, quantity: 8, unitPriceVnd: 1500000, finalPriceVnd: 12000000 }] },
  } });
  await postStock({ type: 'IN', warehouseId: warehouses[1].id, purchaseId: po2.id, userId: adminUser.id, code: inboundCodes[1], date: dateAt(12), partner: supplier, items: [{ itemId: products[2].id, quantity: 8, unitPrice: 1500000 }] });
  await prisma.supplierPayment.create({ data: { paymentCode: supplierPaymentCodes[1], supplier, orderId: po2.id, amount: 12150000, paidAt: dateAt(10), method: 'TRANSFER', note: DEMO_NOTE, createdById: adminUser.id, allocationVersion: 1, allocations: { create: [{ orderId: po2.id, amount: 12150000 }] } } });
  await prisma.sparePartOrder.update({ where: { id: po2.id }, data: { paidAmount: 12150000 } });

  const sales = [
    { code: salesCodes[0], customer: customers[0], warehouse: warehouses[0], product: products[0], quantity: 3, unitPrice: 450000, daysAgo: 18, payPercent: 100 },
    { code: salesCodes[1], customer: customers[1], warehouse: warehouses[1], product: products[2], quantity: 2, unitPrice: 2200000, daysAgo: 5, payPercent: 50 },
  ];
  for (const sale of sales) {
    const goods = sale.quantity * sale.unitPrice;
    const vat = Math.round(goods * 0.08);
    const total = goods + vat;
    const order = await prisma.customerOrder.create({ data: {
      orderCode: sale.code, customerId: sale.customer.id, orderType: 'SPARE_PART', status: sale.payPercent === 100 ? 'COMPLETED' : 'DELIVERED',
      goodsAmount: goods, vatRate: 8, vatAmount: vat, totalAmount: total, paidAmount: 0,
      orderDate: dateAt(sale.daysAgo), deliveryDate: dateAt(sale.daysAgo), stockIssuedAt: dateAt(sale.daysAgo), notes: DEMO_NOTE,
      items: { create: [{ name: sale.product.name, itemType: 'SPARE_PART', quantity: sale.quantity, unitPrice: sale.unitPrice, totalPrice: goods, inventoryItemId: sale.product.id }] },
    } });
    await postStock({ type: 'OUT', warehouseId: sale.warehouse.id, orderId: order.id, userId: adminUser.id, code: outboundCodes[sales.indexOf(sale)], date: dateAt(sale.daysAgo), partner: sale.customer.name, items: [{ itemId: sale.product.id, quantity: sale.quantity, unitPrice: Number(sale.product.avgCost ?? sale.product.costPrice ?? 0) }] });
    await postCustomerPayment({ orderId: order.id, customerId: sale.customer.id, paymentCode: `DEMO-PT-${sale.code.endsWith('001') ? '001' : '002'}`, amount: total * sale.payPercent / 100, userId: adminUser.id, paidAt: dateAt(sale.daysAgo) });
  }

  console.log(`✓ Demo thương mại tạo xong: ${await prisma.sparePartOrder.count({ where: { orderCode: { startsWith: PREFIX } } })} PO; ${await prisma.customerOrder.count({ where: { orderCode: { startsWith: PREFIX } } })} đơn bán.`);
  console.log('✓ Thao tác ghi nhận bởi tài khoản', admin.code);
}

import { runFullFlowSeed } from './seed-full-flow';

async function main() {
  if (process.env.NODE_ENV === 'production' && process.env.ALLOW_DEMO_SEED !== 'true') throw new Error('Seed demo bị chặn trong production. Chỉ bật ALLOW_DEMO_SEED=true sau khi đã duyệt.');
  if (process.argv.includes('--include-hr')) {
    if (process.env.CONFIRM_DEMO_HR_OVERWRITE !== 'YES') throw new Error('HR seed sửa hồ sơ demo NV001–NV014. Để chạy, đặt CONFIRM_DEMO_HR_OVERWRITE=YES.');
    await seedHrDemo();
  }
  await runFullFlowSeed();
  if (process.argv.includes('--include-hr')) await seedHrBusinessFlows();
}

async function seedHrDemo() {
  await seedPermissions(prisma); await seedRoles(prisma); await seedPositions(prisma); await seedWorkShifts(prisma); await seedLeaveTypes(prisma);
  await seedHolidays(prisma, TODAY.getFullYear()); await seedSystemSettings(prisma); await seedNotificationTemplates(prisma);
  const workflow = await seedDefaultWorkflow(prisma);
  await prisma.leaveType.updateMany({ where: { workflowDefinitionId: null }, data: { workflowDefinitionId: workflow.id } });
  const depts = await seedDemoOrg(prisma);
  const employees = await seedDemoEmployees(prisma, depts, process.env.SEED_DEMO_PASSWORD || 'Workhub@123');
  await seedDemoTasks(prisma, employees); await seedDemoAttendance(prisma, employees); await seedDemoLeaves(prisma, employees);
  await seedDemoFnbEquipment(prisma, employees.get('NV005'));
  await prisma.leaveRequest.deleteMany({ where: { code: { startsWith: 'LR-' }, reason: { contains: 'demo' } } });
  const adminRole = await prisma.role.findUnique({ where: { code: 'ADMIN' } });
  const adminEmp = await prisma.employee.findUnique({ where: { code: 'ADMIN' } });
  let adminUser = adminEmp ? await prisma.user.findUnique({ where: { employeeId: adminEmp.id } }) : null;
  if (!adminEmp && adminRole) {
    const employee = await prisma.employee.create({ data: { code: 'ADMIN', fullName: process.env.SEED_ADMIN_NAME || 'Quản trị hệ thống', email: process.env.SEED_ADMIN_EMAIL || 'admin@workhub.local', status: 'ACTIVE' } });
    adminUser = await prisma.user.create({ data: { employeeId: employee.id, username: process.env.SEED_ADMIN_USERNAME || 'admin', passwordHash: await hashPassword(process.env.SEED_ADMIN_PASSWORD || 'Workhub@123'), mustChangePassword: !process.env.SEED_ADMIN_PASSWORD } });
    await prisma.userRole.create({ data: { userId: adminUser.id, roleId: adminRole.id } });
  }
  if (adminEmp) await seedDemoAdminApprovals(prisma, adminEmp.id, employees);
}

async function seedHrBusinessFlows() {
  const employee = await prisma.employee.findUnique({ where: { code: 'NV005' } });
  const employee2 = await prisma.employee.findUnique({ where: { code: 'NV006' } });
  const customer = await prisma.customer.findUnique({ where: { code: `${PREFIX}CUS-001` } });
  const product = await prisma.inventoryItem.findUnique({ where: { itemCode: `${PREFIX}FILTER-01` } });
  if (!employee || !employee2 || !customer || !product) return;
  const year = TODAY.getFullYear(); const day = (offset: number) => new Date(TODAY.getFullYear(), TODAY.getMonth(), TODAY.getDate() + offset, 12);
  await prisma.task.createMany({ data: [
    { code: `${PREFIX}TASK-001`, title: 'DEMO · Kiểm tra tồn kho định kỳ', departmentId: employee.departmentId, creatorId: employee.id, assigneeId: employee2.id, reviewerId: employee.id, status: 'IN_PROGRESS', priority: 'HIGH', progress: 40, startDate: day(-2), dueDate: day(4), tags: DEMO_NOTE },
    { code: `${PREFIX}TASK-002`, title: 'DEMO · Hoàn tất đối soát công nợ khách hàng', departmentId: employee.departmentId, creatorId: employee.id, assigneeId: employee.id, status: 'DONE', priority: 'MEDIUM', progress: 100, startDate: day(-8), dueDate: day(-2), completedAt: day(-2), tags: DEMO_NOTE },
  ], skipDuplicates: true });
  const annual = await prisma.leaveType.findUnique({ where: { code: 'ANNUAL' } });
  const wf = await prisma.workflowDefinition.findUnique({ where: { code: 'LEAVE_DEFAULT' } });
  if (annual && wf) {
    const req = await prisma.leaveRequest.upsert({ where: { code: `${PREFIX}LR-${year}-001` }, update: {}, create: { code: `${PREFIX}LR-${year}-001`, employeeId: employee.id, leaveTypeId: annual.id, startDate: day(14), endDate: day(14), durationType: 'HALF_DAY_MORNING', totalDays: 0.5, reason: DEMO_NOTE, status: 'PENDING', submittedAt: new Date() } });
    try {
      await prisma.leaveRequestDay.upsert({ where: { requestId_date: { requestId: req.id, date: day(14) } }, update: { portion: 0.5 }, create: { requestId: req.id, date: day(14), portion: 0.5 } });
    } catch (error) {
      if ((error as { code?: string })?.code !== 'P2002') throw error;
    }
    const instance = await prisma.workflowInstance.upsert({ where: { id: req.workflowInstanceId ?? -1 }, update: {}, create: { definitionId: wf.id, entityType: 'LEAVE', entityId: req.id, requesterId: employee.id, status: 'RUNNING', currentStepOrder: 1 } });
    await prisma.leaveRequest.update({ where: { id: req.id }, data: { workflowInstanceId: instance.id } });
  }
  console.log(`✓ HR demo: ${await prisma.task.count({ where: { code: { startsWith: PREFIX } } })} tasks; nhân viên mẫu ${employee.code}.`);
}

main().catch((error) => { console.error('Demo seed failed:', error); process.exitCode = 1; }).finally(() => prisma.$disconnect());
