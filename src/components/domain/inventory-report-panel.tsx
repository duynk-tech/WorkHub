'use client';

import React, { useEffect, useState } from 'react';
import { Card, Button, Field, Input, SearchInput, Select } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { FileDown, TrendingUp, Package, Receipt, ShoppingCart, Percent, Printer, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  getInventoryReportAction,
} from '@/server/modules/spare-parts/actions';

/** Báo cáo doanh thu thiết bị và phụ tùng theo kỳ. */

type Preset = 'MONTH' | 'QUARTER' | 'YEAR' | 'CUSTOM';

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));
const today = () => new Date().toISOString().slice(0, 10);
const normalizeSearch = (value: unknown) => String(value ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .trim();

type CompanyInfo = { name?: string; address?: string; phone?: string; taxCode?: string };

export function InventoryReportPanel({ companyInfo }: { companyInfo?: CompanyInfo }) {
  const toast = useToast();
  const [preset, setPreset] = useState<Preset>('MONTH');
  const [anchor, setAnchor] = useState(today());
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [itemSearch, setItemSearch] = useState('');
  const [showPartDetails, setShowPartDetails] = useState(false);
  const [showMachineDetails, setShowMachineDetails] = useState(false);
  const [partDetailsPage, setPartDetailsPage] = useState(1);
  const [machineDetailsPage, setMachineDetailsPage] = useState(1);
  const [detailPageSize, setDetailPageSize] = useState(25);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    const res = await getInventoryReportAction({ preset, anchor, from, to });
    setLoading(false);
    if (res.ok) setReport(res.report);
    else toast.error(res.message);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [preset, anchor, from, to]);

  const handleExport = async () => {
    const params = new URLSearchParams({ preset, anchor });
    if (preset === 'CUSTOM') {
      params.set('from', from);
      params.set('to', to);
    }
    window.location.assign(`/api/inventory-report/export?${params.toString()}`);
  };

  const handleExportPdf = () => window.print();

  const s = report?.summary;
  const searchTerm = normalizeSearch(itemSearch);
  const visibleItems = (report?.items ?? []).filter((item: any) => {
    if (!searchTerm) return true;
    return [item.itemCode, item.name, item.unit]
      .some((value) => normalizeSearch(value).includes(searchTerm));
  });
  const visibleSalesDetails = (report?.salesDetails ?? []).filter((detail: any) => {
    if (!searchTerm) return true;
    return [detail.itemCode, detail.name]
      .some((value) => normalizeSearch(value).includes(searchTerm));
  });
  const visibleMachineSalesDetails = (report?.machineSalesDetails ?? []).filter((machine: any) =>
    !searchTerm || [machine.key, machine.name]
      .some((value) => normalizeSearch(value).includes(searchTerm)),
  );
  const visibleMachineSales = (report?.machineSales ?? []).filter((machine: any) =>
    !searchTerm || [machine.key, machine.name].some((value) => normalizeSearch(value).includes(searchTerm)),
  );
  const sumField = (rows: any[], key: string) => rows.reduce((sum, row) => sum + (Number(row[key]) || 0), 0);
  const salesBreakdownComplete = visibleSalesDetails.every((detail: any) => detail.breakdownComplete);
  const itemBreakdownComplete = visibleItems.every((item: any) => !item.soldQty || item.cogsBreakdownComplete);
  const machineCostsComplete = visibleMachineSalesDetails.every((machine: any) => machine.costKnown);
  const partDetailsPageCount = Math.max(1, Math.ceil(visibleSalesDetails.length / detailPageSize));
  const machineDetailsPageCount = Math.max(1, Math.ceil(visibleMachineSalesDetails.length / detailPageSize));
  const currentPartDetailsPage = Math.min(partDetailsPage, partDetailsPageCount);
  const currentMachineDetailsPage = Math.min(machineDetailsPage, machineDetailsPageCount);
  const pageSalesDetails = visibleSalesDetails.slice((currentPartDetailsPage - 1) * detailPageSize, currentPartDetailsPage * detailPageSize);
  const pageMachineSalesDetails = visibleMachineSalesDetails.slice((currentMachineDetailsPage - 1) * detailPageSize, currentMachineDetailsPage * detailPageSize);
  let trendBucketMode: 'day' | 'week' | 'month' = 'day';
  const revenueTrend = (() => {
    if (!report) return [];
    const fromMs = Date.parse(`${report.range.from}T00:00:00Z`);
    const toMs = Date.parse(`${report.range.to}T00:00:00Z`);
    const rangeDays = Math.max(1, Math.round((toMs - fromMs) / 86400000) + 1);
    const bucketMode = rangeDays > 180 ? 'month' : rangeDays > 60 ? 'week' : 'day';
    trendBucketMode = bucketMode;
    const buckets = new Map<string, { label: string; revenue: number }>();
    const detailLines = [
      ...(report.salesDetails || []),
      ...(report.machineSalesDetails || []),
    ];
    for (const detail of detailLines) {
      const date = new Date(`${detail.orderDate}T00:00:00`);
      if (Number.isNaN(date.getTime())) continue;
      if (bucketMode === 'month') {
        const key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        const current = buckets.get(key) || { label: date.toLocaleDateString('vi-VN', { month: 'short', year: '2-digit' }), revenue: 0 };
        current.revenue += Number(detail.revenue) || 0;
        buckets.set(key, current);
      } else if (bucketMode === 'week') {
        const weekStart = new Date(date);
        weekStart.setDate(date.getDate() - ((date.getDay() + 6) % 7));
        const key = `${weekStart.getFullYear()}-${String(weekStart.getMonth() + 1).padStart(2, '0')}-${String(weekStart.getDate()).padStart(2, '0')}`;
        const current = buckets.get(key) || { label: weekStart.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }), revenue: 0 };
        current.revenue += Number(detail.revenue) || 0;
        buckets.set(key, current);
      } else {
        const key = detail.orderDate;
        const current = buckets.get(key) || { label: date.toLocaleDateString('vi-VN', { day: '2-digit', month: '2-digit' }), revenue: 0 };
        current.revenue += Number(detail.revenue) || 0;
        buckets.set(key, current);
      }
    }
    return [...buckets.entries()].sort(([a], [b]) => a.localeCompare(b)).map(([key, bucket]) => ({ key, ...bucket }));
  })();
  const maxTrendRevenue = Math.max(1, ...revenueTrend.map((point: any) => point.revenue));

  const cards = s
    ? [
        {
          label: 'Doanh thu thuần',
          value: `${fmt(s.revenue + (s.machineRevenue || 0))} ₫`,
          sub: `Phụ tùng ${fmt(s.revenue)} ₫ · Máy móc ${fmt(s.machineRevenue || 0)} ₫`,
          title: 'Doanh thu hàng hóa sau chiết khấu, chưa gồm VAT và cước giao hàng thu khách.',
          color: '#0f766e',
          bg: '#f0fdfa',
          icon: TrendingUp,
        },
        {
          label: 'Đơn bán hàng',
          value: fmt(s.orderCount || 0),
          sub: `Phụ tùng ${fmt(s.soldQty)} · Máy móc ${fmt(s.machineQty || 0)}`,
          color: '#2563eb',
          bg: '#eff6ff',
          icon: ShoppingCart,
        },
        {
          label: 'Chiết khấu',
          value: `${fmt(s.discount + (s.machineDiscount || 0))} ₫`,
          sub: 'Đã trừ khỏi doanh thu thuần',
          color: '#b45309',
          bg: '#fffbeb',
          icon: Percent,
        },
        {
          label: 'VAT thu hộ',
          value: `${fmt(s.vatAmount || 0)} ₫`,
          sub: 'Thu từ khách, không tính vào doanh thu/lợi nhuận',
          color: '#2563eb',
          bg: '#eff6ff',
          icon: Receipt,
        },
        {
          label: 'Giá vốn đã ghi nhận',
          value: `${fmt(s.cogs + (s.machineCogs || 0))} ₫`,
          sub: `Phụ tùng ${fmt(s.cogs)} ₫ · Máy móc ${s.machineCostQty || 0}/${s.machineQty || 0} có giá vốn`,
          title: 'Giá vốn phụ tùng theo snapshot phiếu xuất; giá vốn máy theo hồ sơ thiết bị.',
          color: '#d97706',
          bg: '#fffbeb',
          icon: Package,
        },
        {
          label: 'Lợi nhuận đã ghi nhận',
          value: (s.machineMissingCostQty || 0) > 0
            ? 'Chưa đủ giá vốn máy'
            : `${fmt(s.recognizedProfit ?? s.netProfit)} ₫`,
          sub: (s.machineMissingCostQty || 0) > 0
            ? `Thiếu giá vốn ${s.machineMissingCostQty} máy; chưa thể chốt lợi nhuận`
            : 'Sau giá vốn và chi phí xuất kho khác; chưa gồm vận hành/giao hàng',
          title: `Doanh thu thuần trừ giá vốn máy (${s.machineCostQty || 0}/${s.machineQty || 0} máy có giá vốn), giá vốn phụ tùng và chi phí xuất kho ngoài bán.`,
          color: (s.machineMissingCostQty || 0) > 0
            ? '#d97706'
            : (s.recognizedProfit ?? s.netProfit) >= 0 ? '#16a34a' : '#dc2626',
          bg: (s.machineMissingCostQty || 0) > 0
            ? '#fffbeb'
            : (s.recognizedProfit ?? s.netProfit) >= 0 ? '#f0fdf4' : '#fef2f2',
          icon: TrendingUp,
        },
      ]
    : [];

  const th: React.CSSProperties = { padding: '10px 12px', whiteSpace: 'normal', lineHeight: 1.25, textAlign: 'center' };
  const td: React.CSSProperties = { padding: '9px 12px', whiteSpace: 'nowrap', textAlign: 'center', fontVariantNumeric: 'tabular-nums' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* Chọn kỳ */}
      <Card style={{ padding: 14 }}>
        <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
          <div style={{ width: 180 }}>
            <Field label="Kỳ báo cáo">
              <Select value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
                <option value="MONTH">Theo tháng</option>
                <option value="QUARTER">Theo quý</option>
                <option value="YEAR">Theo năm</option>
                <option value="CUSTOM">Khoảng thời gian cụ thể</option>
              </Select>
            </Field>
          </div>

          {preset === 'CUSTOM' ? (
            <React.Fragment key="custom-range">
              <div style={{ width: 170 }}>
                <Field label="Từ ngày">
                  <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
                </Field>
              </div>
              <div style={{ width: 170 }}>
                <Field label="Đến ngày">
                  <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} />
                </Field>
              </div>
            </React.Fragment>
          ) : (
            <div style={{ width: 190 }}>
              <Field label="Ngày bất kỳ trong kỳ">
                <Input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} />
              </Field>
            </div>
          )}

          {/* Kỳ đang xem nằm ngay cạnh ô chọn, không xuống dòng riêng */}
          {report && (
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', paddingBottom: 8 }}>
              Kỳ <strong style={{ color: 'var(--text-strong)' }}>{report.range.label}</strong> ·{' '}
              {new Date(report.range.from).toLocaleDateString('vi-VN')} –{' '}
              {new Date(report.range.to).toLocaleDateString('vi-VN')} · {s?.orderCount || 0} đơn bán · {s?.transactionCount || 0} phiếu kho
            </div>
          )}

          <div style={{ flex: 1 }} />

          <Button variant="secondary" onClick={handleExportPdf} disabled={!report}>
            <Printer size={15} style={{ marginRight: 6 }} /> Xuất PDF
          </Button>

          <Button variant="secondary" onClick={handleExport} disabled={!report}>
            <FileDown size={15} style={{ marginRight: 6 }} /> Xuất Excel
          </Button>
        </div>
      </Card>

      {loading && (
        <Card style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Đang tổng hợp số liệu…</Card>
      )}

      {!loading && report && (
        <>
          <section className="inventory-report-print" aria-label="Bản in báo cáo doanh thu">
            <header className="inventory-report-print-header">
              <div>
                <div className="inventory-report-print-company">{companyInfo?.name || 'Đơn vị lập báo cáo'}</div>
                {companyInfo?.address && <div>{companyInfo.address}</div>}
                <div>
                  {[companyInfo?.phone && `Điện thoại: ${companyInfo.phone}`, companyInfo?.taxCode && `MST: ${companyInfo.taxCode}`]
                    .filter(Boolean).join(' · ')}
                </div>
              </div>
              <div className="inventory-report-print-meta">
                <h1>BÁO CÁO DOANH THU THIẾT BỊ &amp; PHỤ TÙNG</h1>
                <div>Kỳ: {report.range.label} ({new Date(report.range.from).toLocaleDateString('vi-VN')} – {new Date(report.range.to).toLocaleDateString('vi-VN')})</div>
                <div>Ngày xuất: {new Date().toLocaleDateString('vi-VN')}</div>
              </div>
            </header>
            <div className="inventory-report-print-kpis">
              <div><span>Doanh thu thuần</span><strong>{fmt(s.revenue + (s.machineRevenue || 0))} ₫</strong></div>
              <div><span>Chiết khấu</span><strong>{fmt(s.discount + (s.machineDiscount || 0))} ₫</strong></div>
              <div><span>Tổng giá vốn</span><strong>{fmt(s.cogs + (s.machineCogs || 0))} ₫</strong></div>
              <div><span>Lợi nhuận sau chi phí xuất kho khác</span><strong>{(s.machineMissingCostQty || 0) > 0 ? 'Chưa đủ giá vốn máy' : `${fmt(s.recognizedProfit ?? s.netProfit)} ₫`}</strong></div>
            </div>
            <p className="inventory-report-print-definition">
              Doanh thu thuần = giá bán − chiết khấu, chưa gồm VAT. Giá vốn = tiền hàng + cước/phí mua đã phân bổ theo snapshot (nếu dữ liệu có).
              Lợi nhuận gộp = doanh thu thuần − giá vốn; lợi nhuận sau chi phí đã ghi nhận còn trừ chi phí xuất kho ngoài bán. VAT và cước giao hàng thu khách được đối soát riêng, không tính là doanh thu hàng hóa.
              Báo cáo chưa gồm chi phí giao hàng thực tế và chi phí vận hành nếu hệ thống chưa ghi nhận các khoản này.
            </p>
            <h2>Tổng hợp doanh thu theo phụ tùng</h2>
            <table className="inventory-report-print-table">
              <thead><tr>
                <th>Mã hàng</th><th>Tên phụ tùng</th><th>ĐVT</th><th>SL bán</th><th>Chiết khấu</th><th>Doanh thu thuần</th><th>Tiền hàng vốn</th><th>Cước mua</th><th>Phí mua khác</th><th>Tổng giá vốn</th><th>Lợi nhuận gộp</th><th>Tỷ suất</th>
              </tr></thead>
              <tbody>{report.items.filter((item: any) => item.soldQty > 0).map((item: any) => <tr key={`print-part-${item.itemId}`}>
                <td>{item.itemCode}</td><td>{item.name}</td><td>{item.unit || '—'}</td><td className="numeric">{fmt(item.soldQty)}</td>
                <td className="numeric">{item.discount ? fmt(item.discount) : '—'}</td><td className="numeric">{fmt(item.revenue)}</td>
                <td className="numeric">{item.cogsBreakdownComplete ? fmt(item.cogsBaseCost || 0) : '—'}</td><td className="numeric">{item.cogsBreakdownComplete ? fmt(item.cogsShippingCost || 0) : '—'}</td><td className="numeric">{item.cogsBreakdownComplete ? fmt(item.cogsOtherCost || 0) : '—'}</td>
                <td className="numeric">{fmt(item.cogs)}</td><td className="numeric">{fmt(item.grossProfit)}</td><td className="numeric">{item.marginPercent}%</td>
              </tr>)}</tbody>
              {report.items.some((item: any) => item.soldQty > 0) && <tfoot><tr>
                <td colSpan={3}>TỔNG CỘNG ({report.items.filter((item: any) => item.soldQty > 0).length} mặt hàng)</td>
                <td className="numeric">{fmt(sumField(report.items, 'soldQty'))}</td>
                <td className="numeric">{fmt(sumField(report.items, 'discount'))}</td><td className="numeric">{fmt(sumField(report.items, 'revenue'))}</td>
                <td className="numeric">{report.items.filter((item: any) => item.soldQty > 0).every((item: any) => item.cogsBreakdownComplete) ? fmt(sumField(report.items, 'cogsBaseCost')) : '—'}</td>
                <td className="numeric">{report.items.filter((item: any) => item.soldQty > 0).every((item: any) => item.cogsBreakdownComplete) ? fmt(sumField(report.items, 'cogsShippingCost')) : '—'}</td>
                <td className="numeric">{report.items.filter((item: any) => item.soldQty > 0).every((item: any) => item.cogsBreakdownComplete) ? fmt(sumField(report.items, 'cogsOtherCost')) : '—'}</td>
                <td className="numeric">{fmt(sumField(report.items, 'cogs'))}</td><td className="numeric">{fmt(sumField(report.items, 'grossProfit'))}</td><td>—</td>
              </tr></tfoot>}
            </table>
            {report.machineSales?.length > 0 && <>
              <h2>Tổng hợp doanh thu theo thiết bị</h2>
              <table className="inventory-report-print-table">
                <thead><tr><th>Mã thiết bị</th><th>Tên thiết bị / model</th><th>SL</th><th>Đơn giá bán bình quân</th><th>Chiết khấu</th><th>Doanh thu thuần</th><th>Giá vốn</th><th>Lợi nhuận gộp</th><th>Tình trạng giá vốn</th></tr></thead>
                <tbody>{report.machineSales.map((machine: any) => <tr key={`print-machine-${machine.key}`}>
                  <td>{machine.key}</td><td>{machine.name}</td><td className="numeric">{fmt(machine.quantity)}</td><td className="numeric">{fmt(machine.unitPrice)}</td>
                  <td className="numeric">{machine.discount ? fmt(machine.discount) : '—'}</td><td className="numeric">{fmt(machine.revenue)}</td>
                  <td className="numeric">{machine.costKnown ? fmt(machine.cogs) : '—'}</td><td className="numeric">{machine.costKnown ? fmt(machine.grossProfit) : '—'}</td><td>{machine.costKnown ? 'Đủ giá vốn' : 'Thiếu giá vốn'}</td>
                </tr>)}</tbody>
                {report.machineSales.length > 0 && <tfoot><tr>
                  <td colSpan={2}>TỔNG CỘNG ({report.machineSales.length} thiết bị)</td><td className="numeric">{fmt(sumField(report.machineSales, 'quantity'))}</td><td></td>
                  <td className="numeric">{fmt(sumField(report.machineSales, 'discount'))}</td><td className="numeric">{fmt(sumField(report.machineSales, 'revenue'))}</td>
                  <td className="numeric">{report.machineSales.every((machine: any) => machine.costKnown) ? fmt(sumField(report.machineSales, 'cogs')) : '—'}</td>
                  <td className="numeric">{report.machineSales.every((machine: any) => machine.costKnown) ? fmt(sumField(report.machineSales, 'grossProfit')) : '—'}</td><td>{report.machineSales.every((machine: any) => machine.costKnown) ? 'Đủ giá vốn' : 'Có máy thiếu giá vốn'}</td>
                </tr></tfoot>}
              </table>
            </>}
            <p className="inventory-report-print-definition">Bản PDF này tổng hợp theo mã hàng, không liệt kê từng đơn. Xuất Excel để xem chi tiết giao dịch và đối chiếu từng phiếu.</p>
            <footer className="inventory-report-print-footer">
              <span>VAT thu hộ: {fmt(s.vatAmount || 0)} ₫</span>
              <span>Cước giao hàng thu khách: {fmt(s.customerShippingFee || 0)} ₫</span>
              <span>Chi phí xuất kho khác: {fmt(s.nonSaleCost || 0)} ₫</span>
              <span>Người lập: ____________________</span>
            </footer>
          </section>
          {/* Tổng hợp */}
          <div className="inventory-report-kpis" style={{ display: 'grid', gap: 12 }}>
            {cards.map((c) => (
              <Card key={c.label} style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center', minHeight: 104 }}>
                <div
                  style={{
                    width: 40,
                    height: 40,
                    borderRadius: 10,
                    background: c.bg,
                    color: c.color,
                    display: 'grid',
                    placeItems: 'center',
                    flexShrink: 0,
                  }}
                >
                  <c.icon size={19} />
                </div>
                <div style={{ minWidth: 0, flex: 1 }} title={c.title}>
                  <div style={{ fontSize: 17, lineHeight: 1.25, fontWeight: 800, color: c.color, overflowWrap: 'anywhere' }}>{c.value}</div>
                  <div style={{ fontSize: 12, lineHeight: 1.35, color: 'var(--text-muted)', fontWeight: 600, marginTop: 3 }}>{c.label}</div>
                  <div style={{ fontSize: 11, lineHeight: 1.4, color: 'var(--text-faint, var(--text-muted))', marginTop: 2 }}>{c.sub}</div>
                </div>
              </Card>
            ))}
          </div>

          <Card style={{ padding: '11px 15px', borderLeft: '3px solid #2563eb' }}>
            <div style={{ fontSize: 12.5, lineHeight: 1.55, color: 'var(--text-muted)' }}>
              <strong style={{ color: 'var(--text-strong)' }}>Cách tính:</strong>{' '}
              Doanh thu thuần = giá bán − chiết khấu; lợi nhuận gộp = doanh thu thuần − tổng giá vốn.
              Tổng giá vốn đã bao gồm tiền hàng, cước mua và phí mua khác đã phân bổ nên không trừ các khoản này lần thứ hai.
              VAT và cước giao hàng thu khách được theo dõi riêng; cước giao thực tế và chi phí vận hành chỉ được tính khi có dữ liệu ghi nhận.
            </div>
          </Card>

          <Card className="no-print" style={{ padding: '16px 18px' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'baseline', gap: 12, flexWrap: 'wrap', marginBottom: 14 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: 'var(--text-strong)' }}>Xu hướng doanh thu</div>
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 3 }}>Doanh thu thuần theo {trendBucketMode === 'month' ? 'tháng' : trendBucketMode === 'week' ? 'tuần' : 'ngày'}</div>
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>Tổng kỳ <strong style={{ color: 'var(--text-strong)' }}>{fmt(s.revenue + (s.machineRevenue || 0))} ₫</strong></div>
            </div>
            {revenueTrend.length === 0 ? (
              <div style={{ padding: '28px 12px', textAlign: 'center', color: 'var(--text-muted)', fontSize: 12.5 }}>Chưa có doanh thu trong kỳ</div>
            ) : (
              <div style={{ overflowX: 'auto', paddingBottom: 4 }}>
                <div style={{ minWidth: Math.max(100, revenueTrend.length * 28), height: 150, display: 'flex', alignItems: 'stretch', gap: 8, borderBottom: '1px solid var(--border-base)', padding: '4px 4px 0' }}>
                  {revenueTrend.map((point: any, index: number) => (
                    <div key={point.key} title={`${point.label}: ${fmt(point.revenue)} ₫`} style={{ flex: 1, minWidth: 18, display: 'flex', flexDirection: 'column', justifyContent: 'flex-end', alignItems: 'center', gap: 6 }}>
                      <div style={{ width: 'min(100%, 34px)', height: `${Math.max(3, (point.revenue / maxTrendRevenue) * 112)}px`, borderRadius: '5px 5px 0 0', background: 'linear-gradient(180deg, #60a5fa, #2563eb)' }} />
                      <span
                        style={{
                          height: 18,
                          whiteSpace: 'nowrap',
                          fontSize: 10,
                          color: 'var(--text-muted)',
                          visibility: revenueTrend.length <= 14 || index % Math.ceil(revenueTrend.length / 10) === 0 || index === revenueTrend.length - 1 ? 'visible' : 'hidden',
                        }}
                      >{point.label}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </Card>

          {/* Bóc tách thuế & Giảm trừ doanh thu theo chuẩn kế toán */}
          {(s.vatAmount > 0 || s.discount > 0 || s.machineDiscount > 0 || s.customerShippingFee > 0 || s.returnedAmount > 0) && (
            <Card style={{ padding: '12px 16px' }}>
              <div
                style={{
                  fontSize: 12.5,
                  fontWeight: 600,
                  color: 'var(--text-muted)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: 6,
                }}
              >
                <span style={{ fontWeight: 700, color: 'var(--text-strong)' }}>Đối soát doanh thu và khoản thu</span>
                <span>
                  Tổng giá trị đơn sau điều chỉnh:{' '}
                  <strong style={{ color: 'var(--brand)', fontWeight: 700 }} title="Doanh thu thuần + VAT thu hộ + cước thu khách − hàng trả lại; không đồng nghĩa số tiền đã thu">
                    {fmt(s.revenue + (s.machineRevenue || 0) + (s.vatAmount || 0) + (s.customerShippingFee || 0) - (s.returnedAmount || 0))} ₫
                  </strong>
                </span>
              </div>
              <div style={{ display: 'flex', gap: '4px 18px', flexWrap: 'wrap', alignItems: 'center', marginTop: 6 }}>
                {s.vatAmount > 0 && (
                  <span
                    style={{ fontSize: 12.5, color: '#1d4ed8', fontWeight: 600 }}
                    title="Thuế GTGT đầu ra thu từ khách hàng, không tính vào doanh thu để nộp thuế TNDN"
                  >
                    VAT thu hộ <strong>{fmt(s.vatAmount)} ₫</strong>
                  </span>
                )}
                {(s.discount + (s.machineDiscount || 0)) > 0 && (
                  <span
                    style={{
                      display: 'inline-block',
                      fontSize: 12.5,
                      color: 'var(--text-base)',
                    }}
                    title="Chiết khấu thương mại đã giảm trừ trực tiếp vào giá bán"
                  >
                    Chiết khấu: <strong>−{fmt(s.discount + (s.machineDiscount || 0))} ₫</strong>
                  </span>
                )}
                {(s.revenue + (s.machineRevenue || 0)) > 0 && (
                  <span style={{ fontSize: 12.5, color: 'var(--text-base)' }} title="Doanh thu thuần cộng chiết khấu">
                    Doanh thu trước chiết khấu: <strong>{fmt(s.revenue + (s.machineRevenue || 0) + s.discount + (s.machineDiscount || 0))} ₫</strong>
                  </span>
                )}
                <span style={{ fontSize: 12.5, color: 'var(--text-base)' }} title="Doanh thu đã trừ chiết khấu, chưa gồm VAT và cước giao hàng thu khách">
                  Doanh thu thuần: <strong>{fmt(s.revenue + (s.machineRevenue || 0))} ₫</strong>
                </span>
                {s.customerShippingFee > 0 && (
                  <span style={{ fontSize: 12.5, color: 'var(--text-base)' }} title="Cước giao hàng thu khách; được tách riêng, chưa cộng vào doanh thu mặt hàng và lợi nhuận">
                    Cước thu khách: <strong>{fmt(s.customerShippingFee)} ₫</strong>
                  </span>
                )}
                {s.returnedAmount > 0 && (
                  <span
                    style={{
                      display: 'inline-block',
                      fontSize: 12.5,
                      color: 'var(--text-base)',
                    }}
                    title="Giá trị hàng bán bị khách trả lại"
                  >
                    Hàng trả lại: <strong>−{fmt(s.returnedAmount)} ₫</strong>
                  </span>
                )}
              </div>
            </Card>
          )}

          {(s.nonSaleCost > 0 || report.costByReason.length > 0) && (
            <Card style={{ padding: '12px 16px' }}>
              <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>Chi phí xuất kho ngoài bán hàng</div>
              <div style={{ display: 'flex', gap: '6px 20px', flexWrap: 'wrap', alignItems: 'center', marginTop: 8 }}>
                {report.costByReason.map((reason: any) => (
                  <span key={reason.code} style={{ fontSize: 12.5, color: 'var(--text-base)' }}>
                    {reason.label}: <strong>{reason.qty} · {fmt(reason.value)} ₫</strong>
                  </span>
                ))}
                {s.nonSaleCost > 0 && (
                  <span style={{ fontSize: 12.5, color: 'var(--text-base)' }} title="Khoản này đã được trừ trong lợi nhuận sau chi phí ghi nhận">
                    Tổng chi phí xuất khác: <strong>−{fmt(s.nonSaleCost)} ₫</strong>
                  </span>
                )}
              </div>
              <div style={{ marginTop: 6, fontSize: 11.5, color: 'var(--text-muted)' }}>Chưa bao gồm chi phí vận hành và cước giao hàng thực tế nếu chưa được ghi nhận riêng.</div>
            </Card>
          )}

          {/* Tổng hợp theo phụ tùng */}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-strong)' }}>
                Tổng hợp theo phụ tùng ({visibleItems.length}{itemSearch ? `/${report.items.length}` : ''})
                <div style={{ marginTop: 3, fontSize: 11.5, fontWeight: 400, color: 'var(--text-muted)' }}>
                  Cộng dồn theo mã hàng từ từng đơn trong kỳ; chiết khấu và giá vốn lấy theo dữ liệu đã lưu của từng lần bán.
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', minWidth: 'min(100%, 330px)' }}>
                <div style={{ width: 290, maxWidth: '100%' }}>
                  <SearchInput
                    aria-label="Tìm mặt hàng hoặc máy trong báo cáo"
                    placeholder="Tìm mã hoặc tên hàng, máy…"
                    value={itemSearch}
                    onChange={(event) => setItemSearch(event.target.value)}
                  />
                </div>
                {itemSearch && (
                  <Button size="sm" variant="ghost" onClick={() => setItemSearch('')}>
                    Xóa
                  </Button>
                )}
                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                  Cố định mã & tên hàng · Cuộn để xem số liệu
                </div>
              </div>
            </div>
            <div className="inventory-report-scroll">
              <table className="table table-compact inventory-report-grid" style={{ minWidth: 2629, fontSize: 12.5 }}>
                <colgroup>
                  <col style={{ width: 164 }} />
                  <col style={{ width: 340 }} />
                  <col style={{ width: 70 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 125 }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 135 }} />
                  <col style={{ width: 180 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 120 }} />
                  <col style={{ width: 200 }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 85 }} />
                  <col style={{ width: 100 }} />
                  <col style={{ width: 170 }} />
                  <col style={{ width: 90 }} />
                </colgroup>
                <thead>
                  <tr
                    style={{
                      background: 'var(--surface-sunken)',
                      borderTop: '1px solid var(--border-base)',
                      borderBottom: '1px solid var(--border-base)',
                      color: 'var(--text-muted)',
                      fontSize: 11.5,
                      fontWeight: 700,
                    }}
                  >
                    <th className="report-sticky-code" style={{ ...th, textAlign: 'left' }}>Mã hàng</th>
                    <th className="report-sticky-name" style={{ ...th, textAlign: 'left' }}>Tên hàng</th>
                    <th style={th}>ĐVT</th>
                    <th style={th} title="Tổng số lượng nhập kho trong kỳ">SL nhập</th>
                    <th style={th} title="Tổng giá trị hàng nhập trong kỳ">Giá trị nhập</th>
                    <th style={th} title="SL bán ra từ đơn bán hàng">SL bán</th>
                    <th style={th} title="Giá bán bình quân trước khi trừ chiết khấu">Giá bán</th>
                    <th style={th} title="Chiết khấu đơn hàng được phân bổ theo từng mặt hàng khi lưu đơn">Chiết khấu</th>
                    <th style={th} title="Doanh thu thuần (đã trừ chiết khấu dòng, từ chi tiết đơn bán hàng)">Doanh thu thuần</th>
                    <th style={{ ...th, whiteSpace: 'nowrap' }} title="Giá vốn bình quân mỗi đơn vị, gồm giá hàng, cước phí và phí khác">Giá vốn/cái</th>
                    <th style={{ ...th, whiteSpace: 'nowrap' }} title="Tiền mua hàng chưa gồm cước phí và phí khác, lấy từ snapshot phiếu xuất">Tiền hàng</th>
                    <th style={{ ...th, whiteSpace: 'nowrap' }} title="Cước mua phân bổ vào hàng đã bán; phiếu xuất cũ chưa lưu chi tiết sẽ để trống">Cước mua</th>
                    <th style={{ ...th, whiteSpace: 'nowrap' }} title="Phí mua khác phân bổ vào hàng đã bán; phiếu xuất cũ chưa lưu chi tiết sẽ để trống">Phí mua khác</th>
                    <th style={{ ...th, whiteSpace: 'nowrap' }} title="Tổng giá vốn = tiền hàng + cước mua + phí mua khác; các khoản này không được trừ lặp lại">Tổng giá vốn</th>
                    <th style={th} title="Lợi nhuận gộp = doanh thu thuần − tổng giá vốn">Lợi nhuận gộp</th>
                    <th style={th} title="Tỷ suất lợi nhuận gộp = lợi nhuận gộp ÷ doanh thu thuần">Tỷ suất</th>
                    <th style={th} title="Số lượng xuất không phải giao dịch bán">SL xuất khác</th>
                    <th style={th} title="Giá vốn của hàng xuất bảo hành, hủy hoặc lý do khác">Chi phí xuất khác</th>
                    <th style={th} title="Tồn kho hiện tại">Tồn</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.length === 0 ? (
                    <tr>
                      <td colSpan={19} style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                        {itemSearch ? `Không tìm thấy mặt hàng “${itemSearch}”` : 'Kỳ này chưa có phát sinh nhập xuất kho'}
                      </td>
                    </tr>
                  ) : (
                    visibleItems.map((r: any) => (
                      <tr key={r.itemId} style={{ borderBottom: '1px solid var(--border-base)' }}>
                        <td className="report-sticky-code" style={{ ...td, textAlign: 'left', fontFamily: 'monospace', color: 'var(--brand)', fontSize: 11.5, fontWeight: 700 }}>
                          {r.itemCode}
                        </td>
                        <td className="report-sticky-name" style={{ ...td, textAlign: 'left', whiteSpace: 'normal', fontWeight: 600, lineHeight: 1.4 }}>
                          {r.name}
                        </td>
                        <td style={td}>{r.unit || '—'}</td>
                        <td style={td}>{r.inQty || '—'}</td>
                        <td style={td}>{r.inValue ? fmt(r.inValue) : '—'}</td>
                        <td style={td}>{r.soldQty ? fmt(r.soldQty) : '—'}</td>
                        <td style={td}>
                          {r.avgSellPrice ? (
                            <span style={{ color: '#0f766e', fontWeight: 600 }}>{fmt(r.avgSellPrice)}</span>
                          ) : '—'}
                        </td>
                        <td style={td}>
                          {r.discount > 0 ? (
                            <span style={{ color: '#b91c1c' }}>−{fmt(r.discount)}</span>
                          ) : '—'}
                        </td>
                        <td style={td}>{r.revenue ? fmt(r.revenue) : '—'}</td>
                        <td style={td}>
                          {r.actualUnitCost > 0 ? (
                            <span style={{ color: 'var(--text-muted)', fontSize: 11.5 }}>{fmt(r.actualUnitCost)}</span>
                          ) : '—'}
                        </td>
                        <td style={td}>{r.soldQty && r.cogsBreakdownComplete ? fmt(r.cogsBaseCost || 0) : ''}</td>
                        <td style={td}>{r.soldQty && r.cogsBreakdownComplete ? fmt(r.cogsShippingCost || 0) : ''}</td>
                        <td style={td}>{r.soldQty && r.cogsBreakdownComplete ? fmt(r.cogsOtherCost || 0) : ''}</td>
                        <td style={td}>
                          {r.cogs ? (
                            <div
                              title={r.cogsBreakdownComplete
                                ? `Tiền hàng: ${fmt(r.cogsBaseCost || 0)} ₫ · Cước: ${fmt(r.cogsShippingCost || 0)} ₫ · Phí khác: ${fmt(r.cogsOtherCost || 0)} ₫`
                                : 'Phiếu xuất cũ chưa lưu tách riêng giá hàng, cước phí và phí khác'}
                            >
                              <div style={{ fontWeight: 600 }}>{fmt(r.cogs)}</div>
                            </div>
                          ) : '—'}
                        </td>
                        <td style={{ ...td, fontWeight: 700, color: r.grossProfit >= 0 ? '#16a34a' : '#dc2626' }}>
                          {r.soldQty ? fmt(r.grossProfit) : '—'}
                        </td>
                        <td style={td}>{r.soldQty ? `${r.marginPercent}%` : '—'}</td>
                        <td style={td}>{r.nonSaleQty || '—'}</td>
                        <td style={td}>{r.nonSaleCost ? fmt(r.nonSaleCost) : '—'}</td>
                        <td style={td}>{r.closingStock}</td>
                      </tr>
                    ))
                  )}
                </tbody>
                {visibleItems.length > 0 && <tfoot>
                  <tr style={{ background: 'var(--surface-sunken)', borderTop: '2px solid var(--border-base)', fontWeight: 700 }}>
                    <td className="report-sticky-code" colSpan={2} style={{ ...td, textAlign: 'left' }}>Tổng {visibleItems.length} mặt hàng</td>
                    <td style={td}>—</td>
                    <td style={td}>{fmt(sumField(visibleItems, 'inQty'))}</td>
                    <td style={td}>{fmt(sumField(visibleItems, 'inValue'))} ₫</td>
                    <td style={td}>{fmt(sumField(visibleItems, 'soldQty'))}</td>
                    <td style={td}>—</td>
                    <td style={td}>{fmt(sumField(visibleItems, 'discount'))} ₫</td>
                    <td style={td}>{fmt(sumField(visibleItems, 'revenue'))} ₫</td>
                    <td style={td}>—</td>
                    <td style={td}>{itemBreakdownComplete ? `${fmt(sumField(visibleItems, 'cogsBaseCost'))} ₫` : '—'}</td>
                    <td style={td}>{itemBreakdownComplete ? `${fmt(sumField(visibleItems, 'cogsShippingCost'))} ₫` : '—'}</td>
                    <td style={td}>{itemBreakdownComplete ? `${fmt(sumField(visibleItems, 'cogsOtherCost'))} ₫` : '—'}</td>
                    <td style={td}>{fmt(sumField(visibleItems, 'cogs'))} ₫</td>
                    <td style={td}>{fmt(sumField(visibleItems, 'grossProfit'))} ₫</td>
                    <td style={td}>—</td>
                    <td style={td}>{fmt(sumField(visibleItems, 'nonSaleQty'))}</td>
                    <td style={td}>{fmt(sumField(visibleItems, 'nonSaleCost'))} ₫</td>
                    <td style={td}>{fmt(sumField(visibleItems, 'closingStock'))}</td>
                  </tr>
                </tfoot>}
              </table>
            </div>
            <div style={{ padding: '8px 14px', fontSize: 11.5, color: 'var(--text-muted)' }}>
              Cước phí và phí khác là tổng phân bổ trên số lượng đã bán. Phiếu xuất cũ chưa lưu tách từng khoản sẽ để trống các cột chi tiết; tổng giá vốn vẫn giữ nguyên.
            </div>
          </Card>

          {/* Chi tiết giao dịch được nạp/render theo yêu cầu, không dồn cả kỳ lên màn hình. */}
          <Card className="no-print" style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border-base)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div>
                <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-strong)' }}>
                  Chi tiết bán theo từng đơn ({visibleSalesDetails.length}{itemSearch ? `/${report.salesDetails?.length || 0}` : ''})
                </div>
                <div style={{ marginTop: 3, fontSize: 11.5, color: 'var(--text-muted)' }}>
                  Mỗi dòng là một mặt hàng trong một đơn; giá vốn lấy theo snapshot của lần xuất.
                </div>
              </div>
              <Button size="sm" variant="secondary" onClick={() => setShowPartDetails((value) => !value)}>
                {showPartDetails ? 'Ẩn chi tiết' : `Xem chi tiết (${fmt(visibleSalesDetails.length)} dòng)`}
              </Button>
            </div>
            {showPartDetails && <>
            <div className="inventory-report-scroll">
              <table className="table table-compact" style={{ minWidth: 2270, fontSize: 12.5 }}>
                <colgroup>
                  <col style={{ width: 145 }} />
                  <col style={{ width: 110 }} />
                  <col style={{ width: 240 }} />
                  <col style={{ width: 155 }} />
                  <col style={{ width: 310 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 70 }} />
                  <col style={{ width: 135 }} />
                  <col style={{ width: 130 }} />
                  <col style={{ width: 145 }} />
                  <col style={{ width: 145 }} />
                  <col style={{ width: 145 }} />
                  <col style={{ width: 145 }} />
                  <col style={{ width: 145 }} />
                  <col style={{ width: 145 }} />
                </colgroup>
                <thead>
                  <tr style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border-base)', color: 'var(--text-muted)', fontSize: 11.5, fontWeight: 700 }}>
                    <th style={{ ...th, textAlign: 'left' }}>Mã đơn</th>
                    <th style={th}>Ngày</th>
                    <th style={{ ...th, textAlign: 'left' }}>Khách hàng</th>
                    <th style={{ ...th, textAlign: 'left' }}>Mã hàng</th>
                    <th style={{ ...th, textAlign: 'left' }}>Tên hàng</th>
                    <th style={th}>SL</th>
                    <th style={th}>ĐVT</th>
                    <th style={th} title="Đơn giá bán trước khi trừ chiết khấu">Đơn giá bán</th>
                    <th style={th}>Chiết khấu</th>
                    <th style={th} title="Doanh thu thuần = giá bán × số lượng − chiết khấu">Doanh thu thuần</th>
                    <th style={th} title="Phần giá hàng trong giá vốn đã lưu">Tiền hàng vốn</th>
                    <th style={th} title="Cước mua hàng phân bổ trong snapshot giá vốn">Cước mua</th>
                    <th style={th} title="Phí mua khác phân bổ trong snapshot giá vốn">Phí mua khác</th>
                    <th style={th}>Tổng giá vốn</th>
                    <th style={th} title="Lợi nhuận gộp = doanh thu thuần − tổng giá vốn">Lợi nhuận gộp</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleSalesDetails.length === 0 ? (
                    <tr><td colSpan={15} style={{ padding: 28, textAlign: 'center', color: 'var(--text-muted)' }}>
                      {itemSearch ? `Không tìm thấy giao dịch “${itemSearch}”` : 'Kỳ này chưa có đơn bán phụ tùng'}
                    </td></tr>
                  ) : pageSalesDetails.map((detail: any, index: number) => (
                    <tr key={`${detail.orderCode}-${detail.itemId}-${index}`} style={{ borderBottom: '1px solid var(--border-base)' }}>
                      <td style={{ ...td, textAlign: 'left', color: 'var(--brand)', fontWeight: 700 }}>{detail.orderCode}</td>
                      <td style={td}>{new Date(`${detail.orderDate}T00:00:00`).toLocaleDateString('vi-VN')}</td>
                      <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal' }}>{detail.customerName}</td>
                      <td style={{ ...td, textAlign: 'left', fontFamily: 'monospace', color: 'var(--brand)', fontSize: 11.5 }}>{detail.itemCode}</td>
                      <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal', fontWeight: 600 }}>{detail.name}</td>
                      <td style={td}>{fmt(detail.quantity)}</td>
                      <td style={td}>{detail.unit || '—'}</td>
                      <td style={td}>{fmt(detail.unitPrice)} ₫</td>
                      <td style={td}>{detail.discount > 0 ? `−${fmt(detail.discount)} ₫` : '—'}</td>
                      <td style={{ ...td, fontWeight: 600 }}>{fmt(detail.revenue)} ₫</td>
                      <td style={td}>{detail.breakdownComplete ? `${fmt(detail.baseCost || 0)} ₫` : '—'}</td>
                      <td style={td}>{detail.breakdownComplete ? `${fmt(detail.shippingCost || 0)} ₫` : '—'}</td>
                      <td style={td}>{detail.breakdownComplete ? `${fmt(detail.otherCost || 0)} ₫` : '—'}</td>
                      <td style={td} title={detail.breakdownComplete ? undefined : 'Phiếu xuất cũ chưa lưu tách chi phí'}>{fmt(detail.cogs)} ₫</td>
                      <td style={{ ...td, fontWeight: 700, color: detail.grossProfit >= 0 ? '#16a34a' : '#dc2626' }}>{fmt(detail.grossProfit)} ₫</td>
                    </tr>
                  ))}
                </tbody>
                {visibleSalesDetails.length > 0 && (
                  <tfoot>
                    <tr style={{ background: 'var(--surface-sunken)', borderTop: '2px solid var(--border-base)', fontWeight: 700 }}>
                      <td colSpan={5} style={{ ...td, textAlign: 'left' }}>Tổng {visibleSalesDetails.length} dòng trong kết quả lọc</td>
                      <td style={td}>{fmt(sumField(visibleSalesDetails, 'quantity'))}</td>
                      <td style={td}>—</td>
                      <td style={td}>—</td>
                      <td style={td}>{fmt(sumField(visibleSalesDetails, 'discount'))} ₫</td>
                      <td style={td}>{fmt(sumField(visibleSalesDetails, 'revenue'))} ₫</td>
                      <td style={td}>{salesBreakdownComplete ? `${fmt(sumField(visibleSalesDetails, 'baseCost'))} ₫` : '—'}</td>
                      <td style={td}>{salesBreakdownComplete ? `${fmt(sumField(visibleSalesDetails, 'shippingCost'))} ₫` : '—'}</td>
                      <td style={td}>{salesBreakdownComplete ? `${fmt(sumField(visibleSalesDetails, 'otherCost'))} ₫` : '—'}</td>
                      <td style={td}>{fmt(sumField(visibleSalesDetails, 'cogs'))} ₫</td>
                      <td style={td}>{fmt(sumField(visibleSalesDetails, 'grossProfit'))} ₫</td>
                    </tr>
                  </tfoot>
                )}
              </table>
            </div>
            {visibleSalesDetails.length > detailPageSize && <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '8px 14px' }}>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Hiển thị {(currentPartDetailsPage - 1) * detailPageSize + 1}–{Math.min(currentPartDetailsPage * detailPageSize, visibleSalesDetails.length)} / {fmt(visibleSalesDetails.length)}</span>
              <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>Dòng/trang
                <Select value={detailPageSize} onChange={(event) => setDetailPageSize(Number(event.target.value))} style={{ width: 78 }}>
                  <option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
                </Select>
              </label>
              <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Trang {currentPartDetailsPage}/{partDetailsPageCount}</span>
              <Button size="sm" variant="secondary" disabled={currentPartDetailsPage <= 1} onClick={() => setPartDetailsPage((page) => Math.max(1, page - 1))} aria-label="Trang trước"><ChevronLeft size={15} /></Button>
              <Button size="sm" variant="secondary" disabled={currentPartDetailsPage >= partDetailsPageCount} onClick={() => setPartDetailsPage((page) => Math.min(partDetailsPageCount, page + 1))} aria-label="Trang sau"><ChevronRight size={15} /></Button>
            </div>}
            <div style={{ padding: '8px 14px', fontSize: 11.5, color: 'var(--text-muted)' }}>
              Phiếu xuất cũ chưa lưu riêng tiền hàng, cước phí và phí khác sẽ để trống các cột đó; tổng giá vốn vẫn dùng số đã ghi nhận.
            </div>
            </>}
          </Card>

          {report.machineSales?.length > 0 && (
            <Card className="no-print" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '14px 16px', borderBottom: '1px solid var(--border-base)', fontWeight: 700 }}>
                Tổng hợp máy móc ({visibleMachineSales.length}{itemSearch ? `/${report.machineSales.length}` : ''})
              </div>
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', minWidth: 1040, borderCollapse: 'separate', borderSpacing: 0, fontSize: 12.5 }}>
                  <thead>
                    <tr style={{ background: 'var(--surface-sunken)', color: 'var(--text-muted)', fontSize: 11.5, fontWeight: 700 }}>
                      <th style={{ ...th, textAlign: 'left' }}>Mã máy</th>
                      <th style={{ ...th, textAlign: 'left' }}>Tên máy</th>
                      <th style={th}>SL bán</th>
                      <th style={th}>Đơn giá bán</th>
                      <th style={th}>Chiết khấu</th>
                      <th style={th}>Doanh thu thuần</th>
                      <th style={th} title="Giá vốn chốt trên hồ sơ máy khi bán">Giá vốn</th>
                    <th style={th}>Lợi nhuận gộp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleMachineSales.length === 0 ? (
                      <tr><td colSpan={8} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Không tìm thấy máy phù hợp</td></tr>
                    ) : visibleMachineSales.map((machine: any) => (
                        <tr key={machine.key} style={{ borderBottom: '1px solid var(--border-base)' }}>
                          <td style={{ ...td, textAlign: 'left', color: 'var(--brand)', fontFamily: 'monospace', fontWeight: 700 }}>{machine.key}</td>
                          <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal' }}>{machine.name}</td>
                          <td style={td}>{fmt(machine.quantity)}</td>
                          <td style={td}>{fmt(machine.unitPrice)} ₫</td>
                          <td style={td}>{machine.discount > 0 ? `−${fmt(machine.discount)} ₫` : '—'}</td>
                          <td style={{ ...td, fontWeight: 700 }}>{fmt(machine.revenue)} ₫</td>
                          <td style={td}>{machine.costKnown ? `${fmt(machine.cogs)} ₫` : '—'}</td>
                          <td style={{ ...td, fontWeight: 700, color: machine.costKnown && machine.grossProfit < 0 ? '#dc2626' : '#16a34a' }}>
                            {machine.costKnown ? `${fmt(machine.grossProfit)} ₫` : '—'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                  {visibleMachineSales.length > 0 && <tfoot>
                    <tr style={{ background: 'var(--surface-sunken)', borderTop: '2px solid var(--border-base)', fontWeight: 700 }}>
                      <td colSpan={2} style={{ ...td, textAlign: 'left' }}>Tổng {visibleMachineSales.length} thiết bị</td>
                      <td style={td}>{fmt(sumField(visibleMachineSales, 'quantity'))}</td>
                      <td style={td}>—</td>
                      <td style={td}>{fmt(sumField(visibleMachineSales, 'discount'))} ₫</td>
                      <td style={td}>{fmt(sumField(visibleMachineSales, 'revenue'))} ₫</td>
                      <td style={td}>{visibleMachineSales.every((machine: any) => machine.costKnown) ? `${fmt(sumField(visibleMachineSales, 'cogs'))} ₫` : '—'}</td>
                      <td style={td}>{visibleMachineSales.every((machine: any) => machine.costKnown) ? `${fmt(sumField(visibleMachineSales, 'grossProfit'))} ₫` : '—'}</td>
                    </tr>
                  </tfoot>}
                </table>
              </div>
              <div style={{ padding: '8px 14px', fontSize: 11.5, color: 'var(--text-muted)' }}>
                Giá vốn máy lấy từ hồ sơ máy tại thời điểm giao. Cước vận chuyển khách được lưu ở cấp đơn hàng; hệ thống chưa lưu cước mua và phí khác theo từng máy.
              </div>
            </Card>
          )}

          {report.machineSalesDetails?.length > 0 && (
            <Card className="no-print" style={{ padding: 0, overflow: 'hidden' }}>
              <div style={{ padding: '13px 16px', borderBottom: '1px solid var(--border-base)', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-strong)' }}>
                    Chi tiết bán máy móc theo từng đơn ({visibleMachineSalesDetails.length}{itemSearch ? `/${report.machineSalesDetails.length}` : ''})
                  </div>
                  <div style={{ marginTop: 3, fontSize: 11.5, color: 'var(--text-muted)' }}>
                    Mỗi dòng là một thiết bị trong một đơn; bảng chỉ hiển thị theo trang khi mở.
                  </div>
                </div>
                <Button size="sm" variant="secondary" onClick={() => setShowMachineDetails((value) => !value)}>
                  {showMachineDetails ? 'Ẩn chi tiết' : `Xem chi tiết (${fmt(visibleMachineSalesDetails.length)} dòng)`}
                </Button>
              </div>
              {showMachineDetails && <>
              <div className="inventory-report-scroll">
                <table className="table table-compact" style={{ minWidth: 1770, fontSize: 12.5 }}>
                  <colgroup>
                    <col style={{ width: 145 }} />
                    <col style={{ width: 110 }} />
                    <col style={{ width: 240 }} />
                    <col style={{ width: 155 }} />
                    <col style={{ width: 310 }} />
                    <col style={{ width: 80 }} />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 140 }} />
                    <col style={{ width: 155 }} />
                    <col style={{ width: 155 }} />
                    <col style={{ width: 155 }} />
                  </colgroup>
                  <thead>
                    <tr style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border-base)', color: 'var(--text-muted)', fontSize: 11.5, fontWeight: 700 }}>
                      <th style={{ ...th, textAlign: 'left' }}>Mã đơn</th>
                      <th style={th}>Ngày</th>
                      <th style={{ ...th, textAlign: 'left' }}>Khách hàng</th>
                      <th style={{ ...th, textAlign: 'left' }}>Mã máy</th>
                      <th style={{ ...th, textAlign: 'left' }}>Tên máy / model</th>
                      <th style={th}>SL</th>
                      <th style={th}>Đơn giá bán</th>
                      <th style={th}>Chiết khấu</th>
                      <th style={th}>Doanh thu thuần</th>
                      <th style={th}>Giá vốn</th>
                      <th style={th}>Lợi nhuận gộp</th>
                    </tr>
                  </thead>
                  <tbody>
                    {visibleMachineSalesDetails.length === 0 ? (
                      <tr><td colSpan={11} style={{ padding: 24, textAlign: 'center', color: 'var(--text-muted)' }}>Không tìm thấy giao dịch máy phù hợp</td></tr>
                    ) : pageMachineSalesDetails.map((machine: any, index: number) => (
                        <tr key={`${machine.orderCode}-${machine.key}-${index}`} style={{ borderBottom: '1px solid var(--border-base)' }}>
                          <td style={{ ...td, textAlign: 'left', color: 'var(--brand)', fontWeight: 700 }}>{machine.orderCode}</td>
                          <td style={td}>{new Date(`${machine.orderDate}T00:00:00`).toLocaleDateString('vi-VN')}</td>
                          <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal' }}>{machine.customerName}</td>
                          <td style={{ ...td, textAlign: 'left', color: 'var(--brand)', fontFamily: 'monospace' }}>{machine.key}</td>
                          <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal', fontWeight: 600 }}>{machine.name}</td>
                          <td style={td}>{fmt(machine.quantity)}</td>
                          <td style={td}>{fmt(machine.unitPrice)} ₫</td>
                          <td style={td}>{machine.discount > 0 ? `−${fmt(machine.discount)} ₫` : '—'}</td>
                          <td style={{ ...td, fontWeight: 600 }}>{fmt(machine.revenue)} ₫</td>
                          <td style={td}>{machine.costKnown ? `${fmt(machine.cogs)} ₫` : '—'}</td>
                          <td style={{ ...td, fontWeight: 700, color: machine.costKnown && machine.grossProfit < 0 ? '#dc2626' : '#16a34a' }}>
                            {machine.costKnown ? `${fmt(machine.grossProfit)} ₫` : '—'}
                          </td>
                        </tr>
                      ))}
                  </tbody>
                  {visibleMachineSalesDetails.length > 0 && (
                    <tfoot>
                      <tr style={{ background: 'var(--surface-sunken)', borderTop: '2px solid var(--border-base)', fontWeight: 700 }}>
                        <td colSpan={5} style={{ ...td, textAlign: 'left' }}>Tổng {visibleMachineSalesDetails.length} dòng trong kết quả lọc</td>
                        <td style={td}>{fmt(sumField(visibleMachineSalesDetails, 'quantity'))}</td>
                        <td style={td}>—</td>
                        <td style={td}>{fmt(sumField(visibleMachineSalesDetails, 'discount'))} ₫</td>
                        <td style={td}>{fmt(sumField(visibleMachineSalesDetails, 'revenue'))} ₫</td>
                        <td style={td}>{machineCostsComplete ? `${fmt(sumField(visibleMachineSalesDetails, 'cogs'))} ₫` : '—'}</td>
                        <td style={td}>{machineCostsComplete ? `${fmt(sumField(visibleMachineSalesDetails, 'grossProfit'))} ₫` : '—'}</td>
                      </tr>
                    </tfoot>
                  )}
                </table>
              </div>
              {visibleMachineSalesDetails.length > detailPageSize && <div style={{ display: 'flex', justifyContent: 'flex-end', alignItems: 'center', gap: 8, padding: '8px 14px' }}>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Hiển thị {(currentMachineDetailsPage - 1) * detailPageSize + 1}–{Math.min(currentMachineDetailsPage * detailPageSize, visibleMachineSalesDetails.length)} / {fmt(visibleMachineSalesDetails.length)}</span>
                <label style={{ display: 'flex', alignItems: 'center', gap: 6, fontSize: 12, color: 'var(--text-muted)' }}>Dòng/trang
                  <Select value={detailPageSize} onChange={(event) => setDetailPageSize(Number(event.target.value))} style={{ width: 78 }}>
                    <option value={25}>25</option><option value={50}>50</option><option value={100}>100</option>
                  </Select>
                </label>
                <span style={{ fontSize: 12, color: 'var(--text-muted)' }}>Trang {currentMachineDetailsPage}/{machineDetailsPageCount}</span>
                <Button size="sm" variant="secondary" disabled={currentMachineDetailsPage <= 1} onClick={() => setMachineDetailsPage((page) => Math.max(1, page - 1))} aria-label="Trang trước"><ChevronLeft size={15} /></Button>
                <Button size="sm" variant="secondary" disabled={currentMachineDetailsPage >= machineDetailsPageCount} onClick={() => setMachineDetailsPage((page) => Math.min(machineDetailsPageCount, page + 1))} aria-label="Trang sau"><ChevronRight size={15} /></Button>
              </div>}
              </>}
            </Card>
          )}
        </>
      )}
    </div>
  );
}
