'use client';

import { X, ChefHat, Check, Ban, Footprints } from 'lucide-react';
import type { CafeMenuItem, DrinkOrderView } from '@/lib/space-3d-cafe-menu';

const ago = (iso: string) => {
  const s = Math.max(0, Math.round((Date.now() - new Date(iso).getTime()) / 1000));
  return s < 60 ? `${s}s` : `${Math.floor(s / 60)} phút`;
};

/** Bảng đơn gọi món cho nhân viên: Nhận làm → Phục vụ (nhân vật tự đi tới bàn khách). */
export function SpaceCafeOrders({
  menu,
  orders,
  busyId,
  onClose,
  onUpdate,
  onGoTo,
  onClear,
  glassStyle,
}: {
  menu: CafeMenuItem[];
  orders: DrinkOrderView[];
  busyId: number | null;
  onClose: () => void;
  onUpdate: (o: DrinkOrderView, status: 'PREPARING' | 'SERVED' | 'CANCELLED') => void;
  onGoTo: (o: DrinkOrderView) => void;
  /** Dọn ly đã phục vụ: 1 đơn (orderId) hoặc tất cả (null) */
  onClear: (orderId: number | null) => void;
  glassStyle: React.CSSProperties;
}) {
  const byCode = new Map(menu.map((m) => [m.code, m]));
  const open = orders.filter((o) => o.status === 'NEW' || o.status === 'PREPARING');
  const servedAll = orders.filter((o) => o.status === 'SERVED');
  const served = servedAll.slice(-6).reverse();
  return (
    <div
      style={{
        ...glassStyle,
        position: 'fixed',
        right: 14,
        top: 64,
        zIndex: 36,
        width: 'min(330px, calc(100vw - 28px))',
        maxHeight: '72vh',
        overflowY: 'auto',
        borderRadius: 16,
        padding: 14,
        display: 'flex',
        flexDirection: 'column',
        gap: 10,
      }}
    >
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>
          <div style={{ fontSize: 10.5, color: '#fbbf24', fontWeight: 700 }}>QUẦY PHA CHẾ</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Đơn gọi món ({open.length})</div>
        </div>
        <button type="button" aria-label="Đóng" onClick={onClose} style={{ background: 'none', border: 0, color: '#94a3b8', cursor: 'pointer' }}>
          <X size={16} />
        </button>
      </div>
      {open.length === 0 && <div style={{ fontSize: 12.5, color: '#94a3b8' }}>Chưa có đơn mới. Khách gọi món sẽ hiện ở đây kèm tiếng báo.</div>}
      {open.map((o) => (
        <div key={o.id} style={{ padding: 10, borderRadius: 12, background: o.status === 'NEW' ? 'rgba(245,158,11,0.16)' : 'rgba(37,99,235,0.16)', border: `1px solid ${o.status === 'NEW' ? 'rgba(245,158,11,0.4)' : 'rgba(96,165,250,0.4)'}` }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 12.5 }}>
            <strong style={{ color: '#fff' }}>{o.customerName}</strong>
            <span style={{ color: '#94a3b8', fontSize: 11 }}>{ago(o.createdAt)} trước</span>
          </div>
          <ul style={{ margin: '6px 0', paddingLeft: 16, color: '#e2e8f0', fontSize: 12.5 }}>
            {o.lines.map((l) => (
              <li key={l.code}>
                {l.qty} × {byCode.get(l.code)?.name ?? l.code}
              </li>
            ))}
          </ul>
          {o.note && <div style={{ fontSize: 11.5, color: '#fde68a', marginBottom: 6 }}>Ghi chú: {o.note}</div>}
          {!o.spot && <div style={{ fontSize: 11, color: '#94a3b8', marginBottom: 6 }}>Khách không ngồi gần bàn — giao tận tay.</div>}
          <div style={{ display: 'flex', gap: 6 }}>
            {o.status === 'NEW' && (
              <button type="button" disabled={busyId === o.id} onClick={() => onUpdate(o, 'PREPARING')} style={btn('#2563eb')}>
                <ChefHat size={13} /> Nhận làm
              </button>
            )}
            <button type="button" disabled={busyId === o.id} onClick={() => onUpdate(o, 'SERVED')} style={btn('#059669')}>
              <Check size={13} /> Phục vụ
            </button>
            <button type="button" title="Đi tới chỗ khách" onClick={() => onGoTo(o)} style={btn('rgba(255,255,255,0.12)')}>
              <Footprints size={13} />
            </button>
            <button type="button" title="Huỷ đơn" disabled={busyId === o.id} onClick={() => onUpdate(o, 'CANCELLED')} style={btn('rgba(220,38,38,0.7)')}>
              <Ban size={13} />
            </button>
          </div>
        </div>
      ))}
      {served.length > 0 && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 4 }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 11, color: '#64748b', fontWeight: 600 }}>LY ĐANG TRÊN BÀN ({servedAll.length})</span>
            <button type="button" onClick={() => onClear(null)} style={{ ...btn('rgba(255,255,255,0.12)'), padding: '4px 10px', fontSize: 11 }}>
              🧹 Dọn tất cả
            </button>
          </div>
          {served.map((o) => (
            <div key={o.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, color: '#94a3b8' }}>
              <span style={{ flex: 1, minWidth: 0 }}>
                ✓ {o.customerName}: {o.lines.map((l) => `${l.qty} ${byCode.get(l.code)?.name ?? l.code}`).join(', ')}
                {o.servedByName ? ` · ${o.servedByName}` : ''}
              </span>
              <button type="button" onClick={() => onClear(o.id)} style={{ ...btn('rgba(255,255,255,0.1)'), padding: '3px 9px', fontSize: 11 }}>
                Dọn
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

const btn = (bg: string): React.CSSProperties => ({
  display: 'inline-flex',
  alignItems: 'center',
  gap: 4,
  padding: '6px 10px',
  borderRadius: 99,
  border: 0,
  background: bg,
  color: '#fff',
  fontSize: 12,
  fontWeight: 600,
  cursor: 'pointer',
});
