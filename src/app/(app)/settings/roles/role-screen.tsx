'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, Pencil, Trash2, ShieldCheck, Users, Lock, Layers, Check, X,
  ListChecks, LayoutGrid, RefreshCw,
} from 'lucide-react';
import {
  Button, Card, CardBody, CardHeader, CardTitle, Badge, Field, Input, Select, Textarea,
  Checkbox, EmptyState, PageHeader, Divider, SearchInput, Switch, StatCard,
} from '@/components/ui';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { DATA_SCOPE } from '@/lib/enums';
import { NAV_SECTIONS } from '@/lib/nav';
import { DISABLED_MENUS_KEY, PROTECTED_MENU_HREFS } from '@/lib/menu-config';
import { saveRoleAction, deleteRoleAction } from '@/server/modules/org/role-actions';
import { saveSettingsAction } from '@/server/modules/settings/actions';
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
  disabledMenus: string[];
  totalUsers: number;
  canManage: boolean;
  canManageMenus: boolean;
}

type AccessTab = 'roles' | 'permissions' | 'features';

const emptyForm = {
  code: '', name: '', description: '', dataScope: 'SELF', sortOrder: 50,
  permissions: [] as string[], deptIds: [] as number[],
};

const ALL_MENU_ROWS = NAV_SECTIONS.flatMap((section) =>
  section.items.map((item) => ({
    href: item.href,
    label: item.label,
    sectionTitle: section.title || 'Workspace',
    locked: PROTECTED_MENU_HREFS.has(item.href),
  })),
);

export function RoleScreen({
  roles, permissions, departments, disabledMenus: initialDisabledMenus,
  totalUsers, canManage, canManageMenus,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [tab, setTab] = useState<AccessTab>('roles');
  const [selectedId, setSelectedId] = useState<number | null>(roles[0]?.id ?? null);
  const selected = useMemo(() => roles.find((r) => r.id === selectedId) ?? roles[0] ?? null, [roles, selectedId]);

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [confirmDelete, setConfirmDelete] = useState<RoleView | null>(null);

  const [permQuery, setPermQuery] = useState('');
  const [featureQuery, setFeatureQuery] = useState('');
  const [disabledMenus, setDisabledMenus] = useState<string[]>(initialDisabledMenus);

  const groups = useMemo(() => {
    const map = new Map<string, PermissionDef[]>();
    for (const p of permissions) {
      if (!map.has(p.group)) map.set(p.group, []);
      map.get(p.group)!.push(p);
    }
    return Array.from(map.entries());
  }, [permissions]);

  const filteredPermissions = useMemo(() => {
    const q = permQuery.trim().toLowerCase();
    if (!q) return permissions;
    return permissions.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.code.toLowerCase().includes(q) ||
        p.group.toLowerCase().includes(q),
    );
  }, [permissions, permQuery]);

  const filteredMenus = useMemo(() => {
    const q = featureQuery.trim().toLowerCase();
    if (!q) return ALL_MENU_ROWS;
    return ALL_MENU_ROWS.filter(
      (m) =>
        m.label.toLowerCase().includes(q) ||
        m.href.toLowerCase().includes(q) ||
        m.sectionTitle.toLowerCase().includes(q),
    );
  }, [featureQuery]);

  const offCount = disabledMenus.length;
  const builtInCount = roles.filter((r) => r.isSystem).length;

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

  const applyDisabledMenus = (next: string[], label: string) => {
    setDisabledMenus(next);
    startTransition(async () => {
      const res = await saveSettingsAction('menus', { [DISABLED_MENUS_KEY]: next });
      if (res.ok) {
        toast.success(label);
        router.refresh();
      } else {
        setDisabledMenus(initialDisabledMenus);
        toast.error(res.message);
      }
    });
  };

  return (
    <div className="stack">
      <PageHeader
        title="Phân quyền & Tính năng"
        description="Quản lý vai trò, ma trận quyền chi tiết và bật/tắt các menu chưa sử dụng trên toàn hệ thống"
        actions={
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" size="sm" onClick={() => router.refresh()}>
              <RefreshCw size={14} /> Làm mới
            </Button>
            {canManage && (
              <Button variant="primary" size="sm" onClick={openCreate}>
                <Plus size={14} /> Thêm vai trò
              </Button>
            )}
          </div>
        }
      />

      {/* 4 Compact Overview Stat Cards (FMP Worker AccessPage style) */}
      <div className="grid-stats">
        <div style={{ cursor: 'pointer' }} onClick={() => setTab('roles')}>
          <StatCard
            label="Vai trò"
            value={roles.length}
            icon={<ShieldCheck size={16} />}
            hint={`${builtInCount} vai trò mặc định`}
          />
        </div>
        <div style={{ cursor: 'pointer' }} onClick={() => setTab('permissions')}>
          <StatCard
            label="Quyền chi tiết"
            value={permissions.length}
            icon={<ListChecks size={16} />}
            hint={`${groups.length} nhóm nghiệp vụ`}
          />
        </div>
        <div style={{ cursor: 'pointer' }} onClick={() => setTab('features')}>
          <StatCard
            label="Tính năng & Menu"
            value={ALL_MENU_ROWS.length}
            icon={<LayoutGrid size={16} />}
            hint={offCount > 0 ? `${offCount} menu đang tắt` : 'Tất cả đang bật'}
          />
        </div>
        <StatCard
          href="/settings/accounts"
          label="Tài khoản"
          value={totalUsers}
          icon={<Users size={16} />}
          hint="Quản lý gán vai trò"
        />
      </div>

      {/* FMP Worker Underline Tabs */}
      <div className="tabs">
        <button type="button" className="tab" data-active={tab === 'roles'} onClick={() => setTab('roles')}>
          <ShieldCheck size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />
          Vai trò ({roles.length})
        </button>
        <button type="button" className="tab" data-active={tab === 'permissions'} onClick={() => setTab('permissions')}>
          <ListChecks size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />
          Ma trận quyền ({permissions.length})
        </button>
        <button type="button" className="tab" data-active={tab === 'features'} onClick={() => setTab('features')}>
          <LayoutGrid size={14} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />
          Tính năng & Menu {offCount > 0 ? `(${offCount} tắt)` : ''}
        </button>
      </div>

      {/* TAB 1: ROLES (FMP Worker RoleCards + Detail) */}
      {tab === 'roles' && (
        <div className="stack" style={{ gap: 16 }}>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))', gap: 10 }}>
            {roles.map((r) => {
              const isSel = selected?.id === r.id;
              const menuCount = r.permissions.filter((c) => c.startsWith('MENU_')).length;
              const featCount = r.permissions.filter((c) => c.startsWith('FEATURE_')).length;
              return (
                <button
                  key={r.id}
                  type="button"
                  onClick={() => setSelectedId(r.id)}
                  style={{
                    textAlign: 'left',
                    padding: '12px 14px',
                    borderRadius: 'var(--radius-md)',
                    border: '1px solid',
                    borderColor: isSel ? 'var(--brand)' : 'var(--border-base)',
                    background: isSel ? 'var(--brand-soft)' : 'var(--surface-card)',
                    cursor: 'pointer',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: 4,
                    transition: 'border-color 0.14s ease, background-color 0.14s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                    <span style={{ fontSize: 13.5, fontWeight: 600, color: isSel ? 'var(--brand)' : 'var(--text-strong)' }}>
                      {r.name}
                    </span>
                    <div style={{ display: 'flex', gap: 4, alignItems: 'center' }}>
                      {r.isSystem && <Badge tone="neutral"><Lock size={10} /> Hệ thống</Badge>}
                      <Badge tone={r.userCount > 0 ? 'info' : 'neutral'}>{r.userCount} người</Badge>
                    </div>
                  </div>
                  <div className="hint" style={{ fontSize: 12, lineHeight: 1.4 }}>
                    {r.description || `Mã vai trò: ${r.code}`}
                  </div>
                  <div style={{ fontSize: 11.5, fontWeight: 500, color: 'var(--text-base)', marginTop: 4 }}>
                    {menuCount} menu · {featCount} thao tác · Phạm vi: {DATA_SCOPE[r.dataScope]?.label}
                  </div>
                </button>
              );
            })}
          </div>

          {selected ? (
            <Card>
              <CardHeader>
                <div>
                  <CardTitle>{selected.name}</CardTitle>
                  <div className="card-subtitle">
                    Mã {selected.code} · {selected.userCount} tài khoản đang dùng
                    {selected.isSystem && ' · Vai trò mặc định'}
                  </div>
                </div>
                {canManage && (
                  <div className="toolbar">
                    <Button size="sm" variant="secondary" onClick={() => openEdit(selected)}>
                      <Pencil size={13} /> Sửa quyền
                    </Button>
                    {!selected.isSystem && (
                      <Button size="sm" variant="danger-soft" iconOnly onClick={() => setConfirmDelete(selected)}>
                        <Trash2 size={14} />
                      </Button>
                    )}
                  </div>
                )}
              </CardHeader>
              <CardBody>
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

                <div className="stack" style={{ gap: 14 }}>
                  {groups.map(([group, perms]) => {
                    const granted = perms.filter((p) => selected.permissions.includes(p.code));
                    return (
                      <div key={group}>
                        <div className="row-between" style={{ marginBottom: 7 }}>
                          <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>{group}</span>
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
                                  borderColor: on ? 'transparent' : 'var(--border-base)',
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
        </div>
      )}

      {/* TAB 2: PERMISSIONS MATRIX (FMP Worker PermissionsTab style) */}
      {tab === 'permissions' && (
        <div className="stack" style={{ gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <SearchInput
              placeholder="Tìm tên quyền, mã quyền, nhóm…"
              value={permQuery}
              onChange={(e) => setPermQuery(e.target.value)}
              style={{ maxWidth: 340, flex: 1 }}
            />
            <span className="hint">{filteredPermissions.length}/{permissions.length} quyền</span>
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Quyền</th>
                  <th style={{ width: 140 }}>Nhóm</th>
                  <th style={{ width: 90 }}>Loại</th>
                  {roles.map((r) => (
                    <th key={r.id} style={{ textAlign: 'center', minWidth: 96 }}>{r.name}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredPermissions.map((p) => (
                  <tr key={p.code}>
                    <td>
                      <div style={{ fontWeight: 500, color: 'var(--text-strong)', fontSize: 13 }}>{p.name}</div>
                      <div className="hint" style={{ fontSize: 11, fontFamily: 'var(--font-mono)' }}>{p.code}</div>
                    </td>
                    <td><Badge tone="neutral">{p.group}</Badge></td>
                    <td>
                      <Badge tone={p.category === 'MENU' ? 'info' : 'neutral'}>
                        {p.category === 'MENU' ? 'Menu' : 'Thao tác'}
                      </Badge>
                    </td>
                    {roles.map((r) => {
                      const has = r.permissions.includes(p.code);
                      return (
                        <td key={r.id} style={{ textAlign: 'center' }}>
                          {has ? (
                            <span style={{ color: 'var(--success)', display: 'inline-flex' }}><Check size={15} /></span>
                          ) : (
                            <span style={{ color: 'var(--text-faint)' }}>—</span>
                          )}
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* TAB 3: FEATURES & MENUS TOGGLE (FMP Worker FeaturesTab style) */}
      {tab === 'features' && (
        <div className="stack" style={{ gap: 12 }}>
          <div style={{ display: 'flex', gap: 10, alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap' }}>
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', flex: 1, minWidth: 240 }}>
              <SearchInput
                placeholder="Tìm tính năng hoặc đường dẫn menu…"
                value={featureQuery}
                onChange={(e) => setFeatureQuery(e.target.value)}
                style={{ maxWidth: 320, flex: 1 }}
              />
              <span className="hint">
                Menu bị tắt sẽ ẩn khỏi thanh điều hướng của toàn hệ thống. Hiện có <b>{offCount}</b> menu đang tắt.
              </span>
            </div>
            {canManageMenus && offCount > 0 && (
              <Button
                type="button"
                variant="secondary"
                size="sm"
                loading={pending}
                onClick={() => applyDisabledMenus([], 'Đã bật lại toàn bộ menu')}
              >
                Bật tất cả
              </Button>
            )}
          </div>

          <div className="table-wrap">
            <table className="table">
              <thead>
                <tr>
                  <th>Tính năng / Menu</th>
                  <th style={{ width: 200 }}>Nhóm menu</th>
                  <th style={{ width: 130 }}>Trạng thái</th>
                  <th style={{ width: 90, textAlign: 'right' }}>Bật / Tắt</th>
                </tr>
              </thead>
              <tbody>
                {filteredMenus.map((m) => {
                  const enabled = m.locked || !disabledMenus.includes(m.href);
                  return (
                    <tr key={m.href}>
                      <td>
                        <div style={{ fontWeight: 500, color: 'var(--text-strong)', fontSize: 13 }}>{m.label}</div>
                        <div className="hint" style={{ fontSize: 11.5, fontFamily: 'var(--font-mono)' }}>{m.href}</div>
                      </td>
                      <td style={{ color: 'var(--text-muted)', fontSize: 12.5 }}>{m.sectionTitle}</td>
                      <td>
                        {m.locked ? (
                          <Badge tone="neutral">Luôn bật</Badge>
                        ) : enabled ? (
                          <Badge tone="success">Đang bật</Badge>
                        ) : (
                          <Badge tone="warning">Đang tắt</Badge>
                        )}
                      </td>
                      <td style={{ textAlign: 'right' }}>
                        <Switch
                          checked={enabled}
                          disabled={!canManageMenus || m.locked || pending}
                          onChange={(e) => {
                            const next = e.target.checked
                              ? disabledMenus.filter((h) => h !== m.href)
                              : Array.from(new Set([...disabledMenus, m.href]));
                            applyDisabledMenus(
                              next,
                              e.target.checked ? `Đã bật menu "${m.label}"` : `Đã ẩn menu "${m.label}"`,
                            );
                          }}
                        />
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {!canManageMenus && (
            <p className="hint">
              Chỉ quản trị viên có quyền cấu hình hệ thống mới được bật/tắt menu. Bạn có thể xem chi tiết tài khoản tại{' '}
              <Link href="/settings/accounts" style={{ color: 'var(--brand)', textDecoration: 'underline' }}>Tài khoản</Link>.
            </p>
          )}
        </div>
      )}

      {/* Modal tạo / sửa vai trò */}
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
                  <label className="row" style={{ gap: 8, fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>
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
