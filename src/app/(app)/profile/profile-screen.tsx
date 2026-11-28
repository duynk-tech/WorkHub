'use client';

import React, { useState, useTransition, useActionState, useRef } from 'react';
import { useRouter } from 'next/navigation';
import {
  MessageCircle, KeyRound, Copy, Unlink, CheckCircle2, Building2, User, Clock,
  Briefcase, Mail, Phone, CalendarDays, AlertCircle, Camera, Upload, Trash2,
  Loader2, Eye, EyeOff, FolderOpen, ShieldCheck, UserCheck, Cake, Sparkles,
  ExternalLink, Check, RefreshCw, FileText
} from 'lucide-react';
import {
  Button, Card, CardBody, CardHeader, CardTitle, Badge, Field, Input,
  PageHeader, Alert
} from '@/components/ui';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { MediaPickerModal } from '@/components/domain/media-picker-modal';
import { fmtDate } from '@/lib/date';
import { formatDays } from '@/lib/utils';
import { EMPLOYMENT_TYPE } from '@/lib/enums';
import { changePasswordAction, type ActionState } from '@/server/modules/auth/actions';
import { requestZaloLinkCodeAction, unlinkZaloAction } from '@/server/modules/settings/actions';
import { linkGoogleAction, unlinkGoogleAction } from '@/server/auth/google/actions';
import {
  uploadAvatarAction,
  setAvatarUrlAction,
  updateContactInfoAction
} from '@/server/modules/profile/actions';

interface ProfileScreenProps {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  employee: any;
  user: { username: string; roleNames: string[] };
  balance: { remaining: number; used: number; pending: number; year: number };
  stats: { openTasks: number; doneTasks: number; approvedLeaves: number };
  zaloLinked: boolean;
  google?: { enabled: boolean; email: string | null; result?: string };
}

export function ProfileScreen({
  employee: initialEmployee,
  user,
  balance,
  stats,
  zaloLinked,
  google,
}: ProfileScreenProps) {
  const router = useRouter();
  const toast = useToast();
  const [employee, setEmployee] = useState(initialEmployee);
  const [pending, startTransition] = useTransition();

  // Zalo link state
  const [linkCode, setLinkCode] = useState<string | null>(null);

  // Password state
  const [pwState, pwAction, pwPending] = useActionState<ActionState, FormData>(changePasswordAction, {});
  const [showCurrentPw, setShowCurrentPw] = useState(false);
  const [showNewPw, setShowNewPw] = useState(false);
  const [showConfirmPw, setShowConfirmPw] = useState(false);

  // Google SSO state
  const [googleState, googleAction, googlePending] = useActionState(
    google?.email ? unlinkGoogleAction : linkGoogleAction,
    {}
  );

  // Avatar states & modal
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [avatarModalOpen, setAvatarModalOpen] = useState(false);
  const [mediaPickerOpen, setMediaPickerOpen] = useState(false);
  const [avatarUploading, setAvatarUploading] = useState(false);

  // Contact edit modal
  const [contactModalOpen, setContactModalOpen] = useState(false);
  const [contactPending, setContactPending] = useState(false);
  const [contactForm, setContactForm] = useState({
    email: employee.email || '',
    phone: employee.phone || '',
    gender: employee.gender || '',
    dateOfBirth: employee.dateOfBirth ? String(employee.dateOfBirth).split('T')[0] : '',
  });

  // Copied code feedback
  const [copiedCode, setCopiedCode] = useState(false);

  // Zalo Code generator
  const getCode = () => {
    startTransition(async () => {
      const res = await requestZaloLinkCodeAction();
      if (res.ok && res.code) {
        setLinkCode(res.code);
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
    });
  };

  const unlinkZalo = () => {
    if (!confirm('Bạn có chắc chắn muốn hủy liên kết tài khoản Zalo?')) return;
    startTransition(async () => {
      const res = await unlinkZaloAction();
      if (res.ok) {
        toast.success(res.message);
      } else {
        toast.error(res.message);
      }
      setLinkCode(null);
      router.refresh();
    });
  };

  // Avatar file upload handler
  const handleFileUpload = async (file: File) => {
    if (!file) return;
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Ảnh quá lớn (tối đa 5MB)');
      return;
    }

    setAvatarUploading(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await uploadAvatarAction(formData);

      if (res.ok && res.url) {
        setEmployee((prev: typeof initialEmployee) => ({ ...prev, avatarUrl: res.url }));
        toast.success('Đã cập nhật ảnh đại diện');
        setAvatarModalOpen(false);
        router.refresh();
      } else {
        toast.error(res.message || 'Tải ảnh thất bại');
      }
    } catch {
      toast.error('Có lỗi xảy ra khi tải ảnh lên');
    } finally {
      setAvatarUploading(false);
    }
  };

  // Set avatar from media library
  const handleSelectFromMedia = async (url: string | string[]) => {
    const targetUrl = Array.isArray(url) ? url[0] : url;
    if (!targetUrl) return;

    setAvatarUploading(true);
    try {
      const res = await setAvatarUrlAction(targetUrl);
      if (res.ok) {
        setEmployee((prev: typeof initialEmployee) => ({ ...prev, avatarUrl: targetUrl }));
        toast.success('Đã đổi ảnh đại diện');
        setAvatarModalOpen(false);
        setMediaPickerOpen(false);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error('Có lỗi xảy ra khi đổi ảnh');
    } finally {
      setAvatarUploading(false);
    }
  };

  // Remove avatar
  const handleRemoveAvatar = async () => {
    if (!confirm('Bạn có chắc muốn xóa ảnh đại diện này?')) return;
    setAvatarUploading(true);
    try {
      const res = await setAvatarUrlAction(null);
      if (res.ok) {
        setEmployee((prev: typeof initialEmployee) => ({ ...prev, avatarUrl: null }));
        toast.success('Đã xóa ảnh đại diện');
        setAvatarModalOpen(false);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error('Có lỗi xảy ra');
    } finally {
      setAvatarUploading(false);
    }
  };

  // Save contact updates
  const handleSaveContact = async (e: React.FormEvent) => {
    e.preventDefault();
    setContactPending(true);
    try {
      const res = await updateContactInfoAction(contactForm);
      if (res.ok) {
        toast.success('Đã lưu thông tin cá nhân');
        setEmployee((prev: typeof initialEmployee) => ({
          ...prev,
          email: contactForm.email || null,
          phone: contactForm.phone || null,
          gender: contactForm.gender || null,
          dateOfBirth: contactForm.dateOfBirth ? new Date(contactForm.dateOfBirth) : null,
        }));
        setContactModalOpen(false);
        router.refresh();
      } else {
        toast.error(res.message);
      }
    } catch {
      toast.error('Không thể cập nhật thông tin');
    } finally {
      setContactPending(false);
    }
  };

  const copyToClipboard = (text: string, msg: string) => {
    navigator.clipboard.writeText(text);
    toast.success(msg);
  };

  const scrollToPassword = () => {
    const el = document.getElementById('security-section');
    if (el) el.scrollIntoView({ behavior: 'smooth' });
  };

  // Initials generator
  const getInitials = (name: string) => {
    if (!name) return 'U';
    const parts = name.trim().split(/\s+/);
    if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
    return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
  };

  return (
    <div className="stack" style={{ gap: 20 }}>
      {/* Hidden File Input for Avatar upload */}
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/gif"
        style={{ display: 'none' }}
        onChange={(e) => {
          const file = e.target.files?.[0];
          if (file) handleFileUpload(file);
          e.target.value = '';
        }}
      />

      <PageHeader
        title="Hồ sơ cá nhân"
        description="Thông tin nhân sự, cập nhật ảnh đại diện, bảo mật tài khoản và liên kết ứng dụng"
      />

      {/* ── 1. Hero Header Card ─────────────────────────────────── */}
      <div className="profile-hero-card">
        {/* Banner with gradient & subtle geometric pattern */}
        <div className="profile-hero-banner">
          <div className="profile-banner-content">
            <div className="profile-banner-left">
              {/* Avatar with hover trigger & camera button */}
              <div
                className="profile-avatar-container"
                onClick={() => setAvatarModalOpen(true)}
                title="Bấm để thay đổi ảnh đại diện"
              >
                <div className="profile-avatar-circle">
                  {avatarUploading ? (
                    <Loader2 size={32} className="animate-spin" style={{ color: 'var(--brand)' }} />
                  ) : employee.avatarUrl ? (
                    <img src={employee.avatarUrl} alt={employee.fullName} />
                  ) : (
                    <span>{getInitials(employee.fullName)}</span>
                  )}
                </div>

                {/* Hover overlay */}
                {!avatarUploading && (
                  <div className="profile-avatar-overlay-hover">
                    <Camera size={20} />
                    <span style={{ fontSize: 10.5, fontWeight: 600 }}>Đổi ảnh</span>
                  </div>
                )}

                {/* Bottom camera badge */}
                <div className="profile-avatar-camera-btn">
                  <Camera size={13} />
                </div>
              </div>

              {/* Profile Info block on Cover - Pure White & High Contrast */}
              <div className="profile-banner-text">
                <div style={{ display: 'flex', alignItems: 'center', gap: 10, flexWrap: 'wrap' }}>
                  <h1 className="profile-banner-name">
                    {employee.fullName}
                  </h1>
                  <span className="profile-badge-status">
                    <span className="profile-dot-green" /> Đang làm việc
                  </span>
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
                  <span className="profile-glass-tag">
                    @{user.username}
                  </span>

                  <button
                    type="button"
                    onClick={() => copyToClipboard(employee.code, `Đã chép mã ${employee.code}`)}
                    className="profile-glass-btn"
                    title="Bấm để sao chép mã nhân sự"
                  >
                    <span>{employee.code}</span>
                    <Copy size={11} />
                  </button>

                  {user.roleNames.map((r) => (
                    <span key={r} className="profile-glass-tag">
                      {r}
                    </span>
                  ))}

                  {zaloLinked && (
                    <span
                      className="profile-glass-tag"
                      style={{ background: 'rgba(0, 104, 255, 0.4)', borderColor: 'rgba(255, 255, 255, 0.4)' }}
                    >
                      <CheckCircle2 size={12} /> Đã liên kết Zalo
                    </span>
                  )}
                </div>
              </div>
            </div>

            {/* Quick Hero Actions on Banner */}
            <div className="profile-banner-actions">
              <button
                type="button"
                className="profile-banner-btn"
                onClick={() => setAvatarModalOpen(true)}
              >
                <Camera size={14} />
                <span>Cập nhật ảnh</span>
              </button>
              <button
                type="button"
                className="profile-banner-btn"
                onClick={() => setContactModalOpen(true)}
              >
                <Sparkles size={14} />
                <span>Sửa thông tin</span>
              </button>
              <button
                type="button"
                className="profile-banner-btn"
                onClick={scrollToPassword}
              >
                <KeyRound size={14} />
                <span>Đổi mật khẩu</span>
              </button>
            </div>
          </div>
        </div>

        {/* Quick info subbar directly below the cover banner */}
        <div className="profile-hero-subbar">
          <div className="profile-subbar-item">
            <Building2 size={14} />
            <span className="profile-subbar-label">Phòng ban:</span>
            <span className="profile-subbar-value">{employee.department?.name ?? 'Ban Giám Đốc'}</span>
          </div>
          <div className="profile-subbar-item">
            <Briefcase size={14} />
            <span className="profile-subbar-label">Chức danh:</span>
            <span className="profile-subbar-value">{employee.position?.name ?? 'Quản trị viên hệ thống'}</span>
          </div>
          {employee.email && (
            <div className="profile-subbar-item">
              <Mail size={14} />
              <span className="profile-subbar-label">Email:</span>
              <span className="profile-subbar-value">{employee.email}</span>
            </div>
          )}
          {employee.phone && (
            <div className="profile-subbar-item">
              <Phone size={14} />
              <span className="profile-subbar-label">Điện thoại:</span>
              <span className="profile-subbar-value">{employee.phone}</span>
            </div>
          )}
        </div>
      </div>

      {/* ── 2. Stat Cards Grid (Modern Colorful Design) ─────────── */}
      <div className="grid-stats">
        {/* Phép còn lại */}
        <div className="profile-stat-box">
          <div className="profile-stat-icon" style={{ background: 'rgba(16, 185, 129, 0.12)', color: '#059669' }}>
            <CalendarDays size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 500 }}>
              Phép năm {balance.year}
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.2, marginTop: 2 }}>
              {formatDays(balance.remaining)}{' '}
              <span style={{ fontSize: 13, fontWeight: 500, color: 'var(--text-muted)' }}>ngày</span>
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
              Đã dùng {formatDays(balance.used)} · Chờ duyệt {formatDays(balance.pending)}
            </div>
          </div>
        </div>

        {/* Việc đang mở */}
        <div className="profile-stat-box">
          <div className="profile-stat-icon" style={{ background: 'rgba(245, 158, 11, 0.12)', color: '#d97706' }}>
            <Clock size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 500 }}>
              Việc đang mở
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.2, marginTop: 2 }}>
              {stats.openTasks}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
              Nhiệm vụ đang phụ trách
            </div>
          </div>
        </div>

        {/* Việc đã hoàn thành */}
        <div className="profile-stat-box">
          <div className="profile-stat-icon" style={{ background: 'rgba(37, 99, 235, 0.12)', color: '#2563eb' }}>
            <CheckCircle2 size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 500 }}>
              Việc hoàn thành
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.2, marginTop: 2 }}>
              {stats.doneTasks}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
              Nhiệm vụ đã đóng đạt chuẩn
            </div>
          </div>
        </div>

        {/* Đơn nghỉ đã duyệt */}
        <div className="profile-stat-box">
          <div className="profile-stat-icon" style={{ background: 'rgba(124, 58, 237, 0.12)', color: '#7c3aed' }}>
            <ShieldCheck size={22} />
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 12.5, color: 'var(--text-muted)', fontWeight: 500 }}>
              Đơn nghỉ đã duyệt
            </div>
            <div style={{ fontSize: 24, fontWeight: 700, color: 'var(--text-strong)', lineHeight: 1.2, marginTop: 2 }}>
              {stats.approvedLeaves}
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 4 }}>
              Số lần xin nghỉ hợp lệ
            </div>
          </div>
        </div>
      </div>

      {/* ── 3. Main Content: 2-Column Responsive Layout ─────────── */}
      <div className="grid-2" style={{ alignItems: 'start' }}>
        {/* Left Column: Organization & Personal Details */}
        <div className="stack" style={{ gap: 16 }}>
          {/* Card: Thông tin công việc */}
          <Card>
            <CardHeader style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <CardTitle>Thông tin công việc</CardTitle>
                <div className="card-subtitle">Vị trí, phòng ban và chế độ làm việc tại WorkHub</div>
              </div>
              <Badge tone="brand">Nhân sự chính thức</Badge>
            </CardHeader>
            <CardBody className="stack" style={{ gap: 4 }}>
              <div className="profile-info-row">
                <span className="row hint" style={{ gap: 8 }}>
                  <Building2 size={15} style={{ color: 'var(--brand)' }} />
                  Phòng ban
                </span>
                <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>
                  {employee.department?.name ? (
                    <Badge tone="neutral">{employee.department.name}</Badge>
                  ) : (
                    <Badge tone="neutral">Toàn công ty / Quản trị</Badge>
                  )}
                </span>
              </div>

              <div className="profile-info-row">
                <span className="row hint" style={{ gap: 8 }}>
                  <Briefcase size={15} style={{ color: 'var(--brand)' }} />
                  Chức danh
                </span>
                <span style={{ fontWeight: 600, color: 'var(--text-strong)' }}>
                  {employee.position?.name ? (
                    employee.position.name
                  ) : (
                    <Badge tone="brand">Quản trị viên hệ thống</Badge>
                  )}
                </span>
              </div>

              <div className="profile-info-row">
                <span className="row hint" style={{ gap: 8 }}>
                  <UserCheck size={15} style={{ color: 'var(--brand)' }} />
                  Quản lý trực tiếp
                </span>
                <span style={{ fontWeight: 550, color: 'var(--text-strong)' }}>
                  {employee.manager?.fullName ?? '—'}
                </span>
              </div>

              <div className="profile-info-row">
                <span className="row hint" style={{ gap: 8 }}>
                  <Clock size={15} style={{ color: 'var(--brand)' }} />
                  Ca làm việc
                </span>
                <span style={{ fontWeight: 550, color: 'var(--text-strong)' }}>
                  {employee.workShift ? (
                    <span style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}>
                      <span>{employee.workShift.name}</span>
                      <span
                        style={{
                          fontSize: 12,
                          background: 'var(--surface-sunken)',
                          padding: '1px 6px',
                          borderRadius: 4,
                          color: 'var(--text-muted)',
                        }}
                      >
                        {employee.workShift.startTime} – {employee.workShift.endTime}
                      </span>
                    </span>
                  ) : (
                    'Linh hoạt'
                  )}
                </span>
              </div>

              <div className="profile-info-row">
                <span className="row hint" style={{ gap: 8 }}>
                  <FileText size={15} style={{ color: 'var(--brand)' }} />
                  Loại hợp đồng
                </span>
                <span style={{ fontWeight: 550, color: 'var(--text-strong)' }}>
                  {EMPLOYMENT_TYPE[employee.employmentType] ?? employee.employmentType ?? 'Toàn thời gian'}
                </span>
              </div>

              <div className="profile-info-row">
                <span className="row hint" style={{ gap: 8 }}>
                  <CalendarDays size={15} style={{ color: 'var(--brand)' }} />
                  Ngày vào làm
                </span>
                <span style={{ fontWeight: 550, color: 'var(--text-strong)' }}>
                  {employee.joinDate ? fmtDate(employee.joinDate) : '—'}
                </span>
              </div>
            </CardBody>
          </Card>

          {/* Card: Thông tin liên hệ & cá nhân */}
          <Card>
            <CardHeader style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div>
                <CardTitle>Thông tin cá nhân & Liên hệ</CardTitle>
                <div className="card-subtitle">Số điện thoại, hòm thư và ngày sinh của bạn</div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setContactModalOpen(true)}
                style={{ fontSize: 12, display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                <Sparkles size={13} />
                <span>Cập nhật</span>
              </Button>
            </CardHeader>
            <CardBody className="stack" style={{ gap: 4 }}>
              <div className="profile-info-row">
                <span className="row hint" style={{ gap: 8 }}>
                  <Mail size={15} style={{ color: 'var(--brand)' }} />
                  Email liên hệ
                </span>
                {employee.email ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <a
                      href={`mailto:${employee.email}`}
                      style={{
                        color: 'var(--brand)',
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      {employee.email}
                    </a>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(employee.email, 'Đã sao chép email')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                      title="Sao chép email"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>Chưa cập nhật</span>
                )}
              </div>

              <div className="profile-info-row">
                <span className="row hint" style={{ gap: 8 }}>
                  <Phone size={15} style={{ color: 'var(--brand)' }} />
                  Số điện thoại
                </span>
                {employee.phone ? (
                  <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                    <a
                      href={`tel:${employee.phone}`}
                      style={{
                        color: 'var(--text-strong)',
                        fontWeight: 600,
                        textDecoration: 'none',
                      }}
                    >
                      {employee.phone}
                    </a>
                    <button
                      type="button"
                      onClick={() => copyToClipboard(employee.phone, 'Đã sao chép số điện thoại')}
                      style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
                      title="Sao chép số điện thoại"
                    >
                      <Copy size={13} />
                    </button>
                  </div>
                ) : (
                  <span style={{ color: 'var(--text-muted)' }}>Chưa cập nhật</span>
                )}
              </div>

              <div className="profile-info-row">
                <span className="row hint" style={{ gap: 8 }}>
                  <User size={15} style={{ color: 'var(--brand)' }} />
                  Giới tính
                </span>
                <span style={{ fontWeight: 550, color: 'var(--text-strong)' }}>
                  {employee.gender === 'MALE'
                    ? 'Nam'
                    : employee.gender === 'FEMALE'
                    ? 'Nữ'
                    : employee.gender || 'Chưa cập nhật'}
                </span>
              </div>

              <div className="profile-info-row">
                <span className="row hint" style={{ gap: 8 }}>
                  <Cake size={15} style={{ color: 'var(--brand)' }} />
                  Ngày sinh
                </span>
                <span style={{ fontWeight: 550, color: 'var(--text-strong)' }}>
                  {employee.dateOfBirth ? fmtDate(employee.dateOfBirth) : 'Chưa cập nhật'}
                </span>
              </div>
            </CardBody>
          </Card>
        </div>

        {/* Right Column: Security, Zalo, & External Logins */}
        <div className="stack" style={{ gap: 16 }} id="security-section">
          {/* Card: Liên kết Zalo Bot */}
          <Card>
            <CardHeader style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                <div
                  style={{
                    width: 34,
                    height: 34,
                    borderRadius: 9,
                    background: '#0068ff',
                    color: '#ffffff',
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'center',
                    fontWeight: 800,
                    fontSize: 14,
                  }}
                >
                  Z
                </div>
                <div>
                  <CardTitle>Liên kết Zalo Bot</CardTitle>
                  <div className="card-subtitle">Nhận thông báo việc gấp, duyệt đơn và chat AI</div>
                </div>
              </div>
              {zaloLinked ? (
                <Badge tone="success" dot>
                  Đã kết nối
                </Badge>
              ) : (
                <Badge tone="neutral">Chưa kết nối</Badge>
              )}
            </CardHeader>
            <CardBody className="stack" style={{ gap: 12 }}>
              {zaloLinked ? (
                <>
                  <div
                    style={{
                      background: 'rgba(16, 185, 129, 0.08)',
                      border: '1px solid rgba(16, 185, 129, 0.25)',
                      borderRadius: 10,
                      padding: '14px 16px',
                    }}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
                      <CheckCircle2 size={18} style={{ color: '#059669', flexShrink: 0 }} />
                      <div style={{ fontSize: 13, color: 'var(--text-strong)' }}>
                        Tài khoản Zalo của bạn đang được liên kết và hoạt động. Gõ{' '}
                        <code
                          style={{
                            background: 'var(--surface-card)',
                            padding: '2px 6px',
                            borderRadius: 4,
                            fontWeight: 700,
                            color: 'var(--brand)',
                          }}
                        >
                          /help
                        </code>{' '}
                        trong chat bot để xem các lệnh thao tác.
                      </div>
                    </div>
                  </div>
                  <div>
                    <Button
                      variant="danger-soft"
                      size="sm"
                      onClick={unlinkZalo}
                      loading={pending}
                      style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                    >
                      <Unlink size={13} /> Hủy liên kết Zalo
                    </Button>
                  </div>
                </>
              ) : linkCode ? (
                <>
                  <div
                    style={{
                      background: 'rgba(37, 99, 235, 0.06)',
                      border: '1px solid rgba(37, 99, 235, 0.2)',
                      borderRadius: 10,
                      padding: '14px 16px',
                    }}
                  >
                    <div style={{ fontSize: 13, color: 'var(--text-strong)', marginBottom: 10 }}>
                      Mở ứng dụng Zalo, tìm bot <b>WorkHub</b> và nhắn đúng cú pháp sau (mã có hiệu lực trong 10 phút):
                    </div>
                    <div className="row" style={{ gap: 8 }}>
                      <code
                        style={{
                          flex: 1,
                          fontFamily: 'var(--font-mono)',
                          fontSize: 16,
                          fontWeight: 700,
                          letterSpacing: '0.04em',
                          background: 'var(--surface-card)',
                          padding: '10px 14px',
                          borderRadius: 'var(--radius-md)',
                          color: '#0068ff',
                          textAlign: 'center',
                          border: '1px solid var(--border-base)',
                        }}
                      >
                        /lienket {linkCode}
                      </code>
                      <Button
                        variant="primary"
                        onClick={() => {
                          navigator.clipboard.writeText(`/lienket ${linkCode}`);
                          setCopiedCode(true);
                          toast.success('Đã sao chép cú pháp liên kết');
                          setTimeout(() => setCopiedCode(false), 2000);
                        }}
                        style={{ display: 'inline-flex', alignItems: 'center', gap: 5 }}
                      >
                        {copiedCode ? <Check size={14} /> : <Copy size={14} />}
                        <span>{copiedCode ? 'Đã chép' : 'Sao chép'}</span>
                      </Button>
                    </div>
                  </div>
                  <div>
                    <Button variant="ghost" size="sm" onClick={getCode} loading={pending}>
                      <RefreshCw size={13} /> Lấy mã mới khác
                    </Button>
                  </div>
                </>
              ) : (
                <>
                  <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0, lineHeight: 1.5 }}>
                    Kết nối tài khoản Zalo để nhận thông báo công việc, nhắc lịch giao ban, duyệt đơn nghỉ và tra cứu
                    dữ liệu thông minh cùng trợ lý AI 24/7.
                  </p>
                  <div>
                    <Button
                      variant="primary"
                      onClick={getCode}
                      loading={pending}
                      style={{
                        background: '#0068ff',
                        borderColor: '#0068ff',
                        display: 'inline-flex',
                        alignItems: 'center',
                        gap: 6,
                      }}
                    >
                      <MessageCircle size={15} />
                      <span>Lấy mã liên kết Zalo</span>
                    </Button>
                  </div>
                </>
              )}
            </CardBody>
          </Card>

          {/* Card: Đổi mật khẩu */}
          <Card id="password">
            <CardHeader>
              <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                <KeyRound size={17} style={{ color: 'var(--brand)' }} />
                <CardTitle>Đổi mật khẩu tài khoản</CardTitle>
              </div>
              <div className="card-subtitle">Nên cập nhật mật khẩu định kỳ để bảo vệ tài khoản</div>
            </CardHeader>
            <CardBody>
              {pwState.error && (
                <Alert tone="danger" icon={<AlertCircle />} className="mb-3">
                  {pwState.error}
                </Alert>
              )}
              {pwState.success && (
                <Alert tone="success" icon={<CheckCircle2 />} className="mb-3">
                  {pwState.success}
                </Alert>
              )}

              <form action={pwAction} className="stack" style={{ gap: 14 }}>
                <Field label="Mật khẩu hiện tại" required>
                  <div style={{ position: 'relative' }}>
                    <Input
                      type={showCurrentPw ? 'text' : 'password'}
                      name="currentPassword"
                      autoComplete="current-password"
                      required
                      placeholder="••••••••"
                      style={{ paddingRight: 40 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowCurrentPw(!showCurrentPw)}
                      style={{
                        position: 'absolute',
                        right: 10,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                      }}
                      tabIndex={-1}
                    >
                      {showCurrentPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </Field>

                <Field label="Mật khẩu mới" required hint="Tối thiểu 8 ký tự, gồm cả chữ và số">
                  <div style={{ position: 'relative' }}>
                    <Input
                      type={showNewPw ? 'text' : 'password'}
                      name="newPassword"
                      autoComplete="new-password"
                      required
                      placeholder="••••••••"
                      style={{ paddingRight: 40 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowNewPw(!showNewPw)}
                      style={{
                        position: 'absolute',
                        right: 10,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                      }}
                      tabIndex={-1}
                    >
                      {showNewPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </Field>

                <Field label="Xác nhận mật khẩu mới" required>
                  <div style={{ position: 'relative' }}>
                    <Input
                      type={showConfirmPw ? 'text' : 'password'}
                      name="confirmPassword"
                      autoComplete="new-password"
                      required
                      placeholder="••••••••"
                      style={{ paddingRight: 40 }}
                    />
                    <button
                      type="button"
                      onClick={() => setShowConfirmPw(!showConfirmPw)}
                      style={{
                        position: 'absolute',
                        right: 10,
                        top: '50%',
                        transform: 'translateY(-50%)',
                        background: 'none',
                        border: 'none',
                        cursor: 'pointer',
                        color: 'var(--text-muted)',
                      }}
                      tabIndex={-1}
                    >
                      {showConfirmPw ? <EyeOff size={16} /> : <Eye size={16} />}
                    </button>
                  </div>
                </Field>

                <div>
                  <Button
                    type="submit"
                    variant="primary"
                    loading={pwPending}
                    style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
                  >
                    <KeyRound size={15} />
                    <span>Cập nhật mật khẩu</span>
                  </Button>
                </div>
              </form>
            </CardBody>
          </Card>

          {/* Card: Google Single Sign-On (Nếu được cấu hình) */}
          {google && (google.enabled || google.email) && (
            <Card>
              <CardHeader style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
                  <svg width="18" height="18" viewBox="0 0 24 24">
                    <path
                      fill="#4285F4"
                      d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
                    />
                    <path
                      fill="#34A853"
                      d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
                    />
                    <path
                      fill="#FBBC05"
                      d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l2.85-2.22.81-.63z"
                    />
                    <path
                      fill="#EA4335"
                      d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.84c.87-2.6 3.3-4.52 6.16-4.52z"
                    />
                  </svg>
                  <CardTitle>Tài khoản Google SSO</CardTitle>
                </div>
                {google.email ? (
                  <Badge tone="success" dot>
                    Đã liên kết
                  </Badge>
                ) : (
                  <Badge tone="neutral">Chưa liên kết</Badge>
                )}
              </CardHeader>
              <CardBody className="stack" style={{ gap: 12 }}>
                <p style={{ fontSize: 13, color: 'var(--text-muted)', margin: 0 }}>
                  {google.email
                    ? `Đã liên kết với: ${google.email}. Bạn có thể dùng nút Đăng nhập bằng Google.`
                    : 'Xác nhận mật khẩu WorkHub hiện tại để liên kết Google và đăng nhập nhanh bằng 1 click.'}
                </p>

                {google.result === 'linked' && (
                  <Alert tone="success" icon={<CheckCircle2 />}>
                    Đã liên kết tài khoản Google thành công.
                  </Alert>
                )}
                {google.result === 'failed' && (
                  <Alert tone="danger" icon={<AlertCircle />}>
                    Không thể liên kết Google. Vui lòng thử lại.
                  </Alert>
                )}
                {googleState.error && (
                  <Alert tone="danger" icon={<AlertCircle />}>
                    {googleState.error}
                  </Alert>
                )}
                {googleState.success && (
                  <Alert tone="success" icon={<CheckCircle2 />}>
                    {googleState.success}
                  </Alert>
                )}

                <form action={googleAction} className="stack" style={{ gap: 10 }}>
                  <Field label="Mật khẩu hiện tại" required>
                    <Input
                      name="password"
                      type="password"
                      autoComplete="current-password"
                      required
                      placeholder="••••••••"
                    />
                  </Field>
                  <div>
                    <Button
                      type="submit"
                      variant={google.email ? 'danger-soft' : 'secondary'}
                      loading={googlePending}
                      size="sm"
                    >
                      {google.email ? 'Hủy liên kết Google' : 'Xác nhận liên kết Google'}
                    </Button>
                  </div>
                </form>
              </CardBody>
            </Card>
          )}
        </div>
      </div>

      {/* ── 4. Avatar Management Modal ──────────────────────────── */}
      <Modal
        open={avatarModalOpen}
        onClose={() => setAvatarModalOpen(false)}
        title="Cập nhật ảnh đại diện"
        description="Chọn ảnh chân dung rõ nét định dạng PNG, JPG hoặc WebP (tối đa 5MB)"
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, width: '100%' }}>
            <Button variant="secondary" onClick={() => setAvatarModalOpen(false)}>
              Đóng
            </Button>
          </div>
        }
      >
        <div className="stack" style={{ gap: 16 }}>
          {/* Avatar Preview Box */}
          <div
            style={{
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              padding: '20px 0',
              background: 'var(--surface-sunken)',
              borderRadius: 'var(--radius-lg, 12px)',
            }}
          >
            <div
              style={{
                width: 108,
                height: 108,
                borderRadius: '50%',
                border: '4px solid var(--surface-card)',
                boxShadow: '0 4px 16px rgba(0,0,0,0.12)',
                background: 'var(--surface-card)',
                overflow: 'hidden',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 36,
                fontWeight: 700,
                color: 'var(--brand)',
              }}
            >
              {avatarUploading ? (
                <Loader2 size={36} className="animate-spin" style={{ color: 'var(--brand)' }} />
              ) : employee.avatarUrl ? (
                <img
                  src={employee.avatarUrl}
                  alt={employee.fullName}
                  style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                />
              ) : (
                <span>{getInitials(employee.fullName)}</span>
              )}
            </div>

            <div style={{ marginTop: 10, fontSize: 14, fontWeight: 600, color: 'var(--text-strong)' }}>
              {employee.fullName}
            </div>
            <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>@{user.username}</div>
          </div>

          {/* Action Options */}
          <div className="stack" style={{ gap: 10 }}>
            {/* Option 1: Upload from computer */}
            <div
              onClick={() => !avatarUploading && fileInputRef.current?.click()}
              style={{
                border: '2px dashed var(--border-base)',
                borderRadius: 'var(--radius-lg, 12px)',
                padding: '16px 20px',
                cursor: avatarUploading ? 'not-allowed' : 'pointer',
                background: 'var(--surface-card)',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease, opacity 0.15s ease',
              }}
              onMouseEnter={(e) => {
                if (!avatarUploading) e.currentTarget.style.borderColor = 'var(--brand)';
              }}
              onMouseLeave={(e) => {
                if (!avatarUploading) e.currentTarget.style.borderColor = 'var(--border-base)';
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  background: 'var(--brand-soft)',
                  color: 'var(--brand)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <Upload size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-strong)' }}>
                  {avatarUploading ? 'Đang xử lý tải ảnh lên...' : 'Tải ảnh mới từ máy tính'}
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Hỗ trợ PNG, JPG, WebP dung lượng dưới 5MB
                </div>
              </div>
            </div>

            {/* Option 2: Pick from Media library */}
            <div
              onClick={() => {
                if (!avatarUploading) {
                  setMediaPickerOpen(true);
                }
              }}
              style={{
                border: '1px solid var(--border-base)',
                borderRadius: 'var(--radius-lg, 12px)',
                padding: '14px 20px',
                cursor: 'pointer',
                background: 'var(--surface-card)',
                display: 'flex',
                alignItems: 'center',
                gap: 14,
                transition: 'background-color 0.15s ease, border-color 0.15s ease, color 0.15s ease, box-shadow 0.15s ease, transform 0.15s ease, opacity 0.15s ease',
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.borderColor = 'var(--brand)';
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.borderColor = 'var(--border-base)';
              }}
            >
              <div
                style={{
                  width: 42,
                  height: 42,
                  borderRadius: 10,
                  background: 'rgba(124, 58, 237, 0.1)',
                  color: '#7c3aed',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  flexShrink: 0,
                }}
              >
                <FolderOpen size={20} />
              </div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-strong)' }}>
                  Chọn từ Thư viện Media
                </div>
                <div style={{ fontSize: 12, color: 'var(--text-muted)', marginTop: 2 }}>
                  Sử dụng các hình ảnh và logo đã có trong kho lưu trữ
                </div>
              </div>
            </div>

            {/* Option 3: Remove avatar (if present) */}
            {employee.avatarUrl && (
              <Button
                variant="danger-soft"
                onClick={handleRemoveAvatar}
                disabled={avatarUploading}
                style={{
                  width: '100%',
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  gap: 6,
                  padding: '10px 14px',
                }}
              >
                <Trash2 size={15} />
                <span>Xóa ảnh đại diện hiện tại</span>
              </Button>
            )}
          </div>
        </div>
      </Modal>

      {/* ── 5. Media Picker Modal ───────────────────────────────── */}
      <MediaPickerModal
        open={mediaPickerOpen}
        onClose={() => setMediaPickerOpen(false)}
        title="Chọn ảnh đại diện từ Thư viện"
        onSelect={handleSelectFromMedia}
      />

      {/* ── 6. Contact Edit Modal ───────────────────────────────── */}
      <Modal
        open={contactModalOpen}
        onClose={() => setContactModalOpen(false)}
        title="Cập nhật thông tin cá nhân"
        description="Thông tin này giúp đồng nghiệp và hệ thống liên hệ thuận tiện"
        size="md"
        footer={
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, width: '100%' }}>
            <Button variant="secondary" onClick={() => setContactModalOpen(false)} disabled={contactPending}>
              Hủy
            </Button>
            <Button
              variant="primary"
              onClick={handleSaveContact}
              loading={contactPending}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 6 }}
            >
              <Check size={15} />
              <span>Lưu thay đổi</span>
            </Button>
          </div>
        }
      >
        <form onSubmit={handleSaveContact} className="stack" style={{ gap: 14 }}>
          <Field label="Email liên hệ" hint="Nhận thông báo công việc qua email">
            <Input
              type="email"
              value={contactForm.email}
              onChange={(e) => setContactForm({ ...contactForm, email: e.target.value })}
              placeholder="example@workhub.local"
            />
          </Field>

          <Field label="Số điện thoại" hint="Số di động hoặc máy nhánh">
            <Input
              type="tel"
              value={contactForm.phone}
              onChange={(e) => setContactForm({ ...contactForm, phone: e.target.value })}
              placeholder="0912 345 678"
            />
          </Field>

          <div className="grid-2">
            <Field label="Giới tính">
              <select
                className="select"
                value={contactForm.gender}
                onChange={(e) => setContactForm({ ...contactForm, gender: e.target.value })}
                style={{ width: '100%', height: 38 }}
              >
                <option value="">-- Chọn giới tính --</option>
                <option value="MALE">Nam</option>
                <option value="FEMALE">Nữ</option>
                <option value="OTHER">Khác</option>
              </select>
            </Field>

            <Field label="Ngày sinh">
              <Input
                type="date"
                value={contactForm.dateOfBirth}
                onChange={(e) => setContactForm({ ...contactForm, dateOfBirth: e.target.value })}
              />
            </Field>
          </div>
        </form>
      </Modal>
    </div>
  );
}
