import { redirect } from 'next/navigation';
import { checkInstallStatus } from '@/server/modules/setup/actions';
import { InstallWizard } from './install-wizard';

export const metadata = { title: 'Cài đặt hệ thống' };
export const dynamic = 'force-dynamic';

export default async function InstallPage() {
  const status = await checkInstallStatus();
  if (status.ok && status.installed) redirect('/login');

  return (
    <InstallWizard
      databaseOk={status.ok}
      databaseError={status.error}
      appName={process.env.APP_NAME || 'WorkHub'}
    />
  );
}
