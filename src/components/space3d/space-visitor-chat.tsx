'use client';

import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Bot, MessageCircle, Send, Sparkles, X } from 'lucide-react';
import { createClient, type RealtimeChannel } from '@supabase/supabase-js';
import {
  getRealtimeSessionAction,
  listGuestMessagesAction,
  sendGuestMessageAction,
  type GuestChatMessage,
} from '@/server/modules/space3d/actions';
import { getOrCreateGuestKey } from '@/lib/space-3d-guest';

export interface VisitorChatTarget {
  employeeId: number;
  name: string;
  department: string | null;
  chatMode: 'LIVE' | 'AI';
  online: boolean;
  /** Sản phẩm đang bày tại quầy của nhân viên (AI ưu tiên tư vấn) */
  focusProductIds?: number[];
  focusLabel?: string | null;
  /** Câu hỏi gửi ngay khi mở (ví dụ khách bấm "Hỏi về sản phẩm này") */
  initialQuestion?: string;
  /** Mô tả máy mẫu (không có trong kho) để AI vẫn tư vấn được */
  focusNote?: string;
}

interface Props {
  target: VisitorChatTarget;
  /** Người hỏi là nhân viên đã đăng nhập (chỉ dùng chế độ AI; nhắn trực tiếp đi qua tin nhắn nội bộ) */
  askerIsStaff: boolean;
  guestName: string;
  onClose: () => void;
  glassStyle: React.CSSProperties;
}

type Msg = { id: string; role: 'user' | 'assistant' | 'staff'; text: string; streaming?: boolean };

const getGuestKey = getOrCreateGuestKey;

/** Hiện chữ chạy: nhả dần ký tự của `full` (kể cả sau khi luồng kết thúc), đuổi kịp nhanh hơn khi tụt xa. */
function useTypewriter(full: string): string {
  const [count, setCount] = useState(0);
  const countRef = useRef(0);
  useEffect(() => {
    if (countRef.current > full.length) countRef.current = 0;
    let raf = 0;
    let last = performance.now();
    const tick = (now: number) => {
      const dt = now - last;
      last = now;
      const behind = full.length - countRef.current;
      if (behind <= 0) return;
      const cps = 42 + behind * 2.5; // ký tự/giây, tăng khi bị bỏ xa
      countRef.current = Math.min(full.length, countRef.current + Math.max(1, Math.round((cps * dt) / 1000)));
      setCount(countRef.current);
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [full]);
  return full.slice(0, count);
}

/** Markdown tối giản: **đậm**, gạch đầu dòng, xuống dòng. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, i) => {
        const bullet = /^\s*[-*•]\s+/.test(line);
        const content = line.replace(/^\s*[-*•]\s+/, '');
        const parts = content.split(/(\*\*[^*]+\*\*)/g).map((p, j) =>
          p.startsWith('**') && p.endsWith('**') ? <strong key={j}>{p.slice(2, -2)}</strong> : <React.Fragment key={j}>{p}</React.Fragment>,
        );
        return (
          <div key={i} style={{ display: 'flex', gap: 6, minHeight: line ? undefined : 8 }}>
            {bullet && <span style={{ color: '#60a5fa' }}>•</span>}
            <span>{parts}</span>
          </div>
        );
      })}
    </>
  );
}

function AssistantBubble({ msg }: { msg: Msg }) {
  const shown = useTypewriter(msg.text);
  const typing = msg.streaming || shown.length < msg.text.length;
  return (
    <div style={{ alignSelf: 'flex-start', maxWidth: '88%', display: 'flex', gap: 7 }}>
      <div style={{ width: 24, height: 24, borderRadius: 99, flex: 'none', display: 'grid', placeItems: 'center', background: msg.role === 'assistant' ? 'linear-gradient(135deg,#7c3aed,#2563eb)' : '#16a34a' }}>
        {msg.role === 'assistant' ? <Sparkles size={13} color="#fff" /> : <MessageCircle size={13} color="#fff" />}
      </div>
      <div style={{ padding: '8px 11px', borderRadius: 14, borderTopLeftRadius: 4, background: 'rgba(255,255,255,0.09)', fontSize: 13, lineHeight: 1.55, wordBreak: 'break-word' }}>
        {shown ? <RichText text={shown} /> : <span style={{ color: '#94a3b8' }}>Đang suy nghĩ</span>}
        {typing && <span className="space3d-caret" aria-hidden />}
      </div>
    </div>
  );
}

export function SpaceVisitorChat({ target, askerIsStaff, guestName, onClose, glassStyle }: Props) {
  // Nhân viên bật AI, hoặc không online → trợ lý AI trả lời thay
  const useAi = askerIsStaff || target.chatMode === 'AI' || !target.online;
  const [aiMode, setAiMode] = useState(useAi);
  const [msgs, setMsgs] = useState<Msg[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const listRef = useRef<HTMLDivElement | null>(null);
  const guestKeyRef = useRef<string>('');
  const abortRef = useRef<AbortController | null>(null);

  useLayoutEffect(() => {
    const el = listRef.current;
    if (el) el.scrollTop = el.scrollHeight;
  }, [msgs]);

  // Lời chào
  useEffect(() => {
    setMsgs([
      {
        id: 'hello',
        role: aiMode ? 'assistant' : 'staff',
        text: aiMode
          ? `Xin chào! Mình là trợ lý AI${target.employeeId ? ` của **${target.name}**` : ` của **${target.name}**`}.${
              target.focusLabel ? ` Bạn đang ở **${target.focusLabel}** — hỏi mình về bất kỳ sản phẩm nào đang bày ở đây nhé.` : ' Bạn cần tìm máy, thiết bị hay phụ tùng nào? Mình sẽ tư vấn giá và tình trạng hàng trong kho.'
            }`
          : `Xin chào, mình là **${target.name}**${target.department ? ` (${target.department})` : ''}. Bạn cần hỗ trợ gì ạ?`,
      },
    ]);
  }, [aiMode, target.name, target.department, target.employeeId, target.focusLabel]);

  // ── Chế độ LIVE (khách ↔ nhân viên): tải lịch sử + nghe realtime, dự phòng polling ──
  const mergeLive = useCallback((list: GuestChatMessage[]) => {
    setMsgs((prev) => {
      const hello = prev.filter((m) => m.id === 'hello');
      return [...hello, ...list.map((m) => ({ id: `g${m.id}`, role: m.fromGuest ? ('user' as const) : ('staff' as const), text: m.body }))];
    });
  }, []);

  useEffect(() => {
    if (aiMode || askerIsStaff) return;
    guestKeyRef.current = getGuestKey();
    let cancelled = false;
    let channel: RealtimeChannel | null = null;
    let client: ReturnType<typeof createClient> | null = null;
    const load = async () => {
      const list = await listGuestMessagesAction(guestKeyRef.current, target.employeeId).catch(() => []);
      if (!cancelled && list.length) mergeLive(list);
    };
    void load();
    const poll = window.setInterval(load, 5000);
    (async () => {
      const session = await getRealtimeSessionAction().catch(() => null);
      if (!session || cancelled) return;
      client = createClient(session.url, session.anonKey, { auth: { persistSession: false, autoRefreshToken: false } });
      channel = client.channel(`gchat:${guestKeyRef.current}`, { config: { private: true } });
      channel.on('broadcast', { event: 'reply' }, () => void load()).subscribe();
    })();
    return () => {
      cancelled = true;
      window.clearInterval(poll);
      if (client && channel) void client.removeChannel(channel);
    };
  }, [aiMode, askerIsStaff, target.employeeId, mergeLive]);

  const sendLive = async (text: string) => {
    setBusy(true);
    const res = await sendGuestMessageAction(target.employeeId, guestKeyRef.current, guestName, text);
    setBusy(false);
    if (!res.ok || !res.data) {
      setError(res.message);
      return;
    }
    setMsgs((prev) => [...prev, { id: `g${res.data!.id}`, role: 'user', text }]);
  };

  // ── Chế độ AI: stream chữ từ /api/space3d/ai-chat ──
  const sendAi = async (text: string) => {
    const history = [...msgs.filter((m) => m.id !== 'hello' && m.role !== 'staff'), { id: `u${Date.now()}`, role: 'user' as const, text }];
    const assistantId = `a${Date.now()}`;
    setMsgs((prev) => [...prev, history[history.length - 1], { id: assistantId, role: 'assistant', text: '', streaming: true }]);
    setBusy(true);
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    try {
      const res = await fetch('/api/space3d/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        signal: ctrl.signal,
        body: JSON.stringify({
          staffEmployeeId: target.employeeId || null,
          focusProductIds: target.focusProductIds ?? [],
          focusNote: target.focusNote,
          guestKey: askerIsStaff ? undefined : getGuestKey(),
          messages: history.slice(-12).map((m) => ({ role: m.role === 'user' ? 'user' : 'assistant', content: m.text })),
        }),
      });
      if (!res.ok || !res.body) {
        const err = await res.json().catch(() => ({ error: 'Trợ lý AI đang bận, vui lòng thử lại.' }));
        throw new Error(err.error || 'Trợ lý AI đang bận');
      }
      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let acc = '';
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        acc += decoder.decode(value, { stream: true });
        const snapshot = acc;
        setMsgs((prev) => prev.map((m) => (m.id === assistantId ? { ...m, text: snapshot } : m)));
      }
      setMsgs((prev) => prev.map((m) => (m.id === assistantId ? { ...m, streaming: false, text: m.text || 'Xin lỗi, mình chưa có câu trả lời phù hợp.' } : m)));
    } catch (e) {
      if ((e as Error).name === 'AbortError') return;
      setMsgs((prev) => prev.map((m) => (m.id === assistantId ? { ...m, streaming: false, text: `⚠️ ${(e as Error).message}` } : m)));
    } finally {
      setBusy(false);
      abortRef.current = null;
    }
  };

  useEffect(() => () => abortRef.current?.abort(), []);

  // Câu hỏi khởi tạo (bấm "Hỏi về sản phẩm này") → gửi ngay sau lời chào
  const sentInitial = useRef(false);
  useEffect(() => {
    if (!aiMode || !target.initialQuestion || sentInitial.current) return;
    sentInitial.current = true;
    const t = window.setTimeout(() => void sendAi(target.initialQuestion!), 350);
    return () => window.clearTimeout(t);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const submit = () => {
    const text = draft.trim();
    if (!text || busy) return;
    setDraft('');
    setError(null);
    if (aiMode) void sendAi(text);
    else void sendLive(text);
  };

  const suggestions = ['Máy pha cà phê nào đang có sẵn?', 'Giá máy xay bao nhiêu?', 'Tư vấn thiết bị mở quán cà phê nhỏ'];

  return (
    <div
      style={{ ...glassStyle, position: 'fixed', right: 14, bottom: 92, zIndex: 41, width: 'min(380px, calc(100vw - 28px))', height: 'min(520px, calc(100vh - 180px))', borderRadius: 16, display: 'flex', flexDirection: 'column', overflow: 'hidden', boxShadow: '0 16px 40px rgba(0,0,0,0.4)' }}
      onKeyDown={(e) => e.stopPropagation()}
    >
      <style>{`.space3d-caret{display:inline-block;width:2px;height:1.05em;margin-left:2px;vertical-align:-2px;background:#60a5fa;animation:space3dBlink .9s steps(1) infinite}@keyframes space3dBlink{50%{opacity:0}}`}</style>
      <div style={{ display: 'flex', alignItems: 'center', gap: 9, padding: '10px 12px', borderBottom: '1px solid rgba(255,255,255,0.1)' }}>
        <div style={{ width: 30, height: 30, borderRadius: 99, display: 'grid', placeItems: 'center', background: aiMode ? 'linear-gradient(135deg,#7c3aed,#2563eb)' : '#16a34a' }}>
          {aiMode ? <Bot size={16} color="#fff" /> : <MessageCircle size={15} color="#fff" />}
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <div style={{ fontSize: 13.5, fontWeight: 700, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
            {aiMode ? `Trợ lý AI · ${target.name}` : target.name}
          </div>
          <div style={{ fontSize: 11, color: aiMode ? '#c4b5fd' : '#34d399' }}>
            {aiMode ? 'Tư vấn sản phẩm trong kho · trả lời tức thì' : '● Nhân viên đang trả lời trực tiếp'}
          </div>
        </div>
        {!askerIsStaff && target.online && target.chatMode === 'LIVE' && (
          <button
            type="button"
            onClick={() => setAiMode((v) => !v)}
            style={{ fontSize: 11, padding: '5px 8px', borderRadius: 99, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.06)', color: '#e2e8f0', cursor: 'pointer' }}
          >
            {aiMode ? 'Gặp nhân viên' : 'Hỏi trợ lý AI'}
          </button>
        )}
        <button type="button" onClick={onClose} aria-label="Đóng" style={{ background: 'none', border: 0, color: '#94a3b8', cursor: 'pointer' }}>
          <X size={16} />
        </button>
      </div>

      <div ref={listRef} style={{ flex: 1, overflowY: 'auto', padding: '12px', display: 'flex', flexDirection: 'column', gap: 9 }}>
        {msgs.map((m) =>
          m.role === 'user' ? (
            <div key={m.id} style={{ alignSelf: 'flex-end', maxWidth: '82%', padding: '8px 11px', borderRadius: 14, borderTopRightRadius: 4, background: '#2563eb', fontSize: 13, lineHeight: 1.5, whiteSpace: 'pre-wrap', wordBreak: 'break-word' }}>
              {m.text}
            </div>
          ) : (
            <AssistantBubble key={m.id} msg={m} />
          ),
        )}
        {aiMode && msgs.length <= 1 && (
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, marginTop: 4 }}>
            {suggestions.map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => {
                  setDraft('');
                  void sendAi(s);
                }}
                style={{ fontSize: 11.5, padding: '6px 10px', borderRadius: 99, border: '1px solid rgba(167,139,250,0.4)', background: 'rgba(124,58,237,0.15)', color: '#ddd6fe', cursor: 'pointer' }}
              >
                {s}
              </button>
            ))}
          </div>
        )}
      </div>
      {error && <div style={{ fontSize: 11.5, color: '#fca5a5', padding: '0 12px 4px' }}>{error}</div>}
      <form
        onSubmit={(e) => {
          e.preventDefault();
          submit();
        }}
        style={{ display: 'flex', gap: 6, padding: 10, borderTop: '1px solid rgba(255,255,255,0.1)' }}
      >
        <input
          value={draft}
          onChange={(e) => setDraft(e.target.value)}
          maxLength={1000}
          autoFocus
          placeholder={aiMode ? 'Hỏi về máy, thiết bị, giá…' : `Nhắn cho ${target.name}…`}
          style={{ flex: 1, minWidth: 0, padding: '8px 12px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.06)', color: '#f8fafc', fontSize: 13, outline: 'none' }}
        />
        <button
          type="submit"
          disabled={!draft.trim() || busy}
          aria-label="Gửi"
          style={{ width: 36, height: 36, borderRadius: 99, border: 0, display: 'grid', placeItems: 'center', cursor: 'pointer', background: draft.trim() && !busy ? (aiMode ? '#7c3aed' : '#2563eb') : 'rgba(255,255,255,0.08)', color: '#fff' }}
        >
          <Send size={15} />
        </button>
      </form>
    </div>
  );
}
