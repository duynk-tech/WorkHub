'use client';

import { useEffect } from 'react';
import { RefreshCw, ServerCrash } from 'lucide-react';
import { StatusScreen } from '@/components/ui/status-screen';
import './globals.css';

/** Lỗi ở chính layout gốc — thay cả trang, nên tự dựng <html>/<body> và nạp CSS. */
export default function GlobalError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    console.error('[GlobalError]', error);
  }, [error]);

  return (
    <html lang="vi">
      <body>
        <StatusScreen
          alert
          tone="danger"
          icon={<ServerCrash size={20} />}
          eyebrow="Lỗi 500"
          title="Hệ thống tạm thời gián đoạn"
          description="Có lỗi xảy ra khi mở ứng dụng. Bạn thử tải lại trang; nếu vẫn không được, gửi mã bên dưới cho quản trị viên để được hỗ trợ nhanh."
          code={error.digest}
        >
          <button type="button" className="btn btn-primary" onClick={reset}>
            <RefreshCw /> Tải lại
          </button>
          <a href="/dashboard" className="btn btn-secondary">Về Tổng quan</a>
        </StatusScreen>
      </body>
    </html>
  );
}
