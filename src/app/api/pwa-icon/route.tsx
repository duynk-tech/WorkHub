import { ImageResponse } from 'next/og';
import { getAppBranding } from '@/server/modules/settings/branding';

/**
 * Icon PWA vẽ động theo thương hiệu: logo đã cấu hình (nếu có) hoặc chữ cái trên nền xanh.
 * `?size=192|512`, `&maskable=1` chừa lề an toàn cho icon bo tròn của Android.
 */
export async function GET(req: Request) {
  const url = new URL(req.url);
  const size = url.searchParams.get('size') === '512' ? 512 : 192;
  const maskable = url.searchParams.get('maskable') === '1';
  const branding = await getAppBranding().catch(() => ({ name: 'WorkHub', logoUrl: null as string | null, logoText: 'W' }));
  const letter = (branding.logoText || branding.name.slice(0, 1) || 'W').slice(0, 2).toUpperCase();
  const pad = maskable ? size * 0.12 : 0;
  const logoUrl = branding.logoUrl ? new URL(branding.logoUrl, url.origin).toString() : null;

  return new ImageResponse(
    (
      <div
        style={{
          width: '100%', height: '100%', display: 'flex', alignItems: 'center', justifyContent: 'center',
          background: logoUrl ? '#ffffff' : 'linear-gradient(135deg, #3b82f6, #1d4ed8)',
          borderRadius: maskable ? 0 : size * 0.22,
        }}
      >
        {logoUrl ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={logoUrl} alt="" width={size - pad * 2 - size * 0.16} height={size - pad * 2 - size * 0.16} style={{ objectFit: 'contain' }} />
        ) : (
          <span style={{ color: '#ffffff', fontSize: (size - pad * 2) * 0.5, fontWeight: 800, letterSpacing: -2 }}>{letter}</span>
        )}
      </div>
    ),
    { width: size, height: size, headers: { 'Cache-Control': 'public, max-age=86400' } },
  );
}
