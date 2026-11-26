'use client';

import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { ArrowLeft, Send, Users, X } from 'lucide-react';
import {
  listGuestMessagesAction,
  listMyGuestThreadsAction,
  replyGuestAction,
  type GuestChatMessage,
} from '@/server/modules/space3d/actions';

export interface GuestEvent {
  guestKey: string;
  message: GuestChatMessage;
}

interface Thread {
  guestKey: string;
  guestName: string;
  lastBody: string;
  lastAt: string;
  lastFromGuest: boolean;
  unread: number;
}

/** Hộp thư khách tham quan của nhân viên (chế độ tự trả lời trực tiếp). */
export function SpaceGuestInbox({
  myEmployeeId,
  open,
  onClose,
  onUnreadChange,
  eventRef,
  onActiveGuest,
  glassStyle,
}: {
  myEmployeeId: number;
  open: boolean;
  onClose: () => void;
  onUnreadChange: (n: number) => void;
  eventRef: React.MutableRefObject<((e: GuestEvent) => void) | null>;
  onActiveGuest?: (guestKey: string | null) => void;
  glassStyle: React.CSSProperties;
}) {
  const [threads, setThreads] = useState<Thread[]>([]);
  const [active, setActive] = useState<string | null>(null);
  const [msgs, setMsgs] = useState<GuestChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [err, setErr] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const activeRef = useRef(active);
  activeRef.current = active;
  const openRef = useRef(open);
  openRef.current = open;

  useEffect(() => {
    listMyGuestThreadsAction()
      .then((t) => setThreads(t.map((x) => ({ ...x, unread: 0 }))))
      .catch(() => undefined);
  }, []);
  useEffect(() => onUnreadChange(threads.reduce((a, t) => a + t.unread, 0)), [threads, onUnreadChange]);
  useEffect(() => onActiveGuest?.(open ? active : null), [open, active, onActiveGuest]);

  useEffect(() => {
    eventRef.current = ({ guestKey, message }) => {
      const viewing = openRef.current && activeRef.current === guestKey;
      if (viewing) setMsgs((prev) => (prev.some((m) => m.id === message.id) ? prev : [...prev, message]));
      setThreads((prev) => {
        const ex = prev.find((t) => t.guestKey === guestKey);
        const next: Thread = {
          guestKey,
          guestName: message.guestName,
          lastBody: message.body,
          lastAt: message.createdAt,
          lastFromGuest: message.fromGuest,
          unread: (ex?.unread ?? 0) + (message.fromGuest && !viewing ? 1 : 0),
        };
        return [next, ...prev.filter((t) => t.guestKey !== guestKey)];
      });
    };
    return () => {
      eventRef.current = null;
    };
  }, [eventRef]);

  useEffect(() => {
    if (!active || !open) return;
    listGuestMessagesAction(active, myEmployeeId).then(setMsgs).catch(() => setMsgs([]));
    setThreads((prev) => prev.map((t) => (t.guestKey === active ? { ...t, unread: 0 } : t)));
  }, [active, open, myEmployeeId]);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  if (!open) return null;
  const thread = threads.find((t) => t.guestKey === active);

  const send = async () => {
    const text = draft.trim();
    if (!active || !text) return;
    setDraft('');
    setErr(null);
    const res = await replyGuestAction(active, text);
    if (!res.ok || !res.data) setErr(res.message);
    else setMsgs((prev) => (prev.some((m) => m.id === res.data!.id) ? prev : [...prev, res.data!]));
  };

  return (
    <div
      style={{ ...glassStyle, position: 'fixed', right: 14, bottom: 92, zIndex: 41, width: 'min(360px, calc(100vw - 28px))', height: 'min(480px, calc(100vh - 180px))', borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 16px 40px rgba(0,0,0,0.4)' }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        {active ? (
          <button type="button" onClick={() => setActive(null)} style={{ background: 'none', border: 0, color: '#cbd5e1', cursor: 'pointer' }} aria-label="Quay lại">
            <ArrowLeft size={16} />
          </button>
        ) : (
          <Users size={16} color="#34d399" />
        )}
        <div style={{ flex: 1, fontSize: 13.5, fontWeight: 700 }}>{thread ? thread.guestName : 'Khách đang hỏi'}</div>
        <button type="button" onClick={onClose} style={{ background: 'none', border: 0, color: '#94a3b8', cursor: 'pointer' }} aria-label="Đóng">
          <X size={16} />
        </button>
      </div>
      {!active ? (
        <div style={{ flex: 1, overflowY: 'auto' }}>
          {threads.length === 0 && (
            <div style={{ padding: 24, textAlign: 'center', fontSize: 12.5, color: '#94a3b8', lineHeight: 1.6 }}>
              Chưa có khách hỏi trong 24 giờ qua.
              <br />
              Khi bạn ở chế độ <b>Trả lời trực tiếp</b>, khách bấm vào nhân vật của bạn để hỏi.
            </div>
          )}
          {threads.map((t) => (
            <button
              key={t.guestKey}
              type="button"
              onClick={() => setActive(t.guestKey)}
              style={{ width: '100%', textAlign: 'left', padding: '10px 12px', border: 0, borderBottom: '1px solid rgba(255,255,255,0.06)', background: 'transparent', color: 'inherit', cursor: 'pointer', display: 'flex', gap: 8, alignItems: 'center' }}
            >
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontSize: 13, fontWeight: t.unread ? 700 : 600 }}>{t.guestName}</div>
                <div style={{ fontSize: 12, color: '#94a3b8', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                  {t.lastFromGuest ? '' : 'Bạn: '}
                  {t.lastBody}
                </div>
              </div>
              {t.unread > 0 && <span style={{ fontSize: 10.5, fontWeight: 700, background: '#ef4444', color: '#fff', borderRadius: 99, padding: '0 6px' }}>{t.unread}</span>}
            </button>
          ))}
        </div>
      ) : (
        <>
          <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: 12, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {msgs.map((m) => (
              <div
                key={m.id}
                style={{
                  alignSelf: m.fromGuest ? 'flex-start' : 'flex-end',
                  maxWidth: '80%',
                  padding: '7px 11px',
                  borderRadius: 14,
                  background: m.fromGuest ? 'rgba(255,255,255,0.1)' : '#16a34a',
                  fontSize: 13,
                  lineHeight: 1.45,
                  whiteSpace: 'pre-wrap',
                  wordBreak: 'break-word',
                }}
              >
                {m.body}
              </div>
            ))}
          </div>
          {err && <div style={{ fontSize: 11.5, color: '#fca5a5', padding: '0 12px 4px' }}>{err}</div>}
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
              autoFocus
              placeholder="Trả lời khách…"
              style={{ flex: 1, minWidth: 0, padding: '8px 12px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#f8fafc', fontSize: 13, outline: 'none' }}
            />
            <button type="submit" disabled={!draft.trim()} aria-label="Gửi" style={{ width: 36, height: 36, borderRadius: 99, border: 0, display: 'grid', placeItems: 'center', background: draft.trim() ? '#16a34a' : 'rgba(255,255,255,0.08)', color: '#fff', cursor: 'pointer' }}>
              <Send size={15} />
            </button>
          </form>
        </>
      )}
    </div>
  );
}
