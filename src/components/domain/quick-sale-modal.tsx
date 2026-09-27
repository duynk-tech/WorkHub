'use client';
import { useEffect, useState } from 'react';
import { CustomerOrderModal } from './customer-modals';
import { Field, Input, Select } from '@/components/ui';
import { Modal } from '@/components/ui/modal';
import { quickSaleAction, quickSaleCatalogAction } from '@/server/modules/customer/quick-sale-actions';

export function QuickSaleModal({ onClose, onSuccess }: { onClose: () => void; onSuccess: () => void }) {
  const [catalog, setCatalog] = useState<Awaited<ReturnType<typeof quickSaleCatalogAction>>>();
  const [warehouseId, setWarehouse] = useState(0);
  const [method, setMethod] = useState('CASH');
  const [cashPart, setCashPart] = useState(0);
  const [error, setError] = useState('');
  const [requestId] = useState(() => crypto.randomUUID());
  const [pending, setPending] = useState<any>(null);
  useEffect(() => { quickSaleCatalogAction().then(c => { setCatalog(c); setWarehouse(c.warehouses[0]?.id ?? 0); }).catch(e => setError(e.message)); }, []);
  if (!catalog) return <Modal open title="Bán nhanh" onClose={onClose}><p role="status">{error || 'Đang tải danh mục…'}</p></Modal>;
  return <CustomerOrderModal open onClose={onClose} customerId={0} customerName="Khách lẻ / Vãng lai"
    spareParts={catalog.items.map(p => ({ ...p, totalStock: p.stocks.find(s => s.warehouseId === warehouseId)?.quantity ?? 0 }))}
    quickSale={{
      controls: <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 12 }}>
        <Field label="Kho xuất"><Select disabled={!!pending} value={warehouseId} onChange={e => setWarehouse(Number(e.target.value))}>{catalog.warehouses.map(w => <option key={w.id} value={w.id}>{w.name}</option>)}</Select></Field>
        <Field label="Thanh toán"><Select disabled={!!pending} value={method} onChange={e => setMethod(e.target.value)}><option value="CASH">Tiền mặt</option><option value="TRANSFER">Chuyển khoản</option><option value="MIXED">Tiền mặt + chuyển khoản</option></Select></Field>
        {method === 'MIXED' && <Field label="Tiền mặt (₫), còn lại chuyển khoản"><Input disabled={!!pending} type="number" min={0} value={cashPart} onChange={e => setCashPart(Number(e.target.value))} /></Field>}
        {pending && <p role="alert">Đang chờ xác nhận giao dịch trước. Bấm thanh toán để kiểm tra lại cùng giao dịch.</p>}
      </div>,
      submit: async payload => {
        if (payload.items.some(i => !i.inventoryItemId)) return { ok: false, message: 'Bán nhanh chỉ nhận mặt hàng trong kho. Chọn hàng từ danh mục.' };
        const gross = payload.items.reduce((s, i) => s + i.quantity * i.unitPrice, 0);
        const discount = Number(payload.discountAmount ?? 0);
        let allocated = 0;
        const lines = payload.items.map((i, index) => {
          const d = index === payload.items.length - 1 ? discount - allocated : Math.floor(discount * i.quantity * i.unitPrice / Math.max(1, gross));
          allocated += d;
          return { itemId: i.inventoryItemId!, quantity: i.quantity, unitPrice: i.unitPrice, discount: d };
        });
        const total = gross - discount + Math.round((gross - discount) * Number(payload.vatRate ?? 0) / 100);
        const cash = method === 'CASH' ? total : method === 'TRANSFER' ? 0 : cashPart;
        const input = pending ?? { requestId, warehouseId, items: lines, vatRate: Number(payload.vatRate ?? 0), cash, transfer: total - cash,
          note: payload.notes, invoiceNo: payload.invoiceNo, invoiceSerial: payload.invoiceSerial, invoiceDate: payload.invoiceDate };
        setPending(input);
        try {
          const result = await quickSaleAction(input);
          setPending(null);
          return result.ok ? { ...result, message: 'Đã thanh toán và xuất kho.' } : result;
        } catch { return { ok: false, message: 'Chưa nhận kết quả. Bấm thanh toán để kiểm tra lại giao dịch trước.' }; }
      },
    }} onSuccess={onSuccess} />;
}
