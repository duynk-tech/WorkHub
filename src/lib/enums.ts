/** Nhãn tiếng Việt và màu cho các enum của Prisma — dùng chung toàn hệ thống. */

export const TASK_STATUS: Record<string, { label: string; tone: string; color: string }> = {
  TODO: { label: 'Chờ làm', tone: 'neutral', color: 'var(--text-muted)' },
  IN_PROGRESS: { label: 'Đang làm', tone: 'info', color: 'var(--info)' },
  REVIEW: { label: 'Chờ nghiệm thu', tone: 'warning', color: 'var(--warning)' },
  DONE: { label: 'Hoàn thành', tone: 'success', color: 'var(--success)' },
  BLOCKED: { label: 'Bị chặn', tone: 'danger', color: 'var(--danger)' },
  CANCELLED: { label: 'Đã hủy', tone: 'outline', color: 'var(--text-faint)' },
};

export const TASK_PRIORITY: Record<string, { label: string; tone: string; color: string }> = {
  LOW: { label: 'Thấp', tone: 'outline', color: 'var(--text-muted)' },
  MEDIUM: { label: 'Trung bình', tone: 'info', color: 'var(--info)' },
  HIGH: { label: 'Cao', tone: 'warning', color: 'var(--warning)' },
  URGENT: { label: 'Khẩn cấp', tone: 'danger', color: 'var(--danger)' },
};

export const LEAVE_STATUS: Record<string, { label: string; tone: string }> = {
  DRAFT: { label: 'Nháp', tone: 'outline' },
  PENDING: { label: 'Chờ duyệt', tone: 'warning' },
  APPROVED: { label: 'Đã duyệt', tone: 'success' },
  REJECTED: { label: 'Từ chối', tone: 'danger' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
};

export const LEAVE_DURATION: Record<string, string> = {
  FULL_DAY: 'Cả ngày',
  HALF_DAY_MORNING: 'Nửa ngày (sáng)',
  HALF_DAY_AFTERNOON: 'Nửa ngày (chiều)',
};

export const APPROVAL_STATUS: Record<string, { label: string; tone: string }> = {
  PENDING: { label: 'Chờ xử lý', tone: 'warning' },
  APPROVED: { label: 'Đã duyệt', tone: 'success' },
  REJECTED: { label: 'Từ chối', tone: 'danger' },
  SKIPPED: { label: 'Bỏ qua', tone: 'outline' },
  DELEGATED: { label: 'Ủy quyền', tone: 'info' },
  EXPIRED: { label: 'Quá hạn', tone: 'danger' },
  CANCELLED: { label: 'Đã hủy', tone: 'neutral' },
};

export const ATTENDANCE_STATUS: Record<string, { label: string; tone: string; color: string }> = {
  PRESENT: { label: 'Đi làm', tone: 'success', color: 'var(--success)' },
  LATE: { label: 'Đi muộn', tone: 'warning', color: 'var(--warning)' },
  EARLY_LEAVE: { label: 'Về sớm', tone: 'warning', color: 'var(--warning)' },
  ABSENT: { label: 'Vắng', tone: 'danger', color: 'var(--danger)' },
  LEAVE: { label: 'Nghỉ phép', tone: 'info', color: 'var(--info)' },
  HALF_DAY: { label: 'Nửa ngày', tone: 'info', color: 'var(--info)' },
  HOLIDAY: { label: 'Ngày lễ', tone: 'brand', color: 'var(--brand)' },
  WEEKEND: { label: 'Cuối tuần', tone: 'outline', color: 'var(--text-faint)' },
  WFH: { label: 'Làm từ xa', tone: 'info', color: 'var(--info)' },
  MISSING_CHECKOUT: { label: 'Thiếu check-out', tone: 'warning', color: 'var(--warning)' },
};

export const EMPLOYEE_STATUS: Record<string, { label: string; tone: string }> = {
  ACTIVE: { label: 'Đang làm việc', tone: 'success' },
  ON_LEAVE: { label: 'Tạm nghỉ', tone: 'warning' },
  SUSPENDED: { label: 'Tạm đình chỉ', tone: 'danger' },
  RESIGNED: { label: 'Đã nghỉ việc', tone: 'neutral' },
};

export const EMPLOYMENT_TYPE: Record<string, string> = {
  FULL_TIME: 'Toàn thời gian',
  PART_TIME: 'Bán thời gian',
  CONTRACT: 'Hợp đồng dịch vụ',
  INTERN: 'Thực tập',
  PROBATION: 'Thử việc',
};

export const DATA_SCOPE: Record<string, { label: string; description: string }> = {
  ALL: { label: 'Toàn công ty', description: 'Xem và thao tác trên toàn bộ dữ liệu' },
  DEPT_TREE: { label: 'Phòng ban và cấp dưới', description: 'Phòng ban của mình cùng toàn bộ đơn vị trực thuộc' },
  DEPT: { label: 'Chỉ phòng ban của mình', description: 'Không bao gồm đơn vị trực thuộc' },
  CUSTOM: { label: 'Phòng ban chỉ định', description: 'Danh sách phòng ban được chọn thủ công' },
  SELF: { label: 'Chỉ bản thân', description: 'Dữ liệu của chính mình và cấp dưới trực tiếp' },
};

export const APPROVER_TYPE: Record<string, { label: string; description: string }> = {
  DIRECT_MANAGER: { label: 'Quản lý trực tiếp', description: 'Người quản lý trực tiếp của người nộp đơn' },
  MANAGER_CHAIN_LEVEL: { label: 'Quản lý cấp N', description: 'Leo lên N cấp trong chuỗi quản lý' },
  DEPT_HEAD: { label: 'Trưởng phòng ban', description: 'Trưởng đơn vị của người nộp đơn' },
  PARENT_DEPT_HEAD: { label: 'Trưởng đơn vị cấp trên', description: 'Trưởng phòng ban cha trong cây tổ chức' },
  ROLE: { label: 'Theo vai trò', description: 'Tất cả người dùng có vai trò được chọn' },
  POSITION_RANK: { label: 'Theo cấp bậc chức danh', description: 'Nhân sự có chức danh từ cấp bậc chỉ định trở lên' },
  SPECIFIC_USER: { label: 'Người cụ thể', description: 'Chỉ định đích danh một nhân sự' },
  HR: { label: 'Bộ phận Nhân sự', description: 'Người dùng thuộc vai trò HR' },
};

export const STEP_MODE: Record<string, string> = {
  SEQUENTIAL: 'Tuần tự (một người duyệt)',
  PARALLEL_ALL: 'Song song — tất cả phải duyệt',
  PARALLEL_ANY: 'Song song — một người duyệt là đủ',
};

export const RECORD_SOURCE: Record<string, string> = {
  WEB: 'Web', ZALO: 'Zalo Bot', MCP: 'MCP/AI', IMPORT: 'Import', SYSTEM: 'Hệ thống',
};
