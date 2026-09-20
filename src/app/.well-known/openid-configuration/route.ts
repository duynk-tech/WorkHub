import { NextResponse, type NextRequest } from 'next/server';
import { getAppUrl } from '@/lib/mcp-oauth';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const appUrl = getAppUrl(req);
  return NextResponse.json(
    {
      issuer: appUrl,
      authorization_endpoint: `${appUrl}/oauth/authorize`,
      token_endpoint: `${appUrl}/api/mcp/oauth/token`,
      registration_endpoint: `${appUrl}/api/mcp/oauth/register`,
      response_types_supported: ['code'],
      grant_types_supported: ['authorization_code', 'refresh_token'],
      code_challenge_methods_supported: ['S256', 'plain'],
      token_endpoint_auth_methods_supported: ['none', 'client_secret_post', 'client_secret_basic'],
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
