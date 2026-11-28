'use client';

import { useMemo, useState } from 'react';
import { Minus, Plus, X, Coffee } from 'lucide-react';
import { MAX_ORDER_QTY, orderTotal, type CafeMenuItem, type DrinkOrderView, type OrderLine } from '@/lib/space-3d-cafe-menu';

const vnd = (n: number) => `${n.toLocaleString('vi-VN')}₫`;

/** Hình ly nhỏ vẽ bằng CSS theo kiểu ly & màu đồ uống. */
function CupIcon({ item }: { item: CafeMenuItem }) {
  if (item.cupKind === 'banh_tet' || item.cupKind === 'banh_it') {
    // Đĩa lót lá chuối: khoanh bánh tét (vỏ lá – nếp tím – nhân vàng) hoặc 2 chiếc bánh ít màu kem chấm xanh
    const tet = item.cupKind === 'banh_tet';
    return (
      <span style={{ position: 'relative', width: 38, height: 38, flex: 'none', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <span style={{ position: 'absolute', width: 36, height: 16, bottom: 6, borderRadius: '50%', background: '#4d7c2f', boxShadow: '0 2px 6px rgba(0,0,0,0.3)' }} />
        {tet ? (
          <span style={{ position: 'relative', top: -3, width: 22, height: 22, borderRadius: '50%', background: 'radial-gradient(circle, #f59e0b 0 22%, #facc15 23% 42%, #6b2d7a 43% 78%, #3f5f22 79%)', border: '1px solid #2f4a17' }} />
        ) : (
          [0, 1].map((i) => (
            <span key={i} style={{ position: 'relative', top: -4, margin: '0 1px', width: 15, height: 13, borderRadius: '50% 50% 30% 30%', background: 'radial-gradient(circle at 50% 22%, #65a30d 0 14%, #efe4ad 16%)', boxShadow: 'inset 0 -2px 0 rgba(0,0,0,0.12)' }} />
          ))
        )}
      </span>
    );
  }
  const tall = item.cupKind === 'iced' || item.cupKind === 'takeaway' || item.cupKind === 'bottle';
  const w = tall ? 22 : 28;
  const h = tall ? 34 : item.cupKind === 'espresso' ? 18 : 24;
  return (
    <span style={{ position: 'relative', width: 38, height: 38, flex: 'none', display: 'flex', alignItems: 'flex-end', justifyContent: 'center' }}>
      <span
        style={{
          width: w,
          height: h,
          borderRadius: tall ? '3px 3px 7px 7px' : '3px 3px 12px 12px',
          border: '2px solid rgba(255,255,255,0.75)',
          background: `linear-gradient(to top, ${item.liquid} 0%, ${item.liquid} ${tall ? 78 : 70}%, ${item.foam ? '#f3e7d3' : 'rgba(255,255,255,0.18)'} ${tall ? 78 : 70}%)`,
          boxShadow: '0 2px 6px rgba(0,0,0,0.3)',
        }}
      />
      {!tall && <span style={{ position: 'absolute', right: 3, bottom: 6, width: 8, height: 10, borderRadius: '0 8px 8px 0', border: '2px solid rgba(255,255,255,0.75)', borderLeft: 0 }} />}
      {tall && item.cupKind !== 'bottle' && <span style={{ position: 'absolute', left: 21, bottom: 22, width: 3, height: 18, background: '#16a34a', borderRadius: 2, transform: 'rotate(12deg)' }} />}
    </span>
  );
}

const STATUS_TEXT: Record<string, string> = { NEW: 'Đã gửi quầy', PREPARING: 'Đang pha chế…', SERVED: 'Đã phục vụ', CANCELLED: 'Đã huỷ' };

export function SpaceCafeMenu({
  menu,
  myOrders,
  onClose,
  onPlace,
  onClear,
  glassStyle,
}: {
  menu: CafeMenuItem[];
  myOrders: DrinkOrderView[];
  onClose: () => void;
  onPlace: (lines: OrderLine[], note: string) => Promise<boolean>;
  /** Dọn ly của mình trên bàn (null = tất cả ly của mình) */
  onClear?: (orderId: number | null) => void;
  glassStyle: React.CSSProperties;
}) {
  const [cart, setCart] = useState<Record<string, number>>({});
  const [note, setNote] = useState('');
  const [busy, setBusy] = useState(false);
  const lines = useMemo(() => Object.entries(cart).filter(([, q]) => q > 0).map(([code, qty]) => ({ code, qty })), [cart]);
  const count = lines.reduce((s, l) => s + l.qty, 0);
  const total = orderTotal(lines, menu);
  const byCode = useMemo(() => new Map(menu.map((m) => [m.code, m])), [menu]);
  const add = (code: string, d: number) =>
    setCart((c) => {
      const next = Math.max(0, (c[code] ?? 0) + d);
      if (d > 0 && count >= MAX_ORDER_QTY) return c;
      return { ...c, [code]: next };
    });

  return (
    <div
      style={{
        ...glassStyle,
        position: 'fixed',
        right: 14,
        bottom: 92,
        zIndex: 45,
        width: 'min(340px, calc(100vw - 28px))',
        maxHeight: '70vh',
        borderRadius: 16,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
      }}
    >
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', padding: '12px 14px 8px' }}>
        <div>
          <div style={{ fontSize: 10.5, color: '#fbbf24', fontWeight: 700, letterSpacing: 0.4 }}>TIM CAFÉ</div>
          <div style={{ fontSize: 15, fontWeight: 700, color: '#fff', display: 'flex', alignItems: 'center', gap: 6 }}>
            <Coffee size={15} /> Gọi đồ uống
          </div>
        </div>
        <button type="button" aria-label="Đóng" onClick={onClose} style={{ background: 'none', border: 0, color: '#94a3b8', cursor: 'pointer' }}>
          <X size={16} />
        </button>
      </div>

      {myOrders.length > 0 && (
        <div style={{ margin: '0 12px 8px', padding: 8, borderRadius: 10, background: 'rgba(251,191,36,0.12)', border: '1px solid rgba(251,191,36,0.3)', display: 'flex', flexDirection: 'column', gap: 4 }}>
          {myOrders.slice(-3).map((o) => (
            <div key={o.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8, fontSize: 11.5, color: '#fde68a' }}>
              <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                {o.lines.map((l) => `${l.qty} ${byCode.get(l.code)?.name ?? l.code}`).join(', ')}
              </span>
              <strong style={{ whiteSpace: 'nowrap' }}>{STATUS_TEXT[o.status]}</strong>
              {o.status === 'SERVED' && onClear && (
                <button type="button" onClick={() => onClear(o.id)} style={{ background: 'none', border: 0, color: '#fde68a', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}>
                  Dọn
                </button>
              )}
            </div>
          ))}
          {onClear && myOrders.filter((o) => o.status === 'SERVED').length > 1 && (
            <button type="button" onClick={() => onClear(null)} style={{ alignSelf: 'flex-end', background: 'none', border: 0, color: '#fde68a', cursor: 'pointer', fontSize: 11, textDecoration: 'underline' }}>
              🧹 Dọn tất cả ly của tôi
            </button>
          )}
        </div>
      )}

      <div style={{ overflowY: 'auto', padding: '0 12px', display: 'flex', flexDirection: 'column', gap: 6 }}>
        {menu.map((m) => {
          const q = cart[m.code] ?? 0;
          return (
            <div key={m.code} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '7px 8px', borderRadius: 10, background: q ? 'rgba(37,99,235,0.22)' : 'rgba(255,255,255,0.05)' }}>
              <CupIcon item={m} />
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: 600, color: '#f8fafc' }}>{m.name}</div>
                <div style={{ fontSize: 11, color: '#94a3b8', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{m.desc}</div>
                <div style={{ fontSize: 11.5, color: '#fbbf24', fontWeight: 600 }}>{vnd(m.price)}</div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 4 }}>
                {q > 0 && (
                  <>
                    <button type="button" aria-label={`Bớt ${m.name}`} onClick={() => add(m.code, -1)} style={qtyBtn}>
                      <Minus size={12} />
                    </button>
                    <span style={{ minWidth: 14, textAlign: 'center', fontSize: 13, fontWeight: 700, color: '#fff' }}>{q}</span>
                  </>
                )}
                <button type="button" aria-label={`Thêm ${m.name}`} disabled={count >= MAX_ORDER_QTY} onClick={() => add(m.code, 1)} style={{ ...qtyBtn, background: '#2563eb', opacity: count >= MAX_ORDER_QTY ? 0.4 : 1 }}>
                  <Plus size={12} />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      <div style={{ padding: 12, borderTop: '1px solid rgba(255,255,255,0.1)', display: 'flex', flexDirection: 'column', gap: 8 }}>
        <input
          value={note}
          onChange={(e) => setNote(e.target.value)}
          maxLength={200}
          placeholder="Ghi chú: ít đá, ít ngọt…"
          style={{ padding: '7px 12px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#f8fafc', fontSize: 12.5, outline: 'none' }}
        />
        <button
          type="button"
          disabled={!count || busy}
          onClick={async () => {
            setBusy(true);
            const ok = await onPlace(lines, note);
            setBusy(false);
            if (ok) {
              setCart({});
              setNote('');
            }
          }}
          style={{
            padding: '10px 14px',
            borderRadius: 12,
            border: 0,
            background: count ? 'linear-gradient(135deg,#f59e0b,#d97706)' : 'rgba(255,255,255,0.1)',
            color: '#fff',
            fontWeight: 700,
            fontSize: 13.5,
            cursor: count && !busy ? 'pointer' : 'default',
          }}
        >
          {busy ? 'Đang gửi…' : count ? `Gọi ${count} ly · ${vnd(total)}` : `Chọn món (tối đa ${MAX_ORDER_QTY} ly)`}
        </button>
        <div style={{ fontSize: 10.5, color: '#64748b', textAlign: 'center' }}>Trải nghiệm phục vụ tại bàn trong TIM Space — không thanh toán.</div>
      </div>
    </div>
  );
}

const qtyBtn: React.CSSProperties = {
  width: 24,
  height: 24,
  borderRadius: 99,
  border: 0,
  background: 'rgba(255,255,255,0.12)',
  color: '#fff',
  cursor: 'pointer',
  display: 'flex',
  alignItems: 'center',
  justifyContent: 'center',
};
