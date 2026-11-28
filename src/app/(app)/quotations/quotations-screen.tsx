'use client';

import dynamic from 'next/dynamic';
import React, { useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import {
  FileText,
  Plus,
  Search,
  Printer,
  CheckCircle2,
  Edit2,
  Trash2,
} from 'lucide-react';
import {
  Card,
  Button,
  Badge,
  ActionMenu,
  ConfirmDialog,
  PageHeader,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { UrlPagination, useDebouncedSearch, useUrlParams } from '@/components/ui/url-state';
import { SortHeader } from '@/components/ui/sort-header';
import { fmtDate } from '@/lib/date';
import {
  deleteCustomerQuotationAction,
  convertQuotationToOrderAction,
  getQuotationFormCatalogAction,
  expireQuotationsAction,
} from '@/server/modules/customer/actions';
import { QUOTATION_STATUSES } from '@/server/modules/customer/types';

// Modal chỉ tải khi cần mở, không nằm trong bundle đầu của trang
const CustomerQuotationModal = dynamic(() => import('@/components/domain/customer-quotation-modal').then((m) => m.CustomerQuotationModal));
const CustomerQuotationPrintModal = dynamic(() => import('@/components/domain/customer-quotation-modal').then((m) => m.CustomerQuotationPrintModal));
const OrderFulfillmentModal = dynamic(() => import('@/components/domain/order-fulfillment-modal').then((m) => m.OrderFulfillmentModal));

const STATUS_OPTIONS = ['DRAFT', 'SENT', 'ACCEPTED', 'REJECTED', 'EXPIRED'] as const;

export function QuotationsScreen({
  list,
  filter,
  sellers = [],
  warehouses = [],
  pricingConfig,
  companyInfo,
  canManage = false,
}: {
  list: {
    rows: any[];
    total: number;
    page: number;
    pageSize: number;
    summary: { all: number; pending: number; accepted: number; totalValue: number; statusCounts: Record<string, number>; winRate: number | null };
  };
  filter: { q: string; status: string; seller: string; from: string; to: string; sort: string };
  sellers?: { id: number; fullName: string }[];
  warehouses?: any[];
  pricingConfig?: any;
  companyInfo?: any;
  canManage?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const { setParams } = useUrlParams();
  const search = useDebouncedSearch();
  const quotations = list.rows;
  const summary = list.summary;
  const hasFilter = Boolean(filter.q || filter.status || filter.seller || filter.from || filter.to);

  // Chọn nhiều báo giá (chỉ nháp/đã gửi) để đánh dấu hết hiệu lực một lần
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const selectable = quotations.filter((q: any) => ['DRAFT', 'SENT'].includes(q.status)).map((q: any) => q.id as number);
  const allSelected = selectable.length > 0 && selectable.every((id: number) => selected.has(id));
  const toggle = (id: number) =>
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  const expireSelected = async () => {
    const res = await expireQuotationsAction([...selected]);
    if (res.ok) toast.success(res.message);
    else toast.error(res.message);
    setSelected(new Set());
    startTransition(() => router.refresh());
  };

  // Khách, phụ tùng, máy cho form lập báo giá: tải khi mở form lần đầu
  const [catalog, setCatalog] = useState<{ customers: any[]; spareParts: any[]; stockMachines: any[] } | null>(null);
  const [catalogLoading, setCatalogLoading] = useState(false);
  const openModal = async () => {
    if (!catalog) {
      setCatalogLoading(true);
      const res = await getQuotationFormCatalogAction();
      setCatalogLoading(false);
      if (!res.ok) {
        toast.error(res.message);
        return;
      }
      setCatalog({ customers: (res as any).customers, spareParts: (res as any).spareParts, stockMachines: (res as any).stockMachines });
    }
    void openModal();
  };

  const [modalOpen, setModalOpen] = useState(false);
  const [editingQuotation, setEditingQuotation] = useState<any | null>(null);

  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [quotationForPrint, setQuotationForPrint] = useState<any | null>(null);
  const [poPromptOrder, setPoPromptOrder] = useState<any | null>(null);
  const [supplierOrder, setSupplierOrder] = useState<any | null>(null);

  const [confirmDialog, setConfirmDialog] = useState<{
    open: boolean;
    title: string;
    message: React.ReactNode;
    confirmText?: string;
    danger?: boolean;
    onConfirm: () => void | Promise<void>;
  }>({ open: false, title: '', message: '', onConfirm: () => {} });


  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Báo giá khách hàng"
        description="Lập báo giá linh kiện, thiết bị, dịch vụ; phê duyệt và chốt đơn bán chính thức."
        actions={
          canManage && (
            <Button
              size="sm"
              loading={catalogLoading}
              onClick={() => {
                setEditingQuotation(null);
                void openModal();
              }}
              style={{
                background: '#2563eb',
                color: '#fff',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
              }}
            >
              <Plus size={15} /> Lập báo giá mới
            </Button>
          )
        }
      />

      {/* KPI Metrics */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 14 }}>
        <Card style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Tổng số bản báo giá</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-strong)', marginTop: 4 }}>
            {summary.all}
          </div>
        </Card>
        <Card style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Đang chờ duyệt</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#2563eb', marginTop: 4 }}>
            {summary.pending}
          </div>
        </Card>
        <Card style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Khách đã chốt duyệt</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#16a34a', marginTop: 4 }}>
            {summary.accepted}
          </div>
          {summary.winRate !== null && (
            <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
              Tỉ lệ chốt {Math.round(summary.winRate * 100)}% trên báo giá đã có kết quả
            </div>
          )}
        </Card>
        <Card style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Tổng giá trị báo giá</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-strong)', marginTop: 4 }}>
            {new Intl.NumberFormat('vi-VN').format(summary.totalValue)} ₫
          </div>
        </Card>
      </div>

      {/* Filters Bar */}
      <div
        style={{
          display: 'flex',
          gap: 12,
          flexWrap: 'wrap',
          alignItems: 'center',
          justifyContent: 'space-between',
        }}
      >
        <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', flex: 1, minWidth: 320 }}>
          <div style={{ position: 'relative', flex: 1, minWidth: 240 }}>
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: 10,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
            <input
              type="text"
              placeholder="Tìm theo mã báo giá, khách hàng, số điện thoại..."
              value={search.value}
              onChange={(e) => search.onChange(e.target.value)}
              style={{
                width: '100%',
                padding: '8px 10px 8px 32px',
                borderRadius: 6,
                border: '1px solid var(--border-base)',
                background: 'var(--surface-card)',
                fontSize: 13,
                color: 'var(--text-strong)',
              }}
            />
          </div>

          <select
            value={filter.status}
            onChange={(e) => setParams({ status: e.target.value || null })}
            aria-label="Lọc trạng thái"
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid var(--border-base)',
              background: 'var(--surface-card)',
              fontSize: 13,
              color: 'var(--text-strong)',
            }}
          >
            <option value="">Tất cả trạng thái ({summary.all})</option>
            {STATUS_OPTIONS.map((k) => (
              <option key={k} value={k}>
                {QUOTATION_STATUSES[k]?.label ?? k} ({summary.statusCounts[k] ?? 0})
              </option>
            ))}
          </select>
          {sellers.length > 0 && (
            <select
              value={filter.seller}
              onChange={(e) => setParams({ seller: e.target.value || null })}
              aria-label="Lọc nhân viên kinh doanh"
              style={{ padding: '8px 12px', borderRadius: 6, border: '1px solid var(--border-base)', background: 'var(--surface-card)', fontSize: 13, color: 'var(--text-strong)' }}
            >
              <option value="">Mọi nhân viên KD</option>
              {sellers.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
            </select>
          )}
          <input type="date" value={filter.from} onChange={(e) => setParams({ from: e.target.value || null })} aria-label="Từ ngày báo giá"
            style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-base)', background: 'var(--surface-card)', fontSize: 13 }} />
          <input type="date" value={filter.to} onChange={(e) => setParams({ to: e.target.value || null })} aria-label="Đến ngày báo giá"
            style={{ padding: '7px 10px', borderRadius: 6, border: '1px solid var(--border-base)', background: 'var(--surface-card)', fontSize: 13 }} />
          {hasFilter && (
            <Button size="sm" variant="ghost" onClick={() => setParams({ q: null, status: null, seller: null, from: null, to: null })}>
              Xoá lọc
            </Button>
          )}
        </div>
      </div>

      {/* Quotations List */}
      {quotations.length === 0 ? (
        <Card style={{ padding: '56px 24px', textAlign: 'center' }}>
          <div
            style={{
              width: 56,
              height: 56,
              borderRadius: '50%',
              background: '#eff6ff',
              color: '#2563eb',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 16px',
            }}
          >
            <FileText size={28} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: 'var(--text-strong)' }}>
            {hasFilter ? 'Không có báo giá nào khớp bộ lọc' : 'Chưa có bản báo giá nào'}
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 460, margin: '0 auto 20px' }}>
            Lập báo giá chuyên nghiệp gửi khách hàng gồm linh kiện, thiết bị, dịch vụ, chiết khấu và thuế VAT. In khổ giấy A4 hoặc chốt thành đơn hàng bán.
          </p>
          {canManage && (
            <Button
              size="sm"
              loading={catalogLoading}
              onClick={() => {
                setEditingQuotation(null);
                void openModal();
              }}
              style={{ background: '#2563eb', color: '#fff' }}
            >
              <Plus size={15} style={{ marginRight: 6 }} /> Lập báo giá đầu tiên
            </Button>
          )}
        </Card>
      ) : (
        <div className="table-wrap">
          {canManage && selected.size > 0 && (
            <div style={{ display: 'flex', gap: 10, alignItems: 'center', padding: '10px 14px', borderBottom: '1px solid var(--border-base)', background: 'var(--brand-soft)' }}>
              <strong style={{ fontSize: 13 }}>Đã chọn {selected.size} báo giá</strong>
              <Button size="sm" variant="secondary" onClick={() => setConfirmDialog({
                open: true,
                title: 'Đánh dấu hết hiệu lực',
                message: `Chuyển ${selected.size} báo giá đã chọn sang "Hết hiệu lực"?`,
                confirmText: 'Xác nhận',
                onConfirm: expireSelected,
              })}>
                Đánh dấu hết hiệu lực
              </Button>
              <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Bỏ chọn</Button>
            </div>
          )}
          <table className="table">
            <thead>
              <tr>
                {canManage && (
                  <th style={{ width: 36 }}>
                    <input
                      type="checkbox"
                      checked={allSelected}
                      disabled={!selectable.length}
                      onChange={() => setSelected(allSelected ? new Set() : new Set(selectable))}
                      aria-label="Chọn tất cả báo giá nháp/đã gửi trên trang"
                    />
                  </th>
                )}
                <th style={{ width: 140, whiteSpace: 'nowrap' }}>Mã báo giá</th>
                <th>Khách hàng</th>
                <SortHeader label="Ngày lập" sort={filter.sort} field="date" style={{ width: 120 }} />
                <SortHeader label="Hiệu lực đến" sort={filter.sort} field="valid" style={{ width: 120 }} />
                <th style={{ width: 100 }}>Số dòng</th>
                <th style={{ width: 140 }}>Trạng thái</th>
                <SortHeader label="Tổng thanh toán (VNĐ)" sort={filter.sort} field="total" className="num" style={{ width: 160 }} />
                <th style={{ width: 120, textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {quotations.map((q: any) => {
                const statusCfg = QUOTATION_STATUSES[q.status] || {
                  label: q.status,
                  color: '#64748b',
                  bg: '#f1f5f9',
                };
                const hasOrder = (q.orders?.length || 0) > 0;

                return (
                  <tr key={q.id} data-selected={selected.has(q.id) || undefined}>
                    {canManage && (
                      <td>
                        <input
                          type="checkbox"
                          checked={selected.has(q.id)}
                          disabled={!['DRAFT', 'SENT'].includes(q.status)}
                          onChange={() => toggle(q.id)}
                          aria-label={`Chọn ${q.quoteCode}`}
                        />
                      </td>
                    )}
                    <td style={{ whiteSpace: 'nowrap' }}>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: '#2563eb' }}>
                        {q.quoteCode}
                      </span>
                      {hasOrder && (
                        <div className="hint" style={{ color: '#16a34a', fontWeight: 600 }}>
                          ✓ Đã chốt {q.orders[0]?.orderCode}
                        </div>
                      )}
                    </td>
                    <td>
                      <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>
                        {q.customer?.name || 'Khách vãng lai'}
                      </div>
                      <div className="hint">
                        {q.location?.name ? `${q.location.name} · ` : ''}
                        {q.customer?.phone || 'Chưa có SĐT'}
                      </div>
                    </td>
                    <td style={{ fontSize: 12.5 }}>{fmtDate(q.quoteDate)}</td>
                    <td style={{ fontSize: 12.5 }}>
                      {q.validUntil ? fmtDate(q.validUntil) : <span className="text-faint">—</span>}
                    </td>
                    <td style={{ fontSize: 12.5 }}>
                      {q.items?.length || 0} dòng
                    </td>
                    <td>
                      <Badge style={{ background: statusCfg.bg, color: statusCfg.color }}>
                        {statusCfg.label}
                      </Badge>
                    </td>
                    <td className="num">
                      <div style={{ fontWeight: 700, color: 'var(--text-strong)' }}>
                        {new Intl.NumberFormat('vi-VN').format(Number(q.totalAmount || 0))} ₫
                      </div>
                      {Number(q.vatAmount || 0) > 0 && (
                        <div className="hint">Đã gồm {Number(q.vatRate || 0)}% VAT</div>
                      )}
                    </td>
                    <td>
                      <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 6 }}>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => {
                            setQuotationForPrint(q);
                            setPrintModalOpen(true);
                          }}
                          title="In báo giá khổ A4"
                          style={{ padding: '4px 8px', height: 'auto' }}
                        >
                          <Printer size={15} />
                        </Button>

                        {canManage && (
                          <ActionMenu
                            title={q.quoteCode}
                            items={[
                              {
                                key: 'print',
                                label: 'Xem / In bản A4',
                                icon: <Printer size={15} />,
                                onClick: () => {
                                  setQuotationForPrint(q);
                                  setPrintModalOpen(true);
                                },
                              },
                              {
                                key: 'edit',
                                label: 'Chỉnh sửa báo giá',
                                icon: <Edit2 size={15} />,
                                onClick: () => {
                                  setEditingQuotation(q);
                                  void openModal();
                                },
                              },
                              ...(!hasOrder && q.status !== 'REJECTED'
                                ? [
                                    {
                                      key: 'convert',
                                      label: 'Chốt thành đơn hàng',
                                      icon: <CheckCircle2 size={15} />,
                                      onClick: () => {
                                        setConfirmDialog({
                                          open: true,
                                          title: 'Chốt báo giá thành đơn hàng',
                                          message: `Bạn có chắc muốn chốt báo giá ${q.quoteCode} của khách "${q.customer?.name}" thành đơn hàng chính thức?`,
                                          confirmText: 'Chốt đơn hàng',
                                          onConfirm: async () => {
                                            const res = await convertQuotationToOrderAction(q.id, q.customerId);
                                            if (res.ok) {
                                              toast.success(res.message);
                                              startTransition(() => router.refresh());
                                              if (res.order?.status === 'AWAITING_STOCK') {
                                                setPoPromptOrder(res.order);
                                              }
                                            } else {
                                              toast.error(res.message);
                                            }
                                          },
                                        });
                                      },
                                    },
                                  ]
                                : []),
                              {
                                key: 'delete',
                                label: 'Xóa báo giá',
                                icon: <Trash2 size={15} />,
                                danger: true,
                                onClick: () => {
                                  setConfirmDialog({
                                    open: true,
                                    title: 'Xóa báo giá',
                                    message: `Bạn có chắc muốn xóa báo giá ${q.quoteCode}? Thao tác này không thể hoàn tác.`,
                                    confirmText: 'Xóa báo giá',
                                    danger: true,
                                    onConfirm: async () => {
                                      const res = await deleteCustomerQuotationAction(q.id, q.customerId);
                                      if (res.ok) {
                                        toast.success(res.message);
                                        startTransition(() => router.refresh());
                                      } else {
                                        toast.error(res.message);
                                      }
                                    },
                                  });
                                },
                              },
                            ]}
                          />
                        )}
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          <UrlPagination total={list.total} page={list.page} pageSize={list.pageSize} unit="bản báo giá" />
        </div>
      )}

      {modalOpen && catalog && (
        <CustomerQuotationModal
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setEditingQuotation(null);
          }}
          quotation={editingQuotation}
          customers={catalog.customers}
          spareParts={catalog.spareParts}
          pricingConfig={pricingConfig}
          stockMachines={catalog.stockMachines}
          companyInfo={companyInfo}
          onSuccess={() => startTransition(() => router.refresh())}
        />
      )}

      {printModalOpen && quotationForPrint && (
        <CustomerQuotationPrintModal
          open={printModalOpen}
          onClose={() => {
            setPrintModalOpen(false);
            setQuotationForPrint(null);
          }}
          quotation={quotationForPrint}
          customer={quotationForPrint.customer}
          companyInfo={companyInfo}
        />
      )}

      <ConfirmDialog
        open={Boolean(poPromptOrder)}
        title="Đơn hàng đang thiếu tồn kho"
        message={`Đơn ${poPromptOrder?.orderCode} đã được tạo và đang chờ hàng. Bạn muốn tạo PO cho phần còn thiếu ngay bây giờ?`}
        confirmText="Tạo PO ngay"
        cancelText="Để sau"
        onClose={() => setPoPromptOrder(null)}
        onConfirm={() => {
          setSupplierOrder(poPromptOrder);
          setPoPromptOrder(null);
        }}
      />

      {supplierOrder && (
        <OrderFulfillmentModal
          open={Boolean(supplierOrder)}
          order={supplierOrder}
          customerId={supplierOrder.customerId}
          warehouses={warehouses}
          mode="SUPPLIER"
          onClose={() => setSupplierOrder(null)}
          onSuccess={() => startTransition(() => router.refresh())}
        />
      )}

      <ConfirmDialog
        open={confirmDialog.open}
        title={confirmDialog.title}
        message={confirmDialog.message}
        confirmText={confirmDialog.confirmText}
        danger={confirmDialog.danger}
        onClose={() => setConfirmDialog((prev) => ({ ...prev, open: false }))}
        onConfirm={async () => {
          const fn = confirmDialog.onConfirm;
          setConfirmDialog((prev) => ({ ...prev, open: false }));
          await fn();
        }}
      />
    </div>
  );
}
