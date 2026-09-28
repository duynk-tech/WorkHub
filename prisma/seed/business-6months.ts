import type { PrismaClient } from '@prisma/client';
import {
  calculateLandedCostAllocation,
  estimateImportFreight,
  SparePartPricingConfigSchema,
} from '../../src/server/modules/spare-parts/types';

/**
 * Seed dữ liệu kinh doanh liên tục 6 tháng (Tháng 4 – Tháng 9/2026).
 *
 * Mỗi tháng tạo:
 * - 3-4 đơn bán hàng khách hàng (CustomerOrder + Items + Payment)
 * - 1-2 đơn nhập hàng nhà cung cấp (SparePartOrder + Items + SupplierPayment)
 * - Chứng từ xuất/nhập kho (InventoryTransaction)
 *
 * Margin bán hàng: ~35% (giá bán ≈ giá vốn × 1.54)
 * Cước và phí nhập kho lấy theo cấu hình phụ tùng, phân bổ theo số lượng.
 * VAT: 8%
 */
export async function seedBusiness6Months(prisma: PrismaClient, technicianId?: number) {
  console.log('--- Bắt đầu nạp dữ liệu kinh doanh 6 tháng (04/2026 – 09/2026) ---');

  // Lookup existing customers
  const customers = await prisma.customer.findMany({
    include: { locations: true },
  });
  if (customers.length === 0) {
    console.log('⚠ Chưa có khách hàng nào, bỏ qua seed business 6 tháng.');
    return 0;
  }

  const custMap = new Map(customers.map((c) => [c.code, c]));
  // Preferred customer codes from fnb-equipment seed
  const custCodes = ['CUST-GG', 'CUST-MAROU', 'CUST-PL', 'CUST-HOSHIZAKI'];
  const availCusts = custCodes.filter((c) => custMap.has(c)).map((c) => custMap.get(c)!);
  if (availCusts.length === 0) {
    // Fallback to any customers
    availCusts.push(...customers.slice(0, 4));
  }

  // Lookup warehouses
  const warehouses = await prisma.warehouse.findMany();
  const whHn = warehouses.find((w) => w.code === 'WH-HN') || warehouses.find((w) => w.code === 'WH-HN-CENTRAL') || warehouses[0];
  const whHcm = warehouses.find((w) => w.code === 'WH-HCM') || warehouses.find((w) => w.code === 'WH-HCM-BRANCH') || warehouses[1] || whHn;

  if (!whHn) {
    console.log('⚠ Chưa có kho hàng nào, bỏ qua seed business 6 tháng.');
    return 0;
  }

  // Lookup inventory items for order line items
  const invItems = await prisma.inventoryItem.findMany();
  const findInventoryItem = (name: string) =>
    invItems.find((item) => item.name?.toLowerCase().includes(name.slice(0, 20).toLowerCase())) || null;
  if (invItems.length === 0) {
    console.log('⚠ Chưa có mặt hàng kho nào, bỏ qua seed business 6 tháng.');
    return 0;
  }
  const pricingSetting = await prisma.systemSetting.findUnique({ where: { key: 'spare_parts_pricing_config' } });
  const parsedPricingConfig = SparePartPricingConfigSchema.safeParse(pricingSetting?.valueJson ?? {});
  const pricingConfig = parsedPricingConfig.success ? parsedPricingConfig.data : SparePartPricingConfigSchema.parse({});
  const stockRows = await prisma.inventoryStock.groupBy({
    by: ['itemId'],
    where: { itemId: { in: invItems.map((item) => item.id) } },
    _sum: { quantity: true },
  });
  const stockQtyByItem = new Map(stockRows.map((row) => [row.itemId, row._sum.quantity || 0]));
  const warehouseStockRows = await prisma.inventoryStock.findMany({
    where: { itemId: { in: invItems.map((item) => item.id) } },
    select: { warehouseId: true, itemId: true, quantity: true },
  });
  const warehouseStockKey = (warehouseId: number, itemId: number) => `${warehouseId}:${itemId}`;
  const warehouseQtyByItem = new Map(
    warehouseStockRows.map((row) => [warehouseStockKey(row.warehouseId, row.itemId), row.quantity]),
  );
  const costState = new Map(invItems.map((item) => [item.id, {
    quantity: stockQtyByItem.get(item.id) || 0,
    base: Number(item.avgBaseCost ?? item.costPrice ?? 0),
    shipping: Number(item.avgShippingCost ?? 0),
    other: Number(item.avgOtherCost ?? 0),
  }]));

  const creatorId = technicianId || 1;
  let orderCount = 0;

  // 6 months: April (3) -> September (8) of 2026
  const months = [
    { month: 3, label: 'Tháng 4/2026', ordersPerMonth: 3, posPerMonth: 1 },
    { month: 4, label: 'Tháng 5/2026', ordersPerMonth: 4, posPerMonth: 2 },
    { month: 5, label: 'Tháng 6/2026', ordersPerMonth: 3, posPerMonth: 1 },
    { month: 6, label: 'Tháng 7/2026', ordersPerMonth: 4, posPerMonth: 2 },
    { month: 7, label: 'Tháng 8/2026', ordersPerMonth: 4, posPerMonth: 2 },
    { month: 8, label: 'Tháng 9/2026', ordersPerMonth: 3, posPerMonth: 1 },
  ];

  // Product catalog for realistic orders – margin ~35%
  const products = [
    { name: 'Bộ gioăng phớt cối kem Donper 3 vòi (Silicone thực phẩm)', cost: 280000, sell: 430000, type: 'SPARE_PART' },
    { name: 'Lưỡi cạo kem POM chống mài mòn (Beater Scraper)', cost: 150000, sell: 230000, type: 'SPARE_PART' },
    { name: 'Cảm biến nhiệt độ cối kem NTC 10K bọc Inox 304', cost: 320000, sell: 490000, type: 'SPARE_PART' },
    { name: 'Bộ lưỡi dao gạt lòng xi lanh máy kem Taylor (4 chiếc)', cost: 2800000, sell: 4300000, type: 'SPARE_PART' },
    { name: 'Bộ gioăng O-Ring silicone chịu nhiệt máy làm kem tươi', cost: 450000, sell: 690000, type: 'CONSUMABLE' },
    { name: 'Cụm bơm tăng xốp nguyên liệu (Air Pump Assembly)', cost: 6500000, sell: 9980000, type: 'SPARE_PART' },
    { name: 'Van điện từ Solenoid 3-way ODE Italy 230V máy cafe', cost: 1350000, sell: 2070000, type: 'SPARE_PART' },
    { name: 'Bơm áp lực nước Procon 230V 100L/h họng pha cafe', cost: 3200000, sell: 4910000, type: 'SPARE_PART' },
    { name: 'Thanh điện trở vòng nhiệt lò nướng đối lưu Unox 3300W', cost: 2450000, sell: 3760000, type: 'SPARE_PART' },
    { name: 'Lõi lọc chuyên dụng Pentair Everpure 4CB5 máy cafe', cost: 1400000, sell: 2150000, type: 'CONSUMABLE' },
    { name: 'Dầu bôi trơn cối kem Haynes Lubri-Film Plus (113g)', cost: 160000, sell: 245000, type: 'CONSUMABLE' },
    { name: 'Dây curoa răng cưa truyền động motor B-850', cost: 180000, sell: 275000, type: 'SPARE_PART' },
    { name: 'Cảm biến nhiệt độ PT100 bồn socola Selmi', cost: 1950000, sell: 2990000, type: 'SPARE_PART' },
    { name: 'Dịch vụ bảo trì định kỳ máy pha espresso (Gói 3 tháng)', cost: 3500000, sell: 5380000, type: 'SERVICE' },
    { name: 'Dịch vụ sửa chữa cứu hộ máy làm kem tại quán (Khẩn cấp 2h)', cost: 2000000, sell: 3070000, type: 'SERVICE' },
    { name: 'Gói đào tạo vận hành máy pha & máy xay cao cấp', cost: 4000000, sell: 6140000, type: 'SERVICE' },
  ];
  const stockedProducts = products.filter((product) => product.type !== 'SERVICE' && findInventoryItem(product.name));
  if (stockedProducts.length === 0) {
    console.log('⚠ Không có mặt hàng demo nào khớp danh mục kho, bỏ qua seed business 6 tháng.');
    return 0;
  }

  // PO suppliers
  const suppliers = [
    { name: 'Taylor Company (USA)', currency: 'USD', rate: 25400 },
    { name: 'Selmi Group Italy', currency: 'EUR', rate: 27800 },
    { name: 'Donper Commercial (China)', currency: 'USD', rate: 25400 },
    { name: 'Unox S.p.A. (Italy)', currency: 'EUR', rate: 27800 },
    { name: 'Hoshizaki Japan', currency: 'USD', rate: 25400 },
  ];

  // Order types
  const orderTypes = ['SPARE_PART', 'SERVICE', 'MACHINE_PURCHASE', 'RENTAL'];

  // Statuses for completed orders
  const completedStatuses = ['COMPLETED', 'DELIVERED'];

  let globalOrderSeq = 3; // Start after ORD-2026-0001, 0002 from fnb-equipment
  let globalPoSeq = 3;    // Start after PO-2026-0001, 0002 from fnb-equipment
  let globalPaySeq = 3;   // Start after TT-2026-0001, 0002
  let globalTransSeq = 3; // Start after XK-2026-0001, NK-2026-0001

  for (const m of months) {
    const { month, label, ordersPerMonth, posPerMonth } = m;

    // --- SALES ORDERS ---
    for (let i = 0; i < ordersPerMonth; i++) {
      const cust = availCusts[i % availCusts.length];
      const orderCode = `ORD-2026-${String(globalOrderSeq).padStart(4, '0')}`;
      globalOrderSeq++;

      // Skip if exists
      const existing = await prisma.customerOrder.findUnique({ where: { orderCode } });
      if (existing) { orderCount++; continue; }

      // Pick 2-4 products for the order
      const numProducts = 2 + (i % 3); // 2, 3, or 4 items
      const startIdx = ((month - 3) * 4 + i * 3) % products.length;
      const saleWarehouseId = (month < 6 ? whHn : whHcm).id;
      const orderProducts = [];
      const reservedQtyByItem = new Map<number, number>();
      for (let j = 0; j < numProducts; j++) {
        const prod = products[(startIdx + j) % products.length];
        const requestedQty = 1 + ((month + i + j) % 5); // 1-5 units
        const item = prod.type === 'SERVICE' ? null : findInventoryItem(prod.name);
        if (prod.type !== 'SERVICE' && !item) continue;
        const stockKey = item ? warehouseStockKey(saleWarehouseId, item.id) : '';
        const alreadyReserved = item ? reservedQtyByItem.get(item.id) || 0 : 0;
        const availableQty = item ? (warehouseQtyByItem.get(stockKey) || 0) - alreadyReserved : requestedQty;
        const qty = item ? Math.min(requestedQty, Math.max(0, availableQty)) : requestedQty;
        if (qty <= 0) continue;
        if (item) reservedQtyByItem.set(item.id, alreadyReserved + qty);
        // Có dòng không CK, có dòng CK 2–5% để báo cáo kiểm tra được phép
        // cộng doanh thu/chiết khấu theo lịch sử từng đơn, không lấy giá hiện tại.
        const discountPercent = (month + i + j) % 5 === 0
          ? 5
          : (month + i + j) % 3 === 0 ? 2 : 0;
        orderProducts.push({ ...prod, qty, discountPercent });
      }

      if (orderProducts.length === 0) {
        console.log(`⚠ Bỏ qua ${orderCode}: kho chưa có hàng để bán.`);
        continue;
      }

      const grossGoodsAmount = orderProducts.reduce((sum, p) => sum + p.sell * p.qty, 0);
      const discountAmount = orderProducts.reduce(
        (sum, p) => sum + Math.round(p.sell * p.qty * p.discountPercent / 100),
        0,
      );
      const goodsAmount = grossGoodsAmount - discountAmount;
      const vatRate = 8;
      const vatAmount = Math.round(goodsAmount * vatRate / 100);
      const totalAmount = goodsAmount + vatAmount;

      // Order date: random day in the month
      const day = 3 + (i * 7) + ((month * 3 + i) % 5);
      const orderDate = new Date(Date.UTC(2026, month, Math.min(day, 28)));
      const deliveryDate = new Date(orderDate.getTime() + (3 + i) * 86400000);

      // Determine payment status
      const isPaid = i < ordersPerMonth - 1; // Last order of month may be partial
      const paidAmount = isPaid ? totalAmount : Math.round(totalAmount * 0.5);
      const status = isPaid ? 'COMPLETED' : 'DELIVERED';
      const locId = cust.locations[0]?.id || null;

      const order = await prisma.customerOrder.create({
        data: {
          orderCode,
          customerId: cust.id,
          locationId: locId,
          orderType: orderProducts.some((p) => p.type === 'SERVICE') ? 'SERVICE' : 'SPARE_PART',
          status,
          goodsAmount,
          shippingFee: 0,
          vatRate,
          vatAmount,
          totalAmount,
          paidAmount,
          orderDate,
          deliveryDate,
          stockIssuedAt: deliveryDate,
          dueDate: isPaid ? undefined : new Date(orderDate.getTime() + 30 * 86400000),
          invoiceNo: isPaid ? String(1000 + globalOrderSeq) : undefined,
          invoiceSerial: isPaid ? '1C26TAA' : undefined,
          invoiceDate: isPaid ? deliveryDate : undefined,
          notes: `Đơn hàng ${label} - ${cust.name}`,
        },
      });

      // Create order items
      const orderLines = orderProducts.map((p) => ({
        product: p,
        item: p.type === 'SERVICE' ? null : findInventoryItem(p.name),
      }));
      await prisma.customerOrderItem.createMany({
        data: orderLines.map(({ product: p, item }) => ({
          orderId: order.id,
          itemType: p.type,
          name: p.name,
          quantity: p.qty,
          unitPrice: p.sell,
          totalPrice: p.sell * p.qty - Math.round(p.sell * p.qty * p.discountPercent / 100),
          discountAmount: Math.round(p.sell * p.qty * p.discountPercent / 100),
          inventoryItemId: item?.id || null,
        })),
      });

      // Create payment
      const payCode = `TT-2026-${String(globalPaySeq).padStart(4, '0')}`;
      globalPaySeq++;
      await prisma.customerPayment.upsert({
        where: { paymentCode: payCode },
        update: {},
        create: {
          paymentCode: payCode,
          customerId: cust.id,
          orderId: order.id,
          amount: paidAmount,
          method: i % 2 === 0 ? 'TRANSFER' : 'CASH',
          paidAt: new Date(deliveryDate.getTime() + 2 * 86400000),
          reference: i % 2 === 0 ? `UNC-${['VCB', 'TCB', 'ACB', 'MBB'][month % 4]}-${100000 + globalPaySeq}` : undefined,
          note: `Thu tiền ${orderCode} từ ${cust.name}`,
        },
      });

      // Inventory transaction - export goods
      const transOutCode = `XK-2026-${String(globalTransSeq).padStart(4, '0')}`;
      globalTransSeq++;
      const existTrans = await prisma.inventoryTransaction.findUnique({ where: { transCode: transOutCode } });
      if (!existTrans) {
        const issueCostLines = orderLines.flatMap(({ product, item }) => {
          if (!item) return [];
          const current = costState.get(item.id)!;
          return [{ product, item, base: current.base, shipping: current.shipping, other: current.other }];
        });
        await prisma.inventoryTransaction.create({
          data: {
            transCode: transOutCode,
            type: 'OUT',
            sourceWarehouseId: saleWarehouseId,
            reasonCode: 'SALE',
            partnerName: cust.name,
            customerOrderId: order.id,
            totalValue: issueCostLines.reduce(
              (sum, line) => sum + (line.base + line.shipping + line.other) * line.product.qty,
              0,
            ),
            status: 'COMPLETED',
            transDate: deliveryDate,
            note: `Xuất kho phục vụ đơn hàng ${orderCode}`,
            createdById: creatorId,
            items: {
              create: issueCostLines.map(({ product, item, base, shipping, other }) => ({
                  itemId: item.id,
                  quantity: product.qty,
                  unitPrice: product.sell,
                  unitCost: base + shipping + other,
                  baseUnitCost: base,
                  shippingUnitCost: shipping,
                  otherUnitCost: other,
                })),
            },
          },
        });
        for (const line of issueCostLines) {
          const stockKey = warehouseStockKey(saleWarehouseId, line.item.id);
          await prisma.inventoryStock.updateMany({
            where: { warehouseId: saleWarehouseId, itemId: line.item.id, quantity: { gte: line.product.qty } },
            data: { quantity: { decrement: line.product.qty } },
          });
          warehouseQtyByItem.set(stockKey, Math.max(0, (warehouseQtyByItem.get(stockKey) || 0) - line.product.qty));
          const current = costState.get(line.item.id)!;
          current.quantity = Math.max(0, current.quantity - line.product.qty);
        }
      }

      orderCount++;
    }

    // --- PURCHASE ORDERS (PO) ---
    for (let p = 0; p < posPerMonth; p++) {
      const poCode = `PO-2026-${String(globalPoSeq).padStart(4, '0')}`;
      globalPoSeq++;

      const existPo = await prisma.sparePartOrder.findUnique({ where: { orderCode: poCode } });
      if (existPo) continue;

      const supplier = suppliers[(month + p) % suppliers.length];
      const poDay = 5 + p * 12 + (month % 3);
      const poDate = new Date(Date.UTC(2026, month, Math.min(poDay, 28)));

      // Pick 2-3 items for PO
      const numPoItems = 2 + (p % 2);
      const poProducts = [];
      for (let j = 0; j < numPoItems; j++) {
        const prod = stockedProducts[((month - 3) * 3 + p * 2 + j) % stockedProducts.length];
        const qty = 5 + ((month + p + j) % 10);
        poProducts.push({ ...prod, qty });
      }

      const poLines = poProducts.flatMap((product) => {
        const item = findInventoryItem(product.name);
        return item ? [{ product, item }] : [];
      });
      const subtotalVnd = poLines.reduce((sum, { product }) => sum + product.cost * product.qty, 0);
      const shippingFee = estimateImportFreight(poLines.length, pricingConfig);
      const customsFee = 0;
      const landedCostMetrics = calculateLandedCostAllocation(
        poLines.map(({ product, item }) => ({
          itemId: item.id,
          quantity: product.qty,
          unitPrice: product.cost,
          baseUnitPrice: product.cost,
        })),
        shippingFee,
        customsFee,
        'QUANTITY',
      );
      const landedCostByItem = new Map(landedCostMetrics.items.map((line) => [line.itemId, line]));
      const totalVnd = subtotalVnd + shippingFee + customsFee;

      const isCompleted = month < 8; // Sep orders may be in transit
      const poStatus = isCompleted ? 'STOCKED' : (p === 0 ? 'SHIPPING_INTL' : 'ORDERED_SUPPLIER');

      const po = await prisma.sparePartOrder.create({
        data: {
          orderCode: poCode,
          supplier: supplier.name,
          status: poStatus,
          currency: supplier.currency,
          exchangeRate: supplier.rate,
          shippingFee,
          customsFee,
          // Cước đã được phân bổ vào snapshot phiếu nhập; không cộng phụ phí %
          // không phát sinh thực tế vì sẽ làm PO và giá vốn nhập kho lệch nhau.
          extraShippingRate: 0,
          discountRate: 0,
          discountVnd: 0,
          totalItemsQty: poLines.reduce((s, { product }) => s + product.qty, 0),
          subtotalVnd,
          totalVnd,
          paidAmount: isCompleted ? totalVnd : Math.round(totalVnd * 0.5),
          trackingNumber: isCompleted ? `${supplier.currency === 'USD' ? 'DHL' : 'FEDEX'}-${200000 + globalPoSeq}` : undefined,
          etaDate: isCompleted ? poDate : new Date(poDate.getTime() + 20 * 86400000),
          arrivedDate: isCompleted ? new Date(poDate.getTime() + 15 * 86400000) : undefined,
          targetWarehouseId: (month % 2 === 0 ? whHn : whHcm).id,
          notes: `Nhập khẩu lô linh kiện ${label} từ ${supplier.name}`,
          createdById: creatorId,
        },
      });

      // PO items
      if (poLines.some((line) => line.item)) {
        await prisma.sparePartOrderItem.createMany({
          data: poLines.flatMap(({ product: pp, item }) => item ? [{
            orderId: po.id,
            itemId: item.id,
            quantity: pp.qty,
            unitPriceEur: supplier.currency === 'EUR' ? Math.round(pp.cost / supplier.rate * 100) / 100 : undefined,
            unitPriceVnd: pp.cost,
            discountVnd: 0,
            finalPriceVnd: pp.cost * pp.qty,
          }] : []),
          skipDuplicates: true,
        });
      }

      // Supplier payment
      if (isCompleted) {
        const spPayCode = `SP-PAY-2026-${String(globalPoSeq).padStart(4, '0')}`;
        const existSpPay = await prisma.supplierPayment.findFirst({ where: { paymentCode: spPayCode } });
        if (!existSpPay) {
          await prisma.supplierPayment.create({
            data: {
              paymentCode: spPayCode,
              supplier: supplier.name,
              orderId: po.id,
              amount: totalVnd,
              method: 'TRANSFER',
              paidAt: new Date(poDate.getTime() + 5 * 86400000),
              reference: `TT-NCC-${supplier.currency}-${200000 + globalPoSeq}`,
              note: `Thanh toán đơn hàng ${poCode} cho ${supplier.name}`,
            },
          });
        }
      }

      // Inventory IN transaction for completed POs
      if (isCompleted) {
        const transInCode = `NK-2026-${String(globalTransSeq).padStart(4, '0')}`;
        globalTransSeq++;
        const existTransIn = await prisma.inventoryTransaction.findUnique({ where: { transCode: transInCode } });
        if (!existTransIn) {
          await prisma.inventoryTransaction.create({
            data: {
              transCode: transInCode,
              type: 'IN',
              targetWarehouseId: (month % 2 === 0 ? whHn : whHcm).id,
              reasonCode: 'PO_IMPORT',
              partnerName: supplier.name,
              totalValue: landedCostMetrics.items.reduce(
                (sum, line) => sum + line.quantity * (line.baseUnitPrice + line.allocatedShipping + line.allocatedOtherFee),
                0,
              ),
              status: 'COMPLETED',
              transDate: new Date(poDate.getTime() + 15 * 86400000),
              note: `Nhập kho lô hàng từ ${supplier.name} (${poCode})`,
              createdById: creatorId,
              items: {
                create: poLines.map(({ product, item }) => {
                  const costs = landedCostByItem.get(item.id)!;
                  return {
                    itemId: item.id,
                    quantity: product.qty,
                    unitPrice: costs.landedCost,
                    unitCost: costs.landedCost,
                    baseUnitCost: costs.baseUnitPrice,
                    shippingUnitCost: costs.allocatedShipping,
                    otherUnitCost: costs.allocatedOtherFee,
                  };
                }),
              },
            },
          });
          const receiptWarehouseId = (month % 2 === 0 ? whHn : whHcm).id;
          for (const { product, item } of poLines) {
            const incoming = landedCostByItem.get(item.id)!;
            const stockKey = warehouseStockKey(receiptWarehouseId, item.id);
            await prisma.inventoryStock.upsert({
              where: { warehouseId_itemId: { warehouseId: receiptWarehouseId, itemId: item.id } },
              update: { quantity: { increment: incoming.quantity } },
              create: { warehouseId: receiptWarehouseId, itemId: item.id, quantity: incoming.quantity },
            });
            warehouseQtyByItem.set(stockKey, (warehouseQtyByItem.get(stockKey) || 0) + incoming.quantity);
            const current = costState.get(item.id)!;
            const previousQty = Math.max(0, current.quantity);
            const totalQty = previousQty + incoming.quantity;
            if (totalQty > 0) {
              current.base = (previousQty * current.base + incoming.quantity * incoming.baseUnitPrice) / totalQty;
              current.shipping = (previousQty * current.shipping + incoming.quantity * incoming.allocatedShipping) / totalQty;
              current.other = (previousQty * current.other + incoming.quantity * incoming.allocatedOtherFee) / totalQty;
              current.quantity = totalQty;
            }
          }
        }
      }
    }

    console.log(`→ ${label}: ${ordersPerMonth} đơn bán, ${posPerMonth} đơn nhập`);
  }

  console.log(`✅ Nạp dữ liệu kinh doanh 6 tháng hoàn tất: ${orderCount} đơn bán hàng`);
  return orderCount;
}
