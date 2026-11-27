'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { createClient, type RealtimeChannel, type SupabaseClient } from '@supabase/supabase-js';
import { getRealtimeSessionAction } from '@/server/modules/space3d/actions';
import {
  normalizeAvatar3DConfig,
  type RemoteBubble,
  type RemotePlayerMeta,
  type RemotePlayerState,
  type SpaceDmMessage,
} from '@/lib/space-3d-types';
import { bubbleTtlMs, clipBubbleText, isSpaceEmote, TYPING_THROTTLE_MS, TYPING_TTL_MS, type SpaceEmote } from '@/lib/space-3d-chat';

/** Ghi 1 câu mới vào bản đồ bong bóng (giữ câu trước để hiện nhỏ phía trên). */
export function pushBubble(map: Map<number, RemoteBubble>, id: number, raw: string, now = Date.now()) {
  const text = clipBubbleText(raw);
  if (!text) return;
  const old = map.get(id);
  const prev = old && old.expiresAt > now && old.text !== text ? old.text : undefined;
  map.set(id, { text, expiresAt: now + bubbleTtlMs(text), startedAt: now, prev });
}

export interface IncomingDm {
  message: SpaceDmMessage;
  fromName: string;
  fromDepartment: string | null;
}

interface Options {
  sceneCode: string;
  /** null = chưa vào (chỉ nghe). Khách tham quan có id âm (isGuest) */
  self: Omit<RemotePlayerMeta, 'x' | 'z' | 'r'> | null;
  /** Mã khách (khi chưa đăng nhập) để server cấp token tạm cho phép hiện nhân vật */
  guestKey?: string | null;
  playerPosRef: React.MutableRefObject<{ x: number; z: number; rotY: number; sit?: number }>;
  onDm?: (dm: IncomingDm) => void;
  /** Có đơn gọi món mới / đổi trạng thái (server phát) → tải lại danh sách đơn */
  onOrder?: () => void;
  /** Khách: nhân viên nhắn tới (kể cả nhân viên chủ động nhắn trước) */
  onGuestReply?: (p: { staffName: string; staffEmployeeId: number; body: string }) => void;
  /** Khách tham quan nhắn cho nhân viên này (chế độ trả lời trực tiếp) */
  onGuest?: (evt: { guestKey: string; message: { id: number; fromGuest: boolean; body: string; createdAt: string; guestName: string } }) => void;
}

export type RealtimeStatus = 'off' | 'connecting' | 'live' | 'error';

const MOVE_INTERVAL_MS = 100;
const MOVE_EPS = 0.02;
const ROT_EPS = (2 * Math.PI) / 180;

function sanitizeMeta(raw: Record<string, unknown>): RemotePlayerMeta | null {
  const id = Number(raw.employeeId);
  if (!Number.isInteger(id) || id === 0) return null;
  const isGuest = id < 0;
  return {
    employeeId: id,
    isGuest,
    employeeName: String(raw.employeeName ?? (isGuest ? 'Khách tham quan' : `Nhân viên #${id}`)).slice(0, 80),
    department: raw.department ? String(raw.department).slice(0, 120) : null,
    avatar: normalizeAvatar3DConfig(raw.avatar),
    onDuty: Boolean(raw.onDuty),
    stationLabel: raw.stationLabel ? String(raw.stationLabel).slice(0, 120) : null,
    chatMode: raw.chatMode === 'AI' ? 'AI' : 'LIVE',
    chatHandle: typeof raw.chatHandle === 'string' && raw.chatHandle.startsWith('v1.') ? raw.chatHandle.slice(0, 400) : undefined,
    x: Number(raw.x) || 0,
    z: Number(raw.z) || 0,
    r: Number(raw.r) || 0,
  };
}

/**
 * Kết nối Supabase Realtime cho Không gian 3D.
 * - Roster (Presence) → React state (đổi hiếm)
 * - Vị trí (Broadcast `move`) → mutate `remoteStateRef` (KHÔNG setState → giữ 60 FPS)
 * - Bong bóng chat gần (Broadcast `bubble`) → `bubbleRef`
 * - Tin nhắn 1-1 (kênh `dm:<id>`, server gửi) → callback `onDm`
 */
export function useSpaceRealtime({ sceneCode, self, guestKey = null, playerPosRef, onDm, onGuest, onOrder, onGuestReply }: Options) {
  const [status, setStatus] = useState<RealtimeStatus>('off');
  const [roster, setRoster] = useState<RemotePlayerMeta[]>([]);
  const remoteStateRef = useRef(new Map<number, RemotePlayerState>());
  const bubbleRef = useRef(new Map<number, RemoteBubble>());
  /** id → hạn hiển thị "đang nhập…" */
  const typingRef = useRef(new Map<number, number>());
  /** id → biểu cảm đang diễn */
  const emoteRef = useRef(new Map<number, { kind: SpaceEmote; at: number }>());
  const lastTypingSentRef = useRef(0);
  /** id → đồ uống đang cầm trên tay (mã món trong menu) */
  const holdRef = useRef(new Map<number, { code: string; at: number }>());
  const onOrderRef = useRef(onOrder);
  onOrderRef.current = onOrder;
  const onGuestReplyRef = useRef(onGuestReply);
  onGuestReplyRef.current = onGuestReply;
  const channelRef = useRef<RealtimeChannel | null>(null);
  const rosterIdsRef = useRef(new Set<number>());
  const selfRef = useRef(self);
  selfRef.current = self;
  const onDmRef = useRef(onDm);
  onDmRef.current = onDm;
  const onGuestRef = useRef(onGuest);
  onGuestRef.current = onGuest;

  const selfId = self?.employeeId ?? null;

  useEffect(() => {
    let cancelled = false;
    let client: SupabaseClient | null = null;
    let sceneChannel: RealtimeChannel | null = null;
    let dmChannel: RealtimeChannel | null = null;
    let guestChannel: RealtimeChannel | null = null;
    let moveTimer: ReturnType<typeof setInterval> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const lastSent = { x: NaN, z: NaN, r: NaN, moving: false, sit: 0 };
    const remoteState = remoteStateRef.current;
    const bubbles = bubbleRef.current;
    const typing = typingRef.current;
    const emotes = emoteRef.current;
    const holds = holdRef.current;

    const sendMove = (force = false) => {
      const ch = channelRef.current;
      const me = selfRef.current;
      if (!ch || !me) return;
      const p = playerPosRef.current;
      const dx = Math.abs(p.x - lastSent.x);
      const dz = Math.abs(p.z - lastSent.z);
      const dr = Math.abs(p.rotY - lastSent.r);
      const sit = p.sit ?? 0;
      const changed = Number.isNaN(lastSent.x) || dx > MOVE_EPS || dz > MOVE_EPS || dr > ROT_EPS || sit !== lastSent.sit;
      if (!changed && !force) {
        if (lastSent.moving) {
          // Gửi 1 gói "đã dừng" để bên kia tắt hoạt ảnh đi bộ
          lastSent.moving = false;
          void ch.send({ type: 'broadcast', event: 'move', payload: { id: me.employeeId, x: p.x, z: p.z, r: p.rotY, m: false, s: sit } });
        }
        return;
      }
      lastSent.x = p.x;
      lastSent.z = p.z;
      lastSent.r = p.rotY;
      lastSent.moving = changed && !sit;
      lastSent.sit = sit;
      void ch.send({ type: 'broadcast', event: 'move', payload: { id: me.employeeId, x: p.x, z: p.z, r: p.rotY, m: changed && !sit, s: sit } });
    };

    const rebuildRoster = (ch: RealtimeChannel) => {
      const state = ch.presenceState<Record<string, unknown>>();
      const next: RemotePlayerMeta[] = [];
      const ids = new Set<number>();
      for (const metas of Object.values(state)) {
        const meta = metas[metas.length - 1];
        if (!meta) continue;
        const m = sanitizeMeta(meta);
        if (!m || m.employeeId === selfRef.current?.employeeId || ids.has(m.employeeId)) continue;
        ids.add(m.employeeId);
        next.push(m);
        if (!remoteState.has(m.employeeId)) {
          remoteState.set(m.employeeId, { tx: m.x, tz: m.z, tr: m.r, moving: false, ts: Date.now() });
        }
      }
      for (const id of [...remoteState.keys()]) if (!ids.has(id)) remoteState.delete(id);
      for (const id of [...bubbles.keys()]) if (!ids.has(id)) bubbles.delete(id);
      for (const id of [...typing.keys()]) if (!ids.has(id)) typing.delete(id);
      for (const id of [...emotes.keys()]) if (!ids.has(id)) emotes.delete(id);
      for (const id of [...holds.keys()]) if (!ids.has(id) && id !== selfRef.current?.employeeId) holds.delete(id);
      rosterIdsRef.current = ids;
      setRoster(next);
    };

    (async () => {
      setStatus('connecting');
      const session = await getRealtimeSessionAction(guestKey ?? undefined).catch(() => null);
      if (cancelled) return;
      if (!session) {
        setStatus('off');
        return;
      }
      // Nhân viên & khách đã vào (có token) đều được hiện nhân vật + gửi vị trí
      const isStaff = Boolean(session.token && selfRef.current);
      const isEmployee = isStaff && (selfRef.current?.employeeId ?? 0) > 0;
      client = createClient(session.url, session.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 20 } },
      });
      if (session.token) await client.realtime.setAuth(session.token);

      const scheduleRefresh = (expiresAt: number | null) => {
        if (!expiresAt) return;
        const ms = Math.max(30_000, expiresAt * 1000 - Date.now() - 5 * 60_000);
        refreshTimer = setTimeout(async () => {
          const next = await getRealtimeSessionAction(guestKey ?? undefined).catch(() => null);
          if (cancelled || !client || !next?.token) return;
          await client.realtime.setAuth(next.token);
          scheduleRefresh(next.expiresAt);
        }, ms);
      };
      scheduleRefresh(session.expiresAt);

      sceneChannel = client.channel(`space:${sceneCode}`, {
        config: {
          private: true,
          broadcast: { self: false },
          presence: { key: isStaff ? String(selfRef.current!.employeeId) : '' },
        },
      });

      sceneChannel
        .on('presence', { event: 'sync' }, () => sceneChannel && rebuildRoster(sceneChannel))
        .on('presence', { event: 'join' }, () => {
          // Có người mới vào → gửi lại vị trí hiện tại để họ thấy ngay
          if (isStaff) sendMove(true);
        })
        .on('broadcast', { event: 'move' }, ({ payload }) => {
          const id = Number(payload?.id);
          if (!rosterIdsRef.current.has(id)) return; // bỏ qua id không có trong Presence
          const x = Number(payload.x);
          const z = Number(payload.z);
          const r = Number(payload.r);
          if (!Number.isFinite(x) || !Number.isFinite(z) || !Number.isFinite(r)) return;
          const sitH = Number(payload.s);
          remoteState.set(id, { tx: x, tz: z, tr: r, moving: Boolean(payload.m), ts: Date.now(), sit: Number.isFinite(sitH) && sitH > 0 && sitH < 1.5 ? sitH : 0 });
        })
        .on('broadcast', { event: 'bubble' }, ({ payload }) => {
          const id = Number(payload?.id);
          if (!rosterIdsRef.current.has(id)) return;
          const text = String(payload?.text ?? '').trim().slice(0, 400);
          if (text) {
            pushBubble(bubbles, id, text);
            typing.delete(id);
          }
        })
        .on('broadcast', { event: 'typing' }, ({ payload }) => {
          const id = Number(payload?.id);
          if (!rosterIdsRef.current.has(id)) return;
          if (payload?.on === false) typing.delete(id);
          else typing.set(id, Date.now() + TYPING_TTL_MS);
        })
        .on('broadcast', { event: 'emote' }, ({ payload }) => {
          const id = Number(payload?.id);
          if (!rosterIdsRef.current.has(id) || !isSpaceEmote(payload?.kind)) return;
          emotes.set(id, { kind: payload.kind, at: Date.now() });
        })
        .on('broadcast', { event: 'hold' }, ({ payload }) => {
          const id = Number(payload?.id);
          if (!rosterIdsRef.current.has(id)) return;
          const code = typeof payload?.code === 'string' ? payload.code.slice(0, 24) : null;
          if (code) holds.set(id, { code, at: Date.now() });
          else holds.delete(id);
        })
        .on('broadcast', { event: 'order' }, () => {
          onOrderRef.current?.();
        })
        .subscribe(async (st) => {
          if (cancelled) return;
          if (st === 'SUBSCRIBED') {
            channelRef.current = sceneChannel;
            setStatus('live');
            if (isStaff && sceneChannel) {
              const me = selfRef.current!;
              const p = playerPosRef.current;
              await sceneChannel.track({ ...me, x: p.x, z: p.z, r: p.rotY });
              sendMove(true);
              moveTimer = setInterval(() => sendMove(false), MOVE_INTERVAL_MS);
            }
          } else if (st === 'CHANNEL_ERROR' || st === 'TIMED_OUT') {
            setStatus('error');
          } else if (st === 'CLOSED') {
            setStatus('off');
          }
        });

      if (!isEmployee && guestKey) {
        // Khách nghe kênh riêng: nhân viên trả lời / chủ động nhắn trước
        guestChannel = client.channel(`gchat:${guestKey}`, { config: { private: true } });
        guestChannel
          .on('broadcast', { event: 'reply' }, ({ payload }) => {
            const id = Number(payload?.staffEmployeeId);
            const body = String(payload?.message?.body ?? '');
            if (Number.isInteger(id) && id > 0 && body) onGuestReplyRef.current?.({ staffName: String(payload?.staffName ?? 'Nhân viên'), staffEmployeeId: id, body });
          })
          .subscribe();
      }
      if (isEmployee) {
        dmChannel = client.channel(`dm:${selfRef.current!.employeeId}`, { config: { private: true } });
        dmChannel
          .on('broadcast', { event: 'dm' }, ({ payload }) => {
            if (payload?.message) onDmRef.current?.(payload as IncomingDm);
          })
          .on('broadcast', { event: 'guest' }, ({ payload }) => {
            if (payload?.guestKey && payload?.message) onGuestRef.current?.(payload as Parameters<NonNullable<Options['onGuest']>>[0]);
          })
          .subscribe();
      }
    })();

    return () => {
      cancelled = true;
      if (moveTimer) clearInterval(moveTimer);
      if (refreshTimer) clearTimeout(refreshTimer);
      channelRef.current = null;
      if (client) {
        if (sceneChannel) void client.removeChannel(sceneChannel);
        if (dmChannel) void client.removeChannel(dmChannel);
        if (guestChannel) void client.removeChannel(guestChannel);
        void client.realtime.disconnect();
      }
      remoteState.clear();
      bubbles.clear();
      typing.clear();
      emotes.clear();
      rosterIdsRef.current = new Set();
      setRoster([]);
      setStatus('off');
    };
  }, [sceneCode, selfId, guestKey, playerPosRef]);

  // Meta của bản thân đổi (diện mạo / vào trực) → track lại để người khác thấy ngay
  const selfKey = self ? JSON.stringify(self) : '';
  useEffect(() => {
    const ch = channelRef.current;
    if (!ch || !selfRef.current) return;
    const p = playerPosRef.current;
    void ch.track({ ...selfRef.current, x: p.x, z: p.z, r: p.rotY });
  }, [selfKey, playerPosRef]);

  const sendBubble = useCallback((text: string) => {
    const ch = channelRef.current;
    const me = selfRef.current;
    const clean = text.trim().slice(0, 400);
    if (!ch || !me || !clean) return false;
    void ch.send({ type: 'broadcast', event: 'bubble', payload: { id: me.employeeId, text: clean } });
    pushBubble(bubbleRef.current, me.employeeId, clean);
    lastTypingSentRef.current = 0;
    return true;
  }, []);

  /** Báo "đang nhập…" cho người xung quanh (tối đa 1 lần / 2 giây). on=false → tắt ngay. */
  const sendTyping = useCallback((on = true) => {
    const ch = channelRef.current;
    const me = selfRef.current;
    if (!ch || !me) return;
    const now = Date.now();
    if (on && now - lastTypingSentRef.current < TYPING_THROTTLE_MS) return;
    lastTypingSentRef.current = on ? now : 0;
    void ch.send({ type: 'broadcast', event: 'typing', payload: { id: me.employeeId, on } });
  }, []);

  /** Biểu cảm nhanh (vẫy tay, gật đầu, cúi chào, vỗ tay) — mọi người cùng thấy. */
  const sendEmote = useCallback((kind: SpaceEmote) => {
    const ch = channelRef.current;
    const me = selfRef.current;
    if (!me) return;
    emoteRef.current.set(me.employeeId, { kind, at: Date.now() });
    if (ch) void ch.send({ type: 'broadcast', event: 'emote', payload: { id: me.employeeId, kind } });
  }, []);

  /** Cầm / đặt ly nước (pantry) — mọi người cùng thấy. code = null → đặt ly xuống */
  const sendHold = useCallback((code: string | null) => {
    const ch = channelRef.current;
    const me = selfRef.current;
    if (!me) return;
    if (code) holdRef.current.set(me.employeeId, { code, at: Date.now() });
    else holdRef.current.delete(me.employeeId);
    if (ch) void ch.send({ type: 'broadcast', event: 'hold', payload: { id: me.employeeId, code } });
  }, []);

  /** Bong bóng chỉ hiện ở máy mình (ví dụ câu trả lời AI trên đầu nhân viên được hỏi). */
  const setLocalBubble = useCallback((id: number, text: string | null) => {
    if (!text) {
      bubbleRef.current.delete(id);
      return;
    }
    const clip = clipBubbleText(text);
    const cur = bubbleRef.current.get(id);
    const now = Date.now();
    // Đang chạy chữ: giữ nguyên lúc bắt đầu, chỉ cập nhật nội dung & gia hạn
    if (cur && cur.expiresAt > now && clip.startsWith(cur.text.replace(/…$/, '').slice(0, 20))) {
      bubbleRef.current.set(id, { ...cur, text: clip, expiresAt: now + bubbleTtlMs(clip) });
    } else {
      pushBubble(bubbleRef.current, id, text, now);
    }
  }, []);

  return { status, roster, remoteStateRef, bubbleRef, typingRef, emoteRef, holdRef, sendBubble, sendTyping, sendEmote, sendHold, setLocalBubble };
}
