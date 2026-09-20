import { describe, it, expect } from 'vitest';
import { parseDateInput, toBool, MCP_TOOLS, TOOLS_BY_NAME } from '@/server/mcp/tools';
import type { McpIdentity } from '@/server/mcp/auth';
import type { AuthContext } from '@/server/auth/context';

describe('AI Agent & MCP Tools Parameter Robustness', () => {
  describe('parseDateInput', () => {
    it('chuyển đổi định dạng DD/MM/YYYY thành YYYY-MM-DD', () => {
      expect(parseDateInput('22/09/2026')).toBe('2026-09-22');
      expect(parseDateInput('5/9/2026')).toBe('2026-09-05');
      expect(parseDateInput('01/12/2025')).toBe('2025-12-01');
    });

    it('chuyển đổi định dạng DD-MM-YYYY thành YYYY-MM-DD', () => {
      expect(parseDateInput('22-09-2026')).toBe('2026-09-22');
      expect(parseDateInput('05-09-2026')).toBe('2026-09-05');
    });

    it('giữ nguyên định dạng chuẩn YYYY-MM-DD', () => {
      expect(parseDateInput('2026-09-22')).toBe('2026-09-22');
    });

    it('xử lý chuỗi rỗng hoặc undefined an toàn', () => {
      expect(parseDateInput('')).toBe('');
      expect(parseDateInput(null)).toBe('');
      expect(parseDateInput(undefined)).toBe('');
    });
  });

  describe('toBool', () => {
    it('nhận diện đúng các giá trị truthy từ LLM', () => {
      expect(toBool(true)).toBe(true);
      expect(toBool('true')).toBe(true);
      expect(toBool(1)).toBe(true);
      expect(toBool('1')).toBe(true);
    });

    it('nhận diện đúng các giá trị falsy từ LLM', () => {
      expect(toBool(false)).toBe(false);
      expect(toBool('false')).toBe(false);
      expect(toBool(0)).toBe(false);
      expect(toBool('0')).toBe(false);
      expect(toBool(undefined)).toBe(false);
      expect(toBool(null)).toBe(false);
    });
  });

  describe('MCP Tools Schema & Handlers', () => {
    const mockCtx: AuthContext = {
      userId: 1,
      username: 'test_user',
      employeeId: 1,
      fullName: 'Nguyễn Văn Test',
      email: 'test@workhub.vn',
      avatarUrl: null,
      departmentId: 1,
      departmentName: 'Kỹ thuật',
      departmentPath: '/1',
      positionName: 'Kỹ sư',
      managerId: null,
      zaloLinked: true,
      roleCodes: ['STAFF'],
      roleNames: ['Nhân viên'],
      permissions: new Set(['MENU_TASKS', 'FEATURE_TASK_CREATE', 'MENU_LEAVES', 'FEATURE_LEAVE_REQUEST', 'FEATURE_ATTENDANCE_CHECKIN']),
      dataScope: 'SELF',
      customDeptIds: [],
      isAdmin: false,
    };

    const mockIdentity: McpIdentity = {
      clientId: 0,
      clientName: 'TestAgent',
      readOnly: false,
      scopes: [],
      ctx: mockCtx,
    };

    it('danh mục MCP_TOOLS có đầy đủ 14 công cụ chuẩn', () => {
      expect(MCP_TOOLS.length).toBe(14);
      const names = MCP_TOOLS.map((t) => t.name);
      expect(names).toContain('search_employees');
      expect(names).toContain('get_department_tree');
      expect(names).toContain('list_tasks');
      expect(names).toContain('get_task');
      expect(names).toContain('create_task');
      expect(names).toContain('update_task_status');
      expect(names).toContain('get_leave_balance');
      expect(names).toContain('list_leave_requests');
      expect(names).toContain('who_is_on_leave');
      expect(names).toContain('submit_leave_request');
      expect(names).toContain('list_pending_approvals');
      expect(names).toContain('approve_request');
      expect(names).toContain('attendance_summary');
      expect(names).toContain('my_day');
    });

    it('mỗi công cụ đều có inputSchema hợp lệ kiểu object', () => {
      for (const tool of MCP_TOOLS) {
        expect(tool.inputSchema).toBeDefined();
        expect(tool.inputSchema.type).toBe('object');
        expect(tool.inputSchema.properties).toBeDefined();
      }
    });

    it('TOOLS_BY_NAME map tra cứu công cụ chính xác', () => {
      const searchTool = TOOLS_BY_NAME.get('search_employees');
      expect(searchTool).toBeDefined();
      expect(searchTool?.title).toBe('Tìm nhân sự');
    });
  });
});
