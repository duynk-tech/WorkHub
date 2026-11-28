'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { Card } from '@/components/ui';
import { TICKET_PRIORITIES, TICKET_STATUSES } from '@/server/modules/equipment/types';
import type { CustomerDetailState } from '../use-customer-detail';

/** Tab "tickets" của hồ sơ khách hàng — tách từ customer-detail-screen.tsx, dùng chung state qua useCustomerDetail. */
export function TicketsTab({ s }: { s: CustomerDetailState }) {
  const { activeTab, customer } = s;
  return (
    <>
      {activeTab === 'tickets' && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', minWidth: 940, borderCollapse: 'collapse', textAlign: 'left', fontSize: 13 }}>
              <thead>
                <tr style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border-base)', color: 'var(--text-muted)', fontSize: 12, fontWeight: 600 }}>
                  <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Mã sự cố</th>
                  <th style={{ padding: '12px 14px', width: '100%', minWidth: 300 }}>Nội dung sự cố</th>
                  <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Thiết bị</th>
                  <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Mức độ</th>
                  <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Trạng thái</th>
                  <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Kỹ thuật viên</th>
                  <th style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>Thời gian</th>
                </tr>
              </thead>
              <tbody>
                {customer.tickets?.length === 0 ? (
                  <tr>
                    <td colSpan={7} style={{ padding: '40px 20px', textAlign: 'center', color: 'var(--text-muted)' }}>
                      Không có sự cố hoặc lịch sử sửa chữa nào cho khách hàng này
                    </td>
                  </tr>
                ) : (
                  customer.tickets.map((t: any) => (
                    <tr key={t.id} style={{ borderBottom: '1px solid var(--border-base)' }} className="hover:bg-slate-50 dark:hover:bg-slate-800/40">
                      <td style={{ padding: '12px 14px', fontFamily: 'monospace', fontWeight: 700, color: '#dc2626', whiteSpace: 'nowrap' }}>
                        {t.ticketCode}
                      </td>
                      <td style={{ padding: '12px 14px' }}>
                        <div style={{ fontWeight: 600, color: 'var(--text-strong)' }}>{t.title}</div>
                        {t.description && (
                          <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                            {t.description}
                          </div>
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        {t.equipment ? (
                          <Link
                            href={`/equipment/${t.equipment.id}`}
                            style={{
                              fontFamily: 'monospace',
                              fontWeight: 600,
                              color: 'var(--brand)',
                              textDecoration: 'none',
                            }}
                          >
                            {t.equipment.machineCode}
                          </Link>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td style={{ padding: '12px 14px', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            display: 'inline-block',
                            padding: '2px 8px',
                            borderRadius: 'var(--radius-sm)',
                            fontSize: 11,
                            fontWeight: 700,
                            background: TICKET_PRIORITIES[t.priority]?.bg || '#f1f5f9',
                            color: TICKET_PRIORITIES[t.priority]?.color || '#475569',
                          }}
                        >
                          {TICKET_PRIORITIES[t.priority]?.label || 'Không xác định'}
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
                            background: TICKET_STATUSES[t.status]?.bg || '#f1f5f9',
                            color: TICKET_STATUSES[t.status]?.color || '#475569',
                          }}
                        >
                          {TICKET_STATUSES[t.status]?.label || 'Không xác định'}
                        </span>
                      </td>
                      <td style={{ padding: '12px 14px', color: 'var(--text-strong)', whiteSpace: 'nowrap' }}>
                        {t.assignedTo?.fullName || 'Chưa gán'}
                      </td>
                      <td style={{ padding: '12px 14px', fontSize: 12, color: 'var(--text-muted)', whiteSpace: 'nowrap' }}>
                        {new Date(t.createdAt).toLocaleDateString('vi-VN')}
                      </td>
                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </Card>
      )}
    </>
  );
}
