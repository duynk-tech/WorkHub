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
export async function cleanBusinessData(prisma: PrismaClient) {
  // Dùng raw query tắt foreign key checks để xóa nhanh, sạch và không bị xung đột ràng buộc khóa ngoại vòng
  await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 0;');

  try {
    // 1. Dịch vụ F&B, bảo hành, kho, đơn hàng, thanh toán
    // Bảng phân bổ mới có khóa ngoại riêng; xóa chúng trước khi làm sạch chứng từ cha.
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `CustomerPaymentAllocation`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `SupplierPaymentAllocation`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `InventoryTransactionItem`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `InventoryTransaction`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `StockCountItem`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `StockCount`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `InventoryStock`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `InventoryItem`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `SparePartOrderItem`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `SupplierPayment`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `SparePartOrder`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `Warehouse`;');

    await prisma.$executeRawUnsafe('TRUNCATE TABLE `CustomerReturnItem`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `CustomerReturn`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `CustomerPayment`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `CustomerOrderItem`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `CustomerOrder`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `CustomerQuotationItem`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `CustomerQuotation`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `ServiceTicket`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `FnbEquipment`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `ServiceContract`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `CustomerLocation`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `Customer`;');

    // 2. Tài sản & Thiết bị văn phòng (Asset)
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `AssetLiquidation`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `AssetUpgrade`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `AssetMaintenance`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `AssetAssignment`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `Asset`;');

    // 3. Công việc (Tasks)
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `TaskReminder`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `TaskActivity`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `TaskTimeLog`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `TaskAttachment`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `TaskComment`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `TaskChecklistItem`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `TaskWatcher`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `Task`;');

    // 4. Chấm công (Attendance)
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `AttendanceAdjustment`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `AttendanceRecord`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `AttendanceImportBatch`;');

    // 5. Nghỉ phép & Phê duyệt (Leave & Workflows)
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `ApprovalTask`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `WorkflowLog`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `WorkflowInstance`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `LeaveRequestDay`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `LeaveRequest`;');

    // Quỹ phép: xóa quỹ phép của nhân viên demo, bảo lưu admin
    const adminEmp = await prisma.employee.findUnique({ where: { code: 'ADMIN' }, select: { id: true } });
    if (adminEmp) {
      await prisma.$executeRawUnsafe(`DELETE FROM \`LeaveBalance\` WHERE \`employeeId\` != ${adminEmp.id};`);
    } else {
      await prisma.$executeRawUnsafe('TRUNCATE TABLE `LeaveBalance`;');
    }

    // 6. Thông báo, Zalo log, Báo cáo presets
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `NotificationOutbox`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `InAppNotification`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `ZaloInboundLog`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `ZaloLinkCode`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `McpCallLog`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `McpClient`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `ExternalIdentity`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `ReportPreset`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `ReportSchedule`;');
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `AuditLog`;');

    // 7. Nhân sự, Tài khoản & Phòng ban demo
    // UserRoles: xóa những user không phải ADMIN
    if (adminEmp) {
      const adminUser = await prisma.user.findUnique({ where: { employeeId: adminEmp.id }, select: { id: true } });
      if (adminUser) {
        await prisma.$executeRawUnsafe(`DELETE FROM \`UserRole\` WHERE \`userId\` != ${adminUser.id};`);
        await prisma.$executeRawUnsafe(`DELETE FROM \`User\` WHERE \`id\` != ${adminUser.id};`);
      } else {
        await prisma.$executeRawUnsafe('TRUNCATE TABLE \`UserRole\`;');
        await prisma.$executeRawUnsafe('TRUNCATE TABLE \`User\`;');
      }
      await prisma.$executeRawUnsafe(`DELETE FROM \`RoleDeptScope\`;`);
      await prisma.$executeRawUnsafe(`DELETE FROM \`Employee\` WHERE \`id\` != ${adminEmp.id};`);
    } else {
      await prisma.$executeRawUnsafe('TRUNCATE TABLE `UserRole`;');
      await prisma.$executeRawUnsafe('TRUNCATE TABLE `RoleDeptScope`;');
      await prisma.$executeRawUnsafe('TRUNCATE TABLE `User`;');
      await prisma.$executeRawUnsafe('TRUNCATE TABLE `Employee`;');
    }

    // Xóa toàn bộ phòng ban
    await prisma.$executeRawUnsafe('TRUNCATE TABLE `Department`;');

  } finally {
    await prisma.$executeRawUnsafe('SET FOREIGN_KEY_CHECKS = 1;');
  }
}
