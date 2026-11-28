import Link from 'next/link';
import { Home, MapPinOff } from 'lucide-react';
import { StatusScreen } from '@/components/ui/status-screen';
import { BackButton } from '@/components/ui/back-button';
import { getAppBranding } from '@/server/modules/settings/branding';

export const metadata = { title: 'Không tìm thấy trang' };

export default async function NotFound() {
  const branding = await getAppBranding().catch(() => ({ name: 'WorkHub', logoUrl: null, logoText: 'W' }));
  return (
    <StatusScreen
      brand={{ name: branding.name, logoUrl: branding.logoUrl, logoText: branding.logoText }}
      icon={<MapPinOff size={20} />}
      eyebrow="Lỗi 404"
      title="Không tìm thấy trang này"
      description="Đường dẫn có thể đã cũ, bị gõ nhầm, hoặc nội dung đã bị xoá. Nếu bạn nghĩ mình cần xem trang này, hãy nhờ quản trị viên kiểm tra quyền truy cập."
    >
      <Link href="/dashboard" className="btn btn-primary">
        <Home /> Về trang Tổng quan
      </Link>
      <BackButton />
    </StatusScreen>
  );
}
