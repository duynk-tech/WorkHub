'use client';

import Link from 'next/link';
import { useMemo, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  Plus, SlidersHorizontal, Share2, Star, Trash2, ArrowUp, ArrowDown,
  LayoutDashboard, Check, LayoutGrid,
} from 'lucide-react';
import {
  Button, Badge, Field, Input, Checkbox, Switch, Divider,
} from '@/components/ui';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { ActionMenu } from '@/components/ui/action-menu';
import { DASHBOARD_LAYOUT_EDIT_EVENT } from '@/components/domain/dashboard-layout-grid';
import {
  DASHBOARD_WIDGET_GROUPS,
  DASHBOARD_WIDGETS,
  WIDGET_BY_KEY,
  type DashboardWidgetGroup,
} from '@/lib/dashboard-widgets';
import type { DashboardBoardView } from '@/server/modules/dashboard/service';
import {
  saveDashboardBoardAction,
  deleteDashboardBoardAction,
  setDefaultDashboardBoardAction,
} from '@/server/modules/dashboard/actions';

interface Props {
  boards: DashboardBoardView[];
  activeBoardId: number | null;
  isAdmin: boolean;
  allowedWidgetKeys: string[];
  roles: { code: string; name: string }[];
  users: { id: number; username: string; fullName: string }[];
}

export function DashboardBoardBar({
  boards,
  activeBoardId,
  isAdmin,
  allowedWidgetKeys,
  roles,
  users,
}: Props) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const allowedSet = useMemo(() => new Set(allowedWidgetKeys), [allowedWidgetKeys]);
  const activeBoard = useMemo(
    () => boards.find((b) => b.id === activeBoardId) ?? null,
    [boards, activeBoardId],
  );

  const [modalOpen, setModalOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [selectedWidgets, setSelectedWidgets] = useState<string[]>([]);
  const [isDefault, setIsDefault] = useState(false);
  const [isShared, setIsShared] = useState(false);
  const [shareScope, setShareScope] = useState<'ALL' | 'ROLES' | 'USERS'>('ALL');
  const [sharedRoleCodes, setSharedRoleCodes] = useState<string[]>([]);
  const [sharedUserIds, setSharedUserIds] = useState<number[]>([]);
  const [confirmDelete, setConfirmDelete] = useState<DashboardBoardView | null>(null);

  const availableGroups = useMemo(() => {
    return DASHBOARD_WIDGET_GROUPS.map((group) => ({
      group,
      widgets: DASHBOARD_WIDGETS.filter((w) => w.group === group && (isAdmin || allowedSet.has(w.key))),
    })).filter((g) => g.widgets.length > 0);
  }, [allowedSet, isAdmin]);

  const openCreate = () => {
    setEditingId(null);
    setName('');
    setDescription('');
    // Mặc định chọn sẵn các widget cơ bản người dùng có quyền
    const initial = DASHBOARD_WIDGETS.filter((w) => allowedSet.has(w.key))
      .slice(0, 4)
      .map((w) => w.key);
    setSelectedWidgets(initial);
    setIsDefault(boards.filter((b) => b.isOwn).length === 0);
    setIsShared(false);
    setShareScope('ALL');
    setSharedRoleCodes([]);
    setSharedUserIds([]);
    setModalOpen(true);
  };

  const openEdit = (board: DashboardBoardView) => {
    setEditingId(board.id);
    setName(board.name);
    setDescription(board.description || '');
    setSelectedWidgets([...board.rawWidgets]);
    setIsDefault(board.isDefault);
    setIsShared(board.isShared);
    setShareScope(board.shareScope);
    setSharedRoleCodes([...board.sharedRoleCodes]);
    setSharedUserIds([...board.sharedUserIds]);
    setModalOpen(true);
  };

  const toggleWidget = (key: string) => {
    setSelectedWidgets((prev) =>
      prev.includes(key) ? prev.filter((k) => k !== key) : [...prev, key],
    );
  };

  const addAllInGroup = (group: DashboardWidgetGroup) => {
    const keys = DASHBOARD_WIDGETS.filter((w) => w.group === group && (isAdmin || allowedSet.has(w.key))).map(
      (w) => w.key,
    );
    setSelectedWidgets((prev) => Array.from(new Set([...prev, ...keys])));
  };

  const moveWidget = (index: number, delta: -1 | 1) => {
    setSelectedWidgets((prev) => {
      const target = index + delta;
      if (target < 0 || target >= prev.length) return prev;
      const copy = [...prev];
      const [item] = copy.splice(index, 1);
      copy.splice(target, 0, item);
      return copy;
    });
  };

  const handleSave = () => {
    startTransition(async () => {
      const res = await saveDashboardBoardAction({
        id: editingId,
        name,
        description,
        widgets: selectedWidgets,
        isDefault,
        isShared,
        shareScope,
        sharedRoleCodes,
        sharedUserIds,
      });
      if (res.ok) {
        toast.success(res.message);
        setModalOpen(false);
        if (res.boardId) {
          router.push(`/dashboard?board=${res.boardId}`);
        }
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  };

  const handleDelete = () => {
    if (!confirmDelete) return;
    startTransition(async () => {
      const res = await deleteDashboardBoardAction(confirmDelete.id);
      if (res.ok) {
        toast.success(res.message);
        setConfirmDelete(null);
        router.push('/dashboard');
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  };

  const handleSetDefault = (boardId: number) => {
    startTransition(async () => {
      const res = await setDefaultDashboardBoardAction(boardId);
      if (res.ok) {
        toast.success(res.message);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  };

  const canEditActive = activeBoard && (activeBoard.isOwn || isAdmin);

  return (
    <>
      <div className="row-between" style={{ gap: 12, flexWrap: 'wrap' }}>
        {boards.length > 0 ? (
          <div className="tabs" style={{ minWidth: 0 }}>
            {boards.map((b) => {
              const active = activeBoardId === b.id;
              return (
                <Link key={b.id} href={`/dashboard?board=${b.id}`} className="tab" data-active={active}>
                  <LayoutDashboard />
                  <span>{b.name}</span>
                  {b.isDefault && <Star size={12} fill="#f59e0b" stroke="#f59e0b" aria-label="Bảng mặc định" />}
                  {b.isShared && !b.isOwn && (
                    <Badge tone="info" style={{ fontSize: 10.5, minHeight: 18, lineHeight: '16px', padding: '0 5px' }}>
                      <Share2 size={9} /> Chia sẻ
                    </Badge>
                  )}
                  {b.isShared && b.isOwn && (
                    <span title="Đang chia sẻ" style={{ display: 'inline-flex', color: 'var(--brand)' }}>
                      <Share2 size={12} />
                    </span>
                  )}
                </Link>
              );
            })}
          </div>
        ) : (
          <div className="hint" style={{ fontSize: 12.5 }}>
            Chưa có bảng Dashboard tùy chỉnh nào — bạn có thể tự tạo bảng theo nhóm Kinh doanh, Kho, Mua hàng…
          </div>
        )}

        <div className="toolbar">
          {canEditActive && (
            <Button
              type="button"
              variant="ghost"
              size="sm"
              onClick={() => window.dispatchEvent(new Event(DASHBOARD_LAYOUT_EDIT_EVENT))}
              title="Kéo thả để đổi vị trí, kéo cạnh để đổi độ rộng khối"
            >
              <LayoutGrid size={15} /> Bố cục
            </Button>
          )}
          {canEditActive && (
            <Button type="button" variant="secondary" size="sm" onClick={() => openEdit(activeBoard)}>
              <SlidersHorizontal size={15} /> Tùy chỉnh
            </Button>
          )}
          <Button type="button" variant="primary" size="sm" onClick={openCreate}>
            <Plus size={15} /> Tạo bảng
          </Button>
          {activeBoard && (canEditActive || (activeBoard.isOwn && !activeBoard.isDefault)) && (
            <ActionMenu
              label="Thao tác khác với bảng"
              title={activeBoard.name}
              items={[
                ...(activeBoard.isOwn && !activeBoard.isDefault
                  ? [{ key: 'default', label: 'Đặt làm bảng mặc định', icon: <Star size={14} />, onClick: () => handleSetDefault(activeBoard.id), disabled: pending }]
                  : []),
                ...(canEditActive
                  ? [{ key: 'delete', label: 'Xóa bảng này', icon: <Trash2 size={14} />, danger: true, onClick: () => setConfirmDelete(activeBoard) }]
                  : []),
              ]}
            />
          )}
        </div>
      </div>

      {/* Modal tạo / tùy chỉnh & chia sẻ Dashboard */}
      <Modal
        open={modalOpen}
        onClose={() => setModalOpen(false)}
        title={editingId ? 'Tùy chỉnh bảng Dashboard' : 'Tạo bảng Dashboard mới'}
        description="Chọn các khối dữ liệu theo nhóm Kinh doanh, Kho, Mua hàng, Dịch vụ, Công việc, Nhân sự phù hợp với vai trò"
        size="xl"
        footer={
          <>
            <span className="hint" style={{ marginRight: 'auto' }}>
              Đã chọn <b>{selectedWidgets.length}</b> khối hiển thị
            </span>
            <Button variant="secondary" onClick={() => setModalOpen(false)}>Hủy</Button>
            <Button variant="primary" onClick={handleSave} loading={pending}>
              {editingId ? 'Lưu bảng' : 'Tạo bảng'}
            </Button>
          </>
        }
      >
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 14 }}>
          <Field label="Tên bảng Dashboard" required>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="VD: Điều hành Kinh doanh & Kho"
            />
          </Field>
          <Field label="Mô tả ngắn">
            <Input
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="VD: Theo dõi đơn hàng, tồn kho và PO đang về"
            />
          </Field>
        </div>

        <label className="row" style={{ gap: 8, fontSize: 13, marginBottom: 14, cursor: 'pointer' }}>
          <Checkbox checked={isDefault} onChange={(e) => setIsDefault(e.target.checked)} />
          <span>Đặt làm Dashboard mặc định của tôi</span>
        </label>

        {/* Thứ tự các khối đã chọn */}
        {selectedWidgets.length > 0 && (
          <div style={{ marginBottom: 16 }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 6 }}>
              Thứ tự hiển thị ({selectedWidgets.length})
            </div>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6 }}>
              {selectedWidgets.map((key, idx) => {
                const def = WIDGET_BY_KEY.get(key);
                if (!def) return null;
                return (
                  <span
                    key={key}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 5,
                      padding: '4px 8px',
                      borderRadius: 'var(--radius-sm)',
                      border: '1px solid var(--border-base)',
                      background: 'var(--brand-soft)',
                      color: 'var(--brand)',
                      fontSize: 12,
                      fontWeight: 500,
                    }}
                  >
                    <span>{idx + 1}. {def.label}</span>
                    <button
                      type="button"
                      onClick={() => moveWidget(idx, -1)}
                      disabled={idx === 0}
                      style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0, color: 'inherit', opacity: idx === 0 ? 0.35 : 1 }}
                      title="Di chuyển lên"
                    >
                      <ArrowUp size={12} />
                    </button>
                    <button
                      type="button"
                      onClick={() => moveWidget(idx, 1)}
                      disabled={idx === selectedWidgets.length - 1}
                      style={{ background: 'none', border: 0, cursor: 'pointer', padding: 0, color: 'inherit', opacity: idx === selectedWidgets.length - 1 ? 0.35 : 1 }}
                      title="Di chuyển xuống"
                    >
                      <ArrowDown size={12} />
                    </button>
                  </span>
                );
              })}
            </div>
          </div>
        )}

        <Divider style={{ marginBottom: 14 }} />

        {/* Thư viện chọn khối theo từng nhóm */}
        <div className="stack" style={{ gap: 14 }}>
          {availableGroups.map(({ group, widgets }) => (
            <div
              key={group}
              style={{
                border: '1px solid var(--border-base)',
                borderRadius: 'var(--radius-md)',
                padding: 12,
              }}
            >
              <div className="row-between" style={{ marginBottom: 8 }}>
                <span style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>
                  Nhóm {group}
                </span>
                <Button type="button" variant="ghost" size="sm" onClick={() => addAllInGroup(group)}>
                  <Plus size={12} /> Chọn cả nhóm
                </Button>
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: 8 }}>
                {widgets.map((w) => {
                  const on = selectedWidgets.includes(w.key);
                  return (
                    <label
                      key={w.key}
                      style={{
                        display: 'flex',
                        alignItems: 'flex-start',
                        gap: 8,
                        padding: '8px 10px',
                        borderRadius: 'var(--radius-sm)',
                        border: '1px solid',
                        borderColor: on ? 'var(--brand)' : 'var(--border-subtle)',
                        background: on ? 'var(--brand-soft)' : 'var(--surface-card)',
                        cursor: 'pointer',
                      }}
                    >
                      <Checkbox checked={on} onChange={() => toggleWidget(w.key)} />
                      <span style={{ display: 'flex', flexDirection: 'column', gap: 2, minWidth: 0 }}>
                        <span style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-strong)' }}>
                          {w.label}
                        </span>
                        <span className="hint" style={{ fontSize: 11.5, lineHeight: 1.35 }}>
                          {w.description}
                        </span>
                      </span>
                    </label>
                  );
                })}
              </div>
            </div>
          ))}
        </div>

        {/* Chia sẻ bảng (chỉ Quản trị viên) */}
        {isAdmin && (
          <>
            <Divider style={{ margin: '16px 0 14px' }} />
            <div
              style={{
                border: '1px solid var(--border-base)',
                borderRadius: 'var(--radius-md)',
                padding: 14,
                background: 'var(--surface-sunken)',
                display: 'flex',
                flexDirection: 'column',
                gap: 12,
              }}
            >
              <div className="row-between">
                <div>
                  <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>
                    Chia sẻ bảng cho thành viên
                  </div>
                  <div className="hint" style={{ fontSize: 12 }}>
                    Thành viên chưa có Dashboard mặc định sẽ tự động thấy bảng được chia sẻ đầu tiên (chỉ hiện các khối đúng phân quyền của họ).
                  </div>
                </div>
                <Switch checked={isShared} onChange={(e) => setIsShared(e.target.checked)} />
              </div>

              {isShared && (
                <div className="stack" style={{ gap: 10 }}>
                  <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                    {([
                      { key: 'ALL', label: 'Tất cả thành viên' },
                      { key: 'ROLES', label: 'Theo vai trò' },
                      { key: 'USERS', label: 'Theo tài khoản cụ thể' },
                    ] as const).map((opt) => (
                      <Button
                        key={opt.key}
                        type="button"
                        size="sm"
                        variant={shareScope === opt.key ? 'primary' : 'secondary'}
                        onClick={() => setShareScope(opt.key)}
                      >
                        {shareScope === opt.key && <Check size={12} />} {opt.label}
                      </Button>
                    ))}
                  </div>

                  {shareScope === 'ROLES' && (
                    <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                      {roles.map((r) => {
                        const checked = sharedRoleCodes.includes(r.code);
                        return (
                          <label key={r.code} className="row" style={{ gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
                            <Checkbox
                              checked={checked}
                              onChange={(e) =>
                                setSharedRoleCodes((prev) =>
                                  e.target.checked ? [...prev, r.code] : prev.filter((c) => c !== r.code),
                                )
                              }
                            />
                            <span>{r.name}</span>
                          </label>
                        );
                      })}
                    </div>
                  )}

                  {shareScope === 'USERS' && (
                    <div
                      style={{
                        maxHeight: 140,
                        overflowY: 'auto',
                        display: 'grid',
                        gridTemplateColumns: 'repeat(auto-fill, minmax(210px, 1fr))',
                        gap: 6,
                        padding: 8,
                        borderRadius: 'var(--radius-sm)',
                        background: 'var(--surface-card)',
                        border: '1px solid var(--border-base)',
                      }}
                    >
                      {users.map((u) => {
                        const checked = sharedUserIds.includes(u.id);
                        return (
                          <label key={u.id} className="row" style={{ gap: 6, fontSize: 12.5, cursor: 'pointer' }}>
                            <Checkbox
                              checked={checked}
                              onChange={(e) =>
                                setSharedUserIds((prev) =>
                                  e.target.checked ? [...prev, u.id] : prev.filter((id) => id !== u.id),
                                )
                              }
                            />
                            <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                              {u.fullName} <span className="hint">@{u.username}</span>
                            </span>
                          </label>
                        );
                      })}
                    </div>
                  )}
                </div>
              )}
            </div>
          </>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmDelete)}
        onClose={() => setConfirmDelete(null)}
        onConfirm={handleDelete}
        loading={pending}
        danger
        title="Xóa bảng Dashboard"
        confirmText="Xóa"
        message={<>Xóa bảng <b>{confirmDelete?.name}</b>? Hành động này không ảnh hưởng đến dữ liệu nghiệp vụ.</>}
      />
    </>
  );
}
