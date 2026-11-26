import { NextResponse, type NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { requireAuth, can } from '@/server/auth/context';
import { attendanceReport, taskReport, leaveReport } from '@/server/modules/report/service';
import { getAppBranding } from '@/server/modules/settings/branding';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

/** Xuất báo cáo ra Excel. Dữ liệu luôn đi qua phạm vi dữ liệu của người đăng nhập. */
export async function GET(req: NextRequest) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_REPORT_EXPORT')) {
    return NextResponse.json({ error: 'Bạn không có quyền xuất báo cáo' }, { status: 403 });
  }

  const type = req.nextUrl.searchParams.get('type') ?? 'attendance';
  const month = req.nextUrl.searchParams.get('month') ?? new Date().toISOString().slice(0, 7);
  const from = req.nextUrl.searchParams.get('from') ?? `${new Date().getFullYear()}-01-01`;
  const to = req.nextUrl.searchParams.get('to') ?? new Date().toISOString().slice(0, 10);
  const year = Number(req.nextUrl.searchParams.get('year') ?? new Date().getFullYear());

  const branding = await getAppBranding();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = branding.name;
  workbook.created = new Date();

  // Tô từng ô có tên cột, không tô cả dòng: đặt fill lên row sẽ loang sang các
  // cột trống bên phải, nhìn như bảng còn cột mà thực ra không có dữ liệu
  const styleHeader = (sheet: ExcelJS.Worksheet) => {
    const header = sheet.getRow(1);
    for (let col = 1; col <= sheet.columns.length; col += 1) {
      const cell = header.getCell(col);
      cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
      cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2447EB' } };
      cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    }
    header.height = 22;
    sheet.views = [{ state: 'frozen', ySplit: 1 }];
  };

  let fileName = 'bao-cao.xlsx';

  if (type === 'attendance') {
    const data = await attendanceReport(ctx, month);
    fileName = `bao-cao-cham-cong-${month}.xlsx`;

    const sheet = workbook.addWorksheet(`Chấm công ${month}`);
    sheet.columns = [
      { header: 'Mã NV', key: 'code', width: 12 },
      { header: 'Họ và tên', key: 'fullName', width: 26 },
      { header: 'Phòng ban', key: 'department', width: 26 },
      { header: 'Số công', key: 'workDays', width: 10 },
      { header: 'Đi muộn (lượt)', key: 'lateCount', width: 15 },
      { header: 'Phút muộn', key: 'lateMinutes', width: 12 },
      { header: 'Vắng', key: 'absentCount', width: 9 },
      { header: 'Nghỉ phép', key: 'leaveDays', width: 12 },
      { header: 'Tổng giờ làm', key: 'workedHours', width: 14 },
      { header: 'Giờ OT', key: 'otHours', width: 10 },
    ];
    data.employees.forEach((e) => sheet.addRow(e));
    styleHeader(sheet);

    const deptSheet = workbook.addWorksheet('Theo phòng ban');
    deptSheet.columns = [
      { header: 'Phòng ban', key: 'department', width: 30 },
      { header: 'Số nhân sự', key: 'employees', width: 13 },
      { header: 'Tổng công', key: 'workDays', width: 12 },
      { header: 'Lượt muộn', key: 'lateCount', width: 12 },
      { header: 'Lượt vắng', key: 'absentCount', width: 12 },
      { header: 'Ngày nghỉ phép', key: 'leaveDays', width: 16 },
    ];
    data.byDepartment.forEach((d) => deptSheet.addRow(d));
    styleHeader(deptSheet);
  }

  if (type === 'task') {
    const data = await taskReport(ctx, from, to);
    fileName = `bao-cao-cong-viec-${from}_${to}.xlsx`;

    const sheet = workbook.addWorksheet('Theo nhân sự');
    sheet.columns = [
      { header: 'Nhân sự', key: 'name', width: 26 },
      { header: 'Phòng ban', key: 'department', width: 26 },
      { header: 'Tổng việc', key: 'total', width: 12 },
      { header: 'Hoàn thành', key: 'done', width: 13 },
      { header: 'Đúng hạn', key: 'onTime', width: 12 },
      { header: 'Trễ hạn', key: 'late', width: 11 },
      { header: 'Đang mở', key: 'open', width: 11 },
      { header: 'Quá hạn', key: 'overdue', width: 11 },
    ];
    data.byAssignee.forEach((a) => sheet.addRow(a));
    styleHeader(sheet);

    const deptSheet = workbook.addWorksheet('Theo phòng ban');
    deptSheet.columns = [
      { header: 'Phòng ban', key: 'department', width: 30 },
      { header: 'Tổng việc', key: 'total', width: 12 },
      { header: 'Hoàn thành', key: 'done', width: 13 },
      { header: 'Quá hạn', key: 'overdue', width: 11 },
    ];
    data.byDepartment.forEach((d) => deptSheet.addRow(d));
    styleHeader(deptSheet);
  }

  if (type === 'leave') {
    const data = await leaveReport(ctx, year);
    fileName = `bao-cao-nghi-phep-${year}.xlsx`;

    const sheet = workbook.addWorksheet('Quỹ phép');
    sheet.columns = [
      { header: 'Mã NV', key: 'code', width: 12 },
      { header: 'Họ và tên', key: 'fullName', width: 26 },
      { header: 'Phòng ban', key: 'department', width: 26 },
      { header: 'Phép chuẩn', key: 'standard', width: 13 },
      { header: 'Thưởng', key: 'bonus', width: 11 },
      { header: 'Chuyển tiếp', key: 'carried', width: 13 },
      { header: 'Đã dùng', key: 'used', width: 11 },
      { header: 'Chờ duyệt', key: 'pending', width: 12 },
      { header: 'Còn lại', key: 'remaining', width: 11 },
    ];
    data.balances.forEach((b) => sheet.addRow(b));
    styleHeader(sheet);

    const typeSheet = workbook.addWorksheet('Theo loại nghỉ');
    typeSheet.columns = [
      { header: 'Loại nghỉ phép', key: 'type', width: 30 },
      { header: 'Số đơn', key: 'count', width: 12 },
      { header: 'Tổng ngày', key: 'days', width: 13 },
    ];
    data.byType.forEach((t) => typeSheet.addRow({ type: t.type, count: t.count, days: t.days }));
    styleHeader(typeSheet);

    const monthSheet = workbook.addWorksheet('Theo tháng');
    monthSheet.columns = [
      { header: 'Tháng', key: 'month', width: 14 },
      { header: 'Số đơn', key: 'count', width: 12 },
      { header: 'Số ngày nghỉ', key: 'days', width: 15 },
    ];
    data.byMonth.forEach((m) => monthSheet.addRow(m));
    styleHeader(monthSheet);
  }

  const buffer = await workbook.xlsx.writeBuffer();
  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
    },
  });
}
