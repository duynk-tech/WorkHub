'use client';

import React, { useEffect, useState } from 'react';
import Link from 'next/link';
import { Card, Button, Field, Input, Select } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { ChevronLeft, ChevronRight, ExternalLink } from 'lucide-react';
import { DOCUMENT_KINDS } from '@/server/modules/settings/documents';
import { listDocumentsAction } from '@/server/modules/settings/document-actions';

/** Sổ chứng từ: tra cứu mọi loại chứng từ ở một chỗ, bấm vào mở màn hình xử lý. */

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));

export function DocumentScreen({ initialData }: { initialData: any }) {
  const toast = useToast();
  const [data, setData] = useState<any>(initialData);
  const [loading, setLoading] = useState(false);

  const [kind, setKind] = useState('ALL');
  const [from, setFrom] = useState('');
  const [to, setTo] = useState('');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);

  const load = async () => {
    setLoading(true);
    const res = await listDocumentsAction({
      kind,
      from: from || undefined,
      to: to || undefined,
      search: search || undefined,
      page,
      pageSize: 30,
    });
    setLoading(false);
    if (res.ok) setData(res.data);
    else toast.error(res.message);
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [kind, from, to, page]);

  useEffect(() => {
    setPage(1);
  }, [kind, from, to]);

  const rows: any[] = data?.rows || [];
  const th: React.CSSProperties = { padding: '10px 12px', whiteSpace: 'nowrap', textAlign: 'left' };
  const td: React.CSSProperties = { padding: '10px 12px', whiteSpace: 'nowrap' };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      <div>
        <h1 style={{ fontSize: 21, fontWeight: 800, margin: 0, color: 'var(--text-strong)' }}>
          Sổ chứng từ
        </h1>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '4px 0 0' }}>
          Tra cứu báo giá, đơn hàng, phiếu thu chi, trả hàng, đặt hàng, phiếu kho và sự cố ở cùng một chỗ
        </p>
      </div>

      <Card style={{ padding: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(160px, 1fr))', gap: 10 }}>
          <Field label="Loại chứng từ">
            <Select value={kind} onChange={(e) => setKind(e.target.value)} sizeSm>
              <option value="ALL">Tất cả loại</option>
              {Object.entries(DOCUMENT_KINDS).map(([k, v]) => (
                <option key={k} value={k}>
                  {v.label}
                  {data?.countByKind?.[k] ? ` (${data.countByKind[k]})` : ''}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Từ ngày">
            <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} sizeSm />
          </Field>
          <Field label="Đến ngày">
            <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} sizeSm />
          </Field>
          <Field label="Tìm mã chứng từ / đối tác">
            <Input
              placeholder="Nhập rồi Enter"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') {
                  setPage(1);
                  load();
                }
              }}
              sizeSm
            />
          </Field>
        </div>
        <div style={{ fontSize: 12.5, color: 'var(--text-muted)', marginTop: 10 }}>
          {data ? `${data.total} chứng từ · trang ${data.page}/${data.totalPages}` : 'Đang tải…'}
        </div>
      </Card>

      <Card style={{ padding: 0, overflow: 'hidden' }}>
        <div style={{ overflowX: 'auto' }}>
          <table style={{ width: '100%', minWidth: 900, borderCollapse: 'collapse', fontSize: 12.5 }}>
            <thead>
              <tr
                style={{
                  background: 'var(--surface-sunken)',
                  borderBottom: '1px solid var(--border-base)',
                  color: 'var(--text-muted)',
                  fontSize: 11.5,
                  fontWeight: 700,
                }}
              >
                <th style={th}>Loại</th>
                <th style={th}>Mã chứng từ</th>
                <th style={th}>Ngày</th>
                <th style={{ ...th, width: '100%' }}>Đối tác</th>
                <th style={th}>Chứng từ gốc</th>
                <th style={{ ...th, textAlign: 'right' }}>Giá trị</th>
                <th style={th}>Trạng thái</th>
                <th style={th} />
              </tr>
            </thead>
            <tbody>
              {loading ? (
                <tr>
                  <td colSpan={8} style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                    Đang tải…
                  </td>
                </tr>
              ) : rows.length === 0 ? (
                <tr>
                  <td colSpan={8} style={{ padding: 30, textAlign: 'center', color: 'var(--text-muted)' }}>
                    Không có chứng từ nào khớp bộ lọc
                  </td>
                </tr>
              ) : (
                rows.map((r: any) => {
                  const k = DOCUMENT_KINDS[r.kind] || { label: r.kind, color: '#64748b', bg: '#f1f5f9' };
                  return (
                    <tr key={`${r.kind}-${r.code}`} style={{ borderBottom: '1px solid var(--border-base)' }}>
                      <td style={td}>
                        <span style={{ padding: '2px 8px', borderRadius: 4, fontSize: 11, fontWeight: 700, background: k.bg, color: k.color }}>
                          {k.label}
                        </span>
                      </td>
                      <td style={{ ...td, fontFamily: 'monospace', fontWeight: 700, color: 'var(--text-strong)' }}>
                        {r.code}
                      </td>
                      <td style={{ ...td, color: 'var(--text-muted)' }}>
                        {new Date(r.date).toLocaleDateString('vi-VN')}
                      </td>
                      <td style={{ ...td, whiteSpace: 'normal' }}>{r.partner || '—'}</td>
                      <td style={{ ...td, fontFamily: 'monospace', color: r.relatedCode ? 'var(--brand)' : 'var(--text-muted)' }}>
                        {r.relatedCode || '—'}
                      </td>
                      <td style={{ ...td, textAlign: 'right', fontWeight: 600, color: r.value < 0 ? '#dc2626' : 'var(--text-strong)' }}>
                        {r.value ? `${fmt(r.value)} ₫` : '—'}
                      </td>
                      <td style={{ ...td, color: 'var(--text-muted)' }}>{r.status || '—'}</td>
                      <td style={td}>
                        <Link
                          href={r.href}
                          style={{
                            display: 'inline-flex',
                            alignItems: 'center',
                            padding: '4px 7px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--surface-sunken)',
                            color: 'var(--brand)',
                          }}
                          title="Mở màn hình xử lý chứng từ này"
                        >
                          <ExternalLink size={13} />
                        </Link>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>

        {data && data.totalPages > 1 && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'flex-end',
              gap: 8,
              padding: '10px 14px',
              borderTop: '1px solid var(--border-base)',
            }}
          >
            <Button variant="secondary" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
              <ChevronLeft size={14} /> Trước
            </Button>
            <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
              Trang {data.page} / {data.totalPages}
            </span>
            <Button variant="secondary" size="sm" disabled={page >= data.totalPages} onClick={() => setPage(page + 1)}>
              Sau <ChevronRight size={14} />
            </Button>
          </div>
        )}
      </Card>
    </div>
  );
}
