'use client';

import { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { KeyRound, ShieldCheck, UserCog, Lock, Unlock, Users } from 'lucide-react';
import {
  Button, Card, CardBody, Badge, Field, Input, Avatar, EmptyState, SearchInput, Checkbox, PageHeader,
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
  query: string;
  currentUserId: number;
  canManage: boolean;
  canResetPassword: boolean;
}

export function AccountScreen({ users, roles, query, currentUserId, canManage, canResetPassword }: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [search, setSearch] = useState(query);
  const [roleEditFor, setRoleEditFor] = useState<UserView | null>(null);
  const [selectedRoles, setSelectedRoles] = useState<number[]>([]);
  const [resetFor, setResetFor] = useState<UserView | null>(null);
  const [newPassword, setNewPassword] = useState('');

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

  return (
    <div className="stack">
      <PageHeader title="Tài khoản đăng nhập" description={`${users.length} tài khoản trong hệ thống`} />

      <Card>
        <CardBody style={{ padding: 14 }}>
          <form onSubmit={(e) => { e.preventDefault(); router.push(search ? `/settings/accounts?q=${encodeURIComponent(search)}` : '/settings/accounts'); }}>
            <SearchInput
              placeholder="Tìm theo tên đăng nhập, họ tên, mã nhân sự…"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ maxWidth: 380 }}
            />
          </form>
        </CardBody>
      </Card>

      {users.length === 0 ? (
        <Card><CardBody><EmptyState icon={<Users size={20} />} title="Không có tài khoản nào" description="Cấp tài khoản cho nhân sự ở màn hình Nhân sự." /></CardBody></Card>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Tài khoản</th>
                <th>Nhân sự</th>
                <th>Vai trò</th>
                <th>Đăng nhập gần nhất</th>
                <th>Trạng thái</th>
                <th style={{ width: 150 }}></th>
              </tr>
            </thead>
            <tbody>
              {users.map((u) => {
                const locked = u.lockedUntil && new Date(u.lockedUntil) > new Date();
                return (
                  <tr key={u.id}>
                    <td>
                      <div className="row" style={{ gap: 10 }}>
                        <Avatar name={u.employee.fullName} src={u.employee.avatarUrl} size="sm" />
                        <div>
                          <div style={{ fontWeight: 560, color: 'var(--text-strong)', fontFamily: 'var(--font-mono)', fontSize: 13 }}>
                            @{u.username}
                            {u.id === currentUserId && <Badge tone="brand" style={{ marginLeft: 6 }}>Bạn</Badge>}
                          </div>
                          {u.mustChangePassword && <div className="hint" style={{ color: 'var(--warning)' }}>Phải đổi mật khẩu</div>}
                        </div>
                      </div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 540, color: 'var(--text-strong)' }}>{u.employee.fullName}</div>
                      <div className="hint">{u.employee.department?.name ?? '—'}{u.employee.position ? ` · ${u.employee.position.name}` : ''}</div>
                    </td>
                    <td>
                      <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                        {u.roles.length === 0
                          ? <Badge tone="danger">Chưa có vai trò</Badge>
                          : u.roles.map((r) => <Badge key={r.roleId} tone="brand">{r.role.name}</Badge>)}
                      </div>
                    </td>
                    <td>
                      <div style={{ fontSize: 12.5 }}>{u.lastLoginAt ? fmtRelative(u.lastLoginAt) : <span className="text-faint">Chưa đăng nhập</span>}</div>
                      {u.lastLoginIp && <div className="hint">{u.lastLoginIp}</div>}
                    </td>
                    <td>
                      {locked ? <Badge tone="danger" dot>Đang khóa tạm</Badge>
                        : u.isActive ? <Badge tone="success" dot>Hoạt động</Badge>
                        : <Badge tone="neutral" dot>Vô hiệu hóa</Badge>}
                    </td>
                    <td>
                      <div className="row" style={{ gap: 4, justifyContent: 'flex-end' }}>
                        {canManage && (
                          <Button size="sm" variant="ghost" iconOnly onClick={() => openRoleEdit(u)} aria-label="Sửa vai trò" className="tooltip-host">
                            <ShieldCheck /><span className="tooltip">Vai trò</span>
                          </Button>
                        )}
                        {canResetPassword && (
                          <Button size="sm" variant="ghost" iconOnly onClick={() => setResetFor(u)} aria-label="Đặt lại mật khẩu" className="tooltip-host">
                            <KeyRound /><span className="tooltip">Đặt lại mật khẩu</span>
                          </Button>
                        )}
                        {canManage && u.id !== currentUserId && (
                          <Button
                            size="sm" variant={u.isActive ? 'ghost' : 'soft'} iconOnly
                            onClick={() => toggleActive(u)} disabled={pending}
                            aria-label={u.isActive ? 'Vô hiệu hóa' : 'Kích hoạt'} className="tooltip-host"
                          >
                            {u.isActive ? <Lock /> : <Unlock />}
                            <span className="tooltip">{u.isActive ? 'Vô hiệu hóa' : 'Kích hoạt'}</span>
                          </Button>
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
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
