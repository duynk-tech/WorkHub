'use server';

import { requireAuth } from '@/server/auth/context';
import { listDocuments, type DocumentFilter } from './documents';

export async function listDocumentsAction(filter: DocumentFilter) {
  await requireAuth();
  try {
    const data = await listDocuments(filter);
    return { ok: true, message: '', data: JSON.parse(JSON.stringify(data)) };
  } catch (error: any) {
    console.error('[listDocumentsAction error]:', error);
    return { ok: false, message: error.message || 'Lỗi khi đọc sổ chứng từ' };
  }
}
