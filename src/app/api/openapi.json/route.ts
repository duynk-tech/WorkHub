import { NextResponse, type NextRequest } from 'next/server';
import { MCP_TOOLS } from '@/server/mcp/tools';
import { getAppUrl } from '@/lib/mcp-oauth';
import { getAppBranding } from '@/server/modules/settings/branding';

export const dynamic = 'force-dynamic';

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function GET(req: NextRequest) {
  const appUrl = getAppUrl(req);
  const branding = await getAppBranding();

  const paths: Record<string, unknown> = {};

  for (const tool of MCP_TOOLS) {
    const inputSchema = (tool.inputSchema ?? { type: 'object', properties: {} }) as {
      type?: string;
      properties?: Record<string, unknown>;
      required?: string[];
    };

    const hasRequired = Array.isArray(inputSchema.required) && inputSchema.required.length > 0;

    paths[`/api/openapi/tools/${tool.name}`] = {
      post: {
        operationId: tool.name,
        summary: tool.title,
        description: tool.description,
        tags: [`${branding.name} Tools`],
        security: [{ ApiKeyAuth: [] }],
        requestBody: {
          required: hasRequired,
          description: `Tham số đầu vào cho ${tool.title}`,
          content: {
            'application/json': {
              schema: inputSchema,
            },
          },
        },
        responses: {
          '200': {
            description: 'Kết quả thực thi thành công',
            content: {
              'application/json': {
                schema: {
                  type: 'object',
                  properties: {
                    success: { type: 'boolean' },
                    data: { type: 'object' },
                  },
                },
              },
            },
          },
          '400': {
            description: 'Tham số không hợp lệ',
          },
          '401': {
            description: 'Chưa xác thực hoặc API key / Token không hợp lệ',
          },
          '403': {
            description: 'Không có quyền thực hiện thao tác này',
          },
          '500': {
            description: 'Lỗi hệ thống khi xử lý',
          },
        },
      },
    };
  }

  const openApiSpec = {
    openapi: '3.0.3',
    info: {
      title: `${branding.name} API (Custom GPT Actions & MCP REST)`,
      version: '1.0.0',
      description:
        'REST API tương thích OpenAPI 3.0 dành cho ChatGPT Custom GPT Actions, n8n, Zapier và các công cụ AI khác. ' +
        'Xác thực bằng Bearer token: Sử dụng MCP API key (whmcp_...) hoặc OAuth Access Token (mcp_tok_...).',
    },
    servers: [
      {
        url: appUrl,
        description: `Máy chủ ${branding.name} hiện tại`,
      },
    ],
    paths,
    components: {
      securitySchemes: {
        ApiKeyAuth: {
          type: 'http',
          scheme: 'bearer',
          bearerFormat: 'API Key',
          description: `Bearer API key do ${branding.name} cấp (whmcp_...) hoặc OAuth Access Token (mcp_tok_...)`,
        },
      },
    },
  };

  return NextResponse.json(openApiSpec, {
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Content-Type': 'application/json; charset=utf-8',
    },
  });
}
