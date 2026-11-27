/** Tiện ích hội thoại trong Không gian 3D (thuần TS, test được). */

export const BUBBLE_MAX_CHARS = 120;
export const TYPING_TTL_MS = 4000;
export const TYPING_THROTTLE_MS = 2000;

/** Thời gian hiện bong bóng tỉ lệ độ dài câu: 4–10 giây (đọc ~16 ký tự/giây). */
export function bubbleTtlMs(text: string): number {
  return Math.round(Math.min(10_000, Math.max(4000, 2500 + text.length * 62)));
}

/** Thời gian "đang nói" (nhép miệng) — ngắn hơn thời gian hiển thị. */
export function talkDurationMs(text: string): number {
  return Math.round(Math.min(6000, 700 + text.length * 55));
}

/** Cắt câu dài cho bong bóng (đầy đủ vẫn nằm trong khung chat). */
export function clipBubbleText(text: string, max = BUBBLE_MAX_CHARS): string {
  const t = text.replace(/\s+/g, ' ').trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const sp = cut.lastIndexOf(' ');
  return `${(sp > max * 0.6 ? cut.slice(0, sp) : cut).trimEnd()}…`;
}

export type SpaceEmote = 'wave' | 'nod' | 'bow' | 'clap' | 'brew';
export const SPACE_EMOTES: { key: SpaceEmote; label: string; icon: string }[] = [
  { key: 'wave', label: 'Vẫy tay', icon: '👋' },
  { key: 'nod', label: 'Gật đầu', icon: '🙂' },
  { key: 'bow', label: 'Cúi chào', icon: '🙇' },
  { key: 'clap', label: 'Vỗ tay', icon: '👏' },
];
export const EMOTE_DURATION_MS = 1600;
export function isSpaceEmote(v: unknown): v is SpaceEmote {
  return v === 'wave' || v === 'nod' || v === 'bow' || v === 'clap' || v === 'brew';
}
