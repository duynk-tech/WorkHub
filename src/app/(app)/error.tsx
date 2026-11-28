'use client';

import { useEffect } from 'react';
import Link from 'next/link';
import { Home, RefreshCw, ServerCrash } from 'lucide-react';
import { StatusScreen } from '@/components/ui/status-screen';

/** Lỗi khi dựng một trang bên trong khung app — sidebar/topbar vẫn giữ nguyên để người dùng đi tiếp. */
export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[AppError]', error);
  }, [error]);

  return (
    <StatusScreen
      fullPage={false}
      alert
      tone="danger"
      icon={<ServerCrash size={20} />}
      eyebrow="Lỗi 500"
      title="Trang này đang gặp sự cố"
      description="Hệ thống chưa tải được nội dung. Dữ liệu của bạn không bị ảnh hưởng — hãy thử lại sau giây lát. Nếu vẫn lỗi, gửi mã bên dưới cho quản trị viên."
      code={error.digest}
    >
      <button type="button" className="btn btn-primary" onClick={reset}>
        <RefreshCw /> Thử lại
      </button>
      <Link href="/dashboard" className="btn btn-secondary">
        <Home /> Về Tổng quan
      </Link>
    </StatusScreen>
  );
}
