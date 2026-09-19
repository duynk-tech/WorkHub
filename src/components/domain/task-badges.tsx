import { Badge } from '@/components/ui';
import { TASK_STATUS, TASK_PRIORITY, LEAVE_STATUS, APPROVAL_STATUS, ATTENDANCE_STATUS, EMPLOYEE_STATUS } from '@/lib/enums';

type Tone = 'neutral' | 'brand' | 'success' | 'warning' | 'danger' | 'info' | 'outline';

export function TaskStatusBadge({ status }: { status: string }) {
  const s = TASK_STATUS[status];
  return <Badge tone={(s?.tone ?? 'neutral') as Tone} dot>{s?.label ?? status}</Badge>;
}

export function TaskPriorityBadge({ priority }: { priority: string }) {
  const p = TASK_PRIORITY[priority];
  return <Badge tone={(p?.tone ?? 'neutral') as Tone}>{p?.label ?? priority}</Badge>;
}

export function LeaveStatusBadge({ status }: { status: string }) {
  const s = LEAVE_STATUS[status];
  return <Badge tone={(s?.tone ?? 'neutral') as Tone} dot>{s?.label ?? status}</Badge>;
}

export function ApprovalStatusBadge({ status }: { status: string }) {
  const s = APPROVAL_STATUS[status];
  return <Badge tone={(s?.tone ?? 'neutral') as Tone}>{s?.label ?? status}</Badge>;
}

export function AttendanceStatusBadge({ status }: { status: string }) {
  const s = ATTENDANCE_STATUS[status];
  return <Badge tone={(s?.tone ?? 'neutral') as Tone} dot>{s?.label ?? status}</Badge>;
}

export function EmployeeStatusBadge({ status }: { status: string }) {
  const s = EMPLOYEE_STATUS[status];
  return <Badge tone={(s?.tone ?? 'neutral') as Tone} dot>{s?.label ?? status}</Badge>;
}
