'use server';

import { revalidatePath } from 'next/cache';
import { prisma } from '@/lib/prisma';
import { requireAuth, requirePermission } from '@/server/auth/context';
import { setSetting, getSetting } from './service';
import { getBotInfo, sendZaloMessage, setZaloWebhook, getZaloWebhookInfo, deleteZaloWebhook } from '@/server/modules/notify/zalo';
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
import { PRESET_LLM_MODELS, type LlmModelItem } from '@/lib/llm-models';
export type { LlmModelItem };

export interface Result { ok: boolean; message: string }

const SECRET_KEYS = new Set(['zalo.botToken', 'zalo.webhookSecret', 'ai.geminiApiKey']);

export async function saveSettingsAction(group: string, values: Record<string, unknown>): Promise<Result> {
  const permission = (group === 'zalo' || group === 'ai') ? 'FEATURE_SETTING_ZALO' : 'FEATURE_SETTING_GENERAL';
  const ctx = await requirePermission(permission);

  for (const [key, value] of Object.entries(values)) {
    // Bỏ qua ô secret người dùng không sửa (hiển thị dạng ********)
    if (SECRET_KEYS.has(key) && value === '********') continue;
    await setSetting(key, value, { group, isSecret: SECRET_KEYS.has(key) });
  }

  await prisma.auditLog.create({
    data: {
      actorId: ctx.userId, entityType: 'SystemSetting', entityId: group, action: 'UPDATE',
      diffJson: Object.fromEntries(Object.keys(values).map((k) => [k, SECRET_KEYS.has(k) ? '***' : values[k]])) as never,
    },
  });

  revalidatePath('/settings');
  revalidatePath('/settings/integrations');
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

  const send = await sendZaloMessage(
    recipientId,
    `🔔 **Tin nhắn thử từ ${process.env.APP_NAME || 'WorkHub'}**\n\nNếu bạn nhận được tin này, cấu hình bot **${botName}** đã hoạt động và hỗ trợ **Markdown** thành công!`,
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

export async function registerZaloWebhookAction(webhookUrl: string, secretToken?: string): Promise<Result & { info?: unknown }> {
  await requirePermission('FEATURE_SETTING_ZALO');
  const cleanUrl = webhookUrl.trim();
  if (!cleanUrl.startsWith('https://')) {
    return { ok: false, message: 'URL webhook phải bắt đầu bằng https:// theo yêu cầu của Zalo' };
  }
  // Nếu có secretToken truyền lên và khác '********', lưu vào DB luôn để đồng bộ
  if (secretToken && secretToken.trim() && secretToken !== '********') {
    await setSetting('zalo.webhookSecret', secretToken.trim(), { group: 'zalo', isSecret: true });
  }
  const result = await setZaloWebhook(cleanUrl, secretToken === '********' ? undefined : secretToken);
  if (!result.ok) {
    return { ok: false, message: `Đăng ký Webhook thất bại: ${result.error}` };
  }
  return { ok: true, message: 'Đã đăng ký Webhook thành công với Zalo Bot Platform!', info: result.data };
}

export async function getZaloWebhookInfoAction(): Promise<Result & { info?: unknown }> {
  await requirePermission('FEATURE_SETTING_ZALO');
  const result = await getZaloWebhookInfo();
  if (!result.ok) {
    return { ok: false, message: `Không lấy được thông tin Webhook: ${result.error}` };
  }
  return { ok: true, message: 'Thành công', info: result.data };
}

export async function deleteZaloWebhookAction(): Promise<Result> {
  await requirePermission('FEATURE_SETTING_ZALO');
  const result = await deleteZaloWebhook();
  if (!result.ok) {
    return { ok: false, message: `Hủy Webhook thất bại: ${result.error}` };
  }
  return { ok: true, message: 'Đã hủy Webhook thành công' };
}

export async function getCustomToolsAction(): Promise<CustomAgentTool[]> {
  await requirePermission('FEATURE_SETTING_ZALO');
  return await getCustomTools();
}

export async function saveCustomToolAction(
  toolData: Omit<CustomAgentTool, 'id'> & { id?: string },
): Promise<Result & { tool?: CustomAgentTool }> {
  await requirePermission('FEATURE_SETTING_ZALO');
  try {
    const saved = await saveCustomTool(toolData);
    revalidatePath('/settings/integrations');
    return { ok: true, message: 'Đã lưu công cụ tùy chỉnh', tool: saved };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Lưu công cụ tùy chỉnh thất bại' };
  }
}

export async function deleteCustomToolAction(toolId: string): Promise<Result> {
  await requirePermission('FEATURE_SETTING_ZALO');
  try {
    const ok = await deleteCustomTool(toolId);
    revalidatePath('/settings/integrations');
    return ok ? { ok: true, message: 'Đã xóa công cụ tùy chỉnh' } : { ok: false, message: 'Không tìm thấy công cụ' };
  } catch (e) {
    return { ok: false, message: e instanceof Error ? e.message : 'Xóa công cụ thất bại' };
  }
}

export async function toggleCustomToolAction(toolId: string, isActive: boolean): Promise<Result> {
  await requirePermission('FEATURE_SETTING_ZALO');
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
  await requirePermission('FEATURE_SETTING_ZALO');
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
      const res = await fetch(modelsUrl, {
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
      const res = await fetch(geminiUrl);
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
      const resOpenAi = await fetch(openaiModelsUrl, {
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


