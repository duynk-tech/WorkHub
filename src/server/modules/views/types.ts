/** Các màn hình danh sách có bộ lọc trên URL và cho phép lưu view. */
export const SAVED_VIEW_MODULES = ['tasks', 'sales', 'quotations', 'customers', 'tickets', 'purchases'] as const;
export type SavedViewModule = (typeof SAVED_VIEW_MODULES)[number];

export interface SavedViewDto { id: number; name: string; query: string; isShared: boolean; isOwn: boolean }
