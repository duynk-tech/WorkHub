import { describe, it, expect } from 'vitest';
import { MCP_TOOLS, TOOLS_BY_NAME, checkToolAccess, allowedDocumentKinds, hasToolPermission } from '@/server/mcp/tools';
import { DOCUMENT_KINDS } from '@/server/modules/settings/documents';
import type { McpIdentity } from '@/server/mcp/auth';

function identity(opts: {
  permissions?: string[];
  isAdmin?: boolean;
  readOnly?: boolean;
  scopes?: string[];
  dataScope?: string;
}): McpIdentity {
  return {
    clientId: 1,
    clientName: 'Test client',
    readOnly: opts.readOnly ?? false,
    scopes: opts.scopes ?? [],
    ctx: {
      userId: 1, username: 'u', employeeId: 1, fullName: 'Nguyễn Văn A',
      email: null, avatarUrl: null, departmentId: 1, departmentName: 'KT',
      departmentPath: '1/', positionName: null, managerId: null, zaloLinked: false,
      roleCodes: [], roleNames: [],
      permissions: new Set(opts.permissions ?? []),
      dataScope: (opts.dataScope ?? 'SELF') as never,
      customDeptIds: [],
      isAdmin: opts.isAdmin ?? false,
    } as never,
  };
}

const KT_ONLY = ['MENU_SPARE_PARTS', 'FEATURE_SPARE_PARTS_MANAGE'];
const SALES_ONLY = ['MENU_CUSTOMERS'];

describe('MCP — quyền của người đại diện', () => {
  it('mọi công cụ đều khai báo quyền, không có công cụ mở toang', () => {
    const open = MCP_TOOLS.filter((t) => !t.permission && !t.permissionsAny?.length);
    // Chỉ công cụ đọc dữ liệu của chính mình mới được bỏ trống quyền
    expect(open.map((t) => t.name).sort()).toEqual(['get_department_tree', 'my_day', 'search_employees']);
  });

  it('công cụ ghi dữ liệu luôn có quyền và bị chặn khi key ở chế độ chỉ đọc', () => {
    for (const t of MCP_TOOLS.filter((x) => x.mutating)) {
      expect(t.permission || t.permissionsAny?.length, `${t.name} thiếu quyền`).toBeTruthy();
      const denied = checkToolAccess(identity({ isAdmin: true, readOnly: true }), t.name);
      expect(denied, `${t.name} vẫn gọi được khi key chỉ đọc`).toContain('chỉ đọc');
    }
  });

  it('thiếu quyền thì bị từ chối, có quyền thì cho qua', () => {
    expect(checkToolAccess(identity({ permissions: KT_ONLY }), 'list_customer_orders'))
      .toContain('không có quyền');
    expect(checkToolAccess(identity({ permissions: SALES_ONLY }), 'list_customer_orders')).toBeNull();
  });

  it('báo cáo lãi gộp siết đúng như màn hình, không rơi xuống quyền xem menu', () => {
    // Chỉ xem được menu thiết bị thì không đủ để đọc giá vốn và lãi gộp
    expect(checkToolAccess(identity({ permissions: ['MENU_EQUIPMENT'] }), 'inventory_profit_report'))
      .toContain('cần một trong các quyền');
    expect(checkToolAccess(identity({ permissions: ['FEATURE_REPORT_INVENTORY'] }), 'inventory_profit_report')).toBeNull();
    expect(checkToolAccess(identity({ isAdmin: true }), 'inventory_profit_report')).toBeNull();
  });

  it('API key giới hạn scope không gọi được công cụ ngoài danh sách', () => {
    const limited = identity({ isAdmin: true, scopes: ['list_spare_parts'] });
    expect(checkToolAccess(limited, 'list_spare_parts')).toBeNull();
    expect(checkToolAccess(limited, 'customer_debt_summary')).toContain('không nằm trong phạm vi');
  });

  it('công cụ không tồn tại thì báo rõ, không im lặng cho qua', () => {
    expect(checkToolAccess(identity({ isAdmin: true }), 'drop_database')).toContain('Không có công cụ');
  });
});

describe('MCP — danh sách công cụ khớp với quyền gọi', () => {
  it('công cụ nào không gọi được thì cũng không được liệt kê', () => {
    // Quảng cáo công cụ rồi chặn khi gọi khiến trợ lý cứ thử và báo lỗi với người dùng
    for (const who of [
      identity({ permissions: KT_ONLY }),
      identity({ permissions: SALES_ONLY }),
      identity({ permissions: ['MENU_EQUIPMENT'] }),
      identity({}),
    ]) {
      for (const tool of MCP_TOOLS) {
        const listed = hasToolPermission(who.ctx, tool);
        const callable = checkToolAccess(who, tool.name) === null;
        expect(listed, `${tool.name}: liệt kê=${listed} nhưng gọi được=${callable}`).toBe(callable);
      }
    }
  });

  it('quyền xem menu thiết bị không đủ để thấy báo cáo lãi gộp trong danh sách', () => {
    const tool = TOOLS_BY_NAME.get('inventory_profit_report')!;
    expect(hasToolPermission(identity({ permissions: ['MENU_EQUIPMENT'] }).ctx, tool)).toBe(false);
    expect(hasToolPermission(identity({ permissions: ['FEATURE_REPORT_INVENTORY'] }).ctx, tool)).toBe(true);
  });
});

describe('MCP — sổ chứng từ chia quyền theo loại', () => {
  it('người chỉ có quyền kho không đọc được chứng từ tiền của khách', () => {
    const kinds = allowedDocumentKinds(identity({ permissions: KT_ONLY }));
    expect(kinds).toContain('STOCK');
    expect(kinds).toContain('PURCHASE_ORDER');
    expect(kinds).not.toContain('QUOTATION');
    expect(kinds).not.toContain('ORDER');
    expect(kinds).not.toContain('PAYMENT_IN');
  });

  it('người chỉ có quyền bán hàng không đọc được phiếu kho', () => {
    const kinds = allowedDocumentKinds(identity({ permissions: SALES_ONLY }));
    expect(kinds).toContain('ORDER');
    expect(kinds).toContain('PAYMENT_IN');
    expect(kinds).not.toContain('STOCK');
    expect(kinds).not.toContain('PAYMENT_OUT');
  });

  it('quản trị đọc được mọi loại chứng từ đã khai báo', () => {
    const kinds = allowedDocumentKinds(identity({ isAdmin: true }));
    expect(kinds.sort()).toEqual(Object.keys(DOCUMENT_KINDS).sort());
  });

  it('không có quyền nào thì không đọc được loại nào', () => {
    expect(allowedDocumentKinds(identity({}))).toEqual([]);
  });
});

describe('MCP — công cụ tra cứu nhân sự phải bám phạm vi dữ liệu', () => {
  it('các công cụ đọc dữ liệu người khác đều nhận identity để lọc phạm vi', () => {
    // Chữ ký handler có tham số thứ hai nghĩa là công cụ có dùng tới ngữ cảnh người dùng
    const scoped = ['list_tasks', 'get_task', 'search_employees', 'who_is_on_leave', 'list_leave_requests'];
    for (const name of scoped) {
      const tool = TOOLS_BY_NAME.get(name);
      expect(tool, `thiếu công cụ ${name}`).toBeDefined();
      expect(tool!.handler.length, `${name} không nhận identity để lọc phạm vi`).toBeGreaterThanOrEqual(2);
    }
  });
});

/**
 * Bảng đối chiếu quyền của công cụ MCP với quyền của màn hình tương ứng.
 *
 * Mỗi dòng ghi lại quyết định đã rà: MCP không được lỏng hơn giao diện (lộ dữ
 * liệu) và cũng không nên chặt hơn vô cớ (trợ lý từ chối việc mà người dùng tự
 * làm được trên web). Thêm công cụ mới mà quên khai vào đây thì test sẽ đỏ.
 */
const SCREEN_GATES: Record<string, string[]> = {
  // Nhân sự & chấm công — lọc thêm theo dataScope trong handler
  search_employees: [],
  get_department_tree: [],
  my_day: [],
  get_leave_balance: ['MENU_LEAVES'],
  list_leave_requests: ['MENU_LEAVES'],
  who_is_on_leave: ['MENU_LEAVES'],
  submit_leave_request: ['FEATURE_LEAVE_REQUEST'],
  list_pending_approvals: ['FEATURE_LEAVE_APPROVE'],
  approve_request: ['FEATURE_LEAVE_APPROVE'],
  attendance_summary: ['MENU_ATTENDANCE'],

  // Công việc — /tasks
  list_tasks: ['MENU_TASKS'],
  get_task: ['MENU_TASKS'],
  create_task: ['FEATURE_TASK_CREATE'],
  update_task_status: ['MENU_TASKS'],

  // Thiết bị & sự cố — /equipment, /tickets
  list_fnb_equipment: ['MENU_EQUIPMENT'],
  get_fnb_equipment: ['MENU_EQUIPMENT'],
  list_service_tickets: ['MENU_EQUIPMENT'],
  create_service_ticket: ['FEATURE_EQUIPMENT_MAINTENANCE', 'FEATURE_EQUIPMENT_MANAGE'],

  // Bán hàng — /customers
  list_fnb_customers: ['MENU_CUSTOMERS', 'FEATURE_CUSTOMER_MANAGE'],
  list_customer_orders: ['MENU_CUSTOMERS'],
  get_customer_order: ['MENU_CUSTOMERS'],
  list_customer_quotations: ['MENU_CUSTOMERS'],
  get_customer_quotation: ['MENU_CUSTOMERS'],
  customer_debt_summary: ['MENU_CUSTOMERS'],
  record_customer_payment: ['FEATURE_CUSTOMER_MANAGE'],

  // Kho — /spare-parts, /documents, báo cáo kho
  list_spare_parts: ['MENU_SPARE_PARTS', 'MENU_EQUIPMENT', 'FEATURE_SPARE_PARTS_MANAGE'],
  get_spare_part_stock: ['MENU_SPARE_PARTS', 'MENU_EQUIPMENT', 'FEATURE_SPARE_PARTS_MANAGE'],
  list_stock_transactions: ['MENU_SPARE_PARTS', 'MENU_EQUIPMENT', 'FEATURE_SPARE_PARTS_MANAGE'],
  find_document: ['MENU_REPORTS', 'MENU_EQUIPMENT', 'MENU_SPARE_PARTS', 'MENU_CUSTOMERS'],
  inventory_profit_report: ['FEATURE_SPARE_PARTS_MANAGE', 'FEATURE_REPORT_INVENTORY'],
};

describe('MCP — quyền công cụ khớp quyền màn hình', () => {
  it('mọi công cụ đều nằm trong bảng đối chiếu', () => {
    const missing = MCP_TOOLS.map((t) => t.name).filter((n) => !(n in SCREEN_GATES));
    expect(missing, `công cụ chưa rà quyền: ${missing.join(', ')}`).toEqual([]);
  });

  it('bảng đối chiếu không còn dòng thừa của công cụ đã xóa', () => {
    const names = new Set(MCP_TOOLS.map((t) => t.name));
    expect(Object.keys(SCREEN_GATES).filter((n) => !names.has(n))).toEqual([]);
  });

  it('quyền khai báo trên công cụ đúng bằng quyền màn hình đã rà', () => {
    for (const tool of MCP_TOOLS) {
      const declared = tool.permissionsAny ?? (tool.permission ? [tool.permission] : []);
      expect([...declared].sort(), `${tool.name} lệch quyền so với màn hình`)
        .toEqual([...SCREEN_GATES[tool.name]].sort());
    }
  });

  it('có đúng một quyền trong nhóm là gọi được, không cần đủ cả nhóm', () => {
    for (const [name, gates] of Object.entries(SCREEN_GATES)) {
      if (gates.length < 2) continue;
      for (const gate of gates) {
        const who = identity({ permissions: [gate] });
        expect(checkToolAccess(who, name), `${name} từ chối dù đã có ${gate}`).toBeNull();
      }
    }
  });

  it('không có quyền nào trong nhóm thì bị từ chối', () => {
    for (const [name, gates] of Object.entries(SCREEN_GATES)) {
      if (gates.length === 0) continue;
      expect(checkToolAccess(identity({ permissions: ['MENU_DASHBOARD'] }), name), `${name} vẫn cho qua`)
        .toBeTruthy();
    }
  });
});
