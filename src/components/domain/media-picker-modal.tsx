'use client';

import React, { useState, useEffect } from 'react';
import {
  Search,
  Upload,
  Check,
  Loader2,
  Image as ImageIcon,
  FolderOpen,
  X,
  RefreshCw,
} from 'lucide-react';
import { Modal } from '@/components/ui/modal';
import { Button, Input, Card } from '@/components/ui';
import { useToast } from '@/components/ui/toast';

interface MediaFileItem {
  name: string;
  url: string;
  size: number;
  createdAt: string;
  extension: string;
}

export interface MediaPickerModalProps {
  open: boolean;
  onClose: () => void;
  onSelect: (url: string | string[]) => void;
  multiple?: boolean;
  title?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function MediaPickerModal({
  open,
  onClose,
  onSelect,
  multiple = false,
  title = 'Chọn ảnh từ Thư viện Media',
}: MediaPickerModalProps) {
  const [files, setFiles] = useState<MediaFileItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [selectedUrls, setSelectedUrls] = useState<string[]>([]);
  const [uploading, setUploading] = useState(false);
  const fileInputRef = React.useRef<HTMLInputElement>(null);
  const toast = useToast();

  const loadMedia = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/media');
      const data = await res.json();
      if (res.ok && data.ok) {
        setFiles(data.files || []);
      } else {
        toast.error(data.error || 'Không thể tải danh sách media');
      }
    } catch {
      toast.error('Lỗi kết nối khi tải danh sách media');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (open) {
      loadMedia();
      setSelectedUrls([]);
      setSearch('');
    }
  }, [open]);

  const handleUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const uploadedFiles = e.target.files;
    if (!uploadedFiles || uploadedFiles.length === 0) return;

    setUploading(true);
    const newSelected: string[] = [];

    try {
      for (const file of Array.from(uploadedFiles)) {
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
          newSelected.push(data.url);
        }
      }

      await loadMedia();

      if (newSelected.length > 0) {
        toast.success(`Đã tải lên ${newSelected.length} tệp mới`);
        if (!multiple) {
          onSelect(newSelected[0]);
          onClose();
        } else {
          setSelectedUrls((prev) => [...prev, ...newSelected]);
        }
      }
    } catch {
      toast.error('Tải tệp lên thất bại');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  const toggleSelect = (url: string) => {
    if (!multiple) {
      onSelect(url);
      onClose();
      return;
    }

    setSelectedUrls((prev) =>
      prev.includes(url) ? prev.filter((u) => u !== url) : [...prev, url]
    );
  };

  const handleConfirmMulti = () => {
    if (selectedUrls.length === 0) {
      toast.error('Vui lòng chọn ít nhất 1 ảnh');
      return;
    }
    onSelect(selectedUrls);
    onClose();
  };

  const filtered = files.filter((f) =>
    f.name.toLowerCase().includes(search.toLowerCase().trim())
  );

  return (
    <Modal
      open={open}
      onClose={onClose}
      title={title}
      description="Xem và tái sử dụng hình ảnh thiết bị, linh kiện đã có sẵn trên máy chủ"
      size="lg"
      footer={
        <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', width: '100%' }}>
          <div style={{ fontSize: 12, color: 'var(--text-muted)' }}>
            {multiple ? `Đã chọn: ${selectedUrls.length} ảnh` : 'Click vào ảnh để chọn ngay'}
          </div>
          <div style={{ display: 'flex', gap: 8 }}>
            <Button variant="secondary" onClick={onClose}>
              Đóng
            </Button>
            {multiple && (
              <Button
                variant="primary"
                onClick={handleConfirmMulti}
                disabled={selectedUrls.length === 0}
              >
                Xác nhận chọn ({selectedUrls.length})
              </Button>
            )}
          </div>
        </div>
      }
    >
      <div style={{ display: 'flex', flexDirection: 'column', gap: 12 }}>
        {/* Thanh công cụ: Tìm kiếm + Tải lên mới */}
        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
          <div style={{ flex: 1, minWidth: 200, position: 'relative' }}>
            <Input
              placeholder="Tìm kiếm theo tên tệp..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              style={{ paddingLeft: 30, fontSize: 12.5 }}
            />
            <Search
              size={15}
              style={{
                position: 'absolute',
                left: 9,
                top: '50%',
                transform: 'translateY(-50%)',
                color: 'var(--text-muted)',
              }}
            />
          </div>

          <input
            ref={fileInputRef}
            type="file"
            multiple={multiple}
            accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
            style={{ display: 'none' }}
            onChange={handleUpload}
          />

          <Button
            type="button"
            variant="secondary"
            size="sm"
            onClick={() => fileInputRef.current?.click()}
            disabled={uploading}
            style={{ display: 'inline-flex', alignItems: 'center', gap: 6, fontSize: 12 }}
          >
            {uploading ? (
              <Loader2 size={14} className="animate-spin" />
            ) : (
              <Upload size={14} />
            )}
            <span>{uploading ? 'Đang tải...' : 'Tải ảnh mới'}</span>
          </Button>

          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={loadMedia}
            disabled={loading}
            title="Tải lại danh sách"
          >
            <RefreshCw size={14} className={loading ? 'animate-spin' : ''} />
          </Button>
        </div>

        {/* Lưới ảnh */}
        {loading ? (
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', height: 260 }}>
            <Loader2 size={24} className="animate-spin" style={{ color: 'var(--primary)' }} />
          </div>
        ) : filtered.length === 0 ? (
          <div
            style={{
              padding: '48px 16px',
              textAlign: 'center',
              border: '1px dashed var(--border)',
              borderRadius: 8,
              color: 'var(--text-muted)',
              fontSize: 12.5,
            }}
          >
            <FolderOpen size={36} style={{ margin: '0 auto 8px', opacity: 0.5 }} />
            <div>{search ? 'Không tìm thấy tệp nào phù hợp' : 'Thư viện media chưa có tệp nào'}</div>
            <div style={{ marginTop: 8 }}>
              <Button
                type="button"
                variant="secondary"
                size="sm"
                onClick={() => fileInputRef.current?.click()}
                style={{ fontSize: 12 }}
              >
                <Upload size={13} style={{ marginRight: 5 }} /> Tải ảnh đầu tiên lên
              </Button>
            </div>
          </div>
        ) : (
          <div
            style={{
              display: 'grid',
              gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))',
              gap: 10,
              maxHeight: '52vh',
              overflowY: 'auto',
              padding: 2,
            }}
          >
            {filtered.map((item) => {
              const isSelected = selectedUrls.includes(item.url);
              return (
                <div
                  key={item.name}
                  onClick={() => toggleSelect(item.url)}
                  style={{
                    position: 'relative',
                    height: 110,
                    borderRadius: 8,
                    border: isSelected
                      ? '2px solid var(--primary)'
                      : '1px solid var(--border)',
                    background: 'var(--surface-subtle)',
                    overflow: 'hidden',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                  onMouseEnter={(e) => {
                    if (!isSelected) e.currentTarget.style.borderColor = 'var(--primary)';
                  }}
                  onMouseLeave={(e) => {
                    if (!isSelected) e.currentTarget.style.borderColor = 'var(--border)';
                  }}
                >
                  <img
                    src={item.url}
                    alt={item.name}
                    style={{ width: '100%', height: '100%', objectFit: 'cover' }}
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />

                  {/* Checkbox badge khi chọn */}
                  {isSelected && (
                    <div
                      style={{
                        position: 'absolute',
                        top: 4,
                        right: 4,
                        width: 20,
                        height: 20,
                        borderRadius: '50%',
                        background: 'var(--primary)',
                        color: '#ffffff',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        boxShadow: '0 2px 4px rgba(0,0,0,0.2)',
                      }}
                    >
                      <Check size={13} strokeWidth={3} />
                    </div>
                  )}

                  {/* Tên tệp & dung lượng overlay */}
                  <div
                    style={{
                      position: 'absolute',
                      bottom: 0,
                      left: 0,
                      right: 0,
                      background: 'linear-gradient(to top, rgba(0,0,0,0.85) 0%, rgba(0,0,0,0.4) 70%, transparent 100%)',
                      padding: '4px 6px',
                      color: '#ffffff',
                      fontSize: 10,
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                      whiteSpace: 'nowrap',
                    }}
                  >
                    <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', fontWeight: 500 }}>
                      {item.name}
                    </div>
                    <div style={{ color: 'rgba(255,255,255,0.75)', fontSize: 9.5 }}>
                      {formatBytes(item.size)}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </Modal>
  );
}
