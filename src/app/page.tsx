import { redirect } from 'next/navigation';
import { getAuthContext } from '@/server/auth/context';

export default async function RootPage() {
  const ctx = await getAuthContext();
  redirect(ctx ? '/dashboard' : '/login');
}
