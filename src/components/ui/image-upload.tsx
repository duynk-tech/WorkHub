'use client';

import React, { useState, useRef } from 'react';
import { Upload, Trash2, Loader2, Image as ImageIcon, Star, Plus, Eye, RefreshCw, FolderOpen } from 'lucide-react';
import { Button, Input, Field } from '@/components/ui';
import { useToast } from '@/components/ui/toast';
import { MediaPickerModal } from '@/components/domain/media-picker-modal';

export interface ImageUploadProps {
  value?: string | null;
  onChange: (val: string) => void;
  label?: string;
  hint?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
  /** Ẩn thanh nhập đường dẫn text URL, chỉ hiển thị ảnh xem trước và nút thao tác (mặc định true) */
  hidePath?: boolean;
}

/** Component Upload 1 ảnh đơn với giao diện Dropzone hiện đại, ẩn path thô */
export function ImageUpload({
  value,
  onChange,
  label,
  hint,
  placeholder = 'https://... hoặc tải ảnh từ máy',
  disabled = false,
  className,
  hidePath = true,
}: ImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [showManualUrl, setShowManualUrl] = useState(false);
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
        throw new Error(data.error || 'Tải ảnh lên thất bại');
      }

      onChange(data.url);
      toast.success('Đã tải ảnh lên thành công');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Tải ảnh thất bại';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
      <input
        ref={fileInputRef}
        type="file"
        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
        style={{ display: 'none' }}
        onChange={handleFileChange}
      />

      {value ? (
        /* Giao diện đã có ảnh: Preview rõ nét, ẩn path, có nút thay ảnh và xoá */
        <div
          style={{
            position: 'relative',
            display: 'flex',
            alignItems: 'center',
            gap: 14,
            padding: 12,
            background: 'var(--surface-subtle)',
            borderRadius: 8,
            border: '1px solid var(--border)',
          }}
        >
          <div
            style={{
              width: 72,
              height: 72,
              borderRadius: 6,
              border: '1px solid var(--border-subtle)',
              background: '#ffffff',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              overflow: 'hidden',
              flexShrink: 0,
            }}
          >
            <img
              src={value}
              alt="Ảnh xem trước"
              style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }}
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />
          </div>

          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>
              Ảnh thiết bị đã tải lên
            </div>
            <div style={{ fontSize: 11.5, color: 'var(--text-muted)', marginTop: 2 }}>
              Đã lưu trên máy chủ an toàn
            </div>
            <div style={{ display: 'flex', gap: 8, marginTop: 8, flexWrap: 'wrap' }}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={disabled || uploading}
                onClick={() => fileInputRef.current?.click()}
                style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                {uploading ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
                <span>Đổi ảnh khác</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={disabled || uploading}
                onClick={() => setPickerOpen(true)}
                style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}
              >
                <FolderOpen size={13} />
                <span>Từ thư viện</span>
              </Button>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                disabled={disabled || uploading}
                onClick={() => onChange('')}
                style={{ fontSize: 11.5, color: '#dc2626', display: 'inline-flex', alignItems: 'center', gap: 4 }}
              >
                <Trash2 size={13} />
                <span>Xóa ảnh</span>
              </Button>
            </div>
          </div>
        </div>
      ) : (
        /* Giao diện chưa có ảnh: Dropzone sạch sẽ */
        <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
          <div
            onClick={() => !disabled && !uploading && fileInputRef.current?.click()}
            style={{
              border: '2px dashed var(--border)',
              borderRadius: 8,
              padding: '20px 16px',
              textAlign: 'center',
              background: 'var(--surface-subtle)',
              cursor: disabled || uploading ? 'not-allowed' : 'pointer',
              transition: 'border-color 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!disabled && !uploading) e.currentTarget.style.borderColor = 'var(--primary)';
            }}
            onMouseLeave={(e) => {
              if (!disabled && !uploading) e.currentTarget.style.borderColor = 'var(--border)';
            }}
          >
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6 }}>
              {uploading ? (
                <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary)' }} />
              ) : (
                <Upload size={24} style={{ color: 'var(--primary)' }} />
              )}
              <div style={{ fontSize: 13, fontWeight: 600, color: 'var(--text-strong)' }}>
                {uploading ? 'Đang tải ảnh lên máy chủ...' : 'Bấm để tải ảnh lên từ máy'}
              </div>
              <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
                Định dạng PNG, JPG, WebP (Tối đa 5MB)
              </div>
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'center' }}>
            <button
              type="button"
              disabled={disabled || uploading}
              onClick={() => setPickerOpen(true)}
              style={{
                background: 'none',
                border: 'none',
                fontSize: 12,
                color: 'var(--primary)',
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
                padding: '4px 8px',
              }}
            >
              <FolderOpen size={14} />
              <span>Hoặc chọn ảnh có sẵn từ Thư viện Media</span>
            </button>
          </div>
        </div>
      )}

      {/* Modal chọn từ Thư viện Media */}
      <MediaPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        onSelect={(url) => onChange(url as string)}
      />

      {/* Tùy chọn mở nhập link thủ công nếu không hidePath hoặc người dùng chủ động mở */}
      {!hidePath || showManualUrl ? (
        <div style={{ display: 'flex', gap: 6, alignItems: 'center', marginTop: 4 }}>
          <Input
            value={value ?? ''}
            placeholder={placeholder}
            onChange={(e) => onChange(e.target.value)}
            disabled={disabled || uploading}
            style={{ fontSize: 12 }}
          />
          {hidePath && (
            <Button
              type="button"
              variant="secondary"
              size="sm"
              onClick={() => setShowManualUrl(false)}
            >
              Đóng
            </Button>
          )}
        </div>
      ) : (
        <div style={{ textAlign: 'right' }}>
          <button
            type="button"
            onClick={() => setShowManualUrl(true)}
            style={{
              background: 'none',
              border: 'none',
              fontSize: 11,
              color: 'var(--text-muted)',
              cursor: 'pointer',
              textDecoration: 'underline',
              padding: 0,
            }}
          >
            Nhập đường link URL ảnh trực tiếp
          </button>
        </div>
      )}
    </div>
  );

  if (label) {
    return (
      <Field label={label} hint={hint} className={className}>
        {content}
      </Field>
    );
  }

  return content;
}

export interface MultiImageUploadProps {
  values?: string[];
  onChange: (urls: string[]) => void;
  maxFiles?: number;
  label?: string;
  hint?: string;
  disabled?: boolean;
  className?: string;
}

/** Component Upload nhiều ảnh (Album / Gallery) ẩn link path, có nút đặt ảnh chính và xóa */
export function MultiImageUpload({
  values = [],
  onChange,
  maxFiles = 8,
  label,
  hint,
  disabled = false,
  className,
}: MultiImageUploadProps) {
  const [uploading, setUploading] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const remainingSlots = maxFiles - values.length;
    if (remainingSlots <= 0) {
      toast.error(`Đã đạt giới hạn tối đa ${maxFiles} ảnh`);
      return;
    }

    const filesToUpload = Array.from(files).slice(0, remainingSlots);
    setUploading(true);

    const newUrls: string[] = [];
    try {
      for (const file of filesToUpload) {
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`Ảnh "${file.name}" quá lớn (tối đa 5MB)`);
          continue;
        }

        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();
        if (res.ok && data.ok && data.url) {
          newUrls.push(data.url);
        }
      }

      if (newUrls.length > 0) {
        onChange([...values, ...newUrls]);
        toast.success(`Đã tải thêm ${newUrls.length} ảnh vào album`);
      }
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Tải ảnh thất bại';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const handleMakePrimary = (index: number) => {
    if (index === 0) return;
    const target = values[index];
    const rest = values.filter((_, idx) => idx !== index);
    onChange([target, ...rest]);
    toast.success('Đã đặt làm ảnh đại diện chính');
  };

  const handleRemove = (index: number) => {
    const updated = values.filter((_, idx) => idx !== index);
    onChange(updated);
  };

  const content = (
    <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <input
        ref={fileInputRef}
        type="file"
        multiple
        accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
        style={{ display: 'none' }}
        onChange={(e) => {
          handleFiles(e.target.files);
          e.target.value = '';
        }}
      />

      {/* Grid danh sách ảnh */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(105px, 1fr))',
          gap: 10,
        }}
      >
        {values.map((url, idx) => (
          <div
            key={`${url}-${idx}`}
            style={{
              position: 'relative',
              height: 105,
              borderRadius: 8,
              border: idx === 0 ? '2px solid var(--primary)' : '1px solid var(--border)',
              background: 'var(--surface-subtle)',
              overflow: 'hidden',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              boxShadow: '0 1px 3px rgba(0,0,0,0.05)',
            }}
          >
            <img
              src={url}
              alt={`Ảnh #${idx + 1}`}
              style={{ width: '100%', height: '100%', objectFit: 'cover' }}
              onError={(e) => {
                (e.target as HTMLElement).style.display = 'none';
              }}
            />

            {/* Badge ảnh chính */}
            {idx === 0 && (
              <span
                style={{
                  position: 'absolute',
                  top: 4,
                  left: 4,
                  background: 'var(--primary)',
                  color: '#ffffff',
                  fontSize: 10,
                  fontWeight: 700,
                  padding: '2px 5px',
                  borderRadius: 4,
                  display: 'inline-flex',
                  alignItems: 'center',
                  gap: 3,
                  boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                }}
              >
                <Star size={10} fill="#ffffff" /> Chính
              </span>
            )}

            {/* Action buttons overlay */}
            <div
              style={{
                position: 'absolute',
                bottom: 0,
                left: 0,
                right: 0,
                background: 'linear-gradient(to top, rgba(0,0,0,0.75), transparent)',
                padding: '4px 6px',
                display: 'flex',
                justifyContent: 'space-between',
                alignItems: 'center',
              }}
            >
              {idx !== 0 ? (
                <button
                  type="button"
                  title="Đặt làm ảnh chính"
                  onClick={() => handleMakePrimary(idx)}
                  style={{
                    background: 'none',
                    border: 'none',
                    color: '#facc15',
                    cursor: 'pointer',
                    padding: 2,
                    display: 'flex',
                    alignItems: 'center',
                  }}
                >
                  <Star size={14} />
                </button>
              ) : (
                <span />
              )}

              <button
                type="button"
                title="Xóa ảnh này"
                onClick={() => handleRemove(idx)}
                style={{
                  background: 'none',
                  border: 'none',
                  color: '#f87171',
                  cursor: 'pointer',
                  padding: 2,
                  display: 'flex',
                  alignItems: 'center',
                }}
              >
                <Trash2 size={14} />
              </button>
            </div>
          </div>
        ))}

        {/* Nút thêm ảnh */}
        {values.length < maxFiles && (
          <button
            type="button"
            disabled={disabled || uploading}
            onClick={() => fileInputRef.current?.click()}
            style={{
              height: 105,
              borderRadius: 8,
              border: '2px dashed var(--border)',
              background: 'var(--surface-subtle)',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              cursor: disabled || uploading ? 'not-allowed' : 'pointer',
              color: 'var(--text-muted)',
              fontSize: 11.5,
              transition: 'all 0.15s ease',
            }}
            onMouseEnter={(e) => {
              if (!disabled && !uploading) {
                e.currentTarget.style.borderColor = 'var(--primary)';
                e.currentTarget.style.color = 'var(--primary)';
              }
            }}
            onMouseLeave={(e) => {
              if (!disabled && !uploading) {
                e.currentTarget.style.borderColor = 'var(--border)';
                e.currentTarget.style.color = 'var(--text-muted)';
              }
            }}
          >
            {uploading ? (
              <Loader2 size={18} className="animate-spin" style={{ color: 'var(--primary)' }} />
            ) : (
              <Plus size={18} />
            )}
            <span>{uploading ? 'Đang tải...' : 'Thêm ảnh'}</span>
          </button>
        )}
      </div>

      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
        <div style={{ fontSize: 11.5, color: 'var(--text-muted)' }}>
          💡 Có thể chọn nhiều ảnh cùng lúc (tối đa {maxFiles} ảnh). Ảnh đầu tiên sẽ tự động làm <strong>ảnh đại diện chính</strong>.
        </div>
        <Button
          type="button"
          variant="secondary"
          size="sm"
          disabled={disabled || uploading || values.length >= maxFiles}
          onClick={() => setPickerOpen(true)}
          style={{ fontSize: 11.5, display: 'inline-flex', alignItems: 'center', gap: 5 }}
        >
          <FolderOpen size={13} />
          <span>Chọn từ Thư viện Media</span>
        </Button>
      </div>

      <MediaPickerModal
        open={pickerOpen}
        onClose={() => setPickerOpen(false)}
        multiple
        title="Chọn ảnh từ Thư viện vào Album"
        onSelect={(selected) => {
          const newUrls = Array.isArray(selected) ? selected : [selected];
          const remaining = maxFiles - values.length;
          const toAdd = newUrls.slice(0, remaining);
          onChange([...values, ...toAdd]);
        }}
      />
    </div>
  );

  if (label) {
    return (
      <Field label={label} hint={hint} className={className}>
        {content}
      </Field>
    );
  }

  return content;
}
