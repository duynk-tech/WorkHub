import { describe, it, expect, vi, beforeEach } from 'vitest';
import { prisma } from '@/lib/prisma';
import { getRecentChatHistory } from '@/server/modules/zalo/ai-agent';
import { handleZaloCommand } from '@/server/modules/zalo/commands';
import { MCP_TOOLS, TOOLS_BY_NAME, checkToolAccess } from '@/server/mcp/tools';
import type { McpIdentity } from '@/server/mcp/auth';
import type { AuthContext } from '@/server/auth/context';
import { DEFAULT_SYSTEM_PROMPT } from '@/lib/ai-prompt';

describe('Zalo Bot Session Context & Role-Based Access Control', () => {
  describe('1. Session Context History (getRecentChatHistory)', () => {
    beforeEach(() => {
      vi.restoreAllMocks();
    });

    it('trả về mảng rỗng nếu không có zaloUserId', async () => {
      const history = await getRecentChatHistory('');
      expect(history).toEqual([]);
    });

    it('trích xuất lịch sử hội thoại gần nhất và đảo chiều theo thứ tự thời gian (chronological)', async () => {
      const mockLogs = [
        {
          text: 'Máy kem Carpigiani có cối dung tích bao nhiêu?',
          response: 'Máy Carpigiani có 2 cối dung tích 1.9L mỗi bên.',
          createdAt: new Date('2026-09-21T09:00:00Z'),
        },
        {
          text: 'Máy đó hiện đang đặt ở chi nhánh nào?',
          response: 'Máy đang được vận hành tại Highlands Coffee Vạn Hạnh Mall.',
          createdAt: new Date('2026-09-21T08:55:00Z'),
        },
      ];

      vi.spyOn(prisma.zaloInboundLog, 'findFirst').mockResolvedValue(null);
      vi.spyOn(prisma.zaloInboundLog, 'findMany').mockResolvedValue(mockLogs as any);

      const history = await getRecentChatHistory('zalo_test_user_01');

      // Phải có 4 messages (2 cặp user - assistant)
      expect(history).toHaveLength(4);
      // Sắp xếp tăng dần theo thời gian: tin cũ trước (08:55), tin mới sau (09:00)
      expect(history[0]).toEqual({
        role: 'user',
        content: 'Máy đó hiện đang đặt ở chi nhánh nào?',
      });
      expect(history[1]).toEqual({
        role: 'assistant',
        content: 'Máy đang được vận hành tại Highlands Coffee Vạn Hạnh Mall.',
      });
      expect(history[2]).toEqual({
        role: 'user',
        content: 'Máy kem Carpigiani có cối dung tích bao nhiêu?',
      });
      expect(history[3]).toEqual({
        role: 'assistant',
        content: 'Máy Carpigiani có 2 cối dung tích 1.9L mỗi bên.',
      });
    });

    it('bỏ qua các lệnh slash command (/viec, /checkin...) khỏi ngữ cảnh hội thoại', async () => {
      const mockLogs = [
        {
          text: '/viec',
          response: 'Danh sách công việc đang mở...',
          createdAt: new Date('2026-09-21T09:02:00Z'),
        },
        {
          text: 'Tình trạng máy làm kem thế nào?',
          response: 'Máy đang vận hành tốt.',
          createdAt: new Date('2026-09-21T09:00:00Z'),
        },
      ];

      vi.spyOn(prisma.zaloInboundLog, 'findFirst').mockResolvedValue(null);
      vi.spyOn(prisma.zaloInboundLog, 'findMany').mockResolvedValue(mockLogs as any);

      const history = await getRecentChatHistory('zalo_test_user_02');

      expect(history).toHaveLength(2);
      expect(history[0].content).toBe('Tình trạng máy làm kem thế nào?');
      expect(history[1].content).toBe('Máy đang vận hành tốt.');
    });

    it('cắt ngắn lịch sử khi gặp lệnh /reset hoặc /new gần nhất', async () => {
      const resetTime = new Date('2026-09-21T08:50:00Z');
      vi.spyOn(prisma.zaloInboundLog, 'findFirst').mockResolvedValue({
        createdAt: resetTime,
      } as any);

      const findManySpy = vi.spyOn(prisma.zaloInboundLog, 'findMany').mockResolvedValue([]);

      await getRecentChatHistory('zalo_test_user_03');

      expect(findManySpy).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            createdAt: { gt: resetTime },
          }),
        }),
      );
    });
  });

  describe('2. Zalo Commands: /reset, /new, /clear', () => {
    it('thực hiện lệnh /reset và trả về thông báo làm mới ngữ cảnh', async () => {
      // Mock employee tìm thấy
      vi.spyOn(prisma.employee, 'findUnique').mockResolvedValue({
        id: 1,
        code: 'NV001',
        fullName: 'Nguyễn Văn A',
        user: { roles: [] },
      } as any);

      const res = await handleZaloCommand('zalo_user_reset', '/reset');
      expect(res.handled).toBe(true);
      expect(res.reply).toContain('Đã làm mới ngữ cảnh trò chuyện');
    });

    it('thực hiện lệnh /new tương tự như /reset', async () => {
      vi.spyOn(prisma.employee, 'findUnique').mockResolvedValue({
        id: 1,
        code: 'NV001',
        fullName: 'Nguyễn Văn A',
        user: { roles: [] },
      } as any);

      const res = await handleZaloCommand('zalo_user_new', '/new');
      expect(res.handled).toBe(true);
      expect(res.reply).toContain('Đã làm mới ngữ cảnh trò chuyện');
    });
  });

  describe('3. Role-Based Access Control & MCP Tools Access', () => {
    const adminCtx: AuthContext = {
      userId: 1,
      username: 'admin',
      employeeId: 1,
      fullName: 'Quản trị viên',
      email: 'admin@workhub.vn',
      avatarUrl: null,
      departmentId: null,
      departmentName: null,
      departmentPath: null,
      positionName: 'Giám đốc',
      managerId: null,
      zaloLinked: true,
      roleCodes: ['ADMIN'],
      roleNames: ['Quản trị hệ thống'],
      permissions: new Set(['ALL']),
      dataScope: 'ALL',
      customDeptIds: [],
      isAdmin: true,
    };

    const staffCtx: AuthContext = {
      userId: 2,
      username: 'staff',
      employeeId: 2,
      fullName: 'Nhân viên A',
      email: 'staff@workhub.vn',
      avatarUrl: null,
      departmentId: 1,
      departmentName: 'Kinh doanh',
      departmentPath: '/1',
      positionName: 'Nhân viên',
      managerId: 1,
      zaloLinked: true,
      roleCodes: ['STAFF'],
      roleNames: ['Nhân viên'],
      permissions: new Set(['MENU_TASKS', 'FEATURE_TASK_CREATE']),
      dataScope: 'SELF',
      customDeptIds: [],
      isAdmin: false,
    };

    it('Admin có toàn quyền truy cập tất cả công cụ MCP F&B', () => {
      const adminIdentity: McpIdentity = {
        clientId: 0,
        clientName: 'AdminAgent',
        readOnly: false,
        scopes: [],
        ctx: adminCtx,
      };

      expect(checkToolAccess(adminIdentity, 'list_fnb_equipment')).toBeNull();
      expect(checkToolAccess(adminIdentity, 'get_fnb_equipment')).toBeNull();
      expect(checkToolAccess(adminIdentity, 'list_fnb_customers')).toBeNull();
      expect(checkToolAccess(adminIdentity, 'list_service_tickets')).toBeNull();
      expect(checkToolAccess(adminIdentity, 'create_service_ticket')).toBeNull();
    });

    it('Nhân viên thông thường thiếu quyền bị chặn khi truy cập công cụ F&B', () => {
      const staffIdentity: McpIdentity = {
        clientId: 0,
        clientName: 'StaffAgent',
        readOnly: false,
        scopes: [],
        ctx: staffCtx,
      };

      const accessResult = checkToolAccess(staffIdentity, 'list_fnb_equipment');
      expect(accessResult).toContain('không có quyền MENU_EQUIPMENT');
    });

    it('Nhân viên có quyền MENU_EQUIPMENT được phép tra cứu máy móc và sự cố F&B', () => {
      const techCtx: AuthContext = {
        ...staffCtx,
        permissions: new Set(['MENU_EQUIPMENT', 'FEATURE_EQUIPMENT_MAINTENANCE']),
      };
      const techIdentity: McpIdentity = {
        clientId: 0,
        clientName: 'TechAgent',
        readOnly: false,
        scopes: [],
        ctx: techCtx,
      };

      expect(checkToolAccess(techIdentity, 'list_fnb_equipment')).toBeNull();
      expect(checkToolAccess(techIdentity, 'get_fnb_equipment')).toBeNull();
      expect(checkToolAccess(techIdentity, 'list_service_tickets')).toBeNull();
      expect(checkToolAccess(techIdentity, 'create_service_ticket')).toBeNull();
    });
  });

  describe('4. System Prompt Guidance on Data Scope', () => {
    it('DEFAULT_SYSTEM_PROMPT chứa đầy đủ hướng dẫn về Session Context và Data Scope', () => {
      expect(DEFAULT_SYSTEM_PROMPT).toContain('SESSION CONTEXT');
      expect(DEFAULT_SYSTEM_PROMPT).toContain('DATA SCOPE & ROLE');
      expect(DEFAULT_SYSTEM_PROMPT).toContain('data_scope là "ALL"');
      expect(DEFAULT_SYSTEM_PROMPT).toContain('data_scope là "SELF"');
      expect(DEFAULT_SYSTEM_PROMPT).toContain('data_scope là "DEPT"');
      expect(DEFAULT_SYSTEM_PROMPT).toContain('onlyMine = true');
    });
  });

  describe('5. F&B MCP Tools Schema & Registration', () => {
    it('đăng ký thành công 5 công cụ F&B mới trong TOOLS_BY_NAME', () => {
      const tools = ['list_fnb_equipment', 'get_fnb_equipment', 'list_fnb_customers', 'list_service_tickets', 'create_service_ticket'];
      for (const name of tools) {
        const tool = TOOLS_BY_NAME.get(name);
        expect(tool).toBeDefined();
        expect(tool?.inputSchema.type).toBe('object');
      }
    });

    it('create_service_ticket được đánh dấu mutating: true', () => {
      const tool = TOOLS_BY_NAME.get('create_service_ticket');
      expect(tool?.mutating).toBe(true);
      // Giao diện /tickets cho cả người bảo trì lẫn người quản lý thiết bị tạo phiếu
      expect(tool?.permissionsAny).toContain('FEATURE_EQUIPMENT_MAINTENANCE');
      expect(tool?.permissionsAny).toContain('FEATURE_EQUIPMENT_MANAGE');
    });
  });
});
