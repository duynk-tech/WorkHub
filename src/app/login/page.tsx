import { redirect } from 'next/navigation';
import { getAuthContext } from '@/server/auth/context';
import { prisma } from '@/lib/prisma';
import { LoginForm } from './login-form';
import { getAppBranding } from '@/server/modules/settings/branding';

export const metadata = { title: 'Đăng nhập' };

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const ctx = await getAuthContext();
  if (ctx) redirect('/dashboard');

  const { next } = await searchParams;

  // Chưa có tài khoản nào → chuyển sang trình cài đặt
  const userCount = await prisma.user.count().catch(() => -1);
  if (userCount === 0) redirect('/install');

  const branding = await getAppBranding();
  return (
    <LoginForm
      appName={branding.name}
      logoUrl={branding.logoUrl}
      logoText={branding.logoText}
      next={next}
    />
  );
}
