import { getSetting } from './service';

export interface AppBranding {
  name: string;
  logoUrl: string | null;
  logoText: string;
  description: string;
}

/**
 * Lấy cấu hình nhận diện thương hiệu động của hệ thống:
 * - Tên ứng dụng (app.name)
 * - Logo URL (app.logoUrl)
 * - Ký tự đại diện Logo (app.logoText)
 * - Khẩu hiệu / Mô tả ngắn (app.description)
 */
export async function getAppBranding(): Promise<AppBranding> {
  const [name, logoUrl, logoText, description] = await Promise.all([
    getSetting<string>('app.name', process.env.APP_NAME || 'WorkHub'),
    getSetting<string>('app.logoUrl', ''),
    getSetting<string>('app.logoText', ''),
    getSetting<string>('app.description', 'Hệ thống quản trị công việc, nghỉ phép và chấm công'),
  ]);

  const cleanName = name?.trim() || process.env.APP_NAME || 'WorkHub';
  const cleanLogoText = logoText?.trim() || cleanName.slice(0, 1).toUpperCase() || 'W';

  return {
    name: cleanName,
    logoUrl: logoUrl?.trim() || null,
    logoText: cleanLogoText,
    description: description?.trim() || '',
  };
}
