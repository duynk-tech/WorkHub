import type { MetadataRoute } from 'next';
import { getAppBranding } from '@/server/modules/settings/branding';

/** Cho phép "Thêm vào màn hình chính" — mở như app riêng, không thanh địa chỉ. */
export default async function manifest(): Promise<MetadataRoute.Manifest> {
  const branding = await getAppBranding().catch(() => ({ name: 'WorkHub', description: '' }));
  return {
    name: branding.name,
    short_name: branding.name.length > 12 ? branding.name.slice(0, 12) : branding.name,
    description: branding.description || 'Quản lý công việc, bán hàng, kho và phê duyệt',
    start_url: '/dashboard',
    scope: '/',
    display: 'standalone',
    background_color: '#f8fafc',
    theme_color: '#2563eb',
    lang: 'vi',
    icons: [
      { src: '/api/pwa-icon?size=192', sizes: '192x192', type: 'image/png', purpose: 'any' },
      { src: '/api/pwa-icon?size=512', sizes: '512x512', type: 'image/png', purpose: 'any' },
      { src: '/api/pwa-icon?size=512&maskable=1', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
    ],
  };
}
