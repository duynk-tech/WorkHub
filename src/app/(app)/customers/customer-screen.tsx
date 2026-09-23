'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2,
  Plus,
  Search,
  ExternalLink,
  Edit2,
  Trash2,
  MapPin,
  Utensils,
  ShoppingBag,
  Users,
  CheckCircle2,
  Phone,
} from 'lucide-react';
import { Card, Button, Input, Badge, usePaged, Pagination, ScrollTabs, ConfirmDialog } from '@/components/ui';
import { SearchableSelect } from '@/components/ui/searchable-select';
import { useToast } from '@/components/ui/toast';
import { CustomerModal } from '@/components/domain/customer-modals';
import { deleteCustomerAction } from '@/server/modules/customer/actions';
import { CUSTOMER_STATUSES, type CustomerMetrics } from '@/server/modules/customer/types';
import { CustomerCarePanel } from '@/components/domain/customer-care-panel';

export function CustomerScreen({
  customers,
  care,
  technicians = [],
  initialTab,
  metrics,
  filter,
  canManage,
}: {
  customers: any[];
  /** Danh sách máy cần chăm sóc, gom theo khách. */
  care?: any;
  technicians?: any[];
  initialTab?: string;
  metrics: CustomerMetrics;
  filter: { search: string; status: string };
  canManage: boolean;
}) {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState<'list' | 'care'>(
    initialTab === 'care'
      ? 'care'
      : typeof window !== 'undefined' &&
        (new URLSearchParams(window.location.search).get('tab') === 'care' ||
         new URLSearchParams(window.location.search).has('within'))
      ? 'care'
      : 'list',
  );

  const handleTabChange = (tab: 'list' | 'care') => {
    setActiveTab(tab);
    if (typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      if (tab === 'care') {
        params.set('tab', 'care');
      } else {
        params.delete('tab');
        params.delete('within');
      }
      const qs = params.toString();
      window.history.replaceState(null, '', `${window.location.pathname}${qs ? `?${qs}` : ''}`);
    }
  };

  // Danh sách khách hàng lọc phía server nhưng vẫn trả về hết, phân trang tại đây
  const paged = usePaged(customers, 20);
  const toast = useToast();

  const [search, setSearch] = useState(filter.search || '');
  const [status, setStatus] = useState(filter.status || '');
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);

  const handleFilterChange = (updates: Partial<{ search: string; status: string }>) => {
    const params = new URLSearchParams();
    const newSearch = updates.search !== undefined ? updates.search : search;
    const newStatus = updates.status !== undefined ? updates.status : status;

    if (newSearch) params.set('q', newSearch);
    if (newStatus) params.set('status', newStatus);

    router.push(`/customers?${params.toString()}`);
  };

  const [customerToDelete, setCustomerToDelete] = useState<any>(null);
  const [deletingCustomer, setDeletingCustomer] = useState(false);

  const handleDelete = (c: any) => {
    setCustomerToDelete(c);
  };

  const confirmDeleteCustomer = async () => {
    if (!customerToDelete) return;
    setDeletingCustomer(true);
    const res = await deleteCustomerAction(customerToDelete.id);
    setDeletingCustomer(false);
    setCustomerToDelete(null);
    if (res.ok) {
      toast.success(res.message);
      router.refresh();
    } else {
      toast.error(res.message);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20, paddingBottom: 40 }}>
      {/* 1. Header & Actions */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', flexWrap: 'wrap', gap: 12 }}>
        <div>
          <h1 style={{ fontSize: 22, fontWeight: 700, margin: 0, color: 'var(--text-strong)' }}>
            {activeTab === 'care' ? 'Lịch Bảo Dưỡng & Bảo Hành Thiết Bị' : 'Khách hàng'}
          </h1>
          <p style={{ margin: '4px 0 0', fontSize: 13.5, color: 'var(--text-muted)' }}>
            {activeTab === 'care'
              ? 'Theo dõi hạn bảo dưỡng định kỳ và thời hạn bảo hành của thiết bị tại tất cả các điểm khách hàng'
              : 'Quản lý chuỗi nhà hàng, quán cà phê, tiệm bánh, lịch sử mua máy và các điểm lắp đặt'}
          </p>
        </div>

        {canManage && activeTab === 'list' && (
          <Button variant="primary" onClick={() => setCreateModalOpen(true)}>
            <Plus style={{ width: 16, height: 16, marginRight: 6 }} /> Thêm khách hàng mới
          </Button>
        )}
      </div>

      {/* 2. Tabs */}
      <ScrollTabs>
        {([
          { key: 'list', label: `Danh sách khách hàng (${customers.length})` },
          { key: 'care', label: `Bảo hành, bảo dưỡng (${care?.totals?.machines ?? 0})` },
        ] as const).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => handleTabChange(t.key)}
            style={{
              padding: '10px 16px',
              flexShrink: 0,
              whiteSpace: 'nowrap',
              fontWeight: activeTab === t.key ? 700 : 500,
              fontSize: 14,
              borderBottom: activeTab === t.key ? '2px solid var(--brand)' : '2px solid transparent',
              color: activeTab === t.key ? 'var(--brand)' : 'var(--text-muted)',
              background: 'none',
              borderTop: 'none',
              borderLeft: 'none',
              borderRight: 'none',
              cursor: 'pointer',
            }}
          >
            {t.label}
          </button>
        ))}
      </ScrollTabs>

      {/* 3. Tab Content */}
      {activeTab === 'care' && (
        <CustomerCarePanel
          care={care}
          technicians={technicians}
          onChangeWindow={(days) => {
            const params = new URLSearchParams(window.location.search);
            params.set('tab', 'care');
            params.set('within', String(days));
            router.push(`/customers?${params.toString()}`);
          }}
        />
      )}

      {activeTab === 'list' && (
        <>
          {/* CRM Metrics Cards */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 14 }}>
            <Card style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: '#eff6ff', color: '#2563eb', display: 'grid', placeItems: 'center' }}>
                <Building2 style={{ width: 20, height: 20 }} />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: 'var(--text-strong)' }}>{metrics.total}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Tổng khách hàng</div>
              </div>
            </Card>

            <Card style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: '#f0fdf4', color: '#16a34a', display: 'grid', placeItems: 'center' }}>
                <CheckCircle2 style={{ width: 20, height: 20 }} />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#16a34a' }}>{metrics.active}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Khách đang giao dịch</div>
              </div>
            </Card>

            <Card style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: '#fef3c7', color: '#d97706', display: 'grid', placeItems: 'center' }}>
                <Utensils style={{ width: 20, height: 20 }} />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#d97706' }}>{metrics.totalMachines}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Máy móc đang vận hành</div>
              </div>
            </Card>

            <Card style={{ padding: 14, display: 'flex', alignItems: 'center', gap: 12 }}>
              <div style={{ width: 42, height: 42, borderRadius: 10, background: '#f5f3ff', color: '#7c3aed', display: 'grid', placeItems: 'center' }}>
                <ShoppingBag style={{ width: 20, height: 20 }} />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#7c3aed' }}>{metrics.totalOrders}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Đơn hàng / Hợp đồng</div>
              </div>
            </Card>
          </div>
      {/* 3. Filter Bar */}
      <Card style={{ padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 240px', gap: 12, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Input
              placeholder="Tìm theo tên công ty, chuỗi quán, mã KH, SĐT, người đại diện..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') handleFilterChange({ search });
              }}
            />
          </div>

          <SearchableSelect
            value={status}
            onChange={(val) => {
              setStatus(val);
              handleFilterChange({ status: val });
            }}
            options={[
              { value: '', label: '-- Tất cả trạng thái --' },
              ...Object.entries(CUSTOMER_STATUSES).map(([k, v]) => ({
                value: k,
                label: v.label,
              })),
            ]}
            placeholder="-- Tất cả trạng thái --"
            searchPlaceholder="Tìm trạng thái..."
          />
        </div>
      </Card>

      {/* 4. Customer Table */}
      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
            <thead>
              <tr style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border-base)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>
                <th style={{ padding: '12px 14px', width: 50, textAlign: 'center' }}>STT</th>
                <th style={{ padding: '12px 14px', width: '1%', whiteSpace: 'nowrap' }}>Mã KH</th>
                <th style={{ padding: '12px 14px' }}>Khách hàng / Doanh nghiệp</th>
                <th style={{ padding: '12px 14px' }}>Người đại diện</th>
                <th style={{ padding: '12px 14px' }}>Điểm đặt</th>
                <th style={{ padding: '12px 14px' }}>Thiết bị</th>
                <th style={{ padding: '12px 14px' }}>Trạng thái</th>
                <th style={{ padding: '12px 14px', width: 100, textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    Không tìm thấy khách hàng nào phù hợp
                  </td>
                </tr>
              ) : (
                paged.pageRows.map((c: any, index: number) => {
                  const statusInfo = CUSTOMER_STATUSES[c.status] || { label: c.status, color: '#64748b', bg: '#f1f5f9' };
                  const locationCount = c._count?.locations ?? c.locations?.length ?? 0;
                  const machineCount = c._count?.machines ?? c.machines?.length ?? 0;

                  return (
                    <tr
                      key={c.id}
                      style={{
                        borderBottom: '1px solid var(--border-base)',
                        transition: 'background 0.15s ease',
                      }}
                      className="hover:bg-slate-50 dark:hover:bg-slate-800/40"
                    >
                      {/* STT */}
                      <td style={{ padding: '14px', textAlign: 'center', color: 'var(--text-muted)', verticalAlign: 'top' }}>
                        {String(paged.offset + index + 1).padStart(2, '0')}
                      </td>

                      {/* Mã KH */}
                      <td style={{ padding: '14px', verticalAlign: 'top', whiteSpace: 'nowrap' }}>
                        <Link
                          href={`/customers/${c.id}`}
                          style={{
                            display: 'inline-block',
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            fontSize: 12,
                            padding: '3px 8px',
                            borderRadius: 'var(--radius-xs)',
                            background: '#eff6ff',
                            color: '#2563eb',
                            border: '1px solid #bfdbfe',
                            textDecoration: 'none',
                            whiteSpace: 'nowrap',
                          }}
                        >
                          {c.code}
                        </Link>
                      </td>

                      {/* Tên khách hàng */}
                      <td style={{ padding: '14px', verticalAlign: 'top' }}>
                        <Link
                          href={`/customers/${c.id}`}
                          style={{
                            fontWeight: 700,
                            color: 'var(--text-strong)',
                            textDecoration: 'none',
                            fontSize: 13.5,
                          }}
                          className="hover:text-blue-600"
                        >
                          {c.name}
                        </Link>
                        {c.address && (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 3 }}>
                            {c.address}
                          </div>
                        )}
                      </td>

                      {/* Người đại diện */}
                      <td style={{ padding: '14px', verticalAlign: 'top' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>
                          {c.contactName || 'Chưa cập nhật'}
                        </div>
                        <div style={{ fontSize: 12, color: 'var(--text-muted)', display: 'flex', alignItems: 'center', gap: 4, marginTop: 2 }}>
                          <Phone size={12} /> {c.phone}
                        </div>
                      </td>

                      {/* Điểm đặt */}
                      <td style={{ padding: '14px', verticalAlign: 'top' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 8px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--surface-sunken)',
                            color: 'var(--text-strong)',
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          <MapPin size={12} color="#0284c7" />
                          {locationCount} chi nhánh
                        </span>
                      </td>

                      {/* Thiết bị */}
                      <td style={{ padding: '14px', verticalAlign: 'top' }}>
                        <span
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            padding: '3px 8px',
                            borderRadius: 'var(--radius-sm)',
                            background: machineCount > 0 ? '#fef3c7' : 'var(--surface-sunken)',
                            color: machineCount > 0 ? '#d97706' : 'var(--text-muted)',
                            fontSize: 12,
                            fontWeight: 600,
                          }}
                        >
                          <Utensils size={12} />
                          {machineCount} máy
                        </span>
                      </td>

                      {/* Trạng thái */}
                      <td style={{ padding: '14px', verticalAlign: 'top' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '3px 8px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: 11.5,
                            fontWeight: 600,
                            background: statusInfo.bg,
                            color: statusInfo.color,
                          }}
                        >
                          {statusInfo.label}
                        </span>
                      </td>

                      {/* Thao tác */}
                      <td style={{ padding: '14px', textAlign: 'right', verticalAlign: 'top' }}>
                        <div style={{ display: 'inline-flex', gap: 4 }}>
                          <Link
                            href={`/customers/${c.id}`}
                            style={{
                              padding: '5px 8px',
                              borderRadius: 'var(--radius-sm)',
                              background: 'var(--surface-sunken)',
                              color: 'var(--text-strong)',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                            }}
                            title="Xem chi tiết & lịch sử"
                          >
                            <ExternalLink size={14} />
                          </Link>

                          {canManage && (
                            <>
                              <button
                                type="button"
                                onClick={() => setEditingCustomer(c)}
                                style={{
                                  padding: '5px 8px',
                                  borderRadius: 'var(--radius-sm)',
                                  background: 'var(--surface-sunken)',
                                  color: 'var(--text-strong)',
                                  border: 'none',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                }}
                                title="Chỉnh sửa"
                              >
                                <Edit2 size={14} />
                              </button>

                              <button
                                type="button"
                                onClick={() => handleDelete(c)}
                                style={{
                                  padding: '5px 8px',
                                  borderRadius: 'var(--radius-sm)',
                                  background: 'var(--surface-sunken)',
                                  color: 'var(--danger)',
                                  border: 'none',
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                }}
                                title="Xóa khách hàng"
                              >
                                <Trash2 size={14} />
                              </button>
                            </>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        <Pagination {...paged} unit="khách hàng" />
      </Card>
      </>
      )}

      {/* Customer Modals */}
      {createModalOpen && (
        <CustomerModal
          open={createModalOpen}
          onClose={() => setCreateModalOpen(false)}
          onSuccess={() => router.refresh()}
        />
      )}

      {editingCustomer && (
        <CustomerModal
          open={Boolean(editingCustomer)}
          customer={editingCustomer}
          onClose={() => setEditingCustomer(null)}
          onSuccess={() => router.refresh()}
        />
      )}

      {customerToDelete && (
        <ConfirmDialog
          open={Boolean(customerToDelete)}
          onClose={() => setCustomerToDelete(null)}
          onConfirm={confirmDeleteCustomer}
          title="Xác nhận xóa khách hàng"
          message={`Bạn có chắc chắn muốn xóa khách hàng "${customerToDelete.name}"? Hành động này không thể hoàn tác.`}
          confirmText="Xóa vĩnh viễn"
          danger
          loading={deletingCustomer}
        />
      )}
    </div>
  );
}
