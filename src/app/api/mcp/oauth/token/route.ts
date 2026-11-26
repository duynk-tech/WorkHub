import { NextResponse, type NextRequest } from 'next/server';
import { prisma } from '@/lib/prisma';
import { sha256 } from '@/lib/crypto';
import { consumeAuthCode, verifyPkce, issueOAuthToken } from '@/lib/mcp-oauth';

export const dynamic = 'force-dynamic';

export async function POST(req: NextRequest) {
  try {
    let grantType = '';
    let code = '';
    let redirectUri = '';
    let clientId = '';
    let codeVerifier = '';

    const contentType = req.headers.get('content-type') || '';
    if (contentType.includes('application/x-www-form-urlencoded')) {
      const formData = await req.formData();
      grantType = String(formData.get('grant_type') || '');
      code = String(formData.get('code') || '');
      redirectUri = String(formData.get('redirect_uri') || '');
      clientId = String(formData.get('client_id') || '');
      codeVerifier = String(formData.get('code_verifier') || '');
    } else {
      const body = await req.json().catch(() => ({}));
      grantType = String(body.grant_type || '');
      code = String(body.code || '');
      redirectUri = String(body.redirect_uri || '');
      clientId = String(body.client_id || '');
      codeVerifier = String(body.code_verifier || '');
    }

    if (grantType !== 'authorization_code') {
      return NextResponse.json(
        {
          error: 'unsupported_grant_type',
          error_description: 'Chỉ hỗ trợ grant_type="authorization_code"',
        },
        { status: 400 },
      );
    }

    if (!code) {
      return NextResponse.json(
        {
          error: 'invalid_request',
          error_description: 'Thiếu tham số code',
        },
        { status: 400 },
      );
    }

    // Tiêu thụ mã authorization code (single-use)
    const authData = await consumeAuthCode(code);
    if (!authData) {
      return NextResponse.json(
        {
          error: 'invalid_grant',
          error_description: 'Mã ủy quyền không hợp lệ hoặc đã hết hạn',
        },
        { status: 400 },
      );
    }

    // Kiểm tra redirect_uri khớp với lúc đăng ký
    if (redirectUri && authData.redirectUri && redirectUri !== authData.redirectUri) {
      return NextResponse.json(
        {
          error: 'invalid_grant',
          error_description: 'redirect_uri không khớp với lúc ủy quyền',
        },
        { status: 400 },
      );
    }

    // Kiểm tra PKCE (Proof Key for Code Exchange)
    if (authData.codeChallenge) {
      if (!codeVerifier) {
        return NextResponse.json(
          {
            error: 'invalid_grant',
            error_description: 'Thiếu code_verifier cho PKCE',
          },
          { status: 400 },
        );
      }

      const isValidPkce = verifyPkce(codeVerifier, authData.codeChallenge, authData.codeChallengeMethod);
      if (!isValidPkce) {
        return NextResponse.json(
          {
            error: 'invalid_grant',
            error_description: 'PKCE code_verifier không hợp lệ',
          },
          { status: 400 },
        );
      }
    }

    const user = await prisma.user.findUnique({
      where: { id: authData.userId },
      select: { isActive: true, passwordHash: true, lockedUntil: true, employee: { select: { status: true } } },
    });
    if (!user || !user.isActive || user.employee.status === 'RESIGNED' || (user.lockedUntil && user.lockedUntil > new Date())) {
      return NextResponse.json(
        { error: 'invalid_grant', error_description: 'Tài khoản người dùng đã bị khóa hoặc vô hiệu hóa' },
        { status: 400 },
      );
    }

    // Phát hành Access Token (30 ngày) gắn phiên bản mật khẩu để tự thu hồi khi đổi/reset mật khẩu
    const credentialVersion = sha256(user.passwordHash).slice(0, 16);
    const accessToken = issueOAuthToken(authData.userId, authData.clientId, authData.scope, credentialVersion);

    return NextResponse.json(
      {
        access_token: accessToken,
        token_type: 'Bearer',
        expires_in: 2592000, // 30 ngày tính bằng giây
        scope: authData.scope || 'mcp',
      },
      {
        headers: {
          'Access-Control-Allow-Origin': '*',
          'Content-Type': 'application/json',
          'Cache-Control': 'no-store',
          Pragma: 'no-cache',
        },
      },
    );
  } catch (err: any) {
    return NextResponse.json(
      {
        error: 'server_error',
        error_description: err?.message || 'Lỗi xử lý đổi token',
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
