'use client';

import { SavedViewsBar } from '@/components/ui/saved-views';
import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Building2,
  FileSpreadsheet,
  Plus,
  Search,
  ExternalLink,
  Edit2,
  Trash2,
  MapPin,
  Utensils,
  ShoppingBag,
  Users,
  Phone,
} from 'lucide-react';
import { Card, Button, Input, Badge, ScrollTabs, ConfirmDialog } from '@/components/ui';
import { ImportExcelModal } from '@/components/domain/import-excel-modal';
import { UrlPagination, useDebouncedSearch, useUrlParams } from '@/components/ui/url-state';
import type { PageMeta } from '@/lib/list-query';
import { useToast } from '@/components/ui/toast';
import { CustomerModal } from '@/components/domain/customer-modals';
import { deleteCustomerAction } from '@/server/modules/customer/actions';
import type { CustomerMetrics } from '@/server/modules/customer/types';
import { CustomerCarePanel } from '@/components/domain/customer-care-panel';

export function CustomerScreen({
  customers,
  paging,
  care,
  technicians = [],
  initialTab,
  metrics,
  filter,
  canManage,
}: {
  customers: any[];
  paging: PageMeta;
  /** Danh sách máy cần chăm sóc, gom theo khách. */
  care?: any;
  technicians?: any[];
  initialTab?: string;
  metrics: CustomerMetrics;
  filter: { search: string; status?: string; sort?: string };
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

  // Lọc, sắp xếp và phân trang đều chạy ở server; trạng thái nằm trên URL
  const toast = useToast();
  const { setParams } = useUrlParams();
  const search = useDebouncedSearch();
  const [createModalOpen, setCreateModalOpen] = useState(false);
  const [importOpen, setImportOpen] = useState(false);
  const [editingCustomer, setEditingCustomer] = useState<any | null>(null);

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
      <div className="page-header">
        <div>
          <h1 className="page-title">
            {activeTab === 'care' ? 'Lịch Bảo Dưỡng & Bảo Hành Thiết Bị' : 'Khách hàng'}
          </h1>
          <p className="page-desc">
            {activeTab === 'care'
              ? 'Theo dõi hạn bảo dưỡng định kỳ và thời hạn bảo hành của thiết bị tại tất cả các điểm khách hàng'
              : 'Quản lý chuỗi nhà hàng, quán cà phê, tiệm bánh, lịch sử mua máy và các điểm lắp đặt'}
          </p>
        </div>

        {canManage && activeTab === 'list' && (
          <div className="toolbar">
            <Button variant="secondary" onClick={() => setImportOpen(true)}>
              <FileSpreadsheet /> Nhập Excel
            </Button>
            <Button variant="primary" onClick={() => setCreateModalOpen(true)}>
              <Plus /> Thêm khách hàng mới
            </Button>
          </div>
        )}
        <ImportExcelModal kind="customers" open={importOpen} onClose={() => setImportOpen(false)} />
      </div>
      <SavedViewsBar module="customers" />

      {/* 2. Tabs */}
      <ScrollTabs>
        {([
          { key: 'list', label: `Danh sách khách hàng (${paging.total})` },
          { key: 'care', label: `Bảo hành, bảo dưỡng (${care?.totals?.machines ?? 0})` },
        ] as const).map((t) => (
          <button
            key={t.key}
            type="button"
            onClick={() => handleTabChange(t.key)}
            className="tab"
              data-active={activeTab === t.key}
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
              <div style={{ width: 42, height: 42, borderRadius: 10, background: '#fef3c7', color: '#d97706', display: 'grid', placeItems: 'center' }}>
                <Utensils style={{ width: 20, height: 20 }} />
              </div>
              <div>
                <div style={{ fontSize: 20, fontWeight: 800, color: '#d97706' }}>{metrics.totalMachines}</div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>Thiết bị đang vận hành</div>
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
        <div style={{ display: 'grid', gridTemplateColumns: '1fr auto', gap: 12, alignItems: 'center' }}>
          <div style={{ position: 'relative' }}>
            <Input
              placeholder="Tìm theo tên công ty, chuỗi quán, mã KH, SĐT, người đại diện..."
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
            />
          </div>
          <select
            className="select"
            aria-label="Sắp xếp khách hàng"
            value={filter.sort ?? 'created'}
            onChange={(e) => setParams({ sort: e.target.value === 'created' ? null : e.target.value })}
            style={{ width: 'auto', minWidth: 170 }}
          >
            <option value="created">Mới thêm gần đây</option>
            <option value="name">Tên A → Z</option>
            <option value="code">Mã khách hàng</option>
          </select>

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
                <th style={{ padding: '12px 14px', width: 100, textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {customers.length === 0 ? (
                <tr>
                  <td colSpan={7} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                    {filter.search ? 'Không tìm thấy khách hàng nào phù hợp' : 'Chưa có khách hàng nào'}
                  </td>
                </tr>
              ) : (
                customers.map((c: any, index: number) => {
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
                        {String(paging.offset + index + 1).padStart(2, '0')}
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

        <UrlPagination total={paging.total} page={paging.page} pageSize={paging.pageSize} unit="khách hàng" />
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
