import { describe, it, expect } from 'vitest';
import { MCP_TOOLS } from '@/server/mcp/tools';
import { MCP_MODULES, MCP_MODULE_KEYS, sanitizeDisabledModules, type McpModuleKey } from '@/server/mcp/modules';

describe('phân hệ công cụ MCP', () => {
  it('mọi công cụ đều thuộc một phân hệ đã khai báo', () => {
    for (const t of MCP_TOOLS) {
      expect(MCP_MODULES[t.module], `${t.name} có phân hệ lạ: ${t.module}`).toBeDefined();
    }
  });

  it('tên công cụ không trùng nhau', () => {
    const names = MCP_TOOLS.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  it('mỗi phân hệ đều có ít nhất một công cụ', () => {
    for (const key of MCP_MODULE_KEYS) {
      expect(MCP_TOOLS.some((t) => t.module === key), `phân hệ ${key} rỗng`).toBe(true);
    }
  });

  it('tắt một phân hệ chỉ gỡ đúng công cụ của phân hệ đó', () => {
    const off: McpModuleKey[] = ['sales'];
    const left = MCP_TOOLS.filter((t) => !off.includes(t.module));
    expect(left.some((t) => t.module === 'sales')).toBe(false);
    expect(left.some((t) => t.module === 'hr')).toBe(true);
    expect(left.length).toBe(MCP_TOOLS.length - MCP_TOOLS.filter((t) => t.module === 'sales').length);
  });

  it('công cụ bán hàng có đủ đơn hàng, báo giá và công nợ', () => {
    const sales = MCP_TOOLS.filter((t) => t.module === 'sales').map((t) => t.name);
    expect(sales).toContain('list_customer_orders');
    expect(sales).toContain('get_customer_order');
    expect(sales).toContain('list_customer_quotations');
    expect(sales).toContain('customer_debt_summary');
  });

  it('công cụ ghi dữ liệu phải khai báo quyền', () => {
    for (const t of MCP_TOOLS.filter((x) => x.mutating)) {
      const declared = t.permissionsAny?.length ? t.permissionsAny : t.permission ? [t.permission] : [];
      expect(declared.length, `${t.name} ghi dữ liệu nhưng không khai quyền`).toBeGreaterThan(0);
    }
  });

  it('bỏ qua khóa phân hệ lạ trong cấu hình', () => {
    expect(sanitizeDisabledModules(['sales', 'khong-ton-tai'])).toEqual(['sales']);
    expect(sanitizeDisabledModules('sai kiểu')).toEqual([]);
  });
});
