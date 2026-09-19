import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { generateApiKey } from '../src/lib/crypto';

const prisma = new PrismaClient();
const BASE = process.env.APP_URL || 'http://localhost:3000';

async function rpc(key: string, method: string, params?: unknown, id = 1) {
  const res = await fetch(`${BASE}/api/mcp`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
    body: JSON.stringify({ jsonrpc: '2.0', id, method, params }),
  });
  return { status: res.status, body: await res.json().catch(() => null) };
}

async function main() {
  const admin = await prisma.user.findFirst({ where: { roles: { some: { role: { code: 'ADMIN' } } } } });
  if (!admin) throw new Error('Chưa có tài khoản ADMIN');

  await prisma.mcpClient.deleteMany({ where: { name: 'Test Client' } });
  const { key, prefix, hash } = generateApiKey();
  await prisma.mcpClient.create({
    data: { name: 'Test Client', keyPrefix: prefix, keyHash: hash, scopesJson: [], actAsUserId: admin.id, readOnly: false },
  });
  console.log(`API key tạm: ${prefix}.••••\n`);

  console.log('1) Không có key →', (await (await fetch(`${BASE}/api/mcp`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{}' })).json()).error?.message);

  const init = await rpc(key, 'initialize', { protocolVersion: '2025-06-18', capabilities: {}, clientInfo: { name: 'test', version: '1' } });
  console.log('2) initialize →', init.body.result?.serverInfo?.name, '| protocol', init.body.result?.protocolVersion);

  const list = await rpc(key, 'tools/list');
  console.log(`3) tools/list → ${list.body.result?.tools?.length} công cụ:`, list.body.result?.tools?.map((t: any) => t.name).join(', '));

  const who = await rpc(key, 'tools/call', { name: 'who_is_on_leave', arguments: {} });
  console.log('4) who_is_on_leave →', JSON.stringify(who.body.result?.structuredContent));

  const tasks = await rpc(key, 'tools/call', { name: 'list_tasks', arguments: { overdue: true, limit: 3 } });
  const t = tasks.body.result?.structuredContent;
  console.log(`5) list_tasks(overdue) → tổng ${t?.total}:`, t?.tasks?.map((x: any) => `${x.code} ${x.title}`).join(' | '));

  const day = await rpc(key, 'tools/call', { name: 'my_day', arguments: {} });
  console.log('6) my_day →', JSON.stringify(day.body.result?.structuredContent));

  const dept = await rpc(key, 'tools/call', { name: 'get_department_tree', arguments: {} });
  console.log(`7) get_department_tree → ${dept.body.result?.structuredContent?.length} đơn vị`);

  const created = await rpc(key, 'tools/call', { name: 'create_task', arguments: { title: 'Việc tạo từ MCP (kiểm thử)', assigneeCode: 'NV005', priority: 'HIGH' } });
  console.log('8) create_task →', created.body.result?.structuredContent?.message ?? created.body.result?.content?.[0]?.text);

  const balance = await rpc(key, 'tools/call', { name: 'get_leave_balance', arguments: { employeeCode: 'NV005' } });
  console.log('9) get_leave_balance(NV005) →', JSON.stringify(balance.body.result?.structuredContent));

  // Kiểm tra chế độ chỉ đọc chặn công cụ ghi
  await prisma.mcpClient.update({ where: { keyPrefix: prefix }, data: { readOnly: true } });
  const denied = await rpc(key, 'tools/call', { name: 'create_task', arguments: { title: 'Không được phép' } });
  console.log('10) readOnly chặn create_task →', denied.body.result?.content?.[0]?.text);

  const badTool = await rpc(key, 'tools/call', { name: 'khong_ton_tai', arguments: {} });
  console.log('11) công cụ không tồn tại →', badTool.body.result?.content?.[0]?.text);

  // dọn dẹp
  await prisma.task.deleteMany({ where: { title: 'Việc tạo từ MCP (kiểm thử)' } });
  await prisma.mcpClient.deleteMany({ where: { keyPrefix: prefix } });
  console.log('\n✅ Đã dọn dữ liệu kiểm thử');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
