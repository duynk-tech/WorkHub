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

export interface CompanyInfo {
  name: string;
  shortName: string;
  address: string;
  taxCode: string;
  phone: string;
  logoUrl?: string | null;
  watermarkUrl?: string | null;
  watermarkEnabled?: boolean;
  watermarkOpacity?: number;
}

export interface PrintWatermarkConfig {
  enabled: boolean;
  logoUrl: string | null;
  opacity: number;
  companyName: string;
}

/**
 * Lấy cấu hình logo watermark dùng chung cho tất cả các bản in / phiếu in A4:
 * - Bật/tắt watermark (print.watermarkEnabled, mặc định: true)
 * - Logo watermark tùy chỉnh (print.watermarkUrl), nếu để trống fallback về logo thương hiệu (app.logoUrl)
 * - Độ mờ watermark (print.watermarkOpacity, mặc định: 0.08)
 * - Tên công ty / đơn vị xuất hiện trên dấu mờ (company.name)
 */
export async function getPrintWatermarkConfig(): Promise<PrintWatermarkConfig> {
  const [customWatermarkUrl, appLogoUrl, enabled, opacity, companyName] = await Promise.all([
    getSetting<string>('print.watermarkUrl', ''),
    getSetting<string>('app.logoUrl', ''),
    getSetting<boolean>('print.watermarkEnabled', true),
    getSetting<number | string>('print.watermarkOpacity', 0.08),
    getSetting<string>('company.name', 'Công ty Sunny'),
  ]);

  const rawLogo = customWatermarkUrl?.trim() || appLogoUrl?.trim() || null;
  const parsedOpacity = Number(opacity);
  const validOpacity = !isNaN(parsedOpacity) && parsedOpacity > 0 && parsedOpacity <= 1 ? parsedOpacity : 0.08;

  return {
    enabled: enabled !== false,
    logoUrl: rawLogo,
    opacity: validOpacity,
    companyName: companyName?.trim() || 'Công ty Sunny',
  };
}

/**
 * Lấy thông tin công ty từ cấu hình hệ thống (Settings -> Thông tin công ty):
 * - Tên công ty (company.name)
 * - Tên viết tắt (company.shortName)
 * - Địa chỉ (company.address)
 * - Mã số thuế (company.taxCode)
 * - Hotline / Số điện thoại (company.phone)
 * - Cấu hình watermark in ấn kèm theo
 */
export async function getCompanyInfo(): Promise<CompanyInfo> {
  const [name, shortName, address, taxCode, phone, appLogoUrl, customWatermarkUrl, watermarkEnabled, watermarkOpacity] = await Promise.all([
    getSetting<string>('company.name', 'Công ty Sunny'),
    getSetting<string>('company.shortName', 'Sunny'),
    getSetting<string>('company.address', ''),
    getSetting<string>('company.taxCode', ''),
    // Không đặt số mặc định: số giả in lên tem dán tại khách còn tệ hơn là để trống
    getSetting<string>('company.phone', ''),
    getSetting<string>('app.logoUrl', ''),
    getSetting<string>('print.watermarkUrl', ''),
    getSetting<boolean>('print.watermarkEnabled', true),
    getSetting<number | string>('print.watermarkOpacity', 0.08),
  ]);

  const rawWatermark = customWatermarkUrl?.trim() || appLogoUrl?.trim() || null;
  const parsedOpacity = Number(watermarkOpacity);
  const validOpacity = !isNaN(parsedOpacity) && parsedOpacity > 0 && parsedOpacity <= 1 ? parsedOpacity : 0.08;

  return {
    name: name?.trim() || 'Công ty Sunny',
    shortName: shortName?.trim() || 'Sunny',
    address: address?.trim() || '167-169 Calmette, P. Nguyễn Thái Bình, Quận 1, TP.HCM',
    taxCode: taxCode?.trim() || '',
    phone: phone?.trim() || '',
    logoUrl: appLogoUrl?.trim() || null,
    watermarkUrl: rawWatermark,
    watermarkEnabled: watermarkEnabled !== false,
    watermarkOpacity: validOpacity,
  };
}
