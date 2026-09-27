/**
 * Script: Reset dữ liệu đơn bán + tính lại giá bán theo margin 35% + cước
 *
 * 1. Xóa toàn bộ CustomerOrder cũ (và items, payments cascade)
 * 2. Cập nhật defaultMarginPercent = 35 trong pricing config
 * 3. Tính lại sellingPrice & autoPrice cho tất cả InventoryItem theo:
 *    Giá bán = Giá vốn / (1 - 0.35) + Cước vận chuyển
 * 4. Tạo lại 1 đơn bán mẫu đúng công thức
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

// Cấu hình margin 35%
const MARGIN_PERCENT = 35;
const SHIPPING_FEE_PER_UNIT = 3_500_000; // Cước VC mặc định mỗi mặt hàng
const EXCHANGE_RATE = 32_500;
const EXTRA_SHIPPING_RATE = 0.25;
const CUSTOMS_FEE = 1_000_000;

function calcSellingPrice(costPrice: number): number {
  if (costPrice <= 0) return 0;
  // Giá bán = Giá vốn / (1 - 0.35) + Cước
  return Math.round(costPrice / (1 - MARGIN_PERCENT / 100)) + SHIPPING_FEE_PER_UNIT;
}

async function main() {
  console.log('=== BẮT ĐẦU RESET DỮ LIỆU ===\n');

  // 1. Xóa đơn bán cũ
  const existingOrders = await prisma.customerOrder.findMany({ select: { id: true, orderCode: true } });
  console.log(`[1] Xóa ${existingOrders.length} đơn bán cũ...`);
  for (const order of existingOrders) {
    await prisma.customerOrder.delete({ where: { id: order.id } }).catch(() => {});
    console.log(`  - Đã xóa ${order.orderCode}`);
  }

  // 2. Cập nhật pricing config → margin 35%
  console.log(`\n[2] Cập nhật margin mặc định → ${MARGIN_PERCENT}%`);
  const configKey = 'spare_parts_pricing_config';
  const existing = await prisma.systemSetting.findFirst({ where: { key: configKey } }).catch(() => null);
  const newConfig = {
    defaultExchangeRateEur: EXCHANGE_RATE,
    defaultExchangeRateUsd: 25500,
    defaultMarginPercent: MARGIN_PERCENT,
    pricingMethod: 'MARGIN',
    defaultShippingFee: SHIPPING_FEE_PER_UNIT,
    defaultCustomsFee: CUSTOMS_FEE,
    defaultExtraShippingRate: EXTRA_SHIPPING_RATE,
    defaultVatRate: 8,
    volumeDiscountTiers: [
      { min: 1, max: 4, rate: 0 },
      { min: 5, max: 9, rate: 0.05 },
      { min: 10, max: 19, rate: 0.10 },
      { min: 20, max: 99999, rate: 0.15 },
    ],
    defaultValidDays: 15,
    defaultDeliveryTime: '15 - 25 ngày làm việc (vận chuyển hàng không quốc tế)',
    defaultPaymentTerms: 'Tạm ứng 50% khi xác nhận đơn hàng, 50% còn lại trước khi bàn giao linh kiện',
    defaultWarrantyTerms: 'Bảo hành chính hãng 06 tháng đối với linh kiện cơ điện tử; hỗ trợ kỹ thuật lắp đặt tận nơi.',
    defaultQuotationNotes: 'Linh kiện chính hãng nhập khẩu nguyên chiếc từ nhà sản xuất.',
  };
  if (existing) {
    await prisma.systemSetting.update({ where: { key: configKey }, data: { valueJson: newConfig } });
  } else {
    await prisma.systemSetting.create({
      data: { key: configKey, valueJson: newConfig, groupName: 'spare_parts' },
    });
  }
  console.log(`  ✓ defaultMarginPercent = ${MARGIN_PERCENT}%`);

  // 3. Tính lại giá bán cho TẤT CẢ inventory items
  console.log('\n[3] Tính lại giá bán cho tất cả mặt hàng...');
  const items = await prisma.inventoryItem.findMany({
    select: { id: true, itemCode: true, name: true, costPrice: true, avgCost: true, priceEur: true },
  });

  for (const item of items) {
    // Giá vốn: ưu tiên avgCost > costPrice > EUR × tỷ giá
    const cost =
      Number(item.avgCost || 0) > 0
        ? Number(item.avgCost)
        : Number(item.costPrice || 0) > 0
          ? Number(item.costPrice)
          : Number(item.priceEur || 0) > 0
            ? Math.round(Number(item.priceEur) * EXCHANGE_RATE)
            : 0;

    if (cost <= 0) continue;

    const newSellingPrice = calcSellingPrice(cost);
    const autoPrice = newSellingPrice; // Lưu trùng sellingPrice

    await prisma.inventoryItem.update({
      where: { id: item.id },
      data: {
        sellingPrice: newSellingPrice,
        autoPrice: autoPrice,
        autoPriceAt: new Date(),
        autoPriceBasis: cost,
      },
    });

    console.log(
      `  ${item.itemCode} | Vốn: ${cost.toLocaleString()} → Bán: ${newSellingPrice.toLocaleString()} (margin ${MARGIN_PERCENT}% + cước ${SHIPPING_FEE_PER_UNIT.toLocaleString()})`
    );
  }

  // 4. Tạo lại 1 đơn bán mẫu đúng công thức
  console.log('\n[4] Tạo đơn bán mẫu mới...');

  // Lấy khách hàng đầu tiên
  const customer = await prisma.customer.findFirst({ select: { id: true, name: true } });
  if (!customer) {
    console.log('  ⚠ Không có khách hàng nào, bỏ qua tạo đơn mẫu');
  } else {
    // Lấy mặt hàng PART-TEMP-PT100 (đã có phát sinh nhập kho)
    const pt100 = await prisma.inventoryItem.findFirst({
      where: { itemCode: 'PART-TEMP-PT100' },
      select: { id: true, itemCode: true, name: true, sellingPrice: true, avgCost: true, costPrice: true },
    });

    if (pt100) {
      const qty = 1;
      const unitPrice = Number(pt100.sellingPrice || 0);
      const goodsAmount = unitPrice * qty;
      const vatRate = 8;
      const vatAmount = Math.round(goodsAmount * vatRate / 100);
      const totalAmount = goodsAmount + vatAmount;

      // Tìm user admin để dùng làm createdById cho các bản ghi liên quan
      const admin = await prisma.user.findFirst({ select: { id: true } });

      const order = await prisma.customerOrder.create({
        data: {
          orderCode: 'ORD-2026-0001',
          customerId: customer.id,
          orderType: 'SPARE_PART',
          status: 'COMPLETED',
          goodsAmount,
          vatRate,
          vatAmount,
          totalAmount,
          paidAmount: totalAmount,
          orderDate: new Date(),
          items: {
            create: [{
              name: `[${pt100.itemCode}] ${pt100.name}`,
              itemType: 'SPARE_PART',
              quantity: qty,
              unitPrice: unitPrice,
              totalPrice: unitPrice * qty,
              inventoryItemId: pt100.id,
            }],
          },
        },
        include: { items: true },
      });

      const cost = Number(pt100.avgCost || pt100.costPrice || 0);
      const profit = unitPrice - cost;
      const margin = unitPrice > 0 ? Math.round(profit / unitPrice * 100) : 0;

      console.log(`  ✓ Tạo ${order.orderCode} cho ${customer.name}`);
      console.log(`    Mặt hàng: ${pt100.itemCode} - ${pt100.name}`);
      console.log(`    Giá vốn: ${cost.toLocaleString()} → Giá bán: ${unitPrice.toLocaleString()} → Lời: ${profit.toLocaleString()} (${margin}%)`);
      console.log(`    Tổng đơn: ${goodsAmount.toLocaleString()} + VAT ${vatAmount.toLocaleString()} = ${totalAmount.toLocaleString()}`);
    }
  }

  console.log('\n=== HOÀN TẤT ===');
  console.log(`Margin: ${MARGIN_PERCENT}%`);
  console.log(`Công thức: Giá bán = Giá vốn ÷ ${(1 - MARGIN_PERCENT / 100).toFixed(2)} + Cước ${SHIPPING_FEE_PER_UNIT.toLocaleString()}`);
  await prisma.$disconnect();
}

main().catch((err) => {
  console.error('LỖI:', err);
  prisma.$disconnect();
  process.exit(1);
});
