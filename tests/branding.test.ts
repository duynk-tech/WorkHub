import { describe, it, expect, vi, beforeEach } from 'vitest';
import { getAppBranding } from '@/server/modules/settings/branding';
import * as settingsService from '@/server/modules/settings/service';

vi.mock('@/server/modules/settings/service', () => ({
  getSetting: vi.fn(),
}));

describe('App Branding Service (getAppBranding)', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('trả về cấu hình mặc định WorkHub và W khi không có cấu hình trong DB', async () => {
    vi.mocked(settingsService.getSetting).mockImplementation(async (key, defaultValue) => defaultValue);

    const branding = await getAppBranding();
    expect(branding).toEqual({
      name: 'WorkHub',
      logoUrl: null,
      logoText: 'W',
      description: 'Hệ thống quản trị công việc, nghỉ phép và chấm công',
    });
  });

  it('trả về thông tin thương hiệu tùy chỉnh khi đã cấu hình đầy đủ', async () => {
    vi.mocked(settingsService.getSetting).mockImplementation(async (key) => {
      switch (key) {
        case 'app.name':
          return 'Acme Corp';
        case 'app.logoUrl':
          return 'https://example.com/logo.png';
        case 'app.logoText':
          return 'AC';
        case 'app.description':
          return 'Hệ sinh thái công nghệ Acme';
        default:
          return null;
      }
    });

    const branding = await getAppBranding();
    expect(branding).toEqual({
      name: 'Acme Corp',
      logoUrl: 'https://example.com/logo.png',
      logoText: 'AC',
      description: 'Hệ sinh thái công nghệ Acme',
    });
  });

  it('tự động sinh logoText từ chữ cái đầu của app.name nếu chưa cấu hình logoText', async () => {
    vi.mocked(settingsService.getSetting).mockImplementation(async (key) => {
      if (key === 'app.name') return 'Sunny Tech';
      if (key === 'app.logoText') return '';
      return '';
    });

    const branding = await getAppBranding();
    expect(branding.name).toBe('Sunny Tech');
    expect(branding.logoText).toBe('S');
    expect(branding.logoUrl).toBeNull();
  });

  it('tự động cắt bỏ khoảng trắng thừa (trim) trong tên và logoUrl', async () => {
    vi.mocked(settingsService.getSetting).mockImplementation(async (key) => {
      if (key === 'app.name') return '   MetaPortal   ';
      if (key === 'app.logoUrl') return '   https://example.com/logo.svg   ';
      if (key === 'app.logoText') return '   MP   ';
      if (key === 'app.description') return '   Cổng thông tin doanh nghiệp   ';
      return '';
    });

    const branding = await getAppBranding();
    expect(branding).toEqual({
      name: 'MetaPortal',
      logoUrl: 'https://example.com/logo.svg',
      logoText: 'MP',
      description: 'Cổng thông tin doanh nghiệp',
    });
  });

  it('chuyển logoUrl rỗng hoặc toàn khoảng trắng thành null để kích hoạt monogram fallback', async () => {
    vi.mocked(settingsService.getSetting).mockImplementation(async (key) => {
      if (key === 'app.name') return 'Alpha';
      if (key === 'app.logoUrl') return '   ';
      return '';
    });

    const branding = await getAppBranding();
    expect(branding.logoUrl).toBeNull();
    expect(branding.logoText).toBe('A');
  });
});
