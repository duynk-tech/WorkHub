import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getPrintWatermarkConfig, getCompanyInfo } from '@/server/modules/settings/branding';
import * as settingsService from '@/server/modules/settings/service';

vi.mock('@/server/modules/settings/service', () => ({
  getSetting: vi.fn(),
}));

describe('Print Watermark Configuration (getPrintWatermarkConfig & getCompanyInfo)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('trả về cấu hình mặc định (enabled: true, opacity: 0.08) khi chưa có cấu hình trong DB', async () => {
    vi.mocked(settingsService.getSetting).mockImplementation(async (key, defaultValue) => defaultValue);

    const config = await getPrintWatermarkConfig();
    expect(config).toEqual({
      enabled: true,
      logoUrl: null,
      opacity: 0.08,
      companyName: 'Công ty Sunny',
    });
  });

  it('tự động fallback về app.logoUrl khi print.watermarkUrl để trống', async () => {
    vi.mocked(settingsService.getSetting).mockImplementation(async (key) => {
      switch (key) {
        case 'app.logoUrl':
          return 'https://example.com/system-logo.png';
        case 'print.watermarkUrl':
          return '';
        case 'print.watermarkEnabled':
          return true;
        case 'print.watermarkOpacity':
          return 0.08;
        case 'company.name':
          return 'Công ty Cổ phần Sunny';
        default:
          return null;
      }
    });

    const config = await getPrintWatermarkConfig();
    expect(config.enabled).toBe(true);
    expect(config.logoUrl).toBe('https://example.com/system-logo.png');
    expect(config.opacity).toBe(0.08);
    expect(config.companyName).toBe('Công ty Cổ phần Sunny');
  });

  it('ưu tiên dùng print.watermarkUrl khi có cấu hình ảnh watermark riêng', async () => {
    vi.mocked(settingsService.getSetting).mockImplementation(async (key) => {
      switch (key) {
        case 'app.logoUrl':
          return 'https://example.com/system-logo.png';
        case 'print.watermarkUrl':
          return 'https://example.com/custom-watermark.png';
        case 'print.watermarkEnabled':
          return true;
        case 'print.watermarkOpacity':
          return 0.12;
        default:
          return null;
      }
    });

    const config = await getPrintWatermarkConfig();
    expect(config.enabled).toBe(true);
    expect(config.logoUrl).toBe('https://example.com/custom-watermark.png');
    expect(config.opacity).toBe(0.12);
  });

  it('tôn trọng cấu hình tắt watermark (print.watermarkEnabled = false)', async () => {
    vi.mocked(settingsService.getSetting).mockImplementation(async (key) => {
      if (key === 'print.watermarkEnabled') return false;
      return null;
    });

    const config = await getPrintWatermarkConfig();
    expect(config.enabled).toBe(false);
  });

  it('hợp thức hóa độ mờ opacity không hợp lệ về mặc định 0.08', async () => {
    vi.mocked(settingsService.getSetting).mockImplementation(async (key) => {
      if (key === 'print.watermarkOpacity') return 999; // Lớn hơn 1
      return null;
    });

    const config = await getPrintWatermarkConfig();
    expect(config.opacity).toBe(0.08);
  });

  it('getCompanyInfo trả về kèm thông tin watermark', async () => {
    vi.mocked(settingsService.getSetting).mockImplementation(async (key, defaultValue) => {
      switch (key) {
        case 'company.name':
          return 'Sunny Vietnam';
        case 'print.watermarkUrl':
          return 'https://sunny.vn/watermark.svg';
        case 'print.watermarkOpacity':
          return 0.06;
        default:
          return defaultValue;
      }
    });

    const company = await getCompanyInfo();
    expect(company.name).toBe('Sunny Vietnam');
    expect(company.watermarkUrl).toBe('https://sunny.vn/watermark.svg');
    expect(company.watermarkEnabled).toBe(true);
    expect(company.watermarkOpacity).toBe(0.06);
  });
});
