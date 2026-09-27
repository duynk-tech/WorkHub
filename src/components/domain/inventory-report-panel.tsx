'use client';

import React, { useEffect, useState } from 'react';
import { Card, Button, Field, Input, SearchInput, Select } from '@/components/ui';
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
const normalizeSearch = (value: unknown) => String(value ?? '')
  .toLowerCase()
  .normalize('NFD')
  .replace(/[\u0300-\u036f]/g, '')
  .replace(/đ/g, 'd')
  .trim();

export function InventoryReportPanel() {
  const toast = useToast();
  const [preset, setPreset] = useState<Preset>('MONTH');
  const [anchor, setAnchor] = useState(today());
  const [from, setFrom] = useState(today());
  const [to, setTo] = useState(today());
  const [itemSearch, setItemSearch] = useState('');
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
  const searchTerm = normalizeSearch(itemSearch);
  const visibleItems = (report?.items ?? []).filter((item: any) => {
    if (!searchTerm) return true;
    return [item.itemCode, item.name, item.unit]
      .some((value) => normalizeSearch(value).includes(searchTerm));
  });

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
          label: 'Doanh thu bán ra (chưa VAT)',
          value: `${fmt(s.revenue)} ₫`,
          sub: `${s.orderCount} đơn · ${s.soldQty} đơn vị đã bán`,
          detail: s.vatAmount > 0 ? `VAT phát sinh: +${fmt(s.vatAmount)} ₫` : undefined,
          color: '#0f766e',
          bg: '#f0fdfa',
          icon: TrendingUp,
        },
        {
          label: 'Giá vốn hàng bán (đã gồm phí)',
          value: `${fmt(s.cogs)} ₫`,
          sub: 'Giá mua NCC + phí khác',
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

  const th: React.CSSProperties = { padding: '10px 12px', whiteSpace: 'normal', lineHeight: 1.25, textAlign: 'right' };
  const td: React.CSSProperties = { padding: '9px 12px', whiteSpace: 'nowrap', textAlign: 'right', fontVariantNumeric: 'tabular-nums' };

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
                  {c.detail && (
                    <div style={{ fontSize: 11.5, color: '#2563eb', fontWeight: 700, marginTop: 3 }}>{c.detail}</div>
                  )}
                </div>
              </Card>
            ))}
          </div>

          {/* Điều chỉnh làm giảm doanh thu; VAT được hiển thị ngay trong thẻ Doanh thu. */}
          {(s.discount > 0 || s.returnedAmount > 0) && (
            <Card style={{ padding: 14 }}>
              <div
                style={{
                  fontSize: 13,
                  fontWeight: 700,
                  color: 'var(--text-strong)',
                  marginBottom: 10,
                }}
              >
                Điều chỉnh doanh thu ({s.orderCount} đơn)
              </div>
              <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                {s.discount > 0 && (
                  <div
                    style={{
                      padding: '7px 12px',
                      borderRadius: 'var(--radius-md)',
                      background: '#fef2f2',
                      border: '1px solid #fecaca',
                      fontSize: 12.5,
                    }}
                  >
                    <div style={{ color: '#b91c1c' }}>Chiết khấu</div>
                    <div style={{ fontWeight: 700, color: '#b91c1c' }}>−{fmt(s.discount)} ₫</div>
                  </div>
                )}
                {s.returnedAmount > 0 && (
                  <div
                    style={{
                      padding: '7px 12px',
                      borderRadius: 'var(--radius-md)',
                      background: '#fffbeb',
                      border: '1px solid #fde68a',
                      fontSize: 12.5,
                    }}
                  >
                    <div style={{ color: '#b45309' }}>Hàng trả lại</div>
                    <div style={{ fontWeight: 700, color: '#b45309' }}>−{fmt(s.returnedAmount)} ₫</div>
                  </div>
                )}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 8 }}>
                Doanh thu đã phản ánh các khoản điều chỉnh này, chưa bao gồm VAT.
              </div>
            </Card>
          )}

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
            <div style={{ padding: '13px 16px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
              <div style={{ fontSize: 13.5, fontWeight: 700, color: 'var(--text-strong)' }}>
                Chi tiết theo mặt hàng ({visibleItems.length}{itemSearch ? `/${report.items.length}` : ''})
              </div>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginLeft: 'auto', minWidth: 'min(100%, 330px)' }}>
                <div style={{ width: 290, maxWidth: '100%' }}>
                  <SearchInput
                    aria-label="Tìm mặt hàng trong báo cáo"
                    placeholder="Tìm mã hoặc tên hàng…"
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
              <table className="table table-compact inventory-report-grid" style={{ minWidth: 1834, fontSize: 12.5 }}>
                <colgroup>
                  <col style={{ width: 164 }} />
                  <col style={{ width: 340 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 80 }} />
                  <col style={{ width: 135 }} />
                  <col style={{ width: 125 }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 215 }} />
                  <col style={{ width: 230 }} />
                  <col style={{ width: 150 }} />
                  <col style={{ width: 75 }} />
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
                    <th style={th} title="Tổng số lượng nhập kho trong kỳ">SL nhập</th>
                    <th style={th} title="SL bán ra từ đơn bán hàng">SL bán</th>
                    <th style={th} title="Đơn giá bán trung bình (Doanh thu ÷ SL bán)">Giá bán TB</th>
                    <th style={th} title="Chiết khấu = Giá gốc − Thành tiền thực thu">CK</th>
                    <th style={th} title="Doanh thu thuần (đã trừ chiết khấu dòng, từ chi tiết đơn bán hàng)">Doanh thu</th>
                    <th style={{ ...th, whiteSpace: 'nowrap' }} title="Đơn giá vốn thực tế PO: giá mua NCC + cước VC + hải quan và các phí được phân bổ">Giá vốn/cái (đã gồm phí)</th>
                    <th style={{ ...th, whiteSpace: 'nowrap' }} title="Tổng giá vốn hàng bán = Đơn giá vốn thực tế đã gồm phí × SL bán">Tổng giá vốn (đã gồm phí)</th>
                    <th style={th} title="Lãi gộp = Doanh thu − Giá vốn">Lãi gộp</th>
                    <th style={th} title="Tỷ suất = Lãi gộp ÷ Doanh thu">%</th>
                    <th style={th} title="Tồn kho hiện tại">Tồn</th>
                  </tr>
                </thead>
                <tbody>
                  {visibleItems.length === 0 ? (
                    <tr>
                      <td colSpan={12} style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
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
                          {r.nonSaleQty > 0 && (
                            <span style={{ color: '#d97706', fontWeight: 500 }}>
                              {' '}
                              · xuất khác {r.nonSaleQty} {r.unit || 'đơn vị'} ({fmt(r.nonSaleCost)} ₫)
                            </span>
                          )}
                        </td>
                        <td style={td}>{r.inQty || '—'}</td>
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
                        <td style={td}>
                          {r.cogs ? (
                            <span style={{ fontWeight: 600 }}>{fmt(r.cogs)}</span>
                          ) : r.actualUnitCost > 0 ? (
                            <div title="Đơn giá vốn PO (chưa phát sinh bán)">
                              <div style={{ color: 'var(--text-muted)', fontWeight: 500 }}>{fmt(r.actualUnitCost)}</div>
                              <div style={{ fontSize: 10, color: 'var(--text-faint)' }}>Vốn PO/cái</div>
                            </div>
                          ) : '—'}
                        </td>
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
