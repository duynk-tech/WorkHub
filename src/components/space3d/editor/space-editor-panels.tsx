'use client';

import React, { useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import {
  Copy, Lock, LockOpen, Redo2, RotateCcw, RotateCw, Save, Search, Trash2, Undo2, X, LayoutGrid, Box, LayoutTemplate,
} from 'lucide-react';
import {
  SPACE_OBJECT_CATEGORIES,
  SPACE_OBJECT_DEF_MAP,
  SPACE_OBJECT_DEFS,
  type SpaceObjectCategory,
  type SpaceSceneKind,
} from '@/lib/space-3d-catalog';
import type { SpaceCatalogItem, SpaceObject } from '@/lib/space-3d-types';
import { getThumbnail, getThumbnailVersion, requestThumbnails, subscribeThumbnails } from '../three/props/thumbnails';

const DEFAULT_TAB: Record<SpaceSceneKind, SpaceObjectCategory> = {
  SHOWROOM: 'RETAIL',
  CAFE: 'CAFE',
  OFFICE: 'OFFICE',
  WAREHOUSE: 'WAREHOUSE',
};

function useThumbVersion() {
  return useSyncExternalStore(subscribeThumbnails, getThumbnailVersion, () => 0);
}

const panel: React.CSSProperties = {
  background: 'rgba(15, 23, 42, 0.9)',
  backdropFilter: 'blur(14px)',
  WebkitBackdropFilter: 'blur(14px)',
  border: '1px solid rgba(255,255,255,0.12)',
  color: '#f8fafc',
  borderRadius: 16,
  boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
};

// ───────────────────────── Thư viện kéo thả ─────────────────────────

export function LibraryPanel({
  sceneKind,
  onDragKind,
  onAddKind,
}: {
  sceneKind: SpaceSceneKind;
  onDragKind: (kind: string | null) => void;
  onAddKind: (kind: string) => void;
}) {
  const [tab, setTab] = useState<SpaceObjectCategory>(DEFAULT_TAB[sceneKind]);
  const [q, setQ] = useState('');
  useThumbVersion();

  const items = useMemo(() => {
    const term = q.trim().toLowerCase();
    return SPACE_OBJECT_DEFS.filter((d) => (term ? d.label.toLowerCase().includes(term) : d.category === tab));
  }, [tab, q]);

  useEffect(() => {
    requestThumbnails(items.map((i) => i.kind));
  }, [items]);

  return (
    <div style={{ ...panel, position: 'fixed', left: 14, top: 120, bottom: 92, width: 264, zIndex: 30, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ padding: '12px 12px 8px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Thư viện vật thể</div>
        <label style={{ display: 'flex', alignItems: 'center', gap: 6, background: 'rgba(255,255,255,0.06)', borderRadius: 9, padding: '6px 9px' }}>
          <Search size={14} color="#94a3b8" />
          <input
            value={q}
            onChange={(e) => setQ(e.target.value)}
            placeholder="Tìm: ghế, kệ, cây…"
            style={{ flex: 1, minWidth: 0, background: 'transparent', border: 0, outline: 'none', color: '#f8fafc', fontSize: 12.5 }}
          />
        </label>
        {!q && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 4, marginTop: 8 }}>
            {SPACE_OBJECT_CATEGORIES.map((c) => (
              <button
                key={c.key}
                type="button"
                onClick={() => setTab(c.key)}
                style={{
                  padding: '4px 8px', borderRadius: 999, border: 0, cursor: 'pointer', fontSize: 11, fontWeight: 600,
                  background: tab === c.key ? '#2563eb' : 'rgba(255,255,255,0.07)', color: tab === c.key ? '#fff' : '#cbd5e1',
                }}
              >
                {c.label}
              </button>
            ))}
          </div>
        )}
      </div>
      <div style={{ flex: 1, overflowY: 'auto', padding: 10, display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, alignContent: 'start' }}>
        {items.map((d) => {
          const thumb = getThumbnail(d.kind);
          return (
            <div
              key={d.kind}
              draggable
              onDragStart={(e) => {
                e.dataTransfer.setData('application/x-space3d-kind', d.kind);
                e.dataTransfer.effectAllowed = 'copy';
                onDragKind(d.kind);
              }}
              onDragEnd={() => onDragKind(null)}
              onDoubleClick={() => onAddKind(d.kind)}
              title={`${d.label} — kéo thả vào không gian (nhấp đúp để thêm trước mặt)`}
              style={{
                cursor: 'grab', borderRadius: 11, background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)',
                padding: 6, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 4, userSelect: 'none',
              }}
            >
              <div style={{ width: '100%', aspectRatio: '1', borderRadius: 8, background: 'radial-gradient(circle at 50% 35%, #334155, #0f172a)', display: 'grid', placeItems: 'center', overflow: 'hidden' }}>
                {thumb ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img src={thumb} alt={d.label} draggable={false} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
                ) : (
                  <Box size={22} color="#64748b" />
                )}
              </div>
              <span style={{ fontSize: 11, textAlign: 'center', lineHeight: 1.25, color: '#e2e8f0' }}>{d.label}</span>
              <span style={{ fontSize: 9.5, color: '#64748b' }}>
                {d.size[0]}×{d.size[1]}×{d.size[2]}m
              </span>
            </div>
          );
        })}
      </div>
      <div style={{ padding: '8px 12px', fontSize: 10.5, color: '#94a3b8', borderTop: '1px solid rgba(255,255,255,0.08)', lineHeight: 1.5 }}>
        Kéo thả vào sàn · Kéo vật thể để di chuyển (giữ <b>Alt</b> bỏ lưới) · <b>R</b> xoay · <b>Del</b> xoá · <b>Ctrl+D</b> nhân bản · <b>Ctrl+Z/Y</b>
      </div>
    </div>
  );
}

// ───────────────────────── Thuộc tính ─────────────────────────

const field: React.CSSProperties = {
  width: '100%', minWidth: 0, padding: '6px 8px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.14)',
  background: 'rgba(255,255,255,0.06)', color: '#f8fafc', fontSize: 12.5, outline: 'none',
};
const iconBtn: React.CSSProperties = {
  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5, padding: '6px 9px', borderRadius: 8,
  border: '1px solid rgba(255,255,255,0.14)', background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', fontSize: 11.5, cursor: 'pointer',
};

export function InspectorPanel({
  object,
  collides,
  catalog,
  onChange,
  onRotate,
  onDuplicate,
  onDelete,
  onClose,
}: {
  object: SpaceObject;
  collides: boolean;
  catalog: SpaceCatalogItem[];
  onChange: (patch: Partial<SpaceObject>) => void;
  onRotate: (dir: 1 | -1) => void;
  onDuplicate: () => void;
  onDelete: () => void;
  onClose: () => void;
}) {
  const def = SPACE_OBJECT_DEF_MAP[object.kind];
  const [merchQ, setMerchQ] = useState('');
  if (!def) return null;
  const num = (k: 'widthM' | 'depthM' | 'heightM', lim: [number, number], label: string) => (
    <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, color: '#94a3b8' }}>
      {label}
      <input
        type="number"
        step={0.05}
        min={lim[0]}
        max={lim[1]}
        value={Number(object[k].toFixed(2))}
        disabled={lim[0] === lim[1]}
        onChange={(e) => {
          const v = Number(e.target.value);
          if (Number.isFinite(v)) onChange({ [k]: Math.min(lim[1], Math.max(lim[0], v)) } as Partial<SpaceObject>);
        }}
        style={field}
      />
    </label>
  );
  const merchIds = object.merch?.itemIds ?? [];
  const merchOptions = catalog.filter((c) => !merchQ || c.name.toLowerCase().includes(merchQ.toLowerCase())).slice(0, 30);

  return (
    <div style={{ ...panel, position: 'fixed', right: 14, top: 120, width: 286, maxHeight: 'calc(100vh - 220px)', zIndex: 30, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '11px 12px', borderBottom: '1px solid rgba(255,255,255,0.08)' }}>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 10.5, color: '#60a5fa', fontWeight: 600 }}>{def.label}</div>
          <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{object.label}</div>
        </div>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 0, color: '#94a3b8', cursor: 'pointer' }} aria-label="Đóng">
          <X size={16} />
        </button>
      </div>
      <div style={{ padding: 12, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 11 }}>
        {collides && (
          <div style={{ fontSize: 11.5, color: '#fecaca', background: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.35)', borderRadius: 8, padding: '6px 8px' }}>
            Vật thể đang chồng lấn món khác — kéo ra chỗ trống.
          </div>
        )}
        <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
          <button type="button" style={iconBtn} onClick={() => onRotate(-1)} title="Xoay trái 15° (Shift+R)"><RotateCcw size={13} /></button>
          <button type="button" style={iconBtn} onClick={() => onRotate(1)} title="Xoay phải 15° (R)"><RotateCw size={13} /></button>
          <button type="button" style={iconBtn} onClick={onDuplicate} title="Nhân bản (Ctrl+D)"><Copy size={13} /> Nhân bản</button>
          <button type="button" style={iconBtn} onClick={() => onChange({ locked: !object.locked })} title="Khoá vị trí">
            {object.locked ? <Lock size={13} /> : <LockOpen size={13} />}
          </button>
          <button type="button" style={{ ...iconBtn, color: '#fca5a5', borderColor: 'rgba(239,68,68,0.4)' }} onClick={onDelete} title="Xoá (Delete)"><Trash2 size={13} /></button>
        </div>

        {(def.labeled || def.walkTarget) && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, color: '#94a3b8' }}>
            Tên hiển thị
            <input value={object.label} maxLength={80} onChange={(e) => onChange({ label: e.target.value })} style={field} />
          </label>
        )}
        {def.kind === 'BOOTH' && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, color: '#94a3b8' }}>
            Dòng phụ
            <input value={object.subLabel ?? ''} maxLength={80} onChange={(e) => onChange({ subLabel: e.target.value })} style={field} />
          </label>
        )}

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
          {num('widthM', def.limits.w, 'Rộng (m)')}
          {num('depthM', def.limits.d, 'Sâu (m)')}
          {num('heightM', def.limits.h, 'Cao (m)')}
        </div>

        {def.variants && (
          <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, color: '#94a3b8' }}>
            Chất liệu / kiểu
            <select value={object.variant} onChange={(e) => onChange({ variant: e.target.value })} style={field}>
              {def.variants.map((v) => (
                <option key={v.key} value={v.key} style={{ color: '#0f172a' }}>{v.label}</option>
              ))}
            </select>
          </label>
        )}

        {def.palette && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
            <span style={{ fontSize: 10.5, color: '#94a3b8' }}>{def.labeled ? 'Màu nhấn' : 'Màu'}</span>
            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
              {def.palette.map((c) => {
                const active = (def.labeled ? object.accentColor : object.color) === c;
                return (
                  <button
                    key={c}
                    type="button"
                    onClick={() => onChange(def.labeled ? { accentColor: c, color: c } : { color: c })}
                    style={{ width: 24, height: 24, borderRadius: 99, background: c, border: active ? '2px solid #fff' : '1px solid rgba(255,255,255,0.25)', cursor: 'pointer', boxShadow: active ? '0 0 0 2px #2563eb' : 'none' }}
                    aria-label={c}
                  />
                );
              })}
            </div>
          </div>
        )}

        {def.shelves && (
          <>
            <label style={{ display: 'flex', flexDirection: 'column', gap: 3, fontSize: 10.5, color: '#94a3b8' }}>
              Số tầng kệ
              <input type="number" min={1} max={8} value={object.levels ?? def.defaultLevels ?? 3} onChange={(e) => onChange({ levels: Math.min(8, Math.max(1, Math.round(Number(e.target.value) || 1))) })} style={field} />
            </label>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 5 }}>
              <span style={{ fontSize: 10.5, color: '#94a3b8' }}>Hàng hoá trên kệ</span>
              <div style={{ display: 'flex', gap: 5 }}>
                {(['AUTO', 'MANUAL'] as const).map((m) => (
                  <button
                    key={m}
                    type="button"
                    onClick={() => onChange({ merch: { mode: m, itemIds: merchIds } })}
                    style={{ ...iconBtn, flex: 1, background: (object.merch?.mode ?? 'AUTO') === m ? '#2563eb' : iconBtn.background, color: '#fff' }}
                  >
                    {m === 'AUTO' ? 'Tự động' : 'Chọn sản phẩm'}
                  </button>
                ))}
              </div>
              {object.merch?.mode === 'MANUAL' && (
                <>
                  <input placeholder="Tìm sản phẩm…" value={merchQ} onChange={(e) => setMerchQ(e.target.value)} style={field} />
                  <div style={{ maxHeight: 180, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 3 }}>
                    {merchOptions.map((c) => {
                      const on = merchIds.includes(c.id);
                      return (
                        <label key={c.id} style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 11.5, padding: '3px 4px', borderRadius: 6, background: on ? 'rgba(37,99,235,0.2)' : 'transparent', cursor: 'pointer' }}>
                          <input
                            type="checkbox"
                            checked={on}
                            onChange={() =>
                              onChange({ merch: { mode: 'MANUAL', itemIds: on ? merchIds.filter((x) => x !== c.id) : [...merchIds, c.id].slice(0, 60) } })
                            }
                          />
                          <span style={{ flex: 1, minWidth: 0, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{c.name}</span>
                        </label>
                      );
                    })}
                    {merchOptions.length === 0 && <span style={{ fontSize: 11, color: '#64748b' }}>Không có sản phẩm phù hợp</span>}
                  </div>
                </>
              )}
            </div>
          </>
        )}

        <div style={{ fontSize: 10.5, color: '#64748b' }}>
          Vị trí X {object.posX.toFixed(2)} · Z {object.posZ.toFixed(2)} · Góc {Math.round((object.rotY * 180) / Math.PI)}°
        </div>
      </div>
    </div>
  );
}

// ───────────────────────── Thanh công cụ ─────────────────────────

export function EditorToolbar({
  dirty,
  saving,
  canUndo,
  canRedo,
  planView,
  objectCount,
  onUndo,
  onRedo,
  onSave,
  onTogglePlan,
  onTemplate,
  onExit,
}: {
  dirty: boolean;
  saving: boolean;
  canUndo: boolean;
  canRedo: boolean;
  planView: boolean;
  objectCount: number;
  onUndo: () => void;
  onRedo: () => void;
  onSave: () => void;
  onTogglePlan: () => void;
  onTemplate: () => void;
  onExit: () => void;
}) {
  const b = (active = false): React.CSSProperties => ({
    display: 'inline-flex', alignItems: 'center', gap: 5, padding: '7px 10px', borderRadius: 9, border: 0, cursor: 'pointer', fontSize: 12, fontWeight: 600,
    background: active ? '#2563eb' : 'rgba(255,255,255,0.07)', color: '#f1f5f9',
  });
  return (
    <div style={{ ...panel, position: 'fixed', top: 64, left: '50%', transform: 'translateX(-50%)', zIndex: 31, padding: 6, display: 'flex', alignItems: 'center', gap: 6, borderRadius: 14, maxWidth: 'calc(100vw - 32px)', flexWrap: 'wrap', justifyContent: 'center' }}>
      <span style={{ fontSize: 11.5, fontWeight: 700, color: '#fbbf24', padding: '0 6px' }}>THIẾT KẾ · {objectCount} vật thể</span>
      <button type="button" style={{ ...b(), opacity: canUndo ? 1 : 0.4 }} disabled={!canUndo} onClick={onUndo} title="Hoàn tác (Ctrl+Z)"><Undo2 size={14} /></button>
      <button type="button" style={{ ...b(), opacity: canRedo ? 1 : 0.4 }} disabled={!canRedo} onClick={onRedo} title="Làm lại (Ctrl+Y)"><Redo2 size={14} /></button>
      <button type="button" style={b(planView)} onClick={onTogglePlan} title="Mặt bằng 2D nhìn từ trên"><LayoutGrid size={14} /> {planView ? 'Mặt bằng 2D' : '3D'}</button>
      <button type="button" style={b()} onClick={onTemplate} title="Áp dụng bố cục mẫu"><LayoutTemplate size={14} /> Mẫu</button>
      <button type="button" style={{ ...b(), background: dirty ? '#16a34a' : '#334155' }} onClick={onSave} disabled={saving}><Save size={14} /> {saving ? 'Đang lưu…' : dirty ? 'Lưu bố cục' : 'Đã lưu'}</button>
      <button type="button" style={b()} onClick={onExit} title="Thoát chế độ thiết kế"><X size={14} /></button>
    </div>
  );
}
