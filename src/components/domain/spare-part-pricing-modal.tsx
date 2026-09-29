'use client';

import React, { useState } from 'react';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { Field, Input, Button, PriceInput } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import {
  SlidersHorizontal,
  DollarSign,
  Truck,
  Plus,
  Trash2,
  RotateCcw,
  Percent,
  CheckCircle2,
  Info,
  FileText,
} from 'lucide-react';
import {
  type SparePartPricingConfig,
  calculateSellingPriceFromMargin,
} from '@/server/modules/spare-parts/types';
import { saveSparePartPricingConfigAction } from '@/server/modules/spare-parts/actions';

const DEFAULT_CONFIG: SparePartPricingConfig = {
  defaultExchangeRateEur: 32500,
  defaultExchangeRateUsd: 25500,
  defaultMarginPercent: 30,
  pricingMethod: 'MARGIN',
  defaultShippingFee: 3500000,
  defaultCustomsFee: 0,
  defaultExtraShippingRate: 0,
  defaultVatRate: 8,
  volumeDiscountTiers: [
    { min: 1, max: 1, rate: 0.00 },
    { min: 2, max: 9, rate: 0.01 },
    { min: 10, max: 29, rate: 0.02 },
    { min: 30, max: 99999, rate: 0.03 },
  ],
  defaultValidDays: 15,
  defaultDeliveryTime: '15 - 25 ngày làm việc (vận chuyển hàng không quốc tế)',
  defaultPaymentTerms: 'Tạm ứng 50% khi xác nhận đơn hàng, 50% còn lại trước khi bàn giao linh kiện',
  defaultWarrantyTerms: 'Bảo hành chính hãng 06 tháng đối với linh kiện cơ điện tử; hỗ trợ kỹ thuật lắp đặt tận nơi.',
  defaultQuotationNotes: 'Linh kiện chính hãng nhập khẩu nguyên chiếc từ nhà sản xuất.',
};

interface SparePartPricingModalProps {
  open: boolean;
  initialConfig?: SparePartPricingConfig;
  onClose: () => void;
  onSuccess?: (newConfig: SparePartPricingConfig) => void;
}

export function SparePartPricingModal({
  open,
  initialConfig,
  onClose,
  onSuccess,
}: SparePartPricingModalProps) {
  const toast = useToast();
  const [loading, setLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'margin' | 'logistics' | 'tiers' | 'terms'>('margin');

  const [form, setForm] = useState<SparePartPricingConfig>(() => ({
    ...DEFAULT_CONFIG,
    ...(initialConfig || {}),
  }));

  React.useEffect(() => {
    if (initialConfig) {
      setForm((prev) => ({
        ...DEFAULT_CONFIG,
        ...prev,
        ...initialConfig,
      }));
    }
  }, [initialConfig]);

  // Simulation state for margin live preview
  const [simCost, setSimCost] = useState<number>(1000000);

  // Mô phỏng đúng công thức đang cấu hình: margin trên giá vốn, rồi cộng cước & phí khác
  const simMargined = calculateSellingPriceFromMargin(
    simCost,
    form.defaultMarginPercent,
    form.pricingMethod
  );
  const simFreight = simCost > 0 ? Number(form.defaultShippingFee) || 0 : 0;
  const simCustoms = simCost > 0 ? Number(form.defaultCustomsFee) || 0 : 0;
  const simSelling = simMargined + simFreight + simCustoms;
  // Cước & phí khác là chi phí vận hành, không tính vào lãi margin gốc
  const simProfit = simMargined - simCost;
  const simMarginActual = simMargined > 0 ? ((simProfit / simMargined) * 100).toFixed(1) : '0';

  const [resetConfirmOpen, setResetConfirmOpen] = useState(false);

  const handleResetDefaults = () => {
    setResetConfirmOpen(true);
  };

  const handleAddTier = () => {
    const lastTier = form.volumeDiscountTiers[form.volumeDiscountTiers.length - 1];
    const newMin = lastTier ? lastTier.max + 1 : 1;
    setForm({
      ...form,
      volumeDiscountTiers: [
        ...form.volumeDiscountTiers,
        { min: newMin, max: newMin + 10, rate: 0.04 },
      ],
    });
  };

  const handleRemoveTier = (idx: number) => {
    if (form.volumeDiscountTiers.length <= 1) {
      toast.error('Phải giữ lại ít nhất 1 bậc chiết khấu');
      return;
    }
    setForm({
      ...form,
      volumeDiscountTiers: form.volumeDiscountTiers.filter((_, i) => i !== idx),
    });
  };

  const handleTierChange = (idx: number, field: 'min' | 'max' | 'rate', value: number) => {
    const updated = [...form.volumeDiscountTiers];
    updated[idx] = { ...updated[idx], [field]: value };
    setForm({ ...form, volumeDiscountTiers: updated });
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      const res = await saveSparePartPricingConfigAction(form);
      if (res.ok) {
        toast.success(res.message);
        onSuccess?.(res.config || form);
        onClose();
      } else {
        toast.error(res.message);
      }
    } catch (err: any) {
      toast.error(err?.message || 'Có lỗi xảy ra khi lưu cấu hình');
    } finally {
      setLoading(false);
    }
  };

  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Cấu hình Chính sách Giá & Margin Phụ tùng"
      size="xl"
    >
      <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>
        {/* Navigation Tabs */}
        <div style={{ display: 'flex', gap: 8, borderBottom: '1px solid var(--border-base)', paddingBottom: 8 }}>
          <button
            type="button"
            onClick={() => setActiveTab('margin')}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: activeTab === 'margin' ? '#ede9fe' : 'transparent',
              color: activeTab === 'margin' ? '#7c3aed' : 'var(--text-muted)',
              fontWeight: activeTab === 'margin' ? 700 : 500,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Percent size={15} /> Tỷ suất Margin & Định giá bán
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('logistics')}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: activeTab === 'logistics' ? '#e0f2fe' : 'transparent',
              color: activeTab === 'logistics' ? '#0369a1' : 'var(--text-muted)',
              fontWeight: activeTab === 'logistics' ? 700 : 500,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <Truck size={15} /> Tỷ giá & Cước phí nhập khẩu
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('tiers')}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: activeTab === 'tiers' ? '#fef3c7' : 'transparent',
              color: activeTab === 'tiers' ? '#b45309' : 'var(--text-muted)',
              fontWeight: activeTab === 'tiers' ? 700 : 500,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <SlidersHorizontal size={15} /> Chiết khấu số lượng ({form.volumeDiscountTiers.length} bậc)
          </button>

          <button
            type="button"
            onClick={() => setActiveTab('terms')}
            style={{
              padding: '6px 14px',
              borderRadius: 'var(--radius-sm)',
              border: 'none',
              background: activeTab === 'terms' ? '#dcfce7' : 'transparent',
              color: activeTab === 'terms' ? '#15803d' : 'var(--text-muted)',
              fontWeight: activeTab === 'terms' ? 700 : 500,
              fontSize: 13,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: 6,
            }}
          >
            <FileText size={15} /> Điều khoản thương mại & Bàn giao
          </button>
        </div>

        {/* TAB 1: MARGIN & PRICING METHOD */}
        {activeTab === 'margin' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'minmax(140px, 160px) minmax(140px, 160px) 1fr', gap: 14 }}>
              <Field label="Tỷ suất Margin (%)" required>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Input
                    type="number"
                    min={0}
                    max={500}
                    step={1}
                    required
                    value={form.defaultMarginPercent}
                    onChange={(e) =>
                      setForm({ ...form, defaultMarginPercent: Number(e.target.value) || 0 })
                    }
                  />
                  <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>%</span>
                </div>
              </Field>

              <Field label="Thuế VAT mặc định (%)" required>
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    step={0.5}
                    required
                    value={form.defaultVatRate ?? 8}
                    onChange={(e) =>
                      setForm({ ...form, defaultVatRate: Number(e.target.value) || 0 })
                    }
                  />
                  <span style={{ fontWeight: 700, color: 'var(--text-muted)' }}>%</span>
                </div>
              </Field>

              <Field label="Phương pháp tính giá bán" required>
                <select
                  className="select"
                  value={form.pricingMethod}
                  onChange={(e) =>
                    setForm({ ...form, pricingMethod: e.target.value as 'MARGIN' | 'MARKUP' })
                  }
                  style={{ width: '100%', fontWeight: 600 }}
                >
                  <option value="MARGIN">Gross Margin (Giá bán = Giá vốn / (1 - Margin%))</option>
                  <option value="MARKUP">Markup (Giá bán = Giá vốn × (1 + Markup%))</option>
                </select>
              </Field>
            </div>

            {/* Khung thông tin cước phí & chi phí khác đang áp dụng */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background: '#f0f9ff',
                borderRadius: 8,
                border: '1px solid #bae6fd',
                fontSize: 12.5,
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap' }}>
                <span style={{ fontWeight: 600, color: '#0369a1', display: 'flex', alignItems: 'center', gap: 5 }}>
                  <Truck size={15} /> Cước & chi phí nhập khẩu mặc định:
                </span>
                <span>
                  Cước VC: <strong style={{ color: '#0284c7' }}>{Number(form.defaultShippingFee || 0).toLocaleString('vi-VN')} ₫/món</strong>
                </span>
                <span>
                  Phí khác: <strong style={{ color: '#7c3aed' }}>{Number(form.defaultCustomsFee || 0).toLocaleString('vi-VN')} ₫/món</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={() => setActiveTab('logistics')}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#0284c7',
                  fontWeight: 600,
                  fontSize: 12,
                  cursor: 'pointer',
                  textDecoration: 'underline',
                  display: 'flex',
                  alignItems: 'center',
                  gap: 4,
                }}
              >
                Cấu hình cước phí →
              </button>
            </div>

            {/* Live Interactive Preview Box */}
            <div
              style={{
                padding: 14,
                borderRadius: 10,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                display: 'flex',
                flexDirection: 'column',
                gap: 10,
              }}
            >
              <div style={{ fontSize: 12.5, fontWeight: 700, color: 'var(--text-strong)', display: 'flex', alignItems: 'center', gap: 6 }}>
                <Info size={15} color="#2563eb" /> Mô phỏng định giá tự động theo cấu hình (Margin + Cước + Phí khác):
              </div>

              <div style={{ display: 'grid', gridTemplateColumns: '160px 1fr', gap: 12, alignItems: 'center' }}>
                <div>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginBottom: 4 }}>Thử nhập Giá vốn (₫):</div>
                  <PriceInput
                    currency="VND"
                    value={simCost}
                    onChange={(val) => setSimCost(val || 0)}
                    placeholder="1,000,000"
                  />
                </div>

                <div
                  style={{
                    background: '#fff',
                    padding: '10px 14px',
                    borderRadius: 8,
                    border: '1px solid #cbd5e1',
                    display: 'flex',
                    justifyContent: 'space-between',
                    alignItems: 'center',
                    flexWrap: 'wrap',
                    gap: 12,
                  }}
                >
                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Giá bán lẻ (Margin):</div>
                    <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--color-primary, #2563eb)' }}>
                      {new Intl.NumberFormat('vi-VN').format(simMargined)} ₫
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>
                      Giá bán trọn gói (Margin + Cước + Phí):
                    </div>
                    <div
                      style={{ fontSize: 16, fontWeight: 800, color: '#7c3aed' }}
                      title={`Giá margin (${new Intl.NumberFormat('vi-VN').format(simMargined)} ₫) + Cước VC (${new Intl.NumberFormat('vi-VN').format(simFreight)} ₫) + Phí khác (${new Intl.NumberFormat('vi-VN').format(simCustoms)} ₫) = ${new Intl.NumberFormat('vi-VN').format(simSelling)} ₫`}
                    >
                      {new Intl.NumberFormat('vi-VN').format(simSelling)} ₫
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Lợi nhuận gộp:</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#16a34a' }}>
                      +{new Intl.NumberFormat('vi-VN').format(simProfit)} ₫
                    </div>
                  </div>

                  <div>
                    <div style={{ fontSize: 11, color: 'var(--text-muted)' }}>Tỷ suất thực tế:</div>
                    <div style={{ fontSize: 14, fontWeight: 700, color: '#0f172a' }}>
                      {simMarginActual}%
                    </div>
                  </div>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* TAB 2: LOGISTICS & EXCHANGE RATES */}
        {activeTab === 'logistics' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field label="Tỷ giá EUR mặc định (₫/EUR)" required>
                <PriceInput
                  currency="VND"
                  suffix="₫/€"
                  placeholder="32,500"
                  required
                  value={form.defaultExchangeRateEur}
                  onChange={(val) =>
                    setForm({ ...form, defaultExchangeRateEur: val || 0 })
                  }
                />
              </Field>

              <Field label="Tỷ giá USD mặc định (₫/USD)" required>
                <PriceInput
                  currency="VND"
                  suffix="₫/$"
                  placeholder="25,500"
                  required
                  value={form.defaultExchangeRateUsd}
                  onChange={(val) =>
                    setForm({ ...form, defaultExchangeRateUsd: val || 0 })
                  }
                />
              </Field>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              <Field
                label="Cước vận chuyển mặc định (₫)"
                required
                hint="Suất cước mặc định cho mỗi mặt hàng khi tạo đơn hàng Order"
              >
                <PriceInput
                  currency="VND"
                  placeholder="3,500,000"
                  showInWords
                  required
                  value={form.defaultShippingFee}
                  onChange={(val) =>
                    setForm({ ...form, defaultShippingFee: val || 0 })
                  }
                />
              </Field>

              <Field
                label="Phí khác"
                required
                hint="Chi phí khác mặc định cho mỗi mặt hàng khi tạo đơn hàng Order"
              >
                <PriceInput
                  currency="VND"
                  placeholder="1,000,000"
                  showInWords
                  required
                  value={form.defaultCustomsFee}
                  onChange={(val) =>
                    setForm({ ...form, defaultCustomsFee: val || 0 })
                  }
                />
              </Field>
            </div>

            <div
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                background: '#f8fafc',
                border: '1px solid #e2e8f0',
                fontSize: 12,
                color: 'var(--text-muted)',
                lineHeight: 1.5,
              }}
            >
              💡 <strong>Ghi chú:</strong> Khi tạo đơn hàng Order linh kiện nhập khẩu, <strong>Cước vận chuyển</strong> và <strong>Phí khác</strong> sẽ tự động được điền mặc định theo cấu hình trên cho từng dòng linh kiện. Nhân viên bán hàng vẫn có thể điều chỉnh linh hoạt trực tiếp trên từng đơn hàng.
            </div>
          </div>
        )}

        {/* TAB 3: VOLUME DISCOUNT TIERS */}
        {activeTab === 'tiers' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <span style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                Bảng bậc chiết khấu tự động tính theo tổng số lượng linh kiện trong mỗi đơn hàng Order.
              </span>
              <Button type="button" size="sm" variant="secondary" onClick={handleAddTier}>
                <Plus size={13} style={{ marginRight: 4 }} /> Thêm bậc
              </Button>
            </div>

            <div
              style={{
                border: '1px solid var(--border-base)',
                borderRadius: 8,
                overflow: 'hidden',
              }}
            >
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: 13 }}>
                <thead>
                  <tr style={{ background: 'var(--surface-sunken)', borderBottom: '1px solid var(--border-base)', color: 'var(--text-muted)', fontSize: 12 }}>
                    <th style={{ padding: '8px 12px', textAlign: 'left' }}>Bậc</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center' }}>Từ số lượng</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center' }}>Đến số lượng</th>
                    <th style={{ padding: '8px 12px', textAlign: 'center' }}>Tỷ lệ chiết khấu (%)</th>
                    <th style={{ padding: '8px 12px', width: 60, textAlign: 'center' }}>Thao tác</th>
                  </tr>
                </thead>
                <tbody>
                  {form.volumeDiscountTiers.map((tier, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid var(--border-base)' }}>
                      <td style={{ padding: '8px 12px', fontWeight: 600 }}>Bậc {idx + 1}</td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <input
                          type="number"
                          min={1}
                          className="input"
                          style={{ width: 90, textAlign: 'center', padding: '4px 8px' }}
                          value={tier.min}
                          onChange={(e) =>
                            handleTierChange(idx, 'min', Number(e.target.value) || 1)
                          }
                        />
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <input
                          type="number"
                          min={tier.min}
                          className="input"
                          style={{ width: 90, textAlign: 'center', padding: '4px 8px' }}
                          value={tier.max >= 99999 ? 9999 : tier.max}
                          onChange={(e) =>
                            handleTierChange(idx, 'max', Number(e.target.value) || tier.min)
                          }
                        />
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <div style={{ display: 'inline-flex', alignItems: 'center', gap: 4 }}>
                          <input
                            type="number"
                            min={0}
                            max={100}
                            step={0.5}
                            className="input"
                            style={{ width: 70, textAlign: 'center', padding: '4px 8px' }}
                            value={Number((tier.rate * 100).toFixed(1))}
                            onChange={(e) =>
                              handleTierChange(idx, 'rate', (Number(e.target.value) || 0) / 100)
                            }
                          />
                          <span style={{ fontWeight: 600 }}>%</span>
                        </div>
                      </td>
                      <td style={{ padding: '8px 12px', textAlign: 'center' }}>
                        <button
                          type="button"
                          onClick={() => handleRemoveTier(idx)}
                          style={{
                            border: 'none',
                            background: 'none',
                            color: 'var(--danger)',
                            cursor: 'pointer',
                            padding: 4,
                          }}
                          title="Xóa bậc này"
                        >
                          <Trash2 size={15} />
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        {/* TAB 4: COMMERCIAL & HANDOVER TERMS */}
        {activeTab === 'terms' && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div
              style={{
                padding: '10px 14px',
                borderRadius: 8,
                background: '#f0fdf4',
                border: '1px solid #bbf7d0',
                fontSize: 12.5,
                color: '#166534',
                lineHeight: 1.5,
              }}
            >
              📄 <strong>Cấu hình Điều khoản Báo giá & Bàn giao mặc định</strong>: Các nội dung này sẽ tự động được điền sẵn khi nhân viên tạo Báo giá gửi khách hàng. Nhân viên vẫn có thể tùy chỉnh lại cho từng khách hàng cụ thể nếu có thỏa thuận riêng.
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '180px 1fr', gap: 14 }}>
              <Field label="Hiệu lực báo giá (ngày)" required hint="Số ngày báo giá có hiệu lực kể từ ngày phát hành">
                <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                  <Input
                    type="number"
                    min={1}
                    max={365}
                    required
                    value={form.defaultValidDays ?? 15}
                    onChange={(e) =>
                      setForm({ ...form, defaultValidDays: Number(e.target.value) || 15 })
                    }
                  />
                  <span style={{ fontWeight: 600, color: 'var(--text-muted)' }}>ngày</span>
                </div>
              </Field>

              <Field label="Thời gian giao hàng mặc định" required hint="Thời gian dự kiến giao phụ tùng cho khách">
                <Input
                  value={form.defaultDeliveryTime ?? ''}
                  onChange={(e) =>
                    setForm({ ...form, defaultDeliveryTime: e.target.value })
                  }
                  placeholder="15 - 25 ngày làm việc (vận chuyển hàng không quốc tế)"
                />
              </Field>
            </div>

            <Field label="Điều khoản thanh toán mặc định" required hint="Quy định tiến độ thanh toán & tạm ứng">
              <textarea
                className="input"
                rows={2}
                value={form.defaultPaymentTerms ?? ''}
                onChange={(e) =>
                  setForm({ ...form, defaultPaymentTerms: e.target.value })
                }
                placeholder="Tạm ứng 50% khi xác nhận đơn hàng, 50% còn lại trước khi bàn giao linh kiện"
                style={{ resize: 'vertical', width: '100%', fontFamily: 'inherit', padding: '8px 12px' }}
              />
            </Field>

            <Field label="Điều khoản bảo hành & hỗ trợ kỹ thuật" required hint="Chính sách bảo hành phụ tùng và hỗ trợ sau bán">
              <textarea
                className="input"
                rows={2}
                value={form.defaultWarrantyTerms ?? ''}
                onChange={(e) =>
                  setForm({ ...form, defaultWarrantyTerms: e.target.value })
                }
                placeholder="Bảo hành chính hãng 06 tháng đối với linh kiện cơ điện tử; hỗ trợ kỹ thuật lắp đặt tận nơi."
                style={{ resize: 'vertical', width: '100%', fontFamily: 'inherit', padding: '8px 12px' }}
              />
            </Field>

            <Field label="Ghi chú & Cam kết chất lượng chân trang" hint="Nội dung cam kết hiển thị ở cuối báo giá">
              <textarea
                className="input"
                rows={2}
                value={form.defaultQuotationNotes ?? ''}
                onChange={(e) =>
                  setForm({ ...form, defaultQuotationNotes: e.target.value })
                }
                placeholder="Linh kiện chính hãng nhập khẩu nguyên chiếc từ nhà sản xuất."
                style={{ resize: 'vertical', width: '100%', fontFamily: 'inherit', padding: '8px 12px' }}
              />
            </Field>
          </div>
        )}

        {/* Footer Actions */}
        <div
          style={{
            display: 'flex',
            justifyContent: 'space-between',
            alignItems: 'center',
            marginTop: 10,
            paddingTop: 12,
            borderTop: '1px solid var(--border-base)',
          }}
        >
          <Button
            type="button"
            variant="ghost"
            onClick={handleResetDefaults}
            style={{ color: 'var(--text-muted)' }}
          >
            <RotateCcw size={14} style={{ marginRight: 6 }} /> Khôi phục mặc định
          </Button>

          <div style={{ display: 'flex', gap: 8 }}>
            <Button type="button" variant="ghost" onClick={onClose} disabled={loading}>
              Hủy
            </Button>
            <Button type="submit" variant="primary" disabled={loading}>
              {loading ? 'Đang lưu...' : 'Lưu cấu hình chính sách giá'}
            </Button>
          </div>
        </div>
      </form>

      {resetConfirmOpen && (
        <ConfirmDialog
          open={resetConfirmOpen}
          onClose={() => setResetConfirmOpen(false)}
          title="Khôi phục mặc định"
          message="Bạn có chắc chắn muốn khôi phục toàn bộ cấu hình về giá trị mặc định ban đầu?"
          confirmText="Khôi phục"
          danger
          onConfirm={() => {
            setForm(DEFAULT_CONFIG);
            setResetConfirmOpen(false);
            toast.info('Đã tải lại giá trị mặc định');
          }}
        />
      )}
    </Modal>
  );
}
