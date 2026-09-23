'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ChevronLeft, ChevronRight } from 'lucide-react';

/**
 * Thanh tab một dòng, tràn thì cuộn ngang.
 *
 * Xuống dòng làm thanh tab cao gấp đôi và đẩy nội dung bên dưới tụt xuống, nên ở
 * đây giữ đúng một dòng. Hai nút mũi tên chỉ hiện khi thực sự còn chỗ để cuộn,
 * và biến mất khi đã cuộn hết đầu đó — không để nút chết trên màn hình.
 */
export function ScrollTabs({
  children,
  style,
}: {
  children: React.ReactNode;
  style?: React.CSSProperties;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [canLeft, setCanLeft] = useState(false);
  const [canRight, setCanRight] = useState(false);

  const measure = useCallback(() => {
    const el = ref.current;
    if (!el) return;
    // Trừ 1px cho sai số làm tròn khi trình duyệt phóng to thu nhỏ
    setCanLeft(el.scrollLeft > 1);
    setCanRight(el.scrollLeft + el.clientWidth < el.scrollWidth - 1);
  }, []);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    measure();

    // Tab đổi số lượng (bộ lọc, quyền) thì phải đo lại, không chỉ khi cuộn
    const ro = new ResizeObserver(measure);
    ro.observe(el);
    for (const child of Array.from(el.children)) ro.observe(child);

    el.addEventListener('scroll', measure, { passive: true });
    window.addEventListener('resize', measure);
    return () => {
      ro.disconnect();
      el.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [measure, children]);

  const scrollBy = (dir: -1 | 1) => {
    const el = ref.current;
    if (!el) return;
    el.scrollBy({ left: dir * Math.max(160, el.clientWidth * 0.6), behavior: 'smooth' });
  };

  const arrow: React.CSSProperties = {
    position: 'absolute',
    top: 0,
    bottom: 1,
    width: 44,
    display: 'grid',
    placeItems: 'center',
    border: 'none',
    cursor: 'pointer',
    color: 'var(--text-muted)',
    zIndex: 2,
  };

  return (
    <div style={{ position: 'relative', ...style }}>
      {canLeft && (
        <button
          type="button"
          aria-label="Cuộn tab sang trái"
          onClick={() => scrollBy(-1)}
          style={{
            ...arrow,
            left: 0,
            // Phần đặc phải phủ kín chỗ mũi tên đứng, phần còn lại mới chuyển mờ,
            // nếu không chữ của tab sẽ lòi ra dưới biểu tượng
            background:
              'linear-gradient(to right, var(--surface-app) 0, var(--surface-app) 78%, transparent 100%)',
          }}
        >
          <ChevronLeft size={18} />
        </button>
      )}

      <div
        ref={ref}
        className="scrollbar-none"
        style={{
          display: 'flex',
          gap: 8,
          flexWrap: 'nowrap',
          overflowX: 'auto',
          borderBottom: '1px solid var(--border-base)',
          scrollbarWidth: 'none',
        }}
      >
        {children}
      </div>

      {canRight && (
        <button
          type="button"
          aria-label="Cuộn tab sang phải"
          onClick={() => scrollBy(1)}
          style={{
            ...arrow,
            right: 0,
            background:
              'linear-gradient(to left, var(--surface-app) 0, var(--surface-app) 78%, transparent 100%)',
          }}
        >
          <ChevronRight size={18} />
        </button>
      )}
    </div>
  );
}
