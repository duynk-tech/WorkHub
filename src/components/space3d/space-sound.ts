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
  // Tiếng chim hót líu lo (chuỗi 2–4 tiếng quét tần số) — không gian sân vườn
  const chirp = () => {
    if (!alive) return;
    const n = 2 + Math.floor(Math.random() * 3);
    const base = 2600 + Math.random() * 1400;
    for (let i = 0; i < n; i++) {
      const o = ac.createOscillator();
      const g = ac.createGain();
      o.type = 'sine';
      const t = ac.currentTime + i * 0.13;
      o.frequency.setValueAtTime(base, t);
      o.frequency.exponentialRampToValueAtTime(base * (1.35 + Math.random() * 0.3), t + 0.07);
      o.frequency.exponentialRampToValueAtTime(base * 0.9, t + 0.11);
      g.gain.setValueAtTime(0, t);
      g.gain.linearRampToValueAtTime(volume * 0.35, t + 0.015);
      g.gain.exponentialRampToValueAtTime(0.0001, t + 0.12);
      o.connect(g).connect(ac.destination);
      o.start(t);
      o.stop(t + 0.13);
    }
    birdTimer = window.setTimeout(chirp, 5000 + Math.random() * 12000);
  };
  let birdTimer = window.setTimeout(chirp, 2000);
  return () => {
    alive = false;
    window.clearTimeout(timer);
    window.clearTimeout(birdTimer);
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

/**
 * Tiếng máy ô tô tổng hợp (không tải file): 2 dao động răng cưa lệch nhẹ qua lọc thấp, cao độ theo vòng tua
 * (tốc độ + chân ga) — kèm tiếng rít lốp (ồn trắng lọc dải) và tiếng va chạm. Âm lượng nhỏ.
 */
export interface EngineSound {
  /** speed m/s, throttle -1…1, skid đang trượt lốp */
  update(speed: number, throttle: number, skid: boolean): void;
  thud(strength: number): void;
  horn(on: boolean): void;
  stop(): void;
}

export function createEngineSound(volume = 0.05): EngineSound | null {
  const ac = audio();
  if (!ac) return null;
  const master = ac.createGain();
  master.gain.value = 0;
  master.gain.linearRampToValueAtTime(volume, ac.currentTime + 0.4);
  master.connect(ac.destination);
  const lp = ac.createBiquadFilter();
  lp.type = 'lowpass';
  lp.frequency.value = 420;
  lp.Q.value = 2;
  lp.connect(master);
  const oscs = [0, 7].map((det) => {
    const o = ac.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = 38;
    o.detune.value = det;
    o.connect(lp);
    o.start();
    return o;
  });
  // Ồn trắng dùng chung cho tiếng rít lốp
  const nlen = ac.sampleRate;
  const nbuf = ac.createBuffer(1, nlen, ac.sampleRate);
  const nd = nbuf.getChannelData(0);
  for (let i = 0; i < nlen; i++) nd[i] = Math.random() * 2 - 1;
  const noise = ac.createBufferSource();
  noise.buffer = nbuf;
  noise.loop = true;
  const bp = ac.createBiquadFilter();
  bp.type = 'bandpass';
  bp.frequency.value = 2200;
  bp.Q.value = 6;
  const skidGain = ac.createGain();
  skidGain.gain.value = 0;
  noise.connect(bp).connect(skidGain).connect(master);
  noise.start();
  // Còi xe: 2 nốt vuông lệch quãng 3
  const hornGain = ac.createGain();
  hornGain.gain.value = 0;
  hornGain.connect(master);
  const horns = [415, 523].map((f) => {
    const o = ac.createOscillator();
    o.type = 'square';
    o.frequency.value = f;
    o.connect(hornGain);
    o.start();
    return o;
  });
  // Số tự động giả lập: vòng tua tụt khi lên số
  const gears = [0, 4.5, 8.5, 12.5, 99];
  let rpmSmooth = 0;
  return {
    update(speed, throttle, skid) {
      const v = Math.abs(speed);
      let g = 0;
      while (v > gears[g + 1]) g++;
      const inGear = (v - gears[g]) / Math.max(1, Math.min(gears[g + 1], 16) - gears[g]);
      const rpm = 0.12 + Math.min(1, inGear) * 0.75 + Math.max(0, throttle) * 0.13;
      rpmSmooth += (rpm - rpmSmooth) * 0.15;
      const t = ac.currentTime;
      const f = 34 + rpmSmooth * 90;
      for (const o of oscs) o.frequency.setTargetAtTime(f, t, 0.05);
      lp.frequency.setTargetAtTime(300 + rpmSmooth * 900 + Math.max(0, throttle) * 400, t, 0.08);
      skidGain.gain.setTargetAtTime(skid ? 0.5 : 0, t, skid ? 0.03 : 0.12);
    },
    thud(strength) {
      const t = ac.currentTime;
      const o = ac.createOscillator();
      const g2 = ac.createGain();
      o.type = 'sine';
      o.frequency.setValueAtTime(90, t);
      o.frequency.exponentialRampToValueAtTime(40, t + 0.25);
      g2.gain.setValueAtTime(Math.min(1.5, strength * 0.12), t);
      g2.gain.exponentialRampToValueAtTime(0.0001, t + 0.35);
      o.connect(g2).connect(master);
      o.start(t);
      o.stop(t + 0.4);
    },
    horn(on) {
      hornGain.gain.setTargetAtTime(on ? 0.35 : 0, ac.currentTime, 0.015);
    },
    stop() {
      const t = ac.currentTime;
      master.gain.cancelScheduledValues(t);
      master.gain.setValueAtTime(master.gain.value, t);
      master.gain.linearRampToValueAtTime(0, t + 0.5);
      window.setTimeout(() => {
        for (const o of [...oscs, ...horns]) {
          try {
            o.stop();
          } catch {
            /* đã dừng */
          }
        }
        try {
          noise.stop();
        } catch {
          /* đã dừng */
        }
        master.disconnect();
      }, 600);
    },
  };
}
