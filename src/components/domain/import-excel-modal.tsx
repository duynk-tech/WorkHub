'use client';

import { useRef, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Download, FileSpreadsheet, Upload, CheckCircle2, AlertTriangle } from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button, Badge } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

type Kind = 'customers' | 'spare-parts';

interface Preview {
  totalRows: number;
  validCount: number;
  errorCount: number;
  errors: { row: number; message: string }[];
}
interface Committed {
  created: number; updated: number; skipped: number; invalid: number;
  failed: { row: number; message: string }[];
}

const LABEL: Record<Kind, string> = { customers: 'khách hàng', 'spare-parts': 'phụ tùng' };

/** Nhập Excel: Chọn file → Xem trước (chưa ghi gì) → Kết quả. */
export function ImportExcelModal({ kind, open, onClose }: { kind: Kind; open: boolean; onClose: () => void }) {
  const router = useRouter();
  const toast = useToast();
  const inputRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [result, setResult] = useState<Committed | null>(null);
  const [onDuplicate, setOnDuplicate] = useState<'update' | 'skip'>('update');
  const [busy, setBusy] = useState(false);

  const reset = () => { setFile(null); setPreview(null); setResult(null); if (inputRef.current) inputRef.current.value = ''; };
  const close = () => { reset(); onClose(); };

  const send = async (mode: 'preview' | 'commit', f: File) => {
    const fd = new FormData();
    fd.append('file', f);
    fd.append('mode', mode);
    fd.append('onDuplicate', onDuplicate);
    setBusy(true);
    try {
      const res = await fetch(`/api/import/${kind}`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!data.ok) { toast.error(data.message || 'Không xử lý được file'); return null; }
      return data;
    } catch {
      toast.error('Mất kết nối khi tải file lên');
      return null;
    } finally {
      setBusy(false);
    }
  };

  const pick = async (f: File | undefined) => {
    if (!f) return;
    setFile(f);
    setResult(null);
    setPreview(await send('preview', f));
  };

  const commit = async () => {
    if (!file) return;
    const data = await send('commit', file);
    if (data) {
      setResult(data);
      toast.success(`Đã nhập ${data.created + data.updated} ${LABEL[kind]}`);
      router.refresh();
    }
  };

  const step = result ? 3 : preview ? 2 : 1;

  return (
    <Modal
      open={open}
      onClose={close}
      title={`Nhập ${LABEL[kind]} từ Excel`}
      description={`Bước ${step}/3 · ${step === 1 ? 'Chọn file' : step === 2 ? 'Kiểm tra trước khi ghi' : 'Kết quả'}`}
      size="lg"
      footer={
        step === 3 ? (
          <Button variant="primary" onClick={close}>Xong</Button>
        ) : step === 2 ? (
          <>
            <Button variant="secondary" onClick={reset} disabled={busy}>Chọn file khác</Button>
            <Button variant="primary" onClick={commit} loading={busy} disabled={!preview?.validCount}>
              <Upload /> Nhập {preview?.validCount ?? 0} dòng hợp lệ
            </Button>
          </>
        ) : (
          <Button variant="secondary" onClick={close}>Hủy</Button>
        )
      }
    >
      {step === 1 && (
        <div className="stack" style={{ gap: 14 }}>
          <label
            className="card"
            style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 8, padding: '28px 16px', borderStyle: 'dashed', cursor: 'pointer', textAlign: 'center' }}
            onDragOver={(e) => e.preventDefault()}
            onDrop={(e) => { e.preventDefault(); void pick(e.dataTransfer.files[0]); }}
          >
            <FileSpreadsheet size={28} style={{ color: 'var(--success)' }} />
            <strong style={{ color: 'var(--text-strong)' }}>{busy ? 'Đang đọc file…' : 'Kéo thả file .xlsx vào đây hoặc bấm để chọn'}</strong>
            <span className="hint">Tối đa 5MB, 5.000 dòng. Dòng đầu tiên là tiêu đề cột.</span>
            <input ref={inputRef} type="file" accept=".xlsx" hidden onChange={(e) => void pick(e.target.files?.[0])} />
          </label>
          <div className="row-between" style={{ gap: 12, flexWrap: 'wrap' }}>
            <a href={`/api/import/${kind}/template`} className="btn btn-ghost btn-sm"><Download /> Tải file mẫu</a>
            <label className="row" style={{ gap: 8, fontSize: 13 }}>
              Gặp mã đã có:
              <select className="select input-sm" style={{ width: 'auto' }} value={onDuplicate} onChange={(e) => setOnDuplicate(e.target.value as 'update' | 'skip')}>
                <option value="update">Cập nhật thông tin</option>
                <option value="skip">Bỏ qua, giữ nguyên</option>
              </select>
            </label>
          </div>
        </div>
      )}

      {step === 2 && preview && (
        <div className="stack" style={{ gap: 12 }}>
          <div className="row" style={{ gap: 8, flexWrap: 'wrap' }}>
            <Badge>{file?.name}</Badge>
            <Badge tone="success">{preview.validCount} dòng hợp lệ</Badge>
            {preview.errorCount > 0 && <Badge tone="danger">{preview.errorCount} dòng lỗi</Badge>}
          </div>
          {preview.errorCount > 0 ? (
            <>
              <p className="hint" style={{ margin: 0 }}>Các dòng lỗi sẽ bị bỏ qua. Sửa trong Excel rồi nhập lại nếu cần.</p>
              <div className="table-wrap" style={{ maxHeight: 260, overflow: 'auto' }}>
                <table className="table table-compact">
                  <thead><tr><th style={{ width: 80 }}>Dòng</th><th>Lý do</th></tr></thead>
                  <tbody>
                    {preview.errors.map((e) => (
                      <tr key={e.row}><td className="tnum">{e.row}</td><td style={{ color: 'var(--danger)' }}>{e.message}</td></tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </>
          ) : (
            <div className="alert alert-success"><CheckCircle2 /> Tất cả {preview.validCount} dòng đều hợp lệ. Chưa có gì được ghi — bấm Nhập để lưu.</div>
          )}
        </div>
      )}

      {step === 3 && result && (
        <div className="stack" style={{ gap: 12 }}>
          <div className="grid-stats">
            <div className="card stat-card"><span className="stat-label">Thêm mới</span><span className="stat-value">{result.created}</span></div>
            <div className="card stat-card"><span className="stat-label">Cập nhật</span><span className="stat-value">{result.updated}</span></div>
            <div className="card stat-card"><span className="stat-label">Bỏ qua / lỗi</span><span className="stat-value">{result.skipped + result.failed.length + result.invalid}</span></div>
          </div>
          {result.failed.length > 0 && (
            <div className="alert alert-warning">
              <AlertTriangle />
              <div>{result.failed.slice(0, 10).map((f) => <div key={f.row}>Dòng {f.row}: {f.message}</div>)}</div>
            </div>
          )}
        </div>
      )}
    </Modal>
  );
}
