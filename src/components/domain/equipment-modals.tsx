'use client';

import React, { useState } from 'react';
import { Modal } from '@/components/ui/modal';
import {
  Button,
  Field,
  Input,
  Select,
  Textarea,
  Checkbox,
  Card,
  Badge,
  SearchableSelect,
  ImageUpload,
} from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import {
  EQUIPMENT_CATEGORIES,
  OWNERSHIP_TYPES,
  EQUIPMENT_STATUSES,
  type SaveEquipmentInput,
  type EquipmentSpecsInput,
} from '@/server/modules/equipment/types';
import {
  saveEquipmentAction,
  saveCustomerAction,
  saveCustomerLocationAction,
} from '@/server/modules/equipment/actions';
import { generateQrSvg } from '@/lib/qrcode';
import {
  Printer,
  QrCode,
  Building2,
  MapPin,
  Flame,
  Snowflake,
  Coffee,
  Utensils,
  Plus,
  CheckCircle2,
  IceCreamCone,
  Cookie,
  Trash2,
  Sparkles,
  SlidersHorizontal,
  Eye,
} from 'lucide-react';
import {
  EQUIPMENT_SPEC_PRESETS,
  type SpecPreset,
  getEquipmentSpecRows,
} from '@/lib/equipment-specs';
import { EquipmentSpecGrid } from '@/components/domain/equipment-spec-grid';

interface EquipmentModalProps {
  open: boolean;
  onClose: () => void;
  equipment?: any;
  customers: {
    id: number;
    code: string;
    name: string;
    phone: string;
    locations: { id: number; name: string; address: string; managerName?: string | null; phone?: string | null }[];
  }[];
  onSuccess?: () => void;
}

export function EquipmentModal({
  open,
  onClose,
  equipment,
  customers,
  onSuccess,
}: EquipmentModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'general' | 'specs' | 'location'>('general');

  // General fields
  const [name, setName] = useState(equipment?.name || '');
  const [machineCode, setMachineCode] = useState(equipment?.machineCode || '');
  const [serialNumber, setSerialNumber] = useState(equipment?.serialNumber || '');
  const [category, setCategory] = useState(equipment?.category || 'ICE_CREAM_MACHINE');
  const [brand, setBrand] = useState(equipment?.brand || '');
  const [model, setModel] = useState(equipment?.model || '');
  const [ownershipType, setOwnershipType] = useState(equipment?.ownershipType || 'SOLD');
  const [status, setStatus] = useState(equipment?.status || 'OPERATING');
  const [notes, setNotes] = useState(equipment?.notes || '');
  const [imageUrl, setImageUrl] = useState(equipment?.imageUrl || '');

  // Location & Customer
  const [customerId, setCustomerId] = useState<number | undefined>(equipment?.customerId || undefined);
  const [locationId, setLocationId] = useState<number | undefined>(equipment?.locationId || undefined);
  const [installedDate, setInstalledDate] = useState(
    equipment?.installedDate ? new Date(equipment.installedDate).toISOString().slice(0, 10) : '',
  );
  const [warrantyExpiresAt, setWarrantyExpiresAt] = useState(
    equipment?.warrantyExpiresAt ? new Date(equipment.warrantyExpiresAt).toISOString().slice(0, 10) : '',
  );

  // Quick Customer / Location creation modal
  const [customerModalOpen, setCustomerModalOpen] = useState(false);
  const [locationModalOpen, setLocationModalOpen] = useState(false);

  // Dynamic Specs & Common
  const specsData = (equipment?.specs as EquipmentSpecsInput) || {};
  const [dimensions, setDimensions] = useState(specsData.dimensions || '');
  const [weightKg, setWeightKg] = useState(specsData.weightKg || '');
  const [madeIn, setMadeIn] = useState(specsData.madeIn || '');

  const [voltage, setVoltage] = useState(
    specsData.voltage ||
    specsData.iceCream?.voltage ||
    specsData.chocolate?.voltage ||
    specsData.kitchen?.voltage ||
    '220V / 50Hz'
  );

  const [powerWatts, setPowerWatts] = useState(
    specsData.powerWatts ||
    specsData.powerKw ||
    specsData.iceCream?.powerWatts ||
    specsData.chocolate?.powerWatts ||
    specsData.kitchen?.powerKw ||
    ''
  );

  // Dynamic Custom Attributes list
  const [customAttributes, setCustomAttributes] = useState<{ id: string; label: string; value: string }[]>(() => {
    if (Array.isArray(specsData.attributes) && specsData.attributes.length > 0) {
      return specsData.attributes.map((a, idx) => ({
        id: a.id || `attr-${idx}-${Math.random().toString(36).slice(2, 6)}`,
        label: a.label || '',
        value: a.value || '',
      }));
    }

    const items: { id: string; label: string; value: string }[] = [];
    const add = (label: string, val?: any) => {
      if (val !== undefined && val !== null && String(val).trim() !== '') {
        items.push({
          id: `attr-${items.length}-${Math.random().toString(36).slice(2, 6)}`,
          label,
          value: String(val).trim(),
        });
      }
    };

    if (specsData.iceCream) {
      const ice = specsData.iceCream;
      add('Chủng loại máy kem', ice.machineType);
      add('Số họng / Số vị', ice.flavorCount);
      add('Năng suất làm kem', ice.capacityPerHour);
      add('Dung tích cối xi lanh', ice.cylinderCapacity);
      add('Dung tích bể chứa (Hopper)', ice.hopperCapacity);
      add('Lốc nén (Compressor)', ice.compressor);
      add('Loại gas lạnh', ice.refrigerant);
      add('Hệ thống làm mát', ice.coolingType);
      if (ice.preCooling !== undefined) add('Giữ tươi qua đêm (Pre-cooling)', ice.preCooling ? 'Có hỗ trợ' : 'Không');
      if (ice.airPump !== undefined) add('Bơm tăng xốp (Air pump)', ice.airPump ? 'Có bơm xốp' : 'Không');
    } else if (specsData.chocolate) {
      const choco = specsData.chocolate;
      add('Chủng loại máy socola', choco.machineType);
      add('Dung tích bồn chứa', choco.tankCapacityKg);
      add('Năng suất tôi / rót', choco.outputPerHourKg);
      add('Dải nhiệt độ kiểm soát', choco.tempRange);
      add('Cơ chế gia nhiệt', choco.heatingMethod);
      add('Chất liệu tiếp xúc', choco.materialGrade);
      if (choco.hasFootPedal !== undefined) add('Bàn đạp chân ngắt dòng', choco.hasFootPedal ? 'Có bàn đạp' : 'Không');
    } else if (specsData.kitchen) {
      const k = specsData.kitchen;
      add('Loại thiết bị cụ thể', k.equipmentType);
      add('Nhiên liệu vận hành', k.powerType);
      add('Dung tích / Sức chứa', k.capacity);
      add('Dải nhiệt độ hoạt động', k.tempRange);
    }

    if (items.length === 0) {
      return [
        { id: 'attr-1', label: 'Dung tích nồi hơi / Cối', value: '' },
        { id: 'attr-2', label: 'Năng suất vận hành', value: '' },
        { id: 'attr-3', label: 'Tính năng / Vật liệu', value: '' },
      ];
    }
    return items;
  });

  const handleApplyPreset = (preset: SpecPreset) => {
    if (preset.defaultElectrical?.voltage) setVoltage(preset.defaultElectrical.voltage);
    if (preset.defaultElectrical?.powerWatts) setPowerWatts(preset.defaultElectrical.powerWatts);

    const newAttrs = preset.attributes.map((a, idx) => ({
      id: `attr-${Date.now()}-${idx}`,
      label: a.label,
      value: a.value,
    }));
    setCustomAttributes(newAttrs);
    toast.success(`Đã áp dụng mẫu thông số: ${preset.name}`);
  };

  const handleAddAttribute = () => {
    setCustomAttributes((prev) => [
      ...prev,
      { id: `attr-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`, label: '', value: '' },
    ]);
  };

  const handleUpdateAttribute = (id: string, field: 'label' | 'value', val: string) => {
    setCustomAttributes((prev) =>
      prev.map((item) => (item.id === id ? { ...item, [field]: val } : item))
    );
  };

  const handleRemoveAttribute = (id: string) => {
    setCustomAttributes((prev) => prev.filter((item) => item.id !== id));
  };

  // Selected customer locations
  const selectedCustomer = customers.find((c) => c.id === customerId);
  const availableLocations = selectedCustomer?.locations || [];

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim()) {
      toast.error('Vui lòng nhập tên thiết bị / máy móc');
      return;
    }
    if (!serialNumber.trim()) {
      toast.error('Vui lòng nhập số Serial (S/N) của nhà sản xuất');
      return;
    }

    setLoading(true);

    const validAttributes = customAttributes
      .filter((a) => a.label.trim() && a.value.trim())
      .map((a) => ({ label: a.label.trim(), value: a.value.trim() }));

    const specsPayload: EquipmentSpecsInput = {
      voltage: voltage.trim() || undefined,
      powerWatts: powerWatts.trim() || undefined,
      dimensions: dimensions.trim() || undefined,
      weightKg: weightKg.trim() || undefined,
      madeIn: madeIn.trim() || undefined,
      attributes: validAttributes,
    };

    const payload: SaveEquipmentInput = {
      name: name.trim(),
      machineCode: machineCode.trim() || undefined,
      serialNumber: serialNumber.trim(),
      category,
      brand: brand.trim() || undefined,
      model: model.trim() || undefined,
      ownershipType,
      status,
      customerId: customerId || null,
      locationId: locationId || null,
      installedDate: installedDate || undefined,
      warrantyExpiresAt: warrantyExpiresAt || undefined,
      notes: notes.trim() || undefined,
      imageUrl: imageUrl.trim() || undefined,
      specs: specsPayload,
    };

    const res = await saveEquipmentAction(equipment ? equipment.id : null, payload);
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
    <>
      <Modal
        open={open}
        onClose={onClose}
        title={equipment ? `Chỉnh sửa máy: ${equipment.machineCode}` : 'Thêm Thiết bị & Máy móc'}
        description="Quản lý hồ sơ máy làm kem, máy socola, thiết bị bếp và điểm lắp đặt"
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={onClose} disabled={loading}>
              Hủy
            </Button>
            <Button variant="primary" onClick={handleSubmit} loading={loading}>
              {equipment ? 'Lưu thay đổi' : 'Tạo thiết bị'}
            </Button>
          </>
        }
      >
        {/* Tab Header */}
        <div style={{ display: 'flex', gap: 6, borderBottom: '1px solid var(--border)', marginBottom: 16, paddingBottom: 6 }}>
          <button
            type="button"
            className={`tab-item ${activeTab === 'general' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('general')}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              background: activeTab === 'general' ? 'var(--primary-subtle, #e0f2fe)' : 'transparent',
              color: activeTab === 'general' ? 'var(--primary, #0284c7)' : 'var(--text-muted)',
              fontWeight: activeTab === 'general' ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            1. Thông tin chung
          </button>
          <button
            type="button"
            className={`tab-item ${activeTab === 'specs' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('specs')}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              background: activeTab === 'specs' ? 'var(--primary-subtle, #e0f2fe)' : 'transparent',
              color: activeTab === 'specs' ? 'var(--primary, #0284c7)' : 'var(--text-muted)',
              fontWeight: activeTab === 'specs' ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            2. Thông số Kỹ thuật
          </button>
          <button
            type="button"
            className={`tab-item ${activeTab === 'location' ? 'tab-active' : ''}`}
            onClick={() => setActiveTab('location')}
            style={{
              padding: '6px 14px',
              borderRadius: 6,
              border: 'none',
              background: activeTab === 'location' ? 'var(--primary-subtle, #e0f2fe)' : 'transparent',
              color: activeTab === 'location' ? 'var(--primary, #0284c7)' : 'var(--text-muted)',
              fontWeight: activeTab === 'location' ? 600 : 400,
              cursor: 'pointer',
            }}
          >
            3. Điểm lắp đặt & Khách hàng
          </button>
        </div>

        {/* Tab 1: General Info */}
        {activeTab === 'general' && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Tên thiết bị / máy móc" required>
                <Input
                  placeholder="VD: Máy làm kem tươi Spaceman 6240, Máy tôi socola Chocoma 25kg..."
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                />
              </Field>
            </div>

            <Field label="Phân loại thiết bị" required>
              <Select value={category} onChange={(e) => setCategory(e.target.value)}>
                {Object.entries(EQUIPMENT_CATEGORIES).map(([catKey, catVal]) => (
                  <option key={catKey} value={catKey}>
                    {catVal.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Hình thức sở hữu" required>
              <Select value={ownershipType} onChange={(e) => setOwnershipType(e.target.value)}>
                {Object.entries(OWNERSHIP_TYPES).map(([ownKey, ownVal]) => (
                  <option key={ownKey} value={ownKey}>
                    {ownVal.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Số Serial (S/N nhà sản xuất)" required hint="Số S/N in trên tem nhôm của máy">
              <Input
                placeholder="VD: SN-SPM-2026-9882..."
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
              />
            </Field>

            <Field label="Mã máy nội bộ (Để trống tự sinh EQ-YYYY-XXXX)">
              <Input
                placeholder="VD: EQ-2026-0001..."
                value={machineCode}
                onChange={(e) => setMachineCode(e.target.value)}
              />
            </Field>

            <Field label="Hãng sản xuất / Thương hiệu">
              <Input
                placeholder="VD: Spaceman, Taylor, Chocoma, Unox, Rational..."
                value={brand}
                onChange={(e) => setBrand(e.target.value)}
              />
            </Field>

            <Field label="Model / Dòng máy">
              <Input
                placeholder="VD: 6240A-C, C708, TC25, XFT193..."
                value={model}
                onChange={(e) => setModel(e.target.value)}
              />
            </Field>

            <Field label="Trạng thái vận hành">
              <Select value={status} onChange={(e) => setStatus(e.target.value)}>
                {Object.entries(EQUIPMENT_STATUSES).map(([stKey, stVal]) => (
                  <option key={stKey} value={stKey}>
                    {stVal.label}
                  </option>
                ))}
              </Select>
            </Field>

            <Field label="Hạn bảo hành">
              <Input
                type="date"
                value={warrantyExpiresAt}
                onChange={(e) => setWarrantyExpiresAt(e.target.value)}
              />
            </Field>

            <div style={{ gridColumn: '1 / -1' }}>
              <ImageUpload
                label="Hình ảnh máy móc thực tế"
                hint="Tải ảnh thực tế của máy lên máy chủ để nhân viên kỹ thuật và khách hàng dễ nhận diện"
                placeholder="https://... hoặc tải ảnh trực tiếp từ máy tính"
                value={imageUrl}
                onChange={setImageUrl}
              />
            </div>

            <div style={{ gridColumn: '1 / -1' }}>
              <Field label="Ghi chú vận hành">
                <Textarea
                  placeholder="Ghi chú thêm về điều kiện vận hành, nguồn điện, cảnh báo lưu ý..."
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  rows={2}
                />
              </Field>
            </div>
          </div>
        )}

        {/* Tab 2: Technical Specs (Hybrid Dynamic Specs with Presets) */}
        {activeTab === 'specs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* 1. Mẫu nạp nhanh theo dòng máy F&B */}
            <Card style={{ padding: 14, background: 'var(--surface-subtle)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 10, flexWrap: 'wrap', gap: 6 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Sparkles style={{ width: 16, height: 16, color: 'var(--primary)' }} />
                  <strong style={{ fontSize: 13 }}>Mẫu Nạp Nhanh Thông Số Chuẩn F&B (Preset Templates)</strong>
                </div>
                <span style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                  Bấm mẫu bên dưới để tự động điền danh mục thông số tiêu chuẩn
                </span>
              </div>

              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                {EQUIPMENT_SPEC_PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    type="button"
                    onClick={() => handleApplyPreset(preset)}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: 6,
                      fontSize: 12,
                      fontWeight: 500,
                      padding: '5px 10px',
                      borderRadius: 6,
                      border: '1px solid var(--border)',
                      background: 'var(--surface-card)',
                      color: 'var(--text)',
                      cursor: 'pointer',
                      transition: 'all 0.15s ease',
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.borderColor = 'var(--primary)';
                      e.currentTarget.style.backgroundColor = 'var(--surface-hover)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.borderColor = 'var(--border)';
                      e.currentTarget.style.backgroundColor = 'var(--surface-card)';
                    }}
                  >
                    <span>{preset.icon}</span>
                    <span>{preset.name}</span>
                  </button>
                ))}
              </div>
            </Card>

            {/* 2. Thông số Điện & Kích thước cơ bản */}
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>
                Nguồn điện, Kích thước & Xuất xứ
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))', gap: 12 }}>
                <Field label="Điện áp hoạt động">
                  <Input
                    placeholder="VD: 220V / 50Hz hoặc 380V (3 pha)..."
                    value={voltage}
                    onChange={(e) => setVoltage(e.target.value)}
                  />
                </Field>

                <Field label="Công suất tiêu thụ">
                  <Input
                    placeholder="VD: 3200W, 4.5 kW, 1500W..."
                    value={powerWatts}
                    onChange={(e) => setPowerWatts(e.target.value)}
                  />
                </Field>

                <Field label="Kích thước (D x R x C cm)">
                  <Input
                    placeholder="VD: 54 x 78 x 138 cm..."
                    value={dimensions}
                    onChange={(e) => setDimensions(e.target.value)}
                  />
                </Field>

                <Field label="Trọng lượng máy (kg)">
                  <Input
                    placeholder="VD: 135 kg..."
                    value={weightKg}
                    onChange={(e) => setWeightKg(e.target.value)}
                  />
                </Field>

                <Field label="Xuất xứ / Nơi sản xuất">
                  <Input
                    placeholder="VD: Ý, Đức, Nhật Bản, Việt Nam..."
                    value={madeIn}
                    onChange={(e) => setMadeIn(e.target.value)}
                  />
                </Field>
              </div>
            </Card>

            {/* 3. Danh sách Thông số Kỹ thuật Động (Key-Value) */}
            <Card style={{ padding: 16 }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
                <div>
                  <strong style={{ fontSize: 13.5 }}>Danh sách Thông số Kỹ thuật Chi tiết</strong>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
                    Tự do thêm hoặc sửa bất kỳ thông số nào theo đặc thù riêng của máy
                  </div>
                </div>
                <Button
                  type="button"
                  variant="secondary"
                  size="sm"
                  onClick={handleAddAttribute}
                  style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}
                >
                  <Plus style={{ width: 14, height: 14 }} /> Thêm thông số
                </Button>
              </div>

              {customAttributes.length === 0 ? (
                <div style={{ textAlign: 'center', padding: '24px 12px', border: '1px dashed var(--border)', borderRadius: 8, color: 'var(--text-muted)', fontSize: 12.5 }}>
                  Chưa có thông số chi tiết nào. Bấm <strong>"+ Thêm thông số"</strong> hoặc chọn một <strong>Mẫu nạp nhanh</strong> ở trên để bắt đầu.
                </div>
              ) : (
                <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
                  {customAttributes.map((attr, idx) => (
                    <div
                      key={attr.id}
                      style={{
                        display: 'grid',
                        gridTemplateColumns: 'minmax(140px, 320px) 1fr 36px',
                        gap: 8,
                        alignItems: 'center',
                      }}
                    >
                      <Input
                        placeholder={`Tên thông số #${idx + 1} (VD: Dung tích nồi hơi, Lốc nén...)`}
                        value={attr.label}
                        onChange={(e) => handleUpdateAttribute(attr.id, 'label', e.target.value)}
                      />
                      <Input
                        placeholder="Giá trị (VD: 11 Lít, Embraco Ý, 28 Lít/h...)"
                        value={attr.value}
                        onChange={(e) => handleUpdateAttribute(attr.id, 'value', e.target.value)}
                      />
                      <button
                        type="button"
                        onClick={() => handleRemoveAttribute(attr.id)}
                        title="Xóa dòng thông số này"
                        style={{
                          display: 'inline-flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          width: 34,
                          height: 34,
                          borderRadius: 6,
                          border: '1px solid transparent',
                          background: 'transparent',
                          color: '#ef4444',
                          cursor: 'pointer',
                          transition: 'background 0.15s ease',
                        }}
                        onMouseEnter={(e) => (e.currentTarget.style.backgroundColor = '#fee2e2')}
                        onMouseLeave={(e) => (e.currentTarget.style.backgroundColor = 'transparent')}
                      >
                        <Trash2 style={{ width: 15, height: 15 }} />
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </Card>

            {/* 4. Xem trước hiển thị thực tế (Live Preview) */}
            <Card style={{ padding: 14, background: 'var(--surface-subtle)', border: '1px solid var(--border)' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>
                <Eye style={{ width: 15, height: 15, color: 'var(--primary)' }} />
                <strong style={{ fontSize: 12.5, color: 'var(--primary)' }}>
                  Xem trước hiển thị (Web / Báo giá / Hóa đơn / Biên bản bàn giao)
                </strong>
              </div>

              <div style={{ background: 'var(--surface-card)', padding: 12, borderRadius: 6, border: '1px solid var(--border)' }}>
                {(() => {
                  const previewRows = getEquipmentSpecRows({
                    brand,
                    model,
                    specs: {
                      voltage: voltage.trim() || undefined,
                      powerWatts: powerWatts.trim() || undefined,
                      dimensions: dimensions.trim() || undefined,
                      weightKg: weightKg.trim() || undefined,
                      madeIn: madeIn.trim() || undefined,
                      attributes: customAttributes.filter((a) => a.label.trim() && a.value.trim()),
                    },
                  });
                  return <EquipmentSpecGrid rows={previewRows} />;
                })()}
              </div>
            </Card>
          </div>
        )}

        {/* Tab 3: Customer & Installation Site */}
        {activeTab === 'location' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label className="label">Khách hàng / Đối tác sở hữu</label>
                  <button
                    type="button"
                    onClick={() => setCustomerModalOpen(true)}
                    style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0, fontSize: 12 }}
                  >
                    + Thêm khách hàng mới
                  </button>
                </div>
                <SearchableSelect
                  value={customerId ? String(customerId) : ''}
                  onChange={(val) => {
                    const parsed = val ? Number(val) : undefined;
                    setCustomerId(parsed);
                    setLocationId(undefined); // Reset location when customer changes
                  }}
                  options={[
                    { value: '', label: '-- Chưa gán khách hàng (Lưu kho) --' },
                    ...customers.map((c) => ({
                      value: String(c.id),
                      label: c.name,
                      subLabel: `${c.code}${c.phone ? ` • ${c.phone}` : ''}`,
                    })),
                  ]}
                  placeholder="-- Chọn khách hàng --"
                  searchPlaceholder="Tìm tên, mã hoặc số điện thoại..."
                  allowClear
                />
              </div>

              <div>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 4 }}>
                  <label className="label">Điểm lắp đặt / Chi nhánh cửa hàng</label>
                  {customerId && (
                    <button
                      type="button"
                      onClick={() => setLocationModalOpen(true)}
                      style={{ background: 'none', border: 'none', color: 'var(--primary)', cursor: 'pointer', padding: 0, fontSize: 12 }}
                    >
                      + Thêm điểm lắp đặt
                    </button>
                  )}
                </div>
                <SearchableSelect
                  value={locationId ? String(locationId) : ''}
                  onChange={(val) => setLocationId(val ? Number(val) : undefined)}
                  disabled={!customerId}
                  options={[
                    { value: '', label: !customerId ? '-- Vui lòng chọn khách hàng trước --' : '-- Chọn điểm lắp đặt --' },
                    ...availableLocations.map((loc) => ({
                      value: String(loc.id),
                      label: loc.name,
                      subLabel: loc.address,
                    })),
                  ]}
                  placeholder={!customerId ? '-- Vui lòng chọn khách hàng trước --' : '-- Chọn điểm lắp đặt --'}
                  searchPlaceholder="Tìm tên chi nhánh hoặc địa chỉ..."
                  allowClear
                />
              </div>

              <Field label="Ngày bàn giao / Lắp đặt">
                <Input
                  type="date"
                  value={installedDate}
                  onChange={(e) => setInstalledDate(e.target.value)}
                />
              </Field>

              <Field label="Hạn bảo hành">
                <Input
                  type="date"
                  value={warrantyExpiresAt}
                  onChange={(e) => setWarrantyExpiresAt(e.target.value)}
                />
              </Field>
            </div>

            {selectedCustomer && (
              <Card style={{ padding: 14, background: 'var(--surface-subtle, #f8fafc)' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 6 }}>
                  <Building2 style={{ width: 16, height: 16, color: 'var(--primary)' }} />
                  <strong>{selectedCustomer.name}</strong>
                  <Badge tone="info">{selectedCustomer.code}</Badge>
                </div>
                <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                  Hotline: <strong>{selectedCustomer.phone}</strong> • Số điểm lắp đặt: <strong>{availableLocations.length} chi nhánh</strong>
                </div>
              </Card>
            )}
          </div>
        )}
      </Modal>

      {/* Quick Customer Modal */}
      {customerModalOpen && (
        <QuickCustomerModal
          open={customerModalOpen}
          onClose={() => setCustomerModalOpen(false)}
          onSuccess={(newCustomer) => {
            customers.push(newCustomer);
            setCustomerId(newCustomer.id);
            setCustomerModalOpen(false);
          }}
        />
      )}

      {/* Quick Location Modal */}
      {locationModalOpen && customerId && (
        <QuickLocationModal
          open={locationModalOpen}
          customerId={customerId}
          customerName={selectedCustomer?.name || ''}
          onClose={() => setLocationModalOpen(false)}
          onSuccess={(newLoc) => {
            if (selectedCustomer) {
              selectedCustomer.locations.push(newLoc);
              setLocationId(newLoc.id);
            }
            setLocationModalOpen(false);
          }}
        />
      )}
    </>
  );
}

// Quick Customer Modal
function QuickCustomerModal({
  open,
  onClose,
  onSuccess,
}: {
  open: boolean;
  onClose: () => void;
  onSuccess: (customer: any) => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [phone, setPhone] = useState('');
  const [contactName, setContactName] = useState('');
  const [address, setAddress] = useState('');

  const handleSave = async () => {
    if (!name.trim() || !phone.trim()) {
      toast.error('Vui lòng nhập tên khách hàng và số điện thoại');
      return;
    }

    setLoading(true);
    const res = await saveCustomerAction({
      name: name.trim(),
      phone: phone.trim(),
      contactName: contactName.trim() || undefined,
      address: address.trim() || undefined,
    });
    setLoading(false);

    if (res.ok && res.customer) {
      toast.success(res.message);
      onSuccess({
        ...res.customer,
        locations: [],
      });
    } else {
      toast.error(res.message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Thêm Khách hàng / Đối tác F&B"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button variant="primary" onClick={handleSave} loading={loading}>
            Lưu khách hàng
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Tên công ty / Chuỗi cửa hàng" required>
          <Input
            placeholder="VD: Công ty TNHH Kem Bơ Đà Lạt, Chuỗi Trà Sữa ABC..."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Số điện thoại liên hệ" required>
          <Input
            placeholder="VD: 0908123456..."
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
        <Field label="Người đại diện / Liên hệ chính">
          <Input
            placeholder="VD: Anh Tuấn (Chủ quán), Chị Mai (Thu mua)..."
            value={contactName}
            onChange={(e) => setContactName(e.target.value)}
          />
        </Field>
        <Field label="Địa chỉ trụ sở chính">
          <Input
            placeholder="VD: 123 Nguyễn Huệ, P. Bến Nghé, Q.1, TP.HCM..."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

// Quick Location Modal
function QuickLocationModal({
  open,
  customerId,
  customerName,
  onClose,
  onSuccess,
}: {
  open: boolean;
  customerId: number;
  customerName: string;
  onClose: () => void;
  onSuccess: (loc: any) => void;
}) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [managerName, setManagerName] = useState('');
  const [phone, setPhone] = useState('');

  const handleSave = async () => {
    if (!name.trim() || !address.trim()) {
      toast.error('Vui lòng nhập tên chi nhánh và địa chỉ lắp đặt');
      return;
    }

    setLoading(true);
    const res = await saveCustomerLocationAction({
      customerId,
      name: name.trim(),
      address: address.trim(),
      managerName: managerName.trim() || undefined,
      phone: phone.trim() || undefined,
    });
    setLoading(false);

    if (res.ok && res.location) {
      toast.success(res.message);
      onSuccess(res.location);
    } else {
      toast.error(res.message);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={`Thêm Điểm lắp đặt cho: ${customerName}`}
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={loading}>
            Hủy
          </Button>
          <Button variant="primary" onClick={handleSave} loading={loading}>
            Lưu điểm lắp đặt
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        <Field label="Tên điểm đặt / Chi nhánh" required>
          <Input
            placeholder="VD: Chi nhánh 123 Lê Lợi, Kiosk Vincom Thảo Điền..."
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
        </Field>
        <Field label="Địa chỉ lắp đặt thực tế" required>
          <Input
            placeholder="Số nhà, đường, phường, quận/huyện, tỉnh/thành..."
            value={address}
            onChange={(e) => setAddress(e.target.value)}
          />
        </Field>
        <Field label="Quản lý cửa hàng tại điểm">
          <Input
            placeholder="VD: Nguyễn Văn B..."
            value={managerName}
            onChange={(e) => setManagerName(e.target.value)}
          />
        </Field>
        <Field label="Số điện thoại tại điểm">
          <Input
            placeholder="VD: 0912345678..."
            value={phone}
            onChange={(e) => setPhone(e.target.value)}
          />
        </Field>
      </div>
    </Modal>
  );
}

// Print QR Equipment Tag Sticker Modal
export function EquipmentPrintStickerModal({
  open,
  onClose,
  equipment,
  company,
}: {
  open: boolean;
  onClose: () => void;
  equipment: any;
  /** Thông tin công ty lấy từ Cấu hình hệ thống — tem dán tại khách phải có tên và hotline thật. */
  company?: { name?: string; shortName?: string; phone?: string };
}) {
  const brandName = (company?.name || company?.shortName || '').trim();
  const hotline = company?.phone?.trim();
  const appUrl = typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000';
  const qrUrl = `${appUrl}/equipment/${equipment.id}`;
  const qrSvg = generateQrSvg(qrUrl, { size: 140, margin: 1 });

  const handlePrint = () => {
    window.print();
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="In Tem Thiết bị (Mã QR)"
      size="md"
      footer={
        <>
          <Button variant="secondary" onClick={onClose}>
            Đóng
          </Button>
          <Button variant="primary" onClick={handlePrint}>
            <Printer style={{ width: 14, height: 14, marginRight: 6 }} /> In tem nhãn
          </Button>
        </>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', padding: 12 }}>
        {/* Printable Sticker Preview Card */}
        <div
          id="equipment-sticker-print"
          style={{
            width: '100%',
            maxWidth: 380,
            border: '2px solid #0f172a',
            borderRadius: 8,
            padding: 16,
            background: '#ffffff',
            color: '#0f172a',
            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
          }}
        >
          {/* Header */}
          <div style={{ borderBottom: '2px solid #0f172a', paddingBottom: 8, marginBottom: 12, textAlign: 'center' }}>
            <div style={{ fontSize: 13, fontWeight: 800, textTransform: 'uppercase', letterSpacing: 0.5 }}>
              {brandName || 'TEM THIẾT BỊ & DỊCH VỤ KỸ THUẬT'}
            </div>
            <div style={{ fontSize: 11, color: '#475569', marginTop: 2 }}>
              {hotline ? `HỖ TRỢ BẢO TRÌ & SỬA CHỮA — ${hotline}` : 'HỖ TRỢ BẢO TRÌ & SỬA CHỮA KHẨN CẤP'}
            </div>
          </div>

          {/* Content Row: QR + Info */}
          <div style={{ display: 'flex', gap: 14, alignItems: 'center' }}>
            <div
              style={{
                width: 120,
                height: 120,
                padding: 4,
                border: '1px solid #cbd5e1',
                borderRadius: 6,
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                flexShrink: 0,
              }}
              dangerouslySetInnerHTML={{ __html: qrSvg }}
            />

            <div style={{ display: 'flex', flexDirection: 'column', gap: 4, fontSize: 11.5, minWidth: 0, flex: 1 }}>
              <div style={{ fontWeight: 800, fontSize: 13.5, color: '#0f172a', lineHeight: 1.3 }}>
                {equipment.name}
              </div>
              <div>
                <span style={{ color: '#64748b' }}>Mã máy:</span> <strong>{equipment.machineCode}</strong>
              </div>
              <div>
                <span style={{ color: '#64748b' }}>S/N:</span> <strong style={{ fontFamily: 'monospace' }}>{equipment.serialNumber}</strong>
              </div>
              {equipment.brand && (
                <div>
                  <span style={{ color: '#64748b' }}>Hãng:</span> <strong>{equipment.brand}</strong> {equipment.model ? `(${equipment.model})` : ''}
                </div>
              )}
            </div>
          </div>

          {/* Footer Instruction */}
          <div
            style={{
              borderTop: '1px dashed #cbd5e1',
              marginTop: 12,
              paddingTop: 8,
              textAlign: 'center',
              fontSize: 10.5,
              color: '#334155',
              fontWeight: 500,
            }}
          >
            📱 Mở Zalo/Camera quét mã QR để tra cứu thông số hoặc bấm <strong>"Báo hỏng khẩn cấp"</strong>
          </div>
        </div>

        <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 14, textAlign: 'center' }}>
          💡 Khuyên dùng: In trên giấy thiếc / nhôm bạc chống rách, chịu nhiệt và chống nước.
        </div>
      </div>
    </Modal>
  );
}

export { EquipmentHandoverModal } from './equipment-handover-modal';
