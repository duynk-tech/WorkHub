import { notFound } from 'next/navigation';
import { requireAuth, can } from '@/server/auth/context';
import { prisma } from '@/lib/prisma';
import { MCP_TOOLS } from '@/server/mcp/tools';
import { getSettings } from '@/server/modules/settings/service';
import { getCustomTools } from '@/server/modules/zalo/custom-tools';
import { getDisabledMcpModules } from '@/server/mcp/module-config';
import { IntegrationScreen } from './integration-screen';

export const metadata = { title: 'Tích hợp & MCP' };
export const dynamic = 'force-dynamic';

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireAuth();
  const canMcp = can(ctx, 'FEATURE_MCP_MANAGE');
  const canZalo = can(ctx, 'FEATURE_SETTING_ZALO');
  if (!canMcp && !canZalo) notFound();
  const sp = searchParams ? await searchParams : {};
  const initialTab = sp.tab ?? 'mcp';
  const initialModal = sp.modal ?? '';
  const initialSubtab = sp.subtab ?? '';

  const [clients, webhooks, users, recentCalls, settings, customTools, zaloLogs, disabledModules] = await Promise.all([
    canMcp ? prisma.mcpClient.findMany({
      orderBy: { createdAt: 'desc' },
      include: { actAsUser: { select: { username: true, employee: { select: { fullName: true } } } } },
    }) : [],
    canMcp ? prisma.outboundWebhook.findMany({ orderBy: { createdAt: 'desc' } }).then((rows) => rows.map((row) => ({ ...row, secret: row.secret ? '********' : null }))) : [],
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { username: 'asc' },
      select: { id: true, username: true, employeeId: true, employee: { select: { fullName: true } } },
    }),
    canMcp ? prisma.mcpCallLog.findMany({
      orderBy: { createdAt: 'desc' }, take: 30,
      include: { client: { select: { name: true } } },
    }) : [],
    canZalo ? Promise.all([getSettings('zalo'), getSettings('ai')]).then(([zalo, ai]) => ({ ...zalo, ...ai })) : {},
    ctx.isAdmin ? getCustomTools() : [],
    ctx.isAdmin ? prisma.zaloInboundLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    }) : [],
    getDisabledMcpModules(),
  ]);

  return (
    <IntegrationScreen
      initialTab={initialTab}
      initialModal={initialModal}
      initialSubtab={initialSubtab}
      clients={JSON.parse(JSON.stringify(clients))}
      webhooks={JSON.parse(JSON.stringify(webhooks))}
      users={users.map((u) => ({ id: u.id, employeeId: u.employeeId, username: u.username, fullName: u.employee.fullName }))}
      tools={MCP_TOOLS.map((t) => ({
        name: t.name, module: t.module, title: t.title,
        description: t.description, mutating: Boolean(t.mutating),
      }))}
      disabledModules={disabledModules}
      recentCalls={JSON.parse(JSON.stringify(recentCalls))}
      zaloLogs={JSON.parse(JSON.stringify(zaloLogs))}
      mcpUrl={`${process.env.APP_URL || 'http://localhost:3000'}/api/mcp`}
      zaloWebhookUrl={`${process.env.APP_URL || 'http://localhost:3000'}/api/zalo`}
      settings={settings}
      customTools={customTools}
      canManage={can(ctx, 'FEATURE_MCP_MANAGE')}
      canManageZalo={can(ctx, 'FEATURE_SETTING_ZALO')}
    />
  );
}

