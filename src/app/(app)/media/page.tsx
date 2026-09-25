import { redirect } from 'next/navigation';
import { requireAuth, can } from '@/server/auth/context';
import { MediaScreen } from './media-screen';

export const dynamic = 'force-dynamic';

export const metadata = {
  title: 'Thư viện Media | WorkHub',
  description: 'Quản lý tập trung hình ảnh, tài liệu và tệp tải lên hệ thống',
};

export default async function MediaPage() {
  const ctx = await requireAuth();

  const canView =
    can(ctx, 'MENU_EQUIPMENT') ||
    can(ctx, 'MENU_SETTINGS') ||
    can(ctx, 'FEATURE_EQUIPMENT_MANAGE') ||
    can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') ||
    can(ctx, 'FEATURE_SETTING_GENERAL') ||
    ctx.isAdmin;

  if (!canView) {
    redirect('/dashboard');
  }

  return <MediaScreen />;
}
