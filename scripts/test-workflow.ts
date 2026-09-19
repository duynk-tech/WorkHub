import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { startWorkflow, actOnApproval, simulateWorkflow } from '../src/server/modules/workflow/engine';

const prisma = new PrismaClient();

async function main() {
  const tung = await prisma.employee.findUnique({ where: { code: 'NV005' }, include: { manager: true, department: true } });
  if (!tung) throw new Error('Không tìm thấy NV005');
  console.log(`Người nộp: ${tung.fullName} — QL trực tiếp: ${tung.manager?.fullName} — Phòng: ${tung.department?.name}`);

  const def = await prisma.workflowDefinition.findUnique({ where: { code: 'LEAVE_DEFAULT' } });
  const annual = await prisma.leaveType.findUnique({ where: { code: 'ANNUAL' } });

  console.log('\n=== MÔ PHỎNG: đơn 2 ngày ===');
  for (const s of await simulateWorkflow(def!.id, tung.id, { totalDays: 2, leaveTypeCode: 'ANNUAL', departmentId: tung.departmentId })) {
    console.log(`  B${s.stepOrder} ${s.name} [${s.approverTypeLabel}] → ${s.willRun ? s.approvers.map(a => a.fullName).join(', ') : 'BỎ QUA: ' + s.skipReason}`);
  }

  console.log('\n=== MÔ PHỎNG: đơn 5 ngày (phải có bước Giám đốc) ===');
  for (const s of await simulateWorkflow(def!.id, tung.id, { totalDays: 5, leaveTypeCode: 'ANNUAL', departmentId: tung.departmentId })) {
    console.log(`  B${s.stepOrder} ${s.name} [${s.approverTypeLabel}] → ${s.willRun ? s.approvers.map(a => a.fullName).join(', ') : 'BỎ QUA: ' + s.skipReason}`);
  }

  console.log('\n=== CHẠY THẬT: tạo đơn 5 ngày rồi duyệt hết các bước ===');
  await prisma.leaveRequest.deleteMany({ where: { code: 'LR-TEST-0001' } });
  const req = await prisma.leaveRequest.create({
    data: {
      code: 'LR-TEST-0001', employeeId: tung.id, leaveTypeId: annual!.id,
      startDate: new Date(Date.UTC(2026, 10, 2)), endDate: new Date(Date.UTC(2026, 10, 6)),
      totalDays: 5, reason: 'Kiểm thử quy trình', status: 'PENDING', submittedAt: new Date(),
    },
  });

  const instance = await startWorkflow({
    entityType: 'LEAVE', entityId: req.id, requesterId: tung.id, definitionId: annual!.workflowDefinitionId,
    context: { totalDays: 5, leaveTypeCode: 'ANNUAL', departmentId: tung.departmentId, isPaid: true },
  });
  await prisma.leaveRequest.update({ where: { id: req.id }, data: { workflowInstanceId: instance.id } });
  console.log(`  Instance #${instance.id} — bước hiện tại: ${instance.currentStepOrder}`);

  let guard = 0;
  while (guard++ < 6) {
    const tasks = await prisma.approvalTask.findMany({
      where: { instanceId: instance.id, status: 'PENDING' },
      include: { approver: { select: { fullName: true } }, step: { select: { name: true, mode: true } } },
    });
    if (tasks.length === 0) break;
    const t = tasks[0];
    console.log(`  → ${t.approver.fullName} duyệt bước "${t.step.name}" (${tasks.length} phiếu chờ, chế độ ${t.step.mode})`);
    const res = await actOnApproval({ approvalTaskId: t.id, actorEmployeeId: t.approverId, decision: 'APPROVE', comment: 'OK' });
    console.log(`     ${res.message} → trạng thái: ${res.instanceStatus}`);
    if (res.instanceStatus !== 'RUNNING') break;
  }

  const final = await prisma.workflowInstance.findUnique({
    where: { id: instance.id },
    include: { logs: { orderBy: { createdAt: 'asc' } } },
  });
  console.log(`\n  KẾT QUẢ: ${final?.status}`);
  console.log('  Nhật ký:');
  final?.logs.forEach(l => console.log(`    - ${l.action}${l.note ? ': ' + l.note : ''}`));

  console.log('\n=== KIỂM THỬ TỪ CHỐI ===');
  await prisma.leaveRequest.deleteMany({ where: { code: 'LR-TEST-0002' } });
  const req2 = await prisma.leaveRequest.create({
    data: {
      code: 'LR-TEST-0002', employeeId: tung.id, leaveTypeId: annual!.id,
      startDate: new Date(Date.UTC(2026, 11, 1)), endDate: new Date(Date.UTC(2026, 11, 1)),
      totalDays: 1, reason: 'Kiểm thử từ chối', status: 'PENDING', submittedAt: new Date(),
    },
  });
  const inst2 = await startWorkflow({
    entityType: 'LEAVE', entityId: req2.id, requesterId: tung.id, definitionId: annual!.workflowDefinitionId,
    context: { totalDays: 1, leaveTypeCode: 'ANNUAL', departmentId: tung.departmentId, isPaid: true },
  });
  const t2 = await prisma.approvalTask.findFirst({ where: { instanceId: inst2.id, status: 'PENDING' } });
  const rej = await actOnApproval({ approvalTaskId: t2!.id, actorEmployeeId: t2!.approverId, decision: 'REJECT', comment: 'Đang cao điểm dự án' });
  console.log(`  ${rej.message} → ${rej.instanceStatus}`);

  // dọn dữ liệu kiểm thử
  await prisma.leaveRequest.deleteMany({ where: { code: { startsWith: 'LR-TEST-' } } });
  await prisma.workflowInstance.deleteMany({ where: { id: { in: [instance.id, inst2.id] } } });
  console.log('\n✅ Đã dọn dữ liệu kiểm thử');
}

main().catch((e) => { console.error(e); process.exit(1); }).finally(() => prisma.$disconnect());
