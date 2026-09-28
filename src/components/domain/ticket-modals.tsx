'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button, Field, Input, Select, Textarea, PriceInput, SearchableSelect } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { CheckCircle2, ShieldCheck } from 'lucide-react';
import { TICKET_PRIORITIES } from '@/server/modules/equipment/types';
import { saveTicketAction, closeTicketWithBillingAction } from '@/server/modules/equipment/ticket-actions';

const fmt = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));

/** Mức độ ưu tiên dùng khi tạo phiếu; không cam kết thời gian xử lý. */
const PRIORITY_CHOICES = ['P1_CRITICAL', 'P2_MAJOR', 'MEDIUM', 'P3_ROUTINE'];

// ── Tạo / sửa phiếu sự cố ───────────────────────────────────────
export function TicketModal({
  open,
  onClose,
  ticket,
  equipments = [],
  technicians = [],
  defaultEquipmentId,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  ticket?: any;
  equipments?: any[];
  technicians?: any[];
  defaultEquipmentId?: number;
  onSuccess?: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const [equipmentId, setEquipmentId] = useState<number | ''>(
    ticket?.equipmentId || defaultEquipmentId || equipments[0]?.id || '',
  );
  const [priority, setPriority] = useState(ticket?.priority || 'MEDIUM');
  const [title, setTitle] = useState(ticket?.title || '');
  const [description, setDescription] = useState(ticket?.description || '');
  const [reportedBy, setReportedBy] = useState(ticket?.reportedBy || '');
  const [reportedPhone, setReportedPhone] = useState(ticket?.reportedPhone || '');
  const [assignedToId, setAssignedToId] = useState<number | ''>(ticket?.assignedToId || '');

  const machine = equipments.find((e: any) => e.id === Number(equipmentId));
  const underWarranty =
    machine?.warrantyExpiresAt && new Date(machine.warrantyExpiresAt) >= new Date();

  const handleSave = async () => {
    if (!equipmentId) {
      toast.error('Vui lòng chọn máy bị sự cố');
      return;
    }
    if (!title.trim()) {
      toast.error('Vui lòng nhập nội dung sự cố');
      return;
    }

    setLoading(true);
    const res = await saveTicketAction(ticket ? ticket.id : null, {
      equipmentId: Number(equipmentId),
      customerId: machine?.customerId || machine?.customer?.id || null,
      locationId: machine?.locationId || machine?.location?.id || null,
      priority,
      title,
      description,
      reportedBy,
      reportedPhone,
      assignedToId: assignedToId ? Number(assignedToId) : null,
    });
    setLoading(false);

    if (res.ok) {
      toast.success(res.message);
      onSuccess?.();
      onClose();
    } else toast.error(res.message);
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={ticket ? `Sửa phiếu sự cố: ${ticket.ticketCode}` : 'Tiếp nhận sự cố mới'}
      description="Ghi nhận báo hỏng từ khách, hệ thống tự tính hạn cam kết theo mức ưu tiên"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button variant="primary" onClick={handleSave} loading={loading}>
            {ticket ? 'Lưu phiếu' : 'Tạo phiếu sự cố'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <div style={{ display: 'grid', gridTemplateColumns: '1.4fr 1fr', gap: 12 }}>
          <Field label="Máy bị sự cố" required>
            <SearchableSelect
              value={equipmentId ? String(equipmentId) : ''}
              onChange={(val) => setEquipmentId(val ? Number(val) : '')}
              disabled={Boolean(ticket)}
              placeholder="-- Chọn máy --"
              searchPlaceholder="Tìm theo mã máy, tên máy, serial hoặc khách hàng…"
              emptyText="Không tìm thấy máy phù hợp"
              options={equipments.map((m: any) => ({
                value: String(m.id),
                label: `${m.machineCode} · ${m.name}`,
                subLabel: [m.customer?.name, m.location?.name, m.serialNumber && `SN: ${m.serialNumber}`]
                  .filter(Boolean)
                  .join(' · '),
                // Gõ được cả serial và tên hãng dù hai thứ đó không hiện trên dòng chọn
                keywords: [m.serialNumber, m.manufacturer, m.category, m.customer?.name]
                  .filter(Boolean)
                  .join(' '),
              }))}
            />
          </Field>

          <Field label="Mức độ ưu tiên">
            <Select value={priority} onChange={(e) => setPriority(e.target.value)}>
              {PRIORITY_CHOICES.map((code) => (
                <option key={code} value={code}>
                  {TICKET_PRIORITIES[code]?.label}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        {machine && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderRadius: 'var(--radius-md)',
              background: underWarranty ? '#dcfce7' : '#fef3c7',
              color: underWarranty ? '#15803d' : '#92400e',
              fontSize: 12.5,
            }}
          >
            <ShieldCheck size={15} />
            {underWarranty
              ? `Máy còn bảo hành đến ${new Date(machine.warrantyExpiresAt).toLocaleDateString('vi-VN')} — sửa chữa không thu tiền.`
              : machine.warrantyExpiresAt
                ? `Máy hết bảo hành từ ${new Date(machine.warrantyExpiresAt).toLocaleDateString('vi-VN')} — ca sửa này có thể thu tiền.`
                : 'Máy chưa khai hạn bảo hành — kiểm tra trước khi báo giá sửa chữa.'}
          </div>
        )}

        <Field label="Nội dung sự cố" required>
          <Input
            placeholder="VD: Máy không lên nguồn, báo lỗi E03"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
          />
        </Field>

        <Field label="Mô tả chi tiết">
          <Textarea
            rows={3}
            placeholder="Hiện tượng, thời điểm xảy ra, đã thử xử lý gì..."
            value={description}
            onChange={(e) => setDescription(e.target.value)}
          />
        </Field>

        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
          <Field label="Người báo hỏng">
            <Input
              placeholder="VD: Chị Mai - quản lý ca"
              value={reportedBy}
              onChange={(e) => setReportedBy(e.target.value)}
            />
          </Field>
          <Field label="Số điện thoại">
            <Input value={reportedPhone} onChange={(e) => setReportedPhone(e.target.value)} />
          </Field>
          <Field label="Kỹ thuật viên phụ trách">
            <Select
              value={assignedToId}
              onChange={(e) => setAssignedToId(e.target.value ? Number(e.target.value) : '')}
            >
              <option value="">-- Phân công sau --</option>
              {technicians.map((t: any) => (
                <option key={t.id} value={t.id}>
                  {t.fullName}
                </option>
              ))}
            </Select>
          </Field>
        </div>
      </div>
    </Modal>
  );
}

// ── Nghiệm thu & đóng phiếu ─────────────────────────────────────
export function TicketCloseModal({
  open,
  onClose,
  ticket,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  ticket: any;
  onSuccess?: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);

  const underWarranty =
    ticket?.equipment?.warrantyExpiresAt &&
    new Date(ticket.equipment.warrantyExpiresAt) >= new Date();

  const [resolutionNote, setResolutionNote] = useState(ticket?.resolutionNote || '');
  // Còn bảo hành thì mặc định không thu tiền
  const [billing, setBilling] = useState(!underWarranty);
  const [laborFee, setLaborFee] = useState<number>(0);
  const [billParts, setBillParts] = useState(!underWarranty);
  const [vatRate, setVatRate] = useState('0');

  const parts: any[] = ticket?.partsUsed || [];
  const partsCost = parts.reduce(
    (sum, p) => sum + Number(p.unitCost || p.unitPrice || 0) * p.quantity,
    0,
  );
  const partsRevenue = parts.reduce(
    (sum, p) => sum + Number(p.item?.sellingPrice || p.unitPrice || 0) * p.quantity,
    0,
  );
  const billedGoods = (billParts ? partsRevenue : 0) + (Number(laborFee) || 0);
  const vatAmount = Math.round((billedGoods * (Number(vatRate) || 0)) / 100);

  const handleClose = async () => {
    if (!resolutionNote.trim()) {
      toast.error('Vui lòng ghi kết quả xử lý trước khi đóng phiếu');
      return;
    }

    setLoading(true);
    const res = await closeTicketWithBillingAction(ticket.id, {
      resolutionNote,
      laborFee: billing ? Number(laborFee) || 0 : 0,
      billParts: billing && billParts,
      vatRate: billing ? Number(vatRate) || 0 : 0,
    });
    setLoading(false);

    if (res.ok) {
      toast.success(res.message);
      onSuccess?.();
      onClose();
    } else toast.error(res.message);
  };

  if (!ticket) return null;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Nghiệm thu & đóng phiếu: ${ticket.ticketCode}`}
      description="Ghi kết quả xử lý, chọn có thu tiền hay bảo hành miễn phí"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button variant="primary" onClick={handleClose} loading={loading}>
            <CheckCircle2 size={14} style={{ marginRight: 6 }} /> Đóng phiếu
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Kết quả xử lý" required>
          <Textarea
            rows={3}
            placeholder="VD: Đã thay bo mạch nguồn, chạy thử 30 phút ổn định"
            value={resolutionNote}
            onChange={(e) => setResolutionNote(e.target.value)}
          />
        </Field>

        {parts.length > 0 && (
          <div
            style={{
              padding: '10px 12px',
              borderRadius: 'var(--radius-md)',
              background: 'var(--surface-sunken)',
              border: '1px solid var(--border-base)',
              fontSize: 12.5,
            }}
          >
            <div style={{ fontWeight: 700, color: 'var(--text-strong)', marginBottom: 6 }}>
              Linh kiện đã xuất kho cho ca này
            </div>
            {parts.map((p) => (
              <div key={p.id} style={{ display: 'flex', justifyContent: 'space-between', gap: 8 }}>
                <span>
                  {p.item?.name} × {p.quantity} {p.item?.unit}
                </span>
                <span style={{ color: 'var(--text-muted)' }}>
                  giá vốn {fmt(Number(p.unitCost || p.unitPrice || 0) * p.quantity)} ₫
                </span>
              </div>
            ))}
            <div style={{ marginTop: 6, color: 'var(--text-muted)' }}>
              Tổng giá vốn <strong style={{ color: 'var(--text-strong)' }}>{fmt(partsCost)} ₫</strong>
            </div>
          </div>
        )}

        <label
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 8,
            padding: '10px 12px',
            borderRadius: 'var(--radius-md)',
            background: billing ? '#fef3c7' : '#dcfce7',
            color: billing ? '#92400e' : '#15803d',
            fontSize: 13,
            cursor: 'pointer',
          }}
        >
          <input type="checkbox" checked={billing} onChange={(e) => setBilling(e.target.checked)} />
          {billing
            ? 'Có thu tiền — hệ thống sẽ lập đơn dịch vụ cho khách'
            : `Bảo hành miễn phí${underWarranty ? ' (máy còn hạn bảo hành)' : ''} — không lập đơn`}
        </label>

        {billing && (
          <>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <Field label="Tiền công sửa chữa (₫)">
                <PriceInput value={laborFee} onChange={(v) => setLaborFee(v || 0)} placeholder="0" />
              </Field>
              <Field label="Thuế VAT (%)">
                <Input
                  type="number"
                  min="0"
                  max="100"
                  step="0.5"
                  value={vatRate}
                  onChange={(e) => setVatRate(e.target.value)}
                />
              </Field>
            </div>

            {parts.length > 0 && (
              <label style={{ display: 'flex', alignItems: 'center', gap: 8, fontSize: 13 }}>
                <input
                  type="checkbox"
                  checked={billParts}
                  onChange={(e) => setBillParts(e.target.checked)}
                />
                Thu tiền cả linh kiện đã thay ({fmt(partsRevenue)} ₫ theo giá bán)
              </label>
            )}

            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: 4,
                alignItems: 'flex-end',
                paddingTop: 10,
                borderTop: '1px dashed var(--border-base)',
                fontSize: 13,
              }}
            >
              <span style={{ color: 'var(--text-muted)' }}>
                Tiền hàng: <strong style={{ color: 'var(--text-strong)' }}>{fmt(billedGoods)} ₫</strong>
              </span>
              {vatAmount > 0 && (
                <span style={{ color: 'var(--text-muted)' }}>
                  VAT {vatRate}%: <strong style={{ color: 'var(--text-strong)' }}>{fmt(vatAmount)} ₫</strong>
                </span>
              )}
              <span style={{ fontSize: 16, fontWeight: 700, color: 'var(--brand)' }}>
                Khách phải trả: {fmt(billedGoods + vatAmount)} ₫
              </span>
              {billedGoods > 0 && (
                <span style={{ fontSize: 12, color: '#16a34a' }}>
                  Lãi gộp ca sửa: {fmt(billedGoods - (billParts ? partsCost : 0))} ₫
                </span>
              )}
            </div>
          </>
        )}
      </div>
    </Modal>
  );
}
