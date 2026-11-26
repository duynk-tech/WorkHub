import 'server-only';
import { can, type AuthContext } from '@/server/auth/context';

/** Quyền thiết kế / chỉnh sửa Không gian 3D (bố cục, vật thể, mô hình sản phẩm). Admin luôn có. */
export const SPACE_DESIGN_PERMISSION = 'FEATURE_SPACE_DESIGN';

export function canDesignSpace(ctx: AuthContext | null): boolean {
  return Boolean(ctx && (ctx.isAdmin || can(ctx, SPACE_DESIGN_PERMISSION)));
}
