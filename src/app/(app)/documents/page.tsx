import { requireAuth } from '@/server/auth/context';
import { listDocuments } from '@/server/modules/settings/documents';
import { DocumentScreen } from './document-screen';

export const metadata = { title: 'Sổ chứng từ' };
export const dynamic = 'force-dynamic';

export default async function DocumentsPage() {
  await requireAuth();
  const data = await listDocuments({ pageSize: 30 });

  return <DocumentScreen initialData={JSON.parse(JSON.stringify(data))} />;
}
