'use client';

import React, { useEffect, useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button, Field, Input, Select, SearchableSelect } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { PackageCheck, Truck, AlertTriangle, Barcode } from 'lucide-react';
import {
  getOrderFulfillmentAction,
  issueOrderStockAction,
  createSupplierOrderAction,
} from '@/server/modules/customer/actions';

/**
 * Giao hàng cho một đơn hàng khách:
 *  - Xuất kho giao khách (trừ tồn kho) khi hàng đã có sẵn.
 *  - Đặt hàng nhà cung cấp khi trong kho chưa có.
 * Dòng linh kiện tự nhập chưa có mã danh mục sẽ được tạo mã ngay tại đây —
 * do người mua hàng xác nhận, không để người báo giá tạo rác danh mục.
 */

export type FulfillmentMode = 'ISSUE' | 'SUPPLIER';

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n));

export function OrderFulfillmentModal({
  open,
  onClose,
  order,
  customerId,
  warehouses = [],
  mode,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  order: any;
  customerId: number;
  warehouses?: any[];
  mode: FulfillmentMode;
  onSuccess?: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [data, setData] = useState<any>(null);
  const [warehouseId, setWarehouseId] = useState<number | ''>(warehouses[0]?.id || '');
  const [supplier, setSupplier] = useState('Selmi');
  /** Đơn vị tính cho từng dòng chưa có mã danh mục, theo id dòng đơn hàng. */
  const [units, setUnits] = useState<Record<number, string>>({});

  const isIssue = mode === 'ISSUE';

  useEffect(() => {
    let alive = true;
    (async () => {
      const res = await getOrderFulfillmentAction(order.id);
      if (!alive) return;
      if (res.ok) setData(res.data);
      else toast.error(res.message);
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [order.id]);

  const issuable: any[] = data?.issuable || [];
  const unmapped: any[] = data?.unmapped || [];
  const machineLines: any[] = data?.machineFromStock || [];
  const supplierLines = [...issuable, ...machineLines];
  const alreadyIssued = Boolean(data?.order?.stockIssuedAt);
  const issueLines = [...issuable, ...machineLines];
  const demandByInventoryItem = new Map<number, { name: string; quantity: number; stockByWarehouse: any[] }>();
  for (const line of issueLines) {
    const current = demandByInventoryItem.get(Number(line.inventoryItemId)) || {
      name: line.name,
      quantity: 0,
      stockByWarehouse: line.stockByWarehouse || [],
    };
    current.quantity += Number(line.quantity);
    demandByInventoryItem.set(Number(line.inventoryItemId), current);
  }
  const selectedWarehouseShortages = [...demandByInventoryItem.entries()]
    .map(([itemId, line]) => {
      const available = (line.stockByWarehouse || [])
        .filter((stock: any) => Number(stock.warehouseId) === Number(warehouseId))
        .reduce((sum: number, stock: any) => sum + Number(stock.quantity || 0), 0);
      return { itemId, name: line.name, required: line.quantity, available, shortage: Math.max(0, line.quantity - available) };
    })
    .filter((line) => line.shortage > 0);
  const shortageInSelectedWarehouse = isIssue && Boolean(warehouseId) && selectedWarehouseShortages.length > 0;

  /** Serial từng chiếc máy, khóa theo `${dòng}-${thứ tự chiếc}`. */
  const [serials, setSerials] = useState<Record<string, string>>({});
  const [warrantyMonths, setWarrantyMonths] = useState('12');

  const machineUnits = machineLines.flatMap((line) =>
    Array.from({ length: line.quantity }, (_, i) => ({
      orderItemId: line.id,
      serialNumber: (serials[`${line.id}-${i}`] || '').trim(),
      warrantyMonths: Number(warrantyMonths) || 0,
    })),
  );
  const missingSerial = machineUnits.some((u) => !u.serialNumber);

  const handleSubmit = async () => {
    setLoading(true);

    if (isIssue) {
      if (!warehouseId) {
        toast.error('Vui lòng chọn kho xuất hàng');
        setLoading(false);
        return;
      }
      if (missingSerial) {
        toast.error('Vui lòng nhập đủ số serial cho từng chiếc máy trước khi xuất kho');
        setLoading(false);
        return;
      }
      const res = await issueOrderStockAction(order.id, Number(warehouseId), customerId, machineUnits);
      setLoading(false);
      if (res.ok) {
        toast.success(res.message);
        onSuccess?.();
        onClose();
      } else {
        toast.error(res.message);
      }
      return;
    }

    const res = await createSupplierOrderAction(order.id, customerId, {
      supplier,
      targetWarehouseId: warehouseId ? Number(warehouseId) : undefined,
      newItems: unmapped.map((line) => ({
        itemId: line.id,
        unit: units[line.id] || 'Cái',
      })),
    });
    setLoading(false);
    if (res.ok) {
      toast.success(res.message);
      onSuccess?.();
      onClose();
    } else {
      toast.error(res.message);
    }
  };

  const rowStyle: React.CSSProperties = {
    display: 'flex',
    justifyContent: 'space-between',
    alignItems: 'center',
    gap: 8,
    fontSize: 12.5,
    padding: '6px 10px',
    borderRadius: 'var(--radius-sm)',
    background: 'var(--surface-sunken)',
    border: '1px solid var(--border-base)',
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      zIndex={610}
      title={isIssue ? `Xuất kho giao khách: ${order.orderCode}` : `Đặt hàng nhà cung cấp cho đơn: ${order.orderCode}`}
      description={
        isIssue
          ? 'Trừ tồn kho đúng số lượng linh kiện đã bán trong đơn'
          : 'Tạo phiếu đặt hàng nhà cung cấp cho các linh kiện trong đơn. Hàng về kho sẽ tự động nhập kho.'
      }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button
            variant="primary"
            onClick={handleSubmit}
            loading={loading}
            disabled={alreadyIssued || (isIssue && (
              (issuable.length === 0 && machineLines.length === 0) ||
              unmapped.length > 0 ||
              !warehouseId ||
              shortageInSelectedWarehouse
            ))}
          >
            {isIssue ? 'Xác nhận xuất kho' : 'Tạo phiếu đặt hàng'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {alreadyIssued && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'center',
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              background: '#dcfce7',
              color: '#15803d',
              fontSize: 13,
            }}
          >
            <PackageCheck size={16} />
            Đơn này đã xuất kho ngày{' '}
            {new Date(data.order.stockIssuedAt).toLocaleDateString('vi-VN')} — không xuất lại được.
          </div>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: isIssue ? '1fr' : '1fr 1fr', gap: 12 }}>
          <Field label={isIssue ? 'Kho xuất hàng' : 'Kho nhận hàng khi về'}>
            <SearchableSelect
              value={String(warehouseId ?? '')}
              onChange={(val) => setWarehouseId(val ? Number(val) : '')}
              options={[
                ...(isIssue ? [] : [{ value: '', label: '-- Kho mặc định --' }]),
                ...warehouses.map((w: any) => ({ value: String(w.id), label: w.name, subLabel: w.code })),
              ]}
              placeholder={isIssue ? '-- Chọn kho --' : '-- Kho mặc định --'}
              searchPlaceholder="Tìm kho…"
            />
          </Field>

          {!isIssue && (
            <Field label="Nhà cung cấp">
              <Input value={supplier} onChange={(e) => setSupplier(e.target.value)} />
            </Field>
          )}
        </div>

        {/* Dòng đã có mã danh mục */}
        <div>
          <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 6 }}>
            {isIssue ? 'Linh kiện xuất kho' : 'Mặt hàng cần đặt'} ({isIssue ? issuable.length : supplierLines.length} dòng)
          </div>
          {(isIssue ? issuable : supplierLines).length === 0 ? (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', fontStyle: 'italic' }}>
              Không có dòng linh kiện nào đã gắn mã danh mục kho.
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              {(isIssue ? issuable : supplierLines).map((line: any) => (
                <div key={line.id} style={rowStyle}>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{line.name}</div>
                    <div style={{ fontSize: 11, fontFamily: 'monospace', color: 'var(--brand)' }}>
                      {line.inventoryItem?.itemCode}
                    </div>
                  </div>
                  <div style={{ whiteSpace: 'nowrap', color: 'var(--text-muted)' }}>
                    {isIssue ? (() => {
                      const demand = demandByInventoryItem.get(Number(line.inventoryItemId));
                      const selected = demand?.stockByWarehouse
                        .filter((stock: any) => Number(stock.warehouseId) === Number(warehouseId))
                        .reduce((sum: number, stock: any) => sum + Number(stock.quantity || 0), 0) || 0;
                      const required = demand?.quantity || Number(line.quantity || 0);
                      return `SL ${line.quantity}${required !== Number(line.quantity) ? ` (tổng ${required})` : ''} · Kho này ${selected} · Thiếu ${Math.max(0, required - selected)}`;
                    })() : `SL ${line.quantity} · Tồn ${Number(line.availableQty || 0)} · Thiếu ${Number(line.shortageQty || 0)}`}
                    {!isIssue && Number(line.uncoveredShortageQty || 0) === 0 && Number(line.shortageQty || 0) > 0
                      ? ' · Đã có PO'
                      : ''}
                    {' · '}{fmt(Number(line.unitPrice))} ₫
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Máy bán từ kho — mỗi chiếc một serial, xuất xong sinh hồ sơ máy */}
        {isIssue && machineLines.length > 0 && (
          <div>
            <div
              style={{
                display: 'flex', gap: 6, alignItems: 'center',
                fontSize: 12.5, fontWeight: 600, color: 'var(--text-strong)', marginBottom: 6,
              }}
            >
              <Barcode size={14} /> Máy giao cho khách ({machineUnits.length} chiếc)
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 8 }}>
              Nhập số serial in trên tem nhôm của từng chiếc. Xuất kho xong hệ thống lập hồ sơ máy,
              gắn vào khách và bắt đầu tính bảo hành.
            </div>

            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              {machineLines.map((line: any) => (
                <div
                  key={line.id}
                  style={{
                    border: '1px solid var(--border-base)',
                    borderRadius: 'var(--radius-sm)',
                    padding: 10,
                    background: 'var(--surface-sunken)',
                  }}
                >
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, marginBottom: 8 }}>
                    <span style={{ fontWeight: 600, color: 'var(--text-strong)', fontSize: 12.5 }}>
                      {line.name}
                    </span>
                    <span style={{ fontSize: 11.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                      {line.inventoryItem?.itemCode} · SL {line.quantity} · Tồn {Number(line.availableQty || 0)} · Thiếu {Number(line.shortageQty || 0)}
                    </span>
                  </div>

                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 8 }}>
                    {Array.from({ length: line.quantity }, (_, i) => (
                      <Input
                        key={i}
                        sizeSm
                        placeholder={`S/N chiếc thứ ${i + 1}`}
                        value={serials[`${line.id}-${i}`] || ''}
                        onChange={(e) => setSerials({ ...serials, [`${line.id}-${i}`]: e.target.value })}
                      />
                    ))}
                  </div>
                </div>
              ))}
            </div>

            <div style={{ marginTop: 10, maxWidth: 220 }}>
              <Field label="Bảo hành (tháng)" hint="Tính từ ngày giao; để 0 nếu không bảo hành">
                <Input
                  sizeSm type="number" min="0"
                  value={warrantyMonths}
                  onChange={(e) => setWarrantyMonths(e.target.value)}
                />
              </Field>
            </div>
          </div>
        )}

        {/* Dòng chưa có mã danh mục */}
        {unmapped.length > 0 && (
          <div>
            <div
              style={{
                display: 'flex',
                gap: 6,
                alignItems: 'center',
                fontSize: 12.5,
                fontWeight: 600,
                color: '#d97706',
                marginBottom: 6,
              }}
            >
              <AlertTriangle size={14} /> Chưa có mã trong danh mục kho ({unmapped.length} dòng)
            </div>

            {isIssue ? (
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                Những dòng này nhập tay nên không có tồn kho để trừ. Muốn quản lý tồn kho cho chúng, hãy tạo
                phiếu đặt hàng nhà cung cấp — hệ thống sẽ tạo mã danh mục ở bước đó.
              </div>
            ) : (
              <>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginBottom: 6 }}>
                  Hệ thống sẽ tạo mã linh kiện mới cho các dòng dưới đây trước khi đặt hàng. Chọn đúng đơn vị
                  tính để tồn kho về sau không bị sai.
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                  {unmapped.map((line: any) => (
                    <div key={line.id} style={rowStyle}>
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{line.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                          SL {line.quantity} · {fmt(Number(line.unitPrice))} ₫ — mã sẽ được sinh tự động
                        </div>
                      </div>
                      <Select
                        value={units[line.id] || 'Cái'}
                        onChange={(e) => setUnits({ ...units, [line.id]: e.target.value })}
                        sizeSm
                        style={{ width: 110, flexShrink: 0 }}
                      >
                        <option value="Cái">Cái</option>
                        <option value="Bộ">Bộ</option>
                        <option value="Chiếc">Chiếc</option>
                        <option value="Mét">Mét</option>
                        <option value="Kg">Kg</option>
                        <option value="Lít">Lít</option>
                      </Select>
                    </div>
                  ))}
                </div>
              </>
            )}
          </div>
        )}

        {!isIssue && (
          <div
            style={{
              display: 'flex',
              gap: 8,
              alignItems: 'flex-start',
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-sunken)',
              border: '1px solid var(--border-base)',
              fontSize: 12.5,
              color: 'var(--text-muted)',
            }}
          >
            <Truck size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Phiếu tạo ra ở trạng thái <strong>Yêu cầu</strong>. Theo dõi tiến độ tại màn hình Quản lý Phụ
              tùng. Khi chuyển sang <strong>Về kho</strong>, hệ thống tự nhập kho và đơn hàng này chuyển sang
              <strong> Đã có hàng, chờ giao</strong>.
            </span>
          </div>
        )}
        {isIssue && shortageInSelectedWarehouse && (
          <div style={{ display: 'flex', gap: 8, alignItems: 'flex-start', padding: '10px 12px', borderRadius: 'var(--radius-md)', background: '#fff7ed', border: '1px solid #fed7aa', fontSize: 12.5, color: '#9a3412' }}>
            <AlertTriangle size={15} style={{ flexShrink: 0, marginTop: 1 }} />
            <span>
              Kho đã chọn còn thiếu:{' '}
              {selectedWarehouseShortages.map((line) => `${line.name} (cần ${line.required}, tồn ${line.available}, thiếu ${line.shortage})`).join(' · ')}.
              {' '}Chọn kho có đủ hàng hoặc nhập nốt hàng còn thiếu trước khi xuất.
            </span>
          </div>
        )}
      </div>
    </Modal>
  );
}
