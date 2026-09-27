/**
 * SEED DATA DOANH NGHIỆP THỰC TẾ - 6 THÁNG TOÀN DIỆN
 *
 * Tiêu chuẩn dữ liệu:
 *   - Mã chứng từ thật 100%: CUS-2026-xxxx, ORD-2026-xxxx, PO-2026-xxxx, NK-2026-xxxx, XK-2026-xxxx, PT-2026-xxxx, CTT-2026-xxxx, BG-2026-xxxx
 *   - Tuyệt đối KHÔNG dùng tiền tố "DEMO-"
 *   - Dữ liệu trải dài 6 tháng liên tục (Tháng 4 -> Tháng 9/2026) thể hiện xu hướng tăng trưởng
 *   - Phí khác mặc định = 0 (cước VC, hải quan, phụ phí)
 *   - Giá bán tính theo công thức hệ thống: Giá bán = Giá vốn / (1 - Margin%) với Margin 35%
 *   - Thuế VAT 8% bóc tách minh bạch
 */

import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// ═══════════════ CẤU HÌNH HỆ THỐNG ═══════════════
const MARGIN = 35; // %
const EXCHANGE_RATE_EUR = 32_500;
const EXCHANGE_RATE_USD = 25_500;
const VAT_RATE = 8; // %

const YEAR = 2026;

// Hàm tạo Date chuẩn xác theo tháng (1-indexed: 4 = Tháng 4, 9 = Tháng 9)
const makeDate = (month: number, day: number, hour = 10) => new Date(YEAR, month - 1, day, hour, 0, 0);

function calcSellingPrice(cost: number): number {
  if (cost <= 0) return 0;
  return Math.round(cost / (1 - MARGIN / 100));
}

export async function runFullFlowSeed() {
  console.log('╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  BẮT ĐẦU SEED DỮ LIỆU KINH DOANH & KHO VẬN 6 THÁNG CHUYÊN NGHIỆP     ║');
  console.log('║  - Thời gian: Tháng 04/2026 -> Tháng 09/2026 (6 tháng liên tục)      ║');
  console.log('║  - 100% Mã thực tế chuẩn doanh nghiệp (CUS-, ORD-, PO-, NK-, XK-)    ║');
  console.log('║  - Không dùng mã DEMO-, Phí khác = 0, Margin chuẩn 35%               ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝\n');

  // ─── STEP 1: XÁC MINH & CHUẨN HÓA MASTER DATA ───
  console.log('═══ [1/8] CHUẨN HÓA MASTER DATA (User, Kho hàng, Khách hàng, Thiết bị) ═══');

  // 1.1 Admin User
  let adminUser = await prisma.user.findFirst({
    where: { username: 'admin' },
    select: { id: true, username: true },
  });
  if (!adminUser) {
    adminUser = await prisma.user.findFirst({ select: { id: true, username: true } });
  }
  if (!adminUser) throw new Error('Chưa có tài khoản User trong hệ thống; vui lòng chạy npm run db:seed trước.');
  const adminUserId: number = adminUser.id;
  console.log(`  ✓ Người thực hiện: ${adminUser.username} (ID: ${adminUserId})`);

  // 1.1 Dọn sạch giao dịch cũ để không bị vướng ràng buộc khóa ngoại
  await prisma.$transaction(async (tx) => {
    await tx.customerPaymentAllocation.deleteMany({});
    await tx.customerPayment.deleteMany({});
    await tx.customerReturnItem.deleteMany({});
    await tx.customerReturn.deleteMany({});
    await tx.customerOrderItem.deleteMany({});
    await tx.customerOrder.deleteMany({});
    await tx.customerQuotationItem.deleteMany({});
    await tx.customerQuotation.deleteMany({});
    await tx.serviceTicket.deleteMany({});
    await tx.serviceContract.deleteMany({});
    await tx.customerCareActivity.deleteMany({});
    await tx.customerContact.deleteMany({});
    await tx.customerLocation.deleteMany({});
    await tx.customerProfile.deleteMany({});
    await tx.supplierPaymentAllocation.deleteMany({});
    await tx.supplierPayment.deleteMany({});
    await tx.inventoryTransactionItem.deleteMany({});
    await tx.inventoryTransaction.deleteMany({});
    await tx.stockCountItem.deleteMany({});
    await tx.stockCount.deleteMany({});
    await tx.sparePartOrderItem.deleteMany({});
    await tx.sparePartOrder.deleteMany({});
    await tx.inventoryStock.updateMany({ data: { quantity: 0 } });
  });

  // 1.2 Kho hàng chuẩn doanh nghiệp (Xóa các kho DEMO cũ nếu có)
  await prisma.warehouse.deleteMany({
    where: { code: { in: ['DEMO-HN', 'DEMO-HCM'] } },
  });

  const whNorth = await prisma.warehouse.upsert({
    where: { code: 'WH-HN' },
    update: { name: 'Kho Kỹ thuật & Phụ tùng Miền Bắc (Hà Nội)', type: 'CENTRAL', address: 'Long Biên, Hà Nội' },
    create: { code: 'WH-HN', name: 'Kho Kỹ thuật & Phụ tùng Miền Bắc (Hà Nội)', type: 'CENTRAL', address: 'Long Biên, Hà Nội' },
  });
  const whSouth = await prisma.warehouse.upsert({
    where: { code: 'WH-HCM' },
    update: { name: 'Kho Kỹ thuật & Phụ tùng Miền Nam (TP.HCM)', type: 'BRANCH', address: 'Tân Bình, TP. Hồ Chí Minh' },
    create: { code: 'WH-HCM', name: 'Kho Kỹ thuật & Phụ tùng Miền Nam (TP.HCM)', type: 'BRANCH', address: 'Tân Bình, TP. Hồ Chí Minh' },
  });
  const whCentral = await prisma.warehouse.upsert({
    where: { code: 'WH-DN' },
    update: { name: 'Kho Kỹ thuật & Trạm Dịch vụ Miền Trung (Đà Nẵng)', type: 'BRANCH', address: 'Hải Châu, Đà Nẵng' },
    create: { code: 'WH-DN', name: 'Kho Kỹ thuật & Trạm Dịch vụ Miền Trung (Đà Nẵng)', type: 'BRANCH', address: 'Hải Châu, Đà Nẵng' },
  });
  console.log(`  ✓ Kho hàng: ${whNorth.code} (Miền Bắc), ${whSouth.code} (Miền Nam), ${whCentral.code} (Miền Trung)`);

  // 1.3 Khách hàng chuỗi F&B hàng đầu Việt Nam (Đổi/xóa sạch các mã DEMO-CUS cũ)
  await prisma.customer.deleteMany({
    where: { code: { startsWith: 'DEMO' } },
  });

  const enterpriseCustomers = [
    {
      code: 'CUS-2026-0001',
      name: 'Công ty CP Tập đoàn Golden Gate (Cổng Vàng)',
      phone: '02473038888',
      email: 'contact@ggg.com.vn',
      address: '315 Trường Chinh, Thanh Xuân, Hà Nội',
    },
    {
      code: 'CUS-2026-0002',
      name: 'Công ty TNHH Kem & Socola Maison Marou',
      phone: '02839141528',
      email: 'info@marouchocolate.com',
      address: '167-169 Calmette, Quận 1, TP.HCM',
    },
    {
      code: 'CUS-2026-0003',
      name: 'Công ty CP Bánh ngọt & Tráng miệng Tous les Jours Việt Nam',
      phone: '02838272772',
      email: 'service@touslesjours.com.vn',
      address: 'Quận 1, TP. Hồ Chí Minh',
    },
    {
      code: 'CUS-2026-0004',
      name: 'Công ty CP Trà & Cà phê Phúc Long',
      phone: '1900234518',
      email: 'fnb@phuclong.masangroup.com',
      address: 'TP. Thủ Đức, TP. Hồ Chí Minh',
    },
    {
      code: 'CUS-2026-0005',
      name: 'Công ty CP Dịch vụ Cà phê Cao Nguyên (Highlands Coffee)',
      phone: '02835127355',
      email: 'customerservice@highlandscoffee.com.vn',
      address: '135 Hai Bà Trưng, Bến Nghé, Quận 1, TP.HCM',
    },
    {
      code: 'CUS-2026-0006',
      name: 'Công ty TNHH Pizza 4P\'s Việt Nam',
      phone: '02836220500',
      email: 'support@pizza4ps.com',
      address: '8/15 Lê Thánh Tôn, Bến Nghé, Quận 1, TP.HCM',
    },
    {
      code: 'CUS-2026-0007',
      name: 'Công ty CP TMDV Trà Cà phê Việt Nam (The Coffee House)',
      phone: '18006936',
      email: 'hi@thecoffeehouse.vn',
      address: '86-88 Cao Thắng, Phường 4, Quận 3, TP.HCM',
    },
    {
      code: 'CUS-2026-0008',
      name: 'Công ty CP Tập đoàn Trung Nguyên (Trung Nguyên Legend)',
      phone: '02839251852',
      email: 'contact@trungnguyenlegend.com',
      address: '82-84 Bùi Thị Xuân, Phường Bến Thành, Quận 1, TP.HCM',
    },
  ];

  const custMap = new Map<string, any>();
  for (const c of enterpriseCustomers) {
    const cust = await prisma.customer.upsert({
      where: { code: c.code },
      update: { name: c.name, phone: c.phone, email: c.email, address: c.address },
      create: { code: c.code, name: c.name, phone: c.phone, email: c.email, address: c.address, status: 'ACTIVE' },
    });
    custMap.set(c.code, cust);
  }
  console.log(`  ✓ Khách hàng: Đã sẵn sàng ${custMap.size} chuỗi F&B lớn (Golden Gate, Marou, Tous les Jours, Phúc Long, Highlands, Pizza 4P's, Coffee House, Trung Nguyên)`);

  // 1.4 Chuẩn hóa các linh kiện có mã DEMO sang mã chuẩn kỹ thuật
  await prisma.inventoryItem.deleteMany({
    where: { itemCode: { startsWith: 'DEMO' } },
  });

  // 1.5 Thiết bị F&B liên kết khách hàng
  const machineData = [
    { code: 'EQ-2026-0001', name: 'Máy làm kem tươi Taylor C708 (Công nghệ giữ tươi ban đêm)', custCode: 'CUS-2026-0001', serial: 'TYL-C708-VN8892', category: 'ICE_CREAM' },
    { code: 'EQ-2026-0002', name: 'Máy làm kem Gelato Carpigiani Labo 14 20 M', custCode: 'CUS-2026-0003', serial: 'CPG-LB14-9921', category: 'ICE_CREAM' },
    { code: 'EQ-2026-0003', name: 'Máy gia nhiệt & Tôi Socola tự động Selmi Plus EX', custCode: 'CUS-2026-0002', serial: 'SLM-PEX-202603', category: 'CHOCOLATE' },
    { code: 'EQ-2026-0004', name: 'Máy nấu chảy & Phủ Socola FBM Prima Enrober', custCode: 'CUS-2026-0002', serial: 'FBM-PRM-8834', category: 'CHOCOLATE' },
    { code: 'EQ-2026-0005', name: 'Máy pha cà phê chuyên nghiệp La Marzocco Linea PB 2 Group', custCode: 'CUS-2026-0004', serial: 'LM-PB2G-9844', category: 'COFFEE' },
    { code: 'EQ-2026-0006', name: 'Máy pha cà phê Nuova Simonelli Aurelia II T3 3 Group', custCode: 'CUS-2026-0005', serial: 'NS-AUR3G-4412', category: 'COFFEE' },
    { code: 'EQ-2026-0007', name: 'Máy làm đá viên vuông cao cấp Hoshizaki IM-100CNE', custCode: 'CUS-2026-0001', serial: 'HSZ-IM100-5521', category: 'ICE_MAKER' },
    { code: 'EQ-2026-0008', name: 'Lò nướng đối lưu Combi Unox Cheftop Mind.Maps Plus 7 khay', custCode: 'CUS-2026-0003', serial: 'UNX-CT07-3319', category: 'BAKERY' },
    { code: 'EQ-2026-0009', name: 'Lò nướng bánh Pizza Moretti Forni Neapolis 6 cao cấp', custCode: 'CUS-2026-0006', serial: 'MF-NEA6-7789', category: 'BAKERY' },
    { code: 'EQ-2026-0010', name: 'Máy pha cà phê Synesso MVP Hydra 2 Group', custCode: 'CUS-2026-0007', serial: 'SYN-HYD2-1145', category: 'COFFEE' },
    { code: 'EQ-2026-0011', name: 'Máy rang cà phê công nghiệp Probat Probatone 5', custCode: 'CUS-2026-0008', serial: 'PRB-TONE5-9901', category: 'COFFEE' },
    { code: 'EQ-2026-0012', name: 'Máy làm kem tươi Donper D840P (Lưu kho dự phòng)', custCode: null, serial: 'DNP-D840-7712', category: 'ICE_CREAM' },
  ];

  for (const m of machineData) {
    const cust = m.custCode ? custMap.get(m.custCode) : null;
    await prisma.fnbEquipment.upsert({
      where: { machineCode: m.code },
      update: { name: m.name, customerId: cust ? cust.id : null, serialNumber: m.serial, status: 'OPERATIONAL', category: m.category },
      create: { machineCode: m.code, name: m.name, customerId: cust ? cust.id : null, serialNumber: m.serial, status: 'OPERATIONAL', category: m.category },
    });
  }
  console.log(`  ✓ Thiết bị máy móc: Đã liên kết ${machineData.length} thiết bị chính xác cho từng chuỗi`);



  // ─── STEP 3: CẬP NHẬT CHÍNH SÁCH GIÁ VÀ GIÁ BÁN TOÀN BỘ LINH KIỆN ───
  console.log('\n═══ [3/8] CẬP NHẬT CẤU HÌNH GIÁ MARGIN 35% & PHÍ KHÁC = 0 ═══');
  const configKey = 'spare_parts_pricing_config';
  const pricingConfig = {
    defaultExchangeRateEur: EXCHANGE_RATE_EUR,
    defaultExchangeRateUsd: EXCHANGE_RATE_USD,
    defaultMarginPercent: MARGIN,
    pricingMethod: 'MARGIN',
    defaultShippingFee: 0,
    defaultCustomsFee: 0,
    defaultExtraShippingRate: 0,
    defaultVatRate: VAT_RATE,
    volumeDiscountTiers: [
      { min: 1, max: 4, rate: 0 },
      { min: 5, max: 9, rate: 0.05 },
      { min: 10, max: 19, rate: 0.10 },
      { min: 20, max: 99999, rate: 0.15 },
    ],
    defaultValidDays: 30,
    defaultDeliveryTime: 'Giao ngay trong 24h từ kho linh kiện',
    defaultPaymentTerms: 'Thanh toán trong vòng 30 ngày kể từ ngày giao hàng',
    defaultWarrantyTerms: 'Bảo hành chính hãng 06 tháng đối với linh kiện cơ điện tử',
    defaultQuotationNotes: 'Linh kiện chính hãng. Phí khác mặc định 0đ. Đơn giá chưa gồm VAT 8%.',
  };

  await prisma.systemSetting.upsert({
    where: { key: configKey },
    update: { valueJson: pricingConfig, groupName: 'spare_parts' },
    create: { key: configKey, valueJson: pricingConfig, groupName: 'spare_parts' },
  });

  const allItems = await prisma.inventoryItem.findMany();
  const itemMap = new Map<string, any>();
  for (const it of allItems) {
    const rawCost = Number(it.costPrice || 0) > 0
      ? Number(it.costPrice)
      : Number(it.priceEur || 0) > 0
        ? Math.round(Number(it.priceEur) * EXCHANGE_RATE_EUR)
        : 600_000;
    const selling = calcSellingPrice(rawCost);

    const updated = await prisma.inventoryItem.update({
      where: { id: it.id },
      data: {
        costPrice: rawCost,
        avgCost: rawCost,
        sellingPrice: selling,
        autoPrice: selling,
        autoPriceBasis: rawCost,
        autoPriceAt: new Date(YEAR, 3, 1), // Từ đầu tháng 4/2026
      },
    });
    itemMap.set(updated.itemCode, updated);
  }
  console.log(`  ✓ Đã cập nhật giá bán tự động (Margin ${MARGIN}%, Phí khác = 0) cho ${allItems.length} linh kiện`);

  const getItem = (code: string, fallbackId: number) => {
    return itemMap.get(code) || allItems.find(i => i.id === fallbackId) || allItems[0];
  };

  // ─── STEP 4: TẠO ĐƠN MUA NCC (PO) & NHẬP KHO (NK) 6 THÁNG ───
  console.log('\n═══ [4/8] KHỞI TẠO ĐƠN MUA NCC (PO) & NHẬP KHO (NK) 6 THÁNG (T4 -> T9) ═══');

  interface POCreateOptions {
    orderCode: string;
    supplier: string;
    date: Date;
    warehouseId: number;
    warehouseCode: string;
    payPercent: number;
    items: { code: string; fallbackId: number; qty: number; costVnd: number; eur?: number }[];
  }

  async function processPO(opts: POCreateOptions) {
    const poItemsData = opts.items.map(i => {
      const it = getItem(i.code, i.fallbackId);
      const unitCost = i.costVnd;
      return {
        itemId: it.id,
        quantity: i.qty,
        unitPriceEur: i.eur || null,
        unitPriceVnd: unitCost,
        discountVnd: 0,
        finalPriceVnd: unitCost * i.qty,
      };
    });

    const subtotal = poItemsData.reduce((s, it) => s + it.finalPriceVnd, 0);
    const totalVnd = subtotal;
    const totalQty = poItemsData.reduce((s, it) => s + it.quantity, 0);
    const paidAmount = Math.round(totalVnd * (opts.payPercent / 100));

    const po = await prisma.sparePartOrder.create({
      data: {
        orderCode: opts.orderCode,
        supplier: opts.supplier,
        status: 'COMPLETED',
        currency: opts.items.some(x => x.eur) ? 'EUR' : 'VND',
        exchangeRate: opts.items.some(x => x.eur) ? EXCHANGE_RATE_EUR : 1,
        shippingFee: 0,
        customsFee: 0,
        extraShippingRate: 0,
        discountRate: 0,
        discountVnd: 0,
        totalItemsQty: totalQty,
        subtotalVnd: subtotal,
        totalVnd: totalVnd,
        paidAmount: paidAmount,
        stockedAt: opts.date,
        targetWarehouseId: opts.warehouseId,
        notes: `Đơn mua linh kiện chính hãng ${opts.orderCode} - Nhập kho ${opts.warehouseCode}`,
        createdById: adminUserId,
        createdAt: opts.date,
        items: { create: poItemsData },
      },
    });

    // Phiếu nhập kho (NK)
    await prisma.inventoryTransaction.create({
      data: {
        transCode: `NK-${opts.orderCode.replace('PO-', '')}`,
        type: 'IN',
        targetWarehouseId: opts.warehouseId,
        sparePartOrderId: po.id,
        reasonCode: 'PURCHASE',
        reason: `Nhập kho từ ${opts.supplier} theo đơn ${opts.orderCode}`,
        partnerName: opts.supplier,
        transDate: opts.date,
        totalValue: totalVnd,
        createdById: adminUserId,
        status: 'COMPLETED',
        createdAt: opts.date,
        items: {
          create: poItemsData.map(line => ({
            itemId: line.itemId,
            quantity: line.quantity,
            unitCost: line.unitPriceVnd,
            unitPrice: line.unitPriceVnd,
          })),
        },
      },
    });

    // Cập nhật tồn kho
    for (const line of poItemsData) {
      await prisma.inventoryStock.upsert({
        where: { warehouseId_itemId: { warehouseId: opts.warehouseId, itemId: line.itemId } },
        create: { warehouseId: opts.warehouseId, itemId: line.itemId, quantity: line.quantity },
        update: { quantity: { increment: line.quantity } },
      });
    }

    // Thanh toán NCC (CTT)
    if (paidAmount > 0) {
      const cttCode = `CTT-${opts.orderCode.replace('PO-', '')}`;
      await prisma.supplierPayment.create({
        data: {
          paymentCode: cttCode,
          supplier: opts.supplier,
          orderId: po.id,
          amount: paidAmount,
          method: 'TRANSFER',
          paidAt: new Date(opts.date.getTime() + 86400000 * 2),
          note: opts.payPercent === 100 ? 'Thanh toán toàn bộ đơn mua hàng' : `Thanh toán đợt 1 (${opts.payPercent}%)`,
          createdById: adminUserId,
          allocationVersion: 1,
          allocations: { create: [{ orderId: po.id, amount: paidAmount }] },
        },
      });
    }

    console.log(`  ✓ [PO] ${opts.orderCode} (${opts.date.toLocaleDateString('vi-VN')}) → Kho ${opts.warehouseCode} | ${totalQty} món | ${totalVnd.toLocaleString()} ₫ (Trả ${opts.payPercent}%)`);
  }

  // --- THÁNG 4/2026 ---
  await processPO({
    orderCode: 'PO-2026-0001',
    supplier: 'Selmi S.r.l (Italy)',
    date: makeDate(4, 5),
    warehouseId: whNorth.id,
    warehouseCode: 'HN',
    payPercent: 100,
    items: [
      { code: 'PART-TEMP-PT100', fallbackId: 3, qty: 8, costVnd: 1_950_000, eur: 60 },
      { code: 'COMMMO56TB405__000001', fallbackId: 10, qty: 4, costVnd: 3_380_000, eur: 104 },
      { code: 'COMMSESPMIC____000001', fallbackId: 14, qty: 3, costVnd: 15_843_750, eur: 487.5 },
    ],
  });

  await processPO({
    orderCode: 'PO-2026-0002',
    supplier: 'Đại lý Phụ tùng F&B Sài Gòn',
    date: makeDate(4, 10),
    warehouseId: whSouth.id,
    warehouseCode: 'HCM',
    payPercent: 100,
    items: [
      { code: 'PART-TYL-BLADE', fallbackId: 1, qty: 12, costVnd: 2_800_000 },
      { code: 'PART-ORING-SILICONE', fallbackId: 2, qty: 30, costVnd: 450_000 },
      { code: 'PART-VALVE-3WAY', fallbackId: 5, qty: 10, costVnd: 1_350_000 },
      { code: 'PART-FILTER-WATER', fallbackId: 8, qty: 20, costVnd: 1_400_000 },
    ],
  });

  // --- THÁNG 5/2026 ---
  await processPO({
    orderCode: 'PO-2026-0003',
    supplier: 'Nhà phân phối Unox & Thiết bị Bếp',
    date: makeDate(5, 6),
    warehouseId: whSouth.id,
    warehouseCode: 'HCM',
    payPercent: 100,
    items: [
      { code: 'PART-HEATER-UNOX', fallbackId: 7, qty: 10, costVnd: 2_450_000 },
      { code: 'PART-PUMP-PROCON', fallbackId: 6, qty: 6, costVnd: 3_200_000 },
      { code: 'PART-FILTER-WATER', fallbackId: 8, qty: 15, costVnd: 1_400_000 },
    ],
  });

  // --- THÁNG 6/2026 ---
  await processPO({
    orderCode: 'PO-2026-0004',
    supplier: 'Selmi S.r.l (Italy)',
    date: makeDate(6, 4),
    warehouseId: whNorth.id,
    warehouseCode: 'HN',
    payPercent: 100,
    items: [
      { code: 'COMMMETRASF450V000001', fallbackId: 37, qty: 4, costVnd: 4_436_250, eur: 136.5 },
      { code: 'COMMSESPCOMF___000001', fallbackId: 40, qty: 3, costVnd: 15_843_750, eur: 487.5 },
      { code: 'COMMSWCOMF00000000001', fallbackId: 39, qty: 3, costVnd: 9_506_250, eur: 292.5 },
      { code: 'COMMRSMCOMFIT__00000', fallbackId: 41, qty: 6, costVnd: 3_168_750, eur: 97.5 },
    ],
  });

  // --- THÁNG 7/2026 ---
  await processPO({
    orderCode: 'PO-2026-0005',
    supplier: 'Taylor Company Global Parts',
    date: makeDate(7, 5),
    warehouseId: whNorth.id,
    warehouseCode: 'HN',
    payPercent: 100,
    items: [
      { code: 'PART-AIR-PUMP', fallbackId: 4, qty: 4, costVnd: 6_500_000 },
      { code: 'PART-TYL-BLADE', fallbackId: 1, qty: 10, costVnd: 2_800_000 },
      { code: 'PART-ORING-SILICONE', fallbackId: 2, qty: 25, costVnd: 450_000 },
    ],
  });

  await processPO({
    orderCode: 'PO-2026-0006',
    supplier: 'Phụ tùng Barista & Cafe Miền Nam',
    date: makeDate(7, 12),
    warehouseId: whSouth.id,
    warehouseCode: 'HCM',
    payPercent: 100,
    items: [
      { code: 'PART-PUMP-PROCON', fallbackId: 6, qty: 6, costVnd: 3_200_000 },
      { code: 'PART-VALVE-3WAY', fallbackId: 5, qty: 15, costVnd: 1_350_000 },
      { code: 'PART-FILTER-WATER', fallbackId: 8, qty: 20, costVnd: 1_400_000 },
    ],
  });

  // --- THÁNG 8/2026 ---
  await processPO({
    orderCode: 'PO-2026-0007',
    supplier: 'Selmi S.r.l (Italy)',
    date: makeDate(8, 4),
    warehouseId: whNorth.id,
    warehouseCode: 'HN',
    payPercent: 100,
    items: [
      { code: 'PART-TEMP-PT100', fallbackId: 3, qty: 10, costVnd: 1_950_000, eur: 60 },
      { code: 'COMMMO56TB405__000001', fallbackId: 10, qty: 6, costVnd: 3_380_000, eur: 104 },
      { code: 'COMMSESPMIC____000001', fallbackId: 14, qty: 4, costVnd: 15_843_750, eur: 487.5 },
      { code: 'COMMSWMICR00000000001', fallbackId: 15, qty: 4, costVnd: 12_675_000, eur: 390 },
    ],
  });

  await processPO({
    orderCode: 'PO-2026-0008',
    supplier: 'Công ty TNHH Phụ tùng F&B Sài Gòn',
    date: makeDate(8, 8),
    warehouseId: whSouth.id,
    warehouseCode: 'HCM',
    payPercent: 100,
    items: [
      { code: 'PART-TYL-BLADE', fallbackId: 1, qty: 15, costVnd: 2_800_000 },
      { code: 'PART-ORING-SILICONE', fallbackId: 2, qty: 40, costVnd: 450_000 },
      { code: 'PART-VALVE-3WAY', fallbackId: 5, qty: 15, costVnd: 1_350_000 },
      { code: 'PART-FILTER-WATER', fallbackId: 8, qty: 25, costVnd: 1_400_000 },
      { code: 'PART-PUMP-PROCON', fallbackId: 6, qty: 8, costVnd: 3_200_000 },
    ],
  });

  // --- THÁNG 9/2026 (HIỆN TẠI) ---
  await processPO({
    orderCode: 'PO-2026-0009',
    supplier: 'Selmi S.r.l (Italy)',
    date: makeDate(9, 3),
    warehouseId: whNorth.id,
    warehouseCode: 'HN',
    payPercent: 100,
    items: [
      { code: 'COMMMETRASF450V000001', fallbackId: 37, qty: 4, costVnd: 4_436_250, eur: 136.5 },
      { code: 'COMMSESPCOMF___000001', fallbackId: 40, qty: 4, costVnd: 15_843_750, eur: 487.5 },
      { code: 'COMMSWCOMF00000000001', fallbackId: 39, qty: 4, costVnd: 9_506_250, eur: 292.5 },
      { code: 'COMMRSMCOMFIT__00000', fallbackId: 41, qty: 8, costVnd: 3_168_750, eur: 97.5 },
    ],
  });

  await processPO({
    orderCode: 'PO-2026-0010',
    supplier: 'Công ty Thiết bị & Vật tư F&B Sài Gòn',
    date: makeDate(9, 10),
    warehouseId: whSouth.id,
    warehouseCode: 'HCM',
    payPercent: 50,
    items: [
      { code: 'PART-HEATER-UNOX', fallbackId: 7, qty: 12, costVnd: 2_450_000 },
      { code: 'PART-FILTER-WATER', fallbackId: 8, qty: 20, costVnd: 1_400_000 },
      { code: 'PART-VALVE-3WAY', fallbackId: 5, qty: 12, costVnd: 1_350_000 },
      { code: 'PART-AIR-PUMP', fallbackId: 4, qty: 4, costVnd: 6_500_000 },
    ],
  });

  await processPO({
    orderCode: 'PO-2026-0011',
    supplier: 'Nhà nhập khẩu Phụ tùng Taylor Global',
    date: makeDate(9, 18),
    warehouseId: whNorth.id,
    warehouseCode: 'HN',
    payPercent: 0,
    items: [
      { code: 'PART-TYL-BLADE', fallbackId: 1, qty: 10, costVnd: 2_800_000 },
      { code: 'PART-ORING-SILICONE', fallbackId: 2, qty: 30, costVnd: 450_000 },
    ],
  });

  // ─── STEP 5: BÁO GIÁ KHÁCH HÀNG (BG) ───
  console.log('\n═══ [5/8] TẠO CÁC BÁO GIÁ KHÁCH HÀNG (BG-2026-xxxx) ═══');

  interface QuoteCreateOptions {
    quoteCode: string;
    customerCode: string;
    status: 'ACCEPTED' | 'SENT' | 'DRAFT';
    date: Date;
    items: { code: string; fallbackId: number; qty: number }[];
    notes?: string;
  }

  const quoteMap = new Map<string, any>();
  async function processQuotation(opts: QuoteCreateOptions) {
    const cust = custMap.get(opts.customerCode);
    const qItems = opts.items.map(i => {
      const it = getItem(i.code, i.fallbackId);
      const unit = Number(it.sellingPrice);
      return {
        itemType: 'SPARE_PART',
        name: it.name,
        quantity: i.qty,
        unitPrice: unit,
        discountVnd: 0,
        totalPrice: unit * i.qty,
        inventoryItemId: it.id,
      };
    });

    const subtotal = qItems.reduce((s, it) => s + it.totalPrice, 0);
    const vat = Math.round((subtotal * VAT_RATE) / 100);
    const total = subtotal + vat;

    const validUntil = new Date(opts.date.getTime() + 86400000 * 30);
    const quote = await prisma.customerQuotation.create({
      data: {
        quoteCode: opts.quoteCode,
        customerId: cust.id,
        status: opts.status,
        subtotal: subtotal,
        discountRate: 0,
        discountAmount: 0,
        shippingFee: 0,
        vatRate: VAT_RATE,
        vatAmount: vat,
        totalAmount: total,
        quoteDate: opts.date,
        validUntil: validUntil,
        notes: opts.notes || 'Báo giá linh kiện chính hãng. Đơn giá chưa VAT 8%. Phí khác = 0.',
        items: { create: qItems },
      },
    });

    quoteMap.set(opts.quoteCode, quote);
    console.log(`  ✓ [BG] ${opts.quoteCode} | ${cust.name} | ${opts.status} | ${total.toLocaleString()} ₫`);
  }

  await processQuotation({ quoteCode: 'BG-2026-0001', customerCode: 'CUS-2026-0001', status: 'ACCEPTED', date: makeDate(4, 12), items: [{ code: 'PART-TYL-BLADE', fallbackId: 1, qty: 2 }, { code: 'PART-ORING-SILICONE', fallbackId: 2, qty: 4 }] });
  await processQuotation({ quoteCode: 'BG-2026-0002', customerCode: 'CUS-2026-0005', status: 'ACCEPTED', date: makeDate(5, 10), items: [{ code: 'PART-PUMP-PROCON', fallbackId: 6, qty: 2 }, { code: 'PART-VALVE-3WAY', fallbackId: 5, qty: 3 }] });
  await processQuotation({ quoteCode: 'BG-2026-0003', customerCode: 'CUS-2026-0004', status: 'ACCEPTED', date: makeDate(6, 12), items: [{ code: 'COMMSESPCOMF___000001', fallbackId: 40, qty: 1 }, { code: 'COMMSWCOMF00000000001', fallbackId: 39, qty: 1 }] });
  await processQuotation({ quoteCode: 'BG-2026-0004', customerCode: 'CUS-2026-0007', status: 'ACCEPTED', date: makeDate(7, 15), items: [{ code: 'PART-PUMP-PROCON', fallbackId: 6, qty: 1 }, { code: 'PART-VALVE-3WAY', fallbackId: 5, qty: 4 }] });
  await processQuotation({ quoteCode: 'BG-2026-0005', customerCode: 'CUS-2026-0002', status: 'ACCEPTED', date: makeDate(8, 10), items: [{ code: 'COMMSESPMIC____000001', fallbackId: 14, qty: 1 }, { code: 'COMMSWMICR00000000001', fallbackId: 15, qty: 1 }] });
  await processQuotation({ quoteCode: 'BG-2026-0006', customerCode: 'CUS-2026-0004', status: 'ACCEPTED', date: makeDate(9, 6), items: [{ code: 'COMMSESPCOMF___000001', fallbackId: 40, qty: 1 }, { code: 'COMMSWCOMF00000000001', fallbackId: 39, qty: 1 }, { code: 'COMMRSMCOMFIT__00000', fallbackId: 41, qty: 2 }] });
  await processQuotation({ quoteCode: 'BG-2026-0007', customerCode: 'CUS-2026-0005', status: 'ACCEPTED', date: makeDate(9, 14), items: [{ code: 'PART-VALVE-3WAY', fallbackId: 5, qty: 2 }, { code: 'PART-ORING-SILICONE', fallbackId: 2, qty: 5 }] });
  await processQuotation({ quoteCode: 'BG-2026-0008', customerCode: 'CUS-2026-0002', status: 'ACCEPTED', date: makeDate(9, 18), items: [{ code: 'COMMMO56TB405__000001', fallbackId: 10, qty: 1 }, { code: 'PART-TEMP-PT100', fallbackId: 3, qty: 1 }] });
  await processQuotation({ quoteCode: 'BG-2026-0009', customerCode: 'CUS-2026-0003', status: 'SENT', date: makeDate(9, 22), items: [{ code: 'PART-HEATER-UNOX', fallbackId: 7, qty: 2 }, { code: 'PART-FILTER-WATER', fallbackId: 8, qty: 4 }] });
  await processQuotation({ quoteCode: 'BG-2026-0010', customerCode: 'CUS-2026-0006', status: 'DRAFT', date: makeDate(9, 25), items: [{ code: 'PART-HEATER-UNOX', fallbackId: 7, qty: 2 }, { code: 'PART-FILTER-WATER', fallbackId: 8, qty: 2 }] });

  // ─── STEP 6: ĐƠN BÁN HÀNG (ORD), XUẤT KHO (XK) & THU TIỀN (PT) 6 THÁNG ───
  console.log('\n═══ [6/8] TẠO ĐƠN BÁN HÀNG (ORD), XUẤT KHO (XK) & THU TIỀN (PT) 6 THÁNG ═══');

  interface SalesOrderCreateOptions {
    orderCode: string;
    customerCode: string;
    quotationCode?: string;
    date: Date;
    warehouseId: number;
    warehouseCode: string;
    status: 'COMPLETED' | 'DELIVERED' | 'CONFIRMED';
    payPercent: number;
    isOverdue?: boolean;
    notes?: string;
    items: { code: string; fallbackId: number; qty: number }[];
  }

  async function processSalesOrder(opts: SalesOrderCreateOptions) {
    const cust = custMap.get(opts.customerCode);
    const quote = opts.quotationCode ? quoteMap.get(opts.quotationCode) : null;

    const orderItemsData = opts.items.map(i => {
      const it = getItem(i.code, i.fallbackId);
      const unit = Number(it.sellingPrice);
      return {
        name: it.name,
        itemType: 'SPARE_PART',
        quantity: i.qty,
        unitPrice: unit,
        totalPrice: unit * i.qty,
        inventoryItemId: it.id,
      };
    });

    const goodsAmount = orderItemsData.reduce((s, it) => s + it.totalPrice, 0);
    const vatAmount = Math.round((goodsAmount * VAT_RATE) / 100);
    const totalAmount = goodsAmount + vatAmount;
    const paidAmount = Math.round((totalAmount * opts.payPercent) / 100);

    let dueDate: Date | null = null;
    if (opts.isOverdue) {
      dueDate = new Date(opts.date.getTime() + 86400000 * 15);
    } else {
      dueDate = new Date(opts.date.getTime() + 86400000 * 30);
    }

    const order = await prisma.customerOrder.create({
      data: {
        orderCode: opts.orderCode,
        customerId: cust.id,
        quotationId: quote ? quote.id : null,
        orderType: 'SPARE_PART',
        status: opts.status,
        goodsAmount: goodsAmount,
        shippingFee: 0,
        vatRate: VAT_RATE,
        vatAmount: vatAmount,
        totalAmount: totalAmount,
        paidAmount: paidAmount,
        orderDate: opts.date,
        deliveryDate: opts.status !== 'CONFIRMED' ? new Date(opts.date.getTime() + 86400000) : null,
        stockIssuedAt: opts.status !== 'CONFIRMED' ? new Date(opts.date.getTime() + 86400000) : null,
        dueDate: dueDate,
        notes: opts.notes || `Đơn hàng bán lẻ linh kiện chính hãng ${opts.orderCode}. Phí khác = 0.`,
        items: { create: orderItemsData },
      },
    });

    // Xuất kho (XK)
    if (opts.status === 'COMPLETED' || opts.status === 'DELIVERED') {
      const issueDate = new Date(opts.date.getTime() + 86400000);
      const txLines = orderItemsData.map(line => {
        const it = allItems.find(x => x.id === line.inventoryItemId)!;
        return {
          itemId: line.inventoryItemId,
          quantity: line.quantity,
          unitCost: Number(it.avgCost || it.costPrice || 0),
          unitPrice: line.unitPrice,
        };
      });

      const totalVal = txLines.reduce((s, it) => s + it.unitCost * it.quantity, 0);

      await prisma.inventoryTransaction.create({
        data: {
          transCode: `XK-${opts.orderCode.replace('ORD-', '')}`,
          type: 'OUT',
          sourceWarehouseId: opts.warehouseId,
          customerOrderId: order.id,
          reasonCode: 'SALE',
          reason: `Xuất kho giao linh kiện cho ${cust.name} theo đơn ${opts.orderCode}`,
          partnerName: cust.name,
          transDate: issueDate,
          totalValue: totalVal,
          createdById: adminUserId,
          status: 'COMPLETED',
          createdAt: issueDate,
          items: { create: txLines },
        },
      });

      // Trừ tồn kho
      for (const line of txLines) {
        await prisma.inventoryStock.updateMany({
          where: { warehouseId: opts.warehouseId, itemId: line.itemId },
          data: { quantity: { decrement: line.quantity } },
        });
      }
    }

    // Thu tiền khách (PT)
    if (paidAmount > 0) {
      const payDate = new Date(opts.date.getTime() + 86400000 * 2);
      const ptCode = `PT-${opts.orderCode.replace('ORD-', '')}`;
      await prisma.customerPayment.create({
        data: {
          paymentCode: ptCode,
          customerId: cust.id,
          orderId: order.id,
          amount: paidAmount,
          method: 'TRANSFER',
          paidAt: payDate,
          note: opts.payPercent === 100 ? 'Khách thanh toán toàn bộ đơn hàng' : `Thanh toán đợt 1 (${opts.payPercent}%)`,
          createdById: adminUserId,
          allocationVersion: 1,
          allocations: { create: [{ orderId: order.id, amount: paidAmount }] },
        },
      });
    }

    const debt = totalAmount - paidAmount;
    console.log(`  ✓ [ORD] ${opts.orderCode} (${opts.date.toLocaleDateString('vi-VN')}) | ${cust.name} | ${totalAmount.toLocaleString()} ₫ | ${opts.status} | Thu: ${paidAmount.toLocaleString()} ₫ (Còn: ${debt.toLocaleString()} ₫)`);
  }

  // --- THÁNG 4/2026 ---
  await processSalesOrder({ orderCode: 'ORD-2026-0001', customerCode: 'CUS-2026-0001', quotationCode: 'BG-2026-0001', date: makeDate(4, 15), warehouseId: whSouth.id, warehouseCode: 'HCM', status: 'COMPLETED', payPercent: 100, items: [{ code: 'PART-TYL-BLADE', fallbackId: 1, qty: 2 }, { code: 'PART-ORING-SILICONE', fallbackId: 2, qty: 4 }] });
  await processSalesOrder({ orderCode: 'ORD-2026-0002', customerCode: 'CUS-2026-0002', date: makeDate(4, 22), warehouseId: whNorth.id, warehouseCode: 'HN', status: 'COMPLETED', payPercent: 100, items: [{ code: 'PART-TEMP-PT100', fallbackId: 3, qty: 2 }, { code: 'COMMMO56TB405__000001', fallbackId: 10, qty: 1 }] });

  // --- THÁNG 5/2026 ---
  await processSalesOrder({ orderCode: 'ORD-2026-0003', customerCode: 'CUS-2026-0005', quotationCode: 'BG-2026-0002', date: makeDate(5, 14), warehouseId: whSouth.id, warehouseCode: 'HCM', status: 'COMPLETED', payPercent: 100, items: [{ code: 'PART-PUMP-PROCON', fallbackId: 6, qty: 2 }, { code: 'PART-VALVE-3WAY', fallbackId: 5, qty: 3 }, { code: 'PART-FILTER-WATER', fallbackId: 8, qty: 4 }] });
  await processSalesOrder({ orderCode: 'ORD-2026-0004', customerCode: 'CUS-2026-0003', date: makeDate(5, 20), warehouseId: whSouth.id, warehouseCode: 'HCM', status: 'COMPLETED', payPercent: 100, items: [{ code: 'PART-TYL-BLADE', fallbackId: 1, qty: 3 }, { code: 'PART-ORING-SILICONE', fallbackId: 2, qty: 6 }] });

  // --- THÁNG 6/2026 ---
  await processSalesOrder({ orderCode: 'ORD-2026-0005', customerCode: 'CUS-2026-0004', quotationCode: 'BG-2026-0003', date: makeDate(6, 16), warehouseId: whNorth.id, warehouseCode: 'HN', status: 'COMPLETED', payPercent: 100, items: [{ code: 'COMMSESPCOMF___000001', fallbackId: 40, qty: 1 }, { code: 'COMMSWCOMF00000000001', fallbackId: 39, qty: 1 }, { code: 'COMMRSMCOMFIT__00000', fallbackId: 41, qty: 2 }] });
  await processSalesOrder({ orderCode: 'ORD-2026-0006', customerCode: 'CUS-2026-0006', date: makeDate(6, 24), warehouseId: whSouth.id, warehouseCode: 'HCM', status: 'COMPLETED', payPercent: 100, items: [{ code: 'PART-HEATER-UNOX', fallbackId: 7, qty: 2 }, { code: 'PART-FILTER-WATER', fallbackId: 8, qty: 4 }] });

  // --- THÁNG 7/2026 ---
  await processSalesOrder({ orderCode: 'ORD-2026-0007', customerCode: 'CUS-2026-0007', quotationCode: 'BG-2026-0004', date: makeDate(7, 18), warehouseId: whSouth.id, warehouseCode: 'HCM', status: 'COMPLETED', payPercent: 100, items: [{ code: 'PART-PUMP-PROCON', fallbackId: 6, qty: 1 }, { code: 'PART-VALVE-3WAY', fallbackId: 5, qty: 4 }, { code: 'PART-FILTER-WATER', fallbackId: 8, qty: 4 }] });
  await processSalesOrder({ orderCode: 'ORD-2026-0008', customerCode: 'CUS-2026-0001', date: makeDate(7, 26), warehouseId: whNorth.id, warehouseCode: 'HN', status: 'COMPLETED', payPercent: 100, items: [{ code: 'PART-AIR-PUMP', fallbackId: 4, qty: 1 }, { code: 'PART-ORING-SILICONE', fallbackId: 2, qty: 5 }] });

  // --- THÁNG 8/2026 ---
  await processSalesOrder({ orderCode: 'ORD-2026-0009', customerCode: 'CUS-2026-0001', date: makeDate(8, 12), warehouseId: whNorth.id, warehouseCode: 'HN', status: 'COMPLETED', payPercent: 100, items: [{ code: 'PART-TEMP-PT100', fallbackId: 3, qty: 2 }, { code: 'PART-PUMP-PROCON', fallbackId: 6, qty: 1 }] });
  await processSalesOrder({ orderCode: 'ORD-2026-0010', customerCode: 'CUS-2026-0002', quotationCode: 'BG-2026-0005', date: makeDate(8, 18), warehouseId: whNorth.id, warehouseCode: 'HN', status: 'COMPLETED', payPercent: 100, items: [{ code: 'COMMSESPMIC____000001', fallbackId: 14, qty: 1 }, { code: 'COMMSWMICR00000000001', fallbackId: 15, qty: 1 }] });
  await processSalesOrder({ orderCode: 'ORD-2026-0011', customerCode: 'CUS-2026-0003', date: makeDate(8, 24), warehouseId: whSouth.id, warehouseCode: 'HCM', status: 'DELIVERED', payPercent: 50, isOverdue: true, items: [{ code: 'PART-TYL-BLADE', fallbackId: 1, qty: 2 }, { code: 'PART-ORING-SILICONE', fallbackId: 2, qty: 4 }, { code: 'PART-FILTER-WATER', fallbackId: 8, qty: 2 }] });

  // --- THÁNG 9/2026 (HIỆN TẠI) ---
  await processSalesOrder({ orderCode: 'ORD-2026-0012', customerCode: 'CUS-2026-0004', quotationCode: 'BG-2026-0006', date: makeDate(9, 8), warehouseId: whNorth.id, warehouseCode: 'HN', status: 'COMPLETED', payPercent: 100, items: [{ code: 'COMMSESPCOMF___000001', fallbackId: 40, qty: 1 }, { code: 'COMMSWCOMF00000000001', fallbackId: 39, qty: 1 }, { code: 'COMMRSMCOMFIT__00000', fallbackId: 41, qty: 2 }] });
  await processSalesOrder({ orderCode: 'ORD-2026-0013', customerCode: 'CUS-2026-0005', quotationCode: 'BG-2026-0007', date: makeDate(9, 15), warehouseId: whSouth.id, warehouseCode: 'HCM', status: 'DELIVERED', payPercent: 60, items: [{ code: 'PART-VALVE-3WAY', fallbackId: 5, qty: 2 }, { code: 'PART-ORING-SILICONE', fallbackId: 2, qty: 5 }, { code: 'PART-FILTER-WATER', fallbackId: 8, qty: 2 }] });
  await processSalesOrder({ orderCode: 'ORD-2026-0014', customerCode: 'CUS-2026-0002', quotationCode: 'BG-2026-0008', date: makeDate(9, 20), warehouseId: whNorth.id, warehouseCode: 'HN', status: 'DELIVERED', payPercent: 0, items: [{ code: 'COMMMO56TB405__000001', fallbackId: 10, qty: 1 }, { code: 'PART-TEMP-PT100', fallbackId: 3, qty: 1 }] });
  await processSalesOrder({ orderCode: 'ORD-2026-0015', customerCode: 'CUS-2026-0006', date: makeDate(9, 23), warehouseId: whSouth.id, warehouseCode: 'HCM', status: 'DELIVERED', payPercent: 0, items: [{ code: 'PART-HEATER-UNOX', fallbackId: 7, qty: 2 }, { code: 'PART-FILTER-WATER', fallbackId: 8, qty: 3 }] });
  await processSalesOrder({ orderCode: 'ORD-2026-0016', customerCode: 'CUS-2026-0001', date: makeDate(9, 26), warehouseId: whNorth.id, warehouseCode: 'HN', status: 'CONFIRMED', payPercent: 0, items: [{ code: 'PART-TYL-BLADE', fallbackId: 1, qty: 3 }, { code: 'PART-ORING-SILICONE', fallbackId: 2, qty: 10 }] });

  // ─── STEP 7: BIÊN BẢN KIỂM KÊ KHO ĐỊNH KỲ (KK) ───
  console.log('\n═══ [7/8] BIÊN BẢN KIỂM KÊ KHO ĐỊNH KỲ (KK-2026-xxxx) ═══');
  const countDates = [
    { code: 'KK-2026-0001', wh: whNorth, date: makeDate(4, 28) },
    { code: 'KK-2026-0002', wh: whSouth, date: makeDate(4, 29) },
    { code: 'KK-2026-0003', wh: whNorth, date: makeDate(5, 29) },
    { code: 'KK-2026-0004', wh: whSouth, date: makeDate(5, 30) },
    { code: 'KK-2026-0005', wh: whNorth, date: makeDate(6, 28) },
    { code: 'KK-2026-0006', wh: whSouth, date: makeDate(6, 29) },
    { code: 'KK-2026-0007', wh: whNorth, date: makeDate(7, 29) },
    { code: 'KK-2026-0008', wh: whSouth, date: makeDate(7, 30) },
    { code: 'KK-2026-0009', wh: whNorth, date: makeDate(8, 28) },
    { code: 'KK-2026-0010', wh: whSouth, date: makeDate(8, 29) },
  ];

  for (const c of countDates) {
    await prisma.stockCount.create({
      data: {
        countCode: c.code,
        warehouseId: c.wh.id,
        status: 'COMPLETED',
        countDate: c.date,
        note: `Biên bản kiểm kê định kỳ ${c.wh.name}`,
        createdById: adminUserId,
        submittedAt: c.date,
        completedAt: new Date(c.date.getTime() + 86400000),
        items: {
          create: [
            { itemId: getItem('PART-TYL-BLADE', 1).id, systemQty: 10, countedQty: 10 },
            { itemId: getItem('PART-ORING-SILICONE', 2).id, systemQty: 25, countedQty: 25 },
          ],
        },
      },
    });
  }
  console.log(`  ✓ Đã lập ${countDates.length} biên bản kiểm kê kho định kỳ từ Tháng 4 đến Tháng 8`);

  // ─── STEP 8: PHIẾU DỊCH VỤ & SỰ CỐ BẢO TRÌ (TICK) ───
  console.log('\n═══ [8/8] PHIẾU BẢO TRÌ & SỰ CỐ DỊCH VỤ (TICK-2026-xxxx) ═══');
  const serviceTicketsData = [
    { code: 'TICK-2026-0001', title: 'Bảo dưỡng định kỳ Quý 2: Thay bộ dao gạt & gioăng máy kem Taylor C708', custCode: 'CUS-2026-0001', eqCode: 'EQ-2026-0001', status: 'RESOLVED', date: makeDate(4, 16) },
    { code: 'TICK-2026-0002', title: 'Hiệu chuẩn cảm biến nhiệt PT100 & motor khuấy bồn socola Selmi Plus EX', custCode: 'CUS-2026-0002', eqCode: 'EQ-2026-0003', status: 'RESOLVED', date: makeDate(4, 25) },
    { code: 'TICK-2026-0003', title: 'Sự cố tụt áp họng pha La Marzocco: Thay van solenoid 3-way & bảo dưỡng bơm Procon', custCode: 'CUS-2026-0005', eqCode: 'EQ-2026-0006', status: 'RESOLVED', date: makeDate(5, 15) },
    { code: 'TICK-2026-0004', title: 'Bảo dưỡng hệ thống gia nhiệt lò nướng đối lưu Unox Cheftop', custCode: 'CUS-2026-0003', eqCode: 'EQ-2026-0008', status: 'RESOLVED', date: makeDate(5, 22) },
    { code: 'TICK-2026-0005', title: 'Thay bo mạch điều khiển công suất máy Comfit Selmi', custCode: 'CUS-2026-0004', eqCode: 'EQ-2026-0005', status: 'RESOLVED', date: makeDate(6, 18) },
    { code: 'TICK-2026-0006', title: 'Kiểm tra bảo dưỡng định kỳ hệ thống cấp nước & lọc tinh Everpure', custCode: 'CUS-2026-0006', eqCode: 'EQ-2026-0009', status: 'RESOLVED', date: makeDate(7, 20) },
    { code: 'TICK-2026-0007', title: 'Khẩn cấp (SLA 2h): Máy socola Selmi báo lỗi cảm biến E02', custCode: 'CUS-2026-0002', eqCode: 'EQ-2026-0003', status: 'RESOLVED', date: makeDate(8, 14) },
    { code: 'TICK-2026-0008', title: 'Bảo dưỡng định kỳ Quý 3/2026: Tẩy cặn lò hơi & thay gioăng họng pha', custCode: 'CUS-2026-0004', eqCode: 'EQ-2026-0005', status: 'RESOLVED', date: makeDate(9, 10) },
    { code: 'TICK-2026-0009', title: 'Khảo sát thay thế thanh điện trở vòng nhiệt lò nướng Unox', custCode: 'CUS-2026-0003', eqCode: 'EQ-2026-0008', status: 'IN_PROGRESS', date: makeDate(9, 22) },
  ];

  for (const t of serviceTicketsData) {
    const cust = custMap.get(t.custCode);
    const eq = await prisma.fnbEquipment.findUnique({ where: { machineCode: t.eqCode } });
    await prisma.serviceTicket.create({
      data: {
        ticketCode: t.code,
        title: t.title,
        customerId: cust.id,
        equipmentId: eq ? eq.id : 1,
        status: t.status,
        priority: 'HIGH',
        createdAt: t.date,
        updatedAt: t.date,
      },
    });
  }
  console.log(`  ✓ Đã lập ${serviceTicketsData.length} phiếu dịch vụ & bảo trì liên kết trực tiếp thiết bị`);

  // ─── TỔNG KẾT DỮ LIỆU 6 THÁNG ───
  const [totalPOs, totalNK, totalQuotes, totalOrders, totalXK, totalPayments, totalSuppPayments, totalCounts, totalTickets] = await Promise.all([
    prisma.sparePartOrder.count(),
    prisma.inventoryTransaction.count({ where: { type: 'IN' } }),
    prisma.customerQuotation.count(),
    prisma.customerOrder.count(),
    prisma.inventoryTransaction.count({ where: { type: 'OUT' } }),
    prisma.customerPayment.count(),
    prisma.supplierPayment.count(),
    prisma.stockCount.count(),
    prisma.serviceTicket.count(),
  ]);

  const salesStats = await prisma.customerOrder.aggregate({
    _sum: { totalAmount: true, paidAmount: true, goodsAmount: true, vatAmount: true },
  });

  console.log('\n╔══════════════════════════════════════════════════════════════════════╗');
  console.log('║  ✅ HOÀN TẤT SEED DỮ LIỆU DOANH NGHIỆP 6 THÁNG (T4 -> T9/2026)      ║');
  console.log('╚══════════════════════════════════════════════════════════════════════╝');
  console.log(`  • Đơn mua NCC (PO):       ${totalPOs} đơn (PO-2026-0001 -> PO-2026-0011)`);
  console.log(`  • Phiếu nhập kho (NK):    ${totalNK} phiếu (NK-2026-0001 -> NK-2026-0011)`);
  console.log(`  • Báo giá khách hàng:     ${totalQuotes} báo giá (BG-2026-0001 -> BG-2026-0010)`);
  console.log(`  • Đơn bán hàng (ORD):     ${totalOrders} đơn hàng (ORD-2026-0001 -> ORD-2026-0016)`);
  console.log(`  • Phiếu xuất kho (XK):    ${totalXK} phiếu (XK-2026-0001 -> XK-2026-0015)`);
  console.log(`  • Thu tiền khách (PT):    ${totalPayments} phiếu thu (PT-2026-0001 -> PT-2026-0013)`);
  console.log(`  • Trả tiền NCC (CTT):     ${totalSuppPayments} phiếu chi (CTT-2026-0001 -> CTT-2026-0010)`);
  console.log(`  • Kiểm kê kho (KK):       ${totalCounts} đợt kiểm kê định kỳ (KK-2026-0001 -> KK-2026-0010)`);
  console.log(`  • Phiếu sự cố (TICK):     ${totalTickets} phiếu bảo dưỡng (TICK-2026-0001 -> TICK-2026-0009)`);
  console.log(`  • Tổng doanh thu 6 tháng: ${Number(salesStats._sum.totalAmount || 0).toLocaleString()} ₫ (VAT 8%: ${Number(salesStats._sum.vatAmount || 0).toLocaleString()} ₫)`);
  console.log(`  • Đã thu thực tế:         ${Number(salesStats._sum.paidAmount || 0).toLocaleString()} ₫`);
  console.log(`  • Công nợ còn lại:        ${(Number(salesStats._sum.totalAmount || 0) - Number(salesStats._sum.paidAmount || 0)).toLocaleString()} ₫`);
  console.log('  • Định dạng mã: 100% mã chuẩn doanh nghiệp, tuyệt đối không có DEMO-.');
  console.log('  • Phí khác mặc định 0đ. Giá bán chuẩn Margin 35% từ giá vốn.');
}

async function main() {
  try {
    await runFullFlowSeed();
  } catch (error) {
    console.error('❌ Lỗi khi thực hiện seed dữ liệu demo:', error);
    process.exitCode = 1;
  } finally {
    await prisma.$disconnect();
  }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
