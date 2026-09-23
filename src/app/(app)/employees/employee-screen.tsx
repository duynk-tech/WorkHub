'use client';

import { useState, useTransition } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Plus, Pencil, KeyRound, Users, UserPlus, Filter, ChevronLeft, ChevronRight, Mail, Phone, ShieldCheck,
} from 'lucide-react';
import {
  Button, Card, CardBody, Badge, Field, Input, Select, SearchableSelect, Textarea, Avatar, EmptyState,
  SearchInput, Checkbox, PageHeader,
} from '@/components/ui';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { EmployeeStatusBadge } from '@/components/domain/task-badges';
import { EMPLOYMENT_TYPE, EMPLOYEE_STATUS } from '@/lib/enums';
import { fmtDate } from '@/lib/date';
import { saveEmployeeAction, createAccountAction } from '@/server/modules/org/employee-actions';
import { slugifyCode } from '@/lib/utils';

interface Row {
  id: number; code: string; fullName: string; email: string | null; phone: string | null;
  status: string; employmentType: string; gender: string | null;
  dateOfBirth: string | null; joinDate: string | null; note: string | null;
  departmentId: number | null; positionId: number | null; managerId: number | null; workShiftId: number | null;
  department: { id: number; name: string; code: string } | null;
  position: { id: number; name: string; rankLevel: number } | null;
  manager: { id: number; fullName: string } | null;
  user: { id: number; username: string; isActive: boolean; lastLoginAt: string | null; roles: { role: { code: string; name: string } }[] } | null;
  workShift: { id: number; name: string } | null;
}

interface Props {
  data: { rows: Row[]; total: number; page: number; pageSize: number; pageCount: number };
  departments: { id: number; name: string; level: number; code: string }[];
  positions: { id: number; name: string }[];
  shifts: { id: number; name: string }[];
  roles: { id: number; code: string; name: string }[];
  allEmployees: { id: number; fullName: string; code: string }[];
  filter: { search: string; departmentId: number | null; status: string; includeSubDepts: boolean; page: number };
  canManage: boolean;
  canManageAccount: boolean;
}

const emptyForm = {
  code: '', fullName: '', email: '', phone: '', departmentId: null as number | null,
  positionId: null as number | null, managerId: null as number | null, workShiftId: null as number | null,
  employmentType: 'FULL_TIME', status: 'ACTIVE', gender: '', dateOfBirth: '', joinDate: '', note: '',
};

export function EmployeeScreen({
  data, departments, positions, shifts, roles, allEmployees, filter, canManage, canManageAccount,
}: Props) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const [search, setSearch] = useState(filter.search);
  const [form, setForm] = useState(emptyForm);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [modalOpen, setModalOpen] = useState(false);
  const [accountFor, setAccountFor] = useState<Row | null>(null);
  const [accountForm, setAccountForm] = useState({ username: '', password: '', roleIds: [] as number[], mustChangePassword: true });

  const setParam = (key: string, value: string) => {
    const params = new URLSearchParams(searchParams.toString());
    value ? params.set(key, value) : params.delete(key);
    if (key !== 'page') params.delete('page');
    router.push(`/employees?${params.toString()}`);
  };

  const openCreate = () => {
    setForm(emptyForm);
    setEditingId(null);
    setModalOpen(true);
  };

  const openEdit = (row: Row) => {
    setForm({
      code: row.code, fullName: row.fullName, email: row.email ?? '', phone: row.phone ?? '',
      departmentId: row.departmentId, positionId: row.positionId, managerId: row.managerId, workShiftId: row.workShiftId,
      employmentType: row.employmentType, status: row.status, gender: row.gender ?? '',
      dateOfBirth: row.dateOfBirth ? row.dateOfBirth.slice(0, 10) : '',
      joinDate: row.joinDate ? row.joinDate.slice(0, 10) : '',
      note: row.note ?? '',
    });
    setEditingId(row.id);
    setModalOpen(true);
  };

  const submit = () => {
    startTransition(async () => {
      const res = await saveEmployeeAction(editingId, form);
      if (res.ok) { toast.success(res.message); setModalOpen(false); router.refresh(); }
      else toast.error(res.message);
    });
  };

  const openAccount = (row: Row) => {
    const parts = row.fullName.trim().split(/\s+/);
    const suggested = slugifyCode(parts[parts.length - 1] + parts.slice(0, -1).map((p) => p[0]).join('')).toLowerCase();
    setAccountForm({ username: suggested, password: '', roleIds: roles.filter((r) => r.code === 'EMPLOYEE').map((r) => r.id), mustChangePassword: true });
    setAccountFor(row);
  };

  const submitAccount = () => {
    if (!accountFor) return;
    startTransition(async () => {
      const res = await createAccountAction({ employeeId: accountFor.id, ...accountForm });
      if (res.ok) { toast.success(res.message); setAccountFor(null); router.refresh(); }
      else toast.error(res.message);
    });
  };

  return (
    <div className="stack">
      <PageHeader
        title="Quản lý nhân sự"
        description={`${data.total} nhân sự trong phạm vi dữ liệu của bạn`}
        actions={canManage ? <Button variant="primary" onClick={openCreate}><Plus /> Thêm nhân sự</Button> : undefined}
      />

      <Card>
        <CardBody style={{ padding: 14 }}>
          <div className="toolbar">
            <form
              style={{ flex: 1, minWidth: 220, maxWidth: 340 }}
              onSubmit={(e) => { e.preventDefault(); setParam('q', search); }}
            >
              <SearchInput placeholder="Tìm theo tên, mã, email, SĐT…" value={search} onChange={(e) => setSearch(e.target.value)} />
            </form>

            <SearchableSelect
              sizeSm style={{ width: 'auto', minWidth: 200 }}
              value={filter.departmentId ? String(filter.departmentId) : ''}
              onChange={(val) => setParam('dept', val)}
              options={[
                { value: '', label: 'Tất cả phòng ban' },
                ...departments.map((d) => ({ value: String(d.id), label: `${'　'.repeat(d.level - 1)}${d.name}` })),
              ]}
              placeholder="Tất cả phòng ban"
              searchPlaceholder="Tìm phòng ban…"
            />

            <Select sizeSm style={{ width: 'auto', minWidth: 150 }} value={filter.status} onChange={(e) => setParam('status', e.target.value)}>
              <option value="">Mọi trạng thái</option>
              {Object.entries(EMPLOYEE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>

            <label className="row" style={{ gap: 6, fontSize: 12.5, color: 'var(--text-muted)' }}>
              <Checkbox checked={filter.includeSubDepts} onChange={(e) => setParam('sub', e.target.checked ? '' : '0')} />
              Gồm đơn vị con
            </label>

            {(filter.search || filter.departmentId || filter.status) && (
              <Button size="sm" variant="ghost" onClick={() => router.push('/employees')}>
                <Filter /> Xóa lọc
              </Button>
            )}
          </div>
        </CardBody>
      </Card>

      {data.rows.length === 0 ? (
        <Card><CardBody><EmptyState icon={<Users size={20} />} title="Không tìm thấy nhân sự" description="Thử đổi bộ lọc hoặc thêm nhân sự mới." /></CardBody></Card>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Nhân sự</th>
                <th>Phòng ban</th>
                <th>Chức danh</th>
                <th>Quản lý trực tiếp</th>
                <th>Tài khoản</th>
                <th>Trạng thái</th>
                <th style={{ width: 90 }}></th>
              </tr>
            </thead>
            <tbody>
              {data.rows.map((row) => (
                <tr key={row.id}>
                  <td>
                    <div className="row" style={{ gap: 10 }}>
                      <Avatar name={row.fullName} size="sm" />
                      <div style={{ minWidth: 0 }}>
                        <div style={{ fontWeight: 560, color: 'var(--text-strong)' }}>{row.fullName}</div>
                        <div className="hint row" style={{ gap: 8 }}>
                          <span>{row.code}</span>
                          {row.email && <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}><Mail size={10} />{row.email}</span>}
                          {row.phone && <span style={{ display: 'inline-flex', gap: 3, alignItems: 'center' }}><Phone size={10} />{row.phone}</span>}
                        </div>
                      </div>
                    </div>
                  </td>
                  <td>{row.department?.name ?? <span className="text-faint">—</span>}</td>
                  <td>{row.position?.name ?? <span className="text-faint">—</span>}</td>
                  <td>{row.manager?.fullName ?? <span className="text-faint">—</span>}</td>
                  <td>
                    {row.user ? (
                      <div>
                        <div className="row" style={{ gap: 5 }}>
                          <span style={{ fontFamily: 'var(--font-mono)', fontSize: 12 }}>@{row.user.username}</span>
                          {!row.user.isActive && <Badge tone="danger">Khóa</Badge>}
                        </div>
                        <div className="hint">
                          {row.user.roles.map((r) => r.role.name).join(', ') || 'Chưa có vai trò'}
                        </div>
                      </div>
                    ) : canManageAccount ? (
                      <Button size="sm" variant="ghost" onClick={() => openAccount(row)}><UserPlus /> Cấp tài khoản</Button>
                    ) : (
                      <span className="text-faint">Chưa có</span>
                    )}
                  </td>
                  <td><EmployeeStatusBadge status={row.status} /></td>
                  <td>
                    {canManage && (
                      <Button size="sm" variant="ghost" iconOnly onClick={() => openEdit(row)} aria-label="Sửa"><Pencil /></Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {data.pageCount > 1 && (
        <div className="row-between">
          <span className="hint">Trang {data.page}/{data.pageCount} · {data.total} nhân sự</span>
          <div className="row" style={{ gap: 6 }}>
            <Button size="sm" variant="secondary" disabled={data.page <= 1} onClick={() => setParam('page', String(data.page - 1))}>
              <ChevronLeft /> Trước
            </Button>
            <Button size="sm" variant="secondary" disabled={data.page >= data.pageCount} onClick={() => setParam('page', String(data.page + 1))}>
              Sau <ChevronRight />
            </Button>
          </div>
        </div>
      )}

      {/* Modal hồ sơ nhân sự */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Cập nhật hồ sơ nhân sự' : 'Thêm nhân sự mới'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button variant="primary" onClick={submit} loading={pending}>{editingId ? 'Lưu thay đổi' : 'Tạo nhân sự'}</Button>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Họ và tên" required className="span-2">
            <Input value={form.fullName} onChange={(e) => setForm((f) => ({ ...f, fullName: e.target.value }))} placeholder="Nguyễn Văn An" />
          </Field>
          <Field label="Mã nhân sự" required>
            <Input value={form.code} onChange={(e) => setForm((f) => ({ ...f, code: e.target.value.toUpperCase() }))} placeholder="NV001" />
          </Field>
          <Field label="Email">
            <Input type="email" value={form.email} onChange={(e) => setForm((f) => ({ ...f, email: e.target.value }))} />
          </Field>
          <Field label="Điện thoại">
            <Input value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))} />
          </Field>
          <Field label="Giới tính">
            <Select value={form.gender} onChange={(e) => setForm((f) => ({ ...f, gender: e.target.value }))}>
              <option value="">— Chưa chọn —</option>
              <option value="MALE">Nam</option>
              <option value="FEMALE">Nữ</option>
              <option value="OTHER">Khác</option>
            </Select>
          </Field>
          <Field label="Phòng ban">
            <SearchableSelect
              value={form.departmentId ? String(form.departmentId) : ''}
              onChange={(val) => setForm((f) => ({ ...f, departmentId: val ? Number(val) : null }))}
              options={[
                { value: '', label: '— Chưa phân bổ —' },
                ...departments.map((d) => ({ value: String(d.id), label: `${'　'.repeat(d.level - 1)}${d.name}` })),
              ]}
              placeholder="— Chưa phân bổ —"
              searchPlaceholder="Tìm phòng ban…"
            />
          </Field>
          <Field label="Chức danh">
            <SearchableSelect
              value={form.positionId ? String(form.positionId) : ''}
              onChange={(val) => setForm((f) => ({ ...f, positionId: val ? Number(val) : null }))}
              options={[
                { value: '', label: '— Chưa chọn —' },
                ...positions.map((p) => ({ value: String(p.id), label: p.name })),
              ]}
              placeholder="— Chưa chọn —"
              searchPlaceholder="Tìm chức danh…"
            />
          </Field>
          <Field label="Quản lý trực tiếp" hint="Dùng cho bước duyệt tự động">
            <SearchableSelect
              value={form.managerId ? String(form.managerId) : ''}
              onChange={(val) => setForm((f) => ({ ...f, managerId: val ? Number(val) : null }))}
              options={[
                { value: '', label: '— Không có —' },
                ...allEmployees
                  .filter((e) => e.id !== editingId)
                  .map((e) => ({ value: String(e.id), label: e.fullName, subLabel: e.code })),
              ]}
              placeholder="— Không có —"
              searchPlaceholder="Tìm nhân sự…"
            />
          </Field>
          <Field label="Ca làm việc">
            <Select value={form.workShiftId ?? ''} onChange={(e) => setForm((f) => ({ ...f, workShiftId: e.target.value ? Number(e.target.value) : null }))}>
              <option value="">— Mặc định hành chính —</option>
              {shifts.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}
            </Select>
          </Field>
          <Field label="Loại hợp đồng">
            <Select value={form.employmentType} onChange={(e) => setForm((f) => ({ ...f, employmentType: e.target.value }))}>
              {Object.entries(EMPLOYMENT_TYPE).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
          <Field label="Trạng thái">
            <Select value={form.status} onChange={(e) => setForm((f) => ({ ...f, status: e.target.value }))}>
              {Object.entries(EMPLOYEE_STATUS).map(([k, v]) => <option key={k} value={k}>{v.label}</option>)}
            </Select>
          </Field>
          <Field label="Ngày sinh">
            <Input type="date" value={form.dateOfBirth} onChange={(e) => setForm((f) => ({ ...f, dateOfBirth: e.target.value }))} />
          </Field>
          <Field label="Ngày vào làm">
            <Input type="date" value={form.joinDate} onChange={(e) => setForm((f) => ({ ...f, joinDate: e.target.value }))} />
          </Field>
          <Field label="Ghi chú" className="span-2">
            <Textarea rows={2} value={form.note} onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))} />
          </Field>
        </div>
      </Modal>

      {/* Modal cấp tài khoản */}
      <Modal
        open={Boolean(accountFor)}
        onClose={() => setAccountFor(null)}
        title={`Cấp tài khoản cho ${accountFor?.fullName ?? ''}`}
        description="Người dùng sẽ được yêu cầu đổi mật khẩu ở lần đăng nhập đầu tiên"
        footer={
          <>
            <Button variant="secondary" onClick={() => setAccountFor(null)}>Hủy</Button>
            <Button variant="primary" onClick={submitAccount} loading={pending}><KeyRound /> Tạo tài khoản</Button>
          </>
        }
      >
        <div className="stack" style={{ gap: 14 }}>
          <Field label="Tên đăng nhập" required>
            <Input value={accountForm.username} onChange={(e) => setAccountForm((f) => ({ ...f, username: e.target.value.toLowerCase() }))} />
          </Field>
          <Field label="Mật khẩu ban đầu" required hint="Tối thiểu 8 ký tự, gồm chữ và số">
            <Input type="text" value={accountForm.password} onChange={(e) => setAccountForm((f) => ({ ...f, password: e.target.value }))} placeholder="vd: Workhub@123" />
          </Field>
          <Field label="Vai trò" required hint="Quyết định menu hiển thị và phạm vi dữ liệu">
            <div style={{ display: 'grid', gap: 7 }}>
              {roles.map((r) => (
                <label key={r.id} className="row" style={{ gap: 8, fontSize: 13 }}>
                  <Checkbox
                    checked={accountForm.roleIds.includes(r.id)}
                    onChange={(e) => setAccountForm((f) => ({
                      ...f,
                      roleIds: e.target.checked ? [...f.roleIds, r.id] : f.roleIds.filter((x) => x !== r.id),
                    }))}
                  />
                  <ShieldCheck size={14} style={{ color: 'var(--text-faint)' }} />
                  {r.name}
                </label>
              ))}
            </div>
          </Field>
        </div>
      </Modal>
    </div>
  );
}
