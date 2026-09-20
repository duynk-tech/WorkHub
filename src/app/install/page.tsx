import { redirect } from 'next/navigation';
import { checkInstallStatus } from '@/server/modules/setup/actions';
import { getAppBranding } from '@/server/modules/settings/branding';
import { InstallWizard } from './install-wizard';

export const metadata = { title: 'Cài đặt hệ thống' };
export const dynamic = 'force-dynamic';

export default async function InstallPage() {
  const status = await checkInstallStatus();
  if (status.ok && status.installed) redirect('/login');

  const branding = await getAppBranding().catch(() => ({
    name: process.env.APP_NAME || 'WorkHub',
    logoUrl: null,
    logoText: 'W',
    description: '',
  }));

  return (
    <InstallWizard
      databaseOk={status.ok}
      databaseError={status.error}
      appName={branding.name}
      logoUrl={branding.logoUrl}
      logoText={branding.logoText}
    />
  );
}
