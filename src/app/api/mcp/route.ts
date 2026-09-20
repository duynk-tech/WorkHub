import { NextResponse, type NextRequest } from 'next/server';
import { authenticateMcp, logMcpCall, type McpIdentity } from '@/server/mcp/auth';
import { MCP_TOOLS, TOOLS_BY_NAME, checkToolAccess } from '@/server/mcp/tools';
import { can } from '@/server/auth/context';
import { getAppUrl } from '@/lib/mcp-oauth';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const PROTOCOL_VERSION = '2025-06-18';
const SERVER_INFO = { name: 'workhub-mcp', title: 'WorkHub', version: '1.0.0' };

interface JsonRpcRequest {
  jsonrpc: '2.0';
  id?: string | number | null;
  method: string;
  params?: Record<string, unknown>;
}

const ok = (id: unknown, result: unknown) => ({ jsonrpc: '2.0', id, result });
const err = (id: unknown, code: number, message: string) => ({ jsonrpc: '2.0', id, error: { code, message } });

function toolDescriptor(identity: McpIdentity) {
  return MCP_TOOLS
    .filter((t) => identity.scopes.length === 0 || identity.scopes.includes(t.name))
    .filter((t) => !(t.mutating && identity.readOnly))
    .filter((t) => !t.permission || can(identity.ctx, t.permission))
    .map((t) => ({
      name: t.name,
      title: t.title,
      description: t.description,
      inputSchema: t.inputSchema,
      annotations: { readOnlyHint: !t.mutating },
    }));
}

async function handleRpc(body: JsonRpcRequest, identity: McpIdentity) {
  const { id, method, params } = body;

  switch (method) {
    case 'initialize':
      return ok(id, {
        protocolVersion: PROTOCOL_VERSION,
        capabilities: { tools: { listChanged: false } },
        serverInfo: SERVER_INFO,
        instructions:
          `Máy chủ MCP của hệ thống WorkHub (quản lý công việc, nghỉ phép, chấm công). ` +
          `Mọi truy vấn chạy dưới danh tính "${identity.ctx.fullName}" với phạm vi dữ liệu của tài khoản đó.`,
      });

    case 'notifications/initialized':
      return null; // notification, không cần phản hồi

    case 'ping':
      return ok(id, {});

    case 'tools/list':
      return ok(id, { tools: toolDescriptor(identity) });

    case 'tools/call': {
      const name = String(params?.name ?? '');
      const args = (params?.arguments ?? {}) as Record<string, unknown>;

      const denied = checkToolAccess(identity, name);
      if (denied) {
        await logMcpCall(identity.clientId, name, args, false, 0, denied);
        return ok(id, { isError: true, content: [{ type: 'text', text: `❌ ${denied}` }] });
      }

      const tool = TOOLS_BY_NAME.get(name)!;
      const started = Date.now();
      try {
        const result = await tool.handler(args, identity);
        await logMcpCall(identity.clientId, name, args, true, Date.now() - started);
        return ok(id, {
          content: [{ type: 'text', text: JSON.stringify(result, null, 2) }],
          structuredContent: result as Record<string, unknown>,
        });
      } catch (e) {
        const message = e instanceof Error ? e.message : 'Lỗi không xác định';
        await logMcpCall(identity.clientId, name, args, false, Date.now() - started, message);
        return ok(id, { isError: true, content: [{ type: 'text', text: `❌ ${message}` }] });
      }
    }

    case 'resources/list':
      return ok(id, { resources: [] });

    case 'prompts/list':
      return ok(id, {
        prompts: [
          { name: 'daily_brief', title: 'Tổng quan trong ngày', description: 'Tóm tắt việc đến hạn, việc quá hạn và đơn chờ duyệt của tôi' },
          { name: 'who_is_out', title: 'Ai nghỉ hôm nay', description: 'Liệt kê nhân sự nghỉ phép trong ngày' },
        ],
      });

    case 'prompts/get': {
      const name = String(params?.name ?? '');
      const text = name === 'who_is_out'
        ? 'Hôm nay những ai nghỉ phép? Dùng công cụ who_is_on_leave.'
        : 'Tóm tắt ngày làm việc của tôi: việc đến hạn, việc quá hạn, đơn chờ duyệt. Dùng công cụ my_day.';
      return ok(id, { messages: [{ role: 'user', content: { type: 'text', text } }] });
    }

    default:
      return err(id, -32601, `Phương thức không được hỗ trợ: ${method}`);
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Authorization, Content-Type, Accept',
      'Access-Control-Max-Age': '86400',
    },
  });
}

export async function POST(req: NextRequest) {
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const auth = await authenticateMcp(req.headers.get('authorization'), ip);
  const appUrl = getAppUrl(req);

  if (!auth.ok) {
    return NextResponse.json(err(null, -32001, auth.error), {
      status: 401,
      headers: {
        'WWW-Authenticate': `Bearer realm="workhub-mcp", resource_metadata="${appUrl}/.well-known/oauth-protected-resource"`,
        'Access-Control-Allow-Origin': '*',
      },
    });
  }

  let body: JsonRpcRequest | JsonRpcRequest[];
  try {
    body = await req.json();
  } catch {
    return NextResponse.json(err(null, -32700, 'JSON không hợp lệ'), {
      status: 400,
      headers: { 'Access-Control-Allow-Origin': '*' },
    });
  }

  // Hỗ trợ batch request theo chuẩn JSON-RPC 2.0
  if (Array.isArray(body)) {
    const results = [];
    for (const item of body) {
      const res = await handleRpc(item, auth.identity);
      if (res) results.push(res);
    }
    return results.length
      ? NextResponse.json(results, { headers: { 'Access-Control-Allow-Origin': '*' } })
      : new NextResponse(null, { status: 202, headers: { 'Access-Control-Allow-Origin': '*' } });
  }

  const result = await handleRpc(body, auth.identity);
  if (!result) return new NextResponse(null, { status: 202, headers: { 'Access-Control-Allow-Origin': '*' } });
  return NextResponse.json(result, { headers: { 'Access-Control-Allow-Origin': '*' } });
}

/** Mô tả endpoint cho người tích hợp. */
export async function GET(req: NextRequest) {
  const auth = await authenticateMcp(req.headers.get('authorization'));
  const appUrl = getAppUrl(req);

  if (!auth.ok) {
    return NextResponse.json(
      {
        service: SERVER_INFO,
        transport: 'Streamable HTTP (JSON-RPC 2.0 over POST)',
        authentication: 'Authorization: Bearer <MCP API key or OAuth Token>',
        oauth_metadata: `${appUrl}/.well-known/oauth-protected-resource`,
        hint: 'Tạo API key trong Cấu hình → Tích hợp & MCP hoặc kết nối OAuth 2.1',
      },
      {
        status: 401,
        headers: {
          'WWW-Authenticate': `Bearer realm="workhub-mcp", resource_metadata="${appUrl}/.well-known/oauth-protected-resource"`,
          'Access-Control-Allow-Origin': '*',
        },
      },
    );
  }
  return NextResponse.json(
    {
      service: SERVER_INFO,
      client: auth.identity.clientName,
      actingAs: auth.identity.ctx.fullName,
      readOnly: auth.identity.readOnly,
      tools: toolDescriptor(auth.identity).map((t) => ({ name: t.name, title: t.title })),
    },
    {
      headers: { 'Access-Control-Allow-Origin': '*' },
    },
  );
}
