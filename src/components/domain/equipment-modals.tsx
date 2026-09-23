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
} from 'lucide-react';

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

  // Common Specs
  const specsData = (equipment?.specs as EquipmentSpecsInput) || {};
  const [dimensions, setDimensions] = useState(specsData.dimensions || '');
  const [weightKg, setWeightKg] = useState(specsData.weightKg || '');
  const [madeIn, setMadeIn] = useState(specsData.madeIn || '');

  // Ice Cream Specs
  const iceData = specsData.iceCream || {};
  const [iceMachineType, setIceMachineType] = useState(iceData.machineType || 'Kem tươi 3 vòi để bàn');
  const [flavorCount, setFlavorCount] = useState(iceData.flavorCount || '2 vị riêng + 1 vị hỗn hợp');
  const [capacityPerHour, setCapacityPerHour] = useState(iceData.capacityPerHour || '28 Lít/giờ');
  const [cylinderCapacity, setCylinderCapacity] = useState(iceData.cylinderCapacity || '1.9 Lít x 2');
  const [hopperCapacity, setHopperCapacity] = useState(iceData.hopperCapacity || '12.5 Lít x 2');
  const [compressor, setCompressor] = useState(iceData.compressor || 'Embraco (Ý)');
  const [refrigerant, setRefrigerant] = useState(iceData.refrigerant || 'R404a');
  const [icePowerWatts, setIcePowerWatts] = useState(iceData.powerWatts || '2200W');
  const [iceVoltage, setIceVoltage] = useState(iceData.voltage || '220V / 50Hz');
  const [coolingType, setCoolingType] = useState(iceData.coolingType || 'Làm mát bằng gió (Air-cooled)');
  const [preCooling, setPreCooling] = useState(iceData.preCooling ?? true);
  const [airPump, setAirPump] = useState(iceData.airPump ?? true);

  // Chocolate Specs
  const chocoData = specsData.chocolate || {};
  const [chocoMachineType, setChocoMachineType] = useState(chocoData.machineType || 'Máy tôi/nhiệt luyện socola (Tempering)');
  const [tankCapacityKg, setTankCapacityKg] = useState(chocoData.tankCapacityKg || '25 kg');
  const [outputPerHourKg, setOutputPerHourKg] = useState(chocoData.outputPerHourKg || '30 kg/h');
  const [tempRange, setTempRange] = useState(chocoData.tempRange || '20°C - 60°C (±0.1°C)');
  const [heatingMethod, setHeatingMethod] = useState(chocoData.heatingMethod || 'Gia nhiệt cách thủy tuần hoàn');
  const [hasFootPedal, setHasFootPedal] = useState(chocoData.hasFootPedal ?? true);
  const [chocoPowerWatts, setChocoPowerWatts] = useState(chocoData.powerWatts || '1500W');
  const [chocoVoltage, setChocoVoltage] = useState(chocoData.voltage || '220V / 50Hz');
  const [materialGrade, setMaterialGrade] = useState(chocoData.materialGrade || 'Inox thực phẩm 304');

  // Kitchen Specs
  const kitchenData = specsData.kitchen || {};
  const [equipmentType, setEquipmentType] = useState(kitchenData.equipmentType || 'Lò nướng đối lưu');
  const [powerType, setPowerType] = useState(kitchenData.powerType || 'Điện');
  const [kitchenCapacity, setKitchenCapacity] = useState(kitchenData.capacity || '5 khay GN 1/1');
  const [powerKw, setPowerKw] = useState(kitchenData.powerKw || '9.2 kW');
  const [kitchenVoltage, setKitchenVoltage] = useState(kitchenData.voltage || '380V (3 pha)');
  const [kitchenTempRange, setKitchenTempRange] = useState(kitchenData.tempRange || '50°C - 300°C');

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

    const specsPayload: EquipmentSpecsInput = {
      dimensions: dimensions.trim() || undefined,
      weightKg: weightKg.trim() || undefined,
      madeIn: madeIn.trim() || undefined,
    };

    if (category === 'ICE_CREAM_MACHINE') {
      specsPayload.iceCream = {
        machineType: iceMachineType.trim(),
        flavorCount: flavorCount.trim(),
        capacityPerHour: capacityPerHour.trim(),
        cylinderCapacity: cylinderCapacity.trim(),
        hopperCapacity: hopperCapacity.trim(),
        compressor: compressor.trim(),
        refrigerant: refrigerant.trim(),
        powerWatts: icePowerWatts.trim(),
        voltage: iceVoltage.trim(),
        coolingType: coolingType.trim(),
        preCooling,
        airPump,
      };
    } else if (category === 'CHOCOLATE_MACHINE') {
      specsPayload.chocolate = {
        machineType: chocoMachineType.trim(),
        tankCapacityKg: tankCapacityKg.trim(),
        outputPerHourKg: outputPerHourKg.trim(),
        tempRange: tempRange.trim(),
        heatingMethod: heatingMethod.trim(),
        hasFootPedal,
        powerWatts: chocoPowerWatts.trim(),
        voltage: chocoVoltage.trim(),
        materialGrade: materialGrade.trim(),
      };
    } else if (category === 'KITCHEN_HOT' || category === 'KITCHEN_COLD') {
      specsPayload.kitchen = {
        equipmentType: equipmentType.trim(),
        powerType: powerType.trim(),
        capacity: kitchenCapacity.trim(),
        powerKw: powerKw.trim(),
        voltage: kitchenVoltage.trim(),
        tempRange: kitchenTempRange.trim(),
      };
    }

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

        {/* Tab 2: Technical Specs (Dynamic per Category) */}
        {activeTab === 'specs' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
            {/* Category: Ice Cream Machine */}
            {category === 'ICE_CREAM_MACHINE' && (
              <Card style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                  <IceCreamCone style={{ width: 18, height: 18, color: '#e11d48' }} />
                  <strong style={{ fontSize: 14 }}>Thông số Kỹ thuật Máy làm kem</strong>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field label="Chủng loại máy kem">
                    <Input
                      placeholder="VD: Kem tươi 3 vòi để bàn, Máy đứng có bánh xe, Gelato..."
                      value={iceMachineType}
                      onChange={(e) => setIceMachineType(e.target.value)}
                    />
                  </Field>

                  <Field label="Số họng / Số vòi & Số vị">
                    <Input
                      placeholder="VD: 3 vòi (2 vị riêng + 1 vị hỗn hợp), 1 vòi..."
                      value={flavorCount}
                      onChange={(e) => setFlavorCount(e.target.value)}
                    />
                  </Field>

                  <Field label="Năng suất làm kem (Lít/giờ hoặc kg/h)">
                    <Input
                      placeholder="VD: 28 Lít/giờ, 40 Lít/giờ..."
                      value={capacityPerHour}
                      onChange={(e) => setCapacityPerHour(e.target.value)}
                    />
                  </Field>

                  <Field label="Dung tích xi-lanh cối làm lạnh">
                    <Input
                      placeholder="VD: 1.9 Lít x 2, 3.2 Lít..."
                      value={cylinderCapacity}
                      onChange={(e) => setCylinderCapacity(e.target.value)}
                    />
                  </Field>

                  <Field label="Dung tích bể chứa nguyên liệu (Hopper)">
                    <Input
                      placeholder="VD: 12.5 Lít x 2..."
                      value={hopperCapacity}
                      onChange={(e) => setHopperCapacity(e.target.value)}
                    />
                  </Field>

                  <Field label="Hãng lốc nén / Máy nén (Compressor)">
                    <Input
                      placeholder="VD: Embraco / Aspera (Ý), Danfoss, Tecumseh..."
                      value={compressor}
                      onChange={(e) => setCompressor(e.target.value)}
                    />
                  </Field>

                  <Field label="Loại gas lạnh sử dụng">
                    <Input
                      placeholder="VD: R404a, R134a, R290..."
                      value={refrigerant}
                      onChange={(e) => setRefrigerant(e.target.value)}
                    />
                  </Field>

                  <Field label="Công suất tiêu thụ điện (W / kW)">
                    <Input
                      placeholder="VD: 2200W, 2.8 kW..."
                      value={icePowerWatts}
                      onChange={(e) => setIcePowerWatts(e.target.value)}
                    />
                  </Field>

                  <Field label="Điện áp hoạt động">
                    <Input
                      placeholder="VD: 220V / 50Hz (1 pha), 380V (3 pha)..."
                      value={iceVoltage}
                      onChange={(e) => setIceVoltage(e.target.value)}
                    />
                  </Field>

                  <Field label="Hệ thống làm mát">
                    <Input
                      placeholder="VD: Làm mát bằng gió (Air-cooled) / Làm mát nước..."
                      value={coolingType}
                      onChange={(e) => setCoolingType(e.target.value)}
                    />
                  </Field>

                  <div style={{ gridColumn: '1 / -1', display: 'flex', gap: 24, marginTop: 4 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                      <Checkbox
                        checked={preCooling}
                        onChange={(e) => setPreCooling(e.target.checked)}
                      />
                      <span>Chế độ giữ tươi qua đêm (Pre-cooling / Night mode)</span>
                    </label>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                      <Checkbox
                        checked={airPump}
                        onChange={(e) => setAirPump(e.target.checked)}
                      />
                      <span>Bơm tăng xốp nguyên liệu (Air pump)</span>
                    </label>
                  </div>
                </div>
              </Card>
            )}

            {/* Category: Chocolate Machine */}
            {category === 'CHOCOLATE_MACHINE' && (
              <Card style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                  <Cookie style={{ width: 18, height: 18, color: '#b45309' }} />
                  <strong style={{ fontSize: 14 }}>Thông số Kỹ thuật Máy làm socola</strong>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field label="Chủng loại máy socola">
                    <Input
                      placeholder="VD: Máy tôi Tempering, Nồi nấu Melting, Máy phủ Enrobing..."
                      value={chocoMachineType}
                      onChange={(e) => setChocoMachineType(e.target.value)}
                    />
                  </Field>

                  <Field label="Dung tích bồn chứa (kg hoặc Lít)">
                    <Input
                      placeholder="VD: 25 kg, 50 kg, 100 kg..."
                      value={tankCapacityKg}
                      onChange={(e) => setTankCapacityKg(e.target.value)}
                    />
                  </Field>

                  <Field label="Năng suất tôi / rót (kg/giờ)">
                    <Input
                      placeholder="VD: 30 kg/h, 60 kg/h..."
                      value={outputPerHourKg}
                      onChange={(e) => setOutputPerHourKg(e.target.value)}
                    />
                  </Field>

                  <Field label="Dải nhiệt độ kiểm soát (°C)">
                    <Input
                      placeholder="VD: 20°C - 60°C (độ chính xác ±0.1°C)..."
                      value={tempRange}
                      onChange={(e) => setTempRange(e.target.value)}
                    />
                  </Field>

                  <Field label="Cơ chế gia nhiệt">
                    <Input
                      placeholder="VD: Gia nhiệt cách thủy tuần hoàn / Thanh nhiệt..."
                      value={heatingMethod}
                      onChange={(e) => setHeatingMethod(e.target.value)}
                    />
                  </Field>

                  <Field label="Chất liệu tiếp xúc thực phẩm">
                    <Input
                      placeholder="VD: Inox 304 tiêu chuẩn thực phẩm, Inox 316..."
                      value={materialGrade}
                      onChange={(e) => setMaterialGrade(e.target.value)}
                    />
                  </Field>

                  <Field label="Công suất tiêu thụ điện (W / kW)">
                    <Input
                      placeholder="VD: 1500W, 2.2 kW..."
                      value={chocoPowerWatts}
                      onChange={(e) => setChocoPowerWatts(e.target.value)}
                    />
                  </Field>

                  <Field label="Điện áp hoạt động">
                    <Input
                      placeholder="VD: 220V / 50Hz, 380V..."
                      value={chocoVoltage}
                      onChange={(e) => setChocoVoltage(e.target.value)}
                    />
                  </Field>

                  <div style={{ gridColumn: '1 / -1', marginTop: 4 }}>
                    <label style={{ display: 'flex', alignItems: 'center', gap: 8, cursor: 'pointer', fontSize: 13 }}>
                      <Checkbox
                        checked={hasFootPedal}
                        onChange={(e) => setHasFootPedal(e.target.checked)}
                      />
                      <span>Bàn đạp chân ngắt dòng rót socola (Foot pedal)</span>
                    </label>
                  </div>
                </div>
              </Card>
            )}

            {/* Category: Kitchen Hot / Cold */}
            {(category === 'KITCHEN_HOT' || category === 'KITCHEN_COLD' || category === 'BEVERAGE_BAR' || category === 'OTHER') && (
              <Card style={{ padding: 16 }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14, borderBottom: '1px solid var(--border)', paddingBottom: 8 }}>
                  <Utensils style={{ width: 18, height: 18, color: 'var(--primary)' }} />
                  <strong style={{ fontSize: 14 }}>Thông số Kỹ thuật Thiết bị Bếp / Lạnh / Pha chế</strong>
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
                  <Field label="Loại thiết bị cụ thể">
                    <Input
                      placeholder="VD: Lò nướng đối lưu, Bếp chiên nhúng, Bàn mát salad, Máy pha cafe..."
                      value={equipmentType}
                      onChange={(e) => setEquipmentType(e.target.value)}
                    />
                  </Field>

                  <Field label="Nguồn nhiên liệu">
                    <Select value={powerType} onChange={(e) => setPowerType(e.target.value)}>
                      <option value="Điện">Điện</option>
                      <option value="Gas (LPG)">Gas (LPG)</option>
                      <option value="Hơi nước (Steam)">Hơi nước (Steam)</option>
                      <option value="Điện + Gas">Điện + Gas</option>
                    </Select>
                  </Field>

                  <Field label="Dung tích / Sức chứa">
                    <Input
                      placeholder="VD: 5 khay GN 1/1, 2 họng 28 Lít, 400 Lít..."
                      value={kitchenCapacity}
                      onChange={(e) => setKitchenCapacity(e.target.value)}
                    />
                  </Field>

                  <Field label="Dải nhiệt độ hoạt động">
                    <Input
                      placeholder="VD: 50°C - 300°C (Lò nướng) hoặc -18°C đến -22°C (Tủ đông)..."
                      value={kitchenTempRange}
                      onChange={(e) => setKitchenTempRange(e.target.value)}
                    />
                  </Field>

                  <Field label="Công suất (kW hoặc BTU/h)">
                    <Input
                      placeholder="VD: 9.2 kW, 12 kW..."
                      value={powerKw}
                      onChange={(e) => setPowerKw(e.target.value)}
                    />
                  </Field>

                  <Field label="Điện áp">
                    <Input
                      placeholder="VD: 220V 1 pha, 380V 3 pha..."
                      value={kitchenVoltage}
                      onChange={(e) => setKitchenVoltage(e.target.value)}
                    />
                  </Field>
                </div>
              </Card>
            )}

            {/* General Dimensions & Origin */}
            <Card style={{ padding: 16 }}>
              <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 10, color: 'var(--text-muted)' }}>
                Kích thước, Trọng lượng & Xuất xứ
              </div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12 }}>
                <Field label="Kích thước (Dài x Rộng x Cao cm)">
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
                    placeholder="VD: Ý, Đức, Nhật Bản, Trung Quốc, Việt Nam..."
                    value={madeIn}
                    onChange={(e) => setMadeIn(e.target.value)}
                  />
                </Field>
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
