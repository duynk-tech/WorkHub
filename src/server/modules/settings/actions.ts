'use server';

import { outboundProviderFetch } from '@/server/security/outbound-http';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAuth, requirePermission, can } from '@/server/auth/context';
import { encryptSecret } from '@/lib/crypto';
import { settingsPolicy, SECRET_SETTING_KEYS } from './policy';
import { setSetting, getSetting } from './service';
import { getAppBranding } from './branding';
import { runFullDemoSeed, cleanBusinessData } from '../../../../prisma/seed/index';
import {
  getBotInfo,
  sendZaloMessage,
  setZaloWebhook,
  testZaloWebhook,
  getZaloWebhookInfo,
  deleteZaloWebhook,
} from '@/server/modules/notify/zalo';
import { processOutbox } from '@/server/modules/notify/zalo';
import { createLinkCode, unlinkZalo } from '@/server/modules/zalo/link';
import { dateOnly } from '@/lib/date';
import {
  getCustomTools,
  saveCustomTool,
  deleteCustomTool,
  toggleCustomTool,
  executeCustomTool,
  type CustomAgentTool,
} from '@/server/modules/zalo/custom-tools';
import { runAiAgentTest } from '@/server/modules/zalo/ai-agent';
import { PRESET_LLM_MODELS, type LlmModelItem } from '@/lib/llm-models';
import type { PromptVariable, PromptTemplate, AiAgentTestResult, AiAgentTestStep } from '@/lib/ai-prompt';
export type { LlmModelItem, PromptVariable, PromptTemplate, AiAgentTestResult, AiAgentTestStep };

export interface Result { ok: boolean; message: string }

const SECRET_KEYS = SECRET_SETTING_KEYS;

export async function saveSettingsAction(group: string, values: Record<string, unknown>): Promise<Result> {
  const policy = settingsPolicy(group);
  const ctx = await requirePermission(policy.permission);
  if (group === 'sso' && !ctx.isAdmin) return { ok: false, message: 'Chỉ quản trị viên được cấu hình SSO' };
  const parsed = policy.schema.safeParse(values);
  if (!parsed.success) return { ok: false, message: 'Cấu hình chứa trường hoặc giá trị không hợp lệ' };
  if (group === 'sso') {
    const input = parsed.data as Record<string, unknown>;
    if (input['sso.google.enabled'] === true) {
      const id = String(input['sso.google.clientId'] ?? await getSetting('sso.google.clientId', '')).trim();
      const rawSecret = input['sso.google.clientSecret'];
      const secret = rawSecret === undefined || rawSecret === '********' ? await getSetting('sso.google.clientSecret', '') : String(rawSecret).trim();
      if (!id.endsWith('.apps.googleusercontent.com') || !secret) return { ok: false, message: 'Nhập Client ID và Client Secret Google hợp lệ' };
      const domains = String(input['sso.google.domains'] ?? '').split(',').map((d) => d.trim()).filter(Boolean);
      if (domains.some((d) => !/^[a-z0-9](?:[a-z0-9.-]*[a-z0-9])?\.[a-z]{2,}$/i.test(d))) return { ok: false, message: 'Miền Workspace không hợp lệ' };
      try { await prisma.externalIdentity.count(); }
      catch { return { ok: false, message: 'Cần triển khai migration Google SSO trước khi bật' }; }
    }
  }
  const entries = Object.entries(parsed.data).filter(([, value]) => value !== undefined);
  await prisma.$transaction(async (tx) => {
    for (const [key, value] of entries) {
      const isSecret = SECRET_KEYS.has(key);
      if (isSecret && value === '********') continue;
      const stored = isSecret && typeof value === 'string' && value ? encryptSecret(value) : value;
      await tx.systemSetting.upsert({
        where: { key },
        update: { valueJson: stored as never, groupName: group, isSecret },
        create: { key, valueJson: stored as never, groupName: group, isSecret },
      });
    }
    await tx.auditLog.create({ data: {
      actorId: ctx.userId, entityType: 'SystemSetting', entityId: group, action: 'UPDATE',
      diffJson: Object.fromEntries(entries.map(([key, value]) => [key, SECRET_KEYS.has(key) ? '***' : value])) as never,
    } });
  });

  revalidatePath('/settings');
  revalidatePath('/settings/integrations');
  revalidatePath('/api/openapi.json');
  revalidatePath('/', 'layout');
  return { ok: true, message: 'Đã lưu cấu hình' };
}

export async function testZaloBotAction(targetChatId?: string): Promise<Result> {
  const ctx = await requirePermission('FEATURE_SETTING_ZALO');
  const info = await getBotInfo();
  if (!info.ok) return { ok: false, message: `Không kết nối được Zalo Bot: ${info.error}` };

  const botData = (info.data ?? {}) as Record<string, unknown>;
  const botName = String(botData.first_name ?? botData.name ?? botData.username ?? 'Zalo Bot');

  let recipientId = targetChatId?.trim();
  if (!recipientId && ctx.employeeId) {
    const employee = await prisma.employee.findUnique({ where: { id: ctx.employeeId }, select: { zaloUserId: true } });
    recipientId = employee?.zaloUserId || undefined;
  }

  if (!recipientId) {
    return {
      ok: true,
      message: `Kết nối bot "${botName}" thành công! Hãy liên kết Zalo cá nhân tại mục Hồ sơ cá nhân để nhận tin nhắn thử nghiệm.`,
    };
  }

  const branding = await getAppBranding();
  const send = await sendZaloMessage(
    recipientId,
    `🔔 **Tin nhắn thử từ ${branding.name}**\n\nNếu bạn nhận được tin này, cấu hình bot **${botName}** đã hoạt động và hỗ trợ **Markdown** thành công!`,
  );
  return send.ok
    ? { ok: true, message: `Đã gửi tin nhắn thử nghiệm thành công tới Zalo (${recipientId}) qua bot "${botName}"` }
    : { ok: false, message: `Kết nối bot "${botName}" thành công nhưng gửi tin thử thất bại: ${send.error}` };
}

export async function flushOutboxAction(): Promise<Result> {
  await requirePermission('FEATURE_SETTING_ZALO');
  const enabled = await getSetting<boolean>('zalo.enabled', false);
  if (!enabled) return { ok: false, message: 'Zalo Bot đang tắt — hãy bật trước khi đẩy hàng đợi' };
  const result = await processOutbox(50);
  return { ok: true, message: `Đã gửi ${result.sent}, lỗi ${result.failed}, bỏ qua ${result.skipped}` };
}

export async function requestZaloLinkCodeAction(): Promise<Result & { code?: string; expiresAt?: string }> {
  const ctx = await requireAuth();
  const record = await createLinkCode(ctx.userId);
  return {
    ok: true,
    message: 'Đã tạo mã liên kết, có hiệu lực 10 phút',
    code: record.code,
    expiresAt: record.expiresAt.toISOString(),
  };
}

export async function unlinkZaloAction(): Promise<Result> {
  const ctx = await requireAuth();
  const result = await unlinkZalo(ctx.userId);
  revalidatePath('/profile');
  return result;
}

export async function saveHolidayAction(id: number | null, date: string, name: string, isPaid: boolean): Promise<Result> {
  await requirePermission('FEATURE_SETTING_HOLIDAY');
  const d = dateOnly(new Date(date));
  if (Number.isNaN(d.getTime())) return { ok: false, message: 'Ngày không hợp lệ' };

  try {
    if (id) {
      await prisma.holiday.update({ where: { id }, data: { date: d, name, isPaid, year: d.getUTCFullYear() } });
    } else {
      await prisma.holiday.upsert({
        where: { date: d },
        update: { name, isPaid, year: d.getUTCFullYear() },
        create: { date: d, name, isPaid, year: d.getUTCFullYear() },
      });
    }
    revalidatePath('/settings');
    return { ok: true, message: 'Đã lưu ngày lễ' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Lưu ngày lễ thất bại' };
  }
}

export async function deleteHolidayAction(id: number): Promise<Result> {
  await requirePermission('FEATURE_SETTING_HOLIDAY');
  await prisma.holiday.delete({ where: { id } });
  revalidatePath('/settings');
  return { ok: true, message: 'Đã xóa ngày lễ' };
}

export async function saveWorkShiftAction(id: number | null, data: {
  code: string; name: string; startTime: string; endTime: string;
  breakMinutes: number; lateToleranceMin: number; workDays: number; isActive: boolean;
}): Promise<Result> {
  await requirePermission('FEATURE_ATTENDANCE_SHIFT_MANAGE');
  try {
    if (id) await prisma.workShift.update({ where: { id }, data });
    else await prisma.workShift.create({ data });
    revalidatePath('/settings');
    return { ok: true, message: 'Đã lưu ca làm việc' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Lưu ca làm việc thất bại' };
  }
}

export async function saveLeaveTypeAction(id: number | null, data: {
  code: string; name: string; description: string | null; defaultDaysPerYear: number;
  isPaid: boolean; deductsBalance: boolean; requiresAttachment: boolean; allowHalfDay: boolean;
  minAdvanceDays: number; maxConsecutiveDays: number | null; color: string; isActive: boolean;
}): Promise<Result> {
  await requirePermission('FEATURE_LEAVE_TYPE_MANAGE');
  try {
    if (id) await prisma.leaveType.update({ where: { id }, data });
    else await prisma.leaveType.create({ data });
    revalidatePath('/settings');
    revalidatePath('/leaves');
    return { ok: true, message: 'Đã lưu loại nghỉ phép' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Lưu loại nghỉ phép thất bại' };
  }
}

export async function registerZaloWebhookAction(
  webhookUrl: string,
  secretToken?: string,
  botToken?: string,
): Promise<Result & { info?: unknown }> {
  await requirePermission('FEATURE_SETTING_ZALO');
  const cleanUrl = webhookUrl.trim();
  if (!cleanUrl.startsWith('https://')) {
    return { ok: false, message: 'URL webhook phải bắt đầu bằng https:// theo yêu cầu của Zalo' };
  }

  // Tự động lưu webhookUrl vào CSDL
  await setSetting('zalo.webhookUrl', cleanUrl, { group: 'zalo' });

  // Nếu có secretToken truyền lên và khác '********', lưu vào DB luôn để đồng bộ
  if (secretToken && secretToken.trim() && secretToken !== '********') {
    await setSetting('zalo.webhookSecret', secretToken.trim(), { group: 'zalo', isSecret: true });
  }

  // Nếu có botToken truyền lên và khác '********', lưu vào DB luôn
  if (botToken && botToken.trim() && botToken !== '********') {
    await setSetting('zalo.botToken', botToken.trim(), { group: 'zalo', isSecret: true });
  }

  const result = await setZaloWebhook(
    cleanUrl,
    secretToken === '********' ? undefined : secretToken,
    botToken === '********' ? undefined : botToken,
  );

  if (!result.ok) {
    return { ok: false, message: `Đăng ký Webhook thất bại: ${result.error}` };
  }

  // Lấy thông tin webhook mới nhất từ Zalo
  const infoRes = await getZaloWebhookInfo(botToken === '********' ? undefined : botToken);

  revalidatePath('/settings/integrations');
  return {
    ok: true,
    message: 'Đã đăng ký Webhook thành công với Zalo Bot Platform!',
    info: infoRes.ok ? infoRes.data : result.data,
  };
}

export async function testZaloWebhookPingAction(botToken?: string): Promise<Result & { data?: unknown }> {
  await requirePermission('FEATURE_SETTING_ZALO');
  const result = await testZaloWebhook(botToken === '********' ? undefined : botToken);
  if (!result.ok) {
    return { ok: false, message: `Zalo test Webhook thất bại: ${result.error}` };
  }
  return { ok: true, message: 'Zalo đã gửi request test thành công tới Webhook của bạn!', data: result.data };
}

export async function getZaloWebhookInfoAction(botToken?: string): Promise<Result & { info?: unknown }> {
  await requirePermission('FEATURE_SETTING_ZALO');
  const result = await getZaloWebhookInfo(botToken === '********' ? undefined : botToken);
  if (!result.ok) {
    return { ok: false, message: `Không lấy được thông tin Webhook: ${result.error}` };
  }
  return { ok: true, message: 'Thành công', info: result.data };
}

export async function deleteZaloWebhookAction(botToken?: string): Promise<Result> {
  await requirePermission('FEATURE_SETTING_ZALO');
  const result = await deleteZaloWebhook(botToken === '********' ? undefined : botToken);
  if (!result.ok) {
    return { ok: false, message: `Hủy Webhook thất bại: ${result.error}` };
  }
  revalidatePath('/settings/integrations');
  return { ok: true, message: 'Đã hủy Webhook thành công' };
}

export async function clearZaloInboundLogsAction(): Promise<Result> {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_MCP_MANAGE') && !can(ctx, 'FEATURE_SETTING_ZALO') && !ctx.isAdmin) {
    return { ok: false, message: 'Bạn không có quyền xóa nhật ký Webhook Zalo' };
  }
  try {
    await prisma.zaloInboundLog.deleteMany({});
    revalidatePath('/settings/integrations');
    return { ok: true, message: 'Đã xóa toàn bộ nhật ký Webhook Zalo' };
  } catch (err: any) {
    return { ok: false, message: `Lỗi khi xóa nhật ký: ${err.message}` };
  }
}

export async function deleteZaloInboundLogAction(id: number): Promise<Result> {
  const ctx = await requireAuth();
  if (!can(ctx, 'FEATURE_MCP_MANAGE') && !can(ctx, 'FEATURE_SETTING_ZALO') && !ctx.isAdmin) {
    return { ok: false, message: 'Bạn không có quyền xóa nhật ký Webhook Zalo' };
  }
  try {
    await prisma.zaloInboundLog.delete({ where: { id } });
    revalidatePath('/settings/integrations');
    return { ok: true, message: 'Đã xóa bản ghi nhật ký' };
  } catch (err: any) {
    return { ok: false, message: `Lỗi khi xóa bản ghi: ${err.message}` };
  }
}

export async function getCustomToolsAction(): Promise<CustomAgentTool[]> {
  const ctx = await requirePermission('FEATURE_SETTING_ZALO');
  if (!ctx.isAdmin) throw new Error('Chỉ quản trị viên được quản lý công cụ tùy chỉnh');
  return await getCustomTools();
}

export async function saveCustomToolAction(
  toolData: Omit<CustomAgentTool, 'id'> & { id?: string },
): Promise<Result & { tool?: CustomAgentTool }> {
  const ctx = await requirePermission('FEATURE_SETTING_ZALO');
  if (!ctx.isAdmin) throw new Error('Chỉ quản trị viên được quản lý công cụ tùy chỉnh');
  try {
    const saved = await saveCustomTool(toolData);
    revalidatePath('/settings/integrations');
    return { ok: true, message: 'Đã lưu công cụ tùy chỉnh', tool: saved };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Lưu công cụ tùy chỉnh thất bại' };
  }
}

export async function deleteCustomToolAction(toolId: string): Promise<Result> {
  const ctx = await requirePermission('FEATURE_SETTING_ZALO');
  if (!ctx.isAdmin) throw new Error('Chỉ quản trị viên được quản lý công cụ tùy chỉnh');
  try {
    const ok = await deleteCustomTool(toolId);
    revalidatePath('/settings/integrations');
    return ok ? { ok: true, message: 'Đã xóa công cụ tùy chỉnh' } : { ok: false, message: 'Không tìm thấy công cụ' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Xóa công cụ thất bại' };
  }
}

export async function toggleCustomToolAction(toolId: string, isActive: boolean): Promise<Result> {
  const ctx = await requirePermission('FEATURE_SETTING_ZALO');
  if (!ctx.isAdmin) throw new Error('Chỉ quản trị viên được quản lý công cụ tùy chỉnh');
  try {
    const ok = await toggleCustomTool(toolId, isActive);
    revalidatePath('/settings/integrations');
    return ok ? { ok: true, message: `Đã ${isActive ? 'bật' : 'tắt'} công cụ` } : { ok: false, message: 'Không tìm thấy công cụ' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Thao tác thất bại' };
  }
}

export async function testCustomToolAction(
  toolData: CustomAgentTool,
  testArgs: Record<string, unknown>,
): Promise<Result & { data?: unknown; error?: string }> {
  const ctx = await requirePermission('FEATURE_SETTING_ZALO');
  if (!ctx.isAdmin) throw new Error('Chỉ quản trị viên được quản lý công cụ tùy chỉnh');
  try {
    const result = await executeCustomTool(toolData, testArgs);
    if (!result.success) {
      return { ok: false, message: result.error || 'Thực thi thất bại', error: result.error, data: result.data };
    }
    return { ok: true, message: 'Thực thi thành công', data: result.data };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Lỗi khi test công cụ', error: String(e) };
  }
}

export async function fetchLlmModelsAction(
  params?: { apiKey?: string; baseUrl?: string },
): Promise<{ ok: boolean; message: string; models: LlmModelItem[] }> {
  await requirePermission('FEATURE_SETTING_ZALO');

  const apiKey = (params?.apiKey?.trim() && params.apiKey !== '********')
    ? params.apiKey.trim()
    : ((await getSetting<string>('ai.geminiApiKey', '')) || process.env.GEMINI_API_KEY || '');

  const baseUrl = (params?.baseUrl?.trim())
    ? params.baseUrl.trim()
    : ((await getSetting<string>('ai.baseUrl', '')) || process.env.AI_BASE_URL || '');

  if (!apiKey) {
    return {
      ok: false,
      message: 'Chưa có API Key. Vui lòng nhập API Key để gọi API lấy danh sách mô hình thực tế.',
      models: PRESET_LLM_MODELS,
    };
  }

  try {
    const isCustomEndpoint = Boolean(baseUrl && !baseUrl.includes('googleapis.com'));

    if (isCustomEndpoint) {
      // OpenAI / OpenRouter / Custom endpoint
      const cleanBaseUrl = baseUrl.replace(/\/+$/, '');
      const modelsUrl = cleanBaseUrl.endsWith('/models') ? cleanBaseUrl : `${cleanBaseUrl}/models`;
      const res = await outboundProviderFetch(modelsUrl, {
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
      });
      if (!res.ok) {
        const errText = await res.text();
        return {
          ok: false,
          message: `Lỗi gọi API endpoint (${res.status}): ${errText.slice(0, 200)}`,
          models: PRESET_LLM_MODELS,
        };
      }
      const json = await res.json();
      const rawList = Array.isArray(json.data) ? json.data : Array.isArray(json.models) ? json.models : [];
      const models: LlmModelItem[] = rawList.map((m: any) => {
        const id = m.id || m.name?.replace(/^models\//, '') || String(m);
        return {
          id,
          name: m.name && m.name !== id ? `${m.name} (${id})` : id,
          description: m.description,
          source: 'api' as const,
        };
      });
      return {
        ok: true,
        message: `Lấy thành công ${models.length} mô hình từ API endpoint`,
        models: models.length > 0 ? models : PRESET_LLM_MODELS,
      };
    } else {
      // Google Gemini API
      // 1. Thử gọi Google Generative Language models API chính thức
      const geminiUrl = `https://generativelanguage.googleapis.com/v1beta/models?key=${encodeURIComponent(apiKey)}`;
      const res = await outboundProviderFetch(geminiUrl);
      if (res.ok) {
        const json = await res.json();
        if (Array.isArray(json.models)) {
          // Lọc các model hỗ trợ generateContent (chat/text completion)
          const filtered = json.models.filter((m: any) => {
            if (!m.supportedGenerationMethods) return true;
            return m.supportedGenerationMethods.includes('generateContent');
          });
          const models: LlmModelItem[] = filtered.map((m: any) => {
            const rawName = m.name || '';
            const id = rawName.replace(/^models\//, '');
            const displayName = m.displayName || id;
            return {
              id,
              name: displayName !== id ? `${displayName} (${id})` : id,
              description: m.description,
              source: 'api' as const,
            };
          });

          // Sắp xếp: ưu tiên các model mới lên đầu (gemini-2.5, gemini-2.0, gemini-1.5)
          models.sort((a, b) => {
            const getScore = (id: string) => {
              if (id.includes('2.5')) return 30;
              if (id.includes('2.0')) return 20;
              if (id.includes('1.5')) return 10;
              return 0;
            };
            return getScore(b.id) - getScore(a.id);
          });

          return {
            ok: true,
            message: `Lấy thành công ${models.length} mô hình từ Google Gemini API`,
            models,
          };
        }
      }

      // 2. Dự phòng: Thử gọi qua OpenAI compatible endpoint của Gemini
      const openaiModelsUrl = 'https://generativelanguage.googleapis.com/v1beta/openai/models';
      const resOpenAi = await outboundProviderFetch(openaiModelsUrl, {
        headers: { Authorization: `Bearer ${apiKey}` },
      });
      if (resOpenAi.ok) {
        const json = await resOpenAi.json();
        if (Array.isArray(json.data)) {
          const models: LlmModelItem[] = json.data.map((m: any) => ({
            id: m.id,
            name: m.id,
            source: 'api' as const,
          }));
          return {
            ok: true,
            message: `Lấy thành công ${models.length} mô hình từ Gemini API`,
            models,
          };
        }
      }

      // Nếu cả hai đều thất bại, lấy thông báo lỗi chi tiết
      const errText = !res.ok ? await res.text() : 'Không thể giải mã dữ liệu models';
      let parsedError = errText;
      try {
        const errJson = JSON.parse(errText);
        if (errJson?.error?.message) parsedError = errJson.error.message;
      } catch {}

      return {
        ok: false,
        message: `Lỗi kết nối Gemini API: ${parsedError.slice(0, 200)}`,
        models: PRESET_LLM_MODELS,
      };
    }
  } catch (e) {
    return {
      ok: false,
      message: e instanceof Error ? e.message : 'Không thể kết nối tới máy chủ AI',
      models: PRESET_LLM_MODELS,
    };
  }
}

export async function testAiAgentAction(
  prompt: string,
  employeeId?: number,
): Promise<Result & { result?: AiAgentTestResult }> {
  const ctx = await requirePermission('FEATURE_SETTING_ZALO');
  if (employeeId && employeeId !== ctx.employeeId && !ctx.isAdmin) {
    return { ok: false, message: 'Chỉ quản trị viên được kiểm thử dưới danh tính khác' };
  }
  const cleanPrompt = prompt.trim();
  if (!cleanPrompt) {
    return { ok: false, message: 'Vui lòng nhập câu hỏi thử nghiệm cho AI Agent' };
  }
  const testRes = await runAiAgentTest(cleanPrompt, employeeId ?? ctx.employeeId);
  if (!testRes.ok) {
    return { ok: false, message: testRes.error || testRes.reply || 'Kiểm thử Agent thất bại', result: testRes };
  }
  return { ok: true, message: 'Kiểm thử thành công', result: testRes };
}

/**
 * Server action làm sạch dữ liệu cũ và nạp lại toàn bộ dữ liệu mẫu (Seed Demo)
 * Chỉ tài khoản ADMIN hoặc có quyền FEATURE_SETTING_GENERAL mới được phép chạy.
 */
export async function resetDemoDataAction(options?: { clean?: boolean }): Promise<Result> {
  const ctx = await requirePermission('FEATURE_SETTING_GENERAL');

  try {
    const shouldClean = options?.clean ?? true;
    await runFullDemoSeed(prisma, { clean: shouldClean });

    await prisma.auditLog.create({
      data: {
        actorId: ctx.userId,
        entityType: 'SystemDatabase',
        entityId: 'DEMO_SEED',
        action: 'UPDATE',
        diffJson: { clean: shouldClean, timestamp: new Date().toISOString() } as never,
      },
    });

    // Revalidate toàn bộ các đường dẫn chính
    revalidatePath('/', 'layout');
    revalidatePath('/dashboard');
    revalidatePath('/tasks');
    revalidatePath('/equipment');
    revalidatePath('/spare-parts');
    revalidatePath('/sales');
    revalidatePath('/tickets');
    revalidatePath('/documents');
    revalidatePath('/customers');
    revalidatePath('/employees');
    revalidatePath('/departments');
    revalidatePath('/attendance');
    revalidatePath('/leaves');
    revalidatePath('/approvals');
    revalidatePath('/reports');
    revalidatePath('/settings');

    return {
      ok: true,
      message: shouldClean
        ? 'Đã làm sạch dữ liệu cũ và nạp lại dữ liệu mẫu Demo thành công!'
        : 'Đã nạp bổ sung dữ liệu mẫu Demo thành công!',
    };
  } catch (error: unknown) {
    const msg = error instanceof Error ? error.message : 'Nạp dữ liệu mẫu thất bại';
    console.error('Lỗi khi nạp dữ liệu mẫu:', error);
    return { ok: false, message: `Thao tác thất bại: ${msg}` };
  }
}

