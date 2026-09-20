import type { Metadata, Viewport } from 'next';
import { Be_Vietnam_Pro } from 'next/font/google';
import { ToastProvider } from '@/components/ui/toast';
import { themeScript } from '@/components/ui/theme-toggle';
import { getAppBranding } from '@/server/modules/settings/branding';
import './globals.css';

const appFont = Be_Vietnam_Pro({
  subsets: ['vietnamese', 'latin'],
  weight: ['300', '400', '500', '600', '700'],
  variable: '--font-app-sans',
  display: 'swap',
});

export async function generateMetadata(): Promise<Metadata> {
  const branding = await getAppBranding().catch(() => ({
    name: process.env.APP_NAME || 'WorkHub',
    logoUrl: null,
    logoText: 'W',
    description: 'Hệ thống quản lý công việc, nghỉ phép, phê duyệt và chấm công',
  }));

  return {
    title: { default: branding.name, template: `%s · ${branding.name}` },
    description: branding.description || 'Hệ thống quản lý công việc, nghỉ phép, phê duyệt và chấm công',
    icons: branding.logoUrl ? [{ rel: 'icon', url: branding.logoUrl }] : undefined,
  };
};

export const viewport: Viewport = {
  width: 'device-width',
  initialScale: 1,
  themeColor: [
    { media: '(prefers-color-scheme: light)', color: '#f5f6fa' },
    { media: '(prefers-color-scheme: dark)', color: '#0b0d14' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={appFont.variable} suppressHydrationWarning>
      <head>
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body suppressHydrationWarning>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
