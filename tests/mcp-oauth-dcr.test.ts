import { describe, it, expect, vi } from 'vitest';
import crypto from 'crypto';
import {
  verifyPkce,
  issueOAuthToken,
  verifyOAuthToken,
  getAppUrl,
} from '@/lib/mcp-oauth';
import { NextRequest } from 'next/server';
import { GET as getProtectedResource } from '@/app/.well-known/oauth-protected-resource/route';
import { GET as getAuthServer } from '@/app/.well-known/oauth-authorization-server/route';
import { GET as getOpenIdConfig } from '@/app/.well-known/openid-configuration/route';
import { GET as getOpenApiSpec } from '@/app/api/openapi.json/route';

describe('MCP OAuth 2.1 & RFC 7591 Dynamic Client Registration', () => {
  describe('PKCE Verification', () => {
    it('xác thực đúng với S256 code_verifier và code_challenge', () => {
      const verifier = 'dBjftJeZ4CVP-mB92K27uhbUJU1p1r_wW1gFWFOEjXk';
      const hash = crypto.createHash('sha256').update(verifier).digest('base64url');

      expect(verifyPkce(verifier, hash, 'S256')).toBe(true);
      expect(verifyPkce(verifier + 'wrong', hash, 'S256')).toBe(false);
      expect(verifyPkce(verifier, hash, 'plain')).toBe(false);
    });

    it('từ chối khi thiếu code_verifier hoặc code_challenge', () => {
      expect(verifyPkce('', 'some_challenge', 'S256')).toBe(false);
      expect(verifyPkce('verifier', '', 'S256')).toBe(false);
    });
  });

  describe('OAuth Token Issue & Verify', () => {
    it('phát hành và xác thực token mcp_tok_ thành công', () => {
      const token = issueOAuthToken(42, 'chatgpt-client-123', 'search_employees my_day');

      expect(token).toMatch(/^mcp_tok_/);

      const payload = verifyOAuthToken(token);
      expect(payload).not.toBeNull();
      expect(payload?.clientId).toBe('chatgpt-client-123');
      expect(payload?.userId).toBe(42);
      expect(payload?.scope).toBe('search_employees my_day');
    });

    it('từ chối token bị sửa đổi hoặc sai chữ ký', () => {
      const token = issueOAuthToken(1, 'test-client', 'mcp');

      const parts = token.slice('mcp_tok_'.length).split('.');
      const tamperedPayload = Buffer.from(
        JSON.stringify({ cid: 'attacker', uid: 999, exp: Date.now() + 10000 })
      ).toString('base64url');
      const tamperedToken = `mcp_tok_${tamperedPayload}.${parts[1]}`;

      expect(verifyOAuthToken(tamperedToken)).toBeNull();
      expect(verifyOAuthToken('invalid-token')).toBeNull();
    });
  });

  describe('App URL Detection', () => {
    it('nhận diện URL từ x-forwarded-host và x-forwarded-proto', () => {
      const req = new NextRequest('http://127.0.0.1:3000/api/mcp', {
        headers: {
          'x-forwarded-proto': 'https',
          'x-forwarded-host': 'workhub.example.com',
        },
      });

      expect(getAppUrl(req)).toBe('https://workhub.example.com');
    });

    it('fallback sang header host với https mặc định', () => {
      const req = new NextRequest('http://127.0.0.1:3000/api/mcp', {
        headers: {
          host: 'custom-domain.internal:8080',
        },
      });

      expect(getAppUrl(req)).toBe('https://custom-domain.internal:8080');
    });
  });

  describe('OAuth Discovery Endpoints', () => {
    it('RFC 9728: /.well-known/oauth-protected-resource trả về metadata chuẩn', async () => {
      const req = new NextRequest('https://workhub.test/api/mcp', {
        headers: { host: 'workhub.test' },
      });
      const res = await getProtectedResource(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.resource).toBe('https://workhub.test/api/mcp');
      expect(data.authorization_servers).toContain('https://workhub.test');
      expect(data.bearer_methods_supported).toContain('header');
      expect(data.scopes_supported).toBeDefined();
    });

    it('RFC 8414: /.well-known/oauth-authorization-server trả về metadata chuẩn', async () => {
      const req = new NextRequest('https://workhub.test/.well-known/oauth-authorization-server', {
        headers: { host: 'workhub.test' },
      });
      const res = await getAuthServer(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.issuer).toBe('https://workhub.test');
      expect(data.authorization_endpoint).toBe('https://workhub.test/oauth/authorize');
      expect(data.token_endpoint).toBe('https://workhub.test/api/mcp/oauth/token');
      expect(data.registration_endpoint).toBe('https://workhub.test/api/mcp/oauth/register');
      expect(data.code_challenge_methods_supported).toContain('S256');
    });

    it('OpenID Config: /.well-known/openid-configuration trỏ đúng các endpoints', async () => {
      const req = new NextRequest('https://workhub.test/.well-known/openid-configuration', {
        headers: { host: 'workhub.test' },
      });
      const res = await getOpenIdConfig(req);
      expect(res.status).toBe(200);

      const data = await res.json();
      expect(data.issuer).toBe('https://workhub.test');
      expect(data.authorization_endpoint).toBe('https://workhub.test/oauth/authorize');
      expect(data.token_endpoint).toBe('https://workhub.test/api/mcp/oauth/token');
    });
  });

  describe('OpenAPI 3.0.3 Spec for Custom GPT Actions', () => {
    it('/api/openapi.json tạo đặc tả OpenAPI 3.0 hợp lệ với danh sách công cụ WorkHub', async () => {
      const req = new NextRequest('https://workhub.test/api/openapi.json', {
        headers: { host: 'workhub.test' },
      });
      const res = await getOpenApiSpec(req);
      expect(res.status).toBe(200);

      const spec = await res.json();
      expect(spec.openapi).toBe('3.0.3');
      expect(spec.info.title).toContain('WorkHub');
      expect(spec.servers[0].url).toBe('https://workhub.test');
      expect(spec.components.securitySchemes.ApiKeyAuth).toBeDefined();
      expect(spec.components.securitySchemes.ApiKeyAuth.type).toBe('http');
      expect(spec.components.securitySchemes.ApiKeyAuth.scheme).toBe('bearer');

      // Kiểm tra có các công cụ quan trọng
      expect(spec.paths['/api/openapi/tools/search_employees']).toBeDefined();
      expect(spec.paths['/api/openapi/tools/my_day']).toBeDefined();
      expect(spec.paths['/api/openapi/tools/submit_leave_request']).toBeDefined();
      expect(spec.paths['/api/openapi/tools/create_task']).toBeDefined();

      const searchEmpPath = spec.paths['/api/openapi/tools/search_employees'].post;
      expect(searchEmpPath.operationId).toBe('search_employees');
      expect(searchEmpPath.security).toEqual([{ ApiKeyAuth: [] }]);
      expect(searchEmpPath.requestBody).toBeDefined();
    });
  });
});
