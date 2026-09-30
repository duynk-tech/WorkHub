import { redirect } from 'next/navigation';

export const metadata = { title: 'Báo cáo' };
export const dynamic = 'force-dynamic';

export default async function ReportsPage({
  searchParams,
}: {
  searchParams: Promise<{ tab?: string; month?: string; from?: string; to?: string; year?: string }>;
}) {
  const sp = await searchParams;
  const params = new URLSearchParams({ tab: 'reports' });
  for (const key of ['report', 'month', 'from', 'to', 'year'] as const) {
    if (sp[key]) params.set(key, sp[key]!);
  }
  redirect(`/dashboard?${params.toString()}`);
}
