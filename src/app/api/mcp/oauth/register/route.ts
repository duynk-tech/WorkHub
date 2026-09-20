import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import { saveOAuthClient, type OAuthClientData } from '@/lib/mcp-oauth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    const body = await req.json();

    if (!body.redirect_uris || !Array.isArray(body.redirect_uris) || body.redirect_uris.length === 0) {
      return NextResponse.json(
        {
          error: 'invalid_client_metadata',
          error_description: 'redirect_uris is required and must be a non-empty array',
        },
        { status: 400 },
      );
    }

    const clientId = `mcp_client_${crypto.randomBytes(16).toString('hex')}`;
    const clientSecret = `mcp_sec_${crypto.randomBytes(24).toString('hex')}`;
    const clientName = String(body.client_name || 'ChatGPT MCP Client').slice(0, 100);

    const clientData: OAuthClientData = {
      clientId,
      clientSecret,
      clientName,
      redirectUris: body.redirect_uris,
      grantTypes: Array.isArray(body.grant_types) ? body.grant_types : ['authorization_code', 'refresh_token'],
      responseTypes: Array.isArray(body.response_types) ? body.response_types : ['code'],
      tokenEndpointAuthMethod: body.token_endpoint_auth_method || 'none',
      createdAt: Math.floor(Date.now() / 1000),
    };

    await saveOAuthClient(clientData);

    return NextResponse.json(
      {
        client_id: clientData.clientId,
        client_secret: clientData.clientSecret,
        client_id_issued_at: clientData.createdAt,
        client_name: clientData.clientName,
        redirect_uris: clientData.redirectUris,
        grant_types: clientData.grantTypes,
        response_types: clientData.responseTypes,
        token_endpoint_auth_method: clientData.tokenEndpointAuthMethod,
      },
      {
        status: 201,
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
        },
      },
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        error: 'server_error',
        error_description: err?.message || 'Lỗi khi đăng ký DCR client',
      },
      { status: 500 },
    );
  }
}

export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, Authorization',
    },
  });
}
