'use server';

import { requireAuth, can } from '@/server/auth/context';
import { listDocuments, type DocumentFilter } from './documents';

export async function listDocumentsAction(filter: DocumentFilter) {
  const ctx = await requireAuth();
  if (!can(ctx, 'MENU_REPORTS')) return { ok: false, message: 'Bạn không có quyền xem sổ chứng từ' };
  try {
    const data = await listDocuments(filter);
    return { ok: true, message: '', data: JSON.parse(JSON.stringify(data)) };
  } catch (error: any) {
    console.error('[listDocumentsAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi đọc sổ chứng từ' };
  }
}
