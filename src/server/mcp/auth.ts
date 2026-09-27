import { prisma } from '@/lib/prisma';
import { sha256 } from '@/lib/crypto';
import type { AuthContext } from '@/server/auth/context';
import type { DataScope } from '@prisma/client';
import { verifyOAuthToken } from '@/lib/mcp-oauth';

export interface McpIdentity {
  clientId: number;
  clientName: string;
  readOnly: boolean;
  scopes: string[];
  ctx: AuthContext;
}

const SCOPE_RANK: Record<DataScope, number> = { ALL: 4, DEPT_TREE: 3, DEPT: 2, CUSTOM: 2, SELF: 1 };

/**
 * Xác thực API key hoặc OAuth Access Token của MCP client và dựng ngữ cảnh quyền của người dùng mà client đại diện.
 * Client không bao giờ vượt quá quyền của người dùng đó.
 */
export async function authenticateMcp(authHeader: string | null, ip?: string | null): Promise<
  { ok: true; identity: McpIdentity } | { ok: false; error: string }
> {
  const key = authHeader?.replace(/^Bearer\s+/i, '').trim();
  if (!key) return { ok: false, error: 'Thiếu API key hoặc Access Token (header Authorization: Bearer <key>)' };

  // 1. Kiểm tra nếu là OAuth 2.1 Access Token phát hành cho ChatGPT / Client bên ngoài
  if (key.startsWith('mcp_tok_')) {
    const tokenData = verifyOAuthToken(key);
    if (!tokenData) {
      return { ok: false, error: 'Access token OAuth không hợp lệ hoặc đã hết hạn' };
    }

    const user = await prisma.user.findUnique({
      where: { id: tokenData.userId },
      include: {
        employee: { include: { department: { select: { id: true, name: true, path: true } }, position: { select: { name: true } } } },
        roles: { include: { role: { include: { permissions: { select: { permissionCode: true } }, deptScopes: { select: { departmentId: true } } } } } },
      },
    });

    if (!user || !user.isActive || user.employee.status === 'RESIGNED' || (user.lockedUntil && user.lockedUntil > new Date())) {
      return { ok: false, error: 'Tài khoản người dùng đã bị vô hiệu hóa' };
    }

    const permissions = new Set<string>();
    const customDeptIds = new Set<number>();
    let dataScope: DataScope = 'SELF';
    for (const { role } of user.roles) {
      role.permissions.forEach((p) => permissions.add(p.permissionCode));
      role.deptScopes.forEach((d) => customDeptIds.add(d.departmentId));
      if (SCOPE_RANK[role.dataScope] > SCOPE_RANK[dataScope]) dataScope = role.dataScope;
    }
    const roleCodes = user.roles.map((r) => r.role.code);

    const ctx: AuthContext = {
      userId: user.id,
      username: user.username,
      employeeId: user.employeeId,
      fullName: user.employee.fullName,
      email: user.employee.email,
      avatarUrl: user.employee.avatarUrl,
      departmentId: user.employee.departmentId,
      departmentName: user.employee.department?.name ?? null,
      departmentPath: user.employee.department?.path ?? null,
      positionName: user.employee.position?.name ?? null,
      managerId: user.employee.managerId,
      zaloLinked: Boolean(user.employee.zaloUserId),
      roleCodes,
      roleNames: user.roles.map((r) => r.role.name),
      permissions,
      dataScope,
      customDeptIds: Array.from(customDeptIds),
      isAdmin: roleCodes.includes('ADMIN'),
    };

    return {
      ok: true,
      identity: {
        clientId: 0,
        clientName: `ChatGPT (${tokenData.clientId})`,
        readOnly: false,
        scopes: tokenData.scope ? tokenData.scope.split(',').filter(Boolean) : [],
        ctx,
      },
    };
  }

  // 2. Xác thực Static API Key theo cơ chế hiện tại
  const prefix = key.split('.')[0];
  const client = await prisma.mcpClient.findUnique({
    where: { keyPrefix: prefix },
    include: {
      actAsUser: {
        include: {
          employee: { include: { department: { select: { id: true, name: true, path: true } }, position: { select: { name: true } } } },
          roles: { include: { role: { include: { permissions: { select: { permissionCode: true } }, deptScopes: { select: { departmentId: true } } } } } },
        },
      },
    },
  });

  if (!client) return { ok: false, error: 'API key không hợp lệ' };
  if (!client.isActive) return { ok: false, error: 'API key đã bị vô hiệu hóa' };
  if (client.expiresAt && client.expiresAt < new Date()) return { ok: false, error: 'API key đã hết hạn' };
  if (sha256(key) !== client.keyHash) return { ok: false, error: 'API key không hợp lệ' };

  if (client.allowedIps) {
    const allowed = client.allowedIps.split(',').map((s) => s.trim()).filter(Boolean);
    if (allowed.length && (!ip || !allowed.includes(ip))) return { ok: false, error: `IP ${ip} không nằm trong danh sách cho phép` };
  }

  const user = client.actAsUser;
  if (!user.isActive || user.employee.status === 'RESIGNED' || (user.lockedUntil && user.lockedUntil > new Date())) return { ok: false, error: 'Tài khoản đại diện đã bị vô hiệu hóa' };

  const permissions = new Set<string>();
  const customDeptIds = new Set<number>();
  let dataScope: DataScope = 'SELF';
  for (const { role } of user.roles) {
    role.permissions.forEach((p) => permissions.add(p.permissionCode));
    role.deptScopes.forEach((d) => customDeptIds.add(d.departmentId));
    if (SCOPE_RANK[role.dataScope] > SCOPE_RANK[dataScope]) dataScope = role.dataScope;
  }
  const roleCodes = user.roles.map((r) => r.role.code);

  const ctx: AuthContext = {
    userId: user.id,
    username: user.username,
    employeeId: user.employeeId,
    fullName: user.employee.fullName,
    email: user.employee.email,
    avatarUrl: user.employee.avatarUrl,
    departmentId: user.employee.departmentId,
    departmentName: user.employee.department?.name ?? null,
    departmentPath: user.employee.department?.path ?? null,
    positionName: user.employee.position?.name ?? null,
    managerId: user.employee.managerId,
    zaloLinked: Boolean(user.employee.zaloUserId),
    roleCodes,
    roleNames: user.roles.map((r) => r.role.name),
    permissions,
    dataScope,
    customDeptIds: Array.from(customDeptIds),
    isAdmin: roleCodes.includes('ADMIN'),
  };

  await prisma.mcpClient.update({
    where: { id: client.id },
    data: { lastUsedAt: new Date(), callCount: { increment: 1 } },
  });

  return {
    ok: true,
    identity: {
      clientId: client.id,
      clientName: client.name,
      readOnly: client.readOnly,
      scopes: (client.scopesJson as string[]) ?? [],
      ctx,
    },
  };
}

export async function logMcpCall(clientId: number, toolName: string, args: unknown, success: boolean, durationMs: number, error?: string) {
  await prisma.mcpCallLog.create({
    data: { clientId, toolName, argsJson: args as never, success, error: error?.slice(0, 500), durationMs },
  });
}
