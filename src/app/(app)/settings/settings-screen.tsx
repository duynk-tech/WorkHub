'use client';

import { useState, useTransition, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  Save, MessageCircle, Send, Building2, CalendarDays, Clock, Plus, Trash2, Copy,
  RefreshCw, Plane, Check, Sparkles, Eye, EyeOff, BarChart3, Upload, Database, AlertTriangle, SlidersHorizontal,
} from 'lucide-react';
import {
  Button, Card, CardBody, CardHeader, CardTitle, Badge, Field, Input, Select, Switch,
  PageHeader, Alert, Divider, EmptyState, Checkbox,
} from '@/components/ui';
import { Modal, ConfirmDialog } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { fmtDate, workDaysToLabels, WORKDAY_LABELS } from '@/lib/date';
import { REPORTS, REPORT_GROUPS, DISABLED_REPORTS_KEY } from '@/server/modules/report/registry';
import { generateWebhookSecret } from '@/lib/utils';
import {
  saveSettingsAction, testZaloBotAction, flushOutboxAction,
  saveHolidayAction, deleteHolidayAction, saveWorkShiftAction, saveLeaveTypeAction,
  registerZaloWebhookAction, getZaloWebhookInfoAction, deleteZaloWebhookAction,
  resetDemoDataAction, deployPendingMigrationsAction, clearSalesAndPurchaseDocumentsAction, clearAllBusinessDataAction,
} from '@/server/modules/settings/actions';
import { SsoPanel } from './sso-panel';
import { ScrollTabs } from '@/components/ui/scroll-tabs';
import { PrintWatermark } from '@/components/domain/print-watermark';
import { SparePartPricingModal } from '@/components/domain/spare-part-pricing-modal';
import type { SparePartPricingConfig } from '@/server/modules/spare-parts/types';

/* eslint-disable @typescript-eslint/no-explicit-any */
type Tab = 'branding' | 'documents' | 'sales' | 'data' | 'pricing' | 'sso' | 'general' | 'zalo' | 'leave' | 'attendance' | 'holidays' | 'reports';

function ImageUploadInput({
  value,
  onChange,
  placeholder,
  disabled,
}: {
  value: string;
  onChange: (val: string) => void;
  placeholder?: string;
  disabled?: boolean;
}) {
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';

    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ảnh quá lớn (tối đa 5MB)');
      return;
    }

    setUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);

      const res = await fetch('/api/upload', {
        method: 'POST',
        body: formData,
      });

      const data = await res.json();
      if (!res.ok || !data.ok) {
        throw new Error(data.error || 'Tải lên không thành công');
      }

      onChange(data.url);
      toast.success('Đã tải ảnh lên máy chủ thành công');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Tải lên thất bại';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
        <input
          ref={fileInputRef}
          type="file"
          accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
          style={{ display: 'none' }}
          onChange={handleFileChange}
        />
        <div style={{ flex: 1 }}>
          <Input
            value={value}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled || uploading}
          />
        </div>
        <Button
          type="button"
          variant="secondary"
          disabled={disabled || uploading}
          onClick={() => fileInputRef.current?.click()}
          style={{ whiteSpace: 'nowrap', display: 'inline-flex', alignItems: 'center', gap: 6 }}
        >
          {uploading ? (
            <>
              <RefreshCw size={14} className="animate-spin" />
              <span>Đang tải...</span>
            </>
          ) : (
            <>
              <Upload size={14} />
              <span>Tải ảnh lên</span>
            </>
          )}
        </Button>
        {value ? (
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => onChange('')}
            title="Xóa đường dẫn ảnh"
            style={{ color: 'var(--text-muted)' }}
          >
            <Trash2 size={14} />
          </Button>
        ) : null}
      </div>
      {value ? (
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginTop: 2 }}>
          <div
            style={{
              width: 44,
              height: 44,
              borderRadius: 6,
              border: '1px solid var(--border-subtle)',
              background: 'var(--surface-sunken)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            <img
              src={value}
              alt="Preview"
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>
          <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            <span>URL ảnh: </span>
            <code style={{ fontSize: 11, background: 'var(--surface-sunken)', padding: '2px 6px', borderRadius: 4 }}>
              {value}
            </code>
          </div>
        </div>
      ) : null}
    </div>
  );
}

export function SettingsScreen({
  settings, holidays, shifts, leaveTypes, sparePartPricing, webhookUrl, permissions, googleCallbackUrl,
  initialTab = 'general',
  isVercel = false,
}: {
  initialTab?: string;
  isVercel?: boolean;
  googleCallbackUrl: string;
  settings: Record<string, any>;
  holidays: any[];
  shifts: any[];
  leaveTypes: any[];
  sparePartPricing: SparePartPricingConfig | null;
  webhookUrl: string;
  permissions: Record<string, boolean> & { isAdmin?: boolean; pricing?: boolean };
}) {
  const router = useRouter();
  const toast = useToast();
  const [pending, startTransition] = useTransition();

  const validTabs = (['general', 'branding', 'documents', 'sales', 'pricing', 'data', 'sso', 'zalo', 'leave', 'attendance', 'holidays', 'reports'] as Tab[]).filter((key) => ({ branding: permissions.general, documents: permissions.general, sales: permissions.general, pricing: permissions.pricing, data: permissions.general, sso: permissions.sso, general: permissions.general, zalo: permissions.zalo, leave: permissions.leaveType || permissions.general, attendance: permissions.shift || permissions.general, holidays: permissions.holiday, reports: permissions.general })[key]);
  const initialValidTab: Tab = validTabs.includes(initialTab as Tab) ? (initialTab as Tab) : (validTabs[0] ?? 'general');
  const [tab, setTab] = useState<Tab>(initialValidTab);

  useEffect(() => {
    const handlePopState = () => {
      if (typeof window === 'undefined') return;
      const params = new URLSearchParams(window.location.search);
      const t = params.get('tab') as Tab | null;
      setTab(t && validTabs.includes(t) ? t : (validTabs[0] ?? 'general'));
    };
    window.addEventListener('popstate', handlePopState);
    return () => window.removeEventListener('popstate', handlePopState);
  }, []);

  const handleTabChange = (newTab: Tab) => {
    setTab(newTab);
    if (typeof window !== 'undefined') {
      const url = new URL(window.location.href);
      url.searchParams.set('tab', newTab);
      window.history.pushState(null, '', url.toString());
    }
  };

  const [values, setValues] = useState<Record<string, any>>(settings);
  const [pricingConfig, setPricingConfig] = useState<SparePartPricingConfig | null>(sparePartPricing);
  useEffect(() => setPricingConfig(sparePartPricing), [sparePartPricing]);
  const valuesRef = useRef(values);
  const [dirtyKeys, setDirtyKeys] = useState<Set<string>>(() => new Set());
  useEffect(() => {
    if (!dirtyKeys.size) return;
    const warn = (event: BeforeUnloadEvent) => { event.preventDefault(); event.returnValue = ''; };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirtyKeys]);
  const [showSecret, setShowSecret] = useState(false);
  const [copiedSecret, setCopiedSecret] = useState(false);

  const [holidayModal, setHolidayModal] = useState<{ open: boolean; id: number | null }>({ open: false, id: null });
  const [holidayForm, setHolidayForm] = useState({ date: '', name: '', isPaid: true });
  const [confirmDeleteHoliday, setConfirmDeleteHoliday] = useState<any | null>(null);

  const [shiftModal, setShiftModal] = useState<any | null>(null);
  const [leaveTypeModal, setLeaveTypeModal] = useState<any | null>(null);
  const [confirmResetModal, setConfirmResetModal] = useState<{ open: boolean; clean: boolean } | null>(null);
  const [confirmClearSalesOpen, setConfirmClearSalesOpen] = useState(false);
  const [confirmClearAllDataOpen, setConfirmClearAllDataOpen] = useState(false);
  const [pricingModalOpen, setPricingModalOpen] = useState(false);
  const [resettingData, setResettingData] = useState(false);
  const [confirmMigrationOpen, setConfirmMigrationOpen] = useState(false);
  const [migratingSchema, setMigratingSchema] = useState(false);
  const [clearingAllData, setClearingAllData] = useState(false);

  const [webhookInputUrl, setWebhookInputUrl] = useState(webhookUrl);
  const [webhookInfo, setWebhookInfo] = useState<any | null>(null);
  const [webhookLoading, setWebhookLoading] = useState(false);

  const handleDeployMigrations = () => {
    setMigratingSchema(true);
    startTransition(async () => {
      try {
        const res = await deployPendingMigrationsAction();
        if (res.ok) {
          toast.success(res.message);
          setConfirmMigrationOpen(false);
          router.refresh();
        } else {
          toast.error(res.message);
        }
      } catch (error) {
        toast.error(error instanceof Error ? error.message : 'Không thể triển khai migration');
      } finally {
        setMigratingSchema(false);
      }
    });
  };

  const handleRegisterWebhook = () => {
    if (!webhookInputUrl.trim()) return;
    setWebhookLoading(true);
    startTransition(async () => {
      const res = await registerZaloWebhookAction(webhookInputUrl.trim(), values['zalo.webhookSecret']);
      setWebhookLoading(false);
      if (res.ok) {
        toast.success(res.message);
        handleCheckWebhook();
      } else {
        toast.error(res.message);
      }
    });
  };

  const handleCheckWebhook = () => {
    setWebhookLoading(true);
    startTransition(async () => {
      const res = await getZaloWebhookInfoAction();
      setWebhookLoading(false);
      if (res.ok) {
        setWebhookInfo(res.info ?? null);
        toast.success('Đã lấy thông tin Webhook từ Zalo');
      } else {
        toast.error(res.message);
      }
    });
  };

  const set = (key: string, value: any) => {
    valuesRef.current = { ...valuesRef.current, [key]: value };
    setValues(valuesRef.current);
    setDirtyKeys((keys) => new Set([...keys, key]));
  };

  const save = (group: string, keys: string[]) => {
    startTransition(async () => {
      const payload = Object.fromEntries(keys.map((k) => [k, values[k]]));
      try {
        const res = await saveSettingsAction(group, payload);
        if (!res.ok) { toast.error(res.message); return; }
        setDirtyKeys((dirty) => new Set([...dirty].filter((key) => !keys.includes(key) || valuesRef.current[key] !== payload[key])));
        toast.success(res.message);
        router.refresh();
      } catch { toast.error('Không thể lưu cấu hình. Vui lòng thử lại.'); }
    });
  };

  const TABS: { key: Tab; label: string; icon: any; visible: boolean }[] = [
    { key: 'general', label: 'Công ty', icon: Building2, visible: permissions.general },
    { key: 'branding', label: 'Giao diện', icon: Sparkles, visible: permissions.general },
    { key: 'documents', label: 'Chứng từ', icon: Copy, visible: permissions.general },
    { key: 'sales', label: 'Bán hàng', icon: Building2, visible: permissions.general },
    { key: 'pricing', label: 'Giá & Margin', icon: SlidersHorizontal, visible: Boolean(permissions.pricing) },
    { key: 'sso', label: 'SSO', icon: Check, visible: permissions.sso },
    { key: 'data', label: 'Dữ liệu', icon: Database, visible: permissions.general },
    { key: 'zalo', label: 'Zalo Bot', icon: MessageCircle, visible: permissions.zalo },
    { key: 'leave', label: 'Nghỉ phép', icon: Plane, visible: permissions.leaveType || permissions.general },
    { key: 'attendance', label: 'Ca làm việc', icon: Clock, visible: permissions.shift || permissions.general },
    { key: 'holidays', label: 'Ngày lễ', icon: CalendarDays, visible: permissions.holiday },
    { key: 'reports', label: 'Báo cáo', icon: BarChart3, visible: permissions.general },
  ];

  return (
    <div className="stack">
      <PageHeader title="Cấu hình hệ thống" description="Thông tin công ty, kênh thông báo, chính sách nghỉ phép và chấm công" />

      {dirtyKeys.size > 0 && <p role="status" className="hint">Có thay đổi chưa lưu. Dữ liệu nhập được giữ khi chuyển tab.</p>}
      <ScrollTabs>
        {TABS.filter((t) => t.visible).map((t) => (
          <button type="button" key={t.key} className="tab" data-active={tab === t.key} aria-pressed={tab === t.key} onClick={() => handleTabChange(t.key)}>
            <t.icon size={13} style={{ display: 'inline', verticalAlign: -2, marginRight: 6 }} />
            {t.label}
          </button>
        ))}
      </ScrollTabs>

      {tab === 'sso' && permissions.sso && <SsoPanel values={values} set={set} save={save} pending={pending} callbackUrl={googleCallbackUrl} />}

      {['general', 'branding', 'documents', 'sales', 'data'].includes(tab) && permissions.general && (
        <div className="stack" style={{ gap: 16 }}>
          {/* Card Thương hiệu & Giao diện */}
          {tab === 'branding' && (<Card>
            <CardHeader>
              <div>
                <CardTitle>Thương hiệu & Giao diện</CardTitle>
                <div className="card-subtitle">
                  Tùy chỉnh tên ứng dụng, logo hiển thị trên sidebar, trang đăng nhập và các thông báo
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                loading={pending}
                onClick={() => save('general', ['app.name', 'app.logoText', 'app.logoUrl', 'app.description'])}
              >
                <Save /> Lưu thương hiệu
              </Button>
            </CardHeader>
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <Field label="Tên ứng dụng" hint="Hiển thị trên thanh menu Sidebar, trang Đăng nhập và các báo cáo" required>
                  <Input
                    value={values['app.name'] ?? ''}
                    placeholder="WorkHub"
                    onChange={(e) => set('app.name', e.target.value)}
                  />
                </Field>

                <Field label="Chữ viết tắt" hint="Chữ cái hiển thị trên logo khi thu gọn menu hoặc chưa có ảnh logo (ví dụ: W, S, WH)">
                  <Input
                    value={values['app.logoText'] ?? ''}
                    placeholder="W"
                    maxLength={4}
                    onChange={(e) => set('app.logoText', e.target.value)}
                  />
                </Field>

                <Field
                  label="Logo"
                  hint="Tải ảnh trực tiếp lên máy chủ hoặc nhập URL (VD: /uploads/... hoặc https://...). Tệp tải lên được lưu trong Docker volume persistent để không mất khi deploy lại."
                  className="span-2"
                >
                  <ImageUploadInput
                    value={values['app.logoUrl'] ?? ''}
                    placeholder="https://example.com/logo.png hoặc bấm nút tải ảnh từ máy tính"
                    onChange={(val) => set('app.logoUrl', val)}
                    disabled={!permissions.general}
                  />
                </Field>

                <Field
                  label="Mô tả ngắn"
                  hint="Hiển thị dưới tên hệ thống hoặc trong mô tả AI"
                  className="span-2"
                >
                  <Input
                    value={values['app.description'] ?? ''}
                    placeholder="Hệ thống quản trị kinh doanh, thiết bị, kho vận và công việc"
                    onChange={(e) => set('app.description', e.target.value)}
                  />
                </Field>

                {/* Xem trước trực tiếp (Live Preview) */}
                <div
                  className="span-2"
                  style={{
                    padding: 16,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--surface-sunken)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>
                    XEM TRƯỚC GIAO DIỆN (LIVE PREVIEW)
                  </div>
                  <div className="row" style={{ gap: 24, flexWrap: 'wrap', alignItems: 'center' }}>
                      {(() => {
                        const hasLogoImg = Boolean(values['app.logoUrl']?.trim());
                        return (
                          <>
                            {/* Preview Sidebar Expanded */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <div className="hint" style={{ fontSize: 11.5 }}>Sidebar mở rộng:</div>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 9,
                                  padding: '8px 14px',
                                  background: 'var(--surface-card)',
                                  borderRadius: 'var(--radius-md)',
                                  border: '1px solid var(--border-subtle)',
                                }}
                              >
                                <div
                                  className={`login-logo ${hasLogoImg ? 'has-image' : ''}`}
                                  style={{
                                    width: 32,
                                    height: 32,
                                    borderRadius: 8,
                                    fontSize: 14,
                                    overflow: 'hidden',
                                    ...(hasLogoImg ? { background: 'transparent', boxShadow: 'none' } : {}),
                                  }}
                                >
                                  {hasLogoImg ? (
                                    <img
                                      src={values['app.logoUrl'].trim()}
                                      alt="Logo preview"
                                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                      onError={(e) => {
                                        (e.target as HTMLElement).style.display = 'none';
                                      }}
                                    />
                                  ) : (
                                    values['app.logoText']?.trim() || values['app.name']?.trim()?.slice(0, 1).toUpperCase() || 'W'
                                  )}
                                </div>
                                <span style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)', letterSpacing: '-0.02em' }}>
                                  {values['app.name']?.trim() || 'WorkHub'}
                                </span>
                              </div>
                            </div>

                            {/* Preview Sidebar Collapsed */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <div className="hint" style={{ fontSize: 11.5 }}>Sidebar thu gọn:</div>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  justifyContent: 'center',
                                  width: 48,
                                  height: 48,
                                  background: 'var(--surface-card)',
                                  borderRadius: 'var(--radius-md)',
                                  border: '1px solid var(--border-subtle)',
                                }}
                              >
                                <div
                                  className={`login-logo ${hasLogoImg ? 'has-image' : ''}`}
                                  style={{
                                    width: 36,
                                    height: 36,
                                    borderRadius: 9,
                                    fontSize: 16,
                                    overflow: 'hidden',
                                    ...(hasLogoImg ? { background: 'transparent', boxShadow: 'none' } : {}),
                                  }}
                                >
                                  {hasLogoImg ? (
                                    <img
                                      src={values['app.logoUrl'].trim()}
                                      alt="Logo preview"
                                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                    />
                                  ) : (
                                    values['app.logoText']?.trim() || values['app.name']?.trim()?.slice(0, 1).toUpperCase() || 'W'
                                  )}
                                </div>
                              </div>
                            </div>

                            {/* Preview Login badge */}
                            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                              <div className="hint" style={{ fontSize: 11.5 }}>Trang đăng nhập:</div>
                              <div
                                style={{
                                  display: 'flex',
                                  alignItems: 'center',
                                  gap: 10,
                                  padding: '10px 16px',
                                  background: 'var(--surface-card)',
                                  borderRadius: 'var(--radius-md)',
                                  border: '1px solid var(--border-subtle)',
                                }}
                              >
                                <div
                                  className={`login-logo ${hasLogoImg ? 'has-image' : ''}`}
                                  style={{
                                    width: 40,
                                    height: 40,
                                    borderRadius: 10,
                                    fontSize: 18,
                                    overflow: 'hidden',
                                    ...(hasLogoImg ? { background: 'transparent', boxShadow: 'none' } : {}),
                                  }}
                                >
                                  {hasLogoImg ? (
                                    <img
                                      src={values['app.logoUrl'].trim()}
                                      alt="Logo preview"
                                      style={{ width: '100%', height: '100%', objectFit: 'contain' }}
                                    />
                                  ) : (
                                    values['app.logoText']?.trim() || values['app.name']?.trim()?.slice(0, 1).toUpperCase() || 'W'
                                  )}
                                </div>
                                <div>
                                  <div style={{ fontSize: 15, fontWeight: 700, color: 'var(--text-strong)' }}>
                                    {values['app.name']?.trim() || 'WorkHub'}
                                  </div>
                                  <div className="hint" style={{ fontSize: 12 }}>
                                    {values['app.description']?.trim() || 'Đăng nhập vào hệ thống'}
                                  </div>
                                </div>
                              </div>
                            </div>
                          </>
                        );
                      })()}
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>)}

          {/* Card Thông tin công ty */}
          {tab === 'general' && (<Card>
            <CardHeader>
              <CardTitle>Thông tin công ty</CardTitle>
              <Button variant="primary" size="sm" loading={pending}
                onClick={() => save('general', ['company.name', 'company.shortName', 'company.address', 'company.taxCode', 'company.phone'])}>
                <Save /> Lưu
              </Button>
            </CardHeader>
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Tên công ty" className="span-2">
                  <Input value={values['company.name'] ?? ''} onChange={(e) => set('company.name', e.target.value)} />
                </Field>
                <Field label="Tên viết tắt">
                  <Input value={values['company.shortName'] ?? ''} onChange={(e) => set('company.shortName', e.target.value)} />
                </Field>
                <Field label="Mã số thuế">
                  <Input value={values['company.taxCode'] ?? ''} onChange={(e) => set('company.taxCode', e.target.value)} />
                </Field>
                <Field
                  label="Hotline hỗ trợ"
                  hint="In trên tem QR dán máy tại khách và các biên bản — để trống thì tem sẽ ẩn dòng hotline"
                >
                  <Input
                    value={values['company.phone'] ?? ''}
                    onChange={(e) => set('company.phone', e.target.value)}
                    placeholder="VD: 1900 1234 hoặc 0909 123 456"
                  />
                </Field>
                <Field label="Địa chỉ" className="span-2">
                  <Input value={values['company.address'] ?? ''} onChange={(e) => set('company.address', e.target.value)} />
                </Field>
              </div>
            </CardBody>
          </Card>)}

          {/* Card Chứng từ */}
          {tab === 'documents' && (<Card>
            <CardHeader>
              <div>
                <CardTitle>Chứng từ</CardTitle>
                <div className="card-subtitle">
                  Tự động chèn logo chìm (watermark) dưới nền của tất cả các phiếu in, bảng báo giá và biên bản A4
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                loading={pending}
                onClick={() =>
                  save('general', [
                    'print.watermarkEnabled',
                    'print.watermarkUrl',
                    'print.watermarkOpacity',
                  ])
                }
              >
                <Save /> Lưu cấu hình in
              </Button>
            </CardHeader>
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 16 }}>
                <div className="span-2" style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '10px 14px', background: 'var(--surface-sunken)', borderRadius: 'var(--radius-md)', border: '1px solid var(--border-subtle)' }}>
                  <Switch
                    checked={values['print.watermarkEnabled'] !== false && values['print.watermarkEnabled'] !== 'false'}
                    onChange={(e) => set('print.watermarkEnabled', e.target.checked)}
                  />
                  <div>
                    <div style={{ fontWeight: 600, fontSize: 13.5, color: 'var(--text-strong)' }}>
                      Kích hoạt Watermark nền chìm cho tất cả phiếu in
                    </div>
                    <div className="hint" style={{ fontSize: 12 }}>
                      Áp dụng cho Báo giá linh kiện, Báo giá máy, Biên bản bàn giao thiết bị / tài sản, Phiếu kho, Phiếu thu / chi...
                    </div>
                  </div>
                </div>

                <Field
                  label="Logo watermark"
                  hint="Tải ảnh lên máy chủ hoặc nhập URL. Để trống hệ thống sẽ tự động lấy theo Logo thương hiệu (app.logoUrl) hoặc con dấu pháp nhân."
                  className="span-2"
                >
                  <ImageUploadInput
                    value={values['print.watermarkUrl'] ?? ''}
                    placeholder="VD: /uploads/watermark.png (hoặc để trống)"
                    onChange={(val) => set('print.watermarkUrl', val)}
                    disabled={!permissions.general}
                  />
                </Field>

                <Field
                  label="Độ mờ Watermark (%)"
                  hint="Khuyến nghị từ 5% đến 12% để hình nền chìm tinh tế, sắc nét khi in mà không che khuất chữ và số liệu"
                >
                  <Input
                    type="number"
                    min="1"
                    max="40"
                    step="1"
                    value={
                      values['print.watermarkOpacity'] !== undefined && values['print.watermarkOpacity'] !== null && values['print.watermarkOpacity'] !== ''
                        ? (Number(values['print.watermarkOpacity']) <= 1
                            ? Math.round(Number(values['print.watermarkOpacity']) * 100)
                            : Math.round(Number(values['print.watermarkOpacity'])))
                        : 8
                    }
                    onChange={(e) => {
                      const val = Math.max(1, Math.min(40, Number(e.target.value) || 8));
                      set('print.watermarkOpacity', (val / 100).toFixed(2));
                    }}
                  />
                </Field>

                <Field
                  label="Tên trên con dấu"
                  hint="Dùng làm nội dung con dấu vector khi chưa cấu hình ảnh logo riêng"
                >
                  <Input
                    value={values['company.name'] ?? 'Công ty Sunny'}
                    disabled
                    style={{ background: 'var(--surface-sunken)', opacity: 0.8 }}
                  />
                </Field>

                {/* Live Preview Watermark trên trang giấy thu nhỏ */}
                <div
                  className="span-2"
                  style={{
                    padding: 16,
                    borderRadius: 'var(--radius-md)',
                    background: 'var(--surface-sunken)',
                    border: '1px solid var(--border-subtle)',
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 600, color: 'var(--text-muted)', marginBottom: 12 }}>
                    XEM TRƯỚC WATERMARK TRÊN PHIẾU IN A4 (LIVE PREVIEW)
                  </div>

                  <div style={{ display: 'flex', justifyContent: 'center' }}>
                    <div
                      style={{
                        position: 'relative',
                        width: '100%',
                        maxWidth: 480,
                        background: '#ffffff',
                        color: '#111827',
                        padding: '24px 28px',
                        borderRadius: 6,
                        boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                        border: '1px solid #e2e8f0',
                        fontFamily: '"Times New Roman", Times, serif',
                        fontSize: '11px',
                        lineHeight: 1.35,
                        overflow: 'hidden',
                      }}
                    >
                      {/* Watermark Component */}
                      <PrintWatermark
                        logoUrl={values['print.watermarkUrl']?.trim() || values['app.logoUrl']?.trim() || null}
                        opacity={
                          values['print.watermarkOpacity'] !== undefined
                            ? (Number(values['print.watermarkOpacity']) <= 1
                                ? Number(values['print.watermarkOpacity'])
                                : Number(values['print.watermarkOpacity']) / 100)
                            : 0.08
                        }
                        enabled={values['print.watermarkEnabled'] !== false && values['print.watermarkEnabled'] !== 'false'}
                        companyName={values['company.name'] || 'CÔNG TY SUNNY'}
                        size={240}
                      />

                      {/* Content đè lên trên watermark */}
                      <div style={{ position: 'relative', zIndex: 1 }}>
                        <div style={{ display: 'flex', justifyContent: 'space-between', borderBottom: '1px solid #334155', paddingBottom: 4, marginBottom: 8 }}>
                          <div style={{ fontWeight: 800, textTransform: 'uppercase', fontSize: '11.5px' }}>
                            {values['company.name'] || 'CÔNG TY SUNNY'}
                          </div>
                          <div style={{ fontStyle: 'italic', fontSize: '10px' }}>Mẫu bản in A4 tiêu chuẩn</div>
                        </div>

                        <div style={{ textAlign: 'center', margin: '8px 0', fontWeight: 800, textTransform: 'uppercase', fontSize: '13px' }}>
                          BẢNG BÁO GIÁ / BIÊN BẢN NGHIỆM THU
                        </div>

                        <div style={{ background: 'rgba(241, 245, 249, 0.6)', padding: '4px 8px', borderRadius: 4, marginBottom: 8, fontSize: '10px' }}>
                          <div>Kính gửi: <strong>Quý Khách Hàng / Đối Tác F&B</strong></div>
                          <div>Địa chỉ: <strong>Tại kho / Điểm bán của khách hàng</strong></div>
                        </div>

                        <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '10px', marginBottom: 8 }}>
                          <thead>
                            <tr style={{ background: '#cbd5e1' }}>
                              <th style={{ border: '1px solid #cbd5e1', padding: '3px 4px', textAlign: 'center', fontWeight: 700, color: '#0f172a' }}>STT</th>
                              <th style={{ border: '1px solid #cbd5e1', padding: '3px 4px', fontWeight: 700, color: '#0f172a' }}>Hạng mục / Linh kiện</th>
                              <th style={{ border: '1px solid #cbd5e1', padding: '3px 4px', textAlign: 'center', fontWeight: 700, color: '#0f172a' }}>SL</th>
                              <th style={{ border: '1px solid #cbd5e1', padding: '3px 4px', textAlign: 'right', fontWeight: 700, color: '#0f172a' }}>Thành tiền</th>
                            </tr>
                          </thead>
                          <tbody>
                            <tr>
                              <td style={{ border: '1px solid #cbd5e1', padding: '3px 4px', textAlign: 'center' }}>01</td>
                              <td style={{ border: '1px solid #cbd5e1', padding: '3px 4px' }}>Bơm áp lực nước / Motor Pump 230V</td>
                              <td style={{ border: '1px solid #cbd5e1', padding: '3px 4px', textAlign: 'center' }}>02</td>
                              <td style={{ border: '1px solid #cbd5e1', padding: '3px 4px', textAlign: 'right' }}>6.850.000</td>
                            </tr>
                            <tr>
                              <td style={{ border: '1px solid #cbd5e1', padding: '3px 4px', textAlign: 'center' }}>02</td>
                              <td style={{ border: '1px solid #cbd5e1', padding: '3px 4px' }}>Van điện từ Solenoid Valve 3 Way</td>
                              <td style={{ border: '1px solid #cbd5e1', padding: '3px 4px', textAlign: 'center' }}>01</td>
                              <td style={{ border: '1px solid #cbd5e1', padding: '3px 4px', textAlign: 'right' }}>2.140.000</td>
                            </tr>
                            <tr style={{ fontWeight: 700 }}>
                              <td colSpan={3} style={{ border: '1px solid #cbd5e1', padding: '3px 4px', textAlign: 'right' }}>TỔNG CỘNG:</td>
                              <td style={{ border: '1px solid #cbd5e1', padding: '3px 4px', textAlign: 'right', color: '#7c3aed' }}>8.990.000</td>
                            </tr>
                          </tbody>
                        </table>

                        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', textAlign: 'center', marginTop: 12, paddingTop: 4 }}>
                          <div>
                            <div style={{ fontWeight: 700 }}>ĐẠI DIỆN KHÁCH HÀNG</div>
                            <div style={{ fontStyle: 'italic', fontSize: '9px', color: '#64748b' }}>(Ký, đóng dấu)</div>
                          </div>
                          <div>
                            <div style={{ fontWeight: 700 }}>ĐẠI DIỆN CÔNG TY</div>
                            <div style={{ fontStyle: 'italic', fontSize: '9px', color: '#64748b' }}>(Ký & ghi rõ họ tên)</div>
                          </div>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>)}

          {/* Card Bán hàng và xuất kho */}
          {tab === 'sales' && (<Card>
            <CardHeader>
              <div>
                <CardTitle>Bán hàng và xuất kho</CardTitle>
                <div className="card-subtitle">
                  Lựa chọn cơ chế trừ tồn kho khi chốt đơn bán hàng phù hợp với quy mô và cơ cấu tổ chức của doanh nghiệp
                </div>
              </div>
              <Button
                variant="primary"
                size="sm"
                loading={pending}
                onClick={() => save('general', ['inventory.salesFulfillmentMode'])}
              >
                <Save /> Lưu quy trình
              </Button>
            </CardHeader>
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(320px, 1fr))', gap: 16 }}>
                {/* Lựa chọn 1: Thủ kho duyệt */}
                <div
                  onClick={() => set('inventory.salesFulfillmentMode', 'MANUAL_WAREHOUSE_APPROVAL')}
                  style={{
                    padding: 16,
                    borderRadius: 'var(--radius-md)',
                    border: `2px solid ${(values['inventory.salesFulfillmentMode'] ?? 'MANUAL_WAREHOUSE_APPROVAL') === 'MANUAL_WAREHOUSE_APPROVAL' ? 'var(--primary)' : 'var(--border)'}`,
                    background: (values['inventory.salesFulfillmentMode'] ?? 'MANUAL_WAREHOUSE_APPROVAL') === 'MANUAL_WAREHOUSE_APPROVAL' ? 'var(--surface-subtle)' : 'var(--surface-card)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="radio"
                        name="fulfillmentMode"
                        checked={(values['inventory.salesFulfillmentMode'] ?? 'MANUAL_WAREHOUSE_APPROVAL') === 'MANUAL_WAREHOUSE_APPROVAL'}
                        onChange={() => set('inventory.salesFulfillmentMode', 'MANUAL_WAREHOUSE_APPROVAL')}
                      />
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-strong)' }}>
                        Thủ kho duyệt xuất kho (Mô hình 2 bước)
                      </span>
                    </div>
                    <Badge tone="info">Khuyên dùng</Badge>
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
                    Kinh doanh tạo đơn và chốt giá -&gt; Hàng vào trạng thái <strong>Tạm giữ</strong>. Thủ kho kiểm đếm, quét số seri thực tế và bấm <strong>Xuất kho giao hàng</strong> thì mới trừ kho vật lý.
                  </p>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', background: 'var(--surface-sunken)', padding: '6px 10px', borderRadius: 4 }}>
                    ✓ Phù hợp công ty có kho hàng riêng, kiểm soát chặt chẽ, chống thất thoát.
                  </div>
                </div>

                {/* Lựa chọn 2: Tự động trừ kho */}
                <div
                  onClick={() => set('inventory.salesFulfillmentMode', 'AUTO_DEDUCT')}
                  style={{
                    padding: 16,
                    borderRadius: 'var(--radius-md)',
                    border: `2px solid ${values['inventory.salesFulfillmentMode'] === 'AUTO_DEDUCT' ? 'var(--primary)' : 'var(--border)'}`,
                    background: values['inventory.salesFulfillmentMode'] === 'AUTO_DEDUCT' ? 'var(--surface-subtle)' : 'var(--surface-card)',
                    cursor: 'pointer',
                    transition: 'all 0.2s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 }}>
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                      <input
                        type="radio"
                        name="fulfillmentMode"
                        checked={values['inventory.salesFulfillmentMode'] === 'AUTO_DEDUCT'}
                        onChange={() => set('inventory.salesFulfillmentMode', 'AUTO_DEDUCT')}
                      />
                      <span style={{ fontWeight: 700, fontSize: 14, color: 'var(--text-strong)' }}>
                        Tự động trừ kho khi chốt đơn (Mô hình tinh gọn)
                      </span>
                    </div>
                    <Badge tone="neutral">Tinh gọn</Badge>
                  </div>
                  <p style={{ fontSize: 12.5, color: 'var(--text-muted)', margin: '0 0 10px', lineHeight: 1.5 }}>
                    Khi đơn bán hàng chuyển sang trạng thái <strong>Hoàn tất / Đã giao</strong>, hệ thống tự động trừ kho linh kiện ngay lập tức trong 1 click chuột mà không cần qua thủ kho duyệt.
                  </p>
                  <div style={{ fontSize: 11.5, color: 'var(--text-muted)', background: 'var(--surface-sunken)', padding: '6px 10px', borderRadius: 4 }}>
                    ✓ Phù hợp cửa hàng nhỏ, nhân viên kiêm nhiệm bán hàng kiêm xuất hàng, thao tác nhanh.
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>)}

          {/* Card Quản trị Dữ liệu mẫu (Demo Data Seed & Clean) */}
          {tab === 'data' && (<Card>
            <CardHeader>
              <div>
                <CardTitle style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <Database size={18} style={{ color: 'var(--brand)' }} />
                  Dữ liệu mẫu
                </CardTitle>
                <div className="card-subtitle">
                  Khởi tạo hoặc làm mới dữ liệu mẫu để trải nghiệm hệ thống.
                </div>
              </div>
            </CardHeader>
            <CardBody>
              <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>
                <div
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    flexWrap: 'wrap',
                    gap: 12,
                    paddingTop: 4,
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: 8, color: 'var(--text-muted)', fontSize: 12.5 }}>
                    <AlertTriangle size={15} style={{ color: 'var(--warning, #f59e0b)' }} />
                    <span>
                      Tùy chọn <b>Làm sạch & Nạp lại</b> sẽ xóa toàn bộ dữ liệu phát sinh cũ và khởi tạo bộ demo mới tinh (tài khoản admin và cài đặt vẫn được giữ nguyên).
                    </span>
                  </div>

                  <div style={{ display: 'flex', gap: 10 }}>
                    {permissions.isAdmin && (
                      <>
                        {!isVercel && (
                          <Button
                            type="button"
                            variant="secondary"
                            disabled={resettingData || migratingSchema || clearingAllData || pending}
                            onClick={() => setConfirmMigrationOpen(true)}
                          >
                            <Database size={14} /> Triển khai migration
                          </Button>
                        )}
                        <Button
                          type="button"
                          variant="danger"
                          disabled={resettingData || migratingSchema || clearingAllData || pending}
                          onClick={() => setConfirmClearAllDataOpen(true)}
                        >
                          <Trash2 size={14} /> Xóa toàn bộ dữ liệu
                        </Button>
                      </>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      disabled={resettingData || migratingSchema || pending}
                      onClick={() => setConfirmResetModal({ open: true, clean: false })}
                    >
                      <RefreshCw size={14} /> Nạp bổ sung (Giữ dữ liệu cũ)
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      disabled={resettingData || migratingSchema || pending}
                      onClick={() => setConfirmResetModal({ open: true, clean: true })}
                    >
                      <Trash2 size={14} /> Làm sạch & Nạp seed mới
                    </Button>
                    <Button
                      type="button"
                      variant="danger"
                      disabled={resettingData || migratingSchema || pending}
                      onClick={() => setConfirmClearSalesOpen(true)}
                    >
                      <Trash2 size={14} /> Xóa bán hàng, báo giá & PO
                    </Button>
                  </div>
                </div>
              </div>
            </CardBody>
          </Card>)}
        </div>
      )}

      {tab === 'pricing' && permissions.pricing && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Chính sách giá & margin phụ tùng</CardTitle>
              <div className="card-subtitle">
                Cấu hình tỷ giá, margin, cước phí, VAT và chiết khấu theo số lượng dùng chung cho báo giá và nhập hàng.
              </div>
            </div>
            <Button type="button" variant="primary" onClick={() => setPricingModalOpen(true)}>
              <SlidersHorizontal size={14} /> Mở cấu hình
            </Button>
          </CardHeader>
          <CardBody>
            <div className="hint">
              {pricingConfig
                ? `Margin hiện tại ${pricingConfig.defaultMarginPercent}% · Cước mặc định ${new Intl.NumberFormat('vi-VN').format(pricingConfig.defaultShippingFee)} ₫ · ${pricingConfig.volumeDiscountTiers.length} bậc chiết khấu số lượng`
                : 'Đang tải cấu hình chính sách giá.'}
            </div>
          </CardBody>
        </Card>
      )}

      {tab === 'zalo' && validTabs.includes('zalo') && (
        <div className="stack">
          <Card>
            <CardHeader>
              <div>
                <CardTitle>Kết nối Zalo Bot</CardTitle>
                <div className="card-subtitle">Bot token lưu mã hóa trong CSDL, không hiển thị lại sau khi lưu</div>
              </div>
              <div className="toolbar">
                <Button size="sm" variant="secondary" loading={pending} onClick={() => startTransition(async () => {
                  const res = await testZaloBotAction();
                  res.ok ? toast.success(res.message) : toast.error(res.message);
                })}>
                  <Send /> Gửi tin thử
                </Button>
                <Button size="sm" variant="primary" loading={pending}
                  onClick={() => save('zalo', ['zalo.enabled', 'zalo.botToken', 'zalo.webhookSecret', 'zalo.quietHoursStart', 'zalo.quietHoursEnd', 'ai.geminiApiKey'])}>
                  <Save /> Lưu
                </Button>
              </div>
            </CardHeader>
            <CardBody className="stack" style={{ gap: 16 }}>
              <label className="row" style={{ gap: 10 }}>
                <Switch checked={Boolean(values['zalo.enabled'])} onChange={(e) => set('zalo.enabled', e.target.checked)} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 560 }}>Bật gửi thông báo qua Zalo Bot</div>
                  <div className="hint">Khi tắt, thông báo vẫn hiển thị trong hệ thống nhưng không gửi ra Zalo</div>
                </div>
              </label>

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Bot token" hint="Lấy từ trang quản trị Zalo Bot (dạng bot_id:secret_key)">
                  <Input type="password" value={values['zalo.botToken'] ?? ''} onChange={(e) => set('zalo.botToken', e.target.value)} placeholder="Nhập token mới để thay đổi" />
                </Field>
                <Field label="Webhook secret" hint="Dùng để xác thực request từ Zalo (hỗ trợ tự động tạo ngẫu nhiên)">
                  <div style={{ display: 'flex', gap: 6, alignItems: 'center' }}>
                    <div style={{ flex: 1 }}>
                      <Input
                        type={showSecret ? 'text' : 'password'}
                        value={values['zalo.webhookSecret'] ?? ''}
                        onChange={(e) => set('zalo.webhookSecret', e.target.value)}
                        placeholder="whsec_... hoặc nhập secret tùy chọn"
                        style={{ fontFamily: showSecret ? 'var(--font-mono)' : undefined, fontSize: 13 }}
                      />
                    </div>
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      iconOnly
                      onClick={() => setShowSecret(!showSecret)}
                      title={showSecret ? 'Ẩn secret' : 'Hiện secret'}
                    >
                      {showSecret ? <EyeOff size={14} /> : <Eye size={14} />}
                    </Button>
                    {Boolean(values['zalo.webhookSecret']) && (
                      <Button
                        type="button"
                        variant="secondary"
                        size="sm"
                        iconOnly
                        onClick={() => {
                          navigator.clipboard.writeText(values['zalo.webhookSecret']);
                          setCopiedSecret(true);
                          toast.success('Đã sao chép Webhook Secret!');
                          setTimeout(() => setCopiedSecret(false), 2000);
                        }}
                        title="Sao chép Webhook Secret"
                      >
                        {copiedSecret ? <Check size={14} color="var(--success)" /> : <Copy size={14} />}
                      </Button>
                    )}
                    <Button
                      type="button"
                      variant="secondary"
                      size="sm"
                      onClick={() => {
                        const newSecret = generateWebhookSecret();
                        set('zalo.webhookSecret', newSecret);
                        setShowSecret(true);
                        toast.success('Đã tự động tạo Webhook Secret mới!');
                      }}
                      title="Tự động tạo Webhook Secret ngẫu nhiên bảo mật cao"
                      style={{ whiteSpace: 'nowrap', flexShrink: 0, gap: 5 }}
                    >
                      <Sparkles size={13} color="var(--brand)" />
                      Tự động tạo
                    </Button>
                  </div>
                </Field>
                <div style={{ gridColumn: '1 / -1' }}>
                  <Field label="Google Gemini API Key" hint="Dùng miễn phí từ Google AI Studio (aistudio.google.com) để xử lý hội thoại AI và gọi MCP tool">
                    <Input type="password" value={values['ai.geminiApiKey'] ?? ''} onChange={(e) => set('ai.geminiApiKey', e.target.value)} placeholder="Nhập API key mới (AIzaSy...)" />
                  </Field>
                </div>
                <Field label="Bắt đầu giờ im lặng" hint="Không gửi tin trong khung giờ này">
                  <Input type="time" value={values['zalo.quietHoursStart'] ?? '22:00'} onChange={(e) => set('zalo.quietHoursStart', e.target.value)} />
                </Field>
                <Field label="Kết thúc giờ im lặng">
                  <Input type="time" value={values['zalo.quietHoursEnd'] ?? '07:00'} onChange={(e) => set('zalo.quietHoursEnd', e.target.value)} />
                </Field>
              </div>

              <div style={{ background: 'var(--surface-sunken)', border: '1px solid var(--border-subtle)', borderRadius: 'var(--radius-md)', padding: 14 }}>
                <div className="row-between" style={{ marginBottom: 8, flexWrap: 'wrap', gap: 6 }}>
                  <div>
                    <span style={{ fontWeight: 600, fontSize: 13.5 }}>Cấu hình Webhook Zalo Bot</span>
                    <div className="hint" style={{ marginTop: 2 }}>
                      Đăng ký trực tiếp URL webhook với Zalo Bot Platform qua API
                    </div>
                  </div>
                  <div className="row" style={{ gap: 6 }}>
                    <Button size="sm" variant="ghost" loading={webhookLoading} onClick={handleCheckWebhook}>
                      <RefreshCw size={13} /> Kiểm tra trạng thái
                    </Button>
                  </div>
                </div>

                <div className="row" style={{ gap: 8, marginTop: 10, flexWrap: 'wrap' }}>
                  <Input
                    value={webhookInputUrl}
                    onChange={(e) => setWebhookInputUrl(e.target.value)}
                    placeholder="https://your-domain.com/api/zalo"
                    style={{ flex: 1, minWidth: 260, fontFamily: 'var(--font-mono)', fontSize: 12.5 }}
                  />
                  <Button
                    size="sm"
                    variant="primary"
                    loading={webhookLoading}
                    onClick={handleRegisterWebhook}
                    disabled={!values['zalo.botToken']}
                  >
                    <Check size={14} /> Đăng ký Webhook
                  </Button>
                  <Button
                    size="sm"
                    variant="secondary"
                    onClick={() => { navigator.clipboard.writeText(webhookInputUrl); toast.success('Đã sao chép URL'); }}
                  >
                    <Copy size={13} /> Chép
                  </Button>
                </div>

                {webhookInfo && (
                  <div style={{ marginTop: 12, padding: '10px 12px', background: 'var(--surface-card)', borderRadius: 'var(--radius-sm)', border: '1px solid var(--border-base)', fontSize: 12 }}>
                    <div className="row" style={{ gap: 6, marginBottom: 4, flexWrap: 'wrap' }}>
                      <span style={{ fontWeight: 600 }}>URL đang kích hoạt trên Zalo:</span>
                      <code style={{ fontFamily: 'var(--font-mono)', color: 'var(--brand)' }}>{webhookInfo.url || '(Chưa đăng ký)'}</code>
                    </div>
                    {webhookInfo.pending_update_count !== undefined && (
                      <div className="hint">Tin nhắn đang chờ xử lý trên Zalo: {webhookInfo.pending_update_count}</div>
                    )}
                    {webhookInfo.last_error_message && (
                      <div style={{ color: 'var(--danger)', marginTop: 4 }}>
                        Lỗi gần nhất từ Zalo: {webhookInfo.last_error_message}
                      </div>
                    )}
                  </div>
                )}
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <div>
                <CardTitle>Loại thông báo gửi qua Zalo</CardTitle>
                <div className="card-subtitle">Bật/tắt từng nhóm thông báo</div>
              </div>
              <Button size="sm" variant="primary" loading={pending}
                onClick={() => save('zalo', ['zalo.notifyTaskAssigned', 'zalo.notifyTaskDue', 'zalo.notifyLeaveSubmitted', 'zalo.notifyLeaveResult', 'zalo.dailyDigestTime'])}>
                <Save /> Lưu
              </Button>
            </CardHeader>
            <CardBody className="stack" style={{ gap: 12 }}>
              {[
                { key: 'zalo.notifyTaskAssigned', label: 'Giao việc mới', desc: 'Gửi ngay khi công việc được giao cho nhân sự' },
                { key: 'zalo.notifyTaskDue', label: 'Nhắc việc sắp đến hạn / quá hạn', desc: 'Theo cấu hình nhắc việc của từng công việc' },
                { key: 'zalo.notifyLeaveSubmitted', label: 'Đơn nghỉ chờ duyệt', desc: 'Gửi cho người duyệt ở bước hiện tại' },
                { key: 'zalo.notifyLeaveResult', label: 'Kết quả duyệt đơn', desc: 'Gửi cho người nộp đơn và người nhận bàn giao' },
              ].map((item) => (
                <label key={item.key} className="row" style={{ gap: 10 }}>
                  <Switch checked={Boolean(values[item.key])} onChange={(e) => set(item.key, e.target.checked)} />
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 540 }}>{item.label}</div>
                    <div className="hint">{item.desc}</div>
                  </div>
                </label>
              ))}
              <Divider />
              <Field label="Giờ gửi bản tin buổi sáng" hint="Tổng hợp việc đến hạn, việc quá hạn, đơn chờ duyệt">
                <Input type="time" style={{ maxWidth: 160 }} value={values['zalo.dailyDigestTime'] ?? '08:00'} onChange={(e) => set('zalo.dailyDigestTime', e.target.value)} />
              </Field>
              <div>
                <Button size="sm" variant="secondary" loading={pending} onClick={() => startTransition(async () => {
                  const res = await flushOutboxAction();
                  res.ok ? toast.success(res.message) : toast.error(res.message);
                })}>
                  <RefreshCw /> Đẩy hàng đợi thông báo ngay
                </Button>
              </div>
            </CardBody>
          </Card>
        </div>
      )}

      {tab === 'leave' && validTabs.includes('leave') && (
        <div className="stack">
          <Card>
            <CardHeader>
              <CardTitle>Chính sách nghỉ phép</CardTitle>
              <Button size="sm" variant="primary" loading={pending}
                onClick={() => save('leave', ['leave.annualDefaultDays', 'leave.allowNegativeBalance', 'leave.carryOverExpireMonth'])}>
                <Save /> Lưu
              </Button>
            </CardHeader>
            <CardBody>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <Field label="Số ngày phép chuẩn / năm">
                  <Input type="number" step="0.5" value={values['leave.annualDefaultDays'] ?? 12} onChange={(e) => set('leave.annualDefaultDays', Number(e.target.value))} />
                </Field>
                <Field label="Tháng hết hạn phép chuyển tiếp" hint="Phép năm trước hết hạn vào cuối tháng này">
                  <Input type="number" min={1} max={12} value={values['leave.carryOverExpireMonth'] ?? 3} onChange={(e) => set('leave.carryOverExpireMonth', Number(e.target.value))} />
                </Field>
                <label className="row span-2" style={{ gap: 10 }}>
                  <Switch checked={Boolean(values['leave.allowNegativeBalance'])} onChange={(e) => set('leave.allowNegativeBalance', e.target.checked)} />
                  <div>
                    <div style={{ fontSize: 13.5, fontWeight: 540 }}>Cho phép nộp đơn vượt quỹ phép</div>
                    <div className="hint">Khi tắt, hệ thống chặn đơn nếu quỹ phép không đủ</div>
                  </div>
                </label>
              </div>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Loại nghỉ phép ({leaveTypes.length})</CardTitle>
              {permissions.leaveType && (
                <Button size="sm" variant="secondary" onClick={() => setLeaveTypeModal({
                  code: '', name: '', description: '', defaultDaysPerYear: 0, isPaid: true, deductsBalance: false,
                  requiresAttachment: false, allowHalfDay: true, minAdvanceDays: 1, maxConsecutiveDays: null,
                  color: '#3b82f6', isActive: true,
                })}>
                  <Plus /> Thêm loại nghỉ
                </Button>
              )}
            </CardHeader>
            <div className="table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Loại nghỉ</th>
                    <th className="num">Ngày/năm</th>
                    <th>Tính chất</th>
                    <th>Quy tắc</th>
                    <th style={{ width: 50 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {leaveTypes.map((t) => (
                    <tr key={t.id}>
                      <td>
                        <div className="row" style={{ gap: 8 }}>
                          <span style={{ width: 10, height: 10, borderRadius: 3, background: t.color }} />
                          <div>
                            <div style={{ fontWeight: 540, color: 'var(--text-strong)' }}>{t.name}</div>
                            <div className="hint">{t.code}</div>
                          </div>
                        </div>
                      </td>
                      <td className="num tnum">{Number(t.defaultDaysPerYear)}</td>
                      <td>
                        <div className="row" style={{ gap: 4, flexWrap: 'wrap' }}>
                          <Badge tone={t.isPaid ? 'success' : 'neutral'}>{t.isPaid ? 'Có lương' : 'Không lương'}</Badge>
                          {t.deductsBalance && <Badge tone="warning">Trừ quỹ</Badge>}
                          {!t.isActive && <Badge tone="outline">Tắt</Badge>}
                        </div>
                      </td>
                      <td className="hint">
                        {t.requiresAttachment && 'Cần giấy tờ · '}
                        {t.allowHalfDay ? 'Cho nghỉ nửa ngày · ' : ''}
                        Báo trước {t.minAdvanceDays} ngày
                      </td>
                      <td>
                        {permissions.leaveType && (
                          <Button size="sm" variant="ghost" iconOnly onClick={() => setLeaveTypeModal({ ...t, defaultDaysPerYear: Number(t.defaultDaysPerYear) })}>
                            <Plus style={{ transform: 'rotate(45deg)' }} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'attendance' && validTabs.includes('attendance') && (
        <div className="stack">
          <Card>
            <CardHeader>
              <CardTitle>Quy tắc chấm công</CardTitle>
              <Button size="sm" variant="primary" loading={pending}
                onClick={() => save('attendance', ['attendance.requireGeofence', 'attendance.allowZaloCheckin', 'attendance.autoAbsentAfterHours'])}>
                <Save /> Lưu
              </Button>
            </CardHeader>
            <CardBody className="stack" style={{ gap: 12 }}>
              <label className="row" style={{ gap: 10 }}>
                <Switch checked={Boolean(values['attendance.requireGeofence'])} onChange={(e) => set('attendance.requireGeofence', e.target.checked)} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 540 }}>Bắt buộc check-in trong khu vực cho phép</div>
                  <div className="hint">Cần khai báo vị trí văn phòng và bán kính hợp lệ</div>
                </div>
              </label>
              <label className="row" style={{ gap: 10 }}>
                <Switch checked={Boolean(values['attendance.allowZaloCheckin'])} onChange={(e) => set('attendance.allowZaloCheckin', e.target.checked)} />
                <div>
                  <div style={{ fontSize: 13.5, fontWeight: 540 }}>Cho phép chấm công bằng lệnh Zalo</div>
                  <div className="hint">Nhân viên gõ /checkin và /checkout trong chat với bot</div>
                </div>
              </label>
            </CardBody>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle>Ca làm việc ({shifts.length})</CardTitle>
              {permissions.shift && (
                <Button size="sm" variant="secondary" onClick={() => setShiftModal({
                  code: '', name: '', startTime: '08:00', endTime: '17:30',
                  breakMinutes: 90, lateToleranceMin: 5, workDays: 62, isActive: true,
                })}>
                  <Plus /> Thêm ca
                </Button>
              )}
            </CardHeader>
            <div className="table-wrap" style={{ border: 'none', boxShadow: 'none' }}>
              <table className="table">
                <thead>
                  <tr>
                    <th>Ca làm việc</th><th>Giờ</th><th>Nghỉ trưa</th><th>Cho phép muộn</th><th>Ngày làm việc</th><th style={{ width: 50 }}></th>
                  </tr>
                </thead>
                <tbody>
                  {shifts.map((s) => (
                    <tr key={s.id}>
                      <td>
                        <div style={{ fontWeight: 540, color: 'var(--text-strong)' }}>{s.name}</div>
                        <div className="hint">{s.code}{!s.isActive && ' · đã tắt'}</div>
                      </td>
                      <td className="tnum">{s.startTime} – {s.endTime}</td>
                      <td className="tnum">{s.breakMinutes} phút</td>
                      <td className="tnum">{s.lateToleranceMin} phút</td>
                      <td className="hint">{workDaysToLabels(s.workDays)}</td>
                      <td>
                        {permissions.shift && (
                          <Button size="sm" variant="ghost" iconOnly onClick={() => setShiftModal(s)}>
                            <Plus style={{ transform: 'rotate(45deg)' }} />
                          </Button>
                        )}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </Card>
        </div>
      )}

      {tab === 'holidays' && validTabs.includes('holidays') && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Ngày lễ ({holidays.length})</CardTitle>
              <div className="card-subtitle">Ngày lễ được loại khỏi số ngày nghỉ phép và bảng công</div>
            </div>
            <Button size="sm" variant="secondary" onClick={() => { setHolidayForm({ date: '', name: '', isPaid: true }); setHolidayModal({ open: true, id: null }); }}>
              <Plus /> Thêm ngày lễ
            </Button>
          </CardHeader>
          <CardBody style={{ padding: holidays.length ? 0 : undefined }}>
            {holidays.length === 0 ? (
              <EmptyState icon={<CalendarDays size={20} />} title="Chưa khai báo ngày lễ" description="Thêm Tết âm lịch và các ngày nghỉ của công ty." />
            ) : (
              <table className="table">
                <thead>
                  <tr><th>Ngày</th><th>Tên ngày lễ</th><th>Hưởng lương</th><th style={{ width: 50 }}></th></tr>
                </thead>
                <tbody>
                  {holidays.map((h) => (
                    <tr key={h.id}>
                      <td className="tnum">{fmtDate(h.date, 'EEEE, dd/MM/yyyy')}</td>
                      <td style={{ fontWeight: 540, color: 'var(--text-strong)' }}>{h.name}</td>
                      <td>{h.isPaid ? <Badge tone="success">Có lương</Badge> : <Badge tone="neutral">Không lương</Badge>}</td>
                      <td>
                        <Button size="sm" variant="ghost" iconOnly onClick={() => setConfirmDeleteHoliday(h)} aria-label="Xóa"><Trash2 /></Button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </CardBody>
        </Card>
      )}

      {tab === 'reports' && validTabs.includes('reports') && (
        <Card>
          <CardHeader>
            <div>
              <CardTitle>Báo cáo hiển thị</CardTitle>
              <div className="card-subtitle">
                Tắt những báo cáo đơn vị không dùng để màn hình Báo cáo gọn lại. Tắt chỉ ẩn khỏi
                giao diện, dữ liệu và phân quyền không thay đổi.
              </div>
            </div>
            <Button
              variant="primary"
              size="sm"
              loading={pending}
              onClick={() => save('reports', [DISABLED_REPORTS_KEY])}
            >
              <Save size={14} style={{ marginRight: 6 }} /> Lưu
            </Button>
          </CardHeader>
          <CardBody style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {(Object.keys(REPORT_GROUPS) as (keyof typeof REPORT_GROUPS)[]).map((groupKey) => {
              const group = REPORT_GROUPS[groupKey];
              const items = REPORTS.filter((r) => r.group === groupKey);
              const disabled: string[] = Array.isArray(values[DISABLED_REPORTS_KEY])
                ? values[DISABLED_REPORTS_KEY]
                : [];

              return (
                <div key={groupKey}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: 'var(--text-strong)' }}>
                    {group.label}
                  </div>
                  <div className="hint" style={{ marginBottom: 8 }}>{group.description}</div>

                  <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                    {items.map((r) => {
                      const on = !disabled.includes(r.key);
                      return (
                        <label
                          key={r.key}
                          style={{
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'space-between',
                            gap: 12,
                            padding: '9px 12px',
                            borderRadius: 'var(--radius-sm)',
                            border: '1px solid var(--border-base)',
                            background: on ? 'var(--surface-card)' : 'var(--surface-sunken)',
                            cursor: 'pointer',
                          }}
                        >
                          <span style={{ minWidth: 0 }}>
                            <span
                              style={{
                                display: 'block',
                                fontSize: 13,
                                fontWeight: 600,
                                color: on ? 'var(--text-strong)' : 'var(--text-muted)',
                              }}
                            >
                              {r.label}
                            </span>
                            <span className="hint">{r.description}</span>
                          </span>

                          <Switch
                            checked={on}
                            onChange={(e) =>
                              set(
                                DISABLED_REPORTS_KEY,
                                e.target.checked
                                  ? disabled.filter((k) => k !== r.key)
                                  : [...disabled, r.key],
                              )
                            }
                          />
                        </label>
                      );
                    })}
                  </div>
                </div>
              );
            })}
          </CardBody>
        </Card>
      )}

      {/* Modal ngày lễ */}
      <Modal
        open={holidayModal.open}
        onClose={() => setHolidayModal({ open: false, id: null })}
        title="Thêm ngày lễ"
        footer={
          <>
            <Button variant="secondary" onClick={() => setHolidayModal({ open: false, id: null })}>Hủy</Button>
            <Button variant="primary" loading={pending} onClick={() => startTransition(async () => {
              const res = await saveHolidayAction(holidayModal.id, holidayForm.date, holidayForm.name, holidayForm.isPaid);
              if (res.ok) { toast.success(res.message); setHolidayModal({ open: false, id: null }); router.refresh(); }
              else toast.error(res.message);
            })}>
              <Check /> Lưu
            </Button>
          </>
        }
      >
        <div className="stack" style={{ gap: 14 }}>
          <Field label="Ngày" required>
            <Input type="date" value={holidayForm.date} onChange={(e) => setHolidayForm((f) => ({ ...f, date: e.target.value }))} />
          </Field>
          <Field label="Tên ngày lễ" required>
            <Input value={holidayForm.name} onChange={(e) => setHolidayForm((f) => ({ ...f, name: e.target.value }))} placeholder="vd: Mùng 1 Tết Nguyên đán" />
          </Field>
          <label className="row" style={{ gap: 9, fontSize: 13 }}>
            <Checkbox checked={holidayForm.isPaid} onChange={(e) => setHolidayForm((f) => ({ ...f, isPaid: e.target.checked }))} />
            Ngày lễ có hưởng lương
          </label>
        </div>
      </Modal>

      {/* Modal ca làm việc */}
      <Modal
        open={Boolean(shiftModal)}
        onClose={() => setShiftModal(null)}
        title={shiftModal?.id ? 'Sửa ca làm việc' : 'Thêm ca làm việc'}
        footer={
          <>
            <Button variant="secondary" onClick={() => setShiftModal(null)}>Hủy</Button>
            <Button variant="primary" loading={pending} onClick={() => startTransition(async () => {
              const res = await saveWorkShiftAction(shiftModal.id ?? null, {
                code: shiftModal.code, name: shiftModal.name, startTime: shiftModal.startTime, endTime: shiftModal.endTime,
                breakMinutes: Number(shiftModal.breakMinutes), lateToleranceMin: Number(shiftModal.lateToleranceMin),
                workDays: Number(shiftModal.workDays), isActive: shiftModal.isActive,
              });
              if (res.ok) { toast.success(res.message); setShiftModal(null); router.refresh(); }
              else toast.error(res.message);
            })}>
              <Check /> Lưu
            </Button>
          </>
        }
      >
        {shiftModal && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Tên ca" required className="span-2">
              <Input value={shiftModal.name} onChange={(e) => setShiftModal({ ...shiftModal, name: e.target.value })} />
            </Field>
            <Field label="Mã ca" required>
              <Input value={shiftModal.code} onChange={(e) => setShiftModal({ ...shiftModal, code: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Nghỉ giữa ca (phút)">
              <Input type="number" value={shiftModal.breakMinutes} onChange={(e) => setShiftModal({ ...shiftModal, breakMinutes: e.target.value })} />
            </Field>
            <Field label="Giờ bắt đầu" required>
              <Input type="time" value={shiftModal.startTime} onChange={(e) => setShiftModal({ ...shiftModal, startTime: e.target.value })} />
            </Field>
            <Field label="Giờ kết thúc" required>
              <Input type="time" value={shiftModal.endTime} onChange={(e) => setShiftModal({ ...shiftModal, endTime: e.target.value })} />
            </Field>
            <Field label="Cho phép muộn (phút)">
              <Input type="number" value={shiftModal.lateToleranceMin} onChange={(e) => setShiftModal({ ...shiftModal, lateToleranceMin: e.target.value })} />
            </Field>
            <Field label="Ngày làm việc trong tuần" className="span-2">
              <div className="row" style={{ gap: 10, flexWrap: 'wrap' }}>
                {WORKDAY_LABELS.map((label, i) => (
                  <label key={label} className="row" style={{ gap: 5, fontSize: 12.5 }}>
                    <Checkbox
                      checked={(Number(shiftModal.workDays) & (1 << i)) !== 0}
                      onChange={(e) => {
                        const mask = Number(shiftModal.workDays);
                        setShiftModal({ ...shiftModal, workDays: e.target.checked ? mask | (1 << i) : mask & ~(1 << i) });
                      }}
                    />
                    {label}
                  </label>
                ))}
              </div>
            </Field>
            <label className="row span-2" style={{ gap: 9, fontSize: 13 }}>
              <Switch checked={shiftModal.isActive} onChange={(e) => setShiftModal({ ...shiftModal, isActive: e.target.checked })} />
              Ca đang áp dụng
            </label>
          </div>
        )}
      </Modal>

      {/* Modal loại nghỉ phép */}
      <Modal
        open={Boolean(leaveTypeModal)}
        onClose={() => setLeaveTypeModal(null)}
        title={leaveTypeModal?.id ? 'Sửa loại nghỉ phép' : 'Thêm loại nghỉ phép'}
        size="lg"
        footer={
          <>
            <Button variant="secondary" onClick={() => setLeaveTypeModal(null)}>Hủy</Button>
            <Button variant="primary" loading={pending} onClick={() => startTransition(async () => {
              const res = await saveLeaveTypeAction(leaveTypeModal.id ?? null, {
                code: leaveTypeModal.code, name: leaveTypeModal.name, description: leaveTypeModal.description || null,
                defaultDaysPerYear: Number(leaveTypeModal.defaultDaysPerYear),
                isPaid: leaveTypeModal.isPaid, deductsBalance: leaveTypeModal.deductsBalance,
                requiresAttachment: leaveTypeModal.requiresAttachment, allowHalfDay: leaveTypeModal.allowHalfDay,
                minAdvanceDays: Number(leaveTypeModal.minAdvanceDays),
                maxConsecutiveDays: leaveTypeModal.maxConsecutiveDays ? Number(leaveTypeModal.maxConsecutiveDays) : null,
                color: leaveTypeModal.color, isActive: leaveTypeModal.isActive,
              });
              if (res.ok) { toast.success(res.message); setLeaveTypeModal(null); router.refresh(); }
              else toast.error(res.message);
            })}>
              <Check /> Lưu
            </Button>
          </>
        }
      >
        {leaveTypeModal && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            <Field label="Tên loại nghỉ" required className="span-2">
              <Input value={leaveTypeModal.name} onChange={(e) => setLeaveTypeModal({ ...leaveTypeModal, name: e.target.value })} />
            </Field>
            <Field label="Mã" required>
              <Input value={leaveTypeModal.code} onChange={(e) => setLeaveTypeModal({ ...leaveTypeModal, code: e.target.value.toUpperCase() })} />
            </Field>
            <Field label="Màu hiển thị">
              <Input type="color" value={leaveTypeModal.color} onChange={(e) => setLeaveTypeModal({ ...leaveTypeModal, color: e.target.value })} style={{ padding: 4, height: 38 }} />
            </Field>
            <Field label="Số ngày mặc định / năm">
              <Input type="number" step="0.5" value={leaveTypeModal.defaultDaysPerYear} onChange={(e) => setLeaveTypeModal({ ...leaveTypeModal, defaultDaysPerYear: e.target.value })} />
            </Field>
            <Field label="Báo trước tối thiểu (ngày)">
              <Input type="number" value={leaveTypeModal.minAdvanceDays} onChange={(e) => setLeaveTypeModal({ ...leaveTypeModal, minAdvanceDays: e.target.value })} />
            </Field>
            <Field label="Tối đa ngày liên tục" hint="Để trống nếu không giới hạn" className="span-2">
              <Input type="number" value={leaveTypeModal.maxConsecutiveDays ?? ''} onChange={(e) => setLeaveTypeModal({ ...leaveTypeModal, maxConsecutiveDays: e.target.value || null })} />
            </Field>
            <Field label="Mô tả" className="span-2">
              <Input value={leaveTypeModal.description ?? ''} onChange={(e) => setLeaveTypeModal({ ...leaveTypeModal, description: e.target.value })} />
            </Field>
            <div className="span-2 stack" style={{ gap: 9 }}>
              {[
                { key: 'isPaid', label: 'Có hưởng lương' },
                { key: 'deductsBalance', label: 'Trừ vào quỹ phép năm' },
                { key: 'requiresAttachment', label: 'Bắt buộc đính kèm giấy tờ' },
                { key: 'allowHalfDay', label: 'Cho phép nghỉ nửa ngày' },
                { key: 'isActive', label: 'Đang áp dụng' },
              ].map((item) => (
                <label key={item.key} className="row" style={{ gap: 9, fontSize: 13 }}>
                  <Switch checked={Boolean(leaveTypeModal[item.key])} onChange={(e) => setLeaveTypeModal({ ...leaveTypeModal, [item.key]: e.target.checked })} />
                  {item.label}
                </label>
              ))}
            </div>
          </div>
        )}
      </Modal>

      <ConfirmDialog
        open={Boolean(confirmDeleteHoliday)}
        onClose={() => setConfirmDeleteHoliday(null)}
        onConfirm={() => startTransition(async () => {
          const res = await deleteHolidayAction(confirmDeleteHoliday.id);
          res.ok ? toast.success(res.message) : toast.error(res.message);
          setConfirmDeleteHoliday(null);
          router.refresh();
        })}
        loading={pending}
        danger
        title="Xóa ngày lễ"
        confirmText="Xóa"
        message={<>Xóa ngày lễ <b>{confirmDeleteHoliday?.name}</b>?</>}
      />

      <ConfirmDialog
        open={Boolean(confirmResetModal?.open)}
        onClose={() => setConfirmResetModal(null)}
        onConfirm={() => {
          const isClean = Boolean(confirmResetModal?.clean);
          setResettingData(true);
          startTransition(async () => {
            try {
              const res = await resetDemoDataAction({ clean: isClean });
              if (res.ok) {
                toast.success(res.message);
                setConfirmResetModal(null);
                router.refresh();
              } else {
                toast.error(res.message);
              }
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Có lỗi xảy ra khi nạp dữ liệu';
              toast.error(msg);
            } finally {
              setResettingData(false);
            }
          });
        }}
        loading={resettingData || pending}
        danger={Boolean(confirmResetModal?.clean)}
        title={confirmResetModal?.clean ? 'Làm sạch và nạp lại toàn bộ dữ liệu mẫu' : 'Nạp bổ sung dữ liệu mẫu'}
        confirmText={confirmResetModal?.clean ? 'Xác nhận xóa & nạp seed' : 'Bắt đầu nạp seed'}
        cancelText="Đóng"
        message={
          confirmResetModal?.clean ? (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ color: 'var(--danger)', fontWeight: 600 }}>
                ⚠️ CẢNH BÁO: Dữ liệu phát sinh sẽ bị xóa hoàn toàn!
              </div>
              <div>
                Hệ thống sẽ làm sạch toàn bộ khách hàng, thiết bị F&B, linh kiện kho, phiếu thu/chi, đơn hàng, công việc, chấm công và các yêu cầu nghỉ phép hiện tại.
              </div>
              <div>
                Sau khi xóa, hệ thống sẽ tự động khởi tạo lại bộ <b>Dữ liệu Seed Demo chuẩn</b> bao gồm: 14 nhân sự, 8 máy F&B, 4 chuỗi khách hàng lớn, 8+ linh kiện, <b>6 tháng liên tục dữ liệu kinh doanh (04–09/2026)</b> gồm 21 đơn bán hàng, 9 đơn nhập hàng, phiếu thu chi, chứng từ kho và 30 ngày chấm công.
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                * Tài khoản quản trị <b>admin</b> và các thông tin cấu hình hệ thống (tên công ty, token Zalo, bản in...) được bảo lưu an toàn.
              </div>
            </div>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div>
                Hệ thống sẽ chạy nạp bổ sung các bản ghi dữ liệu mẫu (Seed Demo) còn thiếu vào cơ sở dữ liệu.
              </div>
              <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
                Dữ liệu hiện có của bạn sẽ không bị xóa.
              </div>
            </div>
          )
        }
      />

      <ConfirmDialog
        open={confirmClearSalesOpen}
        onClose={() => setConfirmClearSalesOpen(false)}
        onConfirm={() => {
          setResettingData(true);
          startTransition(async () => {
            try {
              const res = await clearSalesAndPurchaseDocumentsAction();
              if (res.ok) {
                toast.success(res.message);
                setConfirmClearSalesOpen(false);
                router.refresh();
              } else {
                toast.error(res.message);
              }
            } catch (err: unknown) {
              const msg = err instanceof Error ? err.message : 'Có lỗi xảy ra khi xóa chứng từ bán hàng';
              toast.error(msg);
            } finally {
              setResettingData(false);
            }
          });
        }}
        loading={resettingData || pending}
        danger
        title="Xóa chứng từ bán hàng, báo giá và PO"
        confirmText="Xóa chứng từ"
        cancelText="Giữ lại"
        message={(
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ color: 'var(--danger)', fontWeight: 600 }}>
              Thao tác này xóa toàn bộ đơn bán, báo giá, PO mua hàng nhà cung cấp, phiếu thu/chi NCC và phiếu trả hàng.
            </div>
            <div>
              Khách hàng, địa điểm, hồ sơ máy móc, danh mục phụ tùng và số tồn kho vẫn được giữ nguyên. Lịch sử phiếu kho vẫn còn, nhưng bỏ liên kết tới các PO và đơn bán đã xóa.
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
              Không thể hoàn tác sau khi xác nhận.
            </div>
          </div>
        )}
      />

      {pricingModalOpen && pricingConfig && (
        <SparePartPricingModal
          open={pricingModalOpen}
          initialConfig={pricingConfig}
          onClose={() => setPricingModalOpen(false)}
          onSuccess={(nextConfig) => {
            setPricingConfig(nextConfig);
            startTransition(() => router.refresh());
          }}
        />
      )}

      <ConfirmDialog
        open={confirmMigrationOpen}
        onClose={() => setConfirmMigrationOpen(false)}
        onConfirm={handleDeployMigrations}
        loading={migratingSchema || pending}
        title="Triển khai migration đang chờ"
        confirmText="Chạy migration"
        cancelText="Đóng"
        message={(
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div>
              Hệ thống sẽ chạy <code>prisma migrate deploy</code> trên database hiện tại, sau đó tạo lại Prisma Client.
              Lệnh này áp dụng <b>tất cả migration đang chờ</b>, không xóa dữ liệu nghiệp vụ.
            </div>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)' }}>
              Sau khi chạy thành công, hãy khởi động lại server để nạp Prisma Client mới rồi mới tiếp tục nạp seed. Chỉ quản trị viên mới thấy và chạy được thao tác này.
            </div>
          </div>
        )}
      />

      <ConfirmDialog
        open={confirmClearAllDataOpen}
        onClose={() => setConfirmClearAllDataOpen(false)}
        onConfirm={() => {
          setClearingAllData(true);
          startTransition(async () => {
            try {
              const res = await clearAllBusinessDataAction();
              if (res.ok) {
                toast.success(res.message);
                setConfirmClearAllDataOpen(false);
                router.refresh();
              } else {
                toast.error(res.message);
              }
            } catch (error) {
              toast.error(error instanceof Error ? error.message : 'Không thể xóa dữ liệu');
            } finally {
              setClearingAllData(false);
            }
          });
        }}
        loading={clearingAllData || pending}
        danger
        title="Xóa toàn bộ dữ liệu nghiệp vụ"
        confirmText="Xóa toàn bộ dữ liệu"
        cancelText="Hủy"
        message={(
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
            <div style={{ color: 'var(--danger)', fontWeight: 600 }}>
              Thao tác này xóa dữ liệu nghiệp vụ hiện có và không nạp seed demo.
            </div>
            <div>
              Khách hàng, máy móc, phụ tùng, tồn kho, đơn hàng, báo giá, PO, thanh toán, công việc, chấm công và tài khoản nhân viên khác sẽ bị xóa.
            </div>
            <div>
              Tài khoản admin đang đăng nhập được giữ lại cùng quyền và cấu hình hệ thống cần thiết. Không thể hoàn tác.
            </div>
          </div>
        )}
      />
    </div>
  );
}
