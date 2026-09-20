import { NextResponse, type NextRequest } from 'next/server';
import { getAppUrl } from '@/lib/mcp-oauth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const appUrl = getAppUrl(req);
  return NextResponse.json(
    {
      resource: `${appUrl}/api/mcp`,
      authorization_servers: [appUrl],
      bearer_methods_supported: ['header'],
      scopes_supported: ['mcp'],
    },
    {
      headers: {
        'Access-Control-Allow-Origin': '*',
        'Content-Type': 'application/json',
      },
    },
  );
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'GET, OPTIONS',
      'Access-Control-Allow-Headers': '*',
    },
  });
}
