import { NextResponse, type NextRequest } from 'next/server';
import { authenticateMcp, logMcpCall } from '@/server/mcp/auth';
import { TOOLS_BY_NAME, checkToolAccess } from '@/server/mcp/tools';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  const { name } = await context.params;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const auth = await authenticateMcp(req.headers.get('authorization'), ip);

  if (!auth.ok) {
    return NextResponse.json(
      { success: false, error: auth.error },
      {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Bearer realm="workhub-openapi"',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) {
    return NextResponse.json(
      { success: false, error: `Không tìm thấy công cụ "${name}"` },
      { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }

  const denied = checkToolAccess(auth.identity, name);
  if (denied) {
    await logMcpCall(auth.identity.clientId, name, {}, false, 0, denied);
    return NextResponse.json(
      { success: false, error: denied },
      { status: 403, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }

  let args: Record<string, unknown> = {};
  try {
    const text = await req.text();
    if (text.trim()) {
      args = JSON.parse(text);
    }
  } catch {
    return NextResponse.json(
      { success: false, error: 'Định dạng JSON trong body không hợp lệ' },
      { status: 400, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }

  const started = Date.now();
  try {
    const result = await tool.handler(args, auth.identity);
    await logMcpCall(auth.identity.clientId, name, args, true, Date.now() - started);
    return NextResponse.json(
      { success: true, data: result },
      { headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Lỗi không xác định';
    await logMcpCall(auth.identity.clientId, name, args, false, Date.now() - started, message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
}

export async function GET(
  req: NextRequest,
  context: { params: Promise<{ name: string }> }
) {
  const { name } = await context.params;
  const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() ?? null;
  const auth = await authenticateMcp(req.headers.get('authorization'), ip);

  if (!auth.ok) {
    return NextResponse.json(
      { success: false, error: auth.error },
      {
        status: 401,
        headers: {
          'WWW-Authenticate': 'Bearer realm="workhub-openapi"',
          'Access-Control-Allow-Origin': '*',
        },
      }
    );
  }

  const tool = TOOLS_BY_NAME.get(name);
  if (!tool) {
    return NextResponse.json(
      { success: false, error: `Không tìm thấy công cụ "${name}"` },
      { status: 404, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }

  const denied = checkToolAccess(auth.identity, name);
  if (denied) {
    await logMcpCall(auth.identity.clientId, name, {}, false, 0, denied);
    return NextResponse.json(
      { success: false, error: denied },
      { status: 403, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }

  // Parse query parameters
  const { searchParams } = new URL(req.url);
  const args: Record<string, unknown> = {};
  for (const [key, value] of searchParams.entries()) {
    try {
      args[key] = JSON.parse(value);
    } catch {
      args[key] = value;
    }
  }

  const started = Date.now();
  try {
    const result = await tool.handler(args, auth.identity);
    await logMcpCall(auth.identity.clientId, name, args, true, Date.now() - started);
    return NextResponse.json(
      { success: true, data: result },
      { headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Lỗi không xác định';
    await logMcpCall(auth.identity.clientId, name, args, false, Date.now() - started, message);
    return NextResponse.json(
      { success: false, error: message },
      { status: 500, headers: { 'Access-Control-Allow-Origin': '*' } }
    );
  }
}
