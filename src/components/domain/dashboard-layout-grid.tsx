'use client';

import React, { useEffect, useRef, useState, useTransition } from 'react';
import { useRouter } from 'next/navigation';
import { GripVertical, Save, RotateCcw, X, Columns3 } from 'lucide-react';
import { Button } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import {
  defaultColSpanForWidget,
  type DashboardWidgetColSpan,
} from '@/lib/dashboard-widgets';
import { saveDashboardLayoutAction } from '@/server/modules/dashboard/actions';

/** Nút "Bố cục" ở thanh bảng (DashboardBoardBar) phát sự kiện này để bật chế độ thiết kế. */
export const DASHBOARD_LAYOUT_EDIT_EVENT = 'workhub:dashboard-layout-edit';

export interface DashboardGridItemData {
  key: string;
  label: string;
  colSpan: DashboardWidgetColSpan;
  content: React.ReactNode;
}

const COL_OPTIONS: { span: DashboardWidgetColSpan; label: string; title: string }[] = [
  { span: 4, label: '1/3', title: '4 / 12 cột (1/3 hàng)' },
  { span: 6, label: '1/2', title: '6 / 12 cột (1/2 hàng)' },
  { span: 8, label: '2/3', title: '8 / 12 cột (2/3 hàng)' },
  { span: 12, label: 'Full', title: '12 / 12 cột (Toàn hàng)' },
];

function snapToColSpan(rawCols: number): DashboardWidgetColSpan {
  if (rawCols <= 5) return 4;
  if (rawCols <= 7) return 6;
  if (rawCols <= 10) return 8;
  return 12;
}

export function DashboardLayoutGrid({
  boardId,
  canEdit,
  items,
}: {
  boardId: number;
  canEdit: boolean;
  items: DashboardGridItemData[];
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const gridRef = useRef<HTMLDivElement | null>(null);

  const [editMode, setEditMode] = useState(false);
  const [layout, setLayout] = useState<{ key: string; colSpan: DashboardWidgetColSpan }[]>(() =>
    items.map((i) => ({ key: i.key, colSpan: i.colSpan })),
  );
  const [dragKey, setDragKey] = useState<string | null>(null);
  const [dragOverKey, setDragOverKey] = useState<string | null>(null);
  const [resizingKey, setResizingKey] = useState<string | null>(null);

  // Đồng bộ khi chuyển bảng Dashboard khác
  const itemsSig = items.map((i) => `${i.key}:${i.colSpan}`).join('|');
  useEffect(() => {
    setLayout(items.map((i) => ({ key: i.key, colSpan: i.colSpan })));
    setEditMode(false);
  }, [boardId, itemsSig]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (!canEdit) return;
    const start = () => setEditMode(true);
    window.addEventListener(DASHBOARD_LAYOUT_EDIT_EVENT, start);
    return () => window.removeEventListener(DASHBOARD_LAYOUT_EDIT_EVENT, start);
  }, [canEdit]);

  const itemMap = new Map(items.map((i) => [i.key, i]));

  const setColSpan = (key: string, colSpan: DashboardWidgetColSpan) => {
    setLayout((prev) => prev.map((it) => (it.key === key ? { ...it, colSpan } : it)));
  };

  const removeWidget = (key: string) => {
    setLayout((prev) => (prev.length > 1 ? prev.filter((it) => it.key !== key) : prev));
  };

  const handleDropOn = (targetKey: string) => {
    setDragOverKey(null);
    if (!dragKey || dragKey === targetKey) {
      setDragKey(null);
      return;
    }
    setLayout((prev) => {
      const fromIdx = prev.findIndex((i) => i.key === dragKey);
      const toIdx = prev.findIndex((i) => i.key === targetKey);
      if (fromIdx < 0 || toIdx < 0) return prev;
      const copy = [...prev];
      const [moved] = copy.splice(fromIdx, 1);
      copy.splice(toIdx, 0, moved);
      return copy;
    });
    setDragKey(null);
  };

  const startResize = (key: string, currentSpan: DashboardWidgetColSpan, startX: number) => {
    const gridEl = gridRef.current;
    if (!gridEl) return;
    const colWidth = gridEl.getBoundingClientRect().width / 12;
    if (!colWidth) return;

    setResizingKey(key);
    const onMove = (ev: PointerEvent) => {
      const deltaCols = (ev.clientX - startX) / colWidth;
      const nextSpan = snapToColSpan(Math.round(currentSpan + deltaCols));
      setColSpan(key, nextSpan);
    };
    const onUp = () => {
      setResizingKey(null);
      window.removeEventListener('pointermove', onMove);
      window.removeEventListener('pointerup', onUp);
    };
    window.addEventListener('pointermove', onMove);
    window.addEventListener('pointerup', onUp);
  };

  const handleResetDefaults = () => {
    setLayout(items.map((i) => ({ key: i.key, colSpan: defaultColSpanForWidget(i.key) })));
  };

  const handleCancel = () => {
    setLayout(items.map((i) => ({ key: i.key, colSpan: i.colSpan })));
    setEditMode(false);
  };

  const handleSave = () => {
    startTransition(async () => {
      const res = await saveDashboardLayoutAction(boardId, layout);
      if (res.ok) {
        toast.success(res.message);
        setEditMode(false);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    });
  };

  return (
    <div className="stack" style={{ gap: 12 }}>
      {canEdit && editMode && (
          <div
            className="row-between"
            style={{
              flexWrap: 'wrap',
              gap: 10,
              padding: '10px 14px',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--brand)',
              background: 'var(--brand-soft)',
            }}
          >
            <div className="row" style={{ gap: 8, color: 'var(--brand)', fontSize: 12.5, fontWeight: 500 }}>
              <Columns3 size={15} />
              <span>
                Đang sắp xếp bố cục — kéo thả khối để đổi vị trí, kéo cạnh phải hoặc chọn độ rộng (1/3 · 1/2 · 2/3 · Full) rồi bấm Lưu.
              </span>
            </div>
            <div className="row" style={{ gap: 6 }}>
              <Button type="button" size="sm" variant="ghost" onClick={handleResetDefaults} disabled={pending}>
                <RotateCcw size={13} /> Mặc định
              </Button>
              <Button type="button" size="sm" variant="secondary" onClick={handleCancel} disabled={pending}>
                Hủy
              </Button>
              <Button type="button" size="sm" variant="primary" onClick={handleSave} loading={pending}>
                <Save size={13} /> Lưu layout
              </Button>
            </div>
          </div>
      )}

      <div ref={gridRef} className="dashboard-grid-12">
        {layout.map((entry) => {
          const item = itemMap.get(entry.key);
          if (!item) return null;
          return (
            <div
              key={entry.key}
              className="dashboard-grid-item"
              data-editing={editMode}
              data-span={entry.colSpan}
              data-drag-over={editMode && dragOverKey === entry.key && dragKey !== entry.key}
              data-resizing={resizingKey === entry.key}
              style={{ '--col-span': entry.colSpan } as React.CSSProperties}
              draggable={editMode}
              onDragStart={(e) => {
                if (!editMode) return;
                setDragKey(entry.key);
                e.dataTransfer.effectAllowed = 'move';
              }}
              onDragEnd={() => {
                setDragKey(null);
                setDragOverKey(null);
              }}
              onDragOver={(e) => {
                if (!editMode) return;
                e.preventDefault();
                if (dragOverKey !== entry.key) setDragOverKey(entry.key);
              }}
              onDragLeave={() => {
                if (dragOverKey === entry.key) setDragOverKey(null);
              }}
              onDrop={(e) => {
                if (!editMode) return;
                e.preventDefault();
                handleDropOn(entry.key);
              }}
            >
              {editMode && (
                <div
                  className="row-between"
                  style={{
                    gap: 8,
                    marginBottom: 8,
                    padding: '4px 6px',
                    borderRadius: 'var(--radius-sm)',
                    background: 'var(--surface-card)',
                    border: '1px solid var(--border-base)',
                    cursor: 'grab',
                  }}
                >
                  <div className="row" style={{ gap: 6, minWidth: 0 }}>
                    <GripVertical size={14} style={{ color: 'var(--text-faint)', flexShrink: 0 }} />
                    <span
                      style={{
                        fontSize: 12,
                        fontWeight: 600,
                        color: 'var(--text-strong)',
                        overflow: 'hidden',
                        textOverflow: 'ellipsis',
                        whiteSpace: 'nowrap',
                      }}
                    >
                      {item.label}
                    </span>
                    <span className="hint tnum" style={{ fontSize: 11, whiteSpace: 'nowrap' }}>
                      ({entry.colSpan}/12)
                    </span>
                  </div>

                  <div className="row" style={{ gap: 3, flexShrink: 0 }}>
                    {COL_OPTIONS.map((opt) => (
                      <button
                        key={opt.span}
                        type="button"
                        title={opt.title}
                        onClick={() => setColSpan(entry.key, opt.span)}
                        style={{
                          padding: '2px 7px',
                          fontSize: 11,
                          fontWeight: entry.colSpan === opt.span ? 600 : 450,
                          borderRadius: 'var(--radius-xs)',
                          border: '1px solid',
                          borderColor: entry.colSpan === opt.span ? 'var(--brand)' : 'var(--border-base)',
                          background: entry.colSpan === opt.span ? 'var(--brand)' : 'var(--surface-card)',
                          color: entry.colSpan === opt.span ? 'var(--brand-contrast)' : 'var(--text-muted)',
                          cursor: 'pointer',
                        }}
                      >
                        {opt.label}
                      </button>
                    ))}
                    {layout.length > 1 && (
                      <button
                        type="button"
                        title="Ẩn khối này khỏi bảng"
                        onClick={() => removeWidget(entry.key)}
                        style={{
                          marginLeft: 2,
                          padding: '2px 4px',
                          borderRadius: 'var(--radius-xs)',
                          border: 0,
                          background: 'transparent',
                          color: 'var(--text-muted)',
                          cursor: 'pointer',
                          display: 'inline-flex',
                        }}
                      >
                        <X size={13} />
                      </button>
                    )}
                  </div>
                </div>
              )}

              <div className="dashboard-grid-content">{item.content}</div>

              {editMode && (
                <div
                  className="dashboard-resize-handle"
                  title="Kéo sang trái/phải để đổi độ rộng cột"
                  onPointerDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    startResize(entry.key, entry.colSpan, e.clientX);
                  }}
                />
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
}
