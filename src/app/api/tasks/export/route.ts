import { NextResponse, type NextRequest } from 'next/server';
import ExcelJS from 'exceljs';
import { requireAuth, can } from '@/server/auth/context';
import {
  exportTasks, TASK_EXPORT_LIMIT,
  OPEN_TASK_STATUSES, CLOSED_TASK_STATUSES,
} from '@/server/modules/task/service';
import {
  resolveDateRange, TASK_DATE_FIELDS, TASK_DATE_PRESETS,
  type TaskDateField, type TaskDatePreset,
} from '@/server/modules/task/date-filter';
import { getAppBranding } from '@/server/modules/settings/branding';
import { TASK_STATUS, TASK_PRIORITY } from '@/lib/enums';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const d = (v: Date | null) => (v ? new Date(v) : null);

/**
 * Xuất danh sách công việc ra Excel.
 *
 * Nhận đúng bộ tham số URL mà màn hình Công việc đang dùng, nên file tải về khớp
 * với những gì người dùng đang nhìn. Phạm vi dữ liệu theo phân quyền do
 * exportTasks lo, route này không được phép nới rộng.
 */
export async function GET(req: NextRequest) {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_TASK_EXPORT')) {
    return NextResponse.json({ error: 'Bạn không có quyền xuất danh sách công việc' }, { status: 403 });
  }

  const sp = req.nextUrl.searchParams;
  const get = (k: string) => sp.get(k) ?? undefined;

  const scope = get('scope') === 'closed' || get('scope') === 'all' ? get('scope')! : 'open';
  const picked = get('status') ? get('status')!.split(',') : [];
  const scopeStatuses =
    scope === 'closed' ? [...CLOSED_TASK_STATUSES]
    : scope === 'all' ? []
    : [...OPEN_TASK_STATUSES];
  const status = picked.length
    ? (scopeStatuses.length ? picked.filter((p) => scopeStatuses.includes(p as never)) : picked)
    : scopeStatuses;

  const dateField = (get('dfield') && get('dfield')! in TASK_DATE_FIELDS ? get('dfield')! : 'dueDate') as TaskDateField;
  const datePreset = (get('drange') && get('drange')! in TASK_DATE_PRESETS ? get('drange')! : 'ALL') as TaskDatePreset;
  const dateRange = resolveDateRange(datePreset, { from: get('dfrom'), to: get('dto') });

  const filter = {
    search: get('q') ?? '',
    status,
    pickedStatus: picked,
    scope,
    dateField,
    datePreset,
    dateFrom: dateRange.from,
    dateTo: dateRange.to,
    noDate: dateRange.noDate,
    customFrom: get('dfrom') ?? '',
    customTo: get('dto') ?? '',
    priority: get('priority') ? get('priority')!.split(',') : [],
    assigneeId: get('assignee') ? Number(get('assignee')) : null,
    departmentId: get('dept') ? Number(get('dept')) : null,
    onlyMine: get('mine') === '1',
    overdue: get('overdue') === '1',
    sort: get('sort') ?? 'due',
  };

  const { rows, total, truncated } = await exportTasks(ctx, filter);

  const branding = await getAppBranding();
  const workbook = new ExcelJS.Workbook();
  workbook.creator = branding.name;
  workbook.created = new Date();

  const sheet = workbook.addWorksheet('Công việc');
  sheet.columns = [
    { header: 'Mã việc', key: 'code', width: 14 },
    { header: 'Tiêu đề', key: 'title', width: 46 },
    { header: 'Trạng thái', key: 'status', width: 16 },
    { header: 'Ưu tiên', key: 'priority', width: 13 },
    { header: 'Tiến độ (%)', key: 'progress', width: 12 },
    { header: 'Người thực hiện', key: 'assignee', width: 24 },
    { header: 'Phòng ban', key: 'department', width: 24 },
    { header: 'Người giao', key: 'creator', width: 22 },
    { header: 'Người nghiệm thu', key: 'reviewer', width: 22 },
    { header: 'Ngày bắt đầu', key: 'startDate', width: 14 },
    { header: 'Ngày đến hạn', key: 'dueDate', width: 14 },
    { header: 'Ngày hoàn thành', key: 'completedAt', width: 16 },
    { header: 'Trễ hạn', key: 'late', width: 10 },
    { header: 'Giờ ước tính', key: 'estimateHours', width: 14 },
    { header: 'Giờ thực tế', key: 'actualHours', width: 13 },
    { header: 'Việc cha', key: 'parent', width: 14 },
    { header: 'Việc con', key: 'subTasks', width: 10 },
    { header: 'Checklist', key: 'checklist', width: 11 },
    { header: 'Bình luận', key: 'comments', width: 11 },
    { header: 'Thẻ', key: 'tags', width: 22 },
    { header: 'Ngày tạo', key: 'createdAt', width: 14 },
  ];

  const now = new Date();
  for (const t of rows) {
    const due = d(t.dueDate);
    // Xong sau hạn, hoặc chưa xong mà đã qua hạn — cùng là trễ
    const late = due ? (t.completedAt ? new Date(t.completedAt) > due : now > due) : false;

    sheet.addRow({
      code: t.code,
      title: t.title,
      status: TASK_STATUS[t.status]?.label ?? t.status,
      priority: TASK_PRIORITY[t.priority]?.label ?? t.priority,
      progress: t.progress,
      assignee: t.assignee?.fullName ?? '',
      department: t.department?.name ?? '',
      creator: t.creator?.fullName ?? '',
      reviewer: t.reviewer?.fullName ?? '',
      startDate: d(t.startDate),
      dueDate: due,
      completedAt: d(t.completedAt),
      late: late ? 'Có' : '',
      estimateHours: t.estimateHours ? Number(t.estimateHours) : null,
      actualHours: t.actualHours ? Number(t.actualHours) : null,
      parent: t.parentTask?.code ?? '',
      subTasks: t._count.subTasks,
      checklist: t._count.checklist,
      comments: t._count.comments,
      tags: t.tags ?? '',
      createdAt: d(t.createdAt),
    });
  }

  // Tô từng ô có tên cột theo đúng màu xanh thương hiệu web (#2563EB)
  const header = sheet.getRow(1);
  for (let col = 1; col <= sheet.columns.length; col += 1) {
    const cell = header.getCell(col);
    cell.font = { bold: true, color: { argb: 'FFFFFFFF' }, size: 11 };
    cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FF2563EB' } };
    cell.alignment = { vertical: 'middle', horizontal: 'center', wrapText: true };
    cell.border = {
      top: { style: 'thin', color: { argb: 'FF1D4ED8' } },
      bottom: { style: 'thin', color: { argb: 'FF1D4ED8' } },
      left: { style: 'thin', color: { argb: 'FF3B82F6' } },
      right: { style: 'thin', color: { argb: 'FF3B82F6' } },
    };
  }
  header.height = 26;
  for (let r = 2; r <= rows.length + 1; r += 1) {
    const dataRow = sheet.getRow(r);
    const isEven = r % 2 === 1;
    for (let col = 1; col <= sheet.columns.length; col += 1) {
      const cell = dataRow.getCell(col);
      if (isEven) {
        cell.fill = { type: 'pattern', pattern: 'solid', fgColor: { argb: 'FFF8FAFC' } };
      }
      cell.border = {
        bottom: { style: 'thin', color: { argb: 'FFE2E8F0' } },
        right: { style: 'thin', color: { argb: 'FFF1F5F9' } },
      };
    }
  }
  sheet.views = [{ state: 'frozen', ySplit: 1 }];
  sheet.autoFilter = { from: 'A1', to: { row: 1, column: sheet.columns.length } };

  for (const key of ['startDate', 'dueDate', 'completedAt', 'createdAt']) {
    sheet.getColumn(key).numFmt = 'dd/mm/yyyy';
  }

  // Dòng cuối nói rõ file bị cắt, tránh người xem tưởng đã có đủ dữ liệu
  if (truncated) {
    sheet.addRow({});
    sheet.addRow({
      code: '',
      title: `Đã xuất ${rows.length}/${total} việc — file giới hạn ${TASK_EXPORT_LIMIT} dòng, hãy thu hẹp bộ lọc để lấy đủ.`,
    });
  }

  const stamp = new Date().toISOString().slice(0, 10);
  const fileName = `cong-viec-${stamp}.xlsx`;
  const buffer = await workbook.xlsx.writeBuffer();

  return new NextResponse(buffer as ArrayBuffer, {
    headers: {
      'Content-Type': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'Content-Disposition': `attachment; filename="${encodeURIComponent(fileName)}"`,
    },
  });
}
