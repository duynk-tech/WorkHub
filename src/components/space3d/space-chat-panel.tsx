'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, MessageCircle, Send, X } from 'lucide-react';
import type { SpaceDmMessage, SpaceDmThread } from '@/lib/space-3d-types';
import {
  listSpaceDmMessagesAction,
  listSpaceDmThreadsAction,
  markSpaceDmReadAction,
  sendSpaceDmAction,
} from '@/server/modules/space3d/actions';
import type { IncomingDm } from './use-space-realtime';

export interface ChatPeer {
  employeeId: number;
  name: string;
  department: string | null;
}

interface Props {
  myEmployeeId: number;
  open: boolean;
  peer: ChatPeer | null;
  onPeerChange: (peer: ChatPeer | null) => void;
  onClose: () => void;
  onUnreadChange: (total: number) => void;
  /** Kênh nhận tin realtime: panel đăng ký handler vào ref này */
  dmHandlerRef: React.MutableRefObject<((dm: IncomingDm) => void) | null>;
  onlineIds: Set<number>;
  glassStyle: React.CSSProperties;
}

type LocalMsg = SpaceDmMessage & { pending?: boolean; failed?: boolean; tempKey?: string };

const timeFmt = new Intl.DateTimeFormat('vi-VN', { hour: '2-digit', minute: '2-digit' });
const dayFmt = new Intl.DateTimeFormat('vi-VN', { day: '2-digit', month: '2-digit' });

function fmtTime(iso: string) {
  const d = new Date(iso);
  const today = new Date();
  return d.toDateString() === today.toDateString() ? timeFmt.format(d) : `${dayFmt.format(d)} ${timeFmt.format(d)}`;
}

export function SpaceChatPanel({
  myEmployeeId,
  open,
  peer,
  onPeerChange,
  onClose,
  onUnreadChange,
  dmHandlerRef,
  onlineIds,
  glassStyle,
}: Props) {
  const [threads, setThreads] = useState<SpaceDmThread[]>([]);
  const [messages, setMessages] = useState<LocalMsg[]>([]);
  const [hasMore, setHasMore] = useState(false);
  const [loadingMsgs, setLoadingMsgs] = useState(false);
  const [draft, setDraft] = useState('');
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const stickBottomRef = useRef(true);
  const peerRef = useRef(peer);
  peerRef.current = peer;
  const openRef = useRef(open);
  openRef.current = open;

  const refreshThreads = useCallback(async () => {
    const t = await listSpaceDmThreadsAction().catch(() => [] as SpaceDmThread[]);
    setThreads(t);
  }, []);

  // Tổng chưa đọc → badge HUD
  useEffect(() => {
    onUnreadChange(threads.reduce((acc, t) => acc + t.unread, 0));
  }, [threads, onUnreadChange]);

  useEffect(() => {
    void refreshThreads();
  }, [refreshThreads]);

  // Mở hội thoại → tải tin + đánh dấu đã đọc
  useEffect(() => {
    if (!peer || !open) return;
    let cancelled = false;
    setLoadingMsgs(true);
    setMessages([]);
    setError(null);
    stickBottomRef.current = true;
    (async () => {
      const res = await listSpaceDmMessagesAction(peer.employeeId).catch(() => ({ messages: [], hasMore: false }));
      if (cancelled) return;
      setMessages(res.messages);
      setHasMore(res.hasMore);
      setLoadingMsgs(false);
      await markSpaceDmReadAction(peer.employeeId).catch(() => undefined);
      setThreads((prev) => prev.map((t) => (t.otherEmployeeId === peer.employeeId ? { ...t, unread: 0 } : t)));
    })();
    return () => {
      cancelled = true;
    };
  }, [peer, open]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el && stickBottomRef.current) el.scrollTop = el.scrollHeight;
  }, [messages]);

  // Nhận tin realtime
  useEffect(() => {
    dmHandlerRef.current = (dm) => {
      const m = dm.message;
      const otherId = m.fromEmployeeId === myEmployeeId ? m.toEmployeeId : m.fromEmployeeId;
      const fromMe = m.fromEmployeeId === myEmployeeId;
      const viewing = openRef.current && peerRef.current?.employeeId === otherId;

      if (viewing) {
        setMessages((prev) => {
          if (prev.some((x) => x.id === m.id)) return prev;
          // Thay tin optimistic cùng nội dung (gửi từ tab này) nếu có
          const idx = prev.findIndex((x) => x.pending && x.body === m.body && fromMe);
          if (idx >= 0) {
            const next = prev.slice();
            next[idx] = m;
            return next;
          }
          return [...prev, m];
        });
        if (!fromMe) void markSpaceDmReadAction(otherId).catch(() => undefined);
      }

      setThreads((prev) => {
        const existing = prev.find((t) => t.otherEmployeeId === otherId);
        const updated: SpaceDmThread = {
          otherEmployeeId: otherId,
          otherName: existing?.otherName ?? (fromMe ? peerRef.current?.name ?? `Nhân viên #${otherId}` : dm.fromName),
          otherDepartment: existing?.otherDepartment ?? (fromMe ? peerRef.current?.department ?? null : dm.fromDepartment),
          lastBody: m.body,
          lastAt: m.createdAt,
          lastFromMe: fromMe,
          unread: (existing?.unread ?? 0) + (!fromMe && !viewing ? 1 : 0),
        };
        return [updated, ...prev.filter((t) => t.otherEmployeeId !== otherId)];
      });
    };
    return () => {
      dmHandlerRef.current = null;
    };
  }, [dmHandlerRef, myEmployeeId]);

  const loadOlder = async () => {
    if (!peer || !hasMore || loadingMsgs || messages.length === 0) return;
    const el = listRef.current;
    const prevHeight = el?.scrollHeight ?? 0;
    setLoadingMsgs(true);
    stickBottomRef.current = false;
    const res = await listSpaceDmMessagesAction(peer.employeeId, messages[0].id).catch(() => ({ messages: [], hasMore: false }));
    setMessages((prev) => [...res.messages, ...prev]);
    setHasMore(res.hasMore);
    setLoadingMsgs(false);
    requestAnimationFrame(() => {
      if (el) el.scrollTop = el.scrollHeight - prevHeight;
    });
  };

  const send = async () => {
    const body = draft.trim();
    if (!peer || !body) return;
    setDraft('');
    setError(null);
    stickBottomRef.current = true;
    const tempKey = `tmp-${Date.now()}`;
    const optimistic: LocalMsg = {
      id: -Date.now(),
      fromEmployeeId: myEmployeeId,
      toEmployeeId: peer.employeeId,
      body,
      createdAt: new Date().toISOString(),
      readAt: null,
      pending: true,
      tempKey,
    };
    setMessages((prev) => [...prev, optimistic]);
    const res = await sendSpaceDmAction(peer.employeeId, body);
    setMessages((prev) => {
      const realExists = res.data && prev.some((x) => x.id === res.data!.id);
      return prev
        .map((x) => {
          if (x.tempKey !== tempKey) return x;
          if (res.ok && res.data) return realExists ? null : res.data;
          return { ...x, pending: false, failed: true };
        })
        .filter((x): x is LocalMsg => x !== null);
    });
    if (!res.ok) setError(res.message);
    else if (res.data) {
      const d = res.data;
      setThreads((prev) => {
        const existing = prev.find((t) => t.otherEmployeeId === peer.employeeId);
        return [
          {
            otherEmployeeId: peer.employeeId,
            otherName: existing?.otherName ?? peer.name,
            otherDepartment: existing?.otherDepartment ?? peer.department,
            lastBody: d.body,
            lastAt: d.createdAt,
            lastFromMe: true,
            unread: existing?.unread ?? 0,
          },
          ...prev.filter((t) => t.otherEmployeeId !== peer.employeeId),
        ];
      });
    }
  };

  if (!open) return null;

  return (
    <div
      style={{
        ...glassStyle,
        position: 'fixed',
        right: 14,
        bottom: 92,
        zIndex: 40,
        width: 'min(360px, calc(100vw - 28px))',
        height: 'min(480px, calc(100vh - 180px))',
        borderRadius: 16,
        display: 'flex',
        flexDirection: 'column',
        overflow: 'hidden',
        boxShadow: '0 16px 40px rgba(0,0,0,0.4)',
      }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        {peer ? (
          <button type="button" onClick={() => onPeerChange(null)} style={iconBtn} aria-label="Quay lại danh sách">
            <ArrowLeft size={16} />
          </button>
        ) : (
          <MessageCircle size={16} color="#60a5fa" />
        )}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {peer ? peer.name : 'Tin nhắn'}
          </div>
          {peer && (
            <div style={{ fontSize: 11, color: onlineIds.has(peer.employeeId) ? '#34d399' : '#94a3b8' }}>
              {onlineIds.has(peer.employeeId) ? '● Đang trong không gian 3D' : peer.department || 'Ngoại tuyến'}
            </div>
          )}
        </div>
        <button type="button" onClick={onClose} style={iconBtn} aria-label="Đóng">
          <X size={16} />
        </button>
      </div>

      {!peer ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {threads.length === 0 ? (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: '#94a3b8', lineHeight: 1.6 }}>
              Chưa có cuộc trò chuyện nào.
              <br />
              Bấm vào nhân vật của đồng nghiệp trong không gian để nhắn tin.
            </div>
          ) : (
            threads.map((t) => (
              <button
                key={t.otherEmployeeId}
                type="button"
                onClick={() => onPeerChange({ employeeId: t.otherEmployeeId, name: t.otherName, department: t.otherDepartment })}
                style={{
                  width: '100%',
                  display: 'flex',
                  gap: 10,
                  alignItems: 'center',
                  padding: '10px 12px',
                  background: 'transparent',
                  border: 0,
                  borderBottom: '1px solid rgba(255,255,255,0.06)',
                  color: 'inherit',
                  textAlign: 'left',
                  cursor: 'pointer',
                }}
              >
                <div style={{ position: 'relative', width: 32, height: 32, borderRadius: 99, background: '#1e3a8a', display: 'grid', placeItems: 'center', fontSize: 13, fontWeight: 700, flexShrink: 0 }}>
                  {t.otherName.trim().split(/\s+/).pop()?.[0]?.toUpperCase() ?? '?'}
                  {onlineIds.has(t.otherEmployeeId) && (
                    <span style={{ position: 'absolute', right: -1, bottom: -1, width: 10, height: 10, borderRadius: 99, background: '#10b981', border: '2px solid #0f172a' }} />
                  )}
                </div>
                <div style={{ flex: 1, minWidth: 0 }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ fontSize: 13, fontWeight: t.unread ? 700 : 600, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{t.otherName}</span>
                    <span style={{ fontSize: 10.5, color: '#94a3b8', flexShrink: 0 }}>{fmtTime(t.lastAt)}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', gap: 6 }}>
                    <span style={{ fontSize: 12, color: t.unread ? '#e2e8f0' : '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                      {t.lastFromMe ? 'Bạn: ' : ''}
                      {t.lastBody}
                    </span>
                    {t.unread > 0 && (
                      <span style={{ fontSize: 10.5, fontWeight: 700, background: '#ef4444', color: '#fff', borderRadius: 99, padding: '0 6px', flexShrink: 0 }}>{t.unread}</span>
                    )}
                  </div>
                </div>
              </button>
            ))
          )}
        </div>
      ) : (
        <>
          <div
            ref={listRef}
            onScroll={(e) => {
              const el = e.currentTarget;
              stickBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40;
              if (el.scrollTop < 30) void loadOlder();
            }}
            style={{ flex: 1, overflowY: 'auto', padding: '10px 12px', display: 'flex', flexDirection: 'column', gap: 6 }}
          >
            {loadingMsgs && messages.length === 0 && <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center' }}>Đang tải…</div>}
            {!loadingMsgs && messages.length === 0 && (
              <div style={{ fontSize: 12, color: '#94a3b8', textAlign: 'center', marginTop: 20 }}>Gửi lời chào tới {peer.name} 👋</div>
            )}
            {messages.map((m) => {
              const mine = m.fromEmployeeId === myEmployeeId;
              return (
                <div key={m.tempKey ?? m.id} style={{ alignSelf: mine ? 'flex-end' : 'flex-start', maxWidth: '80%' }}>
                  <div
                    style={{
                      padding: '7px 11px',
                      borderRadius: 14,
                      borderBottomRightRadius: mine ? 4 : 14,
                      borderBottomLeftRadius: mine ? 14 : 4,
                      background: mine ? (m.failed ? '#7f1d1d' : '#2563eb') : 'rgba(255,255,255,0.1)',
                      fontSize: 13,
                      lineHeight: 1.45,
                      whiteSpace: 'pre-wrap',
                      wordBreak: 'break-word',
                      opacity: m.pending ? 0.65 : 1,
                    }}
                  >
                    {m.body}
                  </div>
                  <div style={{ fontSize: 10, color: '#64748b', marginTop: 2, textAlign: mine ? 'right' : 'left' }}>
                    {m.failed ? 'Gửi thất bại' : m.pending ? 'Đang gửi…' : fmtTime(m.createdAt)}
                  </div>
                </div>
              );
            })}
          </div>
          {error && <div style={{ fontSize: 11.5, color: '#fca5a5', padding: '0 12px 4px' }}>{error}</div>}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              void send();
            }}
            style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid rgba(255,255,255,0.1)' }}
          >
            <input
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              maxLength={1000}
              placeholder={`Nhắn cho ${peer.name}…`}
              autoFocus
              style={{
                flex: 1,
                minWidth: 0,
                padding: '8px 12px',
                borderRadius: 999,
                border: '1px solid rgba(255,255,255,0.15)',
                background: 'rgba(255,255,255,0.06)',
                color: '#f8fafc',
                fontSize: 13,
                outline: 'none',
              }}
            />
            <button
              type="submit"
              disabled={!draft.trim()}
              style={{ ...iconBtn, background: draft.trim() ? '#2563eb' : 'rgba(255,255,255,0.08)', color: '#fff', width: 36, height: 36, borderRadius: 99 }}
              aria-label="Gửi"
            >
              <Send size={15} />
            </button>
          </form>
        </>
      )}
    </div>
  );
}

const iconBtn: React.CSSProperties = {
  display: 'grid',
  placeItems: 'center',
  width: 28,
  height: 28,
  borderRadius: 8,
  border: 0,
  background: 'transparent',
  color: '#cbd5e1',
  cursor: 'pointer',
  flexShrink: 0,
};
