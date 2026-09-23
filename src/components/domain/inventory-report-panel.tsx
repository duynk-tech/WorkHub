'use client';

import React, { useEffect, useState } from 'react';
import { Card, Button, Field, Input, Select } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { FileDown, TrendingUp, TrendingDown, Package, AlertTriangle } from 'lucide-react';
import {
  getInventoryReportAction,
  exportInventoryReportCsvAction,
} from '@/server/modules/spare-parts/actions';

/** Báo cáo nhập – bán ra – giá vốn – lãi gộp của kho phụ tùng, theo kỳ. */

type Preset = 'MONTH' | 'QUARTER' | 'YEAR' | 'CUSTOM';

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));
const today = () => new Date().toISOString().slice(0, 10);

export function InventoryReportPanel() {
  const toast = useToast();
  const [preset, setPreset] = useState<Preset>('MONTH');
  const [anchor, setAnchor] = useState(today());
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
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
    const res = await exportInventoryReportCsvAction({ preset, anchor, from, to });
    if (!res.ok || !res.csv) {
      toast.error(res.message || 'Không xuất được báo cáo');
      return;
    }
    const blob = new Blob([res.csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = res.fileName || 'bao-cao-kho.csv';
    a.click();
    URL.revokeObjectURL(url);
    toast.success('Đã tải file báo cáo chi tiết');
  };

  const s = report?.summary;

  const cards = s
    ? [
        {
          label: 'Giá trị nhập kho',
          value: `${fmt(s.inValue)} ₫`,
          sub: `${s.inQty} đơn vị hàng`,
          color: '#2563eb',
          bg: '#eff6ff',
          icon: Package,
        },
        {
          label: 'Doanh thu bán ra',
          value: `${fmt(s.revenue)} ₫`,
          sub: `${s.soldQty} đơn vị đã bán`,
          color: '#0f766e',
          bg: '#f0fdfa',
          icon: TrendingUp,
        },
        {
          label: 'Giá vốn hàng bán',
          value: `${fmt(s.cogs)} ₫`,
          sub: 'Chốt theo giá tại lúc xuất',
          color: '#d97706',
          bg: '#fffbeb',
          icon: TrendingDown,
        },
        {
          label: 'Lãi gộp',
          value: `${fmt(s.grossProfit)} ₫`,
          sub: `Tỷ suất ${s.marginPercent}%`,
          color: s.grossProfit >= 0 ? '#16a34a' : '#dc2626',
          bg: s.grossProfit >= 0 ? '#f0fdf4' : '#fef2f2',
          icon: TrendingUp,
        },
      ]
    : [];

  const th: React.CSSProperties = { padding: '10px 12px', whiteSpace: 'nowrap', textAlign: 'right' };
  const td: React.CSSProperties = { padding: '9px 12px', whiteSpace: 'nowrap', textAlign: 'right' };

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
              {new Date(report.range.to).toLocaleDateString('vi-VN')} · {s?.transactionCount || 0} phiếu kho
            </div>
          )}

          <div style={{ flex: 1 }} />

          <Button variant="secondary" onClick={handleExport} disabled={!report}>
            <FileDown size={15} style={{ marginRight: 6 }} /> Tải file chi tiết (CSV)
          </Button>
        </div>
      </Card>

      {loading && (
        <Card style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>Đang tổng hợp số liệu…</Card>
      )}

      {!loading && report && (
        <>
          {/* Tổng hợp */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))', gap: 12 }}>
            {cards.map((c) => (
              <Card key={c.label} style={{ padding: 14, display: 'flex', gap: 12, alignItems: 'center' }}>
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
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 17, fontWeight: 800, color: c.color }}>{c.value}</div>
                  <div style={{ fontSize: 12, color: 'var(--text-muted)', fontWeight: 500 }}>{c.label}</div>
                  <div style={{ fontSize: 11, color: 'var(--text-faint, var(--text-muted))' }}>{c.sub}</div>
                </div>
              </Card>
            ))}
          </div>

          {/* Chi phí xuất không thu tiền */}
          {report.costByReason.length > 0 && (
            <Card style={{ padding: 14 }}>
              <div
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: 6,
                  fontSize: 13.5,
                  fontWeight: 700,
                  color: 'var(--text-strong)',
                  marginBottom: 10,
                }}
              >
                <AlertTriangle size={15} color="#d97706" /> Hàng xuất không thu tiền —{' '}
                {fmt(s.nonSaleCost)} ₫
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {report.costByReason.map((r: any) => (
                  <div
                    key={r.code}
                    style={{
                      padding: '7px 12px',
                      borderRadius: 'var(--radius-md)',
                      background: 'var(--surface-sunken)',
                      border: '1px solid var(--border-base)',
                      fontSize: 12.5,
                    }}
                  >
                    <div style={{ color: 'var(--text-muted)' }}>{r.label}</div>
                    <div style={{ fontWeight: 700, color: 'var(--text-strong)' }}>
                      {r.qty} đơn vị hàng · {fmt(r.value)} ₫
                    </div>
                  </div>
                ))}
              </div>
              <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 10 }}>
                Lãi thuần sau khi trừ khoản này:{' '}
                <strong style={{ color: s.netProfit >= 0 ? '#16a34a' : '#dc2626' }}>
                  {fmt(s.netProfit)} ₫
                </strong>
              </div>
            </Card>
          )}

          {/* Chi tiết theo mặt hàng */}
          <Card style={{ padding: 0, overflow: 'hidden' }}>
            <div style={{ padding: '14px 16px', fontSize: 13.5, fontWeight: 700, color: 'var(--text-strong)' }}>
              Chi tiết theo mặt hàng ({report.items.length})
            </div>
            <div style={{ overflowX: 'auto' }}>
              <table style={{ width: '100%', minWidth: 980, borderCollapse: 'collapse', fontSize: 12.5 }}>
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
                    <th style={{ ...th, textAlign: 'left' }}>Mã hàng</th>
                    <th style={{ ...th, textAlign: 'left', width: '100%' }}>Tên hàng</th>
                    <th style={th}>SL nhập</th>
                    <th style={th}>Giá trị nhập</th>
                    <th style={th}>SL bán</th>
                    <th style={th}>Doanh thu</th>
                    <th style={th}>Giá vốn</th>
                    <th style={th}>Lãi gộp</th>
                    <th style={th}>Tỷ suất</th>
                    <th style={th}>Tồn cuối</th>
                  </tr>
                </thead>
                <tbody>
                  {report.items.length === 0 ? (
                    <tr>
                      <td colSpan={10} style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                        Kỳ này chưa có phát sinh nhập xuất kho
                      </td>
                    </tr>
                  ) : (
                    report.items.map((r: any) => (
                      <tr key={r.itemId} style={{ borderBottom: '1px solid var(--border-base)' }}>
                        <td style={{ ...td, textAlign: 'left', fontFamily: 'monospace', color: 'var(--brand)' }}>
                          {r.itemCode}
                        </td>
                        <td style={{ ...td, textAlign: 'left', whiteSpace: 'normal', fontWeight: 600 }}>
                          {r.name}
                          {r.nonSaleQty > 0 && (
                            <span style={{ color: '#d97706', fontWeight: 500 }}>
                              {' '}
                              · xuất khác {r.nonSaleQty} {r.unit || 'đơn vị'} ({fmt(r.nonSaleCost)} ₫)
                            </span>
                          )}
                        </td>
                        <td style={td}>{r.inQty || '—'}</td>
                        <td style={td}>{r.inValue ? fmt(r.inValue) : '—'}</td>
                        <td style={td}>{r.soldQty || '—'}</td>
                        <td style={td}>{r.revenue ? fmt(r.revenue) : '—'}</td>
                        <td style={td}>{r.cogs ? fmt(r.cogs) : '—'}</td>
                        <td style={{ ...td, fontWeight: 700, color: r.grossProfit >= 0 ? '#16a34a' : '#dc2626' }}>
                          {r.soldQty ? fmt(r.grossProfit) : '—'}
                        </td>
                        <td style={td}>{r.soldQty ? `${r.marginPercent}%` : '—'}</td>
                        <td style={td}>{r.closingStock}</td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </Card>
        </>
      )}
    </div>
  );
}
