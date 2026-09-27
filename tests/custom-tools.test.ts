import { describe, it, expect, vi } from 'vitest';
import { outboundToolRequest } from '@/server/security/outbound-http';
vi.mock('@/server/security/outbound-http', () => ({ outboundToolRequest: vi.fn() }));
import { executeCustomTool, type CustomAgentTool } from '@/server/modules/zalo/custom-tools';

describe('Custom Tools Execution', () => {
  it('chặn Custom Tool CODE kể cả mã hợp lệ', async () => {
    const tool: CustomAgentTool = {
      id: 'tool_code_1',
      name: 'calculate_bonus',
      title: 'Tính thưởng dự án',
      description: 'Tính thưởng cho nhân sự',
      isActive: true,
      actionType: 'CODE',
      parameters: [
        { name: 'salary', type: 'number', description: 'Lương cơ bản', required: true },
        { name: 'rate', type: 'number', description: 'Tỷ lệ thưởng', required: true },
      ],
      codeSnippet: `
        const s = Number(args.salary) || 0;
        const r = Number(args.rate) || 0;
        return { bonus: s * r, formatted: (s * r).toLocaleString('vi-VN') + ' đ' };
      `,
    };

    const res = await executeCustomTool(tool, { salary: 10000000, rate: 0.2 });
    expect(res.success).toBe(false);
    expect(res.error).toContain('vô hiệu hóa');
  });

  it('thực thi thành công Custom Tool loại HTTP GET với URL interpolation', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ trackingNumber: 'VN123', status: 'DELIVERED', recipient: 'Nguyen Van A' }),
    });
    vi.mocked(outboundToolRequest).mockImplementation(async (url, method, headers, body) => {
      const response = await mockFetch(url, { method, headers, body });
      return response.json();
    });

    const tool: CustomAgentTool = {
      id: 'tool_http_1',
      name: 'lookup_tracking',
      title: 'Tra cứu vận đơn',
      description: 'Tra cứu vận đơn vận chuyển',
      isActive: true,
      actionType: 'HTTP',
      parameters: [
        { name: 'code', type: 'string', description: 'Mã vận đơn', required: true },
      ],
      httpConfig: {
        method: 'GET',
        url: 'https://api.vanchuyen.vn/track?code={{code}}',
        headers: {
          'Authorization': 'Bearer test_token_xyz',
        },
      },
    };

    const res = await executeCustomTool(tool, { code: 'VN123' });
    expect(res.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.vanchuyen.vn/track?code=VN123',
      expect.objectContaining({
        method: 'GET',
        headers: expect.objectContaining({
          Authorization: 'Bearer test_token_xyz',
          'User-Agent': 'WorkHub-AI-Agent/1.0',
        }),
      }),
    );
    expect(res.data).toEqual({
      trackingNumber: 'VN123',
      status: 'DELIVERED',
      recipient: 'Nguyen Van A',
    });

    vi.unstubAllGlobals();
  });

  it('thực thi thành công Custom Tool loại HTTP POST với Body interpolation', async () => {
    const mockFetch = vi.fn().mockResolvedValue({
      ok: true,
      headers: new Headers({ 'content-type': 'application/json' }),
      json: async () => ({ success: true, orderId: 'ORD_999' }),
    });
    vi.mocked(outboundToolRequest).mockImplementation(async (url, method, headers, body) => {
      const response = await mockFetch(url, { method, headers, body });
      return response.json();
    });

    const tool: CustomAgentTool = {
      id: 'tool_http_post',
      name: 'create_crm_lead',
      title: 'Tạo Lead CRM',
      description: 'Tạo cơ hội bán hàng CRM',
      isActive: true,
      actionType: 'HTTP',
      parameters: [
        { name: 'customerName', type: 'string', description: 'Tên khách hàng', required: true },
        { name: 'phone', type: 'string', description: 'Số điện thoại', required: true },
      ],
      httpConfig: {
        method: 'POST',
        url: 'https://api.crm.vn/leads',
        headers: {
          'Content-Type': 'application/json',
        },
        bodyTemplate: '{"name":"{{customerName}}","phone":"{{phone}}"}',
      },
    };

    const res = await executeCustomTool(tool, { customerName: 'Tran B', phone: '0912345678' });
    expect(res.success).toBe(true);
    expect(mockFetch).toHaveBeenCalledWith(
      'https://api.crm.vn/leads',
      expect.objectContaining({
        method: 'POST',
        body: '{"name":"Tran B","phone":"0912345678"}',
      }),
    );
    expect(res.data).toEqual({ success: true, orderId: 'ORD_999' });

    vi.unstubAllGlobals();
  });

  it('xử lý an toàn khi Code snippet bị lỗi cú pháp hoặc runtime', async () => {
    const tool: CustomAgentTool = {
      id: 'tool_err',
      name: 'broken_code',
      title: 'Tool lỗi',
      description: 'Test lỗi',
      isActive: true,
      actionType: 'CODE',
      parameters: [],
      codeSnippet: 'throw new Error("Lỗi giả lập trong script");',
    };

    const res = await executeCustomTool(tool, {});
    expect(res.success).toBe(false);
    expect(res.error).toContain('vô hiệu hóa');
  });
});
