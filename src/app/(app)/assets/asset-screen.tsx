'use client';

import React, { useState, useTransition, useEffect } from 'react';
import { createPortal } from 'react-dom';
import Link from 'next/link';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  Laptop,
  Monitor,
  Tv,
  Smartphone,
  Wifi,
  Printer,
  Keyboard,
  HardDrive,
  Plus,
  Search,
  Filter,
  QrCode,
  UserCheck,
  Undo2,
  Edit,
  ExternalLink,
  ShieldAlert,
  Boxes,
  Cpu,
  MoreVertical,
  MoreHorizontal,
  Eye,
  Wrench,
  AlertTriangle,
  Trash2,
} from 'lucide-react';
import { Button, Card, Input, Select, Badge } from '@/components/ui';
import { ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import {
  ASSET_CATEGORIES,
  ASSET_STATUSES,
} from '@/server/modules/asset/service';
import {
  AssetFormModal,
  AssignAssetModal,
  RevokeAssetModal,
  UpgradeAssetModal,
  MaintenanceModal,
  LiquidationModal,
  AssetPrintStickerModal,
} from '@/components/domain/asset-modals';
import { deleteAssetAction } from '@/server/modules/asset/actions';
import { fmtDate } from '@/lib/date';

const CATEGORY_ICONS: Record<string, React.ElementType> = {
  LAPTOP: Laptop,
  DESKTOP: Monitor,
  MONITOR: Tv,
  MOBILE: Smartphone,
  NETWORK: Wifi,
  PRINTER: Printer,
  PERIPHERAL: Keyboard,
  OTHER: HardDrive,
};

export function AssetScreen({
  assets,
  metrics,
  departments,
  employees,
  filter,
  canCreate,
  canEdit,
  canAssign,
  canUpgrade,
  canMaintenance,
  canLiquidate,
  canDelete,
}: {
  assets: any[];
  metrics: { total: number; inUse: number; inStock: number; maintenance: number; liquidated: number; broken: number };
  departments: { id: number; name: string; code: string }[];
  employees: { id: number; fullName: string; code: string; avatarUrl?: string | null; department?: { name: string } | null }[];
  filter: { search: string; category: string; status: string; departmentId?: number };
  canCreate?: boolean;
  canEdit?: boolean;
  canAssign?: boolean;
  canUpgrade?: boolean;
  canMaintenance?: boolean;
  canLiquidate?: boolean;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);

  // Selected for batch print
  const [selectedIds, setSelectedIds] = useState<number[]>([]);

  // Modal states
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editAsset, setEditAsset] = useState<any>(null);
  const [assignAsset, setAssignAsset] = useState<any>(null);
  const [revokeAsset, setRevokeAsset] = useState<any>(null);
  const [upgradeAsset, setUpgradeAsset] = useState<any>(null);
  const [maintenanceAsset, setMaintenanceAsset] = useState<any>(null);
  const [liquidationAsset, setLiquidationAsset] = useState<any>(null);
  const [printAssets, setPrintAssets] = useState<any[] | null>(null);
  const [deleteConfirmAsset, setDeleteConfirmAsset] = useState<any>(null);
  const [deleting, setDeleting] = useState(false);

  // Floating Action Menu state (Dropdown ...)
  const [menuState, setMenuState] = useState<{
    id: number;
    top: number;
    right: number;
  } | null>(null);

  useEffect(() => {
    if (!menuState) return;
    const handlePointerDown = (e: PointerEvent) => {
      const target = e.target as HTMLElement | null;
      if (target?.closest('.asset-action-menu') || target?.closest('.asset-action-btn')) {
        return;
      }
      setMenuState(null);
    };
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setMenuState(null);
    };
    document.addEventListener('pointerdown', handlePointerDown);
    document.addEventListener('keydown', handleKeyDown);
    return () => {
      document.removeEventListener('pointerdown', handlePointerDown);
      document.removeEventListener('keydown', handleKeyDown);
    };
  }, [menuState]);

  const handleOpenMenu = (e: React.MouseEvent<HTMLButtonElement>, item: any) => {
    e.stopPropagation();
    if (menuState?.id === item.id) {
      setMenuState(null);
      return;
    }
    const rect = e.currentTarget.getBoundingClientRect();
    const menuHeight = 350;
    const spaceBelow = window.innerHeight - rect.bottom;
    const spaceAbove = rect.top;

    let top: number;
    if (spaceBelow < menuHeight && spaceAbove > spaceBelow) {
      top = Math.max(10, rect.top - menuHeight - 4);
    } else {
      top = Math.min(window.innerHeight - menuHeight - 10, rect.bottom + 4);
    }

    setMenuState({
      id: item.id,
      top,
      right: Math.max(12, window.innerWidth - rect.right),
    });
  };

  const handleDeleteAsset = async () => {
    if (!deleteConfirmAsset) return;
    setDeleting(true);
    const res = await deleteAssetAction(deleteConfirmAsset.id);
    setDeleting(false);
    if (res.ok) {
      toast.success(res.message);
      setDeleteConfirmAsset(null);
      router.refresh();
    } else {
      toast.error(res.message);
    }
  };

  // Search & Filters
  const [search, setSearch] = useState(filter.search);
  const [category, setCategory] = useState(filter.category);
  const [status, setStatus] = useState(filter.status);
  const [deptId, setDeptId] = useState(filter.departmentId ? String(filter.departmentId) : '');

  const applyFilters = (newParams: Record<string, string | undefined>) => {
    const params = new URLSearchParams(searchParams.toString());
    Object.entries(newParams).forEach(([k, v]) => {
      if (v) params.set(k, v);
      else params.delete(k);
    });
    startTransition(() => {
      router.push(`/assets?${params.toString()}`);
    });
  };

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    applyFilters({ q: search });
  };

  const handleSelectAll = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.checked) {
      setSelectedIds(assets.map((a) => a.id));
    } else {
      setSelectedIds([]);
    }
  };

  const handleToggleSelect = (id: number) => {
    setSelectedIds((prev) => (prev.includes(id) ? prev.filter((i) => i !== id) : [...prev, id]));
  };

  const handleBatchPrint = () => {
    const selected = assets.filter((a) => selectedIds.includes(a.id));
    if (selected.length > 0) {
      setPrintAssets(selected);
    }
  };

  const handlePrintSingle = (item: any) => {
    setPrintAssets([item]);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 1. Header & Quick Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: '0 0 4px', display: 'flex', alignItems: 'center', gap: 10 }}>
            <Laptop style={{ width: 24, height: 24, color: 'var(--primary, #0284c7)' }} />
            Quản lý Thiết bị & Tài sản IT
          </h1>
          <p style={{ margin: 0, fontSize: 13, color: 'var(--text-muted)' }}>
            Theo dõi danh mục máy tính, cấp phát nhân sự, luân chuyển, bảo hành và in tem QR code dán máy
          </p>
        </div>

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          {selectedIds.length > 0 && (
            <Button variant="secondary" onClick={handleBatchPrint}>
              <Printer style={{ width: 16, height: 16, marginRight: 6 }} />
              In tem QR ({selectedIds.length})
            </Button>
          )}

          {canCreate && (
            <Button variant="primary" onClick={() => setCreateModalOpen(true)}>
              <Plus style={{ width: 16, height: 16, marginRight: 6 }} />
              Thêm thiết bị mới
            </Button>
          )}
        </div>
      </div>

      {/* 2. KPI Metrics Cards */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(170px, 1fr))', gap: 12 }}>
        <Card style={{ padding: '14px 16px', background: 'var(--surface)' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Tổng thiết bị</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: 'var(--text-base)' }}>{metrics.total}</div>
        </Card>

        <Card style={{ padding: '14px 16px', background: 'var(--surface)' }}>
          <div style={{ fontSize: 12, color: '#0284c7', fontWeight: 500, display: 'flex', justifyContent: 'space-between' }}>
            <span>Đang cấp phát</span>
            <span>{metrics.total ? `${Math.round((metrics.inUse / metrics.total) * 100)}%` : '0%'}</span>
          </div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: '#0284c7' }}>{metrics.inUse}</div>
        </Card>

        <Card style={{ padding: '14px 16px', background: 'var(--surface)' }}>
          <div style={{ fontSize: 12, color: '#10b981', fontWeight: 500 }}>Sẵn sàng trong kho</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: '#10b981' }}>{metrics.inStock}</div>
        </Card>

        <Card style={{ padding: '14px 16px', background: 'var(--surface)' }}>
          <div style={{ fontSize: 12, color: '#f59e0b', fontWeight: 500 }}>Bảo hành / Sửa chữa</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: '#f59e0b' }}>{metrics.maintenance}</div>
        </Card>

        <Card style={{ padding: '14px 16px', background: 'var(--surface)' }}>
          <div style={{ fontSize: 12, color: '#64748b', fontWeight: 500 }}>Đã thanh lý</div>
          <div style={{ fontSize: 24, fontWeight: 700, marginTop: 4, color: '#64748b' }}>{metrics.liquidated}</div>
        </Card>
      </div>

      {/* 3. Filter & Search Bar */}
      <Card style={{ padding: '12px 16px' }}>
        <form onSubmit={handleSearchSubmit} style={{ display: 'flex', flexWrap: 'wrap', gap: 10, alignItems: 'center' }}>
          <div style={{ flex: '1 1 240px', position: 'relative' }}>
            <Search style={{ position: 'absolute', left: 10, top: 10, width: 16, height: 16, color: 'var(--text-muted)' }} />
            <Input
              style={{ paddingLeft: 34 }}
              placeholder="Tìm theo mã máy, tên máy, serial, người dùng..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div style={{ width: 170 }}>
            <Select
              value={category}
              onChange={(e) => {
                setCategory(e.target.value);
                applyFilters({ category: e.target.value });
              }}
            >
              <option value="">Tất cả loại máy</option>
              {Object.entries(ASSET_CATEGORIES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          </div>

          <div style={{ width: 170 }}>
            <Select
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                applyFilters({ status: e.target.value });
              }}
            >
              <option value="">Tất cả trạng thái</option>
              {Object.entries(ASSET_STATUSES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          </div>

          <div style={{ width: 170 }}>
            <Select
              value={deptId}
              onChange={(e) => {
                setDeptId(e.target.value);
                applyFilters({ dept: e.target.value });
              }}
            >
              <option value="">Tất cả phòng ban</option>
              {departments.map((d) => (
                <option key={d.id} value={d.id}>
                  {d.name}
                </option>
              ))}
            </Select>
          </div>

          <Button variant="secondary" type="submit">
            Lọc
          </Button>

          {(search || category || status || deptId) && (
            <Button
              variant="ghost"
              type="button"
              onClick={() => {
                setSearch('');
                setCategory('');
                setStatus('');
                setDeptId('');
                router.push('/assets');
              }}
            >
              Xóa lọc
            </Button>
          )}
        </form>
      </Card>

      {/* 4. Assets Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
            <thead>
              <tr style={{ background: 'var(--surface-subtle, #f8fafc)', borderBottom: '1px solid var(--border)' }}>
                <th style={{ width: 40, padding: '10px 14px', textAlign: 'center' }}>
                  <input
                    type="checkbox"
                    checked={selectedIds.length > 0 && selectedIds.length === assets.length}
                    onChange={handleSelectAll}
                  />
                </th>
                <th style={{ padding: '10px 14px', minWidth: 150 }}>Mã tài sản</th>
                <th style={{ padding: '10px 14px', minWidth: 220 }}>Tên thiết bị</th>
                <th style={{ padding: '10px 14px', minWidth: 140 }}>Phân loại</th>
                <th style={{ padding: '10px 14px', minWidth: 200 }}>Cấu hình tóm tắt</th>
                <th style={{ padding: '10px 14px', minWidth: 170 }}>Người sử dụng</th>
                <th style={{ padding: '10px 14px', minWidth: 140 }}>Trạng thái</th>
                <th style={{ padding: '10px 14px', minWidth: 130 }}>Hạn bảo hành</th>
                <th style={{ padding: '10px 14px', width: 120, textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {assets.length === 0 ? (
                <tr>
                  <td colSpan={9} style={{ textAlign: 'center', padding: '40px 16px', color: 'var(--text-muted)' }}>
                    Không tìm thấy thiết bị nào phù hợp với điều kiện tìm kiếm.
                  </td>
                </tr>
              ) : (
                assets.map((item) => {
                  const IconComp = CATEGORY_ICONS[item.category] || Laptop;
                  const statusInfo = ASSET_STATUSES[item.status] || { label: item.status, badgeVariant: 'default' };
                  const specs = item.specs || {};
                  const specParts = [specs.cpu, specs.ram, specs.storage].filter(Boolean);
                  const isSelected = selectedIds.includes(item.id);

                  // Kiểm tra bảo hành
                  const isWarrantyExpired = item.warrantyExpiresAt && new Date(item.warrantyExpiresAt) < new Date();

                  return (
                    <tr
                      key={item.id}
                      style={{
                        borderBottom: '1px solid var(--border)',
                        background: isSelected ? 'var(--primary-subtle, #f0f9ff)' : undefined,
                      }}
                    >
                      <td style={{ textAlign: 'center', padding: '12px 14px' }}>
                        <input
                          type="checkbox"
                          checked={isSelected}
                          onChange={() => handleToggleSelect(item.id)}
                        />
                      </td>

                      {/* Mã tài sản & QR Code icon */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => handlePrintSingle(item)}
                            title="Bấm để xem & in mã QR"
                            style={{
                              background: 'transparent',
                              border: 'none',
                              padding: 2,
                              cursor: 'pointer',
                              color: 'var(--primary, #0284c7)',
                            }}
                          >
                            <QrCode style={{ width: 16, height: 16 }} />
                          </button>
                          <Link
                            href={`/assets/${item.id}`}
                            style={{
                              fontWeight: 700,
                              fontFamily: 'monospace',
                              color: 'var(--primary, #0284c7)',
                              textDecoration: 'none',
                            }}
                          >
                            {item.assetCode}
                          </Link>
                        </div>
                      </td>

                      {/* Tên thiết bị & Hãng */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600, fontSize: 13.5 }}>
                          <Link href={`/assets/${item.id}`} style={{ color: 'inherit', textDecoration: 'none' }}>
                            {item.name}
                          </Link>
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                          {[item.brand, item.model, item.serialNumber ? `S/N: ${item.serialNumber}` : null]
                            .filter(Boolean)
                            .join(' • ')}
                        </div>
                      </td>

                      {/* Phân loại */}
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5 }}>
                          <IconComp style={{ width: 15, height: 15, color: 'var(--text-muted)' }} />
                          <span>{ASSET_CATEGORIES[item.category]?.label?.split('/')[0] || item.category}</span>
                        </div>
                      </td>

                      {/* Cấu hình tóm tắt */}
                      <td style={{ padding: '12px 14px' }}>
                        {specParts.length > 0 ? (
                          <div style={{ fontSize: 12, color: 'var(--text-base)', display: 'flex', flexWrap: 'wrap', gap: 4 }}>
                            {specParts.map((sp, idx) => (
                              <span
                                key={idx}
                                style={{
                                  background: 'var(--surface-subtle, #f1f5f9)',
                                  padding: '2px 6px',
                                  borderRadius: 4,
                                  fontSize: 11,
                                }}
                              >
                                {sp}
                              </span>
                            ))}
                          </div>
                        ) : (
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>—</span>
                        )}
                      </td>

                      {/* Người sử dụng */}
                      <td style={{ padding: '12px 14px' }}>
                        {item.currentAssignee ? (
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                            <div
                              style={{
                                width: 26,
                                height: 26,
                                borderRadius: '50%',
                                background: '#0284c7',
                                color: '#fff',
                                display: 'flex',
                                alignItems: 'center',
                                justifyContent: 'center',
                                fontSize: 11,
                                fontWeight: 700,
                                flexShrink: 0,
                              }}
                            >
                              {item.currentAssignee.fullName?.charAt(0) || 'U'}
                            </div>
                            <div style={{ minWidth: 0 }}>
                              <div style={{ fontSize: 13, fontWeight: 500, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                                {item.currentAssignee.fullName}
                              </div>
                              <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                                {item.currentAssignee.department?.name || 'Chưa gắn phòng'}
                              </div>
                            </div>
                          </div>
                        ) : item.currentDepartment ? (
                          <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                            🏢 {item.currentDepartment.name}
                          </span>
                        ) : (
                          <span style={{ fontSize: 12, color: '#10b981', fontWeight: 500 }}>
                            📦 Trong kho
                          </span>
                        )}
                      </td>

                      {/* Trạng thái */}
                      <td style={{ padding: '12px 14px' }}>
                        <Badge tone={statusInfo.badgeTone as any}>{statusInfo.label}</Badge>
                      </td>

                      {/* Hạn bảo hành */}
                      <td style={{ padding: '12px 14px', fontSize: 12.5 }}>
                        {item.warrantyExpiresAt ? (
                          <span style={{ color: isWarrantyExpired ? '#ef4444' : 'inherit' }}>
                            {fmtDate(item.warrantyExpiresAt)}
                            {isWarrantyExpired && (
                              <span style={{ fontSize: 10, display: 'block', color: '#ef4444' }}>
                                (Hết hạn)
                              </span>
                            )}
                          </span>
                        ) : (
                          <span style={{ color: 'var(--text-muted)' }}>Không có</span>
                        )}
                      </td>

                      {/* Thao tác */}
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                          <Link
                            href={`/assets/${item.id}`}
                            className="btn btn-secondary btn-sm"
                            style={{ textDecoration: 'none', padding: '4px 10px', fontSize: 12.5 }}
                            title="Xem chi tiết thiết bị"
                          >
                            Chi tiết
                          </Link>

                          <button
                            type="button"
                            className="btn btn-secondary btn-sm asset-action-btn"
                            style={{
                              padding: '4px 7px',
                              display: 'inline-flex',
                              alignItems: 'center',
                              justifyContent: 'center',
                              background: menuState?.id === item.id ? 'var(--surface-hover)' : undefined,
                              borderColor: menuState?.id === item.id ? 'var(--primary, #0284c7)' : undefined,
                            }}
                            onClick={(e) => handleOpenMenu(e, item)}
                            title="Mở menu thao tác..."
                            aria-label="Menu thao tác"
                          >
                            <MoreHorizontal style={{ width: 16, height: 16, pointerEvents: 'none' }} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </Card>

      {/* Floating Action Dropdown Menu (Portal) */}
      {mounted && menuState && (() => {
        const item = assets.find((a) => a.id === menuState.id);
        if (!item) return null;
        return createPortal(
          <div
            className="dropdown asset-action-menu"
            style={{
              position: 'fixed',
              top: menuState.top,
              bottom: 'auto',
              right: menuState.right,
              width: 230,
              maxHeight: 'calc(100vh - 20px)',
              overflowY: 'auto',
              zIndex: 9999,
              boxShadow: 'var(--shadow-xl, 0 10px 25px -5px rgba(0,0,0,0.2), 0 8px 10px -6px rgba(0,0,0,0.1))',
              border: '1px solid var(--border-base, #cbd5e1)',
              background: 'var(--surface-card, #ffffff)',
              borderRadius: 'var(--radius-lg, 8px)',
            }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="dropdown-head" style={{ fontSize: 12, padding: '8px 12px', background: 'var(--surface-sunken, #f8fafc)' }}>
              <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{item.assetCode}</span>
              <span className="hint" style={{ fontSize: 11 }}>Menu thao tác</span>
            </div>

            <Link
              href={`/assets/${item.id}`}
              className="dropdown-item"
              onClick={() => setMenuState(null)}
              style={{ textDecoration: 'none', display: 'flex', alignItems: 'center', gap: 8 }}
            >
              <Eye size={14} color="var(--primary, #0284c7)" />
              <span>Xem chi tiết</span>
            </Link>

            {canEdit && (
              <button
                type="button"
                className="dropdown-item"
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8 }}
                onClick={() => {
                  setMenuState(null);
                  setEditAsset(item);
                }}
              >
                <Edit size={14} color="var(--brand, #6366f1)" />
                <span>Sửa thông tin</span>
              </button>
            )}

            {canAssign && (
              item.currentAssignee ? (
                <button
                  type="button"
                  className="dropdown-item"
                  style={{ width: '100%', color: '#ef4444', display: 'flex', alignItems: 'center', gap: 8 }}
                  onClick={() => {
                    setMenuState(null);
                    setRevokeAsset(item);
                  }}
                >
                  <Undo2 size={14} color="#ef4444" />
                  <span>Thu hồi về kho</span>
                </button>
              ) : item.status !== 'LIQUIDATED' ? (
                <button
                  type="button"
                  className="dropdown-item"
                  style={{ width: '100%', color: '#0284c7', display: 'flex', alignItems: 'center', gap: 8 }}
                  onClick={() => {
                    setMenuState(null);
                    setAssignAsset(item);
                  }}
                >
                  <UserCheck size={14} color="#0284c7" />
                  <span>Cấp phát nhân sự</span>
                </button>
              ) : null
            )}

            {canUpgrade && item.status !== 'LIQUIDATED' && (
              <button
                type="button"
                className="dropdown-item"
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8 }}
                onClick={() => {
                  setMenuState(null);
                  setUpgradeAsset(item);
                }}
              >
                <Cpu size={14} color="#10b981" />
                <span>Nâng cấp RAM/SSD</span>
              </button>
            )}

            {canMaintenance && item.status !== 'LIQUIDATED' && (
              <button
                type="button"
                className="dropdown-item"
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8 }}
                onClick={() => {
                  setMenuState(null);
                  setMaintenanceAsset(item);
                }}
              >
                <Wrench size={14} color="#f59e0b" />
                <span>Bảo hành / Sửa chữa</span>
              </button>
            )}

            {canLiquidate && item.status !== 'LIQUIDATED' && (
              <button
                type="button"
                className="dropdown-item"
                style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8 }}
                onClick={() => {
                  setMenuState(null);
                  setLiquidationAsset(item);
                }}
              >
                <Boxes size={14} color="#64748b" />
                <span>Thanh lý thiết bị</span>
              </button>
            )}

            <button
              type="button"
              className="dropdown-item"
              style={{ width: '100%', display: 'flex', alignItems: 'center', gap: 8 }}
              onClick={() => {
                setMenuState(null);
                handlePrintSingle(item);
              }}
            >
              <Printer size={14} color="var(--text-base)" />
              <span>In tem mã QR</span>
            </button>

            {canDelete && (
              <button
                type="button"
                className="dropdown-item"
                style={{ width: '100%', color: 'var(--danger, #ef4444)', display: 'flex', alignItems: 'center', gap: 8 }}
                onClick={() => {
                  setMenuState(null);
                  setDeleteConfirmAsset(item);
                }}
              >
                <Trash2 size={14} color="var(--danger, #ef4444)" />
                <span>Xóa thiết bị</span>
              </button>
            )}
          </div>,
          document.body
        );
      })()}

      {/* Modals */}
      {createModalOpen && (
        <AssetFormModal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onSuccess={() => router.refresh()}
        />
      )}

      {editAsset && (
        <AssetFormModal
          open={Boolean(editAsset)}
          asset={editAsset}
          onClose={() => setEditAsset(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      {assignAsset && (
        <AssignAssetModal
          open={Boolean(assignAsset)}
          asset={assignAsset}
          employees={employees}
          departments={departments}
          onClose={() => setAssignAsset(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      {revokeAsset && (
        <RevokeAssetModal
          open={Boolean(revokeAsset)}
          asset={revokeAsset}
          onClose={() => setRevokeAsset(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      {upgradeAsset && (
        <UpgradeAssetModal
          open={Boolean(upgradeAsset)}
          asset={upgradeAsset}
          onClose={() => setUpgradeAsset(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      {maintenanceAsset && (
        <MaintenanceModal
          open={Boolean(maintenanceAsset)}
          asset={maintenanceAsset}
          onClose={() => setMaintenanceAsset(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      {liquidationAsset && (
        <LiquidationModal
          open={Boolean(liquidationAsset)}
          asset={liquidationAsset}
          onClose={() => setLiquidationAsset(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      {printAssets && printAssets.length > 0 && (
        <AssetPrintStickerModal
          open={Boolean(printAssets)}
          assets={printAssets}
          onClose={() => setPrintAssets(null)}
        />
      )}

      {deleteConfirmAsset && (
        <ConfirmDialog
          open={Boolean(deleteConfirmAsset)}
          onClose={() => setDeleteConfirmAsset(null)}
          onConfirm={handleDeleteAsset}
          title="Xác nhận xóa thiết bị"
          message={
            <span>
              Bạn có chắc chắn muốn xóa thiết bị <strong>{deleteConfirmAsset.name}</strong> ({deleteConfirmAsset.assetCode})?
              Hành động này sẽ xóa toàn bộ lịch sử luân chuyển, nâng cấp và bảo hành liên quan.
            </span>
          }
          confirmText="Xóa vĩnh viễn"
          danger
          loading={deleting}
        />
      )}
    </div>
  );
}
