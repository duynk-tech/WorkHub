'use client';

import { useMemo, useState, useTransition, type ReactNode } from 'react';
import {
  ChevronRight, Plus, Pencil, Trash2, Users, Building2, Layers, UserX,
  Wrench, Hash, Network,
} from 'lucide-react';
import type { DepartmentNode } from '@/server/modules/org/department-service';
import {
  saveDepartmentAction, deleteDepartmentAction, repairTreeAction, type DepartmentFormInput,
} from '@/server/modules/org/department-actions';
import {
  Button, Card, CardBody, CardHeader, CardTitle, Badge, Field, Input, Select, Textarea,
  StatCard, EmptyState, SearchInput, Avatar, Switch, Divider,
} from '@/components/ui';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { slugifyCode } from '@/lib/utils';

interface EmployeeLite { id: number; fullName: string; code: string; departmentId: number | null }

interface Props {
  tree: DepartmentNode[];
  employees: EmployeeLite[];
  stats: { total: number; maxLevel: number; employees: number; withoutManager: number };
  canManage: boolean;
  icon: ReactNode;
}

const emptyForm: DepartmentFormInput = {
  code: '', name: '', parentId: null, managerId: null,
  email: '', phone: '', costCenter: '', description: '', sortOrder: 0, isActive: true,
};

function flatten(nodes: DepartmentNode[], out: DepartmentNode[] = []) {
  for (const n of nodes) { out.push(n); flatten(n.children, out); }
  return out;
}

export function DepartmentManager({ tree, employees, stats, canManage }: Props) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<DepartmentNode | null>(flatten(tree)[0] ?? null);
  const [expanded, setExpanded] = useState<Set<number>>(() => new Set(flatten(tree).filter((n) => n.level <= 2).map((n) => n.id)));
  const [search, setSearch] = useState('');
  const [modal, setModal] = useState<{ open: boolean; editing: DepartmentNode | null; parentId: number | null }>({ open: false, editing: null, parentId: null });
  const [form, setForm] = useState<DepartmentFormInput>(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState<DepartmentNode | null>(null);

  const allNodes = useMemo(() => flatten(tree), [tree]);
  const employeesOfSelected = useMemo(
    () => (selected ? employees.filter((e) => e.departmentId === selected.id) : []),
    [employees, selected],
  );

  const matches = useMemo(() => {
    if (!search.trim()) return null;
    const q = search.trim().toLowerCase();
    return new Set(allNodes.filter((n) => n.name.toLowerCase().includes(q) || n.code.toLowerCase().includes(q)).map((n) => n.id));
  }, [search, allNodes]);

  const visibleIds = useMemo(() => {
    if (!matches) return null;
    const ids = new Set<number>();
    for (const node of allNodes) {
      if (!matches.has(node.id)) continue;
      ids.add(node.id);
      node.path.split('/').filter(Boolean).forEach((p) => ids.add(Number(p)));  // hiện cả tổ tiên
      flatten(node.children).forEach((c) => ids.add(c.id));
    }
    return ids;
  }, [matches, allNodes]);

  const toggle = (id: number) => {
    setExpanded((prev) => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
  };

  const openCreate = (parentId: number | null) => {
    setForm({ ...emptyForm, parentId });
    setModal({ open: true, editing: null, parentId });
  };

  const openEdit = (node: DepartmentNode) => {
    setForm({
      code: node.code, name: node.name, parentId: node.parentId, managerId: node.managerId,
      email: '', phone: '', costCenter: '', description: node.description ?? '',
      sortOrder: node.sortOrder, isActive: node.isActive,
    });
    setModal({ open: true, editing: node, parentId: node.parentId });
  };

  const submit = () => {
    startTransition(async () => {
      const res = await saveDepartmentAction(modal.editing?.id ?? null, form);
      if (res.ok) {
        toast.success(res.message);
        setModal({ open: false, editing: null, parentId: null });
      } else {
        toast.error(res.message);
      }
    });
  };

  const doDelete = () => {
    if (!confirmDelete) return;
    startTransition(async () => {
      const res = await deleteDepartmentAction(confirmDelete.id);
      res.ok ? toast.success(res.message) : toast.error(res.message);
      if (res.ok && selected?.id === confirmDelete.id) setSelected(null);
      setConfirmDelete(null);
    });
  };

  const repair = () => {
    startTransition(async () => {
      const res = await repairTreeAction();
      res.ok ? toast.success(res.message) : toast.error(res.message);
    });
  };

  const renderNode = (node: DepartmentNode): ReactNode => {
    if (visibleIds && !visibleIds.has(node.id)) return null;
    const hasChildren = node.children.length > 0;
    const isOpen = expanded.has(node.id) || Boolean(visibleIds);

    return (
      <div key={node.id}>
        <div
          className="tree-row"
          data-selected={selected?.id === node.id}
          onClick={() => setSelected(node)}
        >
          {hasChildren ? (
            <span
              className="tree-toggle"
              data-open={isOpen}
              onClick={(e) => { e.stopPropagation(); toggle(node.id); }}
            >
              <ChevronRight size={14} />
            </span>
          ) : (
            <span style={{ width: 18, flexShrink: 0 }} />
          )}
          <Building2 size={15} style={{ color: node.isActive ? 'var(--brand)' : 'var(--text-faint)', flexShrink: 0 }} />
          <span style={{ flex: 1, minWidth: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {node.name}
          </span>
          {!node.isActive && <Badge tone="outline">Ngừng</Badge>}
          <Badge tone={node.totalEmployeeCount > 0 ? 'brand' : 'neutral'}>{node.totalEmployeeCount}</Badge>
        </div>
        {hasChildren && isOpen && (
          <div className="tree-guide">{node.children.map(renderNode)}</div>
        )}
      </div>
    );
  };

  const parentOptions = allNodes.filter((n) => {
    if (!modal.editing) return true;
    // Không cho chọn chính nó hoặc con cháu của nó làm cấp trên
    return !n.path.startsWith(modal.editing.path);
  });

  return (
    <div className="stack">
      <div className="page-header">
        <div>
          <h1 className="page-title">Quản lý phòng ban</h1>
          <p className="page-desc">Cơ cấu tổ chức phân cấp — phạm vi dữ liệu của vai trò bám theo cây này</p>
        </div>
        {canManage && (
          <div className="toolbar">
            <Button variant="secondary" onClick={repair} loading={pending}>
              <Wrench /> Kiểm tra cây
            </Button>
            <Button variant="primary" onClick={() => openCreate(null)}>
              <Plus /> Thêm phòng ban
            </Button>
          </div>
        )}
      </div>

      <div className="grid-stats">
        <StatCard label="Tổng số đơn vị" value={stats.total} icon={<Building2 size={16} />} />
        <StatCard label="Số cấp phân cấp" value={stats.maxLevel} icon={<Layers size={16} />} hint="Độ sâu lớn nhất của cây" />
        <StatCard label="Nhân sự đã phân bổ" value={stats.employees} icon={<Users size={16} />} />
        <StatCard
          label="Đơn vị chưa có trưởng" value={stats.withoutManager} icon={<UserX size={16} />}
          tone={stats.withoutManager > 0 ? 'var(--warning)' : undefined}
          hint={stats.withoutManager > 0 ? 'Ảnh hưởng tới định tuyến duyệt' : 'Đã gán đủ trưởng đơn vị'}
        />
      </div>

      <div style={{ display: 'grid', gridTemplateColumns: 'minmax(280px, 380px) 1fr', gap: 16, alignItems: 'start' }} className="dept-layout">
        <Card>
          <CardHeader>
            <CardTitle>Sơ đồ tổ chức</CardTitle>
          </CardHeader>
          <div style={{ padding: '10px 12px' }}>
            <SearchInput placeholder="Tìm phòng ban…" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div style={{ padding: '0 10px 14px', maxHeight: 560, overflowY: 'auto' }}>
            {tree.length === 0 ? (
              <EmptyState icon={<Network size={20} />} title="Chưa có phòng ban" description="Tạo đơn vị đầu tiên để bắt đầu." />
            ) : (
              tree.map(renderNode)
            )}
          </div>
        </Card>

        {selected ? (
          <Card>
            <CardHeader>
              <div>
                <CardTitle>{selected.name}</CardTitle>
                <div className="card-subtitle">
                  Mã {selected.code} · Cấp {selected.level} · {selected.children.length} đơn vị trực thuộc
                </div>
              </div>
              {canManage && (
                <div className="toolbar">
                  <Button size="sm" variant="secondary" onClick={() => openCreate(selected.id)}><Plus /> Đơn vị con</Button>
                  <Button size="sm" variant="secondary" onClick={() => openEdit(selected)}><Pencil /> Sửa</Button>
                  <Button size="sm" variant="danger-soft" iconOnly onClick={() => setConfirmDelete(selected)}><Trash2 /></Button>
                </div>
              )}
            </CardHeader>
            <CardBody>
              <div className="grid-3" style={{ marginBottom: 18 }}>
                <InfoItem icon={<Hash size={13} />} label="Mã đơn vị" value={selected.code} />
                <InfoItem icon={<Users size={13} />} label="Nhân sự trực tiếp" value={String(selected.employeeCount)} />
                <InfoItem icon={<Layers size={13} />} label="Tổng cả nhánh" value={String(selected.totalEmployeeCount)} />
                <InfoItem
                  icon={<Avatar name={selected.managerName} size="sm" />}
                  label="Trưởng đơn vị"
                  value={selected.managerName ?? 'Chưa phân công'}
                  warn={!selected.managerName}
                />
              </div>

              {selected.description && (
                <>
                  <div className="label" style={{ marginBottom: 5 }}>Mô tả</div>
                  <p style={{ fontSize: 13, color: 'var(--text-base)', marginBottom: 18 }}>{selected.description}</p>
                </>
              )}

              <Divider style={{ marginBottom: 14 }} />

              <div className="row-between" style={{ marginBottom: 10 }}>
                <span className="card-title">Nhân sự thuộc đơn vị</span>
                <Badge>{employeesOfSelected.length} người</Badge>
              </div>

              {employeesOfSelected.length === 0 ? (
                <EmptyState icon={<Users size={20} />} title="Chưa có nhân sự" description="Gán nhân sự vào đơn vị này ở màn hình Nhân sự." />
              ) : (
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                  {employeesOfSelected.map((e) => (
                    <div key={e.id} className="list-row" style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)' }}>
                      <Avatar name={e.fullName} size="sm" />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontSize: 13, fontWeight: 540, color: 'var(--text-strong)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {e.fullName}
                        </div>
                        <div className="hint">{e.code}{selected.managerId === e.id ? ' · Trưởng đơn vị' : ''}</div>
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </CardBody>
          </Card>
        ) : (
          <Card><CardBody><EmptyState icon={<Building2 size={20} />} title="Chọn một phòng ban" description="Chọn đơn vị ở sơ đồ bên trái để xem chi tiết." /></CardBody></Card>
        )}
      </div>

      <Modal
        open={modal.open}
        onClose={() => setModal({ open: false, editing: null, parentId: null })}
        title={modal.editing ? `Sửa phòng ban: ${modal.editing.name}` : 'Thêm phòng ban'}
        description="Đơn vị cấp trên quyết định vị trí trong cây tổ chức và phạm vi dữ liệu"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModal({ open: false, editing: null, parentId: null })}>Hủy</Button>
            <Button variant="primary" onClick={submit} loading={pending}>{modal.editing ? 'Lưu thay đổi' : 'Tạo phòng ban'}</Button>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Tên phòng ban" required className="span-2">
            <Input
              value={form.name}
              onChange={(e) => {
                const name = e.target.value;
                setForm((f) => ({ ...f, name, code: modal.editing ? f.code : slugifyCode(name) }));
              }}
              placeholder="vd: Phòng Phát triển phần mềm"
            />
          </Field>
          <Field label="Mã đơn vị" required hint="Dùng cho import và tích hợp">
            <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="P_DEV" />
          </Field>
          <Field label="Đơn vị cấp trên">
            <Select
              value={form.parentId ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, parentId: e.target.value ? Number(e.target.value) : null }))}
            >
              <option value="">— Cấp cao nhất —</option>
              {parentOptions.map((n) => (
                <option key={n.id} value={n.id}>{'　'.repeat(n.level - 1)}{n.name}</option>
              ))}
            </Select>
          </Field>
          <Field label="Trưởng đơn vị" hint="Dùng cho bước duyệt 'Trưởng phòng ban'">
            <Select
              value={form.managerId ?? ''}
              onChange={(e) => setForm((f) => ({ ...f, managerId: e.target.value ? Number(e.target.value) : null }))}
            >
              <option value="">— Chưa phân công —</option>
              {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName} ({e.code})</option>)}
            </Select>
          </Field>
          <Field label="Thứ tự hiển thị">
            <Input type="number" value={form.sortOrder ?? 0} onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))} />
          </Field>
          <Field label="Email đơn vị">
            <Input type="email" value={form.email ?? ''} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} placeholder="phong.dev@congty.vn" />
          </Field>
          <Field label="Điện thoại">
            <Input value={form.phone ?? ''} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </Field>
          <Field label="Mô tả" className="span-2">
            <Textarea value={form.description ?? ''} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} rows={3} />
          </Field>
          <div className="row span-2" style={{ gap: 9 }}>
            <Switch checked={form.isActive ?? true} onChange={(e) => setForm((f) => ({ ...f, isActive: e.target.checked }))} />
            <span style={{ fontSize: 13 }}>Đơn vị đang hoạt động</span>
          </div>
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        loading={pending}
        danger
        title="Xóa phòng ban"
        confirmText="Xóa"
        message={
          <>Bạn chắc chắn muốn xóa <b>{confirmDelete?.name}</b>? Thao tác này không thể hoàn tác.
            {confirmDelete && confirmDelete.employeeCount > 0 && (
              <div className="alert alert-warning" style={{ marginTop: 10 }}>
                Đơn vị còn {confirmDelete.employeeCount} nhân sự — cần chuyển sang đơn vị khác trước.
              </div>
            )}
          </>
        }
      />
    </div>
  );
}

function InfoItem({ icon, label, value, warn }: { icon: ReactNode; label: string; value: string; warn?: boolean }) {
  return (
    <div style={{ display: 'flex', gap: 9, alignItems: 'center' }}>
      <span style={{ color: 'var(--text-faint)', display: 'flex' }}>{icon}</span>
      <div>
        <div className="hint">{label}</div>
        <div style={{ fontSize: 13.5, fontWeight: 560, color: warn ? 'var(--warning)' : 'var(--text-strong)' }}>{value}</div>
      </div>
    </div>
  );
}
