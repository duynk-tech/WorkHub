'use client';

import { useCallback, useEffect, useState, useTransition } from 'react';
import { usePathname, useRouter, useSearchParams } from 'next/navigation';
import { Bookmark, BookmarkPlus, Users, X } from 'lucide-react';
import { Modal } from './modal';
import { Button, Field, Input, Switch } from './index';
import { useToast } from './toast';
import { listSavedViewsAction, saveViewAction, deleteViewAction } from '@/server/modules/views/actions';
import type { SavedViewDto, SavedViewModule } from '@/server/modules/views/types';

const norm = (q: string) => {
  const p = new URLSearchParams(q);
  p.delete('page');
  p.sort();
  return p.toString();
};

/**
 * Hàng chip "view đã lưu" đặt trên bộ lọc của các màn danh sách.
 * Bộ lọc đã nằm trên URL, nên view chỉ là chuỗi query — bấm chip là mở lại đúng bộ lọc.
 */
export function SavedViewsBar({ module }: { module: SavedViewModule }) {
  const router = useRouter();
  const pathname = usePathname();
  const params = useSearchParams();
  const toast = useToast();
  const [views, setViews] = useState<SavedViewDto[]>([]);
  const [open, setOpen] = useState(false);
  const [name, setName] = useState('');
  const [shared, setShared] = useState(false);
  const [pending, startTransition] = useTransition();

  const load = useCallback(() => { listSavedViewsAction(module).then(setViews).catch(() => {}); }, [module]);
  useEffect(load, [load]);

  const current = norm(params.toString());
  const hasFilter = current.length > 0;

  const save = () => startTransition(async () => {
    const r = await saveViewAction(module, name, params.toString(), shared);
    if (r.ok) { toast.success(r.message); setOpen(false); setName(''); setShared(false); load(); } else toast.error(r.message);
  });

  const remove = (v: SavedViewDto) => startTransition(async () => {
    const r = await deleteViewAction(v.id);
    if (r.ok) { toast.success(r.message); load(); } else toast.error(r.message);
  });

  if (!views.length && !hasFilter) return null;

  return (
    <div className="saved-views" role="toolbar" aria-label="View đã lưu">
      <span className="saved-views-label"><Bookmark size={14} /> View:</span>
      {views.map((v) => {
        const active = norm(v.query) === current;
        return (
          <span key={v.id} className="saved-view-chip" data-active={active || undefined}>
            <button type="button" onClick={() => router.push(`${pathname}?${v.query}`)} title={v.isShared ? 'View chia sẻ' : 'View của bạn'}>
              {v.isShared && <Users size={12} />} {v.name}
            </button>
            {v.isOwn && (
              <button type="button" className="saved-view-remove" aria-label={`Xoá view ${v.name}`} onClick={() => remove(v)} disabled={pending}>
                <X size={12} />
              </button>
            )}
          </span>
        );
      })}
      {hasFilter && !views.some((v) => norm(v.query) === current) && (
        <button type="button" className="btn btn-ghost btn-sm" onClick={() => setOpen(true)}>
          <BookmarkPlus /> Lưu bộ lọc này
        </button>
      )}

      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="Lưu bộ lọc hiện tại"
        description="Lần sau chỉ cần bấm một lần để mở lại đúng bộ lọc và cách sắp xếp này."
        footer={
          <>
            <Button variant="secondary" onClick={() => setOpen(false)}>Hủy</Button>
            <Button variant="primary" onClick={save} loading={pending}>Lưu view</Button>
          </>
        }
      >
        <div className="stack" style={{ gap: 14 }}>
          <Field label="Tên view" required>
            <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="vd. Đơn quá hạn của tôi" maxLength={80} autoFocus
              onKeyDown={(e) => { if (e.key === 'Enter' && name.trim()) save(); }} />
          </Field>
          <label className="row" style={{ gap: 10, fontSize: 13.5 }}>
            <Switch checked={shared} onChange={(e) => setShared(e.target.checked)} />
            Chia sẻ cho mọi người dùng màn hình này
          </label>
        </div>
      </Modal>
    </div>
  );
}
