import { describe, it, expect, vi } from 'vitest';
import { buildCatalogOptions } from '@/components/domain/line-items-editor';

describe('Đơn giá dòng hàng đơn bán (Sales Order Pricing)', () => {
  const sampleSpareParts = [
    {
      id: 1,
      itemCode: 'SP-HAS-PRICE',
      name: 'Lưỡi dao máy xay',
      unit: 'Cái',
      costPrice: 500_000,
      sellingPrice: 850_000,
      autoPrice: 714_000,
    },
    {
      id: 2,
      itemCode: 'SP-AUTO-PRICE',
      name: 'Gioăng cao su EPDM',
      unit: 'Cái',
      costPrice: 200_000,
      sellingPrice: null,
      autoPrice: 286_000,
    },
    {
      id: 3,
      itemCode: 'SP-NO-PRICE',
      name: 'Mô tơ bơm áp lực',
      unit: 'Cái',
      costPrice: 2_000_000,
      sellingPrice: null,
      autoPrice: null,
    },
  ];

  const sampleStockMachines = [
    {
      id: 101,
      machineCode: 'EQ-01',
      name: 'Máy kem Taylor C708',
      brand: 'Taylor',
      model: 'C708',
      soldPrice: 150_000_000,
    },
    {
      id: 102,
      machineCode: 'EQ-02',
      name: 'Máy làm đá Hoshizaki',
      brand: 'Hoshizaki',
      model: 'IM-100',
      soldPrice: null,
    },
  ];

  describe('buildCatalogOptions với strictSellingPrice = true (Đơn bán hàng)', () => {
    it('hiển thị đúng giá bán niêm yết khi sản phẩm đã có sellingPrice', () => {
      const opts = buildCatalogOptions({
        spareParts: sampleSpareParts,
        strictSellingPrice: true,
      });

      const opt = opts.find((o) => o.value === 'SP:1');
      expect(opt).toBeDefined();
      expect(opt?.subLabel).toContain('850.000 ₫');
      expect(opt?.subLabel).not.toContain('Chưa có giá bán');
    });

    it('hiển thị giá tính sẵn khi sản phẩm chỉ có autoPrice', () => {
      const opts = buildCatalogOptions({
        spareParts: sampleSpareParts,
        strictSellingPrice: true,
      });

      const opt = opts.find((o) => o.value === 'SP:2');
      expect(opt).toBeDefined();
      expect(opt?.subLabel).toContain('286.000 ₫ (tính sẵn)');
      expect(opt?.subLabel).not.toContain('Chưa có giá bán');
    });

    it('cảnh báo rõ ⚠️ Chưa có giá bán khi sản phẩm không có giá niêm yết/tính sẵn', () => {
      const opts = buildCatalogOptions({
        spareParts: sampleSpareParts,
        strictSellingPrice: true,
      });

      const opt = opts.find((o) => o.value === 'SP:3');
      expect(opt).toBeDefined();
      expect(opt?.subLabel).toContain('⚠️ Chưa có giá bán');
    });

    it('máy trong kho có giá bán thì hiển thị giá, chưa có thì cảnh báo ⚠️ Chưa có giá bán', () => {
      const opts = buildCatalogOptions({
        stockMachines: sampleStockMachines,
        strictSellingPrice: true,
      });

      const optWithPrice = opts.find((o) => o.value === 'EQ:101');
      expect(optWithPrice?.subLabel).toContain('150.000.000 ₫');

      const optNoPrice = opts.find((o) => o.value === 'EQ:102');
      expect(optNoPrice?.subLabel).toContain('⚠️ Chưa có giá bán');
    });
  });

  describe('buildCatalogOptions với strictSellingPrice = false (Báo giá khách hàng)', () => {
    it('chế độ báo giá vẫn tạm tính giá động từ giá vốn khi chưa có giá bán', () => {
      const opts = buildCatalogOptions({
        spareParts: sampleSpareParts,
        strictSellingPrice: false,
        pricingConfig: { defaultMarginPercent: 30 },
      });

      const opt = opts.find((o) => o.value === 'SP:3');
      expect(opt).toBeDefined();
      // 2.000.000 / (1 - 0.3) = ~2.857.143 ₫
      expect(opt?.subLabel).toContain('(tạm tính)');
    });
  });
});
