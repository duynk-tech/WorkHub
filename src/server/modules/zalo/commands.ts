import { prisma } from '@/lib/prisma';
import { fmtDate, fmtDateTime, dateOnly } from '@/lib/date';
import { formatDays } from '@/lib/utils';
import { TASK_STATUS, LEAVE_STATUS } from '@/lib/enums';
import { consumeLinkCode, findEmployeeByZaloId } from './link';
import { performCheckIn, performCheckOut } from '@/server/modules/attendance/service';
import { getOrCreateBalance, remainingDays } from '@/server/modules/leave/service';
import { actOnApproval } from '@/server/modules/workflow/engine';
import { handleZaloAiQuery } from './ai-agent';

const APP_URL = process.env.APP_URL || 'http://localhost:3000';

const HELP_TEXT = `🤖 Các lệnh khả dụng:

/lienket <mã>  — Liên kết tài khoản (lấy mã trong Hồ sơ cá nhân trên web)
/viec          — Danh sách công việc đang mở của bạn
/xong <mã>     — Đánh dấu hoàn thành công việc, vd: /xong TSK-2026-0001
/nghi          — Xem quỹ phép còn lại
/donnghi       — Các đơn nghỉ gần đây của bạn
/duyet         — Danh sách đơn đang chờ bạn duyệt
/duyet <mã> ok [ghi chú]    — Duyệt đơn
/duyet <mã> no <lý do>      — Từ chối đơn
/checkin       — Chấm công vào
/checkout      — Chấm công ra
/help          — Xem lại danh sách lệnh`;

export interface CommandResult {
  reply: string;
  handled: boolean;
}

/**
 * Bộ định tuyến lệnh chat Zalo.
 * Mọi lệnh đều đi qua đúng tầng nghiệp vụ như trên web — không có đường tắt bỏ qua phân quyền.
 */
export async function handleZaloCommand(zaloUserId: string, text: string): Promise<CommandResult> {
  const raw = text.trim();
  const [cmdRaw, ...args] = raw.split(/\s+/);
  const cmd = cmdRaw.toLowerCase().replace(/^\//, '');

  // Lệnh liên kết không cần tài khoản đã gắn
  if (cmd === 'lienket' || cmd === 'link') {
    if (!args[0]) return { handled: true, reply: 'Cú pháp: /lienket <mã 6 ký tự>\nLấy mã tại mục Hồ sơ cá nhân trên web.' };
    const result = await consumeLinkCode(args[0], zaloUserId);
    return {
      handled: true,
      reply: result.ok
        ? `🎉 ${result.message}\n\nGõ /help để xem các lệnh khả dụng.`
        : `❌ ${result.message}`,
    };
  }

  const employee = await findEmployeeByZaloId(zaloUserId);
  if (!employee) {
    return {
      handled: true,
      reply: '👋 Xin chào! Tài khoản Zalo của bạn chưa được liên kết.\n\nHãy đăng nhập web, vào Hồ sơ cá nhân để lấy mã, rồi nhắn:\n/lienket <mã>',
    };
  }

  const permissions = new Set(
    employee.user?.roles.flatMap((r) => r.role.permissions.map((p) => p.permissionCode)) ?? [],
  );
  const isAdmin = employee.user?.roles.some((r) => r.role.code === 'ADMIN') ?? false;
  const can = (code: string) => isAdmin || permissions.has(code);

  switch (cmd) {
    case 'help':
    case 'start':
      return { handled: true, reply: HELP_TEXT };

    case 'viec':
    case 'task': {
      const tasks = await prisma.task.findMany({
        where: { assigneeId: employee.id, status: { in: ['TODO', 'IN_PROGRESS', 'REVIEW'] } },
        orderBy: [{ dueDate: 'asc' }],
        take: 10,
      });
      if (tasks.length === 0) return { handled: true, reply: '🎉 Bạn không còn công việc nào đang mở.' };

      const lines = tasks.map((t) => {
        const overdue = t.dueDate && t.dueDate < new Date();
        return `${overdue ? '🔴' : '•'} [${t.code}] ${t.title}\n   ${TASK_STATUS[t.status]?.label} · ${t.progress}% · hạn ${t.dueDate ? fmtDate(t.dueDate) : 'chưa đặt'}`;
      });
      return { handled: true, reply: `📋 Công việc đang mở (${tasks.length}):\n\n${lines.join('\n')}\n\nXem đầy đủ: ${APP_URL}/tasks` };
    }

    case 'xong':
    case 'done': {
      if (!args[0]) return { handled: true, reply: 'Cú pháp: /xong <mã công việc>, vd: /xong TSK-2026-0001' };
      const task = await prisma.task.findUnique({ where: { code: args[0].toUpperCase() } });
      if (!task) return { handled: true, reply: `❌ Không tìm thấy công việc ${args[0]}` };
      if (task.assigneeId !== employee.id && task.creatorId !== employee.id) {
        return { handled: true, reply: '❌ Bạn không phải người thực hiện hoặc người tạo công việc này.' };
      }
      await prisma.task.update({
        where: { id: task.id },
        data: { status: 'DONE', progress: 100, completedAt: new Date() },
      });
      await prisma.taskActivity.create({
        data: { taskId: task.id, actorId: employee.id, action: 'STATUS', field: 'status', oldValue: TASK_STATUS[task.status]?.label, newValue: 'Hoàn thành' },
      });
      return { handled: true, reply: `✅ Đã đánh dấu hoàn thành [${task.code}] ${task.title}` };
    }

    case 'nghi':
    case 'phep': {
      const year = new Date().getFullYear();
      const balance = await getOrCreateBalance(employee.id, year);
      return {
        handled: true,
        reply: `🗓 Quỹ phép năm ${year} của ${employee.fullName}:\n\n` +
          `• Phép chuẩn: ${formatDays(balance.standardDays)} ngày\n` +
          `• Thưởng thêm: ${formatDays(balance.bonusDays)} ngày\n` +
          `• Chuyển tiếp: ${formatDays(balance.carriedOverDays)} ngày\n` +
          `• Đã dùng: ${formatDays(balance.usedDays)} ngày\n` +
          `• Đang chờ duyệt: ${formatDays(balance.pendingDays)} ngày\n\n` +
          `✅ Còn lại: ${formatDays(remainingDays(balance))} ngày\n\n` +
          `Tạo đơn mới: ${APP_URL}/leaves`,
      };
    }

    case 'donnghi': {
      const requests = await prisma.leaveRequest.findMany({
        where: { employeeId: employee.id },
        orderBy: { createdAt: 'desc' },
        take: 5,
        include: { leaveType: { select: { name: true } } },
      });
      if (requests.length === 0) return { handled: true, reply: 'Bạn chưa có đơn nghỉ phép nào.' };
      const lines = requests.map((r) =>
        `• [${r.code}] ${r.leaveType.name}\n   ${fmtDate(r.startDate)} → ${fmtDate(r.endDate)} · ${formatDays(r.totalDays)} ngày · ${LEAVE_STATUS[r.status]?.label}`);
      return { handled: true, reply: `📄 Đơn nghỉ gần đây:\n\n${lines.join('\n')}` };
    }

    case 'duyet': {
      if (!can('FEATURE_LEAVE_APPROVE')) {
        return { handled: true, reply: '❌ Bạn không có quyền duyệt đơn nghỉ phép.' };
      }

      // /duyet — liệt kê đơn chờ
      if (args.length === 0) {
        const tasks = await prisma.approvalTask.findMany({
          where: { approverId: employee.id, status: 'PENDING', instance: { status: 'RUNNING' } },
          include: { instance: true, step: { select: { name: true } } },
          take: 10,
        });
        if (tasks.length === 0) return { handled: true, reply: '✅ Không có đơn nào chờ bạn duyệt.' };

        const leaveIds = tasks.filter((t) => t.instance.entityType === 'LEAVE').map((t) => t.instance.entityId);
        const leaves = await prisma.leaveRequest.findMany({
          where: { id: { in: leaveIds } },
          include: { employee: { select: { fullName: true } }, leaveType: { select: { name: true } } },
        });
        const byId = new Map(leaves.map((l) => [l.id, l]));

        const lines = tasks.map((t) => {
          const l = byId.get(t.instance.entityId);
          if (!l) return null;
          return `• [${l.code}] ${l.employee.fullName}\n   ${l.leaveType.name} · ${fmtDate(l.startDate)} → ${fmtDate(l.endDate)} · ${formatDays(l.totalDays)} ngày\n   Lý do: ${l.reason}`;
        }).filter(Boolean);

        return {
          handled: true,
          reply: `⏳ ${lines.length} đơn chờ bạn duyệt:\n\n${lines.join('\n\n')}\n\n` +
            `Duyệt: /duyet <mã> ok\nTừ chối: /duyet <mã> no <lý do>\nHoặc mở web: ${APP_URL}/approvals`,
        };
      }

      // /duyet <mã> ok|no [ghi chú]
      const code = args[0].toUpperCase();
      const decisionWord = (args[1] ?? '').toLowerCase();
      const note = args.slice(2).join(' ');

      if (!['ok', 'yes', 'duyet', 'no', 'khong', 'tuchoi'].includes(decisionWord)) {
        return { handled: true, reply: 'Cú pháp: /duyet <mã> ok  hoặc  /duyet <mã> no <lý do>' };
      }
      const decision = ['ok', 'yes', 'duyet'].includes(decisionWord) ? 'APPROVE' : 'REJECT';
      if (decision === 'REJECT' && !note.trim()) {
        return { handled: true, reply: '❌ Từ chối đơn cần kèm lý do: /duyet <mã> no <lý do>' };
      }

      const leave = await prisma.leaveRequest.findUnique({ where: { code }, include: { leaveType: true } });
      if (!leave) return { handled: true, reply: `❌ Không tìm thấy đơn ${code}` };
      if (!leave.workflowInstanceId) return { handled: true, reply: `❌ Đơn ${code} chưa vào quy trình duyệt` };

      const approvalTask = await prisma.approvalTask.findFirst({
        where: { instanceId: leave.workflowInstanceId, approverId: employee.id, status: 'PENDING' },
      });
      if (!approvalTask) return { handled: true, reply: `❌ Đơn ${code} hiện không chờ bạn duyệt` };

      const result = await actOnApproval({
        approvalTaskId: approvalTask.id, actorEmployeeId: employee.id,
        decision, comment: note || undefined,
      });
      if (!result.ok) return { handled: true, reply: `❌ ${result.message}` };

      const { finalizeLeave, notifyPendingApprovers } = await import('@/server/modules/leave/actions');
      if (result.instanceStatus === 'APPROVED') await finalizeLeave(leave.id, 'APPROVED', employee.fullName);
      else if (result.instanceStatus === 'REJECTED') await finalizeLeave(leave.id, 'REJECTED', note || employee.fullName);
      else await notifyPendingApprovers(leave.id);

      return {
        handled: true,
        reply: `${decision === 'APPROVE' ? '✅' : '❌'} ${result.message}\nĐơn ${code} — ${fmtDate(leave.startDate)} → ${fmtDate(leave.endDate)}`,
      };
    }

    case 'checkin': {
      if (!can('FEATURE_ATTENDANCE_CHECKIN')) return { handled: true, reply: '❌ Bạn không có quyền chấm công.' };
      const result = await performCheckIn({ employeeId: employee.id, source: 'ZALO' });
      if (!result.ok) return { handled: true, reply: `⚠️ ${result.message}` };
      const time = fmtDateTime(result.record.checkInAt);
      return {
        handled: true,
        reply: `🟢 Đã check-in lúc ${time}` + (result.lateMinutes > 0 ? `\n⚠️ Đi muộn ${result.lateMinutes} phút` : '\n✅ Đúng giờ'),
      };
    }

    case 'checkout': {
      if (!can('FEATURE_ATTENDANCE_CHECKIN')) return { handled: true, reply: '❌ Bạn không có quyền chấm công.' };
      const result = await performCheckOut({ employeeId: employee.id, source: 'ZALO' });
      if (!result.ok) return { handled: true, reply: `⚠️ ${result.message}` };
      const hours = Math.floor((result.workedMinutes ?? 0) / 60);
      const mins = (result.workedMinutes ?? 0) % 60;
      return { handled: true, reply: `🔴 Đã check-out lúc ${fmtDateTime(result.record.checkOutAt)}\n⏱ Thời gian làm việc: ${hours} giờ ${mins} phút` };
    }

    case 'baocao': {
      const today = dateOnly(new Date());
      const [openTasks, overdue, pendingApprovals, onLeave] = await Promise.all([
        prisma.task.count({ where: { assigneeId: employee.id, status: { in: ['TODO', 'IN_PROGRESS', 'REVIEW'] } } }),
        prisma.task.count({ where: { assigneeId: employee.id, status: { in: ['TODO', 'IN_PROGRESS', 'REVIEW'] }, dueDate: { lt: new Date() } } }),
        prisma.approvalTask.count({ where: { approverId: employee.id, status: 'PENDING' } }),
        prisma.leaveRequestDay.count({ where: { date: today, request: { status: 'APPROVED' } } }),
      ]);
      return {
        handled: true,
        reply: `📊 Tổng quan hôm nay ${fmtDate(new Date())}\n\n` +
          `📋 Việc đang mở: ${openTasks}\n🔴 Việc quá hạn: ${overdue}\n` +
          `⏳ Đơn chờ bạn duyệt: ${pendingApprovals}\n🏖 Nhân sự nghỉ hôm nay: ${onLeave}\n\n` +
          `Mở hệ thống: ${APP_URL}/dashboard`,
      };
    }

    default: {
      try {
        const aiReply = await handleZaloAiQuery(employee.id, raw);
        return { handled: true, reply: aiReply };
      } catch {
        return {
          handled: false,
          reply: `Không hiểu lệnh "${raw.slice(0, 40)}".\n\n${HELP_TEXT}`,
        };
      }
    }
  }
}
