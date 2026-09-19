'use client';

import { useEffect, useState, useTransition } from 'react';
import { Plus, X } from 'lucide-react';
import { Button, Field, Input, Select, Textarea, Checkbox, Badge } from '@/components/ui';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { TASK_STATUS, TASK_PRIORITY } from '@/lib/enums';
import { saveTaskAction } from '@/server/modules/task/actions';

export interface TaskFormValue {
  id?: number;
  title: string;
  description: string;
  departmentId: number | null;
  assigneeId: number | null;
  reviewerId: number | null;
  parentTaskId: number | null;
  status: string;
  priority: string;
  startDate: string;
  dueDate: string;
  estimateHours: number | null;
  tags: string;
  progress: number;
  watcherIds: number[];
  checklist: string[];
  reminderOffsetMinutes: number | null;
}

const empty: TaskFormValue = {
  title: '', description: '', departmentId: null, assigneeId: null, reviewerId: null, parentTaskId: null,
  status: 'TODO', priority: 'MEDIUM', startDate: '', dueDate: '', estimateHours: null, tags: '',
  progress: 0, watcherIds: [], checklist: [], reminderOffsetMinutes: 1440,
};

const REMINDER_OPTIONS = [
  { value: 0, label: 'Không nhắc' },
  { value: 60, label: '1 giờ trước hạn' },
  { value: 240, label: '4 giờ trước hạn' },
  { value: 1440, label: '1 ngày trước hạn' },
  { value: 2880, label: '2 ngày trước hạn' },
  { value: 10080, label: '1 tuần trước hạn' },
];

export function TaskFormModal({
  open, onClose, initial, departments, employees, currentEmployeeId, canAssign, onSaved,
}: {
  open: boolean;
  onClose: () => void;
  initial: TaskFormValue | null;
  departments: { id: number; name: string; level: number }[];
  employees: { id: number; fullName: string; code: string; avatarUrl: string | null }[];
  currentEmployeeId: number;
  canAssign: boolean;
  onSaved: (id?: number) => void;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<TaskFormValue>(initial ?? empty);
  const [checklistDraft, setChecklistDraft] = useState('');

  useEffect(() => {
    if (open) {
      setForm(initial ?? { ...empty, assigneeId: canAssign ? null : currentEmployeeId });
      setChecklistDraft('');
    }
  }, [open, initial, canAssign, currentEmployeeId]);

  const submit = () => {
    startTransition(async () => {
      const res = await saveTaskAction(form.id ?? null, {
        ...form,
        estimateHours: form.estimateHours ? Number(form.estimateHours) : null,
        reminderOffsetMinutes: form.reminderOffsetMinutes || null,
      });
      if (res.ok) { toast.success(res.message); onSaved(res.id); }
      else toast.error(res.message);
    });
  };

  const addChecklistItem = () => {
    if (!checklistDraft.trim()) return;
    setForm((f) => ({ ...f, checklist: [...f.checklist, checklistDraft.trim()] }));
    setChecklistDraft('');
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={form.id ? 'Cập nhật công việc' : 'Tạo công việc mới'}
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button variant="primary" onClick={submit} loading={pending}>{form.id ? 'Lưu thay đổi' : 'Tạo công việc'}</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Tiêu đề" required className="span-2">
          <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="vd: Hoàn thiện báo cáo doanh thu quý" autoFocus />
        </Field>

        <Field label="Mô tả chi tiết" className="span-2">
          <Textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Yêu cầu, tiêu chí nghiệm thu…" />
        </Field>

        <Field label="Người thực hiện" hint={canAssign ? undefined : 'Bạn chỉ được tạo việc cho chính mình'}>
          <Select
            value={form.assigneeId ?? ''}
            disabled={!canAssign}
            onChange={(e) => setForm((f) => ({ ...f, assigneeId: e.target.value ? Number(e.target.value) : null }))}
          >
            <option value="">— Chưa giao —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName} ({e.code})</option>)}
          </Select>
        </Field>

        <Field label="Người nghiệm thu">
          <Select value={form.reviewerId ?? ''} onChange={(e) => setForm((f) => ({ ...f, reviewerId: e.target.value ? Number(e.target.value) : null }))}>
            <option value="">— Không yêu cầu —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
          </Select>
        </Field>

        <Field label="Phòng ban phụ trách">
          <Select value={form.departmentId ?? ''} onChange={(e) => setForm((f) => ({ ...f, departmentId: e.target.value ? Number(e.target.value) : null }))}>
            <option value="">— Theo phòng ban của bạn —</option>
            {departments.map((d) => <option key={d.id} value={d.id}>{'　'.repeat(d.level - 1)}{d.name}</option>)}
          </Select>
        </Field>

        <Field label="Mức ưu tiên">
          <Select value={form.priority} onChange={(e) => setForm((f) => ({ ...f, priority: e.target.value }))}>
            {Object.entries(TASK_PRIORITY).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
          </Select>
        </Field>

        <Field label="Ngày bắt đầu">
          <Input type="date" value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))} />
        </Field>

        <Field label="Hạn hoàn thành">
          <Input type="datetime-local" value={form.dueDate} onChange={(e) => setForm((f) => ({ ...f, dueDate: e.target.value }))} />
        </Field>

        <Field label="Ước lượng (giờ)">
          <Input type="number" step="0.5" min="0" value={form.estimateHours ?? ''} onChange={(e) => setForm((f) => ({ ...f, estimateHours: e.target.value ? Number(e.target.value) : null }))} />
        </Field>

        <Field label="Nhắc việc qua Zalo" hint="Tính từ hạn hoàn thành">
          <Select value={form.reminderOffsetMinutes ?? 0} onChange={(e) => setForm((f) => ({ ...f, reminderOffsetMinutes: Number(e.target.value) }))}>
            {REMINDER_OPTIONS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
          </Select>
        </Field>

        {form.id && (
          <>
            <Field label="Trạng thái">
              <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
                {Object.entries(TASK_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
              </Select>
            </Field>
            <Field label={`Tiến độ: ${form.progress}%`}>
              <input
                type="range" min={0} max={100} step={5} value={form.progress}
                onChange={(e) => setForm((f) => ({ ...f, progress: Number(e.target.value) }))}
                style={{ width: '100%', accentColor: 'var(--brand)' }}
              />
            </Field>
          </>
        )}

        <Field label="Nhãn (phân cách bởi dấu phẩy)" className="span-2">
          <Input value={form.tags} onChange={(e) => setForm((f) => ({ ...f, tags: e.target.value }))} placeholder="báo cáo, quý 4" />
        </Field>

        {!form.id && (
          <Field label="Checklist công việc" className="span-2" hint="Tiến độ sẽ tự tính theo số mục đã hoàn thành">
            <div className="row" style={{ gap: 7 }}>
              <Input
                value={checklistDraft}
                onChange={(e) => setChecklistDraft(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addChecklistItem(); } }}
                placeholder="Thêm một bước rồi nhấn Enter…"
              />
              <Button variant="secondary" iconOnly onClick={addChecklistItem}><Plus /></Button>
            </div>
            {form.checklist.length > 0 && (
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 8 }}>
                {form.checklist.map((item, i) => (
                  <Badge key={i} tone="outline">
                    {item}
                    <button
                      onClick={() => setForm((f) => ({ ...f, checklist: f.checklist.filter((_, idx) => idx !== i) }))}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', display: 'flex', color: 'inherit', padding: 0 }}
                      aria-label="Xóa"
                    >
                      <X size={11} />
                    </button>
                  </Badge>
                ))}
              </div>
            )}
          </Field>
        )}

        <Field label="Người theo dõi" className="span-2" hint="Nhận thông báo khi công việc thay đổi">
          <div style={{ maxHeight: 130, overflowY: 'auto', border: '1px solid var(--border-base)', borderRadius: 'var(--radius-md)', padding: 10, display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(180px, 1fr))', gap: 4 }}>
            {employees.map((e) => (
              <label key={e.id} className="row" style={{ gap: 7, fontSize: 12.5 }}>
                <Checkbox
                  checked={form.watcherIds.includes(e.id)}
                  onChange={(ev) => setForm((f) => ({
                    ...f,
                    watcherIds: ev.target.checked ? [...f.watcherIds, e.id] : f.watcherIds.filter((x) => x !== e.id),
                  }))}
                />
                {e.fullName}
              </label>
            ))}
          </div>
        </Field>
      </div>
    </Modal>
  );
}
