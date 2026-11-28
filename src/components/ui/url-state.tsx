'use client';

import React, { useCallback, useEffect, useRef, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Pagination } from './pagination';
import { LIST_PAGE_SIZES } from '@/lib/list-query';

/**
 * Trạng thái danh sách nằm trên URL (lọc, sắp xếp, trang) để F5, chia sẻ link và
 * nút Back đều giữ nguyên. Đổi bất kỳ bộ lọc nào cũng đưa về trang 1, trừ khi
 * chính tham số được đổi là `page`.
 */
export function useUrlParams() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [isPending, startTransition] = useTransition();

  const setParams = useCallback(
    (next: Record<string, string | number | null | undefined>, opts: { replace?: boolean } = {}) => {
      const params = new URLSearchParams(searchParams.toString());
      for (const [k, v] of Object.entries(next)) {
        if (v === null || v === undefined || v === '') params.delete(k);
        else params.set(k, String(v));
      }
      if (!('page' in next)) params.delete('page');
      const qs = params.toString();
      const url = qs ? `${pathname}?${qs}` : pathname;
      startTransition(() => {
        if (opts.replace) router.replace(url, { scroll: false });
        else router.push(url, { scroll: false });
      });
    },
    [pathname, router, searchParams],
  );

  const get = useCallback((k: string) => searchParams.get(k) ?? '', [searchParams]);

  return { setParams, get, isPending, searchParams };
}

/** Ô tìm kiếm tự đẩy lên URL sau khi ngừng gõ (mặc định 300ms). */
export function useDebouncedSearch(param = 'q', delay = 300) {
  const { setParams, get } = useUrlParams();
  const urlValue = get(param);
  const [value, setValue] = useState(urlValue);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const lastPushed = useRef(urlValue);

  // URL đổi từ ngoài (Back, xoá lọc) thì ô nhập chạy theo
  useEffect(() => {
    if (urlValue !== lastPushed.current) {
      lastPushed.current = urlValue;
      setValue(urlValue);
    }
  }, [urlValue]);

  const onChange = useCallback(
    (v: string) => {
      setValue(v);
      if (timer.current) clearTimeout(timer.current);
      timer.current = setTimeout(() => {
        lastPushed.current = v.trim();
        setParams({ [param]: v.trim() }, { replace: true });
      }, delay);
    },
    [delay, param, setParams],
  );

  useEffect(() => () => { if (timer.current) clearTimeout(timer.current); }, []);

  return { value, onChange };
}

/** Thanh phân trang cho danh sách phân trang phía server, trạng thái nằm trên URL. */
export function UrlPagination({
  total,
  page,
  pageSize,
  unit,
  style,
}: {
  total: number;
  page: number;
  pageSize: number;
  unit?: string;
  style?: React.CSSProperties;
}) {
  const { setParams } = useUrlParams();
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  // Pagination gọi setPageSize rồi setPage(1) liền nhau; lần setPage đó đọc URL cũ
  // nên sẽ ghi đè mất size vừa chọn. Đổi size đã tự về trang 1, bỏ qua lần gọi kế tiếp.
  const skipNextPage = useRef(false);
  return (
    <Pagination
      page={page}
      setPage={(p) => {
        if (skipNextPage.current) {
          skipNextPage.current = false;
          return;
        }
        setParams({ page: p > 1 ? p : null });
      }}
      pageSize={pageSize}
      setPageSize={(n) => {
        skipNextPage.current = true;
        setParams({ size: n === 20 ? null : n });
      }}
      total={total}
      totalPages={totalPages}
      offset={(page - 1) * pageSize}
      unit={unit}
      style={style}
      pageSizeOptions={LIST_PAGE_SIZES}
    />
  );
}
