import type { Metadata, Viewport } from 'next';
import Script from 'next/script';
import { Inter } from 'next/font/google';
import { ToastProvider } from '@/components/ui/toast';
import { themeScript } from '@/components/ui/theme-toggle';
import { getAppBranding } from '@/server/modules/settings/branding';
import './globals.css';

const appFont = Inter({
  subsets: ['vietnamese', 'latin'],
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
    { media: '(prefers-color-scheme: light)', color: '#ffffff' },
    { media: '(prefers-color-scheme: dark)', color: '#020617' },
  ],
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="vi" className={appFont.variable} suppressHydrationWarning>
      <head>
        <Script id="workhub-theme-init" strategy="beforeInteractive" dangerouslySetInnerHTML={{ __html: themeScript }} />
      </head>
      <body suppressHydrationWarning>
        <ToastProvider>{children}</ToastProvider>
      </body>
    </html>
  );
}
