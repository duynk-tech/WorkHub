'use client';

/* eslint-disable @typescript-eslint/no-explicit-any */
import Link from 'next/link';
import { Phone, MapPin, Plus } from 'lucide-react';
import { Card, Button, Badge } from '@/components/ui';
import { EQUIPMENT_STATUSES, EQUIPMENT_CATEGORIES } from '@/server/modules/equipment/types';
import type { CustomerDetailState } from '../use-customer-detail';

/** Tab "locations" của hồ sơ khách hàng — tách từ customer-detail-screen.tsx, dùng chung state qua useCustomerDetail. */
export function LocationsTab({ s }: { s: CustomerDetailState }) {
  const { activeTab, canManage, customer, setCreateLocationModalOpen } = s;
  return (
    <>
      {activeTab === 'locations' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
          {canManage && (
            <div style={{ display: 'flex', justifyContent: 'flex-end' }}>
              <Button
                variant="primary"
                size="sm"
                onClick={() => setCreateLocationModalOpen(true)}
              >
                <Plus size={14} style={{ marginRight: 6 }} /> Thêm điểm đặt / Chi nhánh
              </Button>
            </div>
          )}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))', gap: 14 }}>
            {customer.locations?.length === 0 ? (
              <Card style={{ gridColumn: '1 / -1', padding: 40, textAlign: 'center', color: 'var(--text-muted)' }}>
                Chưa có điểm lắp đặt hoặc chi nhánh nào được khai báo
              </Card>
            ) : (
            customer.locations.map((loc: any) => (
              <Card key={loc.id} style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <div style={{ width: 34, height: 34, borderRadius: 'var(--radius-sm)', background: '#e0f2fe', color: '#0284c7', display: 'grid', placeItems: 'center' }}>
                    <MapPin size={18} />
                  </div>
                  <div>
                    <h3 style={{ fontSize: 15, fontWeight: 700, margin: 0, color: 'var(--text-strong)' }}>
                      {loc.name}
                    </h3>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                      {loc.address}
                    </div>
                  </div>
                </div>

                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px solid var(--border-base)', fontSize: 12.5, display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {loc.managerName && (
                    <div>
                      Quản lý: <strong style={{ color: 'var(--text-strong)' }}>{loc.managerName}</strong>
                    </div>
                  )}
                  {loc.phone && (
                    <div style={{ display: 'flex', alignItems: 'center', gap: 4, color: 'var(--text-muted)' }}>
                      <Phone size={12} /> {loc.phone}
                    </div>
                  )}
                </div>

                {/* Máy tại điểm này */}
                <div style={{ marginTop: 12, paddingTop: 10, borderTop: '1px dashed var(--border-base)' }}>
                  <div style={{ fontSize: 12, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 6 }}>
                    Máy đang lắp tại chi nhánh ({loc.machines?.length || 0}):
                  </div>
                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {loc.machines?.length === 0 ? (
                      <span style={{ fontSize: 12, color: 'var(--text-muted)', fontStyle: 'italic' }}>Chưa có máy tại điểm này</span>
                    ) : (
                      loc.machines.map((m: any) => (
                        <Link
                          key={m.id}
                          href={`/equipment/${m.id}`}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            gap: 8,
                            padding: '6px 8px',
                            borderRadius: 'var(--radius-sm)',
                            background: 'var(--surface-sunken)',
                            border: '1px solid var(--border-base)',
                            textDecoration: 'none',
                            color: 'inherit',
                          }}
                          title={EQUIPMENT_CATEGORIES[m.category]?.label}
                        >
                          <div style={{ minWidth: 0, flex: 1 }}>
                            <div
                              style={{
                                fontSize: 12.5,
                                fontWeight: 600,
                                color: 'var(--text-strong)',
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {m.name}
                            </div>
                            <div
                              style={{
                                fontSize: 11,
                                fontFamily: 'monospace',
                                color: 'var(--brand)',
                                marginTop: 1,
                                overflow: 'hidden',
                                textOverflow: 'ellipsis',
                                whiteSpace: 'nowrap',
                              }}
                            >
                              {m.machineCode}
                              {m.serialNumber && (
                                <span style={{ color: 'var(--text-muted)' }}> · S/N: {m.serialNumber}</span>
                              )}
                            </div>
                          </div>
                          {EQUIPMENT_STATUSES[m.status] && (
                            <Badge tone={EQUIPMENT_STATUSES[m.status].badgeTone} style={{ flexShrink: 0 }}>
                              {EQUIPMENT_STATUSES[m.status].label}
                            </Badge>
                          )}
                        </Link>
                      ))
                    )}
                  </div>
                </div>
              </Card>
            ))
          )}
          </div>
        </div>
      )}

      {/* ── TAB 4: LỊCH SỬ SỬA CHỮA & SỰ CỐ ── */}
    </>
  );
}
