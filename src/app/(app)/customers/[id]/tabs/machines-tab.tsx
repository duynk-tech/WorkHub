'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { MapPin, ExternalLink, FileText } from 'lucide-react';
import { Card, Button } from '@/components/ui';
import type { CustomerDetailState } from '../use-customer-detail';

/** Tab "machines" của hồ sơ khách hàng — tách từ customer-detail-screen.tsx, dùng chung state qua useCustomerDetail. */
export function MachinesTab({ s }: { s: CustomerDetailState }) {
  const { activeTab, customer, setHandoverEquipment } = s;
  return (
    <>
      {activeTab === 'machines' && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table className="customer-purchase-table" style={{ width: '100%', borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border-base)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>
                  <th style={{ padding: '12px 14px', width: 130 }}>Mã máy</th>
                  <th style={{ padding: '12px 14px' }}>Tên thiết bị</th>
                  <th style={{ padding: '12px 14px' }}>Điểm đặt máy</th>
                  <th style={{ padding: '12px 14px' }}>Hình thức</th>
                  <th style={{ padding: '12px 14px' }}>Trạng thái</th>
                  <th style={{ padding: '12px 14px' }}>Hạn bảo hành</th>
                  <th style={{ padding: '12px 14px', width: 80, textAlign: 'right' }}>Chi tiết</th>
                </tr>
              </thead>
              <tbody>
                {customer.machines?.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Khách hàng này chưa được gán thiết bị nào
                    </td>
                  </tr>
                ) : (
                  customer.machines.map((m: any) => (
                    <tr key={m.id} style={{ borderBottom: '1px solid var(--border-base)' }} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td style={{ padding: '12px 14px' }}>
                        <Link
                          href={`/equipment/${m.id}`}
                          style={{
                            fontFamily: 'monospace',
                            fontWeight: 700,
                            color: 'var(--brand)',
                            textDecoration: 'none',
                          }}
                        >
                          {m.machineCode}
                        </Link>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{m.name}</div>
                        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                          S/N: <span style={{ fontFamily: 'monospace' }}>{m.serialNumber}</span>
                          {m.brand && ` • ${m.brand}`}
                        </div>
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        {m.location ? (
                          <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4, color: 'var(--text-strong)', fontWeight: 500 }}>
                            <MapPin size={13} color="#0284c7" />
                            {m.location.name}
                          </div>
                        ) : (
                          <span style={{ color: 'var(--text-muted)', fontStyle: 'italic' }}>Chưa gán điểm đặt</span>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: 11.5,
                            fontWeight: 600,
                            background: m.ownershipType === 'SOLD' ? '#dcfce7' : ['RENTAL', 'LOAN'].includes(m.ownershipType) ? '#e0f2fe' : '#fef3c7',
                            color: m.ownershipType === 'SOLD' ? '#15803d' : ['RENTAL', 'LOAN'].includes(m.ownershipType) ? '#0369a1' : '#b45309',
                          }}
                        >
                          {m.ownershipType === 'SOLD' ? 'Đã bán' : m.ownershipType === 'RENTAL' ? 'Cho thuê' : m.ownershipType === 'LOAN' ? 'Cho mượn' : 'Ký gửi'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: 11.5,
                            fontWeight: 600,
                            background: m.status === 'OPERATING' ? '#f0fdf4' : m.status === 'BREAKDOWN' ? '#fee2e2' : '#fef3c7',
                            color: m.status === 'OPERATING' ? '#16a34a' : m.status === 'BREAKDOWN' ? '#dc2626' : '#d97706',
                          }}
                        >
                          {m.status === 'OPERATING' ? 'Đang chạy tốt' : m.status === 'BREAKDOWN' ? 'Báo sự cố' : 'Bảo dưỡng'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12.5 }}>
                        {m.warrantyExpiresAt ? new Date(m.warrantyExpiresAt).toLocaleDateString('vi-VN') : '—'}
                      </td>
                      <td style={{ padding: '12px 14px', textAlign: 'right' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <Button
                            size="sm"
                            variant="ghost"
                            onClick={() =>
                              setHandoverEquipment({
                                ...m,
                                customer: { name: customer.name, phone: customer.phone, address: customer.address },
                                location: m.location,
                              })
                            }
                            title="In phiếu bàn giao / Phiếu giao nhận"
                            style={{ padding: '4px 8px', height: 'auto' }}
                          >
                            <FileText size={14} color="#2563eb" />
                          </Button>
                          <Link
                            href={`/equipment/${m.id}`}
                            style={{
                              padding: '4px 8px',
                              borderRadius: 'var(--radius-sm)',
                              background: 'var(--surface-sunken)',
                              color: 'var(--text-strong)',
                              textDecoration: 'none',
                              display: 'inline-flex',
                              alignItems: 'center',
                            }}
                            title="Xem hồ sơ máy"
                          >
                            <ExternalLink size={14} />
                          </Link>
                        </div>
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* ── TAB: BÁO GIÁ ── */}
    </>
  );
}
