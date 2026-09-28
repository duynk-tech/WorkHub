import { redirect } from 'next/navigation';
import { PageHeader } from '@/components/ui';
import { InventoryReportPanel } from '@/components/domain/inventory-report-panel';
import { requireAuth, can } from '@/server/auth/context';
import { getDisabledReportKeys } from '@/server/modules/report/config';
import { getCompanyInfo } from '@/server/modules/settings/branding';

export const dynamic = 'force-dynamic';
export const metadata = { title: 'Báo cáo doanh thu' };

export default async function InventoryReportPage() {
  const ctx = await requireAuth();
  const [disabledReports, companyInfo] = await Promise.all([
    getDisabledReportKeys(),
    getCompanyInfo(),
  ]);
  if (!can(ctx, 'FEATURE_REPORT_INVENTORY') || disabledReports.includes('sales-inventory')) {
    redirect('/reports');
  }

  return (
    <div className="stack reports-content">
      <PageHeader
        title="Báo cáo doanh thu"
        description="Theo dõi doanh thu thiết bị và phụ tùng, chiết khấu, VAT, giá vốn và lợi nhuận theo kỳ"
      />
      <InventoryReportPanel companyInfo={JSON.parse(JSON.stringify(companyInfo))} />
    </div>
  );
}
