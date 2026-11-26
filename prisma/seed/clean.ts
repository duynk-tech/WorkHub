import type { PrismaClient } from '@prisma/client';

/**
 * Xóa sạch dữ liệu nghiệp vụ và dữ liệu mẫu nhưng BẢO LƯU:
 * - Tài khoản ADMIN & UserRole của ADMIN
 * - Cấu hình hệ thống (SystemSetting)
 * - Mẫu thông báo (NotificationTemplate)
 * - Quy trình duyệt mặc định (WorkflowDefinition & WorkflowStep)
 * - Quyền & Vai trò cốt lõi (Permission, Role, RolePermission)
 * - Chức danh & Ca làm việc & Loại phép & Ngày lễ (Position, WorkShift, LeaveType, Holiday)
 */
export async function cleanBusinessData(prisma: PrismaClient, preserveEmployeeId?: number) {
  // Dùng TRUNCATE ... RESTART IDENTITY CASCADE trên PostgreSQL để xóa sạch theo thứ tự khóa ngoại.
  const tablesToTruncate = [
    // 1. Dịch vụ F&B, bảo hành, kho, đơn hàng, thanh toán
    'CustomerPaymentAllocation',
    'SupplierPaymentAllocation',
    'InventoryTransactionItem',
    'InventoryTransaction',
    'StockCountItem',
    'StockCount',
    'InventoryStock',
    'InventoryItem',
    'SparePartOrderItem',
    'SupplierPayment',
    'SparePartOrder',
    'Warehouse',
    'CustomerReturnItem',
    'CustomerReturn',
    'CustomerPayment',
    'CustomerOrderItem',
    'CustomerOrder',
    'CustomerQuotationItem',
    'CustomerQuotation',
    'ServiceTicket',
    'FnbEquipment',
    'ServiceContract',
    'CustomerLocation',
    'CustomerProfile',
    'CustomerContact',
    'CustomerCareActivity',
    'Customer',
    // 2. Tài sản & Thiết bị văn phòng (Asset)
    'AssetLiquidation',
    'AssetUpgrade',
    'AssetMaintenance',
    'AssetAssignment',
    'Asset',
    // 3. Công việc (Tasks)
    'TaskReminder',
    'TaskActivity',
    'TaskTimeLog',
    'TaskAttachment',
    'TaskComment',
    'TaskChecklistItem',
    'TaskWatcher',
    'Task',
    // 4. Chấm công (Attendance)
    'AttendanceAdjustment',
    'AttendanceRecord',
    'AttendanceImportBatch',
    // 5. Nghỉ phép & Phê duyệt (Leave & Workflows)
    'ApprovalTask',
    'WorkflowLog',
    'WorkflowInstance',
    'LeaveRequestDay',
    'LeaveRequest',
    // 6. Thông báo, Zalo log, Báo cáo presets
    'NotificationOutbox',
    'InAppNotification',
    'ZaloInboundLog',
    'ZaloLinkCode',
    'McpCallLog',
    'McpClient',
    'ExternalIdentity',
    'ReportPreset',
    'ReportSchedule',
    'AuditLog',
  ];

  const quotedList = tablesToTruncate.map((t) => `"${t}"`).join(', ');
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${quotedList} RESTART IDENTITY CASCADE;`);

  // Quỹ phép: xóa quỹ phép của nhân viên demo, bảo lưu admin
  const adminEmp = preserveEmployeeId
    ? await prisma.employee.findUnique({ where: { id: preserveEmployeeId }, select: { id: true } })
    : await prisma.employee.findUnique({ where: { code: 'ADMIN' }, select: { id: true } });

  if (adminEmp) {
    await prisma.$executeRaw`DELETE FROM "LeaveBalance" WHERE "employeeId" != ${adminEmp.id}`;
  } else {
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "LeaveBalance" RESTART IDENTITY CASCADE;');
  }

  // 7. Nhân sự, Tài khoản & Phòng ban demo
  if (adminEmp) {
    // Gỡ liên kết phòng ban/quản lý của admin trước khi xóa phòng ban & nhân sự demo
    await prisma.$executeRaw`UPDATE "Employee" SET "departmentId" = NULL, "managerId" = NULL WHERE "id" = ${adminEmp.id}`;
    const adminUser = await prisma.user.findUnique({ where: { employeeId: adminEmp.id }, select: { id: true } });
    if (adminUser) {
      await prisma.$executeRaw`DELETE FROM "UserRole" WHERE "userId" != ${adminUser.id}`;
      await prisma.$executeRaw`DELETE FROM "User" WHERE "id" != ${adminUser.id}`;
    } else {
      await prisma.$executeRawUnsafe('TRUNCATE TABLE "UserRole", "User" RESTART IDENTITY CASCADE;');
    }
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "RoleDeptScope" RESTART IDENTITY CASCADE;');
    await prisma.$executeRaw`DELETE FROM "Employee" WHERE "id" != ${adminEmp.id}`;
    await prisma.$executeRawUnsafe('TRUNCATE TABLE "Department" RESTART IDENTITY CASCADE;');
  } else {
    await prisma.$executeRawUnsafe(
      'TRUNCATE TABLE "UserRole", "RoleDeptScope", "User", "Employee", "Department" RESTART IDENTITY CASCADE;',
    );
  }
}
