'use client';

import { useEffect, useState, useTransition } from 'react';
import { CalendarDays, Info, AlertTriangle, Send, Save } from 'lucide-react';
import { Button, Field, Input, Select, Textarea, Badge, Alert } from '@/components/ui';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { LEAVE_DURATION } from '@/lib/enums';
import { formatDays } from '@/lib/utils';
import { fmtDate } from '@/lib/date';
import { submitLeaveAction, previewLeaveDaysAction } from '@/server/modules/leave/actions';

/* eslint-disable @typescript-eslint/no-explicit-any */
interface Props {
  open: boolean;
  onClose: () => void;
  leaveTypes: any[];
  employees: { id: number; fullName: string; code: string }[];
  remaining: number;
  onSaved: () => void;
  initial?: any;
}

const today = () => new Date().toISOString().slice(0, 10);

export function LeaveRequestModal({ open, onClose, leaveTypes, employees, remaining, onSaved, initial }: Props) {
  const toast = useToast();
  const [pending, startTransition] = useTransition();
  const [form, setForm] = useState({
    leaveTypeId: leaveTypes[0]?.id ?? 0,
    startDate: today(),
    endDate: today(),
    durationType: 'FULL_DAY',
    reason: '',
    handoverToId: null as number | null,
    handoverNote: '',
    contactDuringLeave: '',
    attachmentUrl: '',
    attachmentName: '',
  });
  const [preview, setPreview] = useState<{ totalDays: number; skipped: { date: string; reason: string }[] } | null>(null);

  const selectedType = leaveTypes.find((t) => t.id === Number(form.leaveTypeId));
  const isSingleDay = form.startDate === form.endDate;

  useEffect(() => {
    if (open) {
      setForm((f) => ({ ...f, ...(initial ?? {}), leaveTypeId: initial?.leaveTypeId ?? leaveTypes[0]?.id ?? 0 }));
      setPreview(null);
    }
  }, [open, initial, leaveTypes]);

  // Tính lại số ngày mỗi khi khoảng thời gian thay đổi
  useEffect(() => {
    if (!open || !form.startDate || !form.endDate) return;
    let cancelled = false;
    (async () => {
      const res = await previewLeaveDaysAction(form.startDate, form.endDate, form.durationType);
      if (!cancelled && res.ok) setPreview({ totalDays: res.totalDays, skipped: res.skipped });
    })();
    return () => { cancelled = true; };
  }, [open, form.startDate, form.endDate, form.durationType]);

  const submit = (doSubmit: boolean) => {
    startTransition(async () => {
      const res = await submitLeaveAction(initial?.id ?? null, { ...form, leaveTypeId: Number(form.leaveTypeId), submit: doSubmit });
      if (res.ok) { toast.success(res.message); onSaved(); }
      else toast.error(res.message);
    });
  };

  const exceedsBalance = selectedType?.deductsBalance && preview && preview.totalDays > remaining;

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Tạo đơn xin nghỉ phép"
      description="Đơn sẽ đi qua quy trình duyệt được cấu hình cho loại nghỉ và phòng ban của bạn"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>Hủy</Button>
          <Button variant="secondary" onClick={() => submit(false)} loading={pending}><Save /> Lưu nháp</Button>
          <Button variant="primary" onClick={() => submit(true)} loading={pending} disabled={!form.reason.trim()}>
            <Send /> Nộp đơn
          </Button>
        </>
      }
    >
      <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Loại nghỉ phép" required className="span-2" hint={selectedType?.description}>
          <Select value={form.leaveTypeId} onChange={(e) => setForm((f) => ({ ...f, leaveTypeId: Number(e.target.value) }))}>
            {leaveTypes.map((t) => <option key={t.id} value={t.id}>{t.name}{t.isPaid ? '' : ' (không lương)'}</option>)}
          </Select>
        </Field>

        <Field label="Từ ngày" required>
          <Input
            type="date" value={form.startDate}
            onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value, endDate: f.endDate < e.target.value ? e.target.value : f.endDate }))}
          />
        </Field>

        <Field label="Đến ngày" required>
          <Input type="date" min={form.startDate} value={form.endDate} onChange={(e) => setForm((f) => ({ ...f, endDate: e.target.value }))} />
        </Field>

        {isSingleDay && selectedType?.allowHalfDay && (
          <Field label="Thời lượng" className="span-2">
            <Select value={form.durationType} onChange={(e) => setForm((f) => ({ ...f, durationType: e.target.value }))}>
              {Object.entries(LEAVE_DURATION).map(([k, v]) => <option key={k} value={k}>{v}</option>)}
            </Select>
          </Field>
        )}

        <div className="span-2">
          {preview && (
            <Alert tone={exceedsBalance ? 'danger' : 'info'} icon={exceedsBalance ? <AlertTriangle /> : <CalendarDays />}>
              <b>{formatDays(preview.totalDays)} ngày nghỉ thực tế</b>
              {selectedType?.deductsBalance && <> · quỹ phép khả dụng {formatDays(remaining)} ngày</>}
              {exceedsBalance && <div style={{ marginTop: 3 }}>Vượt quá quỹ phép hiện có.</div>}
              {preview.skipped.length > 0 && (
                <div style={{ marginTop: 5, fontSize: 12 }}>
                  Đã loại trừ: {preview.skipped.slice(0, 4).map((s) => `${fmtDate(s.date, 'dd/MM')} (${s.reason})`).join(', ')}
                  {preview.skipped.length > 4 && ` và ${preview.skipped.length - 4} ngày khác`}
                </div>
              )}
            </Alert>
          )}
        </div>

        <Field label="Lý do nghỉ" required className="span-2">
          <Textarea rows={2} value={form.reason} onChange={(e) => setForm((f) => ({ ...f, reason: e.target.value }))} placeholder="Trình bày ngắn gọn lý do xin nghỉ" />
        </Field>

        <Field label="Bàn giao công việc cho" hint="Người này cũng nhận thông báo khi đơn được duyệt">
          <Select value={form.handoverToId ?? ''} onChange={(e) => setForm((f) => ({ ...f, handoverToId: e.target.value ? Number(e.target.value) : null }))}>
            <option value="">— Không bàn giao —</option>
            {employees.map((e) => <option key={e.id} value={e.id}>{e.fullName}</option>)}
          </Select>
        </Field>

        <Field label="Liên hệ khi cần" hint="Số điện thoại trong thời gian nghỉ">
          <Input value={form.contactDuringLeave} onChange={(e) => setForm((f) => ({ ...f, contactDuringLeave: e.target.value }))} />
        </Field>

        <Field label="Nội dung bàn giao" className="span-2">
          <Textarea rows={2} value={form.handoverNote} onChange={(e) => setForm((f) => ({ ...f, handoverNote: e.target.value }))} placeholder="Công việc đang dở, đầu mối liên hệ…" />
        </Field>

        {selectedType?.requiresAttachment && (
          <Field
            label="Đường dẫn giấy tờ đính kèm" required className="span-2"
            hint="Loại nghỉ này bắt buộc có giấy tờ (giấy khám bệnh, quyết định…)"
          >
            <Input
              value={form.attachmentUrl}
              onChange={(e) => setForm((f) => ({ ...f, attachmentUrl: e.target.value, attachmentName: e.target.value.split('/').pop() ?? '' }))}
              placeholder="https://drive.google.com/..."
            />
          </Field>
        )}

        {selectedType && (
          <div className="span-2 row" style={{ gap: 6, flexWrap: 'wrap' }}>
            <Badge tone={selectedType.isPaid ? 'success' : 'neutral'}>{selectedType.isPaid ? 'Có hưởng lương' : 'Không lương'}</Badge>
            <Badge tone={selectedType.deductsBalance ? 'warning' : 'outline'}>{selectedType.deductsBalance ? 'Trừ quỹ phép' : 'Không trừ quỹ phép'}</Badge>
            {selectedType.minAdvanceDays > 0 && <Badge tone="outline"><Info size={11} /> Báo trước {selectedType.minAdvanceDays} ngày</Badge>}
            {selectedType.maxConsecutiveDays && <Badge tone="outline">Tối đa {selectedType.maxConsecutiveDays} ngày liên tục</Badge>}
          </div>
        )}
      </div>
    </Modal>
  );
}
