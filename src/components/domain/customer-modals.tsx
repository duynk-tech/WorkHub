'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Modal } from '@/components/ui/modal';
import { Field, Input, Select, Textarea, Button, PriceInput } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import {
  LineItemsEditor,
  useLineItems,
  lineTotal,
} from '@/components/domain/line-items-editor';
import { Plus, Trash2, MapPin, AlertTriangle, ShoppingCart, X, Printer } from 'lucide-react';
import { CustomerOrderPrintModal } from '@/components/domain/customer-order-print-modal';
import {
  ORDER_TYPES,
  ORDER_STATUSES,
  CUSTOMER_STATUSES,
  QUOTATION_STATUSES,
  type SaveCustomerInput,
  type SaveCustomerOrderInput,
  type CustomerOrderItemInput,
} from '@/server/modules/customer/types';
import {
  saveCustomerAction,
  saveCustomerOrderAction,
} from '@/server/modules/customer/actions';
import { saveCustomerLocationAction } from '@/server/modules/equipment/actions';

// ── Customer Modal ──────────────────────────────────────────────
export function CustomerModal({
  open,
  onClose,
  customer,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  customer?: any;
  onSuccess?: (c: any) => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const [name, setName] = useState(customer?.name || '');
  const [code, setCode] = useState(customer?.code || '');
  const [contactName, setContactName] = useState(customer?.contactName || '');
  const [phone, setPhone] = useState(customer?.phone || '');
  const [email, setEmail] = useState(customer?.email || '');
  const [address, setAddress] = useState(customer?.address || '');
  const [status, setStatus] = useState(customer?.status || 'ACTIVE');
  const [notes, setNotes] = useState(customer?.notes || '');

  const handleSave = async () => {
    if (!name.trim() || !phone.trim()) {
      toast.error('Vui lòng nhập tên khách hàng và số điện thoại liên hệ');
      return;
    }

    setLoading(true);
    const payload: SaveCustomerInput = {
      name: name.trim(),
      code: code.trim() || undefined,
      contactName: contactName.trim() || undefined,
      phone: phone.trim(),
      email: email.trim() || undefined,
      address: address.trim() || undefined,
      status,
      notes: notes.trim() || undefined,
    };

    const res = await saveCustomerAction(customer ? customer.id : null, payload);
    setLoading(false);

    if (res.ok) {
      toast.success(res.message);
      if (onSuccess) onSuccess(res.customer);
      onClose();
    } else {
      toast.error(res.message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={customer ? `Chỉnh sửa: ${customer.name}` : 'Thêm Khách hàng Mới'}
      description="Quản lý thông tin doanh nghiệp, chuỗi cửa hàng và đầu mối liên hệ"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button variant="primary" onClick={handleSave} loading={loading}>
            {customer ? 'Lưu thay đổi' : 'Tạo khách hàng'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Tên công ty / Chuỗi cửa hàng" required>
          <Input
            placeholder="VD: Công ty CP Trà & Cà phê Phúc Long, Tous les Jours..."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Mã khách hàng (Để trống tự sinh)">
            <Input
              placeholder="VD: KH-0001"
              value={code}
              onChange={(e) => setCode(e.target.value)}
            />
          </Field>

          <Field label="Trạng thái khách hàng">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(CUSTOMER_STATUSES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Số điện thoại liên hệ" required>
            <Input
              placeholder="VD: 0908123456"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>

          <Field label="Người đại diện / Phụ trách">
            <Input
              placeholder="VD: Nguyễn Văn A - Quản lý cửa hàng"
              value={contactName}
              onChange={(e) => setContactName(e.target.value)}
            />
          </Field>
        </div>

        <Field label="Email liên hệ">
          <Input
            placeholder="VD: contact@phuclong.com.vn"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
          />
        </Field>

        <Field label="Địa chỉ trụ sở chính / Văn phòng">
          <Input
            placeholder="Số nhà, đường, phường/xã, quận/huyện, tỉnh/thành..."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </Field>

        <Field label="Ghi chú">
          <Textarea
            placeholder="Điều khoản thanh toán, yêu cầu kỹ thuật, hạn mức công nợ..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            rows={3}
          />
        </Field>
      </div>
    </Modal>
  );
}

// ── Customer Order Modal ────────────────────────────────────────
export function CustomerOrderModal({
  open,
  onClose,
  customerId,
  customerName,
  customer,
  locations = [],
  machines = [],
  stockMachines = [],
  spareParts = [],
  quotations = [],
  pricingConfig,
  companyInfo,
  order,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  customerId: number;
  customerName: string;
  customer?: any;
  locations?: any[];
  /** Máy đang đặt tại khách. Chỉ máy cho thuê / ký gửi mới lên đơn được (bán đứt, gia hạn);
   *  máy đã bán đứt thì loại khỏi danh sách. */
  machines?: any[];
  /** Máy đang tồn kho, chưa giao cho ai → dùng khi bán / giao máy mới. */
  stockMachines?: any[];
  spareParts?: any[];
  /** Báo giá của khách, để lập đơn từ báo giá đã chốt. */
  quotations?: any[];
  pricingConfig?: any;
  companyInfo?: any;
  order?: any;
  onSuccess?: (o: any) => void;
}) {
  const toast = useToast();
  const [mounted, setMounted] = useState(false);
  const [previewOpen, setPreviewOpen] = useState(false);
  useEffect(() => setMounted(true), []);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    document.addEventListener('keydown', onKey);
    const prev = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      document.removeEventListener('keydown', onKey);
      document.body.style.overflow = prev;
    };
  }, [open, onClose]);

  const [loading, setLoading] = useState(false);
  const [currentLocations, setCurrentLocations] = useState<any[]>(locations);
  const [quickLocationOpen, setQuickLocationOpen] = useState(false);

  const [orderType, setOrderType] = useState(order?.orderType || 'MACHINE_PURCHASE');
  const [status, setStatus] = useState(order?.status || 'COMPLETED');
  const [locationId, setLocationId] = useState<number | ''>(order?.locationId || '');
  const [orderDate, setOrderDate] = useState(
    order?.orderDate ? new Date(order.orderDate).toISOString().slice(0, 10) : new Date().toISOString().slice(0, 10),
  );
  const [deliveryDate, setDeliveryDate] = useState(
    order?.deliveryDate ? new Date(order.deliveryDate).toISOString().slice(0, 10) : '',
  );
  const [notes, setNotes] = useState(order?.notes || '');
  const [dueDate, setDueDate] = useState(
    order?.dueDate ? new Date(order.dueDate).toISOString().slice(0, 10) : '',
  );
  const [invoiceNo, setInvoiceNo] = useState(order?.invoiceNo || '');
  const [invoiceSerial, setInvoiceSerial] = useState(order?.invoiceSerial || '');
  const [invoiceDate, setInvoiceDate] = useState(
    order?.invoiceDate ? new Date(order.invoiceDate).toISOString().slice(0, 10) : '',
  );
  const defaultVat = pricingConfig?.defaultVatRate ?? 8;
  const [vatRate, setVatRate] = useState(
    order?.vatRate !== undefined && order?.vatRate !== null ? String(order.vatRate) : String(defaultVat),
  );

  const {
    items,
    catalogRefs,
    catalogOptions,
    addItem,
    removeItem,
    changeItem,
    selectCatalog,
    replaceItems,
    validItems,
  } = useLineItems({
    initialItems: order?.items?.map((i: any) => ({
      itemType: i.itemType,
      name: i.name,
      quantity: i.quantity,
      unitPrice: Number(i.unitPrice),
      equipmentId: i.equipmentId || undefined,
      inventoryItemId: i.inventoryItemId || undefined,
      notes: i.notes || '',
    })),
    machines,
    stockMachines,
    spareParts,
    pricingConfig,
    strictSellingPrice: true,
    onWarning: (msg) => toast.warning(msg),
  });

  const handleRemoveItem = (index: number) => {
    if (!removeItem(index)) toast.error('Đơn hàng phải có ít nhất 1 sản phẩm');
  };

  const [quotationId, setQuotationId] = useState<number | ''>(order?.quotationId || '');

  /** Báo giá còn dùng được: chưa bị từ chối, chưa chốt thành đơn khác. */
  const usableQuotations = quotations.filter(
    (q: any) =>
      !['REJECTED', 'EXPIRED'].includes(q.status) &&
      (!q.orders?.length || q.id === order?.quotationId),
  );

  /** Nạp toàn bộ dòng hàng + điều kiện giao từ báo giá sang đơn hàng. */
  const handleImportQuotation = (id: number | '') => {
    setQuotationId(id);
    if (!id) return;

    const q = usableQuotations.find((x: any) => x.id === Number(id));
    if (!q) return;

    replaceItems(
      (q.items || []).map((i: any) => ({
        itemType: i.itemType,
        name: i.name,
        quantity: i.quantity,
        // Đơn giá chuyển sang đơn hàng là giá sau chiết khấu của báo giá
        unitPrice: i.quantity > 0 ? Math.round(Number(i.totalPrice) / i.quantity) : Number(i.unitPrice),
        equipmentId: i.equipmentId || undefined,
        inventoryItemId: i.inventoryItemId || undefined,
        notes: i.notes || '',
      })),
    );

    if (q.locationId) setLocationId(q.locationId);
    setVatRate(String(q.vatRate !== undefined && q.vatRate !== null ? q.vatRate : defaultVat));
    setStatus('CONFIRMED');
    setNotes(`Chốt từ báo giá ${q.quoteCode}`);
    toast.success(`Đã nạp ${q.items?.length || 0} dòng hàng từ báo giá ${q.quoteCode}`);
  };

  /** Giá vốn một đơn vị — chỉ dùng nội bộ để soi lãi, không in cho khách. */
  const costOf = (it: any) => {
    if (it.inventoryItemId) {
      const p = spareParts.find((x: any) => x.id === it.inventoryItemId);
      return Number(p?.avgCost || p?.costPrice || 0);
    }
    if (it.equipmentId) {
      const m =
        stockMachines.find((x: any) => x.id === it.equipmentId) ||
        machines.find((x: any) => x.id === it.equipmentId);
      return Number(m?.unitCost || 0);
    }
    return 0;
  };

  const totalQuantity = items.reduce((sum, it) => sum + (Number(it.quantity) || 0), 0);
  const goodsAmount = items.reduce((sum, it) => sum + lineTotal(it), 0);
  const vatAmount = Math.round((goodsAmount * (Number(vatRate) || 0)) / 100);
  const totalAmount = goodsAmount + vatAmount;

  const handleSave = async () => {
    const rows = validItems();
    if (rows.length === 0) {
      toast.error('Vui lòng nhập tên ít nhất một sản phẩm hoặc máy trong đơn hàng');
      return;
    }

    const missingPriceItem = rows.find((it) => !it.unitPrice || Number(it.unitPrice) <= 0);
    if (missingPriceItem) {
      toast.error(`Sản phẩm "${missingPriceItem.name}" chưa có đơn giá bán (> 0 ₫). Vui lòng nhập giá bán.`);
      return;
    }

    setLoading(true);
    const payload: SaveCustomerOrderInput = {
      customerId,
      locationId: locationId ? Number(locationId) : undefined,
      orderType,
      status,
      quotationId: quotationId ? Number(quotationId) : undefined,
      shippingFee: 0,
      vatRate: Number(vatRate) || 0,
      dueDate: dueDate || undefined,
      invoiceNo: invoiceNo.trim() || undefined,
      invoiceSerial: invoiceSerial.trim() || undefined,
      invoiceDate: invoiceDate || undefined,
      orderDate,
      deliveryDate: deliveryDate || undefined,
      notes: notes.trim() || undefined,
      items: rows.map(({ discountVnd: _discount, priceSource: _src, ...rest }) => rest),
    };

    const res = await saveCustomerOrderAction(order ? order.id : null, payload);
    setLoading(false);

    if (res.ok) {
      toast.success(res.message);
      if (onSuccess) onSuccess(res.order);
      onClose();
    } else {
      toast.error(res.message);
    }
  };

  if (!mounted || !open) return null;

  return createPortal(
    <div
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 500,
        background: 'rgba(0, 0, 0, 0.55)',
        backdropFilter: 'blur(3px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: 20,
      }}
    >
      <div
        style={{
          display: 'flex',
          background: 'var(--surface-card)',
          borderRadius: 12,
          width: '100%',
          maxWidth: 'min(1000px, 95vw)',
          maxHeight: '94vh',
          flexDirection: 'column',
          boxShadow: '0 20px 40px -10px rgba(0, 0, 0, 0.2)',
          border: '1px solid var(--border-base, #e2e8f0)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div
          style={{
            padding: '10px 16px',
            borderBottom: '1px solid var(--border-base, #e2e8f0)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            background: 'var(--surface-sunken, #f8fafc)',
            flexShrink: 0,
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div
              style={{
                width: 32,
                height: 32,
                borderRadius: 8,
                background: '#f5f3ff',
                color: '#7c3aed',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
            >
              <ShoppingCart size={18} />
            </div>
            <div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <h2 style={{ fontSize: 15, fontWeight: 800, margin: 0, color: 'var(--text-strong)' }}>
                  {order ? `Chỉnh sửa đơn: ${order.orderCode}` : 'Tạo Đơn Hàng Bán Khách'}
                </h2>
                <span
                  style={{
                    fontSize: 11,
                    background: '#ede9fe',
                    color: '#6d28d9',
                    padding: '2px 8px',
                    borderRadius: 999,
                    fontWeight: 700,
                    border: '1px solid #c4b5fd',
                  }}
                >
                  {customerName}
                </span>
              </div>
              <p style={{ margin: '1px 0 0', fontSize: 11.5, color: 'var(--text-muted)' }}>
                Ghi nhận giao dịch bán linh kiện, phụ tùng máy móc hoặc dịch vụ cho khách hàng
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            style={{
              border: 'none',
              background: 'none',
              cursor: 'pointer',
              color: 'var(--text-muted)',
              padding: 4,
              borderRadius: 6,
            }}
          >
            <X size={18} />
          </button>
        </div>

        {/* Scrollable Form Body */}
        <form
          onSubmit={(e) => {
            e.preventDefault();
            handleSave();
          }}
          style={{
            overflowY: 'auto',
            padding: '12px 16px',
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          {/* Thông tin đơn hàng (Top header grid) */}
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(5, minmax(0, 1fr))',
              gap: 8,
              alignItems: 'start',
              padding: '8px 12px',
              background: 'var(--surface-sunken, #f8fafc)',
              borderRadius: 8,
              border: '1px solid var(--border-base, #e2e8f0)',
            }}
            className="po-header-grid"
          >
            <Field label="Hình thức giao dịch">
              <Select value={orderType} onChange={(e) => setOrderType(e.target.value)}>
                {Object.entries(ORDER_TYPES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Trạng thái đơn">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                {Object.entries(ORDER_STATUSES).map(([k, v]) => (
                  <option key={k} value={k}>
                    {v.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Ngày đặt hàng">
              <Input type="date" value={orderDate} onChange={(e) => setOrderDate(e.target.value)} />
            </Field>

            <Field label="Ngày bàn giao dự kiến">
              <Input type="date" value={deliveryDate} onChange={(e) => setDeliveryDate(e.target.value)} />
            </Field>

            <Field label="Hạn thanh toán">
              <Input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
            </Field>

            <div style={{ gridColumn: usableQuotations.length > 0 ? 'span 3' : 'span 5' }}>
              <Field label="Điểm đặt / Chi nhánh nhận máy">
                <div style={{ display: 'flex', gap: 6 }}>
                  <Select
                    value={locationId}
                    onChange={(e) => setLocationId(e.target.value ? Number(e.target.value) : '')}
                    style={{ flex: 1, minWidth: 0 }}
                  >
                    <option value="">-- Trụ sở chính / Chưa gán chi nhánh --</option>
                    {currentLocations.map((loc) => (
                      <option key={loc.id} value={loc.id}>
                        {loc.name} {loc.address ? `(${loc.address})` : ''}
                      </option>
                    ))}
                  </Select>
                  <Button
                    type="button"
                    variant="secondary"
                    size="sm"
                    onClick={() => setQuickLocationOpen(true)}
                    title="Thêm chi nhánh mới cho khách hàng này"
                    style={{ padding: '0 10px', height: 38, flexShrink: 0, display: 'inline-flex', alignItems: 'center', gap: 4 }}
                  >
                    <Plus size={13} /> Thêm
                  </Button>
                </div>
              </Field>
            </div>

            {!order && usableQuotations.length > 0 && (
              <div style={{ gridColumn: 'span 2' }}>
                <Field label="Lập đơn từ báo giá đã chốt (tùy chọn)">
                  <Select
                    value={quotationId}
                    onChange={(e) => handleImportQuotation(e.target.value ? Number(e.target.value) : '')}
                  >
                    <option value="">-- Nhập đơn mới, không từ báo giá --</option>
                    {usableQuotations.map((q: any) => (
                      <option key={q.id} value={q.id}>
                        {q.quoteCode} · {new Intl.NumberFormat('vi-VN').format(Number(q.totalAmount || 0))} ₫ ·{' '}
                        {q.items?.length || 0} dòng ·{' '}
                        {QUOTATION_STATUSES[q.status]?.label || q.status}
                      </option>
                    ))}
                  </Select>
                </Field>
              </div>
            )}
          </div>

          {items.some((it) => it.name.trim() && (!it.unitPrice || Number(it.unitPrice) <= 0)) && (
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: 8,
                padding: '8px 12px',
                borderRadius: 'var(--radius-md)',
                background: '#fef2f2',
                border: '1px solid #fecaca',
                color: '#b91c1c',
                fontSize: 12.5,
                fontWeight: 500,
              }}
            >
              <AlertTriangle size={15} style={{ flexShrink: 0, color: '#dc2626' }} />
              <span>
                Có sản phẩm chưa có giá bán tính sẵn. Vui lòng kiểm tra và nhập đơn giá bán trước khi tạo đơn hàng.
              </span>
            </div>
          )}

          {/* Bảng danh sách mặt hàng */}
          <LineItemsEditor
            title="Danh sách mặt hàng"
            items={items}
            catalogRefs={catalogRefs}
            catalogOptions={catalogOptions}
            onAdd={addItem}
            onRemove={handleRemoveItem}
            onChange={changeItem}
            onSelectCatalog={selectCatalog}
            warnMissingPrice={true}
            footerRows={
              <>
                {/* 1. Tổng tiền hàng */}
                <tr style={{ background: '#f8fafc', borderTop: '2px solid var(--border-base, #cbd5e1)', fontWeight: 700 }}>
                  <td colSpan={2} style={{ padding: '8px 10px', textAlign: 'left', fontWeight: 700, color: 'var(--text-strong)' }}>
                    Tổng cộng ({items.length} mặt hàng):
                  </td>
                  <td style={{ padding: '8px 2px', textAlign: 'center', fontWeight: 700, color: 'var(--text-strong)' }}>
                    {totalQuantity} cái
                  </td>
                  <td></td>
                  <td style={{ padding: '8px 6px', textAlign: 'right', fontWeight: 700, color: 'var(--text-strong)' }}>
                    {goodsAmount.toLocaleString('vi-VN')} ₫
                  </td>
                  <td></td>
                </tr>

                {/* 2. Thuế VAT */}
                <tr style={{ background: '#ffffff', borderTop: '1px solid var(--border-base, #e2e8f0)' }}>
                  <td
                    colSpan={4}
                    style={{
                      padding: '6px 10px',
                      textAlign: 'right',
                      fontWeight: 600,
                      color: 'var(--text-strong)',
                    }}
                  >
                    <div style={{ display: 'inline-flex', alignItems: 'center', gap: 8, justifyContent: 'flex-end' }}>
                      <span>Thuế VAT:</span>
                      <div style={{ display: 'inline-flex', gap: 4 }}>
                        {[0, 8, 10].map((rate) => {
                          const isSelected = Number(vatRate) === rate;
                          return (
                            <button
                              key={rate}
                              type="button"
                              onClick={() => setVatRate(String(rate))}
                              style={{
                                padding: '2px 8px',
                                fontSize: 11,
                                borderRadius: 4,
                                border: isSelected ? '1px solid #7c3aed' : '1px solid var(--border-base, #cbd5e1)',
                                background: isSelected ? '#f5f3ff' : '#fff',
                                color: isSelected ? '#7c3aed' : 'var(--text-base, #475569)',
                                fontWeight: isSelected ? 700 : 500,
                                cursor: 'pointer',
                                transition: 'all 0.15s ease',
                              }}
                            >
                              {rate === 0 ? '0% (Không VAT)' : `${rate}%`}
                            </button>
                          );
                        })}
                      </div>
                      <div style={{ display: 'inline-flex', alignItems: 'center', gap: 2 }}>
                        <input
                          type="number"
                          min="0"
                          max="100"
                          step="0.5"
                          value={vatRate}
                          onChange={(e) => setVatRate(e.target.value)}
                          style={{
                            width: 44,
                            padding: '2px 4px',
                            fontSize: 11,
                            textAlign: 'center',
                            border: '1px solid var(--border-base, #cbd5e1)',
                            borderRadius: 4,
                            background: 'var(--surface-card, #fff)',
                            color: 'var(--text-strong, #0f172a)',
                          }}
                        />
                        <span style={{ fontSize: 11, color: 'var(--text-muted)' }}>%</span>
                      </div>
                    </div>
                  </td>
                  <td
                    style={{
                      padding: '6px 10px',
                      textAlign: 'right',
                      fontWeight: 700,
                      color: vatAmount > 0 ? 'var(--text-strong)' : 'var(--text-muted)',
                    }}
                  >
                    {vatAmount > 0
                      ? `+${vatAmount.toLocaleString('vi-VN')} ₫`
                      : '0 ₫'}
                  </td>
                  <td></td>
                </tr>

                {/* 3. Tổng cộng thanh toán */}
                <tr style={{ background: '#f1f5f9', borderTop: '1px solid #94a3b8', fontWeight: 800 }}>
                  <td
                    colSpan={4}
                    style={{
                      padding: '10px',
                      textAlign: 'right',
                      textTransform: 'uppercase',
                      color: 'var(--text-strong)',
                      fontSize: 13,
                    }}
                  >
                    TỔNG CỘNG THANH TOÁN (VND){Number(vatRate) > 0 ? ' (ĐÃ GỒM VAT)' : ''}:
                  </td>
                  <td style={{ padding: '10px 6px', textAlign: 'right', color: '#7c3aed', fontSize: 14 }}>
                    {totalAmount.toLocaleString('vi-VN')} ₫
                  </td>
                  <td></td>
                </tr>
              </>
            }
          />

          {/* Thông tin hóa đơn & Ghi chú đơn hàng */}
          <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1.8fr', gap: 12, alignItems: 'start' }}>
            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-strong)' }}>
                Thông tin hóa đơn VAT (nếu có)
              </label>
              <div style={{ display: 'grid', gridTemplateColumns: '1.2fr 1fr 1.2fr', gap: 6 }}>
                <Input
                  placeholder="Số HĐ (VD: 00001234)"
                  value={invoiceNo}
                  onChange={(e) => setInvoiceNo(e.target.value)}
                  sizeSm
                />
                <Input
                  placeholder="Ký hiệu (1C26TAA)"
                  value={invoiceSerial}
                  onChange={(e) => setInvoiceSerial(e.target.value)}
                  sizeSm
                />
                <Input
                  type="date"
                  value={invoiceDate}
                  onChange={(e) => setInvoiceDate(e.target.value)}
                  sizeSm
                  title="Ngày xuất hóa đơn"
                />
              </div>
            </div>

            <div>
              <label style={{ fontSize: 12, fontWeight: 600, display: 'block', marginBottom: 4, color: 'var(--text-strong)' }}>
                Ghi chú đơn hàng
              </label>
              <Input
                placeholder="VD: Bàn giao kèm hướng dẫn sử dụng và phiếu bảo hành..."
                value={notes}
                onChange={(e) => setNotes(e.target.value)}
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div
            style={{
              display: 'flex',
              justifyContent: 'flex-end',
              alignItems: 'center',
              gap: 10,
              marginTop: 6,
              paddingTop: 10,
              borderTop: '1px solid var(--border-base, #e2e8f0)',
            }}
          >
            <Button type="button" variant="secondary" onClick={onClose} disabled={loading}>
              Hủy
            </Button>
            <Button
              type="button"
              variant="secondary"
              onClick={() => {
                const activeItems = validItems();
                if (activeItems.length === 0) {
                  toast.error('Vui lòng thêm ít nhất một mặt hàng để xem trước hóa đơn');
                  return;
                }
                setPreviewOpen(true);
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                border: '1px solid #ddd6fe',
                color: '#6d28d9',
                background: '#faf5ff',
                height: 36,
                padding: '0 14px',
                fontWeight: 600,
              }}
              title="Xem trước hóa đơn / đơn hàng in (A4 / PDF)"
            >
              <Printer size={15} /> Xem trước
            </Button>
            <Button
              type="submit"
              loading={loading}
              style={{
                background: '#7c3aed',
                color: '#fff',
                fontWeight: 600,
                padding: '0 18px',
                height: 36,
                border: 'none',
              }}
            >
              {order ? 'Lưu đơn hàng' : 'Xác nhận'}
            </Button>
          </div>
        </form>
      </div>

      {quickLocationOpen && (
        <CustomerLocationModal
          open={quickLocationOpen}
          customerId={customerId}
          customerName={customerName}
          zIndex={550}
          onClose={() => setQuickLocationOpen(false)}
          onSuccess={(newLoc) => {
            setCurrentLocations((prev) => [...prev, newLoc]);
            setLocationId(newLoc.id);
            setQuickLocationOpen(false);
          }}
        />
      )}

      {previewOpen && (
        <CustomerOrderPrintModal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          order={{
            orderCode: order?.orderCode || `ORD-${new Date().getFullYear()}-DỰ THẢO`,
            orderType,
            status,
            orderDate,
            deliveryDate,
            dueDate,
            invoiceNo,
            invoiceSerial,
            invoiceDate,
            notes,
            vatRate: Number(vatRate) || 0,
            vatAmount,
            goodsAmount,
            totalAmount,
            customer: {
              id: customerId,
              name: customerName,
              contactName: customer?.contactName || order?.customer?.contactName,
              phone: customer?.phone || order?.customer?.phone,
              address: customer?.address || order?.customer?.address,
            },
            location: currentLocations.find((l) => l.id === Number(locationId)),
            items: (validItems().length > 0 ? validItems() : items).map((it: any, idx: number) => ({
              id: it.id || idx + 1,
              name: it.name,
              itemType: it.itemType,
              quantity: Number(it.quantity) || 1,
              unitPrice: Number(it.unitPrice) || 0,
              totalPrice: (Number(it.quantity) || 1) * (Number(it.unitPrice) || 0),
              notes: it.notes,
            })),
          }}
          customer={{
            id: customerId,
            name: customerName,
            contactName: customer?.contactName || order?.customer?.contactName,
            phone: customer?.phone || order?.customer?.phone,
            address: customer?.address || order?.customer?.address,
          }}
          location={currentLocations.find((l) => l.id === Number(locationId))}
          companyInfo={companyInfo}
        />
      )}
    </div>,
    document.body
  );
}

// ── Customer Location Modal ──────────────────────────────────────
export function CustomerLocationModal({
  open,
  customerId,
  customerName,
  onClose,
  onSuccess,
  zIndex,
}: {
  open: boolean;
  customerId: number;
  customerName: string;
  onClose: () => void;
  onSuccess?: (loc: any) => void;
  zIndex?: number;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [managerName, setManagerName] = useState('');
  const [phone, setPhone] = useState('');

  const handleSave = async () => {
    if (!name.trim() || !address.trim()) {
      toast.error('Vui lòng nhập tên điểm đặt / chi nhánh và địa chỉ');
      return;
    }

    setLoading(true);
    const res = await saveCustomerLocationAction({
      customerId,
      name: name.trim(),
      address: address.trim(),
      managerName: managerName.trim() || undefined,
      phone: phone.trim() || undefined,
    });
    setLoading(false);

    if (res.ok && res.location) {
      toast.success(res.message);
      onSuccess?.(res.location);
      onClose();
    } else {
      toast.error(res.message || 'Lỗi khi lưu điểm đặt');
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      zIndex={zIndex}
      title={`Thêm Điểm lắp đặt / Chi nhánh: ${customerName}`}
      description="Khai báo chi nhánh hoặc điểm lắp đặt thiết bị của khách hàng"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button variant="primary" onClick={handleSave} loading={loading}>
            Lưu điểm đặt
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Tên điểm đặt / Chi nhánh" required>
          <Input
            placeholder="VD: Chi nhánh Landmark 81"
            value={name}
            onChange={(e) => setName(e.target.value)}
            autoFocus
          />
        </Field>

        <Field label="Địa chỉ cụ thể" required>
          <Input
            placeholder="Số nhà, tên đường, phường/xã, quận/huyện, tỉnh/TP..."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Quản lý / Người phụ trách">
            <Input
              placeholder="Họ tên quản lý"
              value={managerName}
              onChange={(e) => setManagerName(e.target.value)}
            />
          </Field>

          <Field label="Số điện thoại liên hệ">
            <Input
              placeholder="09xx xxx xxx"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
            />
          </Field>
        </div>
      </div>
    </Modal>
  );
}
