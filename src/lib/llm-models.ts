export interface LlmModelItem {
  id: string;
  name: string;
  description?: string;
  source?: 'api' | 'preset';
}

export const PRESET_LLM_MODELS: LlmModelItem[] = [
  { id: 'gemini-2.5-flash', name: 'gemini-2.5-flash (Thế hệ mới 2025/2026 — Siêu tốc, tối ưu chi phí & Tool call)', source: 'preset' },
  { id: 'gemini-flash-lite-latest', name: 'gemini-flash-lite-latest (Luôn là bản Flash-Lite mới nhất — mặc định cho chat Showroom 3D)', source: 'preset' },
  { id: 'gemini-2.5-flash-lite', name: 'gemini-2.5-flash-lite (Siêu nhanh, chi phí thấp)', source: 'preset' },
  { id: 'gemini-2.5-pro', name: 'gemini-2.5-pro (Thế hệ mới 2025/2026 — Lập luận đa phương thức phức tạp)', source: 'preset' },
  { id: 'gemini-2.0-flash', name: 'gemini-2.0-flash (Thế hệ 2.0 — Function calling vượt trội, rất ổn định)', source: 'preset' },
  { id: 'gemini-2.0-flash-lite', name: 'gemini-2.0-flash-lite (Thế hệ 2.0 — Siêu nhẹ, độ trễ tối thiểu)', source: 'preset' },
  { id: 'gemini-1.5-flash', name: 'gemini-1.5-flash (Bản 1.5 ổn định, đa năng)', source: 'preset' },
  { id: 'gemini-1.5-pro', name: 'gemini-1.5-pro (Lập luận sâu, ngữ cảnh lớn 1M tokens)', source: 'preset' },
  { id: 'claude-3-5-sonnet', name: 'claude-3-5-sonnet (Claude 3.5 Sonnet — Đỉnh cao lập luận & Tool calling)', source: 'preset' },
  { id: 'claude-3-5-haiku', name: 'claude-3-5-haiku (Claude 3.5 Haiku — Siêu tốc độ, thông minh)', source: 'preset' },
  { id: 'gpt-4o', name: 'gpt-4o (OpenAI GPT-4o — Đa phương thức thông minh)', source: 'preset' },
  { id: 'gpt-4o-mini', name: 'gpt-4o-mini (OpenAI GPT-4o Mini — Nhanh, nhẹ, tiết kiệm)', source: 'preset' },
];
