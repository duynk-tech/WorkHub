'use client';

import React, { useState, useRef } from 'react';
import { Upload, Trash2, Loader2, Image as ImageIcon } from 'lucide-react';
import { Button, Input, Field } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

export interface ImageUploadProps {
  value?: string | null;
  onChange: (val: string) => void;
  label?: string;
  hint?: string;
  placeholder?: string;
  disabled?: boolean;
  className?: string;
}

export function ImageUpload({
  value,
  onChange,
  label,
  hint,
  placeholder = 'https://... hoặc tải ảnh từ máy',
  disabled = false,
  className,
}: ImageUploadProps) {
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
        throw new Error(data.error || 'Tải ảnh lên thất bại');
      }

      onChange(data.url);
      toast.success('Đã tải ảnh lên máy chủ thành công');
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Tải ảnh thất bại';
      toast.error(msg);
    } finally {
      setUploading(false);
    }
  };

  const content = (
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
            value={value ?? ''}
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
              <Loader2 size={14} className="animate-spin" />
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
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: 10,
            marginTop: 2,
            padding: '6px 10px',
            background: 'var(--surface-sunken)',
            borderRadius: 'var(--radius-sm, 6px)',
            border: '1px solid var(--border-subtle)',
          }}
        >
          <div
            style={{
              width: 48,
              height: 48,
              borderRadius: 6,
              border: '1px solid var(--border-subtle)',
              background: '#fff',
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
          <div style={{ fontSize: 12, color: 'var(--text-muted)', overflow: 'hidden', flex: 1 }}>
            <div style={{ fontWeight: 500, color: 'var(--text-strong)', marginBottom: 2 }}>
              Xem trước ảnh
            </div>
            <code style={{ fontSize: 11, background: 'rgba(0,0,0,0.05)', padding: '2px 6px', borderRadius: 4, display: 'inline-block', maxWidth: '100%', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
              {value}
            </code>
          </div>
        </div>
      ) : null}
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
