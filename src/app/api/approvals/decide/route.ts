import { NextResponse, type NextRequest } from 'next/server';
import { getAuthContext } from '@/server/auth/context';
import { prisma } from '@/lib/prisma';
import { verifyActionToken } from '@/server/lib/action-token';
import { approveLeaveAs } from '@/server/modules/leave/internal-actions';

export const dynamic = 'force-dynamic';

/**
 * Nút "Duyệt" trên thông báo đẩy gọi vào đây (service worker gửi kèm cookie phiên).
 * Cần cả hai: token hợp lệ do hệ thống ký VÀ người đang đăng nhập là người duyệt của phiên đó.
 * Từ chối cần lý do nên không cho làm từ thông báo — mở đơn để từ chối.
 */
export async function POST(req: NextRequest) {
  const ctx = await getAuthContext();
  if (!ctx) return NextResponse.json({ ok: false, message: 'Phiên đăng nhập đã hết — mở ứng dụng để duyệt' }, { status: 401 });

  const body = (await req.json().catch(() => ({}))) as { decision?: string; token?: string };
  if (body.decision !== 'APPROVE') return NextResponse.json({ ok: false, message: 'Mở đơn để xử lý' }, { status: 400 });
  const verified = body.token ? await verifyActionToken(body.token, 'workflow') : null;
  if (!verified) return NextResponse.json({ ok: false, message: 'Liên kết duyệt đã hết hạn' }, { status: 400 });

  const task = await prisma.approvalTask.findFirst({
    where: { instanceId: verified.id, approverId: ctx.employeeId, status: 'PENDING' },
    select: { id: true, instance: { select: { entityType: true } } },
  });
  if (!task) return NextResponse.json({ ok: false, message: 'Đơn đã được xử lý hoặc không còn chờ bạn duyệt' });
  if (task.instance.entityType !== 'LEAVE') return NextResponse.json({ ok: false, message: 'Mở ứng dụng để duyệt loại chứng từ này' });

  const r = await approveLeaveAs(ctx, task.id, 'APPROVE');
  return NextResponse.json(r);
}
