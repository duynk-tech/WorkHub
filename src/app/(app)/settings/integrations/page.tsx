import { requireAuth, can } from '@/server/auth/context';
import { prisma } from '@/lib/prisma';
import { MCP_TOOLS } from '@/server/mcp/tools';
import { getSettings } from '@/server/modules/settings/service';
import { getCustomTools } from '@/server/modules/zalo/custom-tools';
import { IntegrationScreen } from './integration-screen';

export const metadata = { title: 'Tích hợp & MCP' };
export const dynamic = 'force-dynamic';

export default async function IntegrationsPage({
  searchParams,
}: {
  searchParams?: Promise<Record<string, string | undefined>>;
}) {
  const ctx = await requireAuth();
  const sp = searchParams ? await searchParams : {};
  const initialTab = sp.tab ?? 'mcp';
  const initialModal = sp.modal ?? '';
  const initialSubtab = sp.subtab ?? '';

  const [clients, webhooks, users, recentCalls, settings, customTools, zaloLogs] = await Promise.all([
    prisma.mcpClient.findMany({
      orderBy: { createdAt: 'desc' },
      include: { actAsUser: { select: { username: true, employee: { select: { fullName: true } } } } },
    }),
    prisma.outboundWebhook.findMany({ orderBy: { createdAt: 'desc' } }),
    prisma.user.findMany({
      where: { isActive: true },
      orderBy: { username: 'asc' },
      select: { id: true, username: true, employeeId: true, employee: { select: { fullName: true } } },
    }),
    prisma.mcpCallLog.findMany({
      orderBy: { createdAt: 'desc' }, take: 30,
      include: { client: { select: { name: true } } },
    }),
    getSettings(),
    getCustomTools(),
    prisma.zaloInboundLog.findMany({
      orderBy: { createdAt: 'desc' },
      take: 100,
    }),
  ]);

  return (
    <IntegrationScreen
      initialTab={initialTab}
      initialModal={initialModal}
      initialSubtab={initialSubtab}
      clients={JSON.parse(JSON.stringify(clients))}
      webhooks={JSON.parse(JSON.stringify(webhooks))}
      users={users.map((u) => ({ id: u.id, employeeId: u.employeeId, username: u.username, fullName: u.employee.fullName }))}
      tools={MCP_TOOLS.map((t) => ({ name: t.name, title: t.title, description: t.description, mutating: Boolean(t.mutating) }))}
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

