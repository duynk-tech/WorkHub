'use client';

import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, ShieldCheck, UserCog, Lock, Unlock, Users, ShieldAlert } from 'lucide-react';
import {
  Button, Card, CardBody, Badge, Field, Input, Avatar, EmptyState, SearchInput, Checkbox, PageHeader,
  Select, SearchableSelect, ActionMenu, Pagination, usePaged, type ActionMenuItem,
} from '@/components/ui';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { fmtRelative } from '@/lib/date';
import { updateAccountRolesAction, toggleAccountActiveAction, resetPasswordAction } from '@/server/modules/org/employee-actions';

interface UserView {
  id: number; username: string; isActive: boolean; mustChangePassword: boolean;
  lastLoginAt: string | null; lastLoginIp: string | null; lockedUntil: string | null;
  employee: { id: number; fullName: string; code: string; avatarUrl: string | null; department: { name: string } | null; position: { name: string } | null };
  roles: { roleId: number; role: { code: string; name: string } }[];
}

interface Props {
  users: UserView[];
  roles: { id: number; code: string; name: string }[];
  currentUserId: number;
  canManage: boolean;
  canResetPassword: boolean;
}

type StateKey = 'ALL' | 'ACTIVE' | 'DISABLED' | 'LOCKED' | 'NEVER' | 'NO_ROLE';

const isLocked = (u: UserView) => Boolean(u.lockedUntil && new Date(u.lockedUntil) > new Date());

/**
 * Nhóm tài khoản theo việc quản trị viên thường phải xử lý, không theo cột dữ liệu:
 * ai đang bị khóa, ai chưa từng đăng nhập, ai chưa được gán vai trò.
 */
const STATE_CHIPS: { key: StateKey; label: string; color: string; match: (u: UserView) => boolean }[] = [
  { key: 'ALL', label: 'Tất cả', color: 'var(--brand)', match: () => true },
  { key: 'ACTIVE', label: 'Hoạt động', color: '#16a34a', match: (u) => u.isActive && !isLocked(u) },
  { key: 'DISABLED', label: 'Vô hiệu hóa', color: '#64748b', match: (u) => !u.isActive },
  { key: 'LOCKED', label: 'Đang khóa tạm', color: '#dc2626', match: isLocked },
  { key: 'NEVER', label: 'Chưa đăng nhập', color: '#d97706', match: (u) => !u.lastLoginAt },
  { key: 'NO_ROLE', label: 'Chưa có vai trò', color: '#dc2626', match: (u) => u.roles.length === 0 },
];

export function AccountScreen({ users, roles, currentUserId, canManage, canResetPassword }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [search, setSearch] = useState('');
  const [stateFilter, setStateFilter] = useState<StateKey>('ALL');
  const [roleFilter, setRoleFilter] = useState('');

  const [roleEditFor, setRoleEditFor] = useState<UserView | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<number[]>([]);
  const [resetFor, setResetFor] = useState<UserView | null>(null);
  const [newPassword, setNewPassword] = useState('');

  // Lọc ngay tại client: cả danh sách đã nằm trong props, đẩy lên server chỉ tổ nạp lại trang
  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const chip = STATE_CHIPS.find((c) => c.key === stateFilter)!;
    return users.filter((u) => {
      if (!chip.match(u)) return false;
      if (roleFilter && !u.roles.some((r) => r.role.code === roleFilter)) return false;
      if (!s) return true;
      return [u.username, u.employee.fullName, u.employee.code, u.employee.department?.name]
        .some((v) => String(v || '').toLowerCase().includes(s));
    });
  }, [users, search, stateFilter, roleFilter]);

  const paged = usePaged(filtered, 20);

  const openRoleEdit = (u: UserView) => {
    setSelectedRoles(u.roles.map((r) => r.roleId));
    setRoleEditFor(u);
  };

  const saveRoles = () => {
    if (!roleEditFor) return;
    startTransition(async () => {
      const res = await updateAccountRolesAction(roleEditFor.id, selectedRoles);
      if (res.ok) { toast.success(res.message); setRoleEditFor(null); router.refresh(); }
      else toast.error(res.message);
    });
  };

  const toggleActive = (u: UserView) => {
    startTransition(async () => {
      const res = await toggleAccountActiveAction(u.id, !u.isActive);
      res.ok ? toast.success(res.message) : toast.error(res.message);
      router.refresh();
    });
  };

  const doReset = () => {
    if (!resetFor) return;
    startTransition(async () => {
      const res = await resetPasswordAction(resetFor.id, newPassword);
      if (res.ok) { toast.success(res.message); setResetFor(null); setNewPassword(''); router.refresh(); }
      else toast.error(res.message);
    });
  };

  const menuItems = (u: UserView): ActionMenuItem[] => {
    const items: ActionMenuItem[] = [];
    if (canManage) {
      items.push({
        key: 'roles', label: 'Sửa vai trò', icon: <ShieldCheck size={15} />,
        hint: u.roles.length === 0 ? 'Chưa gán vai trò nào' : u.roles.map((r) => r.role.name).join(', '),
        onClick: () => openRoleEdit(u),
      });
    }
    if (canResetPassword) {
      items.push({
        key: 'password', label: 'Đặt lại mật khẩu', icon: <KeyRound size={15} />,
        hint: 'Buộc đổi ở lần đăng nhập kế tiếp',
        onClick: () => setResetFor(u),
      });
    }
    if (canManage && u.id !== currentUserId) {
      items.push({
        key: 'toggle',
        label: u.isActive ? 'Vô hiệu hóa tài khoản' : 'Kích hoạt lại tài khoản',
        icon: u.isActive ? <Lock size={15} /> : <Unlock size={15} />,
        danger: u.isActive,
        disabled: pending,
        onClick: () => toggleActive(u),
      });
    }
    return items;
  };

  return (
    <div className="stack">
      <PageHeader
        title="Tài khoản đăng nhập"
        description={
          filtered.length === users.length
            ? `${users.length} tài khoản trong hệ thống`
            : `${filtered.length}/${users.length} tài khoản khớp bộ lọc`
        }
      />

      {/* Chip trạng thái kiêm luôn số đếm: vừa cho biết hiện trạng vừa là bộ lọc */}
      <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {STATE_CHIPS.map((chip) => {
          const count = users.filter(chip.match).length;
          const active = stateFilter === chip.key;
          return (
            <button
              key={chip.key}
              type="button"
              onClick={() => setStateFilter(chip.key)}
              style={{
                display: 'inline-flex', alignItems: 'center', gap: 7,
                padding: '6px 12px', borderRadius: 999, fontSize: 12.5,
                fontWeight: active ? 700 : 500, cursor: 'pointer',
                border: '1px solid',
                borderColor: active ? chip.color : 'var(--border-base)',
                background: active ? `color-mix(in srgb, ${chip.color} 12%, transparent)` : 'var(--surface-card)',
                color: active ? chip.color : 'var(--text-muted)',
              }}
            >
              {chip.label}
              <span style={{ fontWeight: 700, color: count > 0 ? chip.color : 'var(--text-faint)' }}>{count}</span>
            </button>
          );
        })}
      </div>

      {/* Ô tìm và lọc vai trò đi cùng một dòng, không cần bọc trong thẻ riêng */}
      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <SearchInput
          placeholder="Tìm theo tên đăng nhập, họ tên, mã nhân sự, phòng ban…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 260, maxWidth: 420 }}
        />
        <SearchableSelect
          sizeSm
          style={{ width: 'auto', minWidth: 190 }}
          value={roleFilter}
          onChange={(val) => setRoleFilter(val)}
          options={[
            { value: '', label: 'Tất cả vai trò' },
            ...roles.map((r) => ({ value: r.code, label: r.name, subLabel: r.code })),
          ]}
          placeholder="Tất cả vai trò"
          searchPlaceholder="Tìm vai trò…"
        />
      </div>

      {filtered.length === 0 ? (
        <Card>
          <CardBody>
            <EmptyState
              icon={<Users size={20} />}
              title={users.length === 0 ? 'Không có tài khoản nào' : 'Không có tài khoản nào khớp'}
              description={
                users.length === 0
                  ? 'Cấp tài khoản cho nhân sự ở màn hình Nhân sự.'
                  : 'Thử bỏ bớt bộ lọc hoặc đổi từ khóa tìm kiếm.'
              }
            />
          </CardBody>
        </Card>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Tài khoản</th>
                <th style={{ width: '26%' }}>Vai trò</th>
                <th style={{ width: 170 }}>Đăng nhập gần nhất</th>
                <th style={{ width: 140 }}>Trạng thái</th>
                <th style={{ width: 52 }}></th>
              </tr>
            </thead>
            <tbody>
              {paged.pageRows.map((u) => {
                const locked = isLocked(u);
                const items = menuItems(u);
                return (
                  <tr key={u.id}>
                    {/* Gộp tài khoản và nhân sự vào một cột: cùng nói về một người,
                        tách ra chỉ làm bảng rộng quá khung và phải cuộn ngang */}
                    <td>
                      <div className="row" style={{ gap: 11, minWidth: 0 }}>
                        <Avatar name={u.employee.fullName} src={u.employee.avatarUrl} size="md" />
                        <div style={{ minWidth: 0 }}>
                          <div className="row" style={{ gap: 7 }}>
                            <span style={{ fontWeight: 560, color: 'var(--text-strong)', fontSize: 13.5 }}>
                              {u.employee.fullName}
                            </span>
                            {u.id === currentUserId && <Badge tone="brand">Bạn</Badge>}
                            {u.mustChangePassword && (
                              <Badge tone="warning" title="Buộc đổi mật khẩu ở lần đăng nhập kế tiếp">
                                <ShieldAlert size={11} style={{ marginRight: 3, verticalAlign: -1 }} />
                                Phải đổi mật khẩu
                              </Badge>
                            )}
                          </div>
                          <div className="hint" style={{ marginTop: 2 }}>
                            <span style={{ fontFamily: 'var(--font-mono)', color: 'var(--text-muted)' }}>@{u.username}</span>
                            {' · '}
                            {u.employee.department?.name ?? '—'}
                            {u.employee.position ? ` · ${u.employee.position.name}` : ''}
                          </div>
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {u.roles.length === 0
                          ? <Badge tone="danger">Chưa có vai trò</Badge>
                          : u.roles.map((r) => <Badge key={r.roleId} tone="brand">{r.role.name}</Badge>)}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: 12.5 }}>
                        {u.lastLoginAt ? fmtRelative(u.lastLoginAt) : <span className="text-faint">Chưa đăng nhập</span>}
                      </div>
                      {u.lastLoginIp && (
                        <div className="hint" style={{ fontFamily: 'var(--font-mono)' }}>{u.lastLoginIp}</div>
                      )}
                    </td>
                    <td>
                      {locked ? <Badge tone="danger" dot>Đang khóa tạm</Badge>
                        : u.isActive ? <Badge tone="success" dot>Hoạt động</Badge>
                        : <Badge tone="neutral" dot>Vô hiệu hóa</Badge>}
                    </td>
                    <td>
                      {items.length > 0 && (
                        <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
                          <ActionMenu items={items} title={`@${u.username}`} />
                        </div>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <Pagination {...paged} unit="tài khoản" />
        </div>
      )}

      <Modal
        open={Boolean(roleEditFor)}
        onClose={() => setRoleEditFor(null)}
        title={`Vai trò của @${roleEditFor?.username ?? ''}`}
        description="Người dùng nhận hợp của tất cả quyền từ các vai trò được gán"
        footer={
          <>
            <Button variant="secondary" onClick={() => setRoleEditFor(null)}>Hủy</Button>
            <Button variant="primary" onClick={saveRoles} loading={pending}>Lưu vai trò</Button>
          </>
        }
      >
        <div style={{ display: 'grid', gap: 8 }}>
          {roles.map((r) => (
            <label key={r.id} className="row" style={{ gap: 9, fontSize: 13.5, padding: '6px 0' }}>
              <Checkbox
                checked={selectedRoles.includes(r.id)}
                onChange={(e) => setSelectedRoles((prev) => e.target.checked ? [...prev, r.id] : prev.filter((x) => x !== r.id))}
              />
              <UserCog size={15} style={{ color: 'var(--text-faint)' }} />
              <span>{r.name}</span>
              <span className="hint" style={{ fontFamily: 'var(--font-mono)' }}>{r.code}</span>
            </label>
          ))}
        </div>
      </Modal>

      <Modal
        open={Boolean(resetFor)}
        onClose={() => { setResetFor(null); setNewPassword(''); }}
        title={`Đặt lại mật khẩu cho @${resetFor?.username ?? ''}`}
        description="Người dùng sẽ buộc phải đổi mật khẩu ở lần đăng nhập kế tiếp"
        footer={
          <>
            <Button variant="secondary" onClick={() => { setResetFor(null); setNewPassword(''); }}>Hủy</Button>
            <Button variant="primary" onClick={doReset} loading={pending}><KeyRound /> Đặt lại</Button>
          </>
        }
      >
        <Field label="Mật khẩu mới" required hint="Tối thiểu 8 ký tự, gồm chữ và số">
          <Input value={newPassword} onChange={(e) => setNewPassword(e.target.value)} placeholder="vd: Workhub@123" />
        </Field>
      </Modal>
    </div>
  );
}
