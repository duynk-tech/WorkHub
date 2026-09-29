import type { PrismaClient } from '@prisma/client';
import { PERMISSIONS, SYSTEM_ROLES } from '../../src/lib/permissions';

export async function seedPermissions(prisma: PrismaClient) {
  for (const p of PERMISSIONS) {
    await prisma.permission.upsert({
      where: { code: p.code },
      update: { name: p.name, groupName: p.group, category: p.category, description: p.description, sortOrder: p.sortOrder },
      create: {
        code: p.code, name: p.name, groupName: p.group,
        category: p.category, description: p.description, sortOrder: p.sortOrder,
      },
    });
  }
  return PERMISSIONS.length;
}

export async function seedRoles(prisma: PrismaClient) {
  for (const r of SYSTEM_ROLES) {
    const role = await prisma.role.upsert({
      where: { code: r.code },
      update: { name: r.name, description: r.description, dataScope: r.dataScope, isSystem: true, sortOrder: r.sortOrder },
      create: { code: r.code, name: r.name, description: r.description, dataScope: r.dataScope, isSystem: true, sortOrder: r.sortOrder },
    });
    // Đồng bộ lại tập quyền của vai trò hệ thống theo danh mục code
    await prisma.rolePermission.deleteMany({ where: { roleId: role.id } });
    await prisma.rolePermission.createMany({
      data: r.permissions.map((code) => ({ roleId: role.id, permissionCode: code })),
      skipDuplicates: true,
    });
  }
  return SYSTEM_ROLES.length;
}

const POSITIONS = [
  { code: 'CEO', name: 'Tổng giám đốc', rankLevel: 100, sortOrder: 10 },
  { code: 'DEPUTY_CEO', name: 'Phó tổng giám đốc', rankLevel: 90, sortOrder: 20 },
  { code: 'DIRECTOR', name: 'Giám đốc khối', rankLevel: 80, sortOrder: 30 },
  { code: 'MANAGER', name: 'Trưởng phòng', rankLevel: 60, sortOrder: 40 },
  { code: 'DEPUTY_MANAGER', name: 'Phó phòng', rankLevel: 50, sortOrder: 50 },
  { code: 'TEAM_LEAD', name: 'Tổ trưởng / Trưởng nhóm', rankLevel: 40, sortOrder: 60 },
  { code: 'SENIOR_STAFF', name: 'Chuyên viên chính', rankLevel: 30, sortOrder: 70 },
  { code: 'STAFF', name: 'Nhân viên', rankLevel: 20, sortOrder: 80 },
  { code: 'INTERN', name: 'Thực tập sinh', rankLevel: 10, sortOrder: 90 },
];

export async function seedPositions(prisma: PrismaClient) {
  for (const p of POSITIONS) {
    await prisma.position.upsert({
      where: { code: p.code },
      update: { name: p.name, rankLevel: p.rankLevel, sortOrder: p.sortOrder },
      create: p,
    });
  }
  return POSITIONS.length;
}

export async function seedWorkShifts(prisma: PrismaClient) {
  const shifts = [
    { code: 'ADMIN', name: 'Ca hành chính (8:00–17:30)', startTime: '08:00', endTime: '17:30', breakMinutes: 90, lateToleranceMin: 5, workDays: 62, standardHours: 8 },
    { code: 'ADMIN_SAT', name: 'Hành chính + sáng T7', startTime: '08:00', endTime: '17:30', breakMinutes: 90, lateToleranceMin: 5, workDays: 126, standardHours: 8 },
    { code: 'SHIFT_MORNING', name: 'Ca sáng (6:00–14:00)', startTime: '06:00', endTime: '14:00', breakMinutes: 30, lateToleranceMin: 5, workDays: 126, standardHours: 7.5 },
    { code: 'SHIFT_AFTERNOON', name: 'Ca chiều (14:00–22:00)', startTime: '14:00', endTime: '22:00', breakMinutes: 30, lateToleranceMin: 5, workDays: 126, standardHours: 7.5 },
  ];
  for (const s of shifts) {
    await prisma.workShift.upsert({ where: { code: s.code }, update: s, create: s });
  }
  return shifts.length;
}

export async function seedLeaveTypes(prisma: PrismaClient) {
  const types = [
    { code: 'ANNUAL', name: 'Nghỉ phép năm', description: 'Phép năm theo Bộ luật Lao động (12 ngày/năm)', defaultDaysPerYear: 12, isPaid: true, deductsBalance: true, requiresAttachment: false, allowHalfDay: true, minAdvanceDays: 1, color: '#10b981', sortOrder: 10 },
    { code: 'SICK', name: 'Nghỉ ốm / Khám bệnh', description: 'Nghỉ điều trị ốm đau, cần giấy tờ y tế', defaultDaysPerYear: 30, isPaid: true, deductsBalance: false, requiresAttachment: true, allowHalfDay: true, minAdvanceDays: 0, color: '#ef4444', sortOrder: 20 },
    { code: 'UNPAID', name: 'Nghỉ không lương', description: 'Nghỉ việc riêng không hưởng lương', defaultDaysPerYear: 0, isPaid: false, deductsBalance: false, requiresAttachment: false, allowHalfDay: true, minAdvanceDays: 2, color: '#64748b', sortOrder: 30 },
    { code: 'MATERNITY', name: 'Nghỉ thai sản', description: 'Chế độ thai sản theo quy định BHXH', defaultDaysPerYear: 180, isPaid: true, deductsBalance: false, requiresAttachment: true, allowHalfDay: false, minAdvanceDays: 15, color: '#ec4899', sortOrder: 40 },
    { code: 'COMPASSIONATE', name: 'Nghỉ chế độ (hiếu hỉ)', description: 'Kết hôn, tang chế theo luật lao động', defaultDaysPerYear: 3, isPaid: true, deductsBalance: false, requiresAttachment: false, allowHalfDay: false, minAdvanceDays: 1, color: '#8b5cf6', sortOrder: 50 },
    { code: 'BUSINESS_TRIP', name: 'Công tác / Đào tạo', description: 'Đi công tác hoặc tham gia đào tạo bên ngoài', defaultDaysPerYear: 0, isPaid: true, deductsBalance: false, requiresAttachment: false, allowHalfDay: true, minAdvanceDays: 1, color: '#f59e0b', sortOrder: 60 },
    { code: 'WFH', name: 'Làm việc từ xa', description: 'Đăng ký làm việc tại nhà', defaultDaysPerYear: 0, isPaid: true, deductsBalance: false, requiresAttachment: false, allowHalfDay: true, minAdvanceDays: 1, color: '#0ea5e9', sortOrder: 70 },
  ];
  for (const t of types) {
    await prisma.leaveType.upsert({ where: { code: t.code }, update: t, create: t });
  }
  return types.length;
}

/** Ngày lễ cố định theo dương lịch. Tết âm lịch cần HR bổ sung theo từng năm. */
export async function seedHolidays(prisma: PrismaClient, year: number) {
  const fixed = [
    { month: 1, day: 1, name: 'Tết Dương lịch' },
    { month: 4, day: 30, name: 'Ngày Giải phóng miền Nam' },
    { month: 5, day: 1, name: 'Ngày Quốc tế Lao động' },
    { month: 9, day: 2, name: 'Quốc khánh' },
  ];
  let count = 0;
  for (const h of fixed) {
    const date = new Date(Date.UTC(year, h.month - 1, h.day));
    await prisma.holiday.upsert({
      where: { date },
      update: { name: h.name, year },
      create: { date, name: h.name, isPaid: true, year },
    });
    count++;
  }
  return count;
}

export async function seedSystemSettings(prisma: PrismaClient) {
  const settings: { key: string; value: unknown; group: string; isSecret?: boolean }[] = [
    { key: 'company.name', value: 'Công ty của bạn', group: 'general' },
    { key: 'company.shortName', value: 'WorkHub', group: 'general' },
    { key: 'company.address', value: '', group: 'general' },
    { key: 'company.taxCode', value: '', group: 'general' },
    {
      key: 'spare_parts_pricing_config',
      value: {
        defaultMarginPercent: 35,
        pricingMethod: 'MARGIN',
        defaultShippingFee: 3500000,
        defaultCustomsFee: 0,
        defaultExtraShippingRate: 0,
      },
      group: 'spare_parts',
    },
    { key: 'leave.annualDefaultDays', value: 12, group: 'leave' },
    { key: 'leave.allowNegativeBalance', value: false, group: 'leave' },
    { key: 'leave.carryOverExpireMonth', value: 3, group: 'leave' },
    { key: 'attendance.requireGeofence', value: false, group: 'attendance' },
    { key: 'attendance.allowZaloCheckin', value: true, group: 'attendance' },
    { key: 'attendance.autoAbsentAfterHours', value: 4, group: 'attendance' },
    { key: 'zalo.enabled', value: false, group: 'zalo' },
    { key: 'zalo.botToken', value: '', group: 'zalo', isSecret: true },
    { key: 'zalo.webhookSecret', value: '', group: 'zalo', isSecret: true },
    { key: 'zalo.quietHoursStart', value: '22:00', group: 'zalo' },
    { key: 'zalo.quietHoursEnd', value: '07:00', group: 'zalo' },
    { key: 'zalo.notifyTaskAssigned', value: true, group: 'zalo' },
    { key: 'zalo.notifyTaskDue', value: true, group: 'zalo' },
    { key: 'zalo.notifyLeaveSubmitted', value: true, group: 'zalo' },
    { key: 'zalo.notifyLeaveResult', value: true, group: 'zalo' },
    { key: 'zalo.dailyDigestTime', value: '08:00', group: 'zalo' },
    { key: 'task.reminderOffsetMinutes', value: 1440, group: 'task' },
    { key: 'task.overdueReminderTime', value: '08:30', group: 'task' },
  ];
  for (const s of settings) {
    await prisma.systemSetting.upsert({
      where: { key: s.key },
      update: { groupName: s.group, isSecret: s.isSecret ?? false },
      create: { key: s.key, valueJson: s.value as never, groupName: s.group, isSecret: s.isSecret ?? false },
    });
  }
  return settings.length;
}

export async function seedNotificationTemplates(prisma: PrismaClient) {
  const templates = [
    {
      code: 'TASK_ASSIGNED', name: 'Giao việc mới', channel: 'ZALO' as const,
      title: 'Công việc mới',
      bodyTemplate: '📋 Bạn được giao công việc mới\n\n[{{code}}] {{title}}\n⚡ Ưu tiên: {{priority}}\n📅 Hạn: {{dueDate}}\n👤 Người giao: {{creator}}\n\nXem chi tiết: {{link}}',
      variablesJson: ['code', 'title', 'priority', 'dueDate', 'creator', 'link'],
    },
    {
      code: 'TASK_DUE_SOON', name: 'Nhắc việc sắp đến hạn', channel: 'ZALO' as const,
      title: 'Nhắc việc',
      bodyTemplate: '⏰ Công việc sắp đến hạn\n\n[{{code}}] {{title}}\n📅 Hạn: {{dueDate}} ({{remaining}})\n📊 Tiến độ: {{progress}}%\n\nCập nhật: {{link}}',
      variablesJson: ['code', 'title', 'dueDate', 'remaining', 'progress', 'link'],
    },
    {
      code: 'TASK_OVERDUE', name: 'Cảnh báo việc quá hạn', channel: 'ZALO' as const,
      title: 'Công việc quá hạn',
      bodyTemplate: '🔴 Công việc đã QUÁ HẠN\n\n[{{code}}] {{title}}\n📅 Hạn: {{dueDate}} (trễ {{overdueDays}} ngày)\n\nXử lý ngay: {{link}}',
      variablesJson: ['code', 'title', 'dueDate', 'overdueDays', 'link'],
    },
    {
      code: 'LEAVE_SUBMITTED', name: 'Đơn nghỉ chờ duyệt', channel: 'ZALO' as const,
      title: 'Đơn nghỉ phép chờ duyệt',
      bodyTemplate: '📝 Có đơn nghỉ phép cần bạn duyệt\n\nMã đơn: {{code}}\n👤 Người xin: {{employee}} ({{department}})\n🏷 Loại: {{leaveType}}\n📅 Từ {{startDate}} đến {{endDate}} ({{totalDays}} ngày)\n💬 Lý do: {{reason}}\n\nDuyệt tại: {{link}}\nHoặc nhắn: /duyet {{code}} ok',
      variablesJson: ['code', 'employee', 'department', 'leaveType', 'startDate', 'endDate', 'totalDays', 'reason', 'link'],
    },
    {
      code: 'LEAVE_APPROVED', name: 'Đơn nghỉ được duyệt', channel: 'ZALO' as const,
      title: 'Đơn nghỉ phép đã duyệt',
      bodyTemplate: '✅ Đơn nghỉ phép của bạn ĐÃ ĐƯỢC DUYỆT\n\nMã đơn: {{code}}\n🏷 {{leaveType}}\n📅 Từ {{startDate}} đến {{endDate}} ({{totalDays}} ngày)\n👤 Người duyệt cuối: {{approver}}\n🗓 Phép còn lại: {{remaining}} ngày\n\nChi tiết: {{link}}',
      variablesJson: ['code', 'leaveType', 'startDate', 'endDate', 'totalDays', 'approver', 'remaining', 'link'],
    },
    {
      code: 'LEAVE_REJECTED', name: 'Đơn nghỉ bị từ chối', channel: 'ZALO' as const,
      title: 'Đơn nghỉ phép bị từ chối',
      bodyTemplate: '❌ Đơn nghỉ phép của bạn BỊ TỪ CHỐI\n\nMã đơn: {{code}}\n📅 Từ {{startDate}} đến {{endDate}}\n👤 Người xử lý: {{approver}}\n💬 Lý do: {{reason}}\n\nChi tiết: {{link}}',
      variablesJson: ['code', 'startDate', 'endDate', 'approver', 'reason', 'link'],
    },
    {
      code: 'APPROVAL_REMINDER', name: 'Nhắc duyệt quá hạn SLA', channel: 'ZALO' as const,
      title: 'Nhắc duyệt',
      bodyTemplate: '⏳ Bạn còn {{count}} đơn chờ duyệt quá hạn xử lý\n\n{{summary}}\n\nXử lý tại: {{link}}',
      variablesJson: ['count', 'summary', 'link'],
    },
    {
      code: 'DAILY_DIGEST', name: 'Tổng hợp đầu ngày', channel: 'ZALO' as const,
      title: 'Bản tin buổi sáng',
      bodyTemplate: '☀️ Chào {{name}}, tổng hợp hôm nay {{date}}\n\n📋 Việc đến hạn hôm nay: {{dueToday}}\n🔴 Việc quá hạn: {{overdue}}\n⏳ Đơn chờ bạn duyệt: {{pendingApprovals}}\n🏖 Nhân sự nghỉ hôm nay: {{onLeave}}\n\nMở hệ thống: {{link}}',
      variablesJson: ['name', 'date', 'dueToday', 'overdue', 'pendingApprovals', 'onLeave', 'link'],
    },
    {
      code: 'ZALO_LINKED', name: 'Liên kết Zalo thành công', channel: 'ZALO' as const,
      title: 'Liên kết thành công',
      bodyTemplate: '🎉 Liên kết thành công!\n\nXin chào {{name}}, tài khoản Zalo của bạn đã được kết nối với {{appName}}.\n\nGõ /help để xem các lệnh khả dụng.',
      variablesJson: ['name', 'appName'],
    },
    {
      code: 'CHECKIN_CONFIRMED', name: 'Xác nhận chấm công', channel: 'ZALO' as const,
      title: 'Chấm công',
      bodyTemplate: '{{icon}} {{action}} lúc {{time}} ngày {{date}}\n{{extra}}',
      variablesJson: ['icon', 'action', 'time', 'date', 'extra'],
    },
  ];

  for (const t of templates) {
    await prisma.notificationTemplate.upsert({
      where: { code: t.code },
      update: { name: t.name, channel: t.channel, title: t.title, bodyTemplate: t.bodyTemplate, variablesJson: t.variablesJson as never },
      create: { code: t.code, name: t.name, channel: t.channel, title: t.title, bodyTemplate: t.bodyTemplate, variablesJson: t.variablesJson as never, isActive: true },
    });
  }
  return templates.length;
}

/** Quy trình duyệt nghỉ phép mặc định: QL trực tiếp → HR, thêm bước Giám đốc nếu > 3 ngày */
export async function seedDefaultWorkflow(prisma: PrismaClient) {
  const existing = await prisma.workflowDefinition.findUnique({ where: { code: 'LEAVE_DEFAULT' } });
  const def = existing
    ? await prisma.workflowDefinition.update({
        where: { id: existing.id },
        data: { name: 'Quy trình duyệt nghỉ phép mặc định', isActive: true, isDefault: true },
      })
    : await prisma.workflowDefinition.create({
        data: {
          code: 'LEAVE_DEFAULT',
          name: 'Quy trình duyệt nghỉ phép mặc định',
          description: 'Quản lý trực tiếp duyệt trước, HR xác nhận sau. Đơn trên 3 ngày phải qua Giám đốc.',
          entityType: 'LEAVE',
          isActive: true,
          isDefault: true,
        },
      });

  await prisma.workflowStep.deleteMany({ where: { definitionId: def.id } });

  const hrRole = await prisma.role.findUnique({ where: { code: 'HR' } });

  await prisma.workflowStep.createMany({
    data: [
      {
        definitionId: def.id, stepOrder: 1, name: 'Quản lý trực tiếp duyệt',
        approverType: 'DIRECT_MANAGER', mode: 'SEQUENTIAL',
        slaHours: 24, allowDelegate: true, skipIfSameAsRequester: true, skipIfNoApprover: true,
      },
      {
        definitionId: def.id, stepOrder: 2, name: 'Giám đốc duyệt (đơn trên 3 ngày)',
        approverType: 'POSITION_RANK', positionRank: 80, mode: 'PARALLEL_ANY',
        conditionJson: { field: 'totalDays', op: '>', value: 3 } as never,
        slaHours: 48, allowDelegate: true, skipIfSameAsRequester: true, skipIfNoApprover: true,
      },
      {
        definitionId: def.id, stepOrder: 3, name: 'HR xác nhận và ghi nhận quỹ phép',
        approverType: 'ROLE', roleId: hrRole?.id ?? null, mode: 'PARALLEL_ANY',
        slaHours: 24, allowDelegate: false, skipIfSameAsRequester: false, skipIfNoApprover: true,
      },
    ],
  });

  return def;
}
