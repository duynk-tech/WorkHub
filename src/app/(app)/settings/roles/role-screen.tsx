'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { Plus, Pencil, Trash2, ShieldCheck, Users, Lock, Layers, Check, X } from 'lucide-react';
import {
  Button, Card, CardBody, CardHeader, CardTitle, Badge, Field, Input, Select, Textarea,
  Checkbox, EmptyState, PageHeader, Divider,
} from '@/components/ui';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { cn } from '@/lib/utils';
import { DATA_SCOPE } from '@/lib/enums';
import { saveRoleAction, deleteRoleAction } from '@/server/modules/org/role-actions';
import type { PermissionDef } from '@/lib/permissions';

interface RoleView {
  id: number; code: string; name: string; description: string | null;
  dataScope: string; isSystem: boolean; sortOrder: number; userCount: number;
  permissions: string[]; deptIds: number[];
}

interface Props {
  roles: RoleView[];
  permissions: PermissionDef[];
  departments: { id: number; name: string; level: number }[];
  canManage: boolean;
}

const emptyForm = {
  code: '', name: '', description: '', dataScope: 'SELF', sortOrder: 50,
  permissions: [] as string[], deptIds: [] as number[],
};

export function RoleScreen({ roles, permissions, departments, canManage }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [selected, setSelected] = useState<RoleView | null>(roles[0] ?? null);
  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState<RoleView | null>(null);

  const groups = useMemo(() => {
    const map = new Map<string, PermissionDef[]>();
    for (const p of permissions) {
      if (!map.has(p.group)) map.set(p.group, []);
      map.get(p.group)!.push(p);
    }
    return Array.from(map.entries());
  }, [permissions]);

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setModalOpen(true);
  };

  const openEdit = (role: RoleView) => {
    setForm({
      code: role.code, name: role.name, description: role.description ?? '',
      dataScope: role.dataScope, sortOrder: role.sortOrder,
      permissions: [...role.permissions], deptIds: [...role.deptIds],
    });
    setEditingId(role.id);
    setModalOpen(true);
  };

  const togglePermission = (code: string) => {
    setForm((f) => ({
      ...f,
      permissions: f.permissions.includes(code) ? f.permissions.filter((c) => c !== code) : [...f.permissions, code],
    }));
  };

  const toggleGroup = (groupPerms: PermissionDef[], enable: boolean) => {
    const codes = groupPerms.map((p) => p.code);
    setForm((f) => ({
      ...f,
      permissions: enable
        ? Array.from(new Set([...f.permissions, ...codes]))
        : f.permissions.filter((c) => !codes.includes(c)),
    }));
  };

  const submit = () => {
    startTransition(async () => {
      const res = await saveRoleAction(editingId, form);
      if (res.ok) { toast.success(res.message); setModalOpen(false); router.refresh(); }
      else toast.error(res.message);
    });
  };

  const doDelete = () => {
    if (!confirmDelete) return;
    startTransition(async () => {
      const res = await deleteRoleAction(confirmDelete.id);
      res.ok ? toast.success(res.message) : toast.error(res.message);
      setConfirmDelete(null);
      router.refresh();
    });
  };

  return (
    <div className="stack">
      <PageHeader
        title="Phân quyền"
        description="Vai trò quyết định menu, thao tác và phạm vi dữ liệu người dùng được phép truy cập"
        actions={canManage ? <Button variant="primary" onClick={openCreate}><Plus /> Thêm vai trò</Button> : undefined}
      />

      {/* Horizontal pill tabs for roles list */}
      <div className="row" style={{ gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
        {roles.map((r) => {
          const isSel = selected?.id === r.id;
          return (
            <button
              key={r.id}
              type="button"
              onClick={() => setSelected(r)}
              className={cn('btn btn-sm', isSel ? 'btn-primary' : 'btn-secondary')}
              style={{
                borderRadius: 'var(--radius-full)',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 7,
                padding: '6px 14px',
                transition: 'all 0.15s ease',
              }}
            >
              <ShieldCheck
                size={14}
                style={{ color: isSel ? '#fff' : (r.isSystem ? 'var(--brand)' : 'var(--text-faint)') }}
              />
              <span style={{ fontWeight: 600 }}>{r.name}</span>
              {r.isSystem && (
                <Lock
                  size={11}
                  style={{ color: isSel ? '#fff' : 'var(--text-faint)' }}
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
                {r.permissions.length} quyền
              </span>
              {r.userCount > 0 && (
                <span
                  style={{
                    fontSize: 11,
                    padding: '1px 7px',
                    borderRadius: 10,
                    background: isSel ? 'rgba(255,255,255,0.22)' : 'var(--brand-soft)',
                    color: isSel ? '#fff' : 'var(--brand)',
                    fontWeight: 600,
                  }}
                >
                  {r.userCount} người
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
            <Plus size={14} /> Thêm vai trò
          </Button>
        )}
      </div>

      {selected ? (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>{selected.name}</CardTitle>
              <div className="card-subtitle">
                Mã {selected.code} · {selected.userCount} tài khoản đang dùng
                {selected.isSystem && ' · Vai trò hệ thống'}
              </div>
            </div>
            {canManage && (
              <div className="toolbar">
                <Button size="sm" variant="secondary" onClick={() => openEdit(selected)}><Pencil /> Sửa</Button>
                {!selected.isSystem && (
                  <Button size="sm" variant="danger-soft" iconOnly onClick={() => setConfirmDelete(selected)}><Trash2 /></Button>
                )}
              </div>
            )}
          </CardHeader>
          <CardBody>
            {selected.description && <p style={{ fontSize: 13, color: 'var(--text-base)', marginBottom: 14 }}>{selected.description}</p>}

            <div className="alert alert-info" style={{ marginBottom: 16 }}>
              <Layers />
              <div>
                <b>Phạm vi dữ liệu: {DATA_SCOPE[selected.dataScope]?.label}</b>
                <div style={{ marginTop: 2, opacity: 0.85 }}>{DATA_SCOPE[selected.dataScope]?.description}</div>
                {selected.dataScope === 'CUSTOM' && (
                  <div style={{ marginTop: 5 }}>
                    {selected.deptIds.map((id) => departments.find((d) => d.id === id)?.name).filter(Boolean).join(', ') || 'Chưa chọn phòng ban nào'}
                  </div>
                )}
              </div>
            </div>

            <Divider style={{ marginBottom: 14 }} />

            <div className="stack" style={{ gap: 14 }}>
              {groups.map(([group, perms]) => {
                const granted = perms.filter((p) => selected.permissions.includes(p.code));
                return (
                  <div key={group}>
                    <div className="row-between" style={{ marginBottom: 7 }}>
                      <span style={{ fontSize: 13, fontWeight: 620, color: 'var(--text-strong)' }}>{group}</span>
                      <Badge tone={granted.length === perms.length ? 'success' : granted.length ? 'warning' : 'neutral'}>
                        {granted.length}/{perms.length}
                      </Badge>
                    </div>
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
                      {perms.map((p) => {
                        const on = selected.permissions.includes(p.code);
                        return (
                          <span
                            key={p.code}
                            className="badge"
                            style={{
                              background: on ? 'var(--success-soft)' : 'var(--neutral-soft)',
                              color: on ? 'var(--success)' : 'var(--text-faint)',
                            }}
                            title={p.description}
                          >
                            {on ? <Check size={11} /> : <X size={11} />}
                            {p.name}
                          </span>
                        );
                      })}
                    </div>
                  </div>
                );
              })}
            </div>
          </CardBody>
        </Card>
      ) : (
        <Card><CardBody><EmptyState icon={<ShieldCheck size={20} />} title="Chọn một vai trò" /></CardBody></Card>
      )}

      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Cập nhật vai trò' : 'Tạo vai trò mới'}
        size="xl"
        footer={
          <>
            <span className="hint" style={{ marginRight: 'auto' }}>Đã chọn {form.permissions.length} quyền</span>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button variant="primary" onClick={submit} loading={pending}>{editingId ? 'Lưu thay đổi' : 'Tạo vai trò'}</Button>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14, marginBottom: 18 }}>
          <Field label="Tên vai trò" required>
            <Input value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} placeholder="vd: Trưởng nhóm dự án" />
          </Field>
          <Field label="Mã vai trò" required hint="Chữ in hoa, dùng cho tích hợp">
            <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase().replace(/[^A-Z0-9_]/g, '_') }))} placeholder="TEAM_LEAD" />
          </Field>
          <Field label="Phạm vi dữ liệu" required hint={DATA_SCOPE[form.dataScope]?.description}>
            <Select value={form.dataScope} onChange={(e) => setForm((f) => ({ ...f, dataScope: e.target.value }))}>
              {Object.entries(DATA_SCOPE).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </Field>
          <Field label="Thứ tự hiển thị">
            <Input type="number" value={form.sortOrder} onChange={(e) => setForm((f) => ({ ...f, sortOrder: Number(e.target.value) }))} />
          </Field>
          <Field label="Mô tả" className="span-2">
            <Textarea rows={2} value={form.description} onChange={(e) => setForm((f) => ({ ...f, description: e.target.value }))} />
          </Field>

          {form.dataScope === 'CUSTOM' && (
            <Field label="Phòng ban được phép truy cập" className="span-2">
              <div style={{ maxHeight: 160, overflowY: 'auto', border: '1px solid var(--border-base)', borderRadius: 'var(--radius-md)', padding: 10 }}>
                {departments.map((d) => (
                  <label key={d.id} className="row" style={{ gap: 8, fontSize: 13, padding: '3px 0' }}>
                    <Checkbox
                      checked={form.deptIds.includes(d.id)}
                      onChange={(e) => setForm((f) => ({
                        ...f,
                        deptIds: e.target.checked ? [...f.deptIds, d.id] : f.deptIds.filter((x) => x !== d.id),
                      }))}
                    />
                    <span>{'　'.repeat(d.level - 1)}{d.name}</span>
                  </label>
                ))}
              </div>
            </Field>
          )}
        </div>

        <Divider style={{ marginBottom: 14 }} />
        <div className="card-title" style={{ marginBottom: 10 }}>Danh sách quyền</div>

        <div className="stack" style={{ gap: 12 }}>
          {groups.map(([group, perms]) => {
            const all = perms.every((p) => form.permissions.includes(p.code));
            const some = perms.some((p) => form.permissions.includes(p.code));
            return (
              <div key={group} style={{ border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 12 }}>
                <div className="row-between" style={{ marginBottom: 9 }}>
                  <label className="row" style={{ gap: 8, fontSize: 13, fontWeight: 620, color: 'var(--text-strong)' }}>
                    <Checkbox checked={all} indeterminate={some && !all} onChange={(e) => toggleGroup(perms, e.target.checked)} />
                    {group}
                  </label>
                  <Badge tone={all ? 'success' : some ? 'warning' : 'neutral'}>
                    {perms.filter((p) => form.permissions.includes(p.code)).length}/{perms.length}
                  </Badge>
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(230px, 1fr))', gap: 5 }}>
                  {perms.map((p) => (
                    <label key={p.code} className="row" style={{ gap: 8, fontSize: 12.5, padding: '3px 0' }} title={p.description}>
                      <Checkbox checked={form.permissions.includes(p.code)} onChange={() => togglePermission(p.code)} />
                      <span style={{ color: p.category === 'MENU' ? 'var(--text-strong)' : 'var(--text-base)' }}>{p.name}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={doDelete}
        loading={pending}
        danger
        title="Xóa vai trò"
        confirmText="Xóa"
        message={<>Xóa vai trò <b>{confirmDelete?.name}</b>? Người dùng đang gán vai trò này sẽ mất các quyền tương ứng.</>}
      />
    </div>
  );
}
