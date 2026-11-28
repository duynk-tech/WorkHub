import { NextResponse, type NextRequest } from 'next/server';
import { requireAuth, can } from '@/server/auth/context';
import { attendanceReport, taskReport, leaveReport } from '@/server/modules/report/service';
import { getAppBranding } from '@/server/modules/settings/branding';
import { streamXlsxResponse, type SheetColumn } from '@/server/lib/excel';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

type Sheet = { name: string; columns: SheetColumn[]; rows: Record<string, unknown>[] };

/**
 * Xuất báo cáo ra Excel. Dữ liệu luôn đi qua phạm vi dữ liệu của người đăng nhập.
 * Lấy đủ dữ liệu trước rồi mới ghi luồng: lỗi truy vấn vẫn trả mã lỗi HTTP đúng.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_REPORT_EXPORT')) {
    return NextResponse.json({ error: 'Bạn không có quyền xuất báo cáo' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const type = sp.get('type') ?? 'attendance';
  const month = /^\d{4}-\d{2}$/.test(sp.get('month') ?? '') ? sp.get('month')! : new Date().toISOString().slice(0, 7);
  const from = sp.get('from') ?? `${new Date().getFullYear()}-01-01`;
  const to = sp.get('to') ?? new Date().toISOString().slice(0, 10);
  const yearRaw = Number(sp.get('year') ?? new Date().getFullYear());
  const year = Number.isInteger(yearRaw) && yearRaw > 2000 && yearRaw < 2100 ? yearRaw : new Date().getFullYear();

  let fileName = 'bao-cao.xlsx';
  let sheets: Sheet[] = [];

  if (type === 'attendance') {
    const data = await attendanceReport(ctx, month);
    fileName = `bao-cao-cham-cong-${month}.xlsx`;
    sheets = [
      {
        name: `Chấm công ${month}`,
        columns: [
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
        ],
        rows: data.employees,
      },
      {
        name: 'Theo phòng ban',
        columns: [
          { header: 'Phòng ban', key: 'department', width: 30 },
          { header: 'Số nhân sự', key: 'employees', width: 13 },
          { header: 'Tổng công', key: 'workDays', width: 12 },
          { header: 'Lượt muộn', key: 'lateCount', width: 12 },
          { header: 'Lượt vắng', key: 'absentCount', width: 12 },
          { header: 'Ngày nghỉ phép', key: 'leaveDays', width: 16 },
        ],
        rows: data.byDepartment,
      },
    ];
  } else if (type === 'task') {
    const data = await taskReport(ctx, from, to);
    // taskReport đã chuẩn hoá khoảng ngày (tối đa 366 ngày), đặt tên file theo khoảng thật
    fileName = `bao-cao-cong-viec-${data.from}_${data.to}.xlsx`;
    sheets = [
      {
        name: 'Theo nhân sự',
        columns: [
          { header: 'Nhân sự', key: 'name', width: 26 },
          { header: 'Phòng ban', key: 'department', width: 26 },
          { header: 'Tổng việc', key: 'total', width: 12 },
          { header: 'Hoàn thành', key: 'done', width: 13 },
          { header: 'Đúng hạn', key: 'onTime', width: 12 },
          { header: 'Trễ hạn', key: 'late', width: 11 },
          { header: 'Đang mở', key: 'open', width: 11 },
          { header: 'Quá hạn', key: 'overdue', width: 11 },
        ],
        rows: data.byAssignee,
      },
      {
        name: 'Theo phòng ban',
        columns: [
          { header: 'Phòng ban', key: 'department', width: 30 },
          { header: 'Tổng việc', key: 'total', width: 12 },
          { header: 'Hoàn thành', key: 'done', width: 13 },
          { header: 'Quá hạn', key: 'overdue', width: 11 },
        ],
        rows: data.byDepartment,
      },
    ];
  } else if (type === 'leave') {
    const data = await leaveReport(ctx, year);
    fileName = `bao-cao-nghi-phep-${year}.xlsx`;
    sheets = [
      {
        name: 'Quỹ phép',
        columns: [
          { header: 'Mã NV', key: 'code', width: 12 },
          { header: 'Họ và tên', key: 'fullName', width: 26 },
          { header: 'Phòng ban', key: 'department', width: 26 },
          { header: 'Phép chuẩn', key: 'standard', width: 13 },
          { header: 'Thưởng', key: 'bonus', width: 11 },
          { header: 'Chuyển tiếp', key: 'carried', width: 13 },
          { header: 'Đã dùng', key: 'used', width: 11 },
          { header: 'Chờ duyệt', key: 'pending', width: 12 },
          { header: 'Còn lại', key: 'remaining', width: 11 },
        ],
        rows: data.balances,
      },
      {
        name: 'Theo loại nghỉ',
        columns: [
          { header: 'Loại nghỉ phép', key: 'type', width: 30 },
          { header: 'Số đơn', key: 'count', width: 12 },
          { header: 'Tổng ngày', key: 'days', width: 13 },
        ],
        rows: data.byType.map((t) => ({ type: t.type, count: t.count, days: t.days })),
      },
      {
        name: 'Theo tháng',
        columns: [
          { header: 'Tháng', key: 'month', width: 14 },
          { header: 'Số đơn', key: 'count', width: 12 },
          { header: 'Số ngày nghỉ', key: 'days', width: 15 },
        ],
        rows: data.byMonth,
      },
    ];
  } else {
    return NextResponse.json({ error: 'Loại báo cáo không hợp lệ' }, { status: 400 });
  }

  const branding = await getAppBranding();
  return streamXlsxResponse(
    fileName,
    async (wb) => {
      for (const s of sheets) {
        await wb.sheet(s.name, s.columns, (sheet) => {
          for (const row of s.rows) sheet.add(row);
        });
      }
    },
    { creator: branding.name },
  );
}
