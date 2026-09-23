import { describe, it, expect } from 'vitest';
import {
  PART_CATEGORIES,
  WAREHOUSE_TYPES,
  TRANSACTION_TYPES,
  SaveSparePartSchema,
  SaveStockTransactionSchema,
  SaveWarehouseSchema,
} from '@/server/modules/spare-parts/types';
import { TOOLS_BY_NAME } from '@/server/mcp/tools';

describe('Spare Parts & Inventory Management Module', () => {
  describe('Phân loại & Cấu hình Danh mục', () => {
    it('định nghĩa đầy đủ các phân loại phụ tùng F&B', () => {
      expect(PART_CATEGORIES.SPARE_PART).toBeDefined();
      expect(PART_CATEGORIES.SPARE_PART.label).toBe('Linh kiện thay thế');
      expect(PART_CATEGORIES.CONSUMABLE).toBeDefined();
      expect(PART_CATEGORIES.CONSUMABLE.label).toBe('Vật tư tiêu hao');
      expect(PART_CATEGORIES.MACHINE).toBeDefined();
      expect(PART_CATEGORIES.MACHINE.label).toBe('Cụm máy / Bộ phận lớn');
    });

    it('định nghĩa đầy đủ các loại kho bãi (Kho trung tâm vs Kho chi nhánh)', () => {
      expect(WAREHOUSE_TYPES.CENTRAL).toBeDefined();
      expect(WAREHOUSE_TYPES.CENTRAL.label).toBe('Kho trung tâm');
      expect(WAREHOUSE_TYPES.BRANCH).toBeDefined();
      expect(WAREHOUSE_TYPES.BRANCH.label).toBe('Kho chi nhánh');
    });

    it('định nghĩa các loại giao dịch kho (IN, OUT, TRANSFER)', () => {
      expect(TRANSACTION_TYPES.IN.label).toBe('Nhập kho');
      expect(TRANSACTION_TYPES.IN.prefix).toBe('NK');
      expect(TRANSACTION_TYPES.OUT.label).toBe('Xuất kho');
      expect(TRANSACTION_TYPES.OUT.prefix).toBe('XK');
      expect(TRANSACTION_TYPES.TRANSFER.label).toBe('Điều chuyển');
      expect(TRANSACTION_TYPES.TRANSFER.prefix).toBe('DC');
    });
  });

  describe('Validation Schemas (Zod)', () => {
    it('validate dữ liệu phụ tùng hợp lệ', () => {
      const validPart = {
        itemCode: 'SP-2026-0001',
        name: 'Bộ gioăng phớt cối kem Donper',
        category: 'SPARE_PART',
        unit: 'Bộ',
        compatibleWith: 'Máy làm kem Donper BQL-S22',
        minStockAlert: 10,
        costPrice: 280000,
        sellingPrice: 450000,
        manufacturer: 'Donper OEM',
        status: 'ACTIVE',
      };

      const parsed = SaveSparePartSchema.safeParse(validPart);
      expect(parsed.success).toBe(true);
    });

    it('chặn dữ liệu phụ tùng thiếu tên hoặc đơn vị tính', () => {
      const invalidPart = {
        itemCode: 'SP-2026-0001',
        name: '',
        unit: '',
      };

      const parsed = SaveSparePartSchema.safeParse(invalidPart);
      expect(parsed.success).toBe(false);
    });

    it('validate giao dịch Nhập kho (IN)', () => {
      const validTx = {
        type: 'IN',
        targetWarehouseId: 1,
        reason: 'Nhập kho lô linh kiện từ hãng',
        items: [{ itemId: 1, quantity: 20, unitPrice: 280000 }],
      };

      const parsed = SaveStockTransactionSchema.safeParse(validTx);
      expect(parsed.success).toBe(true);
    });

    it('validate giao dịch Điều chuyển kho (TRANSFER)', () => {
      const validTransfer = {
        type: 'TRANSFER',
        sourceWarehouseId: 1,
        targetWarehouseId: 2,
        reason: 'Chuyển linh kiện sang Xe kỹ thuật 01',
        items: [
          { itemId: 1, quantity: 5 },
          { itemId: 2, quantity: 3 },
        ],
      };

      const parsed = SaveStockTransactionSchema.safeParse(validTransfer);
      expect(parsed.success).toBe(true);
    });

    it('validate thông tin kho bãi và xe kỹ thuật', () => {
      const central = {
        code: 'WH-HN-CENTRAL',
        name: 'Kho Tổng Kỹ Thuật Hà Nội',
        type: 'CENTRAL',
        address: '88 Phố Vọng, Hà Nội',
        status: 'ACTIVE',
      };
      expect(SaveWarehouseSchema.safeParse(central).success).toBe(true);

      const van = {
        code: 'VAN-HN-01',
        name: 'Xe Kỹ Thuật Lưu Động 01',
        type: 'MOBILE_VAN',
        status: 'ACTIVE',
      };
      expect(SaveWarehouseSchema.safeParse(van).success).toBe(true);
    });
  });

  describe('Tính toán Tồn kho & Cảnh báo Tồn an toàn', () => {
    it('tính toán chính xác tổng tồn kho trên nhiều kho/xe và cảnh báo hết hàng', () => {
      const item = {
        id: 1,
        name: 'Bo mạch nguồn BQL',
        minStockAlert: 5,
        stocks: [
          { warehouseId: 1, quantity: 2 }, // Kho tổng còn 2
          { warehouseId: 2, quantity: 1 }, // Xe KTV còn 1
        ],
      };

      const totalStock = item.stocks.reduce((sum, s) => sum + s.quantity, 0);
      const isLowStock = totalStock <= item.minStockAlert;

      expect(totalStock).toBe(3);
      expect(isLowStock).toBe(true); // 3 <= 5 -> Cảnh báo sắp hết hàng
    });

    it('tính toán chính xác tổng giá trị tồn kho', () => {
      const inventory = [
        { totalQty: 10, costPrice: 280000 },
        { totalQty: 5, costPrice: 150000 },
        { totalQty: 2, costPrice: 2100000 },
      ];

      const totalValue = inventory.reduce((sum, i) => sum + i.totalQty * i.costPrice, 0);
      expect(totalValue).toBe(2800000 + 750000 + 4200000); // 7.750.000 ₫
    });
  });

  describe('Tích hợp AI & MCP Tools', () => {
    it('đăng ký thành công công cụ list_spare_parts', () => {
      const tool = TOOLS_BY_NAME.get('list_spare_parts');
      expect(tool).toBeDefined();
      expect(tool?.title).toBe('Tra cứu danh mục phụ tùng & tồn kho');
      // Màn hình /spare-parts mở cho cả ba quyền này, MCP theo đúng như vậy
      expect(tool?.permissionsAny).toContain('MENU_EQUIPMENT');
      expect(tool?.permissionsAny).toContain('MENU_SPARE_PARTS');
    });

    it('đăng ký thành công công cụ get_spare_part_stock', () => {
      const tool = TOOLS_BY_NAME.get('get_spare_part_stock');
      expect(tool).toBeDefined();
      expect(tool?.title).toBe('Kiểm tra tồn kho phụ tùng chi tiết');
      // Màn hình /spare-parts mở cho cả ba quyền này, MCP theo đúng như vậy
      expect(tool?.permissionsAny).toContain('MENU_EQUIPMENT');
      expect(tool?.permissionsAny).toContain('MENU_SPARE_PARTS');
    });
  });
});
