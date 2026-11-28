'use client';

import { ArrowLeft } from 'lucide-react';

/** Quay lại trang trước; mở thẳng link (không có lịch sử) thì về Tổng quan. */
export function BackButton({ fallback = '/dashboard', label = 'Quay lại' }: { fallback?: string; label?: string }) {
  return (
    <button
      type="button"
      className="btn btn-secondary"
      onClick={() => {
        if (window.history.length > 1) window.history.back();
        else window.location.assign(fallback);
      }}
    >
      <ArrowLeft /> {label}
    </button>
  );
}
