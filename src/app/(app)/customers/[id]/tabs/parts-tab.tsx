'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import { Card } from '@/components/ui';
import type { CustomerDetailState } from '../use-customer-detail';

/** Tab "parts" của hồ sơ khách hàng — tách từ customer-detail-screen.tsx, dùng chung state qua useCustomerDetail. */
export function PartsTab({ s }: { s: CustomerDetailState }) {
  const { activeTab, customer, insights, partsView, purchasedParts, setActiveTab, setPartsView } = s;
  return (
    <>
      {activeTab === 'parts' && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div className="card-header"><h3 className="card-title">Phụ tùng</h3><div className="tabs"><button className="tab" data-active={partsView === 'transactions'} onClick={() => setPartsView('transactions')}>Theo giao dịch</button><button className="tab" data-active={partsView === 'items'} onClick={() => setPartsView('items')}>Theo mặt hàng</button></div></div>
          <div style={{ overflowX: 'auto' }}>
            {partsView === 'items' ? <table className="customer-purchase-table" style={{ width: '100%', fontSize: 13 }}><thead><tr><th>Phụ tùng</th><th>SL đã mua</th><th>Đã trả</th><th>Còn lại</th></tr></thead><tbody>{insights.partGroups.map(g => <tr key={g.key}><td>{g.name}</td><td>{g.quantity}</td><td>{g.returnedQty}</td><td>{g.netQty}</td></tr>)}{!insights.partGroups.length && <tr><td colSpan={4}>Chưa có phụ tùng đã mua.</td></tr>}</tbody></table> : (
            <table className="customer-purchase-table" style={{ width: '100%', minWidth: 700, borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead><tr>{['Phụ tùng / Vật tư', 'Đơn hàng', 'Ngày mua', 'SL trên đơn', 'Tiền hàng (chưa VAT)', 'Đã trả / Còn lại'].map(label => <th key={label}>{label}</th>)}</tr></thead>
              <tbody>{purchasedParts.length === 0 ? <tr><td colSpan={6} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>Khách hàng này chưa có phụ tùng đã giao</td></tr> : purchasedParts.map(({ item, order: o, returnedQty, netQty }: any) => <tr key={`${o.id}-${item.id}`}>
                <td><div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{item.name}</div></td>
                <td><button type="button" onClick={() => { setActiveTab('orders', o.id); }} style={{ color: 'var(--brand)', fontFamily: 'monospace', fontWeight: 700, whiteSpace: 'nowrap', background: 'none', border: 0, padding: 0, cursor: 'pointer' }}>{o.orderCode}</button></td>
                <td style={{ whiteSpace: 'nowrap' }}>{new Date(o.orderDate).toLocaleDateString('vi-VN')}</td>
                <td style={{ textAlign: 'right' }}>{item.quantity}</td>
                <td style={{ textAlign: 'right', whiteSpace: 'nowrap' }}>{new Intl.NumberFormat('vi-VN').format(Number(item.totalPrice ?? Number(item.quantity) * Number(item.unitPrice)))} ₫</td>
                <td>{returnedQty} / {netQty}</td>
              </tr>)}</tbody>
            </table>)}
          </div>
          {purchasedParts.length > 0 && <p style={{ padding: '10px 14px', margin: 0, fontSize: 12, color: 'var(--text-muted)', borderTop: '1px solid var(--border-base)' }}>Tiền hàng theo đơn gốc; số lượng trả lấy từ dòng phiếu trả liên kết. Đơn cũ chưa có liên kết cần đối soát.</p>}
        </Card>
      )}
    </>
  );
}
