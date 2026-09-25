'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import { Button, Field, Input, Select, SearchableSelect, Textarea } from '@/components/ui';
import { generateQrSvg, generateQrDataUrl } from '@/lib/qrcode';
import {
  ASSET_CATEGORIES,
  ASSET_STATUSES,
  UPGRADE_COMPONENTS,
  MAINTENANCE_TYPES,
  LIQUIDATION_TYPES,
} from '@/server/modules/asset/service';
import {
  saveAssetAction,
  assignAssetAction,
  revokeAssetAction,
  addUpgradeAction,
  addMaintenanceAction,
  completeMaintenanceAction,
  liquidateAssetAction,
} from '@/server/modules/asset/actions';
import { useToast } from '@/components/ui/toast';
import { Printer, QrCode } from 'lucide-react';

/* ── 1. MODAL THÊM / SỬA THIẾT BỊ ────────────────────────────── */
export function AssetFormModal({
  open,
  onClose,
  asset,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  asset?: any;
  onSuccess?: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'info' | 'specs' | 'purchase'>('info');

  const [name, setName] = useState(asset?.name || '');
  const [assetCode, setAssetCode] = useState(asset?.assetCode || '');
  const [category, setCategory] = useState(asset?.category || 'LAPTOP');
  const [brand, setBrand] = useState(asset?.brand || '');
  const [model, setModel] = useState(asset?.model || '');
  const [serialNumber, setSerialNumber] = useState(asset?.serialNumber || '');
  const [location, setLocation] = useState(asset?.location || '');
  const [status, setStatus] = useState(asset?.status || 'IN_STOCK');
  const [notes, setNotes] = useState(asset?.notes || '');

  // Specs
  const currentSpecs = asset?.specs || {};
  const [cpu, setCpu] = useState(currentSpecs.cpu || '');
  const [ram, setRam] = useState(currentSpecs.ram || '');
  const [storage, setStorage] = useState(currentSpecs.storage || '');
  const [gpu, setGpu] = useState(currentSpecs.gpu || '');
  const [os, setOs] = useState(currentSpecs.os || '');
  const [screen, setScreen] = useState(currentSpecs.screen || '');
  const [otherSpecs, setOtherSpecs] = useState(currentSpecs.other || '');

  // Purchase & Warranty
  const [purchaseDate, setPurchaseDate] = useState(
    asset?.purchaseDate ? new Date(asset.purchaseDate).toISOString().slice(0, 10) : '',
  );
  const [purchasePrice, setPurchasePrice] = useState(asset?.purchasePrice != null ? String(asset.purchasePrice) : '');
  const [supplier, setSupplier] = useState(asset?.supplier || '');
  const [warrantyMonths, setWarrantyMonths] = useState(asset?.warrantyMonths != null ? String(asset.warrantyMonths) : '12');
  const [warrantyExpiresAt, setWarrantyExpiresAt] = useState(
    asset?.warrantyExpiresAt ? new Date(asset.warrantyExpiresAt).toISOString().slice(0, 10) : '',
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Vui lòng nhập tên thiết bị');
      return;
    }

    setLoading(true);
    const payload = {
      name: name.trim(),
      assetCode: assetCode.trim() || undefined,
      category,
      brand: brand.trim() || undefined,
      model: model.trim() || undefined,
      serialNumber: serialNumber.trim() || undefined,
      status,
      location: location.trim() || undefined,
      notes: notes.trim() || undefined,
      specs: {
        cpu: cpu.trim() || undefined,
        ram: ram.trim() || undefined,
        storage: storage.trim() || undefined,
        gpu: gpu.trim() || undefined,
        os: os.trim() || undefined,
        screen: screen.trim() || undefined,
        other: otherSpecs.trim() || undefined,
      },
      purchaseDate: purchaseDate || undefined,
      purchasePrice: purchasePrice ? Number(purchasePrice) : undefined,
      supplier: supplier.trim() || undefined,
      warrantyMonths: warrantyMonths ? Number(warrantyMonths) : undefined,
      warrantyExpiresAt: warrantyExpiresAt || undefined,
    };

    const res = await saveAssetAction(asset ? asset.id : null, payload);
    setLoading(false);

    if (res.ok) {
      toast.success(res.message);
      onSuccess?.();
      onClose();
    } else {
      toast.error(res.message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={asset ? `Chỉnh sửa thiết bị: ${asset.assetCode}` : 'Thêm thiết bị mới'}
      description="Quản lý hồ sơ thiết bị, thông số cấu hình và bảo hành"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={loading}>
            {asset ? 'Lưu thay đổi' : 'Tạo thiết bị'}
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', marginBottom: 16, paddingBottom: 6 }}>
        <button
          type="button"
          className={`tab-item ${activeTab === 'info' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('info')}
          style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: activeTab === 'info' ? 'var(--primary-subtle, #e0f2fe)' : 'transparent', color: activeTab === 'info' ? 'var(--primary, #0284c7)' : 'var(--text-muted)', fontWeight: activeTab === 'info' ? 600 : 400, cursor: 'pointer' }}
        >
          1. Thông tin chung
        </button>
        <button
          type="button"
          className={`tab-item ${activeTab === 'specs' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('specs')}
          style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: activeTab === 'specs' ? 'var(--primary-subtle, #e0f2fe)' : 'transparent', color: activeTab === 'specs' ? 'var(--primary, #0284c7)' : 'var(--text-muted)', fontWeight: activeTab === 'specs' ? 600 : 400, cursor: 'pointer' }}
        >
          2. Cấu hình phần cứng
        </button>
        <button
          type="button"
          className={`tab-item ${activeTab === 'purchase' ? 'tab-active' : ''}`}
          onClick={() => setActiveTab('purchase')}
          style={{ padding: '6px 14px', borderRadius: 6, border: 'none', background: activeTab === 'purchase' ? 'var(--primary-subtle, #e0f2fe)' : 'transparent', color: activeTab === 'purchase' ? 'var(--primary, #0284c7)' : 'var(--text-muted)', fontWeight: activeTab === 'purchase' ? 600 : 400, cursor: 'pointer' }}
        >
          3. Mua hàng & Bảo hành
        </button>
      </div>

      {activeTab === 'info' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Tên thiết bị *" required>
              <Input
                placeholder="VD: MacBook Pro 16 M2 Pro 2023, Dell XPS 15 9520..."
                value={name}
                onChange={(e) => setName(e.target.value)}
              />
            </Field>
          </div>

          <Field label="Mã tài sản (để trống tự sinh AST-YYYY-XXXX)">
            <Input
              placeholder="VD: AST-2026-0001, LAP-DEV-01..."
              value={assetCode}
              onChange={(e) => setAssetCode(e.target.value)}
            />
          </Field>

          <Field label="Loại thiết bị *" required>
            <Select value={category} onChange={(e) => setCategory(e.target.value)}>
              {Object.entries(ASSET_CATEGORIES).map(([key, val]) => (
                <option key={key} value={key}>
                  {val.label}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Hãng sản xuất (Brand)">
            <Input placeholder="Apple, Dell, Asus, Lenovo, HP, LG..." value={brand} onChange={(e) => setBrand(e.target.value)} />
          </Field>

          <Field label="Model / Dòng máy">
            <Input placeholder="A2780, Latitude 7420..." value={model} onChange={(e) => setModel(e.target.value)} />
          </Field>

          <Field label="Số Sê-ri (Serial Number)">
            <Input placeholder="VD: C02G41KSMD6T, 8J3X9Q2..." value={serialNumber} onChange={(e) => setSerialNumber(e.target.value)} />
          </Field>

          <Field label="Trạng thái">
            <Select value={status} onChange={(e) => setStatus(e.target.value)}>
              {Object.entries(ASSET_STATUSES).map(([key, val]) => (
                <option key={key} value={key}>
                  {val.label}
                </option>
              ))}
            </Select>
          </Field>

          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Vị trí lưu giữ hiện tại">
              <Input placeholder="Kho IT Tầng 3, Bàn làm việc Phòng Kỹ thuật, WFA..." value={location} onChange={(e) => setLocation(e.target.value)} />
            </Field>
          </div>

          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Ghi chú thêm">
              <Textarea rows={2} placeholder="Tình trạng ngoại quan, phụ kiện kèm theo..." value={notes} onChange={(e) => setNotes(e.target.value)} />
            </Field>
          </div>
        </div>
      )}

      {activeTab === 'specs' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Bộ vi xử lý (CPU)">
            <Input placeholder="Apple M2 Pro 12-Core, Intel Core i7-13700H, AMD Ryzen 7..." value={cpu} onChange={(e) => setCpu(e.target.value)} />
          </Field>

          <Field label="Bộ nhớ RAM">
            <Input placeholder="16GB Unified, 32GB DDR5 4800MHz..." value={ram} onChange={(e) => setRam(e.target.value)} />
          </Field>

          <Field label="Ổ cứng (Storage)">
            <Input placeholder="512GB NVMe SSD, 1TB Apple SSD..." value={storage} onChange={(e) => setStorage(e.target.value)} />
          </Field>

          <Field label="Card đồ họa (GPU)">
            <Input placeholder="Apple 19-Core GPU, NVIDIA RTX 4060 8GB..." value={gpu} onChange={(e) => setGpu(e.target.value)} />
          </Field>

          <Field label="Màn hình (Screen)">
            <Input placeholder='16.2" Liquid Retina XDR 120Hz, 15.6" FHD IPS...' value={screen} onChange={(e) => setScreen(e.target.value)} />
          </Field>

          <Field label="Hệ điều hành (OS)">
            <Input placeholder="macOS Sequoia 15, Windows 11 Pro, Ubuntu 24.04..." value={os} onChange={(e) => setOs(e.target.value)} />
          </Field>

          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Thông số khác (Màu sắc, bàn phím, kết nối...)">
              <Input placeholder="Space Gray, bàn phím US, có kèm sạc 140W MagSafe 3..." value={otherSpecs} onChange={(e) => setOtherSpecs(e.target.value)} />
            </Field>
          </div>
        </div>
      )}

      {activeTab === 'purchase' && (
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
          <Field label="Ngày mua">
            <Input type="date" value={purchaseDate} onChange={(e) => setPurchaseDate(e.target.value)} />
          </Field>

          <Field label="Nguyên giá (VNĐ)">
            <Input type="number" placeholder="45000000" value={purchasePrice} onChange={(e) => setPurchasePrice(e.target.value)} />
          </Field>

          <Field label="Nhà cung cấp / Cửa hàng">
            <Input placeholder="FPT Shop, Phong Vũ, ThinkPro, Apple Store..." value={supplier} onChange={(e) => setSupplier(e.target.value)} />
          </Field>

          <Field label="Thời hạn bảo hành (Tháng)">
            <Input type="number" placeholder="12" value={warrantyMonths} onChange={(e) => setWarrantyMonths(e.target.value)} />
          </Field>

          <div style={{ gridColumn: '1 / -1' }}>
            <Field label="Ngày hết hạn bảo hành (Tự tính nếu để trống)">
              <Input type="date" value={warrantyExpiresAt} onChange={(e) => setWarrantyExpiresAt(e.target.value)} />
            </Field>
          </div>
        </div>
      )}
    </Modal>
  );
}

/* ── 2. MODAL CẤP PHÁT / BÀN GIAO THIẾT BỊ ─────────────────────── */
export function AssignAssetModal({
  open,
  onClose,
  asset,
  employees,
  departments,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  asset: any;
  employees: { id: number; fullName: string; code: string; department?: { name: string } | null }[];
  departments: { id: number; name: string }[];
  onSuccess?: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [employeeId, setEmployeeId] = useState<string>(asset?.currentAssigneeId ? String(asset.currentAssigneeId) : '');
  const [departmentId, setDepartmentId] = useState<string>(asset?.currentDepartmentId ? String(asset.currentDepartmentId) : '');
  const [conditionOnAssign, setConditionOnAssign] = useState('Mới 100%, nguyên tem, hoạt động tốt');
  const [handoverNote, setHandoverNote] = useState('Bàn giao thiết bị làm việc');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!employeeId && !departmentId) {
      toast.error('Vui lòng chọn người nhận hoặc phòng ban');
      return;
    }

    setLoading(true);
    const res = await assignAssetAction(asset.id, {
      employeeId: employeeId ? Number(employeeId) : null,
      departmentId: departmentId ? Number(departmentId) : null,
      conditionOnAssign,
      handoverNote,
    });
    setLoading(false);

    if (res.ok) {
      toast.success(res.message);
      onSuccess?.();
      onClose();
    } else {
      toast.error(res.message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Cấp phát thiết bị: ${asset?.assetCode} - ${asset?.name}`}
      description="Bàn giao thiết bị cho nhân sự hoặc phòng ban sử dụng"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={loading}>
            Xác nhận bàn giao
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Nhân sự nhận bàn giao">
          <SearchableSelect
            value={employeeId}
            onChange={(val) => setEmployeeId(val)}
            options={[
              { value: '', label: '-- Chọn nhân sự --' },
              ...employees.map((emp) => ({
                value: String(emp.id),
                label: emp.fullName,
                subLabel: [emp.code, emp.department?.name].filter(Boolean).join(' · '),
              })),
            ]}
            placeholder="-- Chọn nhân sự --"
            searchPlaceholder="Tìm nhân sự…"
          />
        </Field>

        <Field label="Phòng ban sử dụng (hoặc phòng của nhân sự)">
          <SearchableSelect
            value={departmentId}
            onChange={(val) => setDepartmentId(val)}
            options={[
              { value: '', label: '-- Chọn phòng ban --' },
              ...departments.map((dept) => ({ value: String(dept.id), label: dept.name })),
            ]}
            placeholder="-- Chọn phòng ban --"
            searchPlaceholder="Tìm phòng ban…"
          />
        </Field>

        <Field label="Tình trạng máy lúc bàn giao *">
          <Input value={conditionOnAssign} onChange={(e) => setConditionOnAssign(e.target.value)} placeholder="Máy mới, xước nhẹ, pin tốt, kèm sạc zin..." />
        </Field>

        <Field label="Ghi chú bàn giao / Biên bản">
          <Textarea rows={2} value={handoverNote} onChange={(e) => setHandoverNote(e.target.value)} placeholder="Kèm phụ kiện sạc, cáp, túi chống sốc..." />
        </Field>
      </form>
    </Modal>
  );
}

/* ── 3. MODAL THU HỒI THIẾT BỊ VỀ KHO ─────────────────────────── */
export function RevokeAssetModal({
  open,
  onClose,
  asset,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  asset: any;
  onSuccess?: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [conditionOnReturn, setConditionOnReturn] = useState('Đầy đủ sạc cáp, hoạt động bình thường, không trầy xước');
  const [returnNote, setReturnNote] = useState('Thu hồi máy về kho IT');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);
    const res = await revokeAssetAction(asset.id, {
      conditionOnReturn,
      returnNote,
    });
    setLoading(false);

    if (res.ok) {
      toast.success(res.message);
      onSuccess?.();
      onClose();
    } else {
      toast.error(res.message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Thu hồi thiết bị về kho: ${asset?.assetCode}`}
      description={`Người đang sử dụng: ${asset?.currentAssignee?.fullName || 'Chưa rõ'}`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button variant="danger" onClick={handleSubmit} loading={loading}>
            Xác nhận thu hồi
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
        <Field label="Tình trạng thiết bị lúc nhận lại *">
          <Input value={conditionOnReturn} onChange={(e) => setConditionOnReturn(e.target.value)} placeholder="Tình trạng vỏ máy, màn hình, bàn phím, pin..." />
        </Field>

        <Field label="Lý do thu hồi & ghi chú">
          <Textarea rows={3} value={returnNote} onChange={(e) => setReturnNote(e.target.value)} placeholder="Nhân viên nghỉ việc, đổi máy mới, trả máy dự phòng..." />
        </Field>
      </form>
    </Modal>
  );
}

/* ── 4. MODAL NÂNG CẤP LINH KIỆN (RAM, SSD, GPU...) ───────────── */
export function UpgradeAssetModal({
  open,
  onClose,
  asset,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  asset: any;
  onSuccess?: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [component, setComponent] = useState('RAM');
  const [action, setAction] = useState('Nâng cấp thêm');
  const [beforeSpec, setBeforeSpec] = useState(asset?.specs?.ram || '');
  const [afterSpec, setAfterSpec] = useState('');
  const [cost, setCost] = useState('');
  const [provider, setProvider] = useState('');
  const [notes, setNotes] = useState('');

  // Tự động điền spec trước khi đổi linh kiện
  const handleComponentChange = (c: string) => {
    setComponent(c);
    const key = c.toLowerCase();
    setBeforeSpec(asset?.specs?.[key] || '');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!afterSpec.trim()) {
      toast.error('Vui lòng nhập thông số sau khi nâng cấp');
      return;
    }

    setLoading(true);
    const res = await addUpgradeAction(asset.id, {
      component,
      action,
      beforeSpec: beforeSpec.trim() || undefined,
      afterSpec: afterSpec.trim(),
      cost: cost ? Number(cost) : undefined,
      provider: provider.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setLoading(false);

    if (res.ok) {
      toast.success(res.message);
      onSuccess?.();
      onClose();
    } else {
      toast.error(res.message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Nâng cấp phần cứng: ${asset?.assetCode}`}
      description="Ghi nhận thay thế, nâng cấp linh kiện (RAM, SSD...) và tự động cập nhật cấu hình máy"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={loading}>
            Lưu nâng cấp
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Linh kiện nâng cấp *" required>
          <Select value={component} onChange={(e) => handleComponentChange(e.target.value)}>
            {Object.entries(UPGRADE_COMPONENTS).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Hành động">
          <Select value={action} onChange={(e) => setAction(e.target.value)}>
            <option value="Nâng cấp thêm">Nâng cấp thêm</option>
            <option value="Thay thế linh kiện hỏng">Thay thế linh kiện hỏng</option>
            <option value="Tháo bớt / Hoán đổi">Tháo bớt / Hoán đổi</option>
          </Select>
        </Field>

        <Field label="Thông số TRƯỚC nâng cấp">
          <Input placeholder="VD: 8GB DDR4, 256GB SSD..." value={beforeSpec} onChange={(e) => setBeforeSpec(e.target.value)} />
        </Field>

        <Field label="Thông số SAU nâng cấp *" required>
          <Input placeholder="VD: 16GB (8GB + 8GB) DDR4, 1TB Samsung NVMe..." value={afterSpec} onChange={(e) => setAfterSpec(e.target.value)} />
        </Field>

        <Field label="Chi phí nâng cấp (VNĐ)">
          <Input type="number" placeholder="1200000" value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>

        <Field label="Nơi mua / Đơn vị thực hiện">
          <Input placeholder="MemoryZone, Phong Vũ, IT nội bộ..." value={provider} onChange={(e) => setProvider(e.target.value)} />
        </Field>

        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Ghi chú kỹ thuật">
            <Textarea rows={2} placeholder="Hãng thanh RAM mới, số serial linh kiện, kết quả test memtest86..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

/* ── 5. MODAL GỬI SỬA CHỮA / BẢO HÀNH ──────────────────────────── */
export function MaintenanceModal({
  open,
  onClose,
  asset,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  asset: any;
  onSuccess?: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [type, setType] = useState('REPAIR');
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [provider, setProvider] = useState('');
  const [cost, setCost] = useState('');
  const [startDate, setStartDate] = useState(new Date().toISOString().slice(0, 10));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      toast.error('Vui lòng nhập tiêu đề sự cố / bảo dưỡng');
      return;
    }

    setLoading(true);
    const res = await addMaintenanceAction(asset.id, {
      type,
      title: title.trim(),
      description: description.trim() || undefined,
      provider: provider.trim() || undefined,
      cost: cost ? Number(cost) : undefined,
      startDate,
    });
    setLoading(false);

    if (res.ok) {
      toast.success(res.message);
      onSuccess?.();
      onClose();
    } else {
      toast.error(res.message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Gửi sửa chữa / Bảo hành: ${asset?.assetCode}`}
      description="Chuyển trạng thái thiết bị sang Đang bảo trì / Sửa chữa"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={loading}>
            Xác nhận gửi sửa
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Hình thức *" required>
          <Select value={type} onChange={(e) => setType(e.target.value)}>
            {Object.entries(MAINTENANCE_TYPES).map(([k, v]) => (
              <option key={k} value={k}>
                {v}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Ngày gửi máy *" required>
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} />
        </Field>

        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Tiêu đề sự cố / Nội dung bảo trì *" required>
            <Input placeholder="VD: Thay bàn phím liệt phím Space, Quạt kêu to, Thay pin chai..." value={title} onChange={(e) => setTitle(e.target.value)} />
          </Field>
        </div>

        <Field label="Đơn vị sửa chữa / TTBH">
          <Input placeholder="TTBH Apple, Cửa hàng sửa chữa máy tính..." value={provider} onChange={(e) => setProvider(e.target.value)} />
        </Field>

        <Field label="Chi phí dự kiến (VNĐ)">
          <Input type="number" placeholder="500000" value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>

        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Mô tả chi tiết triệu chứng lỗi">
            <Textarea rows={2} placeholder="Chi tiết hiện tượng lỗi, các phụ kiện gửi kèm..." value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

/* ── 6. MODAL HOÀN TẤT BẢO HÀNH / SỬA CHỮA ──────────────────────── */
export function CompleteMaintenanceModal({
  open,
  onClose,
  maintenance,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  maintenance: any;
  onSuccess?: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [completedDate, setCompletedDate] = useState(new Date().toISOString().slice(0, 10));
  const [cost, setCost] = useState(maintenance?.cost ? String(maintenance.cost) : '');
  const [result, setResult] = useState('Đã thay thế linh kiện, kiểm tra hoạt động bình thường');
  const [returnToStatus, setReturnToStatus] = useState<'IN_USE' | 'IN_STOCK'>('IN_USE');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!result.trim()) {
      toast.error('Vui lòng nhập kết quả xử lý');
      return;
    }

    setLoading(true);
    const res = await completeMaintenanceAction(maintenance.id, {
      completedDate,
      cost: cost ? Number(cost) : undefined,
      result: result.trim(),
      returnToStatus,
    });
    setLoading(false);

    if (res.ok) {
      toast.success(res.message);
      onSuccess?.();
      onClose();
    } else {
      toast.error(res.message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Hoàn tất sửa chữa: ${maintenance?.title}`}
      description="Cập nhật kết quả, chi phí thực tế và đưa thiết bị trở lại hoạt động"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button variant="primary" onClick={handleSubmit} loading={loading}>
            Hoàn tất & Đưa vào sử dụng
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <Field label="Ngày hoàn thành / Nhận lại máy *" required>
          <Input type="date" value={completedDate} onChange={(e) => setCompletedDate(e.target.value)} />
        </Field>

        <Field label="Chi phí thực tế (VNĐ)">
          <Input type="number" placeholder="500000" value={cost} onChange={(e) => setCost(e.target.value)} />
        </Field>

        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Chuyển trạng thái máy về">
            <Select value={returnToStatus} onChange={(e) => setReturnToStatus(e.target.value as any)}>
              <option value="IN_USE">Đang cấp phát sử dụng (Tiếp tục giao cho nhân sự)</option>
              <option value="IN_STOCK">Trong kho (Sẵn sàng cấp phát mới)</option>
            </Select>
          </Field>
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Kết quả xử lý & Nghiệm thu *" required>
            <Textarea rows={3} value={result} onChange={(e) => setResult(e.target.value)} placeholder="Mô tả linh kiện đã thay, tình trạng máy sau khi test..." />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

/* ── 7. MODAL THANH LÝ THIẾT BỊ ─────────────────────────────────── */
export function LiquidationModal({
  open,
  onClose,
  asset,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  asset: any;
  onSuccess?: () => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [reason, setReason] = useState('Hết thời gian khấu hao, không còn đáp ứng công việc');
  const [liquidationType, setLiquidationType] = useState('SELL_EMPLOYEE');
  const [recoveredAmount, setRecoveredAmount] = useState('');
  const [buyer, setBuyer] = useState('');
  const [notes, setNotes] = useState('');

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!reason.trim()) {
      toast.error('Vui lòng nhập lý do thanh lý');
      return;
    }

    setLoading(true);
    const res = await liquidateAssetAction(asset.id, {
      reason: reason.trim(),
      liquidationType,
      recoveredAmount: recoveredAmount ? Number(recoveredAmount) : undefined,
      buyer: buyer.trim() || undefined,
      notes: notes.trim() || undefined,
    });
    setLoading(false);

    if (res.ok) {
      toast.success(res.message);
      onSuccess?.();
      onClose();
    } else {
      toast.error(res.message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Thanh lý thiết bị: ${asset?.assetCode}`}
      description="Thiết bị sau khi thanh lý sẽ chuyển trạng thái LIQUIDATED và đóng mọi bàn giao"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button variant="danger" onClick={handleSubmit} loading={loading}>
            Xác nhận thanh lý
          </Button>
        </>
      }
    >
      <form onSubmit={handleSubmit} style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Hình thức thanh lý *" required>
            <Select value={liquidationType} onChange={(e) => setLiquidationType(e.target.value)}>
              {Object.entries(LIQUIDATION_TYPES).map(([k, v]) => (
                <option key={k} value={k}>
                  {v}
                </option>
              ))}
            </Select>
          </Field>
        </div>

        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Lý do thanh lý *" required>
            <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Hết khấu hao, hỏng mainboard chi phí sửa quá cao..." />
          </Field>
        </div>

        <Field label="Số tiền thu hồi (VNĐ)">
          <Input type="number" placeholder="5000000" value={recoveredAmount} onChange={(e) => setRecoveredAmount(e.target.value)} />
        </Field>

        <Field label="Người mua / Đơn vị thu mua">
          <Input placeholder="Nguyễn Văn A (Nhân viên), Cty Thu mua..." value={buyer} onChange={(e) => setBuyer(e.target.value)} />
        </Field>

        <div style={{ gridColumn: '1 / -1' }}>
          <Field label="Ghi chú thanh lý">
            <Textarea rows={2} placeholder="Số hóa đơn, cam kết xóa sạch dữ liệu công ty..." value={notes} onChange={(e) => setNotes(e.target.value)} />
          </Field>
        </div>
      </form>
    </Modal>
  );
}

/* ── 8. MODAL IN TEM NHÃN QR CODE DÁN MÁY ───────────────────────── */
export function AssetPrintStickerModal({
  open,
  onClose,
  assets,
  company,
}: {
  open: boolean;
  onClose: () => void;
  assets: any[];
  /** Thông tin công ty lấy từ Cấu hình hệ thống — tem dán tài sản phải mang tên thật của đơn vị. */
  company?: { name?: string; shortName?: string; phone?: string };
}) {
  const brandName = (company?.shortName || company?.name || '').trim();
  const stickerTitle = brandName ? `${brandName} · TÀI SẢN` : 'TEM TÀI SẢN';
  const hotline = company?.phone?.trim();
  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      zIndex={600}
      overlayClassName="print-preview-modal-overlay"
      title={`In tem nhãn QR code dán máy (${assets.length} thiết bị)`}
      description="Chuẩn nhãn nhiệt dán thiết bị (60mm x 35mm), quét mã để tra cứu nhanh"
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} className="no-print">
            Đóng
          </Button>
          <Button variant="primary" onClick={handlePrint} className="no-print">
            <Printer style={{ width: 16, height: 16, marginRight: 6 }} /> In tem nhãn ngay
          </Button>
        </>
      }
    >
      <style>{`
        @media print {
          @page {
            size: auto;
            margin: 5mm;
          }

          html, body {
            background: #ffffff !important;
            margin: 0 !important;
            padding: 0 !important;
            height: auto !important;
            overflow: visible !important;
          }

          body > *:not(.print-preview-modal-overlay) {
            display: none !important;
          }

          .modal-overlay:not(.print-preview-modal-overlay) {
            display: none !important;
          }

          .print-preview-modal-overlay {
            position: static !important;
            display: block !important;
            inset: auto !important;
            padding: 0 !important;
            background: #ffffff !important;
            backdrop-filter: none !important;
            animation: none !important;
            z-index: auto !important;
          }
          .print-preview-modal-overlay .modal {
            display: block !important;
            width: 100% !important;
            max-width: none !important;
            max-height: none !important;
            border: none !important;
            border-radius: 0 !important;
            box-shadow: none !important;
            background: #ffffff !important;
            animation: none !important;
            margin: 0 !important;
            padding: 0 !important;
          }
          .print-preview-modal-overlay .modal-header,
          .print-preview-modal-overlay .modal-footer,
          .no-print {
            display: none !important;
          }
          .print-preview-modal-overlay .modal-body {
            padding: 0 !important;
            overflow: visible !important;
            max-height: none !important;
            margin: 0 !important;
          }

          #print-sticker-container {
            position: relative !important;
            width: 100% !important;
            background: #ffffff !important;
            padding: 0 !important;
            margin: 0 !important;
            -webkit-print-color-adjust: exact !important;
            print-color-adjust: exact !important;
          }
          .sticker-badge {
            page-break-inside: avoid;
            break-inside: avoid;
          }
        }
      `}</style>

      <div style={{ background: 'var(--surface-subtle, #f8fafc)', padding: 16, borderRadius: 8, marginBottom: 16 }}>
        <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
          💡 <strong>Mẹo in tem:</strong> Máy in tem nhãn nhiệt (50x30mm hoặc 60x40mm) hoặc in trên giấy dán A4. Mỗi tem bao gồm Logo công ty, Mã tài sản, Tên máy, Serial number, Cấu hình tóm tắt và Mã QR vector chuẩn sắc nét.
        </p>
      </div>

      <div
        id="print-sticker-container"
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))',
          gap: 16,
          maxHeight: '60vh',
          overflowY: 'auto',
          padding: 8,
        }}
      >
        {assets.map((item) => {
          const appUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
          const qrTarget = `${appUrl}/assets/${item.id}`;
          const qrSvg = generateQrSvg(qrTarget, { size: 76, margin: 1 });
          const specs = item.specs || {};
          const specSummary = [specs.cpu, specs.ram, specs.storage].filter(Boolean).join(' • ') || 'Tiêu chuẩn';

          return (
            <div
              key={item.id}
              className="sticker-badge"
              style={{
                border: '2px solid #0f172a',
                borderRadius: 8,
                padding: '10px 12px',
                background: '#ffffff',
                color: '#0f172a',
                fontFamily: 'system-ui, -apple-system, sans-serif',
                boxShadow: '0 2px 8px rgba(0,0,0,0.06)',
                display: 'flex',
                flexDirection: 'column',
                justifyContent: 'space-between',
                width: '100%',
                boxSizing: 'border-box',
              }}
            >
              {/* Header tem */}
              <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '1.5px solid #0f172a', paddingBottom: 4, marginBottom: 6 }}>
                <span style={{ fontSize: 10, fontWeight: 900, letterSpacing: '0.5px', textTransform: 'uppercase' }}>
                  {stickerTitle}
                </span>
                {hotline && (
                  <span style={{ fontSize: 9, color: '#475569', fontWeight: 600 }}>
                    HOTLINE: {hotline}
                  </span>
                )}
              </div>

              {/* Body tem */}
              <div style={{ display: 'flex', gap: 10, alignItems: 'center' }}>
                <div
                  style={{ flexShrink: 0, width: 76, height: 76 }}
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                />
                <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 2 }}>
                  <div style={{ fontSize: 13, fontWeight: 800, color: '#0f172a', fontFamily: 'monospace', letterSpacing: '-0.2px' }}>
                    {item.assetCode}
                  </div>
                  <div style={{ fontSize: 11, fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={item.name}>
                    {item.name}
                  </div>
                  <div style={{ fontSize: 9.5, color: '#334155', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={specSummary}>
                    {specSummary}
                  </div>
                  {item.serialNumber && (
                    <div style={{ fontSize: 9, color: '#64748b', fontFamily: 'monospace' }}>
                      S/N: {item.serialNumber}
                    </div>
                  )}
                </div>
              </div>

              {/* Footer tem */}
              <div style={{ marginTop: 6, paddingTop: 4, borderTop: '1px dashed #cbd5e1', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                <span style={{ fontSize: 8.5, color: '#64748b' }}>
                  {item.brand || brandName || 'Thiết bị nội bộ'}
                </span>
                <span style={{ fontSize: 8.5, fontWeight: 600, color: '#0f172a' }}>
                  Quét mã xem hồ sơ máy
                </span>
              </div>
            </div>
          );
        })}
      </div>
    </Modal>
  );
}
