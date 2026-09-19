'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Laptop,
  Monitor,
  Tv,
  Smartphone,
  Wifi,
  Printer,
  Keyboard,
  HardDrive,
  QrCode,
  UserCheck,
  Undo2,
  Cpu,
  Wrench,
  PackageCheck,
  Trash2,
  Edit,
  Clock,
  CheckCircle2,
  AlertTriangle,
  History,
  ShieldCheck,
  DollarSign,
  Building,
} from 'lucide-react';
import { Button, Card, Badge } from '@/components/ui';
import {
  ASSET_CATEGORIES,
  ASSET_STATUSES,
  UPGRADE_COMPONENTS,
  MAINTENANCE_TYPES,
  LIQUIDATION_TYPES,
} from '@/server/modules/asset/service';
import {
  AssetFormModal,
  AssignAssetModal,
  RevokeAssetModal,
  UpgradeAssetModal,
  MaintenanceModal,
  CompleteMaintenanceModal,
  LiquidationModal,
  AssetPrintStickerModal,
} from '@/components/domain/asset-modals';
import { deleteAssetAction } from '@/server/modules/asset/actions';
import { useToast } from '@/components/ui/toast';
import { generateQrSvg } from '@/lib/qrcode';
import { fmtDate } from '@/lib/date';
import { formatCurrency } from '@/lib/utils';

function getCategoryIcon(cat: string) {
  switch (cat) {
    case 'MONITOR':
      return <Monitor style={{ width: 28, height: 28 }} />;
    case 'PC':
      return <HardDrive style={{ width: 28, height: 28 }} />;
    case 'PRINTER':
      return <Printer style={{ width: 28, height: 28 }} />;
    case 'NETWORK':
      return <Wifi style={{ width: 28, height: 28 }} />;
    case 'PHONE_TABLET':
      return <Smartphone style={{ width: 28, height: 28 }} />;
    case 'ACCESSORY':
      return <Keyboard style={{ width: 28, height: 28 }} />;
    default:
      return <Laptop style={{ width: 28, height: 28 }} />;
  }
}

export function AssetDetailScreen({
  asset,
  departments,
  employees,
  canEdit,
  canAssign,
  canUpgrade,
  canMaintenance,
  canLiquidate,
  canDelete,
}: {
  asset: any;
  departments: { id: number; name: string; code: string }[];
  employees: { id: number; fullName: string; code: string; avatarUrl?: string | null; department?: { name: string } | null }[];
  canEdit?: boolean;
  canAssign?: boolean;
  canUpgrade?: boolean;
  canMaintenance?: boolean;
  canLiquidate?: boolean;
  canDelete?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [activeTab, setActiveTab] = useState<'specs' | 'assignments' | 'upgrades' | 'maintenances' | 'qr'>('specs');

  // Modals
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [assignModalOpen, setAssignModalOpen] = useState(false);
  const [revokeModalOpen, setRevokeModalOpen] = useState(false);
  const [upgradeModalOpen, setUpgradeModalOpen] = useState(false);
  const [maintenanceModalOpen, setMaintenanceModalOpen] = useState(false);
  const [completeMaintenanceTarget, setCompleteMaintenanceTarget] = useState<any>(null);
  const [liquidationModalOpen, setLiquidationModalOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);

  const statusInfo = ASSET_STATUSES[asset.status] || {
    label: asset.status,
    badgeTone: 'neutral',
  };
  const specs = asset.specs || {};
  const isWarrantyExpired = asset.warrantyExpiresAt && new Date(asset.warrantyExpiresAt) < new Date();

  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const qrSvg = generateQrSvg(`${appUrl}/assets/${asset.id}`, { size: 140, margin: 1 });

  const handleDelete = async () => {
    if (!confirm(`Bạn có chắc chắn muốn xóa thiết bị "${asset.name}" (${asset.assetCode})?`)) return;
    setDeleting(true);
    const res = await deleteAssetAction(asset.id);
    setDeleting(false);
    if (res.ok) {
      toast.success(res.message);
      router.push('/assets');
    } else {
      toast.error(res.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      {/* 1. Breadcrumb & Back */}
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
        <Link
          href="/assets"
          style={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 6,
            fontSize: 13,
            color: 'var(--text-muted)',
            textDecoration: 'none',
          }}
        >
          <ArrowLeft style={{ width: 16, height: 16 }} />
          Quay lại danh sách thiết bị
        </Link>
      </div>

      {/* 2. Header Card */}
      <Card style={{ padding: 24 }}>
        <div style={{ display: 'flex', gap: 20, alignItems: 'flex-start' }}>
          {/* Device Icon */}
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: 14,
              background: 'var(--surface-muted, #f1f5f9)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              color: 'var(--primary, #0284c7)',
              flexShrink: 0,
              boxShadow: 'inset 0 0 0 1px rgba(0,0,0,0.05)',
            }}
          >
            {getCategoryIcon(asset.category)}
          </div>

          {/* Title & Metadata */}
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, letterSpacing: '-0.01em' }}>{asset.name}</h1>
              <Badge tone={statusInfo.badgeTone as any}>{statusInfo.label}</Badge>
            </div>

            {/* Metadata Pills */}
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', marginTop: 8, fontSize: 13, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
              <span
                style={{
                  fontFamily: 'monospace',
                  fontWeight: 700,
                  color: 'var(--primary, #0284c7)',
                  background: 'var(--primary-subtle, #e0f2fe)',
                  padding: '2px 8px',
                  borderRadius: 4,
                  fontSize: 12,
                }}
              >
                {asset.assetCode}
              </span>
              {asset.serialNumber && (
                <span>
                  S/N: <strong style={{ color: 'var(--text)' }}>{asset.serialNumber}</strong>
                </span>
              )}
              {asset.brand && (
                <span>
                  • Hãng: <strong style={{ color: 'var(--text)' }}>{asset.brand}</strong>
                </span>
              )}
              {asset.model && (
                <span>
                  • Model: <strong style={{ color: 'var(--text)' }}>{asset.model}</strong>
                </span>
              )}
              <span>
                • Loại: <strong style={{ color: 'var(--text)' }}>{ASSET_CATEGORIES[asset.category]?.label?.split('/')[0] || asset.category}</strong>
              </span>
            </div>
          </div>
        </div>

        {/* Action Toolbar */}
        <div
          style={{
            borderTop: '1px solid var(--border)',
            paddingTop: 16,
            marginTop: 18,
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            flexWrap: 'wrap',
            gap: 10,
          }}
        >
          {/* Operations group */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
            {canAssign && (
              asset.currentAssignee ? (
                <Button variant="danger" size="sm" onClick={() => setRevokeModalOpen(true)}>
                  <Undo2 style={{ width: 14, height: 14, marginRight: 6 }} /> Thu hồi về kho
                </Button>
              ) : asset.status !== 'LIQUIDATED' ? (
                <Button variant="primary" size="sm" onClick={() => setAssignModalOpen(true)}>
                  <UserCheck style={{ width: 14, height: 14, marginRight: 6 }} /> Cấp phát nhân sự
                </Button>
              ) : null
            )}

            {canUpgrade && asset.status !== 'LIQUIDATED' && (
              <Button variant="secondary" size="sm" onClick={() => setUpgradeModalOpen(true)}>
                <Cpu style={{ width: 14, height: 14, marginRight: 6 }} /> Nâng cấp RAM/SSD
              </Button>
            )}

            {canMaintenance && asset.status !== 'LIQUIDATED' && (
              <Button variant="secondary" size="sm" onClick={() => setMaintenanceModalOpen(true)}>
                <Wrench style={{ width: 14, height: 14, marginRight: 6 }} /> Báo sửa / Bảo hành
              </Button>
            )}

            <Button variant="secondary" size="sm" onClick={() => setPrintModalOpen(true)}>
              <Printer style={{ width: 14, height: 14, marginRight: 6 }} /> In tem QR
            </Button>

            {canLiquidate && asset.status !== 'LIQUIDATED' && (
              <Button variant="secondary" size="sm" onClick={() => setLiquidationModalOpen(true)}>
                <PackageCheck style={{ width: 14, height: 14, marginRight: 6 }} /> Thanh lý
              </Button>
            )}
          </div>

          {/* Admin group */}
          <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
            {canEdit && (
              <Button variant="secondary" size="sm" onClick={() => setEditModalOpen(true)}>
                <Edit style={{ width: 14, height: 14, marginRight: 6 }} /> Sửa
              </Button>
            )}

            {canDelete && (
              <Button variant="ghost" size="sm" onClick={handleDelete} loading={deleting} style={{ color: '#ef4444' }}>
                <Trash2 style={{ width: 14, height: 14 }} />
              </Button>
            )}
          </div>
        </div>

        {/* Liquidation banner if any */}
        {asset.liquidation && (
          <div
            style={{
              marginTop: 16,
              padding: '12px 16px',
              background: '#fef2f2',
              border: '1px solid #fecaca',
              borderRadius: 8,
              color: '#991b1b',
              fontSize: 13,
              display: 'flex',
              justifyContent: 'space-between',
              alignItems: 'center',
              flexWrap: 'wrap',
              gap: 8,
            }}
          >
            <div>
              <strong>⚠️ Thiết bị đã thanh lý vào ngày {fmtDate(asset.liquidation.liquidationDate)}</strong>
              <div style={{ marginTop: 2, color: '#b91c1c' }}>
                Lý do: {asset.liquidation.reason} • Hình thức: {LIQUIDATION_TYPES[asset.liquidation.liquidationType] || asset.liquidation.liquidationType}
                {asset.liquidation.buyer && ` • Người mua: ${asset.liquidation.buyer}`}
              </div>
            </div>
            {asset.liquidation.recoveredAmount != null && (
              <div style={{ fontWeight: 700, fontSize: 14, color: '#991b1b' }}>
                Thu hồi: {formatCurrency(Number(asset.liquidation.recoveredAmount))}
              </div>
            )}
          </div>
        )}
      </Card>

      {/* 3. Navigation Tabs */}
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', paddingBottom: 6 }}>
        <button
          type="button"
          className={`tab-item ${activeTab === 'specs' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('specs')}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            border: 'none',
            background: activeTab === 'specs' ? 'var(--primary-subtle, #e0f2fe)' : 'transparent',
            color: activeTab === 'specs' ? 'var(--primary, #0284c7)' : 'var(--text-muted)',
            fontWeight: activeTab === 'specs' ? 600 : 400,
            cursor: 'pointer',
            fontSize: 13.5,
          }}
        >
          Cấu hình & Thông tin
        </button>

        <button
          type="button"
          className={`tab-item ${activeTab === 'assignments' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('assignments')}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            border: 'none',
            background: activeTab === 'assignments' ? 'var(--primary-subtle, #e0f2fe)' : 'transparent',
            color: activeTab === 'assignments' ? 'var(--primary, #0284c7)' : 'var(--text-muted)',
            fontWeight: activeTab === 'assignments' ? 600 : 400,
            cursor: 'pointer',
            fontSize: 13.5,
          }}
        >
          Luân chuyển & Bàn giao ({asset.assignments?.length || 0})
        </button>

        <button
          type="button"
          className={`tab-item ${activeTab === 'upgrades' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('upgrades')}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            border: 'none',
            background: activeTab === 'upgrades' ? 'var(--primary-subtle, #e0f2fe)' : 'transparent',
            color: activeTab === 'upgrades' ? 'var(--primary, #0284c7)' : 'var(--text-muted)',
            fontWeight: activeTab === 'upgrades' ? 600 : 400,
            cursor: 'pointer',
            fontSize: 13.5,
          }}
        >
          Lịch sử Nâng cấp ({asset.upgrades?.length || 0})
        </button>

        <button
          type="button"
          className={`tab-item ${activeTab === 'maintenances' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('maintenances')}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            border: 'none',
            background: activeTab === 'maintenances' ? 'var(--primary-subtle, #e0f2fe)' : 'transparent',
            color: activeTab === 'maintenances' ? 'var(--primary, #0284c7)' : 'var(--text-muted)',
            fontWeight: activeTab === 'maintenances' ? 600 : 400,
            cursor: 'pointer',
            fontSize: 13.5,
          }}
        >
          Bảo hành & Sửa chữa ({asset.maintenances?.length || 0})
        </button>

        <button
          type="button"
          className={`tab-item ${activeTab === 'qr' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('qr')}
          style={{
            padding: '8px 16px',
            borderRadius: 6,
            border: 'none',
            background: activeTab === 'qr' ? 'var(--primary-subtle, #e0f2fe)' : 'transparent',
            color: activeTab === 'qr' ? 'var(--primary, #0284c7)' : 'var(--text-muted)',
            fontWeight: activeTab === 'qr' ? 600 : 400,
            cursor: 'pointer',
            fontSize: 13.5,
          }}
        >
          Tem QR dán máy
        </button>
      </div>

      {/* 4. Tab 1: Cấu hình & Thông tin chi tiết */}
      {activeTab === 'specs' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
          {/* Top Section: 2 Balanced Cards (Hiện trạng & Mua hàng) */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(380px, 1fr))', gap: 20 }}>
            {/* Card 1: Hiện trạng & Người sử dụng */}
            <Card style={{ padding: 20, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                <UserCheck style={{ width: 18, height: 18, color: '#10b981' }} />
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Hiện trạng & Người sử dụng</h3>
              </div>

              {asset.currentAssignee ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
                  {/* User Profile Header */}
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', background: 'var(--surface-subtle, #f8fafc)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: '50%',
                        background: '#0284c7',
                        color: '#fff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: 16,
                        fontWeight: 700,
                        flexShrink: 0,
                      }}
                    >
                      {asset.currentAssignee.fullName?.charAt(0) || 'U'}
                    </div>
                    <div style={{ minWidth: 0, flex: 1 }}>
                      <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text)' }}>
                        {asset.currentAssignee.fullName}
                      </div>
                      <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                        Mã NV: <strong>{asset.currentAssignee.code}</strong> {asset.currentAssignee.department?.name ? `• ${asset.currentAssignee.department.name}` : ''}
                      </div>
                    </div>
                  </div>

                  {/* Detail Key-Value List */}
                  <div style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'baseline', padding: '9px 4px', borderBottom: '1px solid var(--border)', gap: 12 }}>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Email nhân sự</span>
                      <span style={{ fontWeight: 600, color: 'var(--text)', wordBreak: 'break-word' }}>{asset.currentAssignee.email || '—'}</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'baseline', padding: '9px 4px', borderBottom: '1px solid var(--border)', gap: 12 }}>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Số điện thoại</span>
                      <span style={{ fontWeight: 600, color: 'var(--text)' }}>{asset.currentAssignee.phone || '—'}</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'baseline', padding: '9px 4px', borderBottom: '1px solid var(--border)', gap: 12 }}>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Ngày bàn giao</span>
                      <span style={{ fontWeight: 600, color: 'var(--text)' }}>{asset.assignedAt ? fmtDate(asset.assignedAt) : '—'}</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'baseline', padding: '9px 4px', borderBottom: '1px solid var(--border)', gap: 12 }}>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Vị trí làm việc</span>
                      <span style={{ fontWeight: 600, color: 'var(--text)', wordBreak: 'break-word' }}>{asset.location || asset.currentDepartment?.name || 'Văn phòng làm việc'}</span>
                    </div>

                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'baseline', padding: '9px 4px', gap: 12 }}>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Tình trạng lúc giao</span>
                      <span style={{ fontWeight: 500, color: 'var(--text)' }}>{asset.assignments?.[0]?.conditionOnAssign || 'Mới 100%, hoạt động tốt'}</span>
                    </div>
                  </div>
                </div>
              ) : asset.currentDepartment ? (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 14, padding: '12px 14px', background: 'var(--surface-subtle, #f8fafc)', borderRadius: 8, border: '1px solid var(--border)' }}>
                    <div
                      style={{
                        width: 44,
                        height: 44,
                        borderRadius: 8,
                        background: 'var(--primary-subtle, #e0f2fe)',
                        color: 'var(--primary, #0284c7)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        flexShrink: 0,
                      }}
                    >
                      <Building style={{ width: 24, height: 24 }} />
                    </div>
                    <div>
                      <div style={{ fontSize: 15, fontWeight: 700 }}>{asset.currentDepartment.name}</div>
                      <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Cấp phát sử dụng chung cho phòng ban</div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'baseline', padding: '9px 4px', borderBottom: '1px solid var(--border)', gap: 12 }}>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Mã phòng ban</span>
                      <span style={{ fontWeight: 600 }}>{asset.currentDepartment.code}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'baseline', padding: '9px 4px', borderBottom: '1px solid var(--border)', gap: 12 }}>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Ngày bàn giao</span>
                      <span style={{ fontWeight: 600 }}>{asset.assignedAt ? fmtDate(asset.assignedAt) : '—'}</span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'baseline', padding: '9px 4px', gap: 12 }}>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Vị trí thiết bị</span>
                      <span style={{ fontWeight: 600 }}>{asset.location || asset.currentDepartment.name}</span>
                    </div>
                  </div>
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 14, flex: 1, justifyContent: 'center' }}>
                  <div style={{ padding: '20px 16px', textAlign: 'center', background: '#f0fdf4', borderRadius: 8, border: '1px solid #bbf7d0' }}>
                    <PackageCheck style={{ width: 36, height: 36, color: '#16a34a', margin: '0 auto 8px', display: 'block' }} />
                    <div style={{ fontWeight: 700, fontSize: 15, color: '#15803d' }}>Thiết bị đang lưu trong kho IT</div>
                    <div style={{ fontSize: 12.5, color: '#166534', marginTop: 4 }}>Sẵn sàng cấp phát bàn giao cho nhân sự mới</div>
                  </div>

                  <div style={{ display: 'flex', flexDirection: 'column', fontSize: 13 }}>
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'baseline', padding: '9px 4px', borderBottom: '1px solid var(--border)', gap: 12 }}>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Trạng thái</span>
                      <span><Badge tone="success">Trong kho (Sẵn sàng)</Badge></span>
                    </div>
                    <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'baseline', padding: '9px 4px', gap: 12 }}>
                      <span style={{ color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Vị trí lưu kho</span>
                      <span style={{ fontWeight: 600 }}>{asset.location || 'Kho thiết bị IT'}</span>
                    </div>
                  </div>
                </div>
              )}
            </Card>

            {/* Card 2: Mua hàng & Bảo hành */}
            <Card style={{ padding: 20, display: 'flex', flexDirection: 'column' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 16, borderBottom: '1px solid var(--border)', paddingBottom: 10 }}>
                <ShieldCheck style={{ width: 18, height: 18, color: '#8b5cf6' }} />
                <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0 }}>Hồ sơ Mua hàng & Bảo hành</h3>
              </div>

              <div style={{ display: 'flex', flexDirection: 'column', fontSize: 13, flex: 1 }}>
                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'baseline', padding: '9px 4px', borderBottom: '1px solid var(--border)', gap: 12 }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Ngày mua</span>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{asset.purchaseDate ? fmtDate(asset.purchaseDate) : '—'}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'baseline', padding: '9px 4px', borderBottom: '1px solid var(--border)', gap: 12 }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Nguyên giá mua vào</span>
                  <span style={{ fontWeight: 700, color: 'var(--text)' }}>
                    {asset.purchasePrice != null ? formatCurrency(Number(asset.purchasePrice)) : '—'}
                  </span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'baseline', padding: '9px 4px', borderBottom: '1px solid var(--border)', gap: 12 }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Nhà cung cấp</span>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{asset.supplier || '—'}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'baseline', padding: '9px 4px', borderBottom: '1px solid var(--border)', gap: 12 }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Thời hạn bảo hành</span>
                  <span style={{ fontWeight: 600, color: 'var(--text)' }}>{asset.warrantyMonths ? `${asset.warrantyMonths} tháng` : '—'}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'center', padding: '9px 4px', borderBottom: '1px solid var(--border)', gap: 12 }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Hạn bảo hành</span>
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                    <span style={{ fontWeight: 600, color: isWarrantyExpired ? '#ef4444' : 'var(--text)' }}>
                      {asset.warrantyExpiresAt ? fmtDate(asset.warrantyExpiresAt) : '—'}
                    </span>
                    {asset.warrantyExpiresAt && (
                      <Badge tone={isWarrantyExpired ? 'danger' : 'success'}>
                        {isWarrantyExpired ? 'Đã hết hạn' : 'Còn bảo hành'}
                      </Badge>
                    )}
                  </div>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'baseline', padding: '9px 4px', borderBottom: '1px solid var(--border)', gap: 12 }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Số Serial (S/N)</span>
                  <span style={{ fontFamily: 'monospace', fontWeight: 600, color: 'var(--text)' }}>{asset.serialNumber || '—'}</span>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '140px 1fr', alignItems: 'baseline', padding: '9px 4px', gap: 12 }}>
                  <span style={{ color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Vị trí lưu giữ</span>
                  <span style={{ fontWeight: 500, color: 'var(--text)', wordBreak: 'break-word' }}>{asset.location || 'Kho IT'}</span>
                </div>
              </div>
            </Card>
          </div>

          {/* Bottom Section: Card Cấu hình phần cứng chi tiết (Rộng rãi, 2 cột thẳng tắp) */}
          <Card style={{ padding: 24 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 18, borderBottom: '1px solid var(--border)', paddingBottom: 14 }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: 'var(--primary-subtle, #e0f2fe)',
                    color: 'var(--primary, #0284c7)',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    flexShrink: 0,
                  }}
                >
                  <Cpu style={{ width: 22, height: 22 }} />
                </div>
                <div>
                  <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Cấu hình phần cứng & Thông số kỹ thuật</h3>
                  <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 2 }}>
                    Chi tiết linh kiện phần cứng, thiết bị hiển thị và cấu hình hiện tại
                  </div>
                </div>
              </div>

              {canUpgrade && asset.status !== 'LIQUIDATED' && (
                <Button variant="secondary" size="sm" onClick={() => setUpgradeModalOpen(true)}>
                  <Cpu style={{ width: 14, height: 14, marginRight: 6 }} /> Nâng cấp phần cứng
                </Button>
              )}
            </div>

            {/* 2 Cột thông số: Cố định Label 160px, Value left-aligned thẳng hàng */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(360px, 1fr))', gap: '14px 32px' }}>
              {/* Cột 1 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '160px 1fr',
                    alignItems: 'baseline',
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                    borderRadius: 6,
                    background: 'var(--surface-subtle, #f8fafc)',
                    gap: 16,
                  }}
                >
                  <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
                    Bộ vi xử lý (CPU)
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: specs.cpu ? 'var(--text)' : 'var(--text-muted)', wordBreak: 'break-word' }}>
                    {specs.cpu || '—'}
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '160px 1fr',
                    alignItems: 'baseline',
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                    borderRadius: 6,
                    gap: 16,
                  }}
                >
                  <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
                    Bộ nhớ RAM
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: specs.ram ? 'var(--text)' : 'var(--text-muted)', wordBreak: 'break-word' }}>
                    {specs.ram || '—'}
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '160px 1fr',
                    alignItems: 'baseline',
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                    borderRadius: 6,
                    background: 'var(--surface-subtle, #f8fafc)',
                    gap: 16,
                  }}
                >
                  <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
                    Ổ cứng lưu trữ
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: specs.storage ? 'var(--text)' : 'var(--text-muted)', wordBreak: 'break-word' }}>
                    {specs.storage || '—'}
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '160px 1fr',
                    alignItems: 'baseline',
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                    borderRadius: 6,
                    gap: 16,
                  }}
                >
                  <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
                    Card đồ họa (GPU)
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: specs.gpu ? 'var(--text)' : 'var(--text-muted)', wordBreak: 'break-word' }}>
                    {specs.gpu || '—'}
                  </span>
                </div>
              </div>

              {/* Cột 2 */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '160px 1fr',
                    alignItems: 'baseline',
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                    borderRadius: 6,
                    background: 'var(--surface-subtle, #f8fafc)',
                    gap: 16,
                  }}
                >
                  <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
                    Màn hình hiển thị
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: specs.screen ? 'var(--text)' : 'var(--text-muted)', wordBreak: 'break-word' }}>
                    {specs.screen || '—'}
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '160px 1fr',
                    alignItems: 'baseline',
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                    borderRadius: 6,
                    gap: 16,
                  }}
                >
                  <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
                    Hệ điều hành
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: specs.os ? 'var(--text)' : 'var(--text-muted)', wordBreak: 'break-word' }}>
                    {specs.os || '—'}
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '160px 1fr',
                    alignItems: 'baseline',
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                    borderRadius: 6,
                    background: 'var(--surface-subtle, #f8fafc)',
                    gap: 16,
                  }}
                >
                  <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
                    Hãng & Model
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text)', wordBreak: 'break-word' }}>
                    {[asset.brand, asset.model].filter(Boolean).join(' ') || '—'}
                  </span>
                </div>

                <div
                  style={{
                    display: 'grid',
                    gridTemplateColumns: '160px 1fr',
                    alignItems: 'baseline',
                    padding: '10px 12px',
                    borderBottom: '1px solid var(--border)',
                    borderRadius: 6,
                    gap: 16,
                  }}
                >
                  <span style={{ color: 'var(--text-muted)', fontSize: 13, fontWeight: 500, whiteSpace: 'nowrap' }}>
                    Thông số khác
                  </span>
                  <span style={{ fontSize: 13.5, fontWeight: 500, color: specs.other ? 'var(--text)' : 'var(--text-muted)', wordBreak: 'break-word' }}>
                    {specs.other || '—'}
                  </span>
                </div>
              </div>
            </div>

            {/* Ghi chú kỹ thuật nếu có */}
            {asset.notes && (
              <div
                style={{
                  marginTop: 18,
                  padding: '12px 16px',
                  background: 'var(--surface-subtle, #f8fafc)',
                  borderRadius: 8,
                  border: '1px solid var(--border)',
                  fontSize: 13,
                  display: 'flex',
                  alignItems: 'baseline',
                  gap: 10,
                }}
              >
                <span style={{ fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  Ghi chú kỹ thuật:
                </span>
                <span style={{ color: 'var(--text)', wordBreak: 'break-word' }}>{asset.notes}</span>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* 5. Tab 2: Quá trình Luân chuyển & Bàn giao */}
      {activeTab === 'assignments' && (
        <Card style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Lịch sử Luân chuyển & Bàn giao thiết bị</h3>
            {canAssign && asset.status !== 'LIQUIDATED' && (
              <Button
                variant="secondary"
                size="sm"
                onClick={() => (asset.currentAssignee ? setRevokeModalOpen(true) : setAssignModalOpen(true))}
              >
                {asset.currentAssignee ? 'Thu hồi về kho' : 'Bàn giao thiết bị'}
              </Button>
            )}
          </div>

          {(!asset.assignments || asset.assignments.length === 0) ? (
            <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)' }}>
              Chưa có lịch sử bàn giao nào cho thiết bị này.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 16, position: 'relative', paddingLeft: 20, borderLeft: '2px solid var(--border)' }}>
              {asset.assignments.map((item: any, idx: number) => {
                const isCurrent = !item.returnedDate && item.type !== 'REVOKE';
                return (
                  <div key={item.id} style={{ position: 'relative', paddingBottom: 4 }}>
                    {/* Dot on line */}
                    <div
                      style={{
                        position: 'absolute',
                        left: -27,
                        top: 2,
                        width: 12,
                        height: 12,
                        borderRadius: '50%',
                        background: isCurrent ? '#0284c7' : '#94a3b8',
                        border: '2px solid #fff',
                      }}
                    />

                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontWeight: 700, fontSize: 14 }}>
                            {item.type === 'REVOKE'
                              ? 'Thu hồi về kho'
                              : item.type === 'TRANSFER'
                              ? 'Chuyển giao cho nhân sự mới'
                              : 'Bàn giao cho nhân sự'}
                          </span>
                          {isCurrent && <Badge tone="info">Đang giữ</Badge>}
                        </div>

                        <div style={{ display: 'flex', flexDirection: 'column', gap: 6, marginTop: 8, fontSize: 13 }}>
                          {item.employee && (
                            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 12 }}>
                              <span style={{ color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Người nhận máy:</span>
                              <span style={{ color: 'var(--text)' }}><strong>{item.employee.fullName}</strong> ({item.employee.code})</span>
                            </div>
                          )}
                          {item.handoverBy && (
                            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 12 }}>
                              <span style={{ color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Người bàn giao:</span>
                              <span style={{ color: 'var(--text)' }}>{item.handoverBy.fullName}</span>
                            </div>
                          )}
                          {item.conditionOnAssign && (
                            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 12 }}>
                              <span style={{ color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Tình trạng giao:</span>
                              <span style={{ color: 'var(--text)' }}>{item.conditionOnAssign}</span>
                            </div>
                          )}
                          {item.returnedDate && (
                            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 12 }}>
                              <span style={{ color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Ngày thu hồi:</span>
                              <span style={{ color: 'var(--text)' }}>{fmtDate(item.returnedDate)} {item.conditionOnReturn ? `(Tình trạng: ${item.conditionOnReturn})` : ''}</span>
                            </div>
                          )}
                          {item.handoverNote && (
                            <div style={{ display: 'grid', gridTemplateColumns: '130px 1fr', gap: 12 }}>
                              <span style={{ color: 'var(--text-muted)', fontWeight: 500, whiteSpace: 'nowrap' }}>Ghi chú:</span>
                              <span style={{ color: 'var(--text-muted)' }}>{item.handoverNote}</span>
                            </div>
                          )}
                        </div>
                      </div>

                      <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {fmtDate(item.assignedDate)}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* 6. Tab 3: Lịch sử Nâng cấp Phần cứng (RAM, SSD...) */}
      {activeTab === 'upgrades' && (
        <Card style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Lịch sử Nâng cấp & Thay thế linh kiện</h3>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                Theo dõi quá trình nâng cấp RAM, thay ổ cứng SSD, pin... Cấu hình máy được tự động cập nhật.
              </p>
            </div>
            {canUpgrade && asset.status !== 'LIQUIDATED' && (
              <Button variant="primary" size="sm" onClick={() => setUpgradeModalOpen(true)}>
                <Cpu style={{ width: 14, height: 14, marginRight: 6 }} /> Ghi nhận nâng cấp mới
              </Button>
            )}
          </div>

          {(!asset.upgrades || asset.upgrades.length === 0) ? (
            <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)' }}>
              Chưa có lịch sử nâng cấp phần cứng nào cho thiết bị này.
            </div>
          ) : (
            <div style={{ overflowX: 'auto' }}>
              <table className="table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left' }}>
                <thead>
                  <tr style={{ background: 'var(--surface-subtle, #f8fafc)', borderBottom: '1px solid var(--border)' }}>
                    <th style={{ padding: '8px 12px' }}>Ngày nâng cấp</th>
                    <th style={{ padding: '8px 12px' }}>Linh kiện</th>
                    <th style={{ padding: '8px 12px' }}>Hành động</th>
                    <th style={{ padding: '8px 12px' }}>Trước nâng cấp</th>
                    <th style={{ padding: '8px 12px' }}>Sau nâng cấp</th>
                    <th style={{ padding: '8px 12px' }}>Chi phí</th>
                    <th style={{ padding: '8px 12px' }}>Đơn vị / Ghi chú</th>
                  </tr>
                </thead>
                <tbody>
                  {asset.upgrades.map((item: any) => (
                    <tr key={item.id} style={{ borderBottom: '1px solid var(--border)', fontSize: 13 }}>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>{fmtDate(item.upgradeDate)}</td>
                      <td style={{ padding: '10px 12px', fontWeight: 600 }}>
                        {UPGRADE_COMPONENTS[item.component] || item.component}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <Badge tone="info">{item.action}</Badge>
                      </td>
                      <td style={{ padding: '10px 12px', color: 'var(--text-muted)' }}>
                        {item.beforeSpec || '—'}
                      </td>
                      <td style={{ padding: '10px 12px', fontWeight: 700, color: '#0284c7' }}>
                        {item.afterSpec}
                      </td>
                      <td style={{ padding: '10px 12px', whiteSpace: 'nowrap' }}>
                        {item.cost != null ? formatCurrency(Number(item.cost)) : '—'}
                      </td>
                      <td style={{ padding: '10px 12px' }}>
                        <div>{item.provider || 'Nội bộ'}</div>
                        {item.notes && <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>{item.notes}</div>}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* 7. Tab 4: Lịch sử Bảo hành & Sửa chữa */}
      {activeTab === 'maintenances' && (
        <Card style={{ padding: 20 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Lịch sử Bảo hành & Sửa chữa</h3>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                Theo dõi chi phí, đơn vị sửa và thời gian khắc phục sự cố
              </p>
            </div>
            {canMaintenance && asset.status !== 'LIQUIDATED' && (
              <Button variant="primary" size="sm" onClick={() => setMaintenanceModalOpen(true)}>
                <Wrench style={{ width: 14, height: 14, marginRight: 6 }} /> Báo sự cố / Gửi sửa
              </Button>
            )}
          </div>

          {(!asset.maintenances || asset.maintenances.length === 0) ? (
            <div style={{ textAlign: 'center', padding: '36px 0', color: 'var(--text-muted)' }}>
              Chưa có lịch sử sửa chữa hoặc bảo hành nào.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
              {asset.maintenances.map((item: any) => {
                const isPending = item.status === 'PENDING';
                return (
                  <div
                    key={item.id}
                    style={{
                      border: '1px solid var(--border)',
                      borderRadius: 8,
                      padding: 16,
                      background: isPending ? 'var(--surface-subtle, #fefce8)' : 'var(--surface)',
                    }}
                  >
                    <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 8 }}>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                          <span style={{ fontSize: 15, fontWeight: 700 }}>{item.title}</span>
                          <Badge tone={isPending ? 'warning' : 'success'}>
                            {isPending ? 'Đang sửa chữa' : 'Đã hoàn thành'}
                          </Badge>
                          <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>
                            ({MAINTENANCE_TYPES[item.type] || item.type})
                          </span>
                        </div>

                        {item.description && (
                          <div style={{ fontSize: 13, color: 'var(--text-muted)', marginTop: 6 }}>
                            {item.description}
                          </div>
                        )}

                        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: '8px 16px', fontSize: 13, marginTop: 10, padding: '8px 12px', background: 'var(--surface, #fff)', borderRadius: 6, border: '1px solid var(--border)' }}>
                          <div>
                            <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>Ngày gửi:</span>
                            <strong style={{ color: 'var(--text)' }}>{fmtDate(item.startDate)}</strong>
                          </div>
                          {item.completedDate && (
                            <div>
                              <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>Ngày hoàn tất:</span>
                              <strong style={{ color: 'var(--text)' }}>{fmtDate(item.completedDate)}</strong>
                            </div>
                          )}
                          {item.provider && (
                            <div>
                              <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>Nơi sửa:</span>
                              <strong style={{ color: 'var(--text)' }}>{item.provider}</strong>
                            </div>
                          )}
                          {item.cost != null && (
                            <div>
                              <span style={{ color: 'var(--text-muted)', marginRight: 6 }}>Chi phí:</span>
                              <strong style={{ color: 'var(--primary, #0284c7)' }}>{formatCurrency(Number(item.cost))}</strong>
                            </div>
                          )}
                        </div>

                        {item.result && (
                          <div style={{ fontSize: 12.5, marginTop: 8, color: '#15803d', background: '#f0fdf4', padding: '6px 10px', borderRadius: 4 }}>
                            Kết quả: {item.result}
                          </div>
                        )}
                      </div>

                      {isPending && canMaintenance && (
                        <Button
                          variant="primary"
                          size="sm"
                          onClick={() => setCompleteMaintenanceTarget(item)}
                        >
                          <CheckCircle2 style={{ width: 14, height: 14, marginRight: 6 }} />
                          Hoàn tất sửa chữa
                        </Button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </Card>
      )}

      {/* 8. Tab 5: Tem nhãn QR Code dán máy */}
      {activeTab === 'qr' && (
        <Card style={{ padding: 24 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 20 }}>
            <div>
              <h3 style={{ fontSize: 16, fontWeight: 700, margin: 0 }}>Mã QR Code & Tem nhãn dán thiết bị</h3>
              <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '2px 0 0' }}>
                Quét mã QR bằng điện thoại để xem nhanh hồ sơ máy hoặc in tem decal dán trực tiếp lên máy
              </p>
            </div>
            <Button variant="primary" onClick={() => setPrintModalOpen(true)}>
              <Printer style={{ width: 16, height: 16, marginRight: 6 }} /> In tem nhãn này
            </Button>
          </div>

          <div style={{ display: 'flex', gap: 32, alignItems: 'center', flexWrap: 'wrap' }}>
            {/* Mô phỏng tem nhãn decal dán máy */}
            <div
              style={{
                border: '2.5px solid #0f172a',
                borderRadius: 10,
                padding: '14px 16px',
                background: '#ffffff',
                color: '#0f172a',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                boxShadow: '0 4px 16px rgba(0,0,0,0.08)',
                width: 320,
                boxSizing: 'border-box',
              }}
            >
              {/* Header tem */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid #0f172a', paddingBottom: 6, marginBottom: 8 }}>
                <span style={{ fontSize: 11, fontWeight: 900, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  WORKHUB ASSET
                </span>
                <span style={{ fontSize: 9.5, color: '#475569', fontWeight: 600 }}>
                  IT-SUPPORT
                </span>
              </div>

              {/* Body tem */}
              <div style={{ display: 'flex', gap: 12, alignItems: 'center' }}>
                <div
                  style={{ flexShrink: 0, width: 88, height: 88 }}
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: 14, fontWeight: 800, color: '#0f172a', fontFamily: 'monospace' }}>
                    {asset.assetCode}
                  </div>
                  <div style={{ fontSize: 11.5, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={asset.name}>
                    {asset.name}
                  </div>
                  <div style={{ fontSize: 10, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                    {[specs.cpu, specs.ram, specs.storage].filter(Boolean).join(' • ') || 'Tiêu chuẩn'}
                  </div>
                  {asset.serialNumber && (
                    <div style={{ fontSize: 9.5, color: '#64748b', fontFamily: 'monospace' }}>
                      S/N: {asset.serialNumber}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer tem */}
              <div style={{ marginTop: 8, paddingTop: 6, borderTop: '1px dashed #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 9, color: '#64748b' }}>
                  {asset.brand || 'WorkHub Device'}
                </span>
                <span style={{ fontSize: 9, fontWeight: 600, color: '#0f172a' }}>
                  Quét mã xem hồ sơ máy
                </span>
              </div>
            </div>

            {/* Thông tin mã quét */}
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, maxWidth: 360 }}>
              <div style={{ fontSize: 13, color: 'var(--text-muted)' }}>
                Đường dẫn liên kết trong mã QR:
              </div>
              <div
                style={{
                  fontFamily: 'monospace',
                  fontSize: 12,
                  background: 'var(--surface-subtle, #f8fafc)',
                  padding: '8px 12px',
                  borderRadius: 6,
                  border: '1px solid var(--border)',
                  wordBreak: 'break-all',
                }}
              >
                {`${appUrl}/assets/${asset.id}`}
              </div>
              <p style={{ fontSize: 12, color: 'var(--text-muted)', margin: '4px 0 0' }}>
                Mã QR được tối ưu chuẩn vector SVG, in sắc nét kể cả trên máy in tem nhãn nhiệt mini khổ 50x30mm, 60x40mm hoặc in trên giấy A4 decal.
              </p>
            </div>
          </div>
        </Card>
      )}

      {/* Modals */}
      {editModalOpen && (
        <AssetFormModal
          open={editModalOpen}
          asset={asset}
          onClose={() => setEditModalOpen(false)}
          onSuccess={() => router.refresh()}
        />
      )}

      {assignModalOpen && (
        <AssignAssetModal
          open={assignModalOpen}
          asset={asset}
          employees={employees}
          departments={departments}
          onClose={() => setAssignModalOpen(false)}
          onSuccess={() => router.refresh()}
        />
      )}

      {revokeModalOpen && (
        <RevokeAssetModal
          open={revokeModalOpen}
          asset={asset}
          onClose={() => setRevokeModalOpen(false)}
          onSuccess={() => router.refresh()}
        />
      )}

      {upgradeModalOpen && (
        <UpgradeAssetModal
          open={upgradeModalOpen}
          asset={asset}
          onClose={() => setUpgradeModalOpen(false)}
          onSuccess={() => router.refresh()}
        />
      )}

      {maintenanceModalOpen && (
        <MaintenanceModal
          open={maintenanceModalOpen}
          asset={asset}
          onClose={() => setMaintenanceModalOpen(false)}
          onSuccess={() => router.refresh()}
        />
      )}

      {completeMaintenanceTarget && (
        <CompleteMaintenanceModal
          open={Boolean(completeMaintenanceTarget)}
          maintenance={completeMaintenanceTarget}
          onClose={() => setCompleteMaintenanceTarget(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      {liquidationModalOpen && (
        <LiquidationModal
          open={liquidationModalOpen}
          asset={asset}
          onClose={() => setLiquidationModalOpen(false)}
          onSuccess={() => router.refresh()}
        />
      )}

      {printModalOpen && (
        <AssetPrintStickerModal
          open={printModalOpen}
          assets={[asset]}
          onClose={() => setPrintModalOpen(false)}
        />
      )}
    </div>
  );
}
