import { canAny, type AuthContext } from './context';

/**
 * Quyền xem theo module, gom một chỗ để page và server action dùng cùng một luật.
 * `can()` đã cho admin qua, nên không cần `|| ctx.isAdmin` ở chỗ gọi.
 */
export const MODULE_VIEW_PERMISSIONS = {
  customers: ['MENU_CUSTOMERS', 'FEATURE_CUSTOMER_MANAGE'],
  sales: ['MENU_SALES', 'MENU_CUSTOMERS', 'FEATURE_CUSTOMER_MANAGE'],
  quotations: ['MENU_QUOTATIONS', 'MENU_CUSTOMERS', 'FEATURE_CUSTOMER_MANAGE'],
  purchases: ['MENU_PURCHASES', 'MENU_SPARE_PARTS', 'MENU_EQUIPMENT', 'FEATURE_SPARE_PARTS_MANAGE'],
  inventory: ['MENU_SPARE_PARTS', 'MENU_EQUIPMENT', 'FEATURE_SPARE_PARTS_MANAGE'],
  tickets: [
    'MENU_EQUIPMENT',
    'MENU_SPARE_PARTS',
    'FEATURE_EQUIPMENT_MAINTENANCE',
    'FEATURE_EQUIPMENT_MANAGE',
  ],
} as const;

export type ViewModule = keyof typeof MODULE_VIEW_PERMISSIONS;

export function canViewModule(ctx: AuthContext | null, module: ViewModule): boolean {
  return canAny(ctx, [...MODULE_VIEW_PERMISSIONS[module]]);
}

export const NO_ACCESS_MESSAGE = 'Bạn không có quyền xem dữ liệu này';
