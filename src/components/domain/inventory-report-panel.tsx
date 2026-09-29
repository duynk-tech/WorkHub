'use client';

import React, { useEffect, useMemo, useState } from 'react';
import { Card, Button, Field, Input, SearchInput, Select } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { FileDown, Printer, Search } from 'lucide-react';
import { getInventoryReportAction } from '@/server/modules/spare-parts/actions';

type Preset = 'MONTH' | 'QUARTER' | 'YEAR' | 'CUSTOM';
type ReportLine = {
  kind: 'Phụ tùng' | 'Thiết bị'; orderCode: string; orderDate: string; customerName: string;
  itemCode: string; name: string; unit: string; quantity: number; unitPrice: number;
  discount: number; revenue: number; baseCost: number | null; shippingCost: number | null;
  otherCost: number | null; cogs: number | null; grossProfit: number | null; costKnown: boolean;
};
type CompanyInfo = { name?: string; address?: string; phone?: string; taxCode?: string };
const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));
const today = () => new Date().toISOString().slice(0, 10);
const normalizeSearch = (value: unknown) => String(value ?? '').toLowerCase().normalize('NFD').replace(/[\u0300-\u036f]/g, '').replace(/đ/g, 'd').trim();
const money = (value: number | null) => value == null ? '—' : `${fmt(value)} ₫`;

export function InventoryReportPanel({ companyInfo }: { companyInfo?: CompanyInfo }) {
  const toast = useToast();
  const [preset, setPreset] = useState<Preset>('MONTH');
  const [anchor, setAnchor] = useState(today());
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [search, setSearch] = useState('');
  const [kind, setKind] = useState<'ALL' | 'Phụ tùng' | 'Thiết bị'>('ALL');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(25);
  const [loading, setLoading] = useState(false);
  const [report, setReport] = useState<any>(null);

  const load = async () => {
    setLoading(true);
    const res = await getInventoryReportAction({ preset, anchor, from, to });
    setLoading(false);
    if (res.ok) setReport(res.report); else toast.error(res.message);
  };
  useEffect(() => { load(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [preset, anchor, from, to]);

  const lines: ReportLine[] = useMemo(() => {
    if (!report) return [];
    const parts: ReportLine[] = (report.salesDetails || []).map((d: any) => ({
      kind: 'Phụ tùng', orderCode: d.orderCode, orderDate: d.orderDate, customerName: d.customerName,
      itemCode: d.itemCode, name: d.name, unit: d.unit || '', quantity: d.quantity,
      unitPrice: d.unitPrice, discount: d.discount, revenue: d.revenue,
      baseCost: d.breakdownComplete ? d.baseCost : null,
      shippingCost: d.breakdownComplete ? d.shippingCost : null,
      otherCost: d.breakdownComplete ? d.otherCost : null,
      cogs: d.cogs, grossProfit: d.grossProfit, costKnown: true,
    }));
    const machines: ReportLine[] = (report.machineSalesDetails || []).map((d: any) => ({
      kind: 'Thiết bị', orderCode: d.orderCode, orderDate: d.orderDate, customerName: d.customerName,
      itemCode: d.key, name: d.name, unit: 'cái', quantity: d.quantity,
      unitPrice: d.unitPrice, discount: d.discount, revenue: d.revenue,
      baseCost: d.breakdownComplete ? d.baseCost : null,
      shippingCost: d.breakdownComplete ? d.shippingCost : null,
      otherCost: d.breakdownComplete ? d.otherCost : null,
      cogs: d.costKnown ? d.cogs : null, grossProfit: d.costKnown ? d.grossProfit : null, costKnown: d.costKnown,
    }));
    return [...parts, ...machines].sort((a, b) => b.orderDate.localeCompare(a.orderDate) || a.orderCode.localeCompare(b.orderCode) || a.name.localeCompare(b.name));
  }, [report]);

  const filtered = useMemo(() => {
    const q = normalizeSearch(search);
    return lines.filter((line) => (kind === 'ALL' || line.kind === kind) && (!q || [line.orderCode, line.customerName, line.itemCode, line.name, line.kind].some((v) => normalizeSearch(v).includes(q))));
  }, [lines, search, kind]);
  useEffect(() => { setPage(1); }, [search, kind, pageSize]);
  const pageCount = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, pageCount);
  const shown = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);
  const sum = (key: keyof ReportLine) => filtered.reduce((total, row) => total + (typeof row[key] === 'number' ? row[key] as number : 0), 0);
  const costLines = filtered.filter((row) => row.kind === 'Phụ tùng' || row.kind === 'Thiết bị');
  const costComponentsKnown = costLines.length > 0 && costLines.every((row) => row.baseCost != null);
  const unknownMachineCost = filtered.filter((row) => row.kind === 'Thiết bị' && !row.costKnown).length;

  const handleExport = () => {
    const params = new URLSearchParams({ preset, anchor });
    if (preset === 'CUSTOM') { params.set('from', from); params.set('to', to); }
    window.location.assign(`/api/inventory-report/export?${params.toString()}`);
  };

  const th: React.CSSProperties = { padding: '10px 9px', whiteSpace: 'nowrap', textAlign: 'right', fontSize: 11, lineHeight: 1.2 };
  const textTh: React.CSSProperties = { ...th, textAlign: 'left' };
  const td: React.CSSProperties = { padding: '9px', whiteSpace: 'nowrap', textAlign: 'right', fontVariantNumeric: 'tabular-nums', fontSize: 12 };
  const textTd: React.CSSProperties = { ...td, textAlign: 'left' };

  return <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
    <Card className="no-print" style={{ padding: '12px 14px' }}>
      <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' }}>
        <div style={{ width: 165 }}><Field label="Kỳ báo cáo"><Select value={preset} onChange={(e) => setPreset(e.target.value as Preset)}>
          <option value="MONTH">Theo tháng</option><option value="QUARTER">Theo quý</option><option value="YEAR">Theo năm</option><option value="CUSTOM">Khoảng thời gian</option>
        </Select></Field></div>
        {preset === 'CUSTOM' ? <>
          <div style={{ width: 155 }}><Field label="Từ ngày"><Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} /></Field></div>
          <div style={{ width: 155 }}><Field label="Đến ngày"><Input type="date" value={to} onChange={(e) => setTo(e.target.value)} /></Field></div>
        </> : <div style={{ width: 175 }}><Field label="Ngày trong kỳ"><Input type="date" value={anchor} onChange={(e) => setAnchor(e.target.value)} /></Field></div>}
        {report && <div style={{ alignSelf: 'center', fontSize: 12, color: 'var(--text-muted)', padding: '0 4px' }}>
          <strong style={{ color: 'var(--text-strong)' }}>{report.range.label}</strong> · {new Date(report.range.from).toLocaleDateString('vi-VN')} – {new Date(report.range.to).toLocaleDateString('vi-VN')}
        </div>}
        <div style={{ flex: 1 }} />
        <Button variant="secondary" onClick={() => window.print()} disabled={!report}><Printer size={15} style={{ marginRight: 6 }} />Xuất PDF</Button>
        <Button variant="secondary" onClick={handleExport} disabled={!report}><FileDown size={15} style={{ marginRight: 6 }} />Xuất Excel</Button>
      </div>
    </Card>

    <Card style={{ padding: 0, overflow: 'hidden' }}>
      <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '12px 14px', borderBottom: '1px solid var(--border-base)', flexWrap: 'wrap' }}>
        <div style={{ fontWeight: 700, fontSize: 13.5, color: 'var(--text-strong)' }}>Sổ doanh thu theo giao dịch <span style={{ marginLeft: 6, color: 'var(--text-muted)', fontWeight: 500, fontSize: 12 }}>({fmt(filtered.length)} dòng)</span></div>
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
          <div style={{ width: 150 }}><Select aria-label="Lọc loại mặt hàng" value={kind} onChange={(e) => setKind(e.target.value as typeof kind)}>
            <option value="ALL">Tất cả mặt hàng</option><option value="Phụ tùng">Phụ tùng</option><option value="Thiết bị">Thiết bị</option>
          </Select></div>
          <div style={{ width: 280, maxWidth: '70vw' }}><SearchInput aria-label="Tìm giao dịch" placeholder="Mã đơn, khách hàng, mặt hàng…" value={search} onChange={(e) => setSearch(e.target.value)} /></div>
        </div>
      </div>
      {loading ? <div style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}>Đang tổng hợp giao dịch…</div> : !report ? <div style={{ padding: 32, textAlign: 'center' }}>Chưa có dữ liệu báo cáo.</div> : <>
        <div className="inventory-report-scroll" style={{ maxHeight: 'min(68vh, 760px)' }}>
          <table className="table table-compact revenue-ledger" style={{ minWidth: 2040, tableLayout: 'fixed' }}>
            <colgroup>{[135,105,230,100,150,330,65,140,135,150,140,130,130,155,155].map((width, i) => <col key={i} style={{ width }} />)}</colgroup>
            <thead><tr>
              <th style={textTh}>Mã đơn</th><th style={th}>Ngày</th><th style={textTh}>Khách hàng</th><th style={textTh}>Loại</th><th style={textTh}>Mã hàng</th><th style={textTh}>Tên hàng</th>
              <th style={th}>SL</th><th style={th}>Đơn giá bán</th><th style={th}>Chiết khấu</th><th style={th}>Doanh thu thuần</th><th style={th}>Tiền hàng vốn</th><th style={th}>Cước mua</th><th style={th}>Phí mua khác</th><th style={th}>Tổng giá vốn</th><th style={th}>Lợi nhuận gộp</th>
            </tr></thead>
            <tbody>{shown.length === 0 ? <tr><td colSpan={15} style={{ padding: 32, textAlign: 'center', color: 'var(--text-muted)' }}><Search size={16} style={{ verticalAlign: 'middle', marginRight: 6 }} />Không có giao dịch khớp bộ lọc</td></tr> : shown.map((line, i) => <tr key={`${line.orderCode}-${line.kind}-${line.itemCode}-${i}`}>
              <td style={{ ...textTd, color: 'var(--brand)', fontWeight: 700 }}>{line.orderCode}</td>
              <td style={td}>{new Date(`${line.orderDate}T00:00:00`).toLocaleDateString('vi-VN')}</td>
              <td style={{ ...textTd, whiteSpace: 'normal' }}>{line.customerName}</td>
              <td style={textTd}>{line.kind}</td><td style={{ ...textTd, color: 'var(--brand)' }}>{line.itemCode}</td>
              <td style={{ ...textTd, whiteSpace: 'normal' }}>{line.name}</td><td style={td}>{fmt(line.quantity)} {line.unit}</td>
              <td style={td}>{money(line.unitPrice)}</td><td style={td}>{line.discount ? `−${money(line.discount)}` : '—'}</td>
              <td style={{ ...td, fontWeight: 650 }}>{money(line.revenue)}</td><td style={td}>{money(line.baseCost)}</td><td style={td}>{money(line.shippingCost)}</td><td style={td}>{money(line.otherCost)}</td>
              <td style={td} title={!line.costKnown ? 'Chưa có giá vốn thiết bị' : line.kind === 'Phụ tùng' && !costComponentsKnown ? 'Một số phiếu cũ không có tách chi phí' : undefined}>{money(line.cogs)}</td>
              <td style={{ ...td, fontWeight: 650, color: line.grossProfit == null ? 'var(--text-muted)' : line.grossProfit < 0 ? '#dc2626' : '#15803d' }}>{money(line.grossProfit)}</td>
            </tr>)}</tbody>
            {filtered.length > 0 && <tfoot><tr style={{ background: 'var(--surface-sunken)', fontWeight: 700, borderTop: '2px solid var(--border-base)' }}>
              <td colSpan={6} style={{ ...textTd, position: 'sticky', left: 0, zIndex: 2, background: 'var(--surface-sunken)' }}>Tổng {fmt(filtered.length)} dòng đang lọc</td><td style={td}>{fmt(sum('quantity'))}</td><td style={td}>—</td><td style={td}>{money(sum('discount'))}</td><td style={td}>{money(sum('revenue'))}</td>
              <td style={td}>{costComponentsKnown ? money(sum('baseCost')) : '—'}</td><td style={td}>{costComponentsKnown ? money(sum('shippingCost')) : '—'}</td><td style={td}>{costComponentsKnown ? money(sum('otherCost')) : '—'}</td><td style={td}>{unknownMachineCost ? 'Chưa đủ' : money(sum('cogs'))}</td><td style={td}>{unknownMachineCost ? 'Chưa đủ' : money(sum('grossProfit'))}</td>
            </tr></tfoot>}
          </table>
        </div>
        <div className="no-print" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, padding: '9px 14px', borderTop: '1px solid var(--border-base)', fontSize: 12, color: 'var(--text-muted)', flexWrap: 'wrap' }}>
          <span>{filtered.length ? `Dòng ${(currentPage - 1) * pageSize + 1}–${Math.min(currentPage * pageSize, filtered.length)} / ${fmt(filtered.length)}` : '0 dòng'}</span>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span>Dòng/trang</span><Select value={pageSize} onChange={(e) => setPageSize(Number(e.target.value))} style={{ width: 78 }}><option value={25}>25</option><option value={50}>50</option><option value={100}>100</option></Select>
            <Button size="sm" variant="secondary" disabled={currentPage <= 1} onClick={() => setPage((p) => p - 1)}>Trước</Button><span>{currentPage}/{pageCount}</span><Button size="sm" variant="secondary" disabled={currentPage >= pageCount} onClick={() => setPage((p) => p + 1)}>Sau</Button>
          </div>
        </div>
        <div className="no-print" style={{ padding: '8px 14px', fontSize: 11.5, color: 'var(--text-muted)', borderTop: '1px solid var(--border-subtle)' }}>
          Doanh thu thuần = đơn giá × số lượng − chiết khấu, chưa gồm VAT. Giá vốn đã gồm chi phí mua được lưu tại thời điểm xuất; dấu “—” nghĩa là dữ liệu cũ không lưu chi tiết khoản đó. Cước giao khách và VAT theo dõi riêng.
        </div>
      </>}
    </Card>

    {report && <section className="inventory-report-print">
      <header className="inventory-report-print-header"><div><div className="inventory-report-print-company">{companyInfo?.name || 'Đơn vị lập báo cáo'}</div>{companyInfo?.address && <div>{companyInfo.address}</div>}<div>{[companyInfo?.phone && `Điện thoại: ${companyInfo.phone}`, companyInfo?.taxCode && `MST: ${companyInfo.taxCode}`].filter(Boolean).join(' · ')}</div></div>
        <div className="inventory-report-print-meta"><h1>BÁO CÁO DOANH THU</h1><div>Kỳ {report.range.label}: {report.range.from} – {report.range.to}</div><div>Ngày xuất: {new Date().toLocaleDateString('vi-VN')}</div></div></header>
      <table className="inventory-report-print-table"><thead><tr><th>Mã đơn</th><th>Ngày</th><th>Khách hàng</th><th>Loại</th><th>Mã hàng</th><th>Tên hàng</th><th>SL</th><th>Đơn giá</th><th>Chiết khấu</th><th>Doanh thu thuần</th><th>Tiền hàng vốn</th><th>Cước mua</th><th>Phí khác</th><th>Tổng giá vốn</th><th>Lợi nhuận gộp</th></tr></thead>
        <tbody>{filtered.map((line, i) => <tr key={`print-${line.orderCode}-${line.kind}-${i}`}><td>{line.orderCode}</td><td>{line.orderDate}</td><td>{line.customerName}</td><td>{line.kind}</td><td>{line.itemCode}</td><td>{line.name}</td><td className="numeric">{fmt(line.quantity)}</td><td className="numeric">{money(line.unitPrice)}</td><td className="numeric">{money(line.discount)}</td><td className="numeric">{money(line.revenue)}</td><td className="numeric">{money(line.baseCost)}</td><td className="numeric">{money(line.shippingCost)}</td><td className="numeric">{money(line.otherCost)}</td><td className="numeric">{money(line.cogs)}</td><td className="numeric">{money(line.grossProfit)}</td></tr>)}</tbody>
        <tfoot><tr><td colSpan={9}>TỔNG CỘNG · {filtered.length} dòng</td><td className="numeric">{money(sum('revenue'))}</td><td colSpan={3}></td><td className="numeric">{unknownMachineCost ? 'Chưa đủ' : money(sum('cogs'))}</td><td className="numeric">{unknownMachineCost ? 'Chưa đủ' : money(sum('grossProfit'))}</td></tr></tfoot>
      </table><p className="inventory-report-print-definition">Doanh thu thuần chưa gồm VAT. Giá vốn gồm chi phí mua được ghi nhận. Cước giao khách và VAT theo dõi riêng.</p>
    </section>}
  </div>;
}
