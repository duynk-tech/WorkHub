'use client';

import React, { useState } from 'react';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  ArrowLeft,
  Printer,
  Edit,
  Edit2,
  Trash2,
  Building2,
  MapPin,
  ExternalLink,
  Utensils,
  Flame,
  Snowflake,
  Coffee,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  PackageCheck,
  Calendar,
  Clock,
  ShieldCheck,
  FileText,
  User,
  Phone,
  Mail,
  Zap,
  Gauge,
  Thermometer,
  Layers,
  Settings,
  HelpCircle,
  IceCreamCone,
  Cookie,
  Boxes,
  Building,
  TrendingUp,
  Eye,
} from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button, Card, Badge, ActionMenu, ConfirmDialog } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import {
  EQUIPMENT_CATEGORIES,
  OWNERSHIP_TYPES,
  EQUIPMENT_STATUSES,
  type IceCreamSpecs,
  type ChocolateSpecs,
  type KitchenSpecs,
  TICKET_PRIORITIES,
  TICKET_STATUSES,
} from '@/server/modules/equipment/types';
import {
  EquipmentModal,
  EquipmentPrintStickerModal,
  EquipmentHandoverModal,
} from '@/components/domain/equipment-modals';
import { deleteEquipmentAction } from '@/server/modules/equipment/actions';
import { generateQrSvg } from '@/lib/qrcode';
import { fmtDate } from '@/lib/date';

const money = (n: number) => new Intl.NumberFormat('vi-VN').format(Math.round(n || 0));

interface EquipmentDetailScreenProps {
  equipment: any;
  /** Lãi lỗ vòng đời máy; null khi máy chưa gắn với đơn bán nào. */
  profit?: any;
  customers: any[];
  canManage: boolean;
  /** Thông tin công ty cho tem QR và biên bản bàn giao. */
  company?: { name?: string; shortName?: string; phone?: string };
}

function EquipmentGalleryCard({
  images,
  equipmentName,
}: {
  images: string[];
  equipmentName: string;
}) {
  const [activeIdx, setActiveIdx] = useState(0);
  const [previewOpen, setPreviewOpen] = useState(false);

  if (!images || images.length === 0) return null;

  const activeImg = images[activeIdx] || images[0];

  return (
    <>
      <Card className="p-4 overflow-hidden">
        <div className="flex items-center justify-between mb-2.5">
          <h3 className="text-xs font-bold uppercase tracking-wider text-slate-500 dark:text-slate-400 flex items-center gap-1.5">
            <Utensils className="w-4 h-4 text-indigo-500" />
            Album ảnh máy ({images.length})
          </h3>
          {images.length > 1 && (
            <span className="text-[11px] text-slate-400 font-medium">
              {activeIdx + 1} / {images.length}
            </span>
          )}
        </div>

        {/* Ảnh chính hiển thị lớn */}
        <div
          className="relative rounded-lg overflow-hidden border border-slate-200 dark:border-slate-800 bg-slate-50 dark:bg-slate-800/50 flex items-center justify-center p-2 group cursor-pointer"
          onClick={() => setPreviewOpen(true)}
          title="Bấm để phóng to xem chi tiết"
        >
          <img
            src={activeImg}
            alt={equipmentName}
            className="w-full max-h-48 object-contain rounded transition duration-200 group-hover:scale-[1.02]"
          />
          <div className="absolute inset-0 bg-black/25 opacity-0 group-hover:opacity-100 transition flex items-center justify-center">
            <span className="bg-slate-900/85 text-white text-xs px-2.5 py-1 rounded-full flex items-center gap-1 font-medium shadow">
              <Eye className="w-3.5 h-3.5" /> Phóng to
            </span>
          </div>
        </div>

        {/* Dải thumbnail bên dưới nếu có nhiều hơn 1 ảnh */}
        {images.length > 1 && (
          <div className="flex items-center gap-2 mt-2.5 overflow-x-auto pb-1 pt-0.5">
            {images.map((img, idx) => (
              <button
                key={`${img}-${idx}`}
                type="button"
                onClick={() => setActiveIdx(idx)}
                className={`relative w-12 h-12 rounded-md overflow-hidden border-2 flex-shrink-0 transition ${
                  idx === activeIdx
                    ? 'border-indigo-600 dark:border-indigo-400 shadow-sm'
                    : 'border-slate-200 dark:border-slate-700 opacity-60 hover:opacity-100'
                }`}
                title={`Xem góc chụp #${idx + 1}`}
              >
                <img
                  src={img}
                  alt={`Thumbnail ${idx + 1}`}
                  className="w-full h-full object-cover"
                />
              </button>
            ))}
          </div>
        )}
      </Card>

      {/* Modal phóng to xem ảnh sắc nét */}
      {previewOpen && (
        <Modal
          open={previewOpen}
          onClose={() => setPreviewOpen(false)}
          title={`Ảnh thiết bị: ${equipmentName} (${activeIdx + 1}/${images.length})`}
          size="lg"
        >
          <div className="flex flex-col items-center justify-center p-2">
            <img
              src={activeImg}
              alt={equipmentName}
              className="max-w-full max-h-[72vh] object-contain rounded-lg border border-slate-200 dark:border-slate-800"
            />
            {images.length > 1 && (
              <div className="flex items-center justify-center gap-2 mt-4 flex-wrap">
                {images.map((img, idx) => (
                  <button
                    key={`${img}-${idx}`}
                    type="button"
                    onClick={() => setActiveIdx(idx)}
                    className={`w-14 h-14 rounded-md overflow-hidden border-2 transition ${
                      idx === activeIdx
                        ? 'border-indigo-600 scale-105 shadow'
                        : 'border-slate-200 dark:border-slate-700 opacity-60 hover:opacity-100'
                    }`}
                  >
                    <img
                      src={img}
                      alt={`Thumbnail ${idx + 1}`}
                      className="w-full h-full object-cover"
                    />
                  </button>
                ))}
              </div>
            )}
          </div>
        </Modal>
      )}
    </>
  );
}

export function EquipmentDetailScreen({
  equipment,
  profit,
  customers,
  canManage,
  company,
}: EquipmentDetailScreenProps) {
  const router = useRouter();
  const toast = useToast();

  const [activeTab, setActiveTab] = useState<'specs' | 'location' | 'tickets' | 'parts' | 'profit'>('specs');
  const [editModalOpen, setEditModalOpen] = useState(false);
  const [printModalOpen, setPrintModalOpen] = useState(false);
  const [handoverModalOpen, setHandoverModalOpen] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const allReplacedParts = (equipment.tickets || []).flatMap((t: any) =>
    (t.partsUsed || []).map((pu: any) => ({
      ...pu,
      ticketCode: t.ticketCode,
      ticketTitle: t.title,
      ticketDate: t.createdAt,
      assignedTo: t.assignedTo,
    }))
  );

  const categoryDef = EQUIPMENT_CATEGORIES[equipment.category];
  const ownershipDef = OWNERSHIP_TYPES[equipment.ownershipType];
  const statusDef = EQUIPMENT_STATUSES[equipment.status];

  const specs = (equipment.specs as Record<string, any>) || {};
  const iceCreamSpecs = specs.iceCream || specs;
  const chocoSpecs = specs.chocolate || specs;
  const kitchenSpecs = specs.kitchen || specs;

  const [deleteConfirmOpen, setDeleteConfirmOpen] = useState(false);

  const handleDelete = () => {
    setDeleteConfirmOpen(true);
  };

  const confirmDelete = async () => {
    setIsDeleting(true);
    const res = await deleteEquipmentAction(equipment.id);
    setIsDeleting(false);
    setDeleteConfirmOpen(false);

    if (res.ok) {
      toast.success(res.message);
      router.push('/equipment');
    } else {
      toast.error(res.message || 'Có lỗi xảy ra khi xóa thiết bị');
    }
  };

  const qrSvg = generateQrSvg(
    typeof window !== 'undefined'
      ? `${window.location.origin}/equipment/${equipment.id}`
      : `EQ:${equipment.machineCode}`,
    { size: 180, margin: 1 }
  );

  return (
    <div className="space-y-6">
      {/* Top Header — đặt trên nền thẻ để tách khỏi nền trang cùng tông */}
      <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-3">
          <Link
            href="/spare-parts?tab=machines"
            className="p-2 rounded-lg border border-slate-200 dark:border-slate-800 hover:bg-slate-100 dark:hover:bg-slate-800 transition text-slate-600 dark:text-slate-300 shrink-0"
          >
            <ArrowLeft className="w-5 h-5" />
          </Link>
          {equipment.imageUrl && (
            <div className="w-12 h-12 rounded-lg border border-slate-200 dark:border-slate-800 bg-white dark:bg-slate-800 overflow-hidden flex items-center justify-center shrink-0 shadow-sm">
              <img
                src={equipment.imageUrl}
                alt={equipment.name}
                className="w-full h-full object-cover"
              />
            </div>
          )}
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <span className="text-xs font-mono font-bold text-indigo-600 dark:text-indigo-400 bg-indigo-50 dark:bg-indigo-950/50 px-2.5 py-0.5 rounded-full border border-indigo-200 dark:border-indigo-800">
                {equipment.machineCode}
              </span>
              <h1 className="text-xl sm:text-2xl font-black text-slate-900 dark:text-white tracking-tight">
                {equipment.name}
              </h1>
            </div>
            <p className="text-xs sm:text-sm text-slate-500 dark:text-slate-400 mt-1">
              {categoryDef?.label || equipment.category} • Hãng: {equipment.brand || '—'} • Model:{' '}
              {equipment.model || '—'}
            </p>
          </div>
        </div>

        {canManage && (
          /* Giữ một thao tác chính ở ngoài, phần còn lại gom vào menu ba chấm
             để hàng nút không tràn xuống dòng thứ hai */
          <div className="flex items-center gap-2 shrink-0">
            <Button
              variant="secondary"
              size="sm"
              className="flex items-center gap-1.5"
              onClick={() => setPrintModalOpen(true)}
              title="In tem QR dán lên máy"
            >
              <Printer className="w-4 h-4" />
              In tem QR
            </Button>

            <Button
              variant="secondary"
              size="sm"
              className="flex items-center gap-1.5"
              onClick={() => setEditModalOpen(true)}
            >
              <Edit2 className="w-4 h-4" />
              Chỉnh sửa
            </Button>

            <ActionMenu
              title={equipment.machineCode}
              items={[
                {
                  key: 'handover',
                  label: 'In phiếu bàn giao',
                  hint: 'Biên bản bàn giao & nghiệm thu hoặc phiếu giao nhận',
                  icon: <FileText className="w-4 h-4 text-blue-600" />,
                  onClick: () => setHandoverModalOpen(true),
                },
                {
                  key: 'delete',
                  label: isDeleting ? 'Đang xóa…' : 'Xóa thiết bị',
                  icon: <Trash2 className="w-4 h-4" />,
                  onClick: handleDelete,
                  danger: true,
                  disabled: isDeleting,
                },
              ]}
            />
          </div>
        )}
      </div>

      {/* Overview Status Bar */}
      <div className="flex flex-wrap items-center gap-4 bg-white dark:bg-slate-900 border border-slate-200 dark:border-slate-800 rounded-xl p-4 shadow-sm">
        <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
          <span>Hình thức sở hữu:</span>
          <Badge
            tone={
              equipment.ownershipType === 'RENTAL'
                ? 'warning'
                : equipment.ownershipType === 'LOAN'
                ? 'info'
                : equipment.ownershipType === 'CONSIGNMENT'
                ? 'info'
                : 'outline'
            }
          >
            {ownershipDef?.label || equipment.ownershipType}
          </Badge>
        </div>

        <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />

        <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
          <span>Trạng thái:</span>
          <Badge
            tone={
              equipment.status === 'OPERATING'
                ? 'success'
                : equipment.status === 'BREAKDOWN'
                ? 'danger'
                : equipment.status === 'UNDER_MAINTENANCE'
                ? 'warning'
                : 'outline'
            }
          >
            {statusDef?.label || equipment.status}
          </Badge>
        </div>

        {equipment.customer && (
          <>
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />
            <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
              <Building2 className="w-4 h-4 text-slate-400" />
              <span>Khách hàng:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {equipment.customer.name}
              </span>
            </div>
          </>
        )}

        {equipment.location && (
          <>
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />
            <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
              <MapPin className="w-4 h-4 text-emerald-500" />
              <span>Điểm lắp đặt:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {equipment.location.name}
              </span>
            </div>
          </>
        )}

        {equipment.warehouse && (
          <>
            <div className="h-4 w-px bg-slate-200 dark:bg-slate-700 hidden sm:block" />
            <div className="flex items-center gap-1.5 text-sm text-slate-600 dark:text-slate-400">
              <Building className="w-4 h-4 text-sky-500" />
              <span>Vị trí kho:</span>
              <span className="font-semibold text-slate-800 dark:text-slate-200">
                {equipment.warehouse.name} ({equipment.warehouse.code})
              </span>
            </div>
          </>
        )}
      </div>

      {/* Tabs */}
      <div className="border-b border-slate-200 dark:border-slate-800 flex gap-6">
        <button
          className={`pb-3 text-sm font-medium transition border-b-2 flex items-center gap-2 ${
            activeTab === 'specs'
              ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
          onClick={() => setActiveTab('specs')}
        >
          <Settings className="w-4 h-4" />
          Thông số Kỹ thuật
        </button>

        <button
          className={`pb-3 text-sm font-medium transition border-b-2 flex items-center gap-2 ${
            activeTab === 'location'
              ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
          onClick={() => setActiveTab('location')}
        >
          <MapPin className="w-4 h-4" />
          Điểm Lắp đặt & Khách hàng
        </button>

        <button
          className={`pb-3 text-sm font-medium transition border-b-2 flex items-center gap-2 ${
            activeTab === 'tickets'
              ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
          onClick={() => setActiveTab('tickets')}
        >
          <Wrench className="w-4 h-4" />
          Lịch sử Sửa chữa ({equipment.tickets?.length || 0})
        </button>

        <button
          className={`pb-3 text-sm font-medium transition border-b-2 flex items-center gap-2 ${
            activeTab === 'parts'
              ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
          onClick={() => setActiveTab('parts')}
        >
          <Boxes className="w-4 h-4" />
          Linh kiện đã thay ({allReplacedParts.length})
        </button>

        <button
          className={`pb-3 text-sm font-medium transition border-b-2 flex items-center gap-2 ${
            activeTab === 'profit'
              ? 'border-indigo-600 text-indigo-600 dark:border-indigo-400 dark:text-indigo-400'
              : 'border-transparent text-slate-500 hover:text-slate-800 dark:hover:text-slate-200'
          }`}
          onClick={() => setActiveTab('profit')}
        >
          <TrendingUp className="w-4 h-4" />
          Lãi / Lỗ
        </button>

      </div>

      {/* Tab 1: Specs */}
      {activeTab === 'specs' && (() => {
        // Trích xuất danh sách thông số linh hoạt (Dynamic Specs + Legacy)
        const specItems: { label: string; value: string; highlight?: boolean }[] = [];

        const voltage = specs.voltage || iceCreamSpecs.voltage || chocoSpecs.voltage || kitchenSpecs.voltage;
        const rawPower =
          specs.powerWatts ||
          specs.powerKw ||
          iceCreamSpecs.powerWatts ||
          chocoSpecs.powerWatts ||
          kitchenSpecs.powerKw ||
          specs.power;

        if (voltage) {
          specItems.push({ label: 'Điện áp vận hành', value: String(voltage) });
        }
        if (rawPower) {
          const pStr = String(rawPower);
          specItems.push({
            label: 'Công suất tiêu thụ',
            value: pStr.includes('W') || pStr.includes('kW') ? pStr : `${pStr}W`,
          });
        }

        // Ưu tiên mảng attributes động
        if (Array.isArray(specs.attributes) && specs.attributes.length > 0) {
          specs.attributes.forEach((attr: any) => {
            if (attr && attr.label && attr.value) {
              const label = String(attr.label).trim();
              const value = String(attr.value).trim();
              if (label && value) {
                specItems.push({
                  label,
                  value,
                  highlight:
                    label.toLowerCase().includes('năng suất') ||
                    label.toLowerCase().includes('dung tích') ||
                    label.toLowerCase().includes('group') ||
                    label.toLowerCase().includes('khay') ||
                    label.toLowerCase().includes('lưỡi dao'),
                });
              }
            }
          });
        } else {
          // Fallback các trường legacy nếu chưa chuyển đổi
          if (equipment.category === 'ICE_CREAM_MACHINE') {
            if (iceCreamSpecs.machineType) specItems.push({ label: 'Dòng máy / Chủng loại', value: iceCreamSpecs.machineType });
            if (iceCreamSpecs.flavorCount) specItems.push({ label: 'Số vòi / Vị kem', value: iceCreamSpecs.flavorCount });
            if (iceCreamSpecs.capacityPerHour) specItems.push({ label: 'Năng suất làm kem', value: iceCreamSpecs.capacityPerHour, highlight: true });
            if (iceCreamSpecs.cylinderCapacity) specItems.push({ label: 'Cối xi lanh làm lạnh', value: iceCreamSpecs.cylinderCapacity });
            if (iceCreamSpecs.hopperCapacity) specItems.push({ label: 'Dung tích phễu (Hopper)', value: iceCreamSpecs.hopperCapacity });
            if (iceCreamSpecs.compressor) specItems.push({ label: 'Máy nén (Compressor)', value: iceCreamSpecs.compressor });
            if (iceCreamSpecs.refrigerant) specItems.push({ label: 'Môi chất lạnh (Gas)', value: iceCreamSpecs.refrigerant });
            if (iceCreamSpecs.coolingType) specItems.push({ label: 'Hệ thống giải nhiệt', value: iceCreamSpecs.coolingType });
            if (iceCreamSpecs.preCooling !== undefined) {
              specItems.push({ label: 'Giữ lạnh ban đêm (Pre-cooling)', value: iceCreamSpecs.preCooling ? 'Có (Chống chua kem)' : 'Không có' });
            }
            if (iceCreamSpecs.airPump !== undefined) {
              specItems.push({ label: 'Bơm tăng xốp (Air Pump)', value: iceCreamSpecs.airPump ? 'Có (Tăng độ phồng kem)' : 'Không có' });
            }
          } else if (equipment.category === 'CHOCOLATE_MACHINE') {
            if (chocoSpecs.machineType) specItems.push({ label: 'Loại máy socola', value: chocoSpecs.machineType });
            if (chocoSpecs.tankCapacityKg) specItems.push({ label: 'Dung tích bồn chứa', value: chocoSpecs.tankCapacityKg });
            if (chocoSpecs.outputPerHourKg) specItems.push({ label: 'Năng suất xử lý / rót', value: chocoSpecs.outputPerHourKg, highlight: true });
            if (chocoSpecs.tempRange) specItems.push({ label: 'Dải nhiệt độ kiểm soát', value: chocoSpecs.tempRange });
            if (chocoSpecs.heatingMethod) specItems.push({ label: 'Cơ chế gia nhiệt', value: chocoSpecs.heatingMethod });
            if (chocoSpecs.materialGrade) specItems.push({ label: 'Vật liệu tiếp xúc thực phẩm', value: chocoSpecs.materialGrade });
            if (chocoSpecs.hasFootPedal !== undefined) {
              specItems.push({ label: 'Bàn đạp chân ngắt rót', value: chocoSpecs.hasFootPedal ? 'Có trang bị' : 'Không có' });
            }
          } else {
            if (kitchenSpecs.equipmentType) specItems.push({ label: 'Loại thiết bị cụ thể', value: kitchenSpecs.equipmentType });
            if (kitchenSpecs.powerType) specItems.push({ label: 'Nguồn năng lượng', value: kitchenSpecs.powerType });
            if (kitchenSpecs.capacity) specItems.push({ label: 'Dung tích / Sức chứa', value: kitchenSpecs.capacity, highlight: true });
            if (kitchenSpecs.tempRange) specItems.push({ label: 'Dải nhiệt độ làm việc', value: kitchenSpecs.tempRange });
          }
        }

        const physicalInfo: { label: string; value: string }[] = [];
        if (specs.dimensions) physicalInfo.push({ label: 'Kích thước', value: specs.dimensions });
        if (specs.weightKg) physicalInfo.push({ label: 'Trọng lượng', value: `${specs.weightKg} kg` });
        if (specs.madeIn) physicalInfo.push({ label: 'Xuất xứ', value: specs.madeIn });

        // 3 vé bảo trì gần nhất
        const recentTickets = [...(equipment.tickets || [])]
          .sort((a: any, b: any) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime())
          .slice(0, 3);

        return (
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 items-start">
            {/* Cột trái (2 phần): Thông số kỹ thuật + Lịch sử bảo dưỡng gần nhất */}
            <div className="lg:col-span-2 space-y-6">
              {/* Card 1: Thông số Kỹ thuật */}
              <Card className="p-6">
                <div className="flex items-center justify-between mb-4">
                  <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
                    <Settings className="w-5 h-5 text-indigo-600" />
                    Thông số Kỹ thuật Chuyên môn
                  </h2>
                  {canManage && (
                    <Button
                      variant="secondary"
                      size="sm"
                      onClick={() => setEditModalOpen(true)}
                      className="text-xs flex items-center gap-1.5"
                    >
                      <Edit className="w-3.5 h-3.5" />
                      Sửa thông số
                    </Button>
                  )}
                </div>

                {specItems.length > 0 ? (
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    {specItems.map((item, idx) => (
                      <div
                        key={idx}
                        className={`p-3 rounded-lg border transition ${
                          item.highlight
                            ? 'bg-indigo-50/50 dark:bg-indigo-950/20 border-indigo-200/70 dark:border-indigo-800/60'
                            : 'bg-slate-50 dark:bg-slate-800/40 border-slate-100 dark:border-slate-800'
                        }`}
                      >
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          {item.label}
                        </div>
                        <div
                          className={`text-sm sm:text-base font-semibold mt-0.5 break-words ${
                            item.highlight
                              ? 'text-indigo-700 dark:text-indigo-300'
                              : 'text-slate-800 dark:text-slate-200'
                          }`}
                        >
                          {item.value}
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="p-6 text-center border border-dashed border-slate-200 dark:border-slate-800 rounded-lg text-slate-500 text-sm">
                    Chưa có thông số kỹ thuật nào. Bấm <strong>"Sửa thông số"</strong> để nạp mẫu hoặc nhập thông số cho máy.
                  </div>
                )}

                {/* Kích thước & Trọng lượng & Xuất xứ */}
                {physicalInfo.length > 0 && (
                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800 grid grid-cols-1 sm:grid-cols-3 gap-3">
                    {physicalInfo.map((p, idx) => (
                      <div key={idx} className="p-2.5 bg-slate-50 dark:bg-slate-800/30 rounded-lg text-xs">
                        <span className="text-slate-500">{p.label}: </span>
                        <strong className="text-slate-700 dark:text-slate-300 ml-1">{p.value}</strong>
                      </div>
                    ))}
                  </div>
                )}

                {/* Ghi chú vận hành */}
                {equipment.notes && (
                  <div className="mt-4 pt-4 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-xs font-semibold text-slate-500 mb-1">Ghi chú & Lưu ý kỹ thuật:</div>
                    <p className="text-sm text-slate-700 dark:text-slate-300 whitespace-pre-line bg-amber-50 dark:bg-amber-950/20 p-3 rounded-lg border border-amber-200/50 dark:border-amber-800/50">
                      {equipment.notes}
                    </p>
                  </div>
                )}
              </Card>

              {/* Card 2: Lịch sử Sửa chữa & Sự cố gần nhất (Lấp đầy không gian, cung cấp giá trị nghiệp vụ) */}
              <Card className="p-5">
                <div className="flex items-center justify-between mb-4">
                  <div className="flex items-center gap-2">
                    <Wrench className="w-4 h-4 text-indigo-600" />
                    <h3 className="text-sm font-bold text-slate-900 dark:text-white">
                      Sự cố & Bảo dưỡng gần nhất ({equipment.tickets?.length || 0})
                    </h3>
                  </div>
                  {equipment.tickets && equipment.tickets.length > 0 && (
                    <button
                      type="button"
                      onClick={() => setActiveTab('tickets')}
                      className="text-xs text-indigo-600 hover:text-indigo-700 dark:text-indigo-400 font-semibold inline-flex items-center gap-1"
                    >
                      Xem toàn bộ ({equipment.tickets.length})
                      <ExternalLink className="w-3.5 h-3.5" />
                    </button>
                  )}
                </div>

                {recentTickets.length > 0 ? (
                  <div className="space-y-2.5">
                    {recentTickets.map((t: any) => (
                      <div
                        key={t.id}
                        className="p-3 bg-slate-50 dark:bg-slate-800/40 rounded-lg border border-slate-100 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2 text-xs hover:border-slate-300 dark:hover:border-slate-700 transition"
                      >
                        <div className="space-y-1 min-w-0">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-mono font-bold text-slate-700 dark:text-slate-300 bg-white dark:bg-slate-900 px-1.5 py-0.5 rounded border border-slate-200 dark:border-slate-700">
                              {t.code}
                            </span>
                            <span className="font-semibold text-slate-900 dark:text-white truncate">
                              {t.title}
                            </span>
                          </div>
                          <div className="flex items-center gap-3 text-slate-500">
                            <span>{fmtDate(t.createdAt)}</span>
                            {t.assignedTo && (
                              <span>
                                KTV: <strong className="text-slate-700 dark:text-slate-300">{t.assignedTo.fullName}</strong>
                              </span>
                            )}
                          </div>
                        </div>
                        <div className="flex items-center gap-1.5 shrink-0">
                          <Badge
                            tone={
                              t.priority === 'CRITICAL'
                                ? 'danger'
                                : t.priority === 'HIGH'
                                ? 'warning'
                                : 'outline'
                            }
                          >
                            {TICKET_PRIORITIES[t.priority]?.label || t.priority}
                          </Badge>
                          <Badge
                            tone={
                              t.status === 'RESOLVED' || t.status === 'CLOSED'
                                ? 'success'
                                : t.status === 'IN_PROGRESS'
                                ? 'info'
                                : 'warning'
                            }
                          >
                            {TICKET_STATUSES[t.status]?.label || t.status}
                          </Badge>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-3.5 p-3.5 bg-emerald-50/60 dark:bg-emerald-950/20 border border-emerald-200/50 dark:border-emerald-800/40 rounded-lg">
                    <div className="w-9 h-9 rounded-full bg-emerald-100 dark:bg-emerald-900/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
                      <ShieldCheck className="w-5 h-5" />
                    </div>
                    <div>
                      <div className="text-xs font-bold text-emerald-900 dark:text-emerald-200">
                        Thiết bị đang vận hành ổn định
                      </div>
                      <div className="text-xs text-emerald-700 dark:text-emerald-400 mt-0.5">
                        Chưa ghi nhận sự cố hỏng hóc hay lịch sửa chữa phát sinh tại điểm khách hàng.
                      </div>
                    </div>
                  </div>
                )}
              </Card>
            </div>

            {/* Cột phải (1 phần): Album ảnh máy + Bảo hành + Mã QR (Gọn gàng, cân đối) */}
            <div className="space-y-6">
              {(() => {
                const galleryImages: string[] =
                  Array.isArray(specs.gallery) && specs.gallery.length > 0
                    ? specs.gallery
                    : equipment.imageUrl
                    ? [equipment.imageUrl]
                    : [];

                return (
                  galleryImages.length > 0 && (
                    <EquipmentGalleryCard
                      images={galleryImages}
                      equipmentName={equipment.name}
                    />
                  )
                );
              })()}

              <Card className="p-5">
                <h2 className="text-sm font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-3.5">
                  <Calendar className="w-4 h-4 text-emerald-600" />
                  Chu kỳ & Hạn Bảo hành
                </h2>

                <div className="space-y-3 text-xs">
                  <div>
                    <div className="text-slate-500">Ngày lắp đặt / Bàn giao</div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                      {equipment.installedDate ? fmtDate(equipment.installedDate) : 'Chưa cập nhật'}
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-slate-500">Thời hạn bảo hành</div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                      {equipment.warrantyExpiresAt ? (
                        <span
                          className={
                            new Date(equipment.warrantyExpiresAt) < new Date()
                              ? 'text-rose-600 font-bold'
                              : 'text-emerald-600 font-bold'
                          }
                        >
                          {fmtDate(equipment.warrantyExpiresAt)}{' '}
                          {new Date(equipment.warrantyExpiresAt) < new Date()
                            ? '(Đã hết hạn)'
                            : '(Còn bảo hành)'}
                        </span>
                      ) : (
                        'Không áp dụng'
                      )}
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-slate-500">Bảo dưỡng định kỳ gần nhất</div>
                    <div className="text-sm font-semibold text-slate-800 dark:text-slate-200 mt-0.5">
                      {equipment.lastPmDate ? fmtDate(equipment.lastPmDate) : 'Chưa thực hiện'}
                    </div>
                  </div>

                  <div className="pt-2.5 border-t border-slate-100 dark:border-slate-800">
                    <div className="text-slate-500">Lịch bảo dưỡng tiếp theo</div>
                    <div className="text-sm font-semibold text-indigo-600 dark:text-indigo-400 mt-0.5">
                      {equipment.nextPmDate ? fmtDate(equipment.nextPmDate) : 'Chưa lên lịch'}
                    </div>
                  </div>
                </div>
              </Card>

              {/* Quick QR Mini Card */}
              <Card className="p-5 text-center">
                <h3 className="text-xs font-semibold text-slate-500 uppercase tracking-wider mb-2.5">
                  Mã QR Tra cứu Nhanh
                </h3>
                <div
                  className="flex justify-center p-2 bg-white rounded-lg border border-slate-200 dark:border-slate-700 max-w-[130px] mx-auto cursor-pointer hover:shadow-md transition"
                  onClick={() => setPrintModalOpen(true)}
                  dangerouslySetInnerHTML={{ __html: qrSvg }}
                  title="Click để in tem QR"
                />
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => setPrintModalOpen(true)}
                  className="w-full mt-3 text-xs flex items-center justify-center gap-1.5"
                >
                  <Printer className="w-3.5 h-3.5" /> In tem QR dán máy
                </Button>
              </Card>
            </div>
          </div>
        );
      })()}

      {/* Tab 2: Location & Customer */}
      {activeTab === 'location' && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          {/* Customer Card */}
          <Card className="p-6">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
              <Building2 className="w-5 h-5 text-indigo-600" />
              Thông tin Khách hàng / Chủ sở hữu
            </h2>

            {equipment.customer ? (
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-slate-500">Tên doanh nghiệp / Khách hàng</div>
                  <div className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                    {equipment.customer.name}
                  </div>
                  <div className="text-xs font-mono text-slate-500">
                    Mã KH: {equipment.customer.code}
                  </div>
                </div>

                {equipment.customer.phone && (
                  <div className="flex items-center gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-sm">
                    <Phone className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600 dark:text-slate-400">Điện thoại:</span>
                    <a
                      href={`tel:${equipment.customer.phone}`}
                      className="font-semibold text-indigo-600 hover:underline"
                    >
                      {equipment.customer.phone}
                    </a>
                  </div>
                )}

                {equipment.customer.email && (
                  <div className="flex items-center gap-2 text-sm">
                    <Mail className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600 dark:text-slate-400">Email:</span>
                    <a
                      href={`mailto:${equipment.customer.email}`}
                      className="font-medium text-slate-700 dark:text-slate-300"
                    >
                      {equipment.customer.email}
                    </a>
                  </div>
                )}

                {equipment.customer.address && (
                  <div className="flex items-start gap-2 text-sm">
                    <MapPin className="w-4 h-4 text-slate-400 mt-0.5 flex-shrink-0" />
                    <div>
                      <span className="text-slate-600 dark:text-slate-400">Địa chỉ trụ sở: </span>
                      <span className="text-slate-700 dark:text-slate-300">
                        {equipment.customer.address}
                      </span>
                    </div>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                <Building2 className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p>Thiết bị hiện chưa gán cho khách hàng nào (Đang lưu kho nội bộ)</p>
              </div>
            )}
          </Card>

          {/* Installation Location Card */}
          <Card className="p-6">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2 mb-4">
              <MapPin className="w-5 h-5 text-emerald-600" />
              Điểm Lắp đặt / Chi nhánh Quán
            </h2>

            {equipment.location ? (
              <div className="space-y-4">
                <div>
                  <div className="text-xs text-slate-500">Tên điểm lắp đặt / Cửa hàng</div>
                  <div className="text-lg font-bold text-slate-800 dark:text-slate-100 mt-0.5">
                    {equipment.location.name}
                  </div>
                </div>

                <div className="flex items-start gap-2 pt-3 border-t border-slate-100 dark:border-slate-800 text-sm">
                  <MapPin className="w-4 h-4 text-emerald-500 mt-0.5 flex-shrink-0" />
                  <div>
                    <span className="text-slate-600 dark:text-slate-400">Địa chỉ lắp đặt: </span>
                    <span className="text-slate-800 dark:text-slate-200 font-medium">
                      {equipment.location.address}
                    </span>
                  </div>
                </div>

                {equipment.location.managerName && (
                  <div className="flex items-center gap-2 text-sm">
                    <User className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600 dark:text-slate-400">Quản lý quán:</span>
                    <span className="font-semibold text-slate-700 dark:text-slate-300">
                      {equipment.location.managerName}
                    </span>
                  </div>
                )}

                {equipment.location.phone && (
                  <div className="flex items-center gap-2 text-sm">
                    <Phone className="w-4 h-4 text-slate-400" />
                    <span className="text-slate-600 dark:text-slate-400">Hotline quán:</span>
                    <a
                      href={`tel:${equipment.location.phone}`}
                      className="font-semibold text-indigo-600 hover:underline"
                    >
                      {equipment.location.phone}
                    </a>
                  </div>
                )}
              </div>
            ) : (
              <div className="text-center py-8 text-slate-400">
                <MapPin className="w-10 h-10 mx-auto mb-2 opacity-40" />
                <p>Chưa có thông tin điểm lắp đặt cụ thể</p>
              </div>
            )}
          </Card>
        </div>
      )}

      {/* Tab 3: Tickets / Maintenance History */}
      {activeTab === 'tickets' && (
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Wrench className="w-5 h-5 text-indigo-600" />
              Nhật ký Phiếu Báo hỏng & Bảo trì Thiết bị
            </h2>
          </div>

          {equipment.tickets && equipment.tickets.length > 0 ? (
            <div className="space-y-3">
              {equipment.tickets.map((t: any) => (
                <Card key={t.id} className="p-4 hover:border-slate-300 dark:hover:border-slate-700 transition">
                  <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                    <div className="flex items-center gap-3">
                      <span className="font-mono text-xs px-2 py-0.5 rounded bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 border border-slate-200 dark:border-slate-700 font-semibold">
                        {t.code}
                      </span>
                      <h3 className="font-semibold text-slate-900 dark:text-white text-base">
                        {t.title}
                      </h3>
                    </div>

                    <div className="flex items-center gap-2">
                      <Badge
                        tone={
                          t.priority === 'CRITICAL'
                            ? 'danger'
                            : t.priority === 'HIGH'
                            ? 'warning'
                            : 'outline'
                        }
                      >
                        {TICKET_PRIORITIES[t.priority]?.label || 'Không xác định'}
                      </Badge>
                      <Badge
                        tone={
                          t.status === 'RESOLVED' || t.status === 'CLOSED'
                            ? 'success'
                            : t.status === 'IN_PROGRESS'
                            ? 'info'
                            : 'warning'
                        }
                      >
                        {TICKET_STATUSES[t.status]?.label || 'Không xác định'}
                      </Badge>
                    </div>
                  </div>

                  {t.description && (
                    <p className="text-sm text-slate-600 dark:text-slate-400 mt-2 line-clamp-2">
                      {t.description}
                    </p>
                  )}

                  <div className="flex items-center gap-4 mt-3 pt-3 border-t border-slate-100 dark:border-slate-800 text-xs text-slate-500 flex-wrap">
                    <div className="flex items-center gap-1">
                      <Clock className="w-3.5 h-3.5" />
                      <span>Ngày tạo: {fmtDate(t.createdAt)}</span>
                    </div>

                    {t.assignedTo && (
                      <div className="flex items-center gap-1.5">
                        <User className="w-3.5 h-3.5 text-slate-400" />
                        <span>KTV phụ trách: <strong className="text-slate-700 dark:text-slate-300">{t.assignedTo.fullName}</strong></span>
                      </div>
                    )}

                    {t.resolvedAt && (
                      <div className="flex items-center gap-1 text-emerald-600 font-medium">
                        <CheckCircle2 className="w-3.5 h-3.5" />
                        <span>Đã hoàn tất: {fmtDate(t.resolvedAt)}</span>
                      </div>
                    )}
                  </div>
                </Card>
              ))}
            </div>
          ) : (
            <Card className="p-8 text-center text-slate-400">
              <CheckCircle2 className="w-12 h-12 mx-auto mb-2 text-emerald-500 opacity-60" />
              <p className="font-medium text-slate-700 dark:text-slate-300">
                Chưa ghi nhận sự cố hỏng hóc nào
              </p>
              <p className="text-sm text-slate-500 mt-1">
                Thiết bị đang vận hành ổn định tại điểm bán.
              </p>
            </Card>
          )}
        </div>
      )}

      {/* Tab 4: QR Sticker Tag */}
      {activeTab === 'profit' && (
        <Card className="p-5">
          {!profit || (!profit.hasCost && profit.soldPrice === 0 && profit.ticketCount === 0) ? (
            <div className="text-sm text-slate-500 dark:text-slate-400">
              Máy này chưa gắn với đơn bán nào trong hệ thống nên chưa tính được lãi lỗ. Máy bán qua
              luồng <strong>xuất kho giao khách</strong> sẽ tự có giá vốn và giá bán.
            </div>
          ) : (
            <div className="space-y-5">
              {!profit.hasCost && (
                <div className="rounded-lg border border-amber-200 bg-amber-50 dark:border-amber-900 dark:bg-amber-950/40 px-4 py-3 text-sm text-amber-800 dark:text-amber-300">
                  Máy này chưa có giá vốn — được khai tay trước khi hệ thống quản lý máy qua kho.
                  Phần lãi bán hàng bên dưới để trống thay vì lấy nguyên giá bán làm lãi.
                </div>
              )}

              <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                {[
                  { label: 'Giá bán', value: profit.soldPrice, hint: profit.orderCode ? `Đơn ${profit.orderCode}` : null },
                  { label: 'Giá vốn', value: profit.hasCost ? profit.unitCost : null, hint: 'Chốt lúc xuất kho' },
                  {
                    label: 'Lãi bán hàng',
                    value: profit.hasCost ? profit.saleProfit : null,
                    hint: profit.hasCost ? `Tỷ suất ${profit.saleMarginPercent}%` : 'Chưa đủ dữ liệu',
                    tone: true,
                  },
                  {
                    label: 'Lãi thuần vòng đời',
                    value: profit.hasCost ? profit.netProfit : null,
                    hint: 'Đã cộng dịch vụ, trừ linh kiện',
                    tone: true,
                  },
                ].map((c) => (
                  <div key={c.label} className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                    <div className="text-xs text-slate-500 dark:text-slate-400">{c.label}</div>
                    <div
                      className={`text-lg font-bold ${
                        c.tone && c.value !== null
                          ? c.value >= 0
                            ? 'text-emerald-600 dark:text-emerald-400'
                            : 'text-red-600 dark:text-red-400'
                          : 'text-slate-900 dark:text-white'
                      }`}
                    >
                      {c.value === null ? '—' : `${money(c.value)} ₫`}
                    </div>
                    {c.hint && <div className="text-[11px] text-slate-400 mt-0.5">{c.hint}</div>}
                  </div>
                ))}
              </div>

              <div className="grid gap-3 sm:grid-cols-3">
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Doanh thu dịch vụ</div>
                  <div className="text-base font-semibold text-slate-900 dark:text-white">{money(profit.serviceRevenue)} ₫</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">
                    {profit.billedTicketCount}/{profit.ticketCount} ca có thu tiền
                  </div>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Chi phí linh kiện</div>
                  <div className="text-base font-semibold text-slate-900 dark:text-white">{money(profit.servicePartsCost)} ₫</div>
                  <div className="text-[11px] text-slate-400 mt-0.5">Tính cả ca bảo hành không thu tiền</div>
                </div>
                <div className="rounded-xl border border-slate-200 dark:border-slate-800 p-4">
                  <div className="text-xs text-slate-500 dark:text-slate-400">Lãi từ dịch vụ</div>
                  <div
                    className={`text-base font-semibold ${
                      profit.serviceProfit >= 0 ? 'text-emerald-600 dark:text-emerald-400' : 'text-red-600 dark:text-red-400'
                    }`}
                  >
                    {money(profit.serviceProfit)} ₫
                  </div>
                </div>
              </div>

              {profit.tickets.length > 0 && (
                <div>
                  <div className="text-sm font-semibold text-slate-900 dark:text-white mb-2">
                    Chi tiết theo ca sửa chữa
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full text-sm">
                      <thead>
                        <tr className="text-left text-xs text-slate-500 dark:text-slate-400 border-b border-slate-200 dark:border-slate-800">
                          <th className="py-2 pr-3">Phiếu</th>
                          <th className="py-2 pr-3">Sự cố</th>
                          <th className="py-2 pr-3 text-right whitespace-nowrap">Chi phí linh kiện</th>
                          <th className="py-2 pr-3 text-right whitespace-nowrap">Đã thu</th>
                          <th className="py-2 text-right whitespace-nowrap">Chênh lệch</th>
                        </tr>
                      </thead>
                      <tbody>
                        {profit.tickets.map((t: any) => (
                          <tr key={t.ticketCode} className="border-b border-slate-100 dark:border-slate-800/60">
                            <td className="py-2 pr-3 font-mono text-xs text-indigo-600 dark:text-indigo-400 whitespace-nowrap">
                              {t.ticketCode}
                            </td>
                            <td className="py-2 pr-3">
                              <div className="text-slate-900 dark:text-white">{t.title}</div>
                              {t.orderCode && <div className="text-[11px] text-slate-400">Thu qua đơn {t.orderCode}</div>}
                            </td>
                            <td className="py-2 pr-3 text-right whitespace-nowrap">{money(t.partsCost)}</td>
                            <td className="py-2 pr-3 text-right whitespace-nowrap">
                              {t.revenue > 0 ? money(t.revenue) : <span className="text-slate-400">Bảo hành</span>}
                            </td>
                            <td
                              className={`py-2 text-right whitespace-nowrap font-medium ${
                                t.revenue - t.partsCost >= 0
                                  ? 'text-emerald-600 dark:text-emerald-400'
                                  : 'text-red-600 dark:text-red-400'
                              }`}
                            >
                              {money(t.revenue - t.partsCost)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          )}
        </Card>
      )}

      {/* Tab 5: Replaced Parts */}
      {activeTab === 'parts' && (
        <Card className="p-6">
          <div className="flex items-center justify-between mb-4 flex-wrap gap-2">
            <h2 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Boxes className="w-5 h-5 text-indigo-600" />
              Lịch sử Thay thế Phụ tùng & Linh kiện cho máy ({allReplacedParts.length})
            </h2>
            <Link
              href="/spare-parts"
              className="text-xs font-semibold text-indigo-600 hover:underline flex items-center gap-1"
            >
              Xem kho phụ tùng <ExternalLink className="w-3.5 h-3.5" />
            </Link>
          </div>

          {allReplacedParts.length === 0 ? (
            <div className="py-12 text-center text-slate-500 text-sm">
              Chưa có phụ tùng hoặc linh kiện nào được thay thế trong các lần bảo dưỡng/sửa chữa của máy này.
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left text-sm border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 dark:border-slate-800 text-slate-500 text-xs font-semibold bg-slate-50 dark:bg-slate-800/50">
                    <th className="py-3 px-4">Ngày thay</th>
                    <th className="py-3 px-4">Mã linh kiện</th>
                    <th className="py-3 px-4">Tên linh kiện</th>
                    <th className="py-3 px-4">Số lượng</th>
                    <th className="py-3 px-4">KTV thực hiện</th>
                    <th className="py-3 px-4">Phiếu sự cố liên quan</th>
                  </tr>
                </thead>
                <tbody>
                  {allReplacedParts.map((pu: any, idx: number) => (
                    <tr key={idx} className="border-b border-slate-100 dark:border-slate-800/60 hover:bg-slate-50 dark:hover:bg-slate-800/30">
                      <td className="py-3 px-4 text-xs text-slate-500">
                        {fmtDate(pu.ticketDate)}
                      </td>
                      <td className="py-3 px-4 font-mono font-semibold text-indigo-600">
                        {pu.item?.itemCode || '—'}
                      </td>
                      <td className="py-3 px-4 font-medium text-slate-900 dark:text-white">
                        {pu.item?.name || '—'}
                      </td>
                      <td className="py-3 px-4 font-bold text-emerald-600">
                        x{pu.quantity} {pu.item?.unit || ''}
                      </td>
                      <td className="py-3 px-4 text-slate-700 dark:text-slate-300">
                        {pu.assignedTo?.fullName || '—'}
                      </td>
                      <td className="py-3 px-4 font-mono text-xs text-slate-600 dark:text-slate-400">
                        {pu.ticketCode}: {pu.ticketTitle}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </Card>
      )}

      {/* Edit Equipment Modal */}
      {editModalOpen && (
        <EquipmentModal
          open={editModalOpen}
          onClose={() => setEditModalOpen(false)}
          equipment={equipment}
          customers={customers}
        />
      )}

      {/* Print Sticker Modal */}
      {printModalOpen && (
        <EquipmentPrintStickerModal
          company={company}
          open={printModalOpen}
          onClose={() => setPrintModalOpen(false)}
          equipment={equipment}
        />
      )}

      {/* Equipment Handover Modal */}
      {handoverModalOpen && (
        <EquipmentHandoverModal
          open={handoverModalOpen}
          onClose={() => setHandoverModalOpen(false)}
          equipment={equipment}
          companyInfo={company}
        />
      )}

      {deleteConfirmOpen && (
        <ConfirmDialog
          open={deleteConfirmOpen}
          onClose={() => setDeleteConfirmOpen(false)}
          onConfirm={confirmDelete}
          title="Xác nhận xóa thiết bị"
          message={`Bạn có chắc chắn muốn xóa thiết bị "${equipment.name}"? Hành động này không thể hoàn tác.`}
          confirmText="Xóa vĩnh viễn"
          danger
          loading={isDeleting}
        />
      )}
    </div>
  );
}
