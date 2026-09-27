'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Upload,
  Search,
  Trash2,
  Copy,
  ExternalLink,
  Eye,
  Download,
  FolderOpen,
  HardDrive,
  FileImage,
  RefreshCw,
  Loader2,
  Check,
  CheckCircle2,
  AlertTriangle,
} from 'lucide-react';
import {
  Button,
  Card,
  Input,
  Select,
  Badge,
  PageHeader,
  ConfirmDialog,
} from '@/components/ui';
import { Modal } from '@/components/ui/modal';
import { useToast } from '@/components/ui/toast';
import { fmtDate } from '@/lib/date';

interface MediaItem {
  name: string;
  url: string;
  size: number;
  createdAt: string;
  extension: string;
}

function formatBytes(bytes: number): string {
  if (!bytes || bytes === 0) return '0 B';
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export function MediaScreen() {
  const [files, setFiles] = useState<MediaItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [uploading, setUploading] = useState(false);
  const [search, setSearch] = useState('');
  const [filterExt, setFilterExt] = useState('ALL');
  const [sortBy, setSortBy] = useState<'NEWEST' | 'OLDEST' | 'SIZE_DESC' | 'SIZE_ASC'>('NEWEST');
  const [activePreview, setActivePreview] = useState<MediaItem | null>(null);
  const [fileToDelete, setFileToDelete] = useState<MediaItem | null>(null);
  const [isDeleting, setIsDeleting] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState<string | null>(null);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const toast = useToast();

  const fetchMedia = async () => {
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
    fetchMedia();
  }, []);

  const handleUploadFiles = async (selectedFiles: FileList | null) => {
    if (!selectedFiles || selectedFiles.length === 0) return;

    setUploading(true);
    let successCount = 0;
    try {
      for (const file of Array.from(selectedFiles)) {
        if (file.size > 5 * 1024 * 1024) {
          toast.error(`Tệp "${file.name}" quá lớn (tối đa 5MB)`);
          continue;
        }

        const formData = new FormData();
        formData.append('file', file);

        const res = await fetch('/api/upload', {
          method: 'POST',
          body: formData,
        });

        const data = await res.json();
        if (res.ok && data.ok) {
          successCount++;
        } else {
          toast.error(data.error || `Tải tệp "${file.name}" thất bại`);
        }
      }

      if (successCount > 0) {
        toast.success(`Đã tải lên thành công ${successCount} tệp`);
        await fetchMedia();
      }
    } catch {
      toast.error('Có lỗi xảy ra trong quá trình tải lên');
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = '';
    }
  };

  const handleCopyLink = async (url: string) => {
    try {
      const fullUrl = `${window.location.origin}${url}`;
      await navigator.clipboard.writeText(fullUrl);
      setCopiedUrl(url);
      toast.success('Đã sao chép đường dẫn hình ảnh');
      setTimeout(() => setCopiedUrl(null), 2500);
    } catch {
      toast.error('Không thể sao chép liên kết');
    }
  };

  const confirmDelete = async () => {
    if (!fileToDelete) return;

    setIsDeleting(true);
    try {
      const res = await fetch(`/api/media?filename=${encodeURIComponent(fileToDelete.name)}`, {
        method: 'DELETE',
      });
      const data = await res.json();

      if (res.ok && data.ok) {
        toast.success(data.message || 'Đã xóa tệp thành công');
        setFiles((prev) => prev.filter((f) => f.name !== fileToDelete.name));
        if (activePreview?.name === fileToDelete.name) setActivePreview(null);
        setFileToDelete(null);
      } else {
        toast.error(data.error || 'Xóa tệp thất bại');
      }
    } catch {
      toast.error('Lỗi kết nối khi xóa tệp');
    } finally {
      setIsDeleting(false);
    }
  };

  // Thống kê
  const totalFiles = files.length;
  const totalBytes = files.reduce((acc, f) => acc + f.size, 0);

  // Lọc và sắp xếp
  const filteredFiles = files
    .filter((f) => {
      const matchSearch = f.name.toLowerCase().includes(search.toLowerCase().trim());
      const matchExt =
        filterExt === 'ALL'
          ? true
          : filterExt === 'IMAGE'
          ? ['.png', '.jpg', '.jpeg', '.webp'].includes(f.extension)
          : f.extension === filterExt.toLowerCase();
      return matchSearch && matchExt;
    })
    .sort((a, b) => {
      if (sortBy === 'NEWEST') {
        return new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime();
      }
      if (sortBy === 'OLDEST') {
        return new Date(a.createdAt).getTime() - new Date(b.createdAt).getTime();
      }
      if (sortBy === 'SIZE_DESC') {
        return b.size - a.size;
      }
      if (sortBy === 'SIZE_ASC') {
        return a.size - b.size;
      }
      return 0;
    });

  return (
    <div className="space-y-6">
      {/* Page Header */}
      <PageHeader
        title="Thư viện Media & Tệp tải lên"
        description="Quản lý tập trung hình ảnh thiết bị, linh kiện và tệp tin trên máy chủ"
        actions={
          <div className="flex items-center gap-2">
            <input
              ref={fileInputRef}
              type="file"
              multiple
              accept="image/png,image/jpeg,image/webp,image/svg+xml,image/gif"
              className="hidden"
              onChange={(e) => handleUploadFiles(e.target.files)}
            />
            <Button
              variant="secondary"
              onClick={fetchMedia}
              disabled={loading}
              className="flex items-center gap-1.5"
              title="Làm mới danh sách"
            >
              <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
              Làm mới
            </Button>
            <Button
              variant="primary"
              onClick={() => fileInputRef.current?.click()}
              disabled={uploading}
              className="flex items-center gap-1.5"
            >
              {uploading ? (
                <Loader2 className="w-4 h-4 animate-spin" />
              ) : (
                <Upload className="w-4 h-4" />
              )}
              <span>Tải tệp mới lên</span>
            </Button>
          </div>
        }
      />

      {/* Thống kê dung lượng */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className="p-4 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-lg bg-indigo-50 dark:bg-indigo-950/50 text-indigo-600 dark:text-indigo-400 flex items-center justify-center shrink-0">
            <FileImage className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Tổng số tệp media</div>
            <div className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
              {totalFiles} <span className="text-xs font-normal text-slate-400">tệp</span>
            </div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-lg bg-emerald-50 dark:bg-emerald-950/50 text-emerald-600 dark:text-emerald-400 flex items-center justify-center shrink-0">
            <HardDrive className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Dung lượng ổ đĩa sử dụng</div>
            <div className="text-xl font-bold text-slate-900 dark:text-white mt-0.5">
              {formatBytes(totalBytes)}
            </div>
          </div>
        </Card>

        <Card className="p-4 flex items-center gap-3.5">
          <div className="w-11 h-11 rounded-lg bg-amber-50 dark:bg-amber-950/50 text-amber-600 dark:text-amber-400 flex items-center justify-center shrink-0">
            <FolderOpen className="w-6 h-6" />
          </div>
          <div>
            <div className="text-xs text-slate-500 font-medium">Thư mục lưu trữ an toàn</div>
            <div className="text-sm font-semibold font-mono text-slate-700 dark:text-slate-300 mt-0.5 truncate">
              /public/uploads
            </div>
          </div>
        </Card>
      </div>

      {/* Dropzone Kéo-Thả Tải Lên Nhanh */}
      <Card
        className="p-6 border-2 border-dashed border-slate-200 dark:border-slate-800 hover:border-indigo-400 dark:hover:border-indigo-600 transition cursor-pointer text-center bg-slate-50/50 dark:bg-slate-900/50"
        onClick={() => !uploading && fileInputRef.current?.click()}
        onDragOver={(e) => {
          e.preventDefault();
          e.stopPropagation();
        }}
        onDrop={(e) => {
          e.preventDefault();
          e.stopPropagation();
          handleUploadFiles(e.dataTransfer.files);
        }}
      >
        <div className="flex flex-col items-center justify-center gap-2">
          {uploading ? (
            <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
          ) : (
            <Upload className="w-8 h-8 text-indigo-600" />
          )}
          <div className="text-sm font-semibold text-slate-800 dark:text-slate-200">
            {uploading ? 'Đang tải tệp lên máy chủ...' : 'Kéo thả tệp vào đây hoặc bấm để chọn tệp'}
          </div>
          <p className="text-xs text-slate-500">
            Hỗ trợ PNG, JPG, WebP, SVG, GIF (Tối đa 5MB/tệp). Có thể chọn nhiều tệp cùng lúc.
          </p>
        </div>
      </Card>

      {/* Bộ lọc & Tìm kiếm */}
      <div className="flex flex-col sm:flex-row gap-3 items-center justify-between">
        <div className="w-full sm:w-80 relative">
          <Input
            placeholder="Tìm kiếm theo tên tệp..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-9 text-sm"
          />
          <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
        </div>

        <div className="flex items-center gap-3 w-full sm:w-auto">
          <Select
            value={filterExt}
            onChange={(e) => setFilterExt(e.target.value)}
            className="text-xs sm:text-sm"
          >
            <option value="ALL">Tất cả định dạng</option>
            <option value="IMAGE">Ảnh thông dụng (.png, .jpg, .webp)</option>
            <option value=".png">Chỉ PNG (.png)</option>
            <option value=".jpg">Chỉ JPG (.jpg)</option>
            <option value=".webp">Chỉ WebP (.webp)</option>
            <option value=".svg">Chỉ SVG (.svg)</option>
          </Select>

          <Select
            value={sortBy}
            onChange={(e) => setSortBy(e.target.value as any)}
            className="text-xs sm:text-sm"
          >
            <option value="NEWEST">Mới nhất trước</option>
            <option value="OLDEST">Cũ nhất trước</option>
            <option value="SIZE_DESC">Dung lượng lớn nhất</option>
            <option value="SIZE_ASC">Dung lượng nhỏ nhất</option>
          </Select>
        </div>
      </div>

      {/* Lưới danh sách tệp Media */}
      {loading ? (
        <div className="flex items-center justify-center h-64">
          <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
        </div>
      ) : filteredFiles.length === 0 ? (
        <Card className="p-12 text-center text-slate-500 space-y-3">
          <FileImage className="w-12 h-12 mx-auto text-slate-300 dark:text-slate-600" />
          <div className="text-base font-semibold text-slate-700 dark:text-slate-300">
            {search ? 'Không tìm thấy tệp nào phù hợp' : 'Thư viện media chưa có tệp nào'}
          </div>
          <p className="text-xs text-slate-400">
            {search ? 'Thử tìm kiếm với từ khóa khác' : 'Bắt đầu tải lên hình ảnh thiết bị hoặc linh kiện'}
          </p>
        </Card>
      ) : (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 gap-4">
          {filteredFiles.map((file) => {
            const isCopied = copiedUrl === file.url;

            return (
              <Card
                key={file.name}
                className="overflow-hidden group hover:shadow-md hover:border-slate-300 dark:hover:border-slate-700 transition flex flex-col justify-between"
              >
                {/* Thumbnail */}
                <div
                  className="relative aspect-square bg-slate-100 dark:bg-slate-800 flex items-center justify-center p-2 cursor-pointer overflow-hidden"
                  onClick={() => setActivePreview(file)}
                  title="Bấm để xem ảnh lớn"
                >
                  <img
                    src={file.url}
                    alt={file.name}
                    className="w-full h-full object-contain group-hover:scale-105 transition duration-200"
                    onError={(e) => {
                      (e.target as HTMLElement).style.display = 'none';
                    }}
                  />

                  {/* Hover Overlay */}
                  <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition flex items-center justify-center gap-2">
                    <button
                      type="button"
                      className="p-1.5 bg-white text-slate-800 rounded-full shadow hover:bg-slate-100 transition"
                      title="Xem ảnh lớn"
                      onClick={(e) => {
                        e.stopPropagation();
                        setActivePreview(file);
                      }}
                    >
                      <Eye className="w-4 h-4" />
                    </button>
                    <button
                      type="button"
                      className="p-1.5 bg-white text-slate-800 rounded-full shadow hover:bg-slate-100 transition"
                      title="Sao chép link"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleCopyLink(file.url);
                      }}
                    >
                      {isCopied ? <Check className="w-4 h-4 text-emerald-600" /> : <Copy className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                {/* Info & Footer */}
                <div className="p-2.5 space-y-1.5 border-t border-slate-100 dark:border-slate-800 bg-white dark:bg-slate-900">
                  <div
                    className="text-xs font-semibold text-slate-800 dark:text-slate-200 truncate"
                    title={file.name}
                  >
                    {file.name}
                  </div>
                  <div className="flex items-center justify-between text-[11px] text-slate-400">
                    <span>{formatBytes(file.size)}</span>
                    <span className="uppercase text-[10px] font-bold bg-slate-100 dark:bg-slate-800 px-1.5 py-0.5 rounded text-slate-600 dark:text-slate-400">
                      {file.extension.replace('.', '')}
                    </span>
                  </div>

                  <div className="flex items-center justify-between pt-1 border-t border-slate-100 dark:border-slate-800">
                    <span className="text-[10px] text-slate-400">
                      {fmtDate(file.createdAt)}
                    </span>
                    <div className="flex items-center gap-1">
                      <a
                        href={file.url}
                        download={file.name}
                        className="p-1 text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 transition"
                        title="Tải về máy"
                      >
                        <Download className="w-3.5 h-3.5" />
                      </a>
                      <button
                        type="button"
                        onClick={() => setFileToDelete(file)}
                        className="p-1 text-slate-400 hover:text-rose-600 transition"
                        title="Xóa tệp này"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>
                  </div>
                </div>
              </Card>
            );
          })}
        </div>
      )}

      {/* Modal Xem ảnh kích thước lớn (Lightbox) */}
      {activePreview && (
        <Modal
          open={!!activePreview}
          onClose={() => setActivePreview(null)}
          title={`Chi tiết tệp: ${activePreview.name}`}
          size="lg"
          footer={
            <div className="flex items-center justify-between w-full">
              <div className="text-xs text-slate-500">
                Dung lượng: <strong>{formatBytes(activePreview.size)}</strong> • Ngày tạo: <strong>{fmtDate(activePreview.createdAt)}</strong>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant="secondary"
                  size="sm"
                  onClick={() => handleCopyLink(activePreview.url)}
                  className="flex items-center gap-1.5 text-xs"
                >
                  <Copy className="w-3.5 h-3.5" />
                  Sao chép liên kết
                </Button>
                <a
                  href={activePreview.url}
                  download={activePreview.name}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg text-xs font-semibold bg-indigo-600 text-white hover:bg-indigo-700 transition"
                >
                  <Download className="w-3.5 h-3.5" />
                  Tải về máy
                </a>
              </div>
            </div>
          }
        >
          <div className="flex flex-col items-center justify-center p-2">
            <img
              src={activePreview.url}
              alt={activePreview.name}
              className="max-w-full max-h-[72vh] object-contain rounded-lg border border-slate-200 dark:border-slate-800"
            />
            <div className="mt-3 w-full p-2 bg-slate-50 dark:bg-slate-800/50 rounded border border-slate-200 dark:border-slate-700 text-xs font-mono text-slate-600 dark:text-slate-300 break-all select-all">
              {activePreview.url}
            </div>
          </div>
        </Modal>
      )}

      {/* Confirm Dialog Xóa Tệp */}
      {fileToDelete && (
        <ConfirmDialog
          open={!!fileToDelete}
          onClose={() => setFileToDelete(null)}
          onConfirm={confirmDelete}
          title="Xác nhận xóa tệp media"
          message={`Bạn có chắc chắn muốn xóa vĩnh viễn tệp "${fileToDelete.name}" (${formatBytes(fileToDelete.size)}) khỏi máy chủ? Thao tác này không thể hoàn tác.`}
          confirmText={isDeleting ? 'Đang xóa...' : 'Xóa vĩnh viễn'}
          danger
          loading={isDeleting}
        />
      )}
    </div>
  );
}
