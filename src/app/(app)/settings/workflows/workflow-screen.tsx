'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Pencil, Trash2, GitBranch, PlayCircle, ArrowDown, ChevronUp, ChevronDown, X,
  CheckCircle2, AlertTriangle, Star, Copy,
} from 'lucide-react';
import {
  Button, Card, CardBody, CardHeader, CardTitle, Badge, Field, Input, Select, Textarea,
  Checkbox, Switch, EmptyState, PageHeader, Divider, Alert, Avatar,
} from '@/components/ui';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { APPROVER_TYPE, STEP_MODE } from '@/lib/enums';
import {
  saveWorkflowAction, deleteWorkflowAction, simulateWorkflowAction, assignWorkflowToLeaveTypeAction,
} from '@/server/modules/workflow/actions';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface StepForm {
  stepOrder: number;
  name: string;
  approverType: string;
  roleId: number | null;
  positionRank: number | null;
  specificEmployeeId: number | null;
  chainLevel: number | null;
  mode: string;
  conditionField: string;
  conditionOp: string;
  conditionValue: string;
  slaHours: number | null;
  allowDelegate: boolean;
  skipIfSameAsRequester: boolean;
  skipIfNoApprover: boolean;
}

const emptyStep = (order: number): StepForm => ({
  stepOrder: order, name: `Bước duyệt ${order}`, approverType: 'DIRECT_MANAGER',
  roleId: null, positionRank: null, specificEmployeeId: null, chainLevel: 1,
  mode: 'SEQUENTIAL', conditionField: '', conditionOp: '', conditionValue: '',
  slaHours: 24, allowDelegate: true, skipIfSameAsRequester: true, skipIfNoApprover: true,
});

const emptyForm = {
  code: '', name: '', description: '', entityType: 'LEAVE', isActive: true, isDefault: false,
  appliesDepartmentIds: [] as number[], appliesLeaveTypeCodes: [] as string[],
  steps: [emptyStep(1)],
};

const CONDITION_FIELDS = [
  { value: '', label: 'Luôn chạy (không điều kiện)' },
  { value: 'totalDays', label: 'Số ngày nghỉ' },
  { value: 'leaveTypeCode', label: 'Mã loại nghỉ phép' },
  { value: 'departmentId', label: 'Phòng ban (ID)' },
  { value: 'isPaid', label: 'Nghỉ có lương' },
];

const CONDITION_OPS = [
  { value: '>', label: 'lớn hơn' }, { value: '>=', label: 'từ' },
  { value: '<', label: 'nhỏ hơn' }, { value: '<=', label: 'không quá' },
  { value: '==', label: 'bằng' }, { value: '!=', label: 'khác' },
  { value: 'in', label: 'thuộc danh sách' }, { value: 'not_in', label: 'không thuộc' },
];

const ENTITY_LABELS: Record<string, string> = {
  LEAVE: 'Nghỉ phép', OVERTIME: 'Làm thêm giờ',
  ATTENDANCE_ADJUST: 'Điều chỉnh công', TASK_CLOSE: 'Nghiệm thu công việc',
};

export function WorkflowScreen({
  definitions, roles, positions, employees, leaveTypes, departments, canManage,
}: {
  definitions: any[];
  roles: { id: number; name: string; code: string }[];
  positions: { id: number; name: string; rankLevel: number }[];
  employees: { id: number; fullName: string; code: string }[];
  leaveTypes: { id: number; code: string; name: string; workflowDefinitionId: number | null }[];
  departments: { id: number; name: string; level: number }[];
  canManage: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<any | null>(definitions[0] ?? null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<typeof emptyForm>(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState<any | null>(null);

  const [simOpen, setSimOpen] = useState(false);
  const [simInput, setSimInput] = useState({ requesterId: employees[0]?.id ?? 0, totalDays: 2, leaveTypeCode: 'ANNUAL' });
  const [simResult, setSimResult] = useState<any[] | null>(null);

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setModalOpen(true);
  };

  const openEdit = (def: any) => {
    const applies = def.appliesToJson ?? {};
    setForm({
      code: def.code, name: def.name, description: def.description ?? '', entityType: def.entityType,
      isActive: def.isActive, isDefault: def.isDefault,
      appliesDepartmentIds: applies.departmentIds ?? [],
      appliesLeaveTypeCodes: applies.leaveTypeCodes ?? [],
      steps: def.steps.map((s: any, i: number) => ({
        stepOrder: i + 1, name: s.name, approverType: s.approverType,
        roleId: s.roleId, positionRank: s.positionRank, specificEmployeeId: s.specificEmployeeId,
        chainLevel: s.chainLevel ?? 1, mode: s.mode,
        conditionField: s.conditionJson?.field ?? '',
        conditionOp: s.conditionJson?.op ?? '',
        conditionValue: s.conditionJson?.value != null ? String(s.conditionJson.value) : '',
        slaHours: s.slaHours, allowDelegate: s.allowDelegate,
        skipIfSameAsRequester: s.skipIfSameAsRequester, skipIfNoApprover: s.skipIfNoApprover,
      })),
    });
    setEditingId(def.id);
    setModalOpen(true);
  };

  const duplicate = (def: any) => {
    openEdit(def);
    setEditingId(null);
    setForm((f) => ({ ...f, code: `${f.code}_COPY`, name: `${f.name} (bản sao)`, isDefault: false }));
  };

  const updateStep = (index: number, patch: Partial<StepForm>) => {
    setForm((f) => ({ ...f, steps: f.steps.map((s, i) => (i === index ? { ...s, ...patch } : s)) }));
  };

  const moveStep = (index: number, dir: -1 | 1) => {
    const target = index + dir;
    if (target < 0 || target >= form.steps.length) return;
    setForm((f) => {
      const steps = [...f.steps];
      [steps[index], steps[target]] = [steps[target], steps[index]];
      return { ...f, steps: steps.map((s, i) => ({ ...s, stepOrder: i + 1 })) };
    });
  };

  const submit = () => {
    startTransition(async () => {
      const res = await saveWorkflowAction(editingId, form);
      if (res.ok) { toast.success(res.message); setModalOpen(false); router.refresh(); }
      else toast.error(res.message);
    });
  };

  const runSimulation = () => {
    if (!selected) return;
    startTransition(async () => {
      const res = await simulateWorkflowAction(selected.id, simInput.requesterId, {
        totalDays: Number(simInput.totalDays),
        leaveTypeCode: simInput.leaveTypeCode,
        departmentId: null,
      });
      if (res.ok) setSimResult(res.steps);
      else toast.error(res.message);
    });
  };

  return (
    <div className="stack">
      <PageHeader
        title="Quy trình duyệt"
        description="Thiết kế chuỗi bước duyệt động theo loại đơn, phòng ban và điều kiện dữ liệu"
        actions={canManage ? <Button variant="primary" onClick={openCreate}><Plus /> Tạo quy trình</Button> : undefined}
      />

      {/* Thanh chọn quy trình dạng Tabs / Pills ngang */}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        <span style={{ fontSize: 13, fontWeight: 650, color: 'var(--text-muted)', marginRight: 2 }}>
          Quy trình:
        </span>
        {definitions.map((def) => {
          const isSel = selected?.id === def.id;
          return (
            <button
              key={def.id}
              type="button"
              className={cn('btn btn-sm', isSel ? 'btn-primary' : 'btn-secondary')}
              onClick={() => { setSelected(def); setSimResult(null); }}
              style={{
                gap: 8,
                borderRadius: 'var(--radius-full)',
                padding: '6px 14px',
                transition: 'all 0.15s ease',
              }}
            >
              <GitBranch size={14} style={{ color: isSel ? '#fff' : (def.isActive ? 'var(--brand)' : 'var(--text-faint)') }} />
              <span style={{ fontWeight: 600 }}>{def.name}</span>
              {def.isDefault && (
                <Star
                  size={12}
                  style={{
                    color: isSel ? '#fff' : 'var(--warning)',
                    fill: isSel ? '#fff' : 'var(--warning)',
                  }}
                />
              )}
              <span
                style={{
                  fontSize: 11,
                  padding: '1px 7px',
                  borderRadius: 10,
                  background: isSel ? 'rgba(255,255,255,0.22)' : 'var(--surface-sunken)',
                  color: isSel ? '#fff' : 'var(--text-muted)',
                  fontWeight: 600,
                }}
              >
                {def.steps.length} bước
              </span>
              {!def.isActive && (
                <span
                  style={{
                    fontSize: 10.5,
                    padding: '1px 6px',
                    borderRadius: 10,
                    background: isSel ? 'rgba(255,255,255,0.18)' : 'var(--danger-soft)',
                    color: isSel ? '#fff' : 'var(--danger)',
                  }}
                >
                  Tắt
                </span>
              )}
            </button>
          );
        })}

        {canManage && (
          <Button
            size="sm"
            variant="ghost"
            onClick={openCreate}
            style={{ borderRadius: 'var(--radius-full)', gap: 5 }}
          >
            <Plus size={14} /> Thêm quy trình
          </Button>
        )}
      </div>

      {selected ? (
        <>
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{selected.name}</CardTitle>
                <div className="card-subtitle">
                  Mã {selected.code} · {ENTITY_LABELS[selected.entityType]} · {selected._count.instances} đơn đã chạy
                </div>
              </div>
              {canManage && (
                <div className="toolbar">
                  <Button size="sm" variant="soft" onClick={() => { setSimResult(null); setSimOpen(true); }}><PlayCircle /> Mô phỏng</Button>
                  <Button size="sm" variant="secondary" onClick={() => duplicate(selected)}><Copy /> Nhân bản</Button>
                  <Button size="sm" variant="secondary" onClick={() => openEdit(selected)}><Pencil /> Sửa</Button>
                  <Button size="sm" variant="danger-soft" iconOnly onClick={() => setConfirmDelete(selected)}><Trash2 /></Button>
                </div>
              )}
            </CardHeader>
            <CardBody>
              {selected.description && <p style={{ fontSize: 13, color: 'var(--text-base)', marginBottom: 14 }}>{selected.description}</p>}

              <div className="row" style={{ gap: 6, flexWrap: 'wrap', marginBottom: 16 }}>
                <Badge tone={selected.isActive ? 'success' : 'neutral'} dot>{selected.isActive ? 'Đang áp dụng' : 'Đã tắt'}</Badge>
                {selected.isDefault && <Badge tone="warning">Quy trình mặc định</Badge>}
                {selected.appliesToJson?.leaveTypeCodes?.length > 0 && (
                  <Badge tone="outline">Áp dụng cho: {selected.appliesToJson.leaveTypeCodes.join(', ')}</Badge>
                )}
              </div>

              <div className="timeline">
                {selected.steps.map((step: any, i: number) => (
                  <div key={step.id} className="timeline-item">
                    <span className="timeline-dot" data-state="pending">{i + 1}</span>
                    <div style={{ flex: 1 }}>
                      <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                        <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-strong)' }}>{step.name}</span>
                        <Badge tone="brand">{APPROVER_TYPE[step.approverType]?.label}</Badge>
                        <Badge tone="outline">{STEP_MODE[step.mode]}</Badge>
                        {step.slaHours && <Badge tone="outline">SLA {step.slaHours}h</Badge>}
                      </div>
                      <div className="hint" style={{ marginTop: 3 }}>
                        {step.approverType === 'ROLE' && `Vai trò: ${roles.find((r) => r.id === step.roleId)?.name ?? '—'}`}
                        {step.approverType === 'POSITION_RANK' && `Chức danh từ cấp bậc ${step.positionRank} trở lên`}
                        {step.approverType === 'SPECIFIC_USER' && `Người duyệt: ${employees.find((e) => e.id === step.specificEmployeeId)?.fullName ?? '—'}`}
                        {step.approverType === 'MANAGER_CHAIN_LEVEL' && `Leo lên ${step.chainLevel} cấp quản lý`}
                        {['DIRECT_MANAGER', 'DEPT_HEAD', 'PARENT_DEPT_HEAD', 'HR'].includes(step.approverType) && APPROVER_TYPE[step.approverType]?.description}
                      </div>
                      {step.conditionJson && (
                        <div style={{ marginTop: 5 }}>
                          <Badge tone="warning">
                            Điều kiện: {CONDITION_FIELDS.find((f) => f.value === step.conditionJson.field)?.label ?? step.conditionJson.field}
                            {' '}{CONDITION_OPS.find((o) => o.value === step.conditionJson.op)?.label ?? step.conditionJson.op}
                            {' '}{Array.isArray(step.conditionJson.value) ? step.conditionJson.value.join(', ') : String(step.conditionJson.value)}
                          </Badge>
                        </div>
                      )}
                    </div>
                  </div>
                ))}
                <div className="timeline-item">
                  <span className="timeline-dot" data-state="approved"><CheckCircle2 size={12} /></span>
                  <div style={{ fontSize: 13.5, fontWeight: 560, color: 'var(--success)' }}>Đơn được duyệt</div>
                </div>
              </div>
            </CardBody>
          </Card>

          {selected.entityType === 'LEAVE' && canManage && (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>Gán quy trình cho loại nghỉ phép</CardTitle>
                  <div className="card-subtitle">Mỗi loại nghỉ có thể dùng một quy trình riêng hoặc kế thừa quy trình mặc định</div>
                </div>
              </CardHeader>
              <CardBody style={{ padding: 0 }}>
                <div className="table-wrap">
                  <table className="table">
                    <thead>
                      <tr>
                        <th style={{ width: '45%' }}>Loại nghỉ phép</th>
                        <th style={{ width: '40%' }}>Quy trình duyệt áp dụng</th>
                        <th style={{ width: '15%', textAlign: 'right' }}>Trạng thái</th>
                      </tr>
                    </thead>
                    <tbody>
                      {leaveTypes.map((lt) => {
                        const isCustom = Boolean(lt.workflowDefinitionId);
                        return (
                          <tr key={lt.id}>
                            <td>
                              <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{lt.name}</div>
                              <div className="hint">{lt.code}</div>
                            </td>
                            <td>
                              <Select
                                sizeSm
                                style={{ width: '100%', maxWidth: 320 }}
                                value={lt.workflowDefinitionId ?? ''}
                                onChange={(e) => startTransition(async () => {
                                  const res = await assignWorkflowToLeaveTypeAction(lt.id, e.target.value ? Number(e.target.value) : null);
                                  res.ok ? toast.success(res.message) : toast.error(res.message);
                                  router.refresh();
                                })}
                              >
                                <option value="">— Quy trình mặc định —</option>
                                {definitions.filter((d) => d.entityType === 'LEAVE').map((d) => (
                                  <option key={d.id} value={d.id}>{d.name}</option>
                                ))}
                              </Select>
                            </td>
                            <td style={{ textAlign: 'right' }}>
                              {isCustom ? (
                                <Badge tone="brand">Quy trình riêng</Badge>
                              ) : (
                                <Badge tone="neutral">Mặc định</Badge>
                              )}
                            </td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>
              </CardBody>
            </Card>
          )}
        </>
      ) : (
        <Card><CardBody><EmptyState icon={<GitBranch size={20} />} title="Chưa có quy trình nào" description="Tạo quy trình duyệt đầu tiên." /></CardBody></Card>
      )}

      {/* Modal thiết kế quy trình */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Sửa quy trình duyệt' : 'Tạo quy trình duyệt'}
        size="xl"
        footer={
          <>
            <span className="hint" style={{ marginRight: 'auto' }}>{form.steps.length} bước duyệt</span>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button variant="primary" onClick={submit} loading={pending}>{editingId ? 'Lưu thay đổi' : 'Tạo quy trình'}</Button>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
          <Field label="Tên quy trình" required>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="vd: Duyệt nghỉ phép khối kỹ thuật" />
          </Field>
          <Field label="Mã quy trình" required>
            <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') }))} placeholder="LEAVE_TECH" />
          </Field>
          <Field label="Loại đơn áp dụng" required>
            <Select value={form.entityType} onChange={(e) => setForm((f) => ({ ...f, entityType: e.target.value }))}>
              {Object.entries(ENTITY_LABELS).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <div className="row" style={{ gap: 18, alignItems: 'flex-end', paddingBottom: 8 }}>
            <label className="row" style={{ gap: 8, fontSize: 13 }}>
              <Switch checked={form.isActive} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
              Đang áp dụng
            </label>
            <label className="row" style={{ gap: 8, fontSize: 13 }}>
              <Switch checked={form.isDefault} onChange={(e) => setForm((f) => ({ ...f, isDefault: e.target.checked }))} />
              Mặc định
            </label>
          </div>
          <Field label="Mô tả" className="span-2">
            <Textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Field>
        </div>

        <Divider style={{ marginBottom: 14 }} />
        <div className="row-between" style={{ marginBottom: 12 }}>
          <span className="card-title">Các bước duyệt</span>
          <Button size="sm" variant="secondary" onClick={() => setForm((f) => ({ ...f, steps: [...f.steps, emptyStep(f.steps.length + 1)] }))}>
            <Plus /> Thêm bước
          </Button>
        </div>

        <div className="stack" style={{ gap: 12 }}>
          {form.steps.map((step, i) => (
            <div key={i} style={{ border: '1px solid var(--border-base)', borderRadius: 'var(--radius-lg)', padding: 14, background: 'var(--surface-sunken)' }}>
              <div className="row-between" style={{ marginBottom: 12 }}>
                <div className="row" style={{ gap: 8 }}>
                  <Badge tone="brand">Bước {i + 1}</Badge>
                  <Input
                    sizeSm value={step.name} style={{ width: 240 }}
                    onChange={(e) => updateStep(i, { name: e.target.value })}
                  />
                </div>
                <div className="row" style={{ gap: 3 }}>
                  <Button size="sm" variant="ghost" iconOnly disabled={i === 0} onClick={() => moveStep(i, -1)} aria-label="Lên"><ChevronUp /></Button>
                  <Button size="sm" variant="ghost" iconOnly disabled={i === form.steps.length - 1} onClick={() => moveStep(i, 1)} aria-label="Xuống"><ChevronDown /></Button>
                  <Button
                    size="sm" variant="ghost" iconOnly disabled={form.steps.length === 1}
                    onClick={() => setForm((f) => ({ ...f, steps: f.steps.filter((_, idx) => idx !== i).map((s, idx) => ({ ...s, stepOrder: idx + 1 })) }))}
                    aria-label="Xóa bước"
                  >
                    <X />
                  </Button>
                </div>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(190px, 1fr))', gap: 11 }}>
                <Field label="Người duyệt" hint={APPROVER_TYPE[step.approverType]?.description}>
                  <Select sizeSm value={step.approverType} onChange={(e) => updateStep(i, { approverType: e.target.value })}>
                    {Object.entries(APPROVER_TYPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
                  </Select>
                </Field>

                {step.approverType === 'ROLE' && (
                  <Field label="Vai trò">
                    <Select sizeSm value={step.roleId ?? ''} onChange={(e) => updateStep(i, { roleId: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">— Chọn vai trò —</option>
                      {roles.map((r) => <option key={r.id} value={r.id}>{r.name}</option>)}
                    </Select>
                  </Field>
                )}

                {step.approverType === 'POSITION_RANK' && (
                  <Field label="Chức danh tối thiểu">
                    <Select sizeSm value={step.positionRank ?? ''} onChange={(e) => updateStep(i, { positionRank: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">— Chọn cấp bậc —</option>
                      {positions.map((p) => <option key={p.id} value={p.rankLevel}>{p.name} (cấp {p.rankLevel})</option>)}
                    </Select>
                  </Field>
                )}

                {step.approverType === 'SPECIFIC_USER' && (
                  <Field label="Người duyệt cụ thể">
                    <Select sizeSm value={step.specificEmployeeId ?? ''} onChange={(e) => updateStep(i, { specificEmployeeId: e.target.value ? Number(e.target.value) : null })}>
                      <option value="">— Chọn nhân sự —</option>
                      {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
                    </Select>
                  </Field>
                )}

                {step.approverType === 'MANAGER_CHAIN_LEVEL' && (
                  <Field label="Số cấp leo lên">
                    <Input sizeSm type="number" min={1} max={6} value={step.chainLevel ?? 1} onChange={(e) => updateStep(i, { chainLevel: Number(e.target.value) })} />
                  </Field>
                )}

                <Field label="Chế độ duyệt">
                  <Select sizeSm value={step.mode} onChange={(e) => updateStep(i, { mode: e.target.value })}>
                    {Object.entries(STEP_MODE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
                  </Select>
                </Field>

                <Field label="SLA (giờ)" hint="Nhắc lại khi quá hạn">
                  <Input sizeSm type="number" value={step.slaHours ?? ''} onChange={(e) => updateStep(i, { slaHours: e.target.value ? Number(e.target.value) : null })} />
                </Field>
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '1.3fr 1fr 1fr', gap: 11, marginTop: 11 }}>
                <Field label="Điều kiện chạy bước">
                  <Select sizeSm value={step.conditionField} onChange={(e) => updateStep(i, { conditionField: e.target.value })}>
                    {CONDITION_FIELDS.map((f) => <option key={f.value} value={f.value}>{f.label}</option>)}
                  </Select>
                </Field>
                {step.conditionField && (
                  <>
                    <Field label="Phép so sánh">
                      <Select sizeSm value={step.conditionOp} onChange={(e) => updateStep(i, { conditionOp: e.target.value })}>
                        <option value="">— Chọn —</option>
                        {CONDITION_OPS.map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                      </Select>
                    </Field>
                    <Field label="Giá trị">
                      <Input sizeSm value={step.conditionValue} onChange={(e) => updateStep(i, { conditionValue: e.target.value })} placeholder="vd: 3" />
                    </Field>
                  </>
                )}
              </div>

              <div className="row" style={{ gap: 16, marginTop: 11, flexWrap: 'wrap' }}>
                <label className="row" style={{ gap: 7, fontSize: 12.5 }}>
                  <Checkbox checked={step.skipIfSameAsRequester} onChange={(e) => updateStep(i, { skipIfSameAsRequester: e.target.checked })} />
                  Bỏ qua nếu người duyệt là người nộp đơn
                </label>
                <label className="row" style={{ gap: 7, fontSize: 12.5 }}>
                  <Checkbox checked={step.skipIfNoApprover} onChange={(e) => updateStep(i, { skipIfNoApprover: e.target.checked })} />
                  Bỏ qua nếu không tìm được người duyệt
                </label>
                <label className="row" style={{ gap: 7, fontSize: 12.5 }}>
                  <Checkbox checked={step.allowDelegate} onChange={(e) => updateStep(i, { allowDelegate: e.target.checked })} />
                  Cho phép ủy quyền
                </label>
              </div>

              {i < form.steps.length - 1 && (
                <div style={{ textAlign: 'center', marginTop: 10, color: 'var(--text-faint)' }}><ArrowDown size={15} /></div>
              )}
            </div>
          ))}
        </div>
      </Modal>

      {/* Modal mô phỏng */}
      <Modal
        open={simOpen}
        onClose={() => setSimOpen(false)}
        title={`Mô phỏng quy trình: ${selected?.name ?? ''}`}
        description="Xem trước chuỗi người duyệt thực tế với dữ liệu giả định — tránh cấu hình sai gây kẹt đơn"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setSimOpen(false)}>Đóng</Button>
            <Button variant="primary" onClick={runSimulation} loading={pending}><PlayCircle /> Chạy mô phỏng</Button>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr 1fr', gap: 12, marginBottom: 16 }}>
          <Field label="Người nộp đơn giả định">
            <Select value={simInput.requesterId} onChange={(e) => setSimInput((s) => ({ ...s, requesterId: Number(e.target.value) }))}>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName} ({e.code})</option>)}
            </Select>
          </Field>
          <Field label="Số ngày nghỉ">
            <Input type="number" step="0.5" value={simInput.totalDays} onChange={(e) => setSimInput((s) => ({ ...s, totalDays: Number(e.target.value) }))} />
          </Field>
          <Field label="Loại nghỉ">
            <Select value={simInput.leaveTypeCode} onChange={(e) => setSimInput((s) => ({ ...s, leaveTypeCode: e.target.value }))}>
              {leaveTypes.map((t) => <option key={t.id} value={t.code}>{t.name}</option>)}
            </Select>
          </Field>
        </div>

        {simResult === null ? (
          <Alert tone="info"><PlayCircle /> Nhấn &ldquo;Chạy mô phỏng&rdquo; để xem chuỗi người duyệt thực tế.</Alert>
        ) : (
          <div className="timeline">
            {simResult.map((s) => (
              <div key={s.stepOrder} className="timeline-item">
                <span className="timeline-dot" data-state={s.willRun ? 'current' : 'pending'}>
                  {s.willRun ? s.stepOrder : <X size={12} />}
                </span>
                <div style={{ flex: 1, opacity: s.willRun ? 1 : 0.55 }}>
                  <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-strong)' }}>{s.name}</span>
                    <Badge tone="brand">{s.approverTypeLabel}</Badge>
                    {s.slaHours && <Badge tone="outline">SLA {s.slaHours}h</Badge>}
                  </div>
                  {s.condition && <div className="hint" style={{ marginTop: 3 }}>Điều kiện: {s.condition}</div>}
                  {s.willRun ? (
                    <div className="row" style={{ gap: 6, marginTop: 6, flexWrap: 'wrap' }}>
                      {s.approvers.map((a: any) => (
                        <div key={a.id} className="row" style={{ gap: 6, background: 'var(--surface-sunken)', padding: '3px 9px 3px 3px', borderRadius: 'var(--radius-full)' }}>
                          <Avatar name={a.fullName} size="sm" />
                          <span style={{ fontSize: 12.5 }}>{a.fullName}</span>
                        </div>
                      ))}
                    </div>
                  ) : (
                    <div className="row" style={{ gap: 5, marginTop: 5, color: 'var(--warning)', fontSize: 12.5 }}>
                      <AlertTriangle size={12} /> {s.skipReason}
                    </div>
                  )}
                </div>
              </div>
            ))}
            <div className="timeline-item">
              <span className="timeline-dot" data-state="approved"><CheckCircle2 size={12} /></span>
              <div style={{ fontSize: 13.5, fontWeight: 560, color: 'var(--success)' }}>
                Đơn được duyệt sau {simResult.filter((s) => s.willRun).length} bước
              </div>
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={() => startTransition(async () => {
          const res = await deleteWorkflowAction(confirmDelete.id);
          res.ok ? toast.success(res.message) : toast.error(res.message);
          setConfirmDelete(null);
          router.refresh();
        })}
        loading={pending}
        danger
        title="Xóa quy trình duyệt"
        confirmText="Xóa"
        message={<>Xóa quy trình <b>{confirmDelete?.name}</b>? Các đơn đã hoàn tất vẫn giữ lịch sử duyệt.</>}
      />
    </div>
  );
}
