'use client';

import { useEffect, useRef, useState, type FormEvent, type PointerEvent as ReactPointerEvent } from 'react';
import { LoaderCircle, RotateCcw, Send, Sparkles, X } from 'lucide-react';
import Image from 'next/image';
import { useCurrentUser } from './current-user';

type ChatMessage = { role: 'user' | 'assistant'; content: string };
type MiniMood = 'happy' | 'thinking' | 'curious' | 'excited';

function MiniMascot({ mood = 'happy', large = false }: { mood?: MiniMood; large?: boolean }) {
  const expression = mood === 'thinking' || mood === 'curious';
  return (
    <span className={`ai-mini-mascot is-${mood}${large ? ' is-large' : ''}`} aria-hidden="true">
      <Image src={expression ? '/ai/mini-mascot-thinking.png' : '/ai/mini-mascot.png'} alt="" width={256} height={256} draggable={false} />
    </span>
  );
}

const SUGGESTIONS = [
  'Tóm tắt công việc của tôi',
  'Tình hình đơn bán gần đây',
  'Tôi còn việc nào quá hạn không?',
];

export function AiChatWidget() {
  const user = useCurrentUser();
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<{ left: number; top: number } | null>(null);
  const [dragging, setDragging] = useState(false);
  const [hovered, setHovered] = useState(false);
  const [celebrating, setCelebrating] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const endRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);
  const launcherRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLElement>(null);
  const [panelPosition, setPanelPosition] = useState<{ left: number; top: number } | null>(null);
  const dragRef = useRef<{ pointerId: number; startX: number; startY: number; offsetX: number; offsetY: number; moved: boolean } | null>(null);
  const positionRef = useRef<{ left: number; top: number } | null>(null);
  const suppressClickRef = useRef(false);
  const suppressTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const reactionTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    if (open) endRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, sending, open]);

  useEffect(() => {
    if (!open) { setPanelPosition(null); return; }
    let frame = 0;
    const placePanel = () => {
      const launcher = launcherRef.current;
      const panel = panelRef.current;
      if (!launcher || !panel) return;
      const anchor = launcher.getBoundingClientRect();
      const popup = panel.getBoundingClientRect();
      const padding = 12;
      const panelWidth = Math.min(popup.width, window.innerWidth - padding * 2);
      const panelHeight = Math.min(popup.height, window.innerHeight - padding * 2);
      const hasRoomRight = window.innerWidth - anchor.right >= panelWidth + padding;
      const hasRoomLeft = anchor.left >= panelWidth + padding;
      let left = hasRoomRight
        ? anchor.right + padding
        : hasRoomLeft
          ? anchor.left - panelWidth - padding
          : anchor.left < window.innerWidth / 2
            ? window.innerWidth - panelWidth - padding
            : padding;
      let top = anchor.top - panelHeight - padding;
      if (top < padding) top = anchor.bottom + padding;
      left = Math.max(padding, Math.min(left, window.innerWidth - panelWidth - padding));
      top = Math.max(padding, Math.min(top, window.innerHeight - panelHeight - padding));
      setPanelPosition({ left, top });
    };
    const schedule = () => { cancelAnimationFrame(frame); frame = requestAnimationFrame(placePanel); };
    schedule();
    window.addEventListener('resize', schedule);
    return () => { cancelAnimationFrame(frame); window.removeEventListener('resize', schedule); };
  }, [open, position]);

  useEffect(() => {
    try {
      const saved = localStorage.getItem('workhub-mini-position');
      if (saved) {
        const parsed = JSON.parse(saved);
        if (Number.isFinite(parsed.left) && Number.isFinite(parsed.top)) {
          const safe = {
            left: Math.max(8, Math.min(parsed.left, window.innerWidth - 74)),
            top: Math.max(8, Math.min(parsed.top, window.innerHeight - 78)),
          };
          positionRef.current = safe;
          setPosition(safe);
        }
      }
    } catch { /* Vị trí mặc định ở góc phải nếu trình duyệt không hỗ trợ lưu trữ. */ }
    return () => {
      if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
      if (reactionTimerRef.current) clearTimeout(reactionTimerRef.current);
    };
  }, []);

  useEffect(() => {
    if (!position) return;
    const keepInViewport = () => {
      const left = Math.max(8, Math.min(position.left, window.innerWidth - 74));
      const top = Math.max(8, Math.min(position.top, window.innerHeight - 78));
      if (left !== position.left || top !== position.top) {
        const next = { left, top };
        positionRef.current = next;
        setPosition(next);
        localStorage.setItem('workhub-mini-position', JSON.stringify(next));
      }
    };
    window.addEventListener('resize', keepInViewport);
    return () => window.removeEventListener('resize', keepInViewport);
  }, [position]);

  function onDragStart(event: ReactPointerEvent<HTMLButtonElement>) {
    if (open || event.button !== 0) return;
    const rect = event.currentTarget.getBoundingClientRect();
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      offsetX: event.clientX - rect.left,
      offsetY: event.clientY - rect.top,
      moved: false,
    };
    event.currentTarget.setPointerCapture(event.pointerId);
  }

  function onDragMove(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) {
      const rect = event.currentTarget.getBoundingClientRect();
      const x = (event.clientX - rect.left) / rect.width - .5;
      const y = (event.clientY - rect.top) / rect.height - .5;
      event.currentTarget.style.setProperty('--mini-look-x', `${x * 12}deg`);
      event.currentTarget.style.setProperty('--mini-look-y', `${y * -8}deg`);
      return;
    }
    if (!drag.moved && Math.hypot(event.clientX - drag.startX, event.clientY - drag.startY) < 5) return;
    drag.moved = true;
    setDragging(true);
    const rect = event.currentTarget.getBoundingClientRect();
    const next = {
      left: Math.max(8, Math.min(event.clientX - drag.offsetX, window.innerWidth - rect.width - 8)),
      top: Math.max(8, Math.min(event.clientY - drag.offsetY, window.innerHeight - rect.height - 8)),
    };
    positionRef.current = next;
    setPosition(next);
  }

  function onDragEnd(event: ReactPointerEvent<HTMLButtonElement>) {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    if (event.currentTarget.hasPointerCapture(event.pointerId)) event.currentTarget.releasePointerCapture(event.pointerId);
    event.currentTarget.style.setProperty('--mini-look-x', '0deg');
    event.currentTarget.style.setProperty('--mini-look-y', '0deg');
    dragRef.current = null;
    setDragging(false);
    if (drag.moved) {
      suppressClickRef.current = true;
      if (suppressTimerRef.current) clearTimeout(suppressTimerRef.current);
      suppressTimerRef.current = setTimeout(() => { suppressClickRef.current = false; }, 350);
      if (positionRef.current) localStorage.setItem('workhub-mini-position', JSON.stringify(positionRef.current));
    }
  }

  async function sendMessage(value = draft) {
    const prompt = value.trim();
    if (!prompt || sending) return;
    const previous = messages;
    setDraft('');
    setError('');
    setMessages((current) => [...current, { role: 'user', content: prompt }]);
    setSending(true);

    try {
      const response = await fetch('/api/ai-chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt, history: previous.slice(-12) }),
      });
      const result = await response.json();
      if (!response.ok || !result.ok) throw new Error(result.error || 'Không thể kết nối trợ lý AI.');
      setMessages((current) => [...current, { role: 'assistant', content: result.reply }]);
      setCelebrating(true);
      if (reactionTimerRef.current) clearTimeout(reactionTimerRef.current);
      reactionTimerRef.current = setTimeout(() => setCelebrating(false), 1500);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Đã có lỗi khi gửi tin nhắn.');
    } finally {
      setSending(false);
      inputRef.current?.focus();
    }
  }

  function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    void sendMessage();
  }

  return (
    <div
      className={`ai-mini-root${dragging ? ' is-dragging' : ''}`}
      style={position ? { left: position.left, top: position.top, right: 'auto', bottom: 'auto' } : undefined}
    >
      {open && (
        <section
          ref={panelRef}
          className="ai-mini-panel"
          style={panelPosition ? { left: panelPosition.left, top: panelPosition.top, right: 'auto', bottom: 'auto' } : undefined}
          aria-label="Trợ lý AI Mini"
          aria-live="polite"
        >
          <header className="ai-mini-header">
            <div className="ai-mini-avatar"><MiniMascot mood={sending ? 'thinking' : celebrating ? 'excited' : 'happy'} /></div>
            <div className="ai-mini-heading">
              <strong>Mini · Trợ lý AI</strong>
              <span className={sending ? 'is-thinking' : ''}><i /> {sending ? 'Mini đang suy nghĩ...' : `Sẵn sàng hỗ trợ ${user?.fullName?.split(' ').at(-1) || 'bạn'}`}</span>
            </div>
            <button className="ai-mini-icon-button" type="button" onClick={() => setMessages([])} title="Cuộc trò chuyện mới" aria-label="Cuộc trò chuyện mới">
              <RotateCcw size={16} />
            </button>
            <button className="ai-mini-icon-button" type="button" onClick={() => setOpen(false)} title="Thu nhỏ" aria-label="Thu nhỏ trợ lý">
              <X size={18} />
            </button>
          </header>

          <div className="ai-mini-messages">
            {messages.length === 0 ? (
              <div className="ai-mini-welcome">
                <div className="ai-mini-welcome-avatar"><MiniMascot large /></div>
                <strong>Xin chào{user?.fullName ? ` ${user.fullName.split(' ').at(-1)}` : ''}!</strong>
                <p>Mình là Mini. Bạn cần tra cứu hay hỗ trợ công việc gì?</p>
                <div className="ai-mini-suggestions">
                  {SUGGESTIONS.map((item) => (
                    <button key={item} type="button" disabled={sending} onClick={() => void sendMessage(item)}>{item}</button>
                  ))}
                </div>
              </div>
            ) : messages.map((message, index) => (
              <div className={`ai-mini-message-row ${message.role}`} key={`${index}-${message.role}`}>
                {message.role === 'assistant' && <span className="ai-mini-message-avatar ai-mini-bot-avatar"><MiniMascot mood={celebrating ? 'excited' : 'happy'} /></span>}
                <div className="ai-mini-bubble">{message.content}</div>
              </div>
            ))}
            {sending && (
              <div className="ai-mini-message-row assistant">
                <span className="ai-mini-message-avatar ai-mini-bot-avatar ai-mini-thinking-mascot"><MiniMascot mood="thinking" /></span>
                <div className="ai-mini-bubble ai-mini-thinking"><i /><i /><i /><span>Mini đang suy nghĩ</span></div>
              </div>
            )}
            {error && <div className="ai-mini-error" role="alert">{error}</div>}
            <div ref={endRef} />
          </div>

          <form className="ai-mini-composer" onSubmit={onSubmit}>
            <textarea
              ref={inputRef}
              rows={1}
              value={draft}
              onChange={(event) => setDraft(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter' && !event.shiftKey) {
                  event.preventDefault();
                  void sendMessage();
                }
              }}
              placeholder="Nhắn tin cho Mini..."
              aria-label="Tin nhắn cho Mini"
              maxLength={3000}
              disabled={sending}
            />
            <button type="submit" disabled={!draft.trim() || sending} aria-label="Gửi tin nhắn">
              {sending ? <LoaderCircle size={17} className="ai-mini-spinner" /> : <Send size={17} />}
            </button>
            <small><Sparkles size={11} /> AI có thể mắc lỗi. Kiểm tra lại thông tin quan trọng.</small>
          </form>
        </section>
      )}

      <button
        ref={launcherRef}
        type="button"
        className={`ai-mini-launcher${open ? ' is-open' : ''}`}
        onPointerDown={onDragStart}
        onPointerMove={onDragMove}
        onPointerUp={onDragEnd}
        onPointerCancel={onDragEnd}
        onPointerEnter={() => setHovered(true)}
        onPointerLeave={(event) => {
          setHovered(false);
          event.currentTarget.style.setProperty('--mini-look-x', '0deg');
          event.currentTarget.style.setProperty('--mini-look-y', '0deg');
        }}
        onClick={() => {
          if (suppressClickRef.current) { suppressClickRef.current = false; return; }
          setOpen((value) => !value);
        }}
        aria-label={open ? 'Đóng trợ lý Mini' : 'Mở trợ lý Mini'}
        aria-expanded={open}
      >
        {open ? <X size={21} /> : <MiniMascot mood={sending ? 'thinking' : hovered ? 'curious' : 'happy'} />}
      </button>
    </div>
  );
}
