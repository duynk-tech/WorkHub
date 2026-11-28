'use client';

import React, { useState, useMemo } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Wrench,
  CheckCircle2,
  Calendar,
  Clock,
  AlertTriangle,
  ShieldAlert,
  ShieldCheck,
  Search,
  Phone,
  MapPin,
  ExternalLink,
  ChevronDown,
  ChevronRight,
  Filter,
  Layers,
  List,
  Building2,
  Coffee,
  Flame,
  Snowflake,
  Utensils,
  Plus,
  RotateCcw,
} from 'lucide-react';
import { Card, Button, Input, Badge } from '@/components/ui';
import { CARE_REASONS, type CareReason } from '@/server/modules/customer/care';
import { TicketModal } from '@/components/domain/ticket-modals';
import { MaintenanceRecordModal } from '@/components/domain/maintenance-record-modal';

const fmtVN = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString('vi-VN') : '—');

function getCategoryIcon(name: string = '') {
  const n = name.toLowerCase();
  if (n.includes('cà phê') || n.includes('espresso') || n.includes('coffee')) {
    return <Coffee style={{ width: 18, height: 18 }} />;
  }
  if (n.includes('kem') || n.includes('gelato') || n.includes('lạnh') || n.includes('tủ đông')) {
    return <Snowflake style={{ width: 18, height: 18 }} />;
  }
  if (n.includes('nướng') || n.includes('lò') || n.includes('nấu') || n.includes('chiên') || n.includes('bếp')) {
    return <Flame style={{ width: 18, height: 18 }} />;
  }
  return <Utensils style={{ width: 18, height: 18 }} />;
}

function dayLabel(days: number) {
  if (days < 0) {
    return {
      text: `Trễ ${Math.abs(days)} ngày`,
      bg: '#fee2e2',
      color: '#b91c1c',
      border: '#fecaca',
      icon: AlertTriangle,
      isOverdue: true,
    };
  }
  if (days === 0) {
    return {
      text: 'Hôm nay',
      bg: '#fef3c7',
      color: '#b45309',
      border: '#fde68a',
      icon: Clock,
      isOverdue: false,
    };
  }
  if (days <= 7) {
    return {
      text: `Còn ${days} ngày`,
      bg: '#fef3c7',
      color: '#b45309',
      border: '#fde68a',
      icon: Clock,
      isOverdue: false,
    };
  }
  return {
    text: `Còn ${days} ngày`,
    bg: '#eff6ff',
    color: '#1d4ed8',
    border: '#bfdbfe',
    icon: Calendar,
    isOverdue: false,
  };
}

export function CustomerCarePanel({
  care,
  technicians = [],
  onChangeWindow,
}: {
  care?: any;
  technicians?: any[];
  onChangeWindow: (days: number) => void;
}) {
  const router = useRouter();

  const [activeReasonFilter, setActiveReasonFilter] = useState<CareReason | 'ALL'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');
  const [viewMode, setViewMode] = useState<'grouped' | 'flat'>('grouped');

  // Modal states
  const [ticketModalOpen, setTicketModalOpen] = useState(false);
  const [selectedTicketEquipmentId, setSelectedTicketEquipmentId] = useState<number | undefined>();
  const [recordDoneMachine, setRecordDoneMachine] = useState<any | null>(null);

  const within = care?.within ?? 30;
  const totals = care?.totals ?? {
    customers: 0,
    machines: 0,
    warrantySoon: 0,
    warrantyJustExpired: 0,
    pmDue: 0,
    pmOverdue: 0,
  };

  // Flatten all machines for easy manipulation
  const allMachines = useMemo(() => {
    if (!care?.customers) return [];
    return care.customers.flatMap((c: any) =>
      c.machines.map((m: any) => ({
        ...m,
        customerName: c.name,
        customerCode: c.code,
        customerPhone: c.phone,
        customerId: c.customerId,
      })),
    );
  }, [care]);

  // Filtered customers & machines
  const filteredData = useMemo(() => {
    if (!care?.customers) return { customers: [], machines: [] };

    const q = searchQuery.toLowerCase().trim();

    const matchedMachines = allMachines.filter((m: any) => {
      // Reason filter
      if (activeReasonFilter !== 'ALL' && !m.reasons.includes(activeReasonFilter)) {
        return false;
      }
      // Search query
      if (q) {
        const text = `${m.machineCode} ${m.name} ${m.serialNumber} ${m.locationName || ''} ${m.customerName || ''} ${m.customerCode || ''} ${m.customerPhone || ''}`.toLowerCase();
        if (!text.includes(q)) return false;
      }
      return true;
    });

    // Group back by customer
    const byCust = new Map<number, any>();
    for (const m of matchedMachines) {
      if (!byCust.has(m.customerId)) {
        byCust.set(m.customerId, {
          customerId: m.customerId,
          name: m.customerName,
          code: m.customerCode,
          phone: m.customerPhone,
          machines: [],
          soonestDays: m.daysLeft,
        });
      }
      const c = byCust.get(m.customerId)!;
      c.machines.push(m);
      c.soonestDays = Math.min(c.soonestDays, m.daysLeft);
    }

    const customers = Array.from(byCust.values()).sort((a, b) => a.soonestDays - b.soonestDays);
    const sortedMachines = [...matchedMachines].sort((a, b) => a.daysLeft - b.daysLeft);

    return { customers, machines: sortedMachines };
  }, [care, allMachines, activeReasonFilter, searchQuery]);

  // Handle open create ticket modal
  const handleOpenTicket = (machineId?: number) => {
    setSelectedTicketEquipmentId(machineId);
    setTicketModalOpen(true);
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
      {/* 1. Contextual KPI Cards for Maintenance */}
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', gap: 12 }}>
        {/* Overdue card */}
        <div
          onClick={() => setActiveReasonFilter((prev) => (prev === 'PM_OVERDUE' ? 'ALL' : 'PM_OVERDUE'))}
          style={{
            cursor: 'pointer',
            background: activeReasonFilter === 'PM_OVERDUE' ? '#fef2f2' : '#ffffff',
            border: activeReasonFilter === 'PM_OVERDUE' ? '2px solid #ef4444' : '1px solid #fee2e2',
            borderRadius: 'var(--radius-lg, 12px)',
            padding: 14,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease, opacity 0.15s ease',
            position: 'relative',
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#b91c1c' }}>
              Quá hạn bảo dưỡng
            </span>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#ef4444' }} />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#dc2626', marginTop: 4 }}>
            {totals.pmOverdue}
          </div>
          <div style={{ fontSize: 12, color: '#991b1b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            <AlertTriangle style={{ width: 14, height: 14 }} />
            <span>Cần can thiệp gấp</span>
          </div>
        </div>

        {/* PM Due Card */}
        <div
          onClick={() => setActiveReasonFilter((prev) => (prev === 'PM_DUE' ? 'ALL' : 'PM_DUE'))}
          style={{
            cursor: 'pointer',
            background: activeReasonFilter === 'PM_DUE' ? '#eff6ff' : '#ffffff',
            border: activeReasonFilter === 'PM_DUE' ? '2px solid #3b82f6' : '1px solid #dbeafe',
            borderRadius: 'var(--radius-lg, 12px)',
            padding: 14,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease, opacity 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#1d4ed8' }}>
              Đến hạn bảo dưỡng
            </span>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#3b82f6' }} />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#2563eb', marginTop: 4 }}>
            {totals.pmDue}
          </div>
          <div style={{ fontSize: 12, color: '#1e40af', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            <Calendar style={{ width: 14, height: 14 }} />
            <span>Trong vòng {within} ngày</span>
          </div>
        </div>

        {/* Warranty Just Expired Card */}
        <div
          onClick={() => setActiveReasonFilter((prev) => (prev === 'WARRANTY_JUST_EXPIRED' ? 'ALL' : 'WARRANTY_JUST_EXPIRED'))}
          style={{
            cursor: 'pointer',
            background: activeReasonFilter === 'WARRANTY_JUST_EXPIRED' ? '#fff7ed' : '#ffffff',
            border: activeReasonFilter === 'WARRANTY_JUST_EXPIRED' ? '2px solid #f97316' : '1px solid #ffedd5',
            borderRadius: 'var(--radius-lg, 12px)',
            padding: 14,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease, opacity 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#c2410c' }}>
              Bảo hành vừa hết
            </span>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#f97316' }} />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#ea580c', marginTop: 4 }}>
            {totals.warrantyJustExpired}
          </div>
          <div style={{ fontSize: 12, color: '#9a3412', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            <ShieldAlert style={{ width: 14, height: 14 }} />
            <span>Cơ hội ký gói bảo trì</span>
          </div>
        </div>

        {/* Warranty Soon Card */}
        <div
          onClick={() => setActiveReasonFilter((prev) => (prev === 'WARRANTY_SOON' ? 'ALL' : 'WARRANTY_SOON'))}
          style={{
            cursor: 'pointer',
            background: activeReasonFilter === 'WARRANTY_SOON' ? '#fefce8' : '#ffffff',
            border: activeReasonFilter === 'WARRANTY_SOON' ? '2px solid #eab308' : '1px solid #fef08a',
            borderRadius: 'var(--radius-lg, 12px)',
            padding: 14,
            boxShadow: '0 1px 3px rgba(0,0,0,0.04)',
            opacity: totals.warrantySoon > 0 ? 1 : 0.7,
            transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease, opacity 0.15s ease',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 12, fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.04em', color: '#a16207' }}>
              Sắp hết bảo hành
            </span>
            <span style={{ width: 8, height: 8, borderRadius: '50%', background: '#eab308' }} />
          </div>
          <div style={{ fontSize: 28, fontWeight: 800, color: '#ca8a04', marginTop: 4 }}>
            {totals.warrantySoon}
          </div>
          <div style={{ fontSize: 12, color: '#854d0e', marginTop: 2, display: 'flex', alignItems: 'center', gap: 4 }}>
            <ShieldCheck style={{ width: 14, height: 14 }} />
            <span>Tư vấn gia hạn</span>
          </div>
        </div>
      </div>

      {/* 2. Smart Toolbar: Search, Chips & Controls */}
      <Card style={{ padding: '12px 16px' }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 12, flexWrap: 'wrap' }}>
            {/* Search Input */}
            <div style={{ position: 'relative', flex: '1 1 300px', minWidth: 260 }}>
              <Search
                style={{
                  position: 'absolute',
                  left: 10,
                  top: '50%',
                  transform: 'translateY(-50%)',
                  width: 16,
                  height: 16,
                  color: 'var(--text-muted)',
                }}
              />
              <input
                type="text"
                placeholder="Tìm nhanh theo khách hàng, mã máy EQ-..., S/N, chi nhánh..."
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                style={{
                  width: '100%',
                  paddingLeft: 34,
                  paddingRight: searchQuery ? 30 : 12,
                  paddingTop: 7,
                  paddingBottom: 7,
                  fontSize: 13,
                  borderRadius: 8,
                  border: '1px solid var(--border-base, #e2e8f0)',
                  background: 'var(--surface-sunken, #f8fafc)',
                  outline: 'none',
                }}
              />
              {searchQuery && (
                <button
                  type="button"
                  onClick={() => setSearchQuery('')}
                  style={{
                    position: 'absolute',
                    right: 8,
                    top: '50%',
                    transform: 'translateY(-50%)',
                    background: 'none',
                    border: 'none',
                    color: 'var(--text-muted)',
                    cursor: 'pointer',
                    fontSize: 14,
                    padding: 2,
                  }}
                >
                  ✕
                </button>
              )}
            </div>

            {/* Window selector & View Mode Switcher */}
            <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
              <label style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12.5, color: 'var(--text-muted)' }}>
                <span>Nhìn trước:</span>
                <select
                  value={within}
                  onChange={(e) => onChangeWindow(Number(e.target.value))}
                  style={{
                    padding: '5px 10px',
                    fontSize: 12.5,
                    fontWeight: 600,
                    borderRadius: 6,
                    border: '1px solid var(--border-base, #cbd5e1)',
                    background: '#ffffff',
                    cursor: 'pointer',
                  }}
                >
                  <option value={30}>30 ngày</option>
                  <option value={60}>60 ngày</option>
                  <option value={90}>90 ngày</option>
                  <option value={180}>180 ngày</option>
                </select>
              </label>

              {/* View toggle */}
              <div
                style={{
                  display: 'inline-flex',
                  background: '#f1f5f9',
                  padding: 2,
                  borderRadius: 6,
                  border: '1px solid #e2e8f0',
                }}
              >
                <button
                  type="button"
                  onClick={() => setViewMode('grouped')}
                  style={{
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: viewMode === 'grouped' ? 700 : 500,
                    borderRadius: 5,
                    border: 'none',
                    background: viewMode === 'grouped' ? '#ffffff' : 'transparent',
                    color: viewMode === 'grouped' ? '#0f172a' : '#64748b',
                    boxShadow: viewMode === 'grouped' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <Layers style={{ width: 13, height: 13 }} /> Gom khách
                </button>
                <button
                  type="button"
                  onClick={() => setViewMode('flat')}
                  style={{
                    padding: '4px 10px',
                    fontSize: 12,
                    fontWeight: viewMode === 'flat' ? 700 : 500,
                    borderRadius: 5,
                    border: 'none',
                    background: viewMode === 'flat' ? '#ffffff' : 'transparent',
                    color: viewMode === 'flat' ? '#0f172a' : '#64748b',
                    boxShadow: viewMode === 'flat' ? '0 1px 2px rgba(0,0,0,0.05)' : 'none',
                    cursor: 'pointer',
                    display: 'flex',
                    alignItems: 'center',
                    gap: 5,
                  }}
                >
                  <List style={{ width: 13, height: 13 }} /> Từng máy
                </button>
              </div>

              {/* Quick create ticket button */}
              <Button
                variant="primary"
                size="sm"
                onClick={() => handleOpenTicket()}
                style={{ fontSize: 12.5 }}
              >
                <Plus style={{ width: 14, height: 14, marginRight: 4 }} /> Lập phiếu bảo dưỡng
              </Button>
            </div>
          </div>

          {/* Interactive Chips Row */}
          <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center', paddingTop: 2 }}>
            <button
              type="button"
              onClick={() => setActiveReasonFilter('ALL')}
              style={{
                padding: '4px 12px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                border: activeReasonFilter === 'ALL' ? '1px solid #2563eb' : '1px solid #e2e8f0',
                background: activeReasonFilter === 'ALL' ? '#2563eb' : '#f8fafc',
                color: activeReasonFilter === 'ALL' ? '#ffffff' : '#334155',
                transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease, opacity 0.15s ease',
              }}
            >
              Tất cả ({totals.machines} máy)
            </button>

            {([
              ['PM_OVERDUE', totals.pmOverdue],
              ['PM_DUE', totals.pmDue],
              ['WARRANTY_JUST_EXPIRED', totals.warrantyJustExpired],
              ['WARRANTY_SOON', totals.warrantySoon],
            ] as const).map(([key, count]) => {
              const cfg = (CARE_REASONS as any)[key];
              const isSelected = activeReasonFilter === key;
              return (
                <button
                  key={key}
                  type="button"
                  onClick={() => setActiveReasonFilter((prev) => (prev === key ? 'ALL' : key))}
                  style={{
                    padding: '4px 12px',
                    borderRadius: 999,
                    fontSize: 12,
                    fontWeight: 600,
                    cursor: 'pointer',
                    border: isSelected ? `2px solid ${cfg.color}` : `1px solid ${cfg.color}33`,
                    background: isSelected ? cfg.color : cfg.bg,
                    color: isSelected ? '#ffffff' : cfg.color,
                    opacity: count > 0 ? 1 : 0.5,
                    boxShadow: isSelected ? '0 1px 4px rgba(0,0,0,0.1)' : 'none',
                    transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease, opacity 0.15s ease',
                  }}
                >
                  {cfg.label}: {count}
                </button>
              );
            })}

            <span style={{ fontSize: 12, color: 'var(--text-muted)', marginLeft: 'auto' }}>
              Hiển thị <strong>{filteredData.customers.length} khách</strong> · <strong>{filteredData.machines.length} máy</strong>
            </span>
          </div>
        </div>
      </Card>

      {/* 3. Empty State */}
      {filteredData.machines.length === 0 && (
        <Card style={{ padding: '40px 24px', textAlign: 'center' }}>
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: '50%',
              background: '#f1f5f9',
              color: '#94a3b8',
              display: 'grid',
              placeItems: 'center',
              margin: '0 auto 12px',
            }}
          >
            <CheckCircle2 style={{ width: 24, height: 24 }} />
          </div>
          <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>
            Không có thiết bị nào cần xử lý với bộ lọc này
          </div>
          <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: '6px auto 16px', maxWidth: 420 }}>
            {searchQuery
              ? `Không tìm thấy kết quả nào khớp với "${searchQuery}". Thử từ khóa khác hoặc xóa bộ lọc.`
              : `Không có máy nào tới hạn bảo dưỡng hoặc hết bảo hành trong ${within} ngày tới.`}
          </p>
          {(searchQuery || activeReasonFilter !== 'ALL') && (
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                setSearchQuery('');
                setActiveReasonFilter('ALL');
              }}
            >
              <RotateCcw style={{ width: 14, height: 14, marginRight: 6 }} /> Đặt lại bộ lọc
            </Button>
          )}
        </Card>
      )}

      {/* 4. Grouped View (By Customer) */}
      {viewMode === 'grouped' &&
        filteredData.customers.map((c: any) => {
          const urgentStatus = dayLabel(c.soonestDays);
          const initials = c.name
            .split(' ')
            .filter(Boolean)
            .slice(-2)
            .map((w: string) => w[0]?.toUpperCase())
            .join('') || 'KH';

          return (
            <Card
              key={c.customerId}
              style={{
                padding: 0,
                overflow: 'hidden',
                border: urgentStatus.isOverdue ? '1px solid #fecaca' : '1px solid var(--border-base)',
              }}
            >
              {/* Customer Header */}
              <div
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  flexWrap: 'wrap',
                  gap: 12,
                  padding: '12px 18px',
                  background: urgentStatus.isOverdue ? '#fef2f2' : 'var(--surface-sunken, #f8fafc)',
                  borderBottom: '1px solid var(--border-base)',
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: 12, minWidth: 0 }}>
                  <div
                    style={{
                      width: 36,
                      height: 36,
                      borderRadius: 8,
                      background: urgentStatus.isOverdue ? '#fee2e2' : '#e0e7ff',
                      color: urgentStatus.isOverdue ? '#b91c1c' : '#3730a3',
                      display: 'grid',
                      placeItems: 'center',
                      fontWeight: 700,
                      fontSize: 13,
                      flexShrink: 0,
                    }}
                  >
                    {initials}
                  </div>
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
                      <Link
                        href={`/customers/${c.customerId}`}
                        style={{ fontSize: 14.5, fontWeight: 700, color: 'var(--text-strong)', textDecoration: 'none' }}
                        className="hover:underline"
                      >
                        {c.name}
                      </Link>
                      {c.code && (
                        <span
                          style={{
                            fontFamily: 'monospace',
                            fontSize: 11,
                            padding: '1px 6px',
                            borderRadius: 4,
                            background: '#ffffff',
                            border: '1px solid #cbd5e1',
                            color: '#475569',
                          }}
                        >
                          {c.code}
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 10 }}>
                      {c.phone ? (
                        <a
                          href={`tel:${c.phone}`}
                          style={{
                            color: 'var(--brand, #2563eb)',
                            textDecoration: 'none',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: 4,
                            fontWeight: 600,
                          }}
                        >
                          <Phone style={{ width: 12, height: 12 }} /> {c.phone}
                        </a>
                      ) : (
                        <span>Chưa có SĐT</span>
                      )}
                      <span>·</span>
                      <span>{c.machines.length} máy cần chăm sóc</span>
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                  <span
                    style={{
                      fontSize: 12,
                      fontWeight: 700,
                      padding: '4px 10px',
                      borderRadius: 999,
                      background: urgentStatus.bg,
                      color: urgentStatus.color,
                      border: `1px solid ${urgentStatus.border}`,
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 4,
                    }}
                  >
                    <urgentStatus.icon style={{ width: 13, height: 13 }} />
                    {c.machines.length} máy · {urgentStatus.text}
                  </span>

                  <Button
                    variant="secondary"
                    size="sm"
                    onClick={() => handleOpenTicket(c.machines[0]?.id)}
                    style={{ fontSize: 12, padding: '4px 10px' }}
                  >
                    Tạo phiếu CSKH
                  </Button>
                </div>
              </div>

              {/* Machine Rows Table */}
              <div style={{ overflowX: 'auto' }}>
                <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
                  <tbody>
                    {c.machines.map((m: any) => {
                      const mUrgency = dayLabel(m.daysLeft);
                      return (
                        <tr
                          key={m.id}
                          style={{
                            borderBottom: '1px solid var(--border-subtle, #f1f5f9)',
                            transition: 'background-color 0.15s ease',
                          }}
                          className="hover:bg-slate-50"
                        >
                          {/* 1. Machine identity */}
                          <td style={{ padding: '12px 18px', minWidth: 260 }}>
                            <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
                              <div
                                style={{
                                  width: 32,
                                  height: 32,
                                  borderRadius: 6,
                                  background: '#f8fafc',
                                  border: '1px solid #e2e8f0',
                                  display: 'grid',
                                  placeItems: 'center',
                                  color: '#64748b',
                                  flexShrink: 0,
                                  marginTop: 2,
                                }}
                              >
                                {getCategoryIcon(m.name)}
                              </div>
                              <div>
                                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                                  <Link
                                    href={`/equipment/${m.id}`}
                                    style={{
                                      fontWeight: 700,
                                      color: 'var(--brand, #2563eb)',
                                      textDecoration: 'none',
                                      fontFamily: 'monospace',
                                      fontSize: 12,
                                      background: '#eff6ff',
                                      padding: '1px 6px',
                                      borderRadius: 4,
                                      border: '1px solid #bfdbfe',
                                    }}
                                    className="hover:underline"
                                  >
                                    {m.machineCode}
                                  </Link>
                                </div>
                                <div style={{ color: 'var(--text-strong)', fontWeight: 600, marginTop: 3 }}>
                                  {m.name}
                                </div>
                                <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2, display: 'flex', alignItems: 'center', gap: 8 }}>
                                  <span>S/N: <strong>{m.serialNumber}</strong></span>
                                  {m.locationName && (
                                    <>
                                      <span>•</span>
                                      <span style={{ display: 'inline-flex', alignItems: 'center', gap: 3 }}>
                                        <MapPin style={{ width: 11, height: 11 }} />
                                        {m.locationName}
                                      </span>
                                    </>
                                  )}
                                </div>
                              </div>
                            </div>
                          </td>

                          {/* 2. Reason tags */}
                          <td style={{ padding: '12px 12px', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                              {m.reasons.map((r: string) => {
                                const cfg = (CARE_REASONS as any)[r];
                                return (
                                  <span
                                    key={r}
                                    style={{
                                      padding: '3px 8px',
                                      borderRadius: 6,
                                      fontSize: 11,
                                      fontWeight: 600,
                                      background: cfg.bg,
                                      color: cfg.color,
                                      border: `1px solid ${cfg.color}22`,
                                    }}
                                  >
                                    {cfg.label}
                                  </span>
                                );
                              })}
                            </div>
                          </td>

                          {/* 3. Schedule Dates */}
                          <td style={{ padding: '12px 12px', whiteSpace: 'nowrap', fontSize: 11.5 }}>
                            <div
                              style={{
                                display: 'inline-block',
                                background: '#f8fafc',
                                padding: '6px 10px',
                                borderRadius: 6,
                                border: '1px solid #e2e8f0',
                                lineHeight: 1.5,
                              }}
                            >
                              <div style={{ color: '#64748b' }}>
                                Bảo hành: <span style={{ fontWeight: 600, color: '#334155' }}>{fmtVN(m.warrantyExpiresAt)}</span>
                              </div>
                              <div style={{ color: '#64748b' }}>
                                Bảo dưỡng: <span style={{ fontWeight: 700, color: mUrgency.isOverdue ? '#dc2626' : '#2563eb' }}>{fmtVN(m.nextPmDate)}</span>
                              </div>
                            </div>
                          </td>

                          {/* 4. Days Left Urgency Badge */}
                          <td style={{ padding: '12px 14px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <span
                              style={{
                                display: 'inline-block',
                                padding: '4px 10px',
                                borderRadius: 6,
                                fontSize: 12,
                                fontWeight: 700,
                                background: mUrgency.bg,
                                color: mUrgency.color,
                                border: `1px solid ${mUrgency.border}`,
                              }}
                            >
                              {mUrgency.text}
                            </span>
                          </td>

                          {/* 5. Action buttons */}
                          <td style={{ padding: '12px 18px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                            <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                              <button
                                type="button"
                                onClick={() => handleOpenTicket(m.id)}
                                title="Tạo phiếu bảo dưỡng / sửa chữa"
                                style={{
                                  padding: '5px 9px',
                                  borderRadius: 6,
                                  border: 'none',
                                  background: '#2563eb',
                                  color: '#ffffff',
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <Wrench style={{ width: 13, height: 13 }} /> Tạo phiếu
                              </button>

                              <button
                                type="button"
                                onClick={() => setRecordDoneMachine(m)}
                                title="Ghi nhận đã hoàn thành bảo dưỡng"
                                style={{
                                  padding: '5px 9px',
                                  borderRadius: 6,
                                  border: '1px solid #bbf7d0',
                                  background: '#f0fdf4',
                                  color: '#166534',
                                  fontSize: 12,
                                  fontWeight: 600,
                                  cursor: 'pointer',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                  gap: 4,
                                }}
                              >
                                <CheckCircle2 style={{ width: 13, height: 13 }} /> Đã bảo dưỡng
                              </button>

                              <Link
                                href={`/equipment/${m.id}`}
                                title="Xem chi tiết thiết bị"
                                style={{
                                  padding: '5px 7px',
                                  borderRadius: 6,
                                  border: '1px solid #e2e8f0',
                                  background: '#ffffff',
                                  color: '#64748b',
                                  display: 'inline-flex',
                                  alignItems: 'center',
                                }}
                              >
                                <ExternalLink style={{ width: 13, height: 13 }} />
                              </Link>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            </Card>
          );
        })}

      {/* 5. Flat View (All machines sorted by urgency) */}
      {viewMode === 'flat' && filteredData.machines.length > 0 && (
        <Card style={{ padding: 0, overflow: 'hidden' }}>
          <div style={{ overflowX: 'auto' }}>
            <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 12.5 }}>
              <thead>
                <tr style={{ background: '#f8fafc', borderBottom: '1px solid #e2e8f0', color: '#64748b', textAlign: 'left', fontSize: 12 }}>
                  <th style={{ padding: '10px 16px', fontWeight: 600 }}>Thiết bị</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Khách hàng & Chi nhánh</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Lưu ý</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600 }}>Hạn bảo dưỡng</th>
                  <th style={{ padding: '10px 12px', fontWeight: 600, textAlign: 'right' }}>Mức độ gấp</th>
                  <th style={{ padding: '10px 16px', fontWeight: 600, textAlign: 'right' }}>Thao tác</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.machines.map((m: any) => {
                  const mUrgency = dayLabel(m.daysLeft);
                  return (
                    <tr
                      key={m.id}
                      style={{ borderBottom: '1px solid #f1f5f9' }}
                      className="hover:bg-slate-50"
                    >
                      <td style={{ padding: '12px 16px', minWidth: 220 }}>
                        <Link
                          href={`/equipment/${m.id}`}
                          style={{
                            fontWeight: 700,
                            color: 'var(--brand, #2563eb)',
                            textDecoration: 'none',
                            fontFamily: 'monospace',
                            fontSize: 12,
                          }}
                          className="hover:underline"
                        >
                          {m.machineCode}
                        </Link>
                        <div style={{ fontWeight: 600, color: 'var(--text-strong)', marginTop: 2 }}>{m.name}</div>
                        <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>S/N: {m.serialNumber}</div>
                      </td>

                      <td style={{ padding: '12px 12px', minWidth: 180 }}>
                        <Link
                          href={`/customers/${m.customerId}`}
                          style={{ fontWeight: 600, color: '#0f172a', textDecoration: 'none' }}
                          className="hover:underline"
                        >
                          {m.customerName}
                        </Link>
                        {m.locationName && (
                          <div style={{ fontSize: 11, color: '#64748b', marginTop: 2, display: 'flex', alignItems: 'center', gap: 3 }}>
                            <MapPin style={{ width: 11, height: 11 }} /> {m.locationName}
                          </div>
                        )}
                      </td>

                      <td style={{ padding: '12px 12px', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' }}>
                          {m.reasons.map((r: string) => {
                            const cfg = (CARE_REASONS as any)[r];
                            return (
                              <span
                                key={r}
                                style={{
                                  padding: '2px 7px',
                                  borderRadius: 4,
                                  fontSize: 10.5,
                                  fontWeight: 600,
                                  background: cfg.bg,
                                  color: cfg.color,
                                }}
                              >
                                {cfg.label}
                              </span>
                            );
                          })}
                        </div>
                      </td>

                      <td style={{ padding: '12px 12px', whiteSpace: 'nowrap', fontSize: 11.5 }}>
                        <div>Hạn BH: {fmtVN(m.warrantyExpiresAt)}</div>
                        <div style={{ fontWeight: 700, color: mUrgency.isOverdue ? '#dc2626' : '#2563eb' }}>
                          Kỳ BD: {fmtVN(m.nextPmDate)}
                        </div>
                      </td>

                      <td style={{ padding: '12px 12px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <span
                          style={{
                            padding: '3px 8px',
                            borderRadius: 6,
                            fontSize: 11.5,
                            fontWeight: 700,
                            background: mUrgency.bg,
                            color: mUrgency.color,
                          }}
                        >
                          {mUrgency.text}
                        </span>
                      </td>

                      <td style={{ padding: '12px 16px', textAlign: 'right', whiteSpace: 'nowrap' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                          <button
                            type="button"
                            onClick={() => handleOpenTicket(m.id)}
                            style={{
                              padding: '5px 8px',
                              borderRadius: 6,
                              border: 'none',
                              background: '#2563eb',
                              color: '#ffffff',
                              fontSize: 11.5,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Tạo phiếu
                          </button>
                          <button
                            type="button"
                            onClick={() => setRecordDoneMachine(m)}
                            style={{
                              padding: '5px 8px',
                              borderRadius: 6,
                              border: '1px solid #bbf7d0',
                              background: '#f0fdf4',
                              color: '#166534',
                              fontSize: 11.5,
                              fontWeight: 600,
                              cursor: 'pointer',
                            }}
                          >
                            Đã BD
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </Card>
      )}

      {/* Ticket Modal */}
      {ticketModalOpen && (
        <TicketModal
          open={ticketModalOpen}
          onClose={() => {
            setTicketModalOpen(false);
            setSelectedTicketEquipmentId(undefined);
          }}
          defaultEquipmentId={selectedTicketEquipmentId}
          equipments={allMachines}
          technicians={technicians}
          onSuccess={() => {
            router.refresh();
          }}
        />
      )}

      {/* Record Maintenance Done Modal */}
      {recordDoneMachine && (
        <MaintenanceRecordModal
          open={Boolean(recordDoneMachine)}
          onClose={() => setRecordDoneMachine(null)}
          machine={recordDoneMachine}
          onSuccess={() => {
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
