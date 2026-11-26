import { cachedSettings, getSetting, getSettingsByKeys } from './service';

export interface AppBranding {
  name: string;
  logoUrl: string | null;
  logoText: string;
  description: string;
}

async function runCached<T>(key: string, fn: () => Promise<T>): Promise<T> {
  return typeof cachedSettings === 'function' ? cachedSettings(key, fn) : fn();
}

async function readSettingMap(keys: string[], defaults: Record<string, unknown>): Promise<Record<string, unknown>> {
  if (typeof getSettingsByKeys === 'function') {
    const map = await getSettingsByKeys(keys);
    const out: Record<string, unknown> = {};
    for (const k of keys) out[k] = map[k] !== undefined ? map[k] : defaults[k];
    return out;
  }
  const entries = await Promise.all(keys.map(async (k) => [k, await getSetting(k, defaults[k])] as const));
  return Object.fromEntries(entries);
}

/**
 * Lấy cấu hình nhận diện thương hiệu động của hệ thống (1 batch query + cache 5 phút).
 */
export async function getAppBranding(): Promise<AppBranding> {
  return runCached('app-branding', async () => {
    const map = await readSettingMap(
      ['app.name', 'app.logoUrl', 'app.logoText', 'app.description'],
      {
        'app.name': process.env.APP_NAME || 'WorkHub',
        'app.logoUrl': '',
        'app.logoText': '',
        'app.description': 'Hệ thống quản trị kinh doanh, thiết bị, kho vận và công việc',
      },
    );
    const name = typeof map['app.name'] === 'string' ? map['app.name'] : '';
    const logoUrl = typeof map['app.logoUrl'] === 'string' ? map['app.logoUrl'] : '';
    const logoText = typeof map['app.logoText'] === 'string' ? map['app.logoText'] : '';
    const description = typeof map['app.description'] === 'string' ? map['app.description'] : '';

    const cleanName = name.trim() || process.env.APP_NAME || 'WorkHub';
    const cleanLogoText = logoText.trim() || cleanName.slice(0, 1).toUpperCase() || 'W';

    return {
      name: cleanName,
      logoUrl: logoUrl.trim() || null,
      logoText: cleanLogoText,
      description: description.trim() || '',
    };
  });
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
  return runCached('print-watermark', async () => {
    const map = await readSettingMap(
      ['print.watermarkUrl', 'app.logoUrl', 'print.watermarkEnabled', 'print.watermarkOpacity', 'company.name'],
      {
        'print.watermarkUrl': '',
        'app.logoUrl': '',
        'print.watermarkEnabled': true,
        'print.watermarkOpacity': 0.08,
        'company.name': 'Công ty Sunny',
      },
    );
    const customWatermarkUrl = typeof map['print.watermarkUrl'] === 'string' ? map['print.watermarkUrl'] : '';
    const appLogoUrl = typeof map['app.logoUrl'] === 'string' ? map['app.logoUrl'] : '';
    const enabled = map['print.watermarkEnabled'] !== false;
    const opacity = map['print.watermarkOpacity'] ?? 0.08;
    const companyName = typeof map['company.name'] === 'string' ? map['company.name'] : 'Công ty Sunny';

    const rawLogo = customWatermarkUrl.trim() || appLogoUrl.trim() || null;
    const parsedOpacity = Number(opacity);
    const validOpacity = !isNaN(parsedOpacity) && parsedOpacity > 0 && parsedOpacity <= 1 ? parsedOpacity : 0.08;

    return {
      enabled,
      logoUrl: rawLogo,
      opacity: validOpacity,
      companyName: companyName.trim() || 'Công ty Sunny',
    };
  });
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
