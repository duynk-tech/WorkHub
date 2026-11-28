import type { AuthContext } from '@/server/auth/context';
import type { SheetColumn } from '@/server/lib/excel';
import { attendanceReport, taskReport, leaveReport } from './service';

/**
 * Dựng các sheet của một báo cáo — dùng chung cho nút "Xuất Excel" và báo cáo gửi định kỳ.
 * Dữ liệu luôn đi qua phạm vi dữ liệu của ctx (người xem / người lập lịch).
 */
export type ReportSheet = { name: string; columns: SheetColumn[]; rows: Record<string, unknown>[] };
export type ExportableReport = 'attendance' | 'task' | 'leave';
export const EXPORTABLE_REPORTS: ExportableReport[] = ['task', 'attendance', 'leave'];

export interface ReportParams { month: string; from: string; to: string; year: number }

export async function buildReportSheets(
  ctx: AuthContext,
  type: string,
  { month, from, to, year }: ReportParams,
): Promise<{ fileName: string; sheets: ReportSheet[] } | null> {
  let fileName = 'bao-cao.xlsx';
  let sheets: ReportSheet[] = [];

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
    return null;
  }

  return { fileName, sheets };
}
