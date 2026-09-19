'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requirePermission } from '@/server/auth/context';
import { generateApiKey, hmacSha256 } from '@/lib/crypto';

export interface Result { ok: boolean; message: string }

export async function createMcpClientAction(data: {
  name: string; actAsUserId: number; readOnly: boolean;
  scopes: string[]; rateLimitPerMin: number; allowedIps: string; expiresAt: string | null;
}): Promise<Result & { apiKey?: string }> {
  const ctx = await requirePermission('FEATURE_MCP_MANAGE');
  if (!data.name.trim()) return { ok: false, message: 'Nhập tên client' };

  const { key, prefix, hash } = generateApiKey();
  const client = await prisma.mcpClient.create({
    data: {
      name: data.name.trim(),
      keyPrefix: prefix,
      keyHash: hash,
      scopesJson: data.scopes as never,
      actAsUserId: data.actAsUserId,
      readOnly: data.readOnly,
      rateLimitPerMin: data.rateLimitPerMin,
      allowedIps: data.allowedIps.trim() || null,
      expiresAt: data.expiresAt ? new Date(data.expiresAt) : null,
    },
  });

  await prisma.auditLog.create({
    data: {
      actorId: ctx.userId, entityType: 'McpClient', entityId: String(client.id), action: 'CREATE',
      diffJson: { name: data.name, readOnly: data.readOnly, actAsUserId: data.actAsUserId } as never,
    },
  });

  revalidatePath('/settings/integrations');
  return { ok: true, message: 'Đã tạo MCP client — hãy sao chép API key ngay, khóa chỉ hiện một lần', apiKey: key };
}

export async function toggleMcpClientAction(id: number, isActive: boolean): Promise<Result> {
  const ctx = await requirePermission('FEATURE_MCP_MANAGE');
  await prisma.mcpClient.update({ where: { id }, data: { isActive } });
  await prisma.auditLog.create({
    data: { actorId: ctx.userId, entityType: 'McpClient', entityId: String(id), action: isActive ? 'ENABLE' : 'DISABLE' },
  });
  revalidatePath('/settings/integrations');
  return { ok: true, message: isActive ? 'Đã kích hoạt client' : 'Đã thu hồi quyền truy cập của client' };
}

export async function deleteMcpClientAction(id: number): Promise<Result> {
  const ctx = await requirePermission('FEATURE_MCP_MANAGE');
  await prisma.mcpClient.delete({ where: { id } });
  await prisma.auditLog.create({
    data: { actorId: ctx.userId, entityType: 'McpClient', entityId: String(id), action: 'DELETE' },
  });
  revalidatePath('/settings/integrations');
  return { ok: true, message: 'Đã xóa MCP client' };
}

export async function saveWebhookAction(id: number | null, data: {
  name: string; url: string; events: string[]; secret: string; isActive: boolean;
}): Promise<Result> {
  await requirePermission('FEATURE_MCP_MANAGE');
  if (!/^https?:\/\//.test(data.url)) return { ok: false, message: 'URL webhook phải bắt đầu bằng http:// hoặc https://' };

  const payload = {
    name: data.name, url: data.url, events: data.events.join(','),
    secret: data.secret || null, isActive: data.isActive,
  };

  if (id) await prisma.outboundWebhook.update({ where: { id }, data: payload });
  else await prisma.outboundWebhook.create({ data: payload });

  revalidatePath('/settings/integrations');
  return { ok: true, message: 'Đã lưu webhook' };
}

export async function deleteWebhookAction(id: number): Promise<Result> {
  await requirePermission('FEATURE_MCP_MANAGE');
  await prisma.outboundWebhook.delete({ where: { id } });
  revalidatePath('/settings/integrations');
  return { ok: true, message: 'Đã xóa webhook' };
}

export async function testWebhookAction(id: number): Promise<Result> {
  await requirePermission('FEATURE_MCP_MANAGE');
  const webhook = await prisma.outboundWebhook.findUnique({ where: { id } });
  if (!webhook) return { ok: false, message: 'Không tìm thấy webhook' };

  const body = JSON.stringify({
    event: 'test',
    sentAt: new Date().toISOString(),
    data: { message: 'Đây là sự kiện thử từ WorkHub' },
  });

  try {
    const res = await fetch(webhook.url, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-WorkHub-Event': 'test',
        ...(webhook.secret ? { 'X-WorkHub-Signature': hmacSha256(webhook.secret, body) } : {}),
      },
      body,
      signal: AbortSignal.timeout(10000),
    });

    await prisma.outboundWebhook.update({
      where: { id }, data: { lastStatus: res.status, lastCalledAt: new Date() },
    });

    revalidatePath('/settings/integrations');
    return res.ok
      ? { ok: true, message: `Gửi thành công (HTTP ${res.status})` }
      : { ok: false, message: `Endpoint trả về HTTP ${res.status}` };
  } catch (e) {
    return { ok: false, message: `Không gọi được endpoint: ${e instanceof Error ? e.message : 'lỗi mạng'}` };
  }
}
