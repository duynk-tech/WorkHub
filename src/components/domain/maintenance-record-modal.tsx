'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button, Field, Input, Select, Textarea } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { CheckCircle2, Calendar } from 'lucide-react';
import { recordMaintenanceDoneAction } from '@/server/modules/equipment/actions';

function addMonthsToDate(dateStr: string, months: number): string {
  const d = new Date(dateStr);
  d.setMonth(d.getMonth() + months);
  return d.toISOString().split('T')[0];
}

export function MaintenanceRecordModal({
  open,
  onClose,
  machine,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  machine?: {
    id: number;
    machineCode: string;
    name: string;
    serialNumber?: string;
    locationName?: string | null;
  } | null;
  onSuccess?: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const todayStr = new Date().toISOString().split('T')[0];
  const [doneDate, setDoneDate] = useState(todayStr);
  const [intervalOption, setIntervalOption] = useState<'3' | '1' | '6' | '12' | 'custom'>('3');
  const [customNextDate, setCustomNextDate] = useState(addMonthsToDate(todayStr, 3));
  const [technicianName, setTechnicianName] = useState('');
  const [notes, setNotes] = useState('');

  if (!machine) return null;

  const calculatedNextDate =
    intervalOption === 'custom'
      ? customNextDate
      : addMonthsToDate(doneDate, Number(intervalOption));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!machine) return;

    setLoading(true);
    try {
      const res = await recordMaintenanceDoneAction({
        equipmentId: machine.id,
        doneDate,
        nextPmDate: calculatedNextDate,
        technicianName: technicianName.trim() || undefined,
        notes: notes.trim() || undefined,
      });

      if (res.ok) {
        toast.success(res.message);
        onSuccess?.();
        onClose();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi lưu bảo dưỡng');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Ghi Nhận Đã Bảo Dưỡng Máy"
      description="Cập nhật mốc bảo dưỡng thực tế và tự động tính toán kỳ bảo dưỡng tiếp theo."
      size="md"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        {/* Machine summary box */}
        <div
          style={{
            padding: '12px 14px',
            borderRadius: 'var(--radius-md, 8px)',
            background: 'var(--surface-sunken, #f8fafc)',
            border: '1px solid var(--border-base, #e2e8f0)',
          }}
        >
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            <span
              style={{
                fontFamily: 'monospace',
                fontWeight: 700,
                fontSize: 12,
                color: 'var(--brand, #2563eb)',
                background: '#eff6ff',
                padding: '2px 8px',
                borderRadius: 4,
                border: '1px solid #bfdbfe',
              }}
            >
              {machine.machineCode}
            </span>
            <span style={{ fontWeight: 600, fontSize: 13, color: 'var(--text-strong)' }}>
              {machine.name}
            </span>
          </div>
          {(machine.serialNumber || machine.locationName) && (
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
              {[
                machine.serialNumber ? `S/N: ${machine.serialNumber}` : '',
                machine.locationName ? `Điểm đặt: ${machine.locationName}` : '',
              ]
                .filter(Boolean)
                .join(' · ')}
            </div>
          )}
        </div>

        {/* Date inputs */}
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
          <Field label="Ngày thực hiện bảo dưỡng" required>
            <Input
              type="date"
              value={doneDate}
              onChange={(e) => {
                setDoneDate(e.target.value);
                if (intervalOption !== 'custom') {
                  setCustomNextDate(addMonthsToDate(e.target.value, Number(intervalOption)));
                }
              }}
              required
            />
          </Field>

          <Field label="Chu kỳ bảo dưỡng kế tiếp">
            <Select
              value={intervalOption}
              onChange={(e) => {
                const opt = e.target.value as any;
                setIntervalOption(opt);
                if (opt !== 'custom') {
                  setCustomNextDate(addMonthsToDate(doneDate, Number(opt)));
                }
              }}
            >
              <option value="3">+3 tháng (Định kỳ khuyến nghị)</option>
              <option value="1">+1 tháng (Máy tần suất cao)</option>
              <option value="6">+6 tháng</option>
              <option value="12">+12 tháng (1 năm)</option>
              <option value="custom">Tùy chọn ngày khác</option>
            </Select>
          </Field>
        </div>

        {intervalOption === 'custom' && (
          <Field label="Ngày bảo dưỡng tiếp theo (Tự chọn)" required>
            <Input
              type="date"
              value={customNextDate}
              onChange={(e) => setCustomNextDate(e.target.value)}
              required
            />
          </Field>
        )}

        {/* Calculated Next Date Pill */}
        <div
          style={{
            padding: '8px 12px',
            borderRadius: 6,
            background: '#f0fdf4',
            border: '1px solid #bbf7d0',
            fontSize: 12.5,
            color: '#166534',
            display: 'flex',
            alignItems: 'center',
            gap: 8,
          }}
        >
          <Calendar style={{ width: 16, height: 16, flexShrink: 0, color: '#16a34a' }} />
          <span>
            Lịch bảo dưỡng tiếp theo được đặt vào: <strong>{new Date(calculatedNextDate).toLocaleDateString('vi-VN')}</strong>
          </span>
        </div>

        <Field label="Kỹ thuật viên thực hiện">
          <Input
            placeholder="Ví dụ: KTV Nam / Đội bảo trì F&B"
            value={technicianName}
            onChange={(e) => setTechnicianName(e.target.value)}
          />
        </Field>

        <Field label="Ghi chú công việc đã làm & tình trạng bàn giao">
          <Textarea
            rows={3}
            placeholder="Ví dụ: Đã vệ sinh vòi xả, tra mỡ an toàn thực phẩm bộ truyền động, cân chỉnh áp suất bơm, máy hoạt động êm..."
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
          />
        </Field>

        <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 10, marginTop: 8 }}>
          <Button variant="secondary" type="button" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button variant="primary" type="submit" disabled={loading}>
            <CheckCircle2 style={{ width: 16, height: 16, marginRight: 6 }} />
            {loading ? 'Đang lưu...' : 'Xác nhận hoàn thành'}
          </Button>
        </div>
      </form>
    </Modal>
  );
}
