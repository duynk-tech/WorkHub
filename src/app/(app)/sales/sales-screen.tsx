'use client';

import { useMemo, useState, useEffect, useRef } from 'react';
import Link from 'next/link';
import { ShoppingCart, Plus, Wallet, Truck, AlertTriangle, Printer } from 'lucide-react';
import {
  Badge, Button, Card, PageHeader, Pagination, SearchInput, SearchableSelect, StatCard, usePaged,
} from '@/components/ui';
import { fmtDate } from '@/lib/date';
import { SalesOrderDetailModal } from '@/components/domain/sales-order-detail-modal';
import { CustomerOrderModal } from '@/components/domain/customer-modals';
import { getCustomerOrderContextAction } from '@/server/modules/customer/actions';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { useRouter, useSearchParams } from 'next/navigation';
import {
  ORDER_STATUSES,
  ORDER_TYPES,
} from '@/server/modules/customer/types';

/* eslint-disable @typescript-eslint/no-explicit-any */

const money = (n: number) => `${new Intl.NumberFormat('vi-VN').format(Math.round(n || 0))} ₫`;

const isCompletedOrCancelled = (o: any) =>
  ['COMPLETED', 'CANCELLED'].includes(o.status) || (Boolean(o.stockIssuedAt) && Number(o.remaining || 0) <= 0);

/** Nhóm theo việc kinh doanh phải làm, không theo cột dữ liệu. */
const CHIPS: { key: string; label: string; color: string; match: (o: any) => boolean }[] = [
  { key: 'ALL', label: 'Tất cả', color: 'var(--brand)', match: () => true },
  {
    key: 'OPEN',
    label: 'Chưa hoàn tất',
    color: '#d97706',
    match: (o) => !isCompletedOrCancelled(o),
  },
  {
    key: 'AWAITING',
    label: 'Chờ xuất kho',
    color: '#7c3aed',
    match: (o) => !o.stockIssuedAt && ['AWAITING_STOCK', 'READY_TO_DELIVER'].includes(o.status),
  },
  { key: 'DEBT', label: 'Còn phải thu', color: '#dc2626', match: (o) => Number(o.remaining) > 0 },
];

export function SalesScreen({
  orders = [],
  customers = [],
  spareParts = [],
  stockMachines = [],
  pricingConfig,
  companyInfo,
  canManage = false,
}: {
  orders?: any[];
  /** Danh sách khách để chọn khi lập đơn — chỉ cần id, mã, tên, điện thoại. */
  customers?: any[];
  spareParts?: any[];
  stockMachines?: any[];
  pricingConfig?: any;
  companyInfo?: any;
  canManage?: boolean;
}) {
  const router = useRouter();
  const toast = useToast();
  const [search, setSearch] = useState('');
  const [chip, setChip] = useState('ALL');
  const [typeFilter, setTypeFilter] = useState('');
  // Xem chi tiết bằng popup: bấm xong đóng lại là vẫn ở đúng trang và bộ lọc đang xem
  const [detailId, setDetailId] = useState<number | null>(null);

  /**
   * Lập đơn ngay tại đây: chọn khách trước, lấy dữ liệu riêng của khách đó rồi
   * mở đúng form đang dùng ở hồ sơ khách — một form, một luồng nghiệp vụ.
   */
  const [pickCustomerOpen, setPickCustomerOpen] = useState(false);
  const [pickedCustomerId, setPickedCustomerId] = useState('');
  const [loadingCtx, setLoadingCtx] = useState(false);
  const [orderCtx, setOrderCtx] = useState<any>(null);

  const searchParams = useSearchParams();
  const customerIdParam = searchParams.get('customerId');
  const autoOpenedRef = useRef<string | null>(null);

  const openOrderForm = async (customerId: number) => {
    setLoadingCtx(true);
    const res = await getCustomerOrderContextAction(customerId);
    setLoadingCtx(false);
    if (!res.ok) {
      toast.error(res.message);
      return;
    }
    setPickCustomerOpen(false);
    setPickedCustomerId('');
    setOrderCtx((res as any).data);
  };

  useEffect(() => {
    if (customerIdParam && autoOpenedRef.current !== customerIdParam) {
      const cid = Number(customerIdParam);
      if (!isNaN(cid) && cid > 0) {
        autoOpenedRef.current = customerIdParam;
        setPickedCustomerId(String(cid));
        openOrderForm(cid);
      }
    }
  }, [customerIdParam]);

  const filtered = useMemo(() => {
    const s = search.trim().toLowerCase();
    const rule = CHIPS.find((c) => c.key === chip)!;
    return orders.filter((o) => {
      if (!rule.match(o)) return false;
      if (typeFilter && o.orderType !== typeFilter) return false;
      if (!s) return true;
      return [o.orderCode, o.customer?.name, o.customer?.code, o.customer?.phone]
        .some((v) => String(v || '').toLowerCase().includes(s));
    });
  }, [orders, search, chip, typeFilter]);

  const paged = usePaged(filtered, 20);

  // Số liệu tính trên toàn bộ đơn, không theo bộ lọc: đây là hiện trạng chung
  const totals = useMemo(
    () =>
      orders.reduce(
        (acc, o) => {
          const open = !isCompletedOrCancelled(o);
          return {
            open: acc.open + (open ? 1 : 0),
            awaiting:
              acc.awaiting +
              (!o.stockIssuedAt && ['AWAITING_STOCK', 'READY_TO_DELIVER'].includes(o.status) ? 1 : 0),
            revenue: acc.revenue + (o.status === 'CANCELLED' ? 0 : Number(o.total || 0)),
            remaining: acc.remaining + Number(o.remaining || 0),
          };
        },
        { open: 0, awaiting: 0, revenue: 0, remaining: 0 },
      ),
    [orders],
  );

  return (
    <div className="stack">
      <PageHeader
        title="Bán hàng"
        description={
          filtered.length === orders.length
            ? `${orders.length} đơn bán`
            : `${filtered.length}/${orders.length} đơn khớp bộ lọc`
        }
        actions={
          canManage ? (
            <Button variant="primary" onClick={() => setPickCustomerOpen(true)}>
              <Plus /> Tạo đơn bán
            </Button>
          ) : undefined
        }
      />

      <div className="grid-stats">
        <StatCard
          href="/sales" label="Đơn chưa hoàn tất" value={totals.open} icon={<ShoppingCart size={16} />}
          hint={totals.open > 0 ? 'Còn việc phải chốt với khách' : 'Không có đơn tồn đọng'}
        />
        <StatCard
          href="/spare-parts?tab=warehouses"
          label="Chờ xuất kho" value={totals.awaiting} icon={<Truck size={16} />}
          tone={totals.awaiting > 0 ? 'var(--warning)' : undefined}
          hint={totals.awaiting > 0 ? 'Đã chốt đơn nhưng hàng chưa rời kho' : 'Đã xuất hết'}
        />
        <StatCard
          label="Doanh thu ghi nhận" value={money(totals.revenue)} icon={<Wallet size={16} />}
          hint="Tổng giá trị đơn, trừ đơn đã hủy"
        />
        <StatCard
          href="/reports" label="Còn phải thu" value={money(totals.remaining)} icon={<AlertTriangle size={16} />}
          tone={totals.remaining > 0 ? 'var(--danger)' : undefined}
          hint={totals.remaining > 0 ? 'Cần nhắc khách thanh toán' : 'Khách đã thanh toán hết'}
        />
      </div>

      <div style={{ display: 'flex', gap: 10, flexWrap: 'wrap', alignItems: 'center' }}>
        <SearchInput
          placeholder="Tìm theo mã đơn, tên khách, mã khách, số điện thoại…"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          style={{ flex: 1, minWidth: 260, maxWidth: 420 }}
        />
        <SearchableSelect
          sizeSm
          style={{ width: 'auto', minWidth: 190 }}
          value={chip}
          onChange={(val) => setChip(val || 'ALL')}
          options={CHIPS.map((c) => ({
            value: c.key,
            label: `${c.label} (${orders.filter(c.match).length})`,
          }))}
          placeholder="Tất cả trạng thái"
          searchPlaceholder="Lọc trạng thái…"
        />
        <SearchableSelect
          sizeSm
          style={{ width: 'auto', minWidth: 200 }}
          value={typeFilter}
          onChange={setTypeFilter}
          options={[
            { value: '', label: 'Tất cả loại đơn' },
            ...Object.entries(ORDER_TYPES).map(([k, v]) => ({ value: k, label: v.label })),
          ]}
          placeholder="Tất cả loại đơn"
          searchPlaceholder="Tìm loại đơn…"
        />
      </div>

      {filtered.length === 0 ? (
        <Card style={{ padding: '48px 24px', textAlign: 'center' }}>
          <div
            style={{
              width: 56, height: 56, borderRadius: '50%',
              background: '#ecfdf5', color: '#0f9960',
              display: 'grid', placeItems: 'center', margin: '0 auto 16px',
            }}
          >
            <ShoppingCart size={28} />
          </div>
          <h3 style={{ fontSize: 16, fontWeight: 700, margin: '0 0 6px', color: 'var(--text-strong)' }}>
            {orders.length === 0 ? 'Chưa có đơn bán nào' : 'Không có đơn nào khớp'}
          </h3>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', maxWidth: 460, margin: '0 auto 18px' }}>
            {orders.length === 0
              ? 'Chọn khách rồi lập đơn ngay tại đây — địa điểm giao, máy tại khách và báo giá đã chốt sẽ tự nạp theo khách.'
              : 'Thử bỏ bớt bộ lọc hoặc đổi từ khóa tìm kiếm.'}
          </p>
          {orders.length === 0 && canManage && (
            <Button size="sm" variant="primary" onClick={() => setPickCustomerOpen(true)}>
              <Plus /> Tạo đơn bán đầu tiên
            </Button>
          )}
        </Card>
      ) : (
        <div className="table-wrap">
          <table className="table">
            <thead>
              <tr>
                <th>Mã đơn</th>
                <th>Khách hàng</th>
                <th style={{ width: 150 }}>Loại đơn</th>
                <th style={{ width: 170 }}>Trạng thái</th>
                <th style={{ width: 110 }}>Ngày đặt</th>
                <th className="num" style={{ width: 130 }}>Tổng tiền</th>
                <th className="num" style={{ width: 130 }}>Còn phải thu</th>
                <th style={{ width: 60, textAlign: 'center' }}>In</th>
              </tr>
            </thead>
            <tbody>
              {paged.pageRows.map((o: any) => {
                const st = ORDER_STATUSES[o.status];
                const ty = ORDER_TYPES[o.orderType];
                return (
                  <tr key={o.id} onClick={() => setDetailId(o.id)} style={{ cursor: 'pointer' }}>
                    <td>
                      <span style={{ fontFamily: 'var(--font-mono)', fontWeight: 700, color: 'var(--brand)' }}>
                        {o.orderCode}
                      </span>
                      <div className="hint">{o._count?.items ?? 0} dòng hàng</div>
                    </td>
                    <td>
                      <div style={{ fontWeight: 540, color: 'var(--text-strong)' }}>{o.customer?.name ?? '—'}</div>
                      <div className="hint">
                        {o.customer?.code}
                        {o.location?.name ? ` · ${o.location.name}` : ''}
                      </div>
                    </td>
                    <td>
                      {ty ? (
                        <span
                          className="badge"
                          style={{
                            background: ty.bg,
                            color: ty.color,
                            border: `1px solid ${ty.color}35`,
                            fontWeight: 600,
                          }}
                        >
                          {ty.label}
                        </span>
                      ) : (
                        o.orderType
                      )}
                    </td>
                    <td>
                      {st ? (
                        <span
                          className="badge"
                          style={{
                            background: st.bg,
                            color: st.color,
                            border: `1px solid ${st.color}35`,
                            fontWeight: 600,
                          }}
                        >
                          {st.label}
                        </span>
                      ) : (
                        o.status
                      )}
                      {!o.stockIssuedAt && ['AWAITING_STOCK', 'READY_TO_DELIVER'].includes(o.status) && (
                        <div className="hint" style={{ color: 'var(--warning)' }}>Chưa xuất kho</div>
                      )}
                    </td>
                    <td style={{ fontSize: 12.5 }}>{fmtDate(o.orderDate)}</td>
                    <td className="num" style={{ fontWeight: 700, color: 'var(--text-strong)' }}>
                      {money(o.total)}
                    </td>
                    <td className="num">
                      {o.remaining > 0 ? (
                        <span style={{ fontWeight: 700, color: '#dc2626' }}>{money(o.remaining)}</span>
                      ) : (
                        <span style={{ color: '#15803d' }}>Đã thu đủ</span>
                      )}
                    </td>
                    <td style={{ textAlign: 'center' }} onClick={(e) => { e.stopPropagation(); setDetailId(o.id); }}>
                      <button
                        type="button"
                        style={{
                          padding: '4px 7px',
                          borderRadius: 'var(--radius-sm)',
                          background: '#faf5ff',
                          color: '#7c3aed',
                          border: '1px solid #ddd6fe',
                          cursor: 'pointer',
                        }}
                        title="Xem chi tiết & in hóa đơn / bàn giao"
                      >
                        <Printer size={13} />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>

          <Pagination {...paged} unit="đơn bán" />
        </div>
      )}

      <SalesOrderDetailModal
        open={detailId !== null}
        orderId={detailId}
        companyInfo={companyInfo}
        onClose={() => setDetailId(null)}
      />

      <Modal
        open={pickCustomerOpen}
        onClose={() => {
          setPickCustomerOpen(false);
          if (searchParams.get('customerId')) {
            router.replace('/sales', { scroll: false });
          }
        }}
        title="Lập đơn bán cho khách nào?"
        description="Chọn khách để nạp sẵn địa điểm giao, máy đang đặt tại khách và báo giá đã chốt"
        footer={
          <>
            <Button
              variant="secondary"
              onClick={() => {
                setPickCustomerOpen(false);
                if (searchParams.get('customerId')) {
                  router.replace('/sales', { scroll: false });
                }
              }}
            >
              Hủy
            </Button>
            <Button
              variant="primary"
              loading={loadingCtx}
              disabled={!pickedCustomerId}
              onClick={() => openOrderForm(Number(pickedCustomerId))}
            >
              Tiếp tục
            </Button>
          </>
        }
      >
        <SearchableSelect
          value={pickedCustomerId}
          onChange={setPickedCustomerId}
          options={customers.map((c: any) => ({
            value: String(c.id),
            label: c.name,
            subLabel: [c.code, c.phone].filter(Boolean).join(' · '),
            keywords: `${c.code} ${c.phone}`,
          }))}
          placeholder="-- Chọn khách hàng --"
          searchPlaceholder="Tìm theo tên, mã hoặc số điện thoại…"
        />
      </Modal>

      {orderCtx && (
        <CustomerOrderModal
          open={Boolean(orderCtx)}
          customerId={orderCtx.id}
          customerName={orderCtx.name}
          customer={orderCtx}
          locations={orderCtx.locations || []}
          machines={orderCtx.machines || []}
          stockMachines={stockMachines}
          spareParts={spareParts}
          quotations={orderCtx.quotations || []}
          pricingConfig={pricingConfig}
          companyInfo={companyInfo}
          onClose={() => {
            setOrderCtx(null);
            if (searchParams.get('customerId')) {
              router.replace('/sales', { scroll: false });
            }
          }}
          onSuccess={() => {
            setOrderCtx(null);
            if (searchParams.get('customerId')) {
              router.replace('/sales', { scroll: false });
            }
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
