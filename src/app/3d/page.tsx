import { getAuthContext } from '@/server/auth/context';
import { loadSpace3DData } from '@/server/modules/space3d/service';
import { Space3DExperience } from '@/components/space3d/space-3d-experience';

export const metadata = {
  title: 'TIM Space — Showroom & Café ảo (Beta)',
  description: 'TIM Space: tham quan showroom thiết bị, quán cà phê, văn phòng và kho hàng ảo của TIM Corp',
};

export const dynamic = 'force-dynamic';

export default async function Space3DPage({
  searchParams,
}: {
  searchParams: Promise<{ scene?: string }>;
}) {
  const [ctx, sp] = await Promise.all([getAuthContext(), searchParams]);
  const data = await loadSpace3DData(ctx, sp.scene ?? null);
  return <Space3DExperience data={data} />;
}
