'use client';

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
  usePaged,
  Pagination,
  ActionMenu,
  ConfirmDialog,
  PageHeader,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { fmtDate } from '@/lib/date';
import {
  CustomerQuotationModal,
  CustomerQuotationPrintModal,
} from '@/components/domain/customer-quotation-modal';
import { OrderFulfillmentModal } from '@/components/domain/order-fulfillment-modal';
import {
  deleteCustomerQuotationAction,
  convertQuotationToOrderAction,
} from '@/server/modules/customer/actions';
import { QUOTATION_STATUSES } from '@/server/modules/customer/types';

export function QuotationsScreen({
  quotations = [],
  customers = [],
  spareParts = [],
  stockMachines = [],
  warehouses = [],
  pricingConfig,
  companyInfo,
  canManage = false,
}: {
  quotations?: any[];
  customers?: any[];
  spareParts?: any[];
  stockMachines?: any[];
  warehouses?: any[];
  pricingConfig?: any;
  companyInfo?: any;
  canManage?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [isPending, startTransition] = useTransition();

  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState('ALL');

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

  const filteredQuotations = quotations.filter((q: any) => {
    if (statusFilter !== 'ALL' && q.status !== statusFilter) return false;
    if (searchTerm.trim()) {
      const s = searchTerm.toLowerCase().trim();
      const codeMatch = q.quoteCode?.toLowerCase().includes(s);
      const custMatch = q.customer?.name?.toLowerCase().includes(s);
      const phoneMatch = q.customer?.phone?.includes(s);
      const notesMatch = q.notes?.toLowerCase().includes(s);
      return codeMatch || custMatch || phoneMatch || notesMatch;
    }
    return true;
  });

  const quotesPage = usePaged(filteredQuotations, 20);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 20 }}>
      <PageHeader
        title="Báo giá khách hàng"
        description="Lập báo giá linh kiện, thiết bị, dịch vụ; phê duyệt và chốt đơn bán chính thức."
        actions={
          canManage && (
            <Button
              size="sm"
              onClick={() => {
                setEditingQuotation(null);
                setModalOpen(true);
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
            {quotations.length}
          </div>
        </Card>
        <Card style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Đang chờ duyệt</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#2563eb', marginTop: 4 }}>
            {quotations.filter((q: any) => q.status === 'SENT' || q.status === 'DRAFT').length}
          </div>
        </Card>
        <Card style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Khách đã chốt duyệt</div>
          <div style={{ fontSize: 24, fontWeight: 700, color: '#16a34a', marginTop: 4 }}>
            {quotations.filter((q: any) => q.status === 'ACCEPTED').length}
          </div>
        </Card>
        <Card style={{ padding: '14px 18px' }}>
          <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>Tổng giá trị báo giá</div>
          <div style={{ fontSize: 22, fontWeight: 700, color: 'var(--text-strong)', marginTop: 4 }}>
            {new Intl.NumberFormat('vi-VN').format(
              quotations.reduce((sum: number, q: any) => sum + Number(q.totalAmount || 0), 0)
            )} ₫
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
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
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
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            style={{
              padding: '8px 12px',
              borderRadius: 6,
              border: '1px solid var(--border-base)',
              background: 'var(--surface-card)',
              fontSize: 13,
              color: 'var(--text-strong)',
            }}
          >
            <option value="ALL">Tất cả trạng thái ({quotations.length})</option>
            <option value="DRAFT">Bản nháp ({quotations.filter((q: any) => q.status === 'DRAFT').length})</option>
            <option value="SENT">Đã gửi khách ({quotations.filter((q: any) => q.status === 'SENT').length})</option>
            <option value="ACCEPTED">Khách đã duyệt ({quotations.filter((q: any) => q.status === 'ACCEPTED').length})</option>
            <option value="REJECTED">Khách từ chối ({quotations.filter((q: any) => q.status === 'REJECTED').length})</option>
            <option value="EXPIRED">Hết hiệu lực ({quotations.filter((q: any) => q.status === 'EXPIRED').length})</option>
          </select>
        </div>
      </div>

      {/* Quotations List */}
      {filteredQuotations.length === 0 ? (
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
            Chưa có bản báo giá nào
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 460, margin: '0 auto 20px' }}>
            Lập báo giá chuyên nghiệp gửi khách hàng gồm linh kiện, thiết bị, dịch vụ, chiết khấu và thuế VAT. In khổ giấy A4 hoặc chốt thành đơn hàng bán.
          </p>
          {canManage && (
            <Button
              size="sm"
              onClick={() => {
                setEditingQuotation(null);
                setModalOpen(true);
              }}
              style={{ background: '#2563eb', color: '#fff' }}
            >
              <Plus size={15} style={{ marginRight: 6 }} /> Lập báo giá đầu tiên
            </Button>
          )}
        </Card>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th style={{ width: 140, whiteSpace: 'nowrap' }}>Mã báo giá</th>
                <th>Khách hàng</th>
                <th style={{ width: 120 }}>Ngày lập</th>
                <th style={{ width: 120 }}>Hiệu lực đến</th>
                <th style={{ width: 100 }}>Số dòng</th>
                <th style={{ width: 140 }}>Trạng thái</th>
                <th className="num" style={{ width: 160 }}>Tổng thanh toán (VNĐ)</th>
                <th style={{ width: 120, textAlign: 'right' }}>Thao tác</th>
              </tr>
            </thead>
            <tbody>
              {quotesPage.pageRows.map((q: any) => {
                const statusCfg = QUOTATION_STATUSES[q.status] || {
                  label: q.status,
                  color: '#64748b',
                  bg: '#f1f5f9',
                };
                const hasOrder = (q.orders?.length || 0) > 0;

                return (
                  <tr key={q.id}>
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
                                  setModalOpen(true);
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
          <Pagination {...quotesPage} unit="bản báo giá" />
        </div>
      )}

      {modalOpen && (
        <CustomerQuotationModal
          open={modalOpen}
          onClose={() => {
            setModalOpen(false);
            setEditingQuotation(null);
          }}
          quotation={editingQuotation}
          customers={customers}
          spareParts={spareParts}
          pricingConfig={pricingConfig}
          stockMachines={stockMachines}
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
