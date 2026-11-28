'use client';

import { useEffect, useState, useTransition } from 'react';
import { Plus, X, LayoutTemplate } from 'lucide-react';
import { Button, Field, Input, Select, SearchableSelect, Textarea, Checkbox, Badge } from '@/components/ui';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { TASK_STATUS, TASK_PRIORITY } from '@/lib/enums';
import { saveTaskAction } from '@/server/modules/task/actions';
import { listTaskTemplatesAction, saveTaskTemplateAction, type TaskTemplateDto } from '@/server/modules/task/template-actions';

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
  /** Quy tắc lặp, rỗng = không lặp. */
  recurrenceRule?: string;
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
  open, onClose, initial, departments, employees, currentEmployeeId, canAssign, onSaved, parentTaskLabel,
}: {
  open: boolean;
  onClose: () => void;
  initial: TaskFormValue | null;
  departments: { id: number; name: string; level: number }[];
  employees: { id: number; fullName: string; code: string; avatarUrl: string | null }[];
  currentEmployeeId: number;
  canAssign: boolean;
  onSaved: (id?: number) => void;
  parentTaskLabel?: string | null;
}) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState<TaskFormValue>(initial ?? empty);
  const [checklistDraft, setChecklistDraft] = useState('');
  const [templates, setTemplates] = useState<TaskTemplateDto[]>([]);
  const [templateId, setTemplateId] = useState('');

  useEffect(() => {
    if (open) {
      setForm(initial ?? { ...empty, assigneeId: canAssign ? null : currentEmployeeId });
      setChecklistDraft('');
      setTemplateId('');
      // Mẫu chỉ cần khi tạo mới — tải lười để không làm chậm mở form sửa
      if (!initial?.id) listTaskTemplatesAction().then(setTemplates).catch(() => setTemplates([]));
    }
  }, [open, initial, canAssign, currentEmployeeId]);

  const applyTemplate = (id: string) => {
    setTemplateId(id);
    const t = templates.find((x) => String(x.id) === id);
    if (!t) return;
    setForm((f) => ({
      ...f,
      title: t.title,
      description: t.description,
      priority: t.priority,
      estimateHours: t.estimateHours,
      tags: t.tags,
      checklist: [...t.checklist],
    }));
  };

  const saveAsTemplate = () => {
    const name = window.prompt('Tên mẫu công việc', form.title)?.trim();
    if (!name) return;
    startTransition(async () => {
      const res = await saveTaskTemplateAction({
        name, title: form.title, description: form.description, priority: form.priority as 'MEDIUM',
        estimateHours: form.estimateHours ? Number(form.estimateHours) : null, checklist: form.checklist, tags: form.tags,
      });
      if (res.ok) { toast.success(res.message); listTaskTemplatesAction().then(setTemplates).catch(() => {}); }
      else toast.error(res.message);
    });
  };

  const submit = () => {
    startTransition(async () => {
      const res = await saveTaskAction(form.id ?? null, {
        ...form,
        estimateHours: form.estimateHours ? Number(form.estimateHours) : null,
        reminderOffsetMinutes: form.reminderOffsetMinutes || null,
        recurrenceRule: form.recurrenceRule ?? null,
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
      title={form.id ? 'Cập nhật công việc' : parentTaskLabel ? 'Tạo công việc con' : 'Tạo công việc mới'}
      description={parentTaskLabel ? `Thuộc công việc cha: ${parentTaskLabel}` : undefined}
      size="lg"
      footer={
        <>
          {form.title.trim() && (
            <Button variant="ghost" onClick={saveAsTemplate} disabled={pending} style={{ marginRight: 'auto' }} title="Lưu tiêu đề, mô tả, ưu tiên và checklist để lần sau tạo nhanh">
              <LayoutTemplate /> Lưu thành mẫu
            </Button>
          )}
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button variant="primary" onClick={submit} loading={pending}>{form.id ? 'Lưu thay đổi' : 'Tạo công việc'}</Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        {!form.id && templates.length > 0 && (
          <Field label="Dùng mẫu" className="span-2" hint="Điền sẵn tiêu đề, mô tả, ưu tiên và checklist — vẫn sửa được trước khi tạo">
            <SearchableSelect
              value={templateId}
              onChange={applyTemplate}
              options={[{ value: '', label: '— Không dùng mẫu —' }, ...templates.map((t) => ({ value: String(t.id), label: t.name, subLabel: t.isOwn ? 'Của bạn' : 'Dùng chung' }))]}
              placeholder="— Không dùng mẫu —"
              searchPlaceholder="Tìm mẫu…"
            />
          </Field>
        )}
        <Field label="Tiêu đề" required className="span-2">
          <Input value={form.title} onChange={(e) => setForm((f) => ({ ...f, title: e.target.value }))} placeholder="vd: Hoàn thiện báo cáo doanh thu quý" autoFocus />
        </Field>

        <Field label="Mô tả chi tiết" className="span-2">
          <Textarea rows={3} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} placeholder="Yêu cầu, tiêu chí nghiệm thu…" />
        </Field>

        <Field label="Người thực hiện" hint={canAssign ? undefined : 'Bạn chỉ được tạo việc cho chính mình'}>
          <SearchableSelect
            value={form.assigneeId ? String(form.assigneeId) : ''}
            disabled={!canAssign}
            onChange={(val) => setForm((f) => ({ ...f, assigneeId: val ? Number(val) : null }))}
            options={[
              { value: '', label: '— Chưa giao —' },
              ...employees.map((e) => ({ value: String(e.id), label: e.fullName, subLabel: e.code })),
            ]}
            placeholder="— Chưa giao —"
            searchPlaceholder="Tìm nhân sự…"
          />
        </Field>

        <Field label="Người nghiệm thu">
          <SearchableSelect
            value={form.reviewerId ? String(form.reviewerId) : ''}
            onChange={(val) => setForm((f) => ({ ...f, reviewerId: val ? Number(val) : null }))}
            options={[
              { value: '', label: '— Không yêu cầu —' },
              ...employees.map((e) => ({ value: String(e.id), label: e.fullName, subLabel: e.code })),
            ]}
            placeholder="— Không yêu cầu —"
            searchPlaceholder="Tìm nhân sự…"
          />
        </Field>

        <Field label="Phòng ban phụ trách">
          <SearchableSelect
            value={form.departmentId ? String(form.departmentId) : ''}
            onChange={(val) => setForm((f) => ({ ...f, departmentId: val ? Number(val) : null }))}
            options={[
              { value: '', label: '— Theo phòng ban của bạn —' },
              ...departments.map((d) => ({ value: String(d.id), label: `${'　'.repeat(d.level - 1)}${d.name}` })),
            ]}
            placeholder="— Theo phòng ban của bạn —"
            searchPlaceholder="Tìm phòng ban…"
          />
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

        <Field label="Lặp lại" hint="Đóng việc này thì tự tạo lần kế tiếp">
          <Select value={form.recurrenceRule ?? ''} onChange={(e) => setForm((f) => ({ ...f, recurrenceRule: e.target.value }))}>
            <option value="">Không lặp</option>
            <option value="FREQ=DAILY">Hằng ngày</option>
            <option value="FREQ=WEEKLY">Hằng tuần</option>
            <option value="FREQ=WEEKLY;INTERVAL=2">2 tuần một lần</option>
            <option value="FREQ=MONTHLY">Hằng tháng</option>
            <option value="FREQ=MONTHLY;INTERVAL=3">Hằng quý (3 tháng)</option>
          </Select>
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
