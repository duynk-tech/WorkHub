'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { MoreHorizontal } from 'lucide-react';

/**
 * Menu thao tác dạng ba chấm.
 *
 * Dùng khi một khối có từ ba thao tác trở lên: xếp hết thành nút sẽ tràn dòng và
 * đẩy lệch bố cục. Giữ lại một hai thao tác chính ở ngoài, phần còn lại đưa vào đây.
 *
 * Menu vẽ qua portal và định vị theo tọa độ màn hình, nên không bị cắt bởi
 * thẻ cha có overflow hidden như Card hay bảng cuộn ngang.
 */

export interface ActionMenuItem {
  key: string;
  label: string;
  icon?: React.ReactNode;
  onClick: () => void;
  /** Thao tác phá hủy — tô đỏ và tách khỏi nhóm bằng một đường kẻ. */
  danger?: boolean;
  disabled?: boolean;
  hint?: string;
}

export function ActionMenu({
  items,
  label = 'Menu thao tác',
  title,
  width = 230,
}: {
  items: ActionMenuItem[];
  label?: string;
  /** Dòng tiêu đề nhỏ trên đầu menu, thường là mã của bản ghi. */
  title?: string;
  width?: number;
}) {
  const btnRef = useRef<HTMLButtonElement>(null);
  const menuRef = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [pos, setPos] = useState<{ top: number; right: number; width: number } | null>(null);
  const [mounted, setMounted] = useState(false);
  const visible = items.filter(Boolean);

  useEffect(() => setMounted(true), []);

  // Đo menu sau khi render để mở lên trên nếu phía dưới không đủ chỗ.
  useLayoutEffect(() => {
    if (!open || !btnRef.current || !menuRef.current) return;
    const r = btnRef.current.getBoundingClientRect();
    const menuHeight = menuRef.current.getBoundingClientRect().height;
    const availableBelow = window.innerHeight - r.bottom - 6;
    const availableAbove = r.top - 6;
    const placeAbove = menuHeight > availableBelow && availableAbove > availableBelow;
    const top = placeAbove
      ? Math.max(8, r.top - menuHeight - 6)
      : Math.min(r.bottom + 6, Math.max(8, window.innerHeight - menuHeight - 8));
    const menuWidth = Math.min(width, window.innerWidth - 16);
    const right = Math.max(8, Math.min(window.innerWidth - r.right, window.innerWidth - menuWidth - 8));
    setPos({ top, right, width: menuWidth });
  }, [open, visible.length, title, width]);

  useEffect(() => {
    if (!open) return;
    const close = () => setOpen(false);
    const onKey = (e: KeyboardEvent) => e.key === 'Escape' && setOpen(false);

    // Cuộn hay đổi kích thước làm tọa độ đã đo thành sai, đóng còn hơn vẽ lệch
    window.addEventListener('click', close);
    window.addEventListener('scroll', close, true);
    window.addEventListener('resize', close);
    window.addEventListener('keydown', onKey);
    return () => {
      window.removeEventListener('click', close);
      window.removeEventListener('scroll', close, true);
      window.removeEventListener('resize', close);
      window.removeEventListener('keydown', onKey);
    };
  }, [open]);

  if (visible.length === 0) return null;

  return (
    <>
      <button
        ref={btnRef}
        type="button"
        className="btn btn-secondary btn-sm"
        aria-label={label}
        aria-haspopup="menu"
        aria-expanded={open}
        title={label}
        onClick={(e) => {
          e.stopPropagation();
          setOpen((v) => !v);
        }}
        style={{
          padding: '5px 8px',
          display: 'inline-flex',
          alignItems: 'center',
          justifyContent: 'center',
          background: open ? 'var(--surface-hover)' : undefined,
          borderColor: open ? 'var(--brand)' : undefined,
        }}
      >
        <MoreHorizontal size={16} style={{ pointerEvents: 'none' }} />
      </button>

      {mounted && open && createPortal(
        <div
          ref={menuRef}
          role="menu"
          onClick={(e) => e.stopPropagation()}
          style={{
            position: 'fixed',
            top: pos?.top ?? 8,
            right: pos?.right ?? 8,
            width: pos?.width ?? Math.min(width, window.innerWidth - 16),
            maxHeight: 'calc(100vh - 16px)',
            overflowY: 'auto',
            zIndex: 9999,
            visibility: pos ? 'visible' : 'hidden',
            background: 'var(--surface-card)',
            border: '1px solid var(--border-base)',
            borderRadius: 'var(--radius-lg)',
            boxShadow: 'var(--shadow-xl, 0 10px 25px -5px rgba(0,0,0,0.2))',
            padding: 4,
          }}
        >
          {title && (
            <div
              style={{
                padding: '7px 10px 8px',
                marginBottom: 4,
                borderBottom: '1px solid var(--border-subtle)',
                fontSize: 11.5,
                fontWeight: 700,
                color: 'var(--text-muted)',
              }}
            >
              {title}
            </div>
          )}

          {visible.map((item, i) => {
            const prev = visible[i - 1];
            return (
              <React.Fragment key={item.key}>
                {item.danger && prev && !prev.danger && (
                  <div style={{ height: 1, background: 'var(--border-subtle)', margin: '4px 0' }} />
                )}
                <button
                  type="button"
                  role="menuitem"
                  disabled={item.disabled}
                  title={item.hint}
                  onClick={() => {
                    setOpen(false);
                    item.onClick();
                  }}
                  style={{
                    width: '100%',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 9,
                    padding: '8px 10px',
                    borderRadius: 'var(--radius-sm)',
                    border: 'none',
                    background: 'transparent',
                    textAlign: 'left',
                    fontSize: 13,
                    fontWeight: 500,
                    cursor: item.disabled ? 'not-allowed' : 'pointer',
                    opacity: item.disabled ? 0.45 : 1,
                    color: item.danger ? 'var(--danger)' : 'var(--text-strong)',
                  }}
                  onMouseEnter={(e) => {
                    if (!item.disabled) e.currentTarget.style.background = 'var(--surface-hover)';
                  }}
                  onMouseLeave={(e) => { e.currentTarget.style.background = 'transparent'; }}
                >
                  {item.icon}
                  <span>{item.label}</span>
                </button>
              </React.Fragment>
            );
          })}
        </div>,
        document.body,
      )}
    </>
  );
}
