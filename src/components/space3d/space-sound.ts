'use client';

/** Âm thanh nhẹ tạo bằng WebAudio (không tải file ngoài). */
let ctx: AudioContext | null = null;
function audio(): AudioContext | null {
  if (typeof window === 'undefined') return null;
  try {
    ctx ??= new (window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext)();
    if (ctx.state === 'suspended') void ctx.resume();
    return ctx;
  } catch {
    return null;
  }
}

/** Tiếng "ting" 2 nốt — báo đơn mới / khách mới. */
export function playChime(volume = 0.12) {
  const ac = audio();
  if (!ac) return;
  const t0 = ac.currentTime;
  [880, 1318.5].forEach((f, i) => {
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'sine';
    o.frequency.value = f;
    const t = t0 + i * 0.12;
    g.gain.setValueAtTime(0, t);
    g.gain.linearRampToValueAtTime(volume, t + 0.01);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.6);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + 0.65);
  });
}

/** Âm nền quán cà phê: tiếng ồn hồng lọc thấp + tiếng ly tách lác đác. Trả về hàm tắt. */
export function startCafeAmbience(volume = 0.05): () => void {
  const ac = audio();
  if (!ac) return () => {};
  const len = ac.sampleRate * 4;
  const buf = ac.createBuffer(1, len, ac.sampleRate);
  const d = buf.getChannelData(0);
  let b0 = 0;
  let b1 = 0;
  let b2 = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    b0 = 0.997 * b0 + w * 0.029;
    b1 = 0.985 * b1 + w * 0.032;
    b2 = 0.95 * b2 + w * 0.048;
    d[i] = (b0 + b1 + b2) * 0.35;
  }
  const src = ac.createBufferSource();
  src.buffer = buf;
  src.loop = true;
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 900;
  const gain = ac.createGain();
  gain.gain.value = 0;
  gain.gain.linearRampToValueAtTime(volume, ac.currentTime + 1.5);
  src.connect(lp).connect(gain).connect(ac.destination);
  src.start();
  // Tiếng thìa chạm ly ngẫu nhiên
  let alive = true;
  const clink = () => {
    if (!alive) return;
    const o = ac.createOscillator();
    const g = ac.createGain();
    o.type = 'triangle';
    o.frequency.value = 2400 + Math.random() * 1600;
    const t = ac.currentTime;
    g.gain.setValueAtTime(volume * 0.5, t);
    g.gain.exponentialRampToValueAtTime(0.0001, t + 0.25);
    o.connect(g).connect(ac.destination);
    o.start(t);
    o.stop(t + 0.3);
    timer = window.setTimeout(clink, 4000 + Math.random() * 9000);
  };
  let timer = window.setTimeout(clink, 3000);
  return () => {
    alive = false;
    window.clearTimeout(timer);
    const t = ac.currentTime;
    gain.gain.cancelScheduledValues(t);
    gain.gain.setValueAtTime(gain.gain.value, t);
    gain.gain.linearRampToValueAtTime(0, t + 0.6);
    window.setTimeout(() => {
      try {
        src.stop();
      } catch {
        /* đã dừng */
      }
    }, 700);
  };
}
