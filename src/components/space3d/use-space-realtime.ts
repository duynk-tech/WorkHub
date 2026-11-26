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

export interface IncomingDm {
  message: SpaceDmMessage;
  fromName: string;
  fromDepartment: string | null;
}

interface Options {
  sceneCode: string;
  /** null = khách (chỉ nghe, không track, không gửi) */
  self: Omit<RemotePlayerMeta, 'x' | 'z' | 'r'> | null;
  playerPosRef: React.MutableRefObject<{ x: number; z: number; rotY: number }>;
  onDm?: (dm: IncomingDm) => void;
  /** Khách tham quan nhắn cho nhân viên này (chế độ trả lời trực tiếp) */
  onGuest?: (evt: { guestKey: string; message: { id: number; fromGuest: boolean; body: string; createdAt: string; guestName: string } }) => void;
}

export type RealtimeStatus = 'off' | 'connecting' | 'live' | 'error';

const MOVE_INTERVAL_MS = 100;
const MOVE_EPS = 0.02;
const ROT_EPS = (2 * Math.PI) / 180;
const BUBBLE_TTL_MS = 5000;

function sanitizeMeta(raw: Record<string, unknown>): RemotePlayerMeta | null {
  const id = Number(raw.employeeId);
  if (!Number.isInteger(id) || id <= 0) return null;
  return {
    employeeId: id,
    employeeName: String(raw.employeeName ?? `Nhân viên #${id}`).slice(0, 80),
    department: raw.department ? String(raw.department).slice(0, 120) : null,
    avatar: normalizeAvatar3DConfig(raw.avatar),
    onDuty: Boolean(raw.onDuty),
    stationLabel: raw.stationLabel ? String(raw.stationLabel).slice(0, 120) : null,
    chatMode: raw.chatMode === 'AI' ? 'AI' : 'LIVE',
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
export function useSpaceRealtime({ sceneCode, self, playerPosRef, onDm, onGuest }: Options) {
  const [status, setStatus] = useState<RealtimeStatus>('off');
  const [roster, setRoster] = useState<RemotePlayerMeta[]>([]);
  const remoteStateRef = useRef(new Map<number, RemotePlayerState>());
  const bubbleRef = useRef(new Map<number, RemoteBubble>());
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
    let moveTimer: ReturnType<typeof setInterval> | null = null;
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    const lastSent = { x: NaN, z: NaN, r: NaN, moving: false };
    const remoteState = remoteStateRef.current;
    const bubbles = bubbleRef.current;

    const sendMove = (force = false) => {
      const ch = channelRef.current;
      const me = selfRef.current;
      if (!ch || !me) return;
      const p = playerPosRef.current;
      const dx = Math.abs(p.x - lastSent.x);
      const dz = Math.abs(p.z - lastSent.z);
      const dr = Math.abs(p.rotY - lastSent.r);
      const changed = Number.isNaN(lastSent.x) || dx > MOVE_EPS || dz > MOVE_EPS || dr > ROT_EPS;
      if (!changed && !force) {
        if (lastSent.moving) {
          // Gửi 1 gói "đã dừng" để bên kia tắt hoạt ảnh đi bộ
          lastSent.moving = false;
          void ch.send({ type: 'broadcast', event: 'move', payload: { id: me.employeeId, x: p.x, z: p.z, r: p.rotY, m: false } });
        }
        return;
      }
      lastSent.x = p.x;
      lastSent.z = p.z;
      lastSent.r = p.rotY;
      lastSent.moving = changed;
      void ch.send({ type: 'broadcast', event: 'move', payload: { id: me.employeeId, x: p.x, z: p.z, r: p.rotY, m: changed } });
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
      rosterIdsRef.current = ids;
      setRoster(next);
    };

    (async () => {
      setStatus('connecting');
      const session = await getRealtimeSessionAction().catch(() => null);
      if (cancelled) return;
      if (!session) {
        setStatus('off');
        return;
      }
      const isStaff = Boolean(session.token && selfRef.current);
      client = createClient(session.url, session.anonKey, {
        auth: { persistSession: false, autoRefreshToken: false },
        realtime: { params: { eventsPerSecond: 20 } },
      });
      if (session.token) await client.realtime.setAuth(session.token);

      const scheduleRefresh = (expiresAt: number | null) => {
        if (!expiresAt) return;
        const ms = Math.max(30_000, expiresAt * 1000 - Date.now() - 5 * 60_000);
        refreshTimer = setTimeout(async () => {
          const next = await getRealtimeSessionAction().catch(() => null);
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
          remoteState.set(id, { tx: x, tz: z, tr: r, moving: Boolean(payload.m), ts: Date.now() });
        })
        .on('broadcast', { event: 'bubble' }, ({ payload }) => {
          const id = Number(payload?.id);
          if (!rosterIdsRef.current.has(id)) return;
          const text = String(payload?.text ?? '').trim().slice(0, 140);
          if (text) bubbles.set(id, { text, expiresAt: Date.now() + BUBBLE_TTL_MS });
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

      if (isStaff) {
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
        void client.realtime.disconnect();
      }
      remoteState.clear();
      bubbles.clear();
      rosterIdsRef.current = new Set();
      setRoster([]);
      setStatus('off');
    };
  }, [sceneCode, selfId, playerPosRef]);

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
    const clean = text.trim().slice(0, 140);
    if (!ch || !me || !clean) return false;
    void ch.send({ type: 'broadcast', event: 'bubble', payload: { id: me.employeeId, text: clean } });
    bubbleRef.current.set(me.employeeId, { text: clean, expiresAt: Date.now() + BUBBLE_TTL_MS });
    return true;
  }, []);

  return { status, roster, remoteStateRef, bubbleRef, sendBubble };
}
