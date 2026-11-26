import { z } from 'zod';
const short = z.string().max(500);
const text = z.string().max(20000);
const secret = z.string().max(4096);
const flag = z.boolean();
const number = (min: number, max: number) => z.union([z.number(), z.string().regex(/^\d+(\.\d+)?$/)]).pipe(z.coerce.number().min(min).max(max));
const ai = {
  'ai.geminiApiKey': secret, 'ai.baseUrl': short, 'ai.model': short,
  'ai.systemPrompt': text, 'ai.temperature': number(0, 1), 'ai.maxIterations': number(1, 10),
};
export const SETTINGS_POLICIES = {
  sso: { permission: 'FEATURE_SETTING_GENERAL', schema: z.object({
    'sso.google.enabled': flag, 'sso.google.clientId': short, 'sso.google.clientSecret': secret,
    'sso.google.domains': z.string().max(2000),
  }).partial().strict() },
  general: { permission: 'FEATURE_SETTING_GENERAL', schema: z.object({
    'app.name': short, 'app.logoText': short, 'app.logoUrl': short, 'app.description': short,
    'company.name': short, 'company.shortName': short, 'company.address': short, 'company.taxCode': short, 'company.phone': short,
    'print.watermarkEnabled': flag, 'print.watermarkUrl': short, 'print.watermarkOpacity': number(0, 100),
    'inventory.salesFulfillmentMode': z.enum(['MANUAL_WAREHOUSE_APPROVAL', 'AUTO_DEDUCT']),
  }).partial().strict() },
  zalo: { permission: 'FEATURE_SETTING_ZALO', schema: z.object({
    ...ai, 'zalo.enabled': flag, 'zalo.botToken': secret, 'zalo.webhookSecret': secret,
    'zalo.webhookUrl': short, 'zalo.quietHoursStart': short, 'zalo.quietHoursEnd': short,
    'zalo.notifyTaskAssigned': flag, 'zalo.notifyTaskDue': flag, 'zalo.notifyLeaveSubmitted': flag,
    'zalo.notifyLeaveResult': flag, 'zalo.dailyDigestTime': short,
  }).partial().strict() },
  ai: { permission: 'FEATURE_SETTING_ZALO', schema: z.object(ai).partial().strict() },
  leave: { permission: 'FEATURE_SETTING_GENERAL', schema: z.object({
    'leave.annualDefaultDays': number(0, 366), 'leave.allowNegativeBalance': flag, 'leave.carryOverExpireMonth': number(1, 12),
  }).partial().strict() },
  attendance: { permission: 'FEATURE_SETTING_GENERAL', schema: z.object({
    'attendance.requireGeofence': flag, 'attendance.allowZaloCheckin': flag, 'attendance.autoAbsentAfterHours': number(0, 48),
  }).partial().strict() },
  reports: { permission: 'FEATURE_SETTING_GENERAL', schema: z.object({ 'reports.disabled': z.array(short).max(100) }).partial().strict() },
  menus: { permission: 'FEATURE_SETTING_GENERAL', schema: z.object({ 'menus.disabled': z.array(short).max(100) }).partial().strict() },
  mcp: { permission: 'FEATURE_MCP_MANAGE', schema: z.object({ 'mcp.disabledModules': z.array(short).max(100) }).partial().strict() },
} as const;
export const SECRET_SETTING_KEYS = new Set(['sso.google.clientSecret', 'zalo.botToken', 'zalo.webhookSecret', 'ai.geminiApiKey']);
export function settingsPolicy(group: string) {
  if (!Object.hasOwn(SETTINGS_POLICIES, group)) throw new Error('Nhóm cấu hình không hợp lệ');
  return SETTINGS_POLICIES[group as keyof typeof SETTINGS_POLICIES];
}
