import * as THREE from 'three';

/** Texture procedural (canvas) cho nội thất — cache theo khoá, không tải file ngoài. */
const cache = new Map<string, THREE.Texture>();

function mk(key: string, w: number, h: number, draw: (ctx: CanvasRenderingContext2D, w: number, h: number) => void, srgb = true, repeat: [number, number] = [1, 1]) {
  const hit = cache.get(key);
  if (hit) return hit as THREE.CanvasTexture;
  const c = document.createElement('canvas');
  c.width = w;
  c.height = h;
  const ctx = c.getContext('2d')!;
  draw(ctx, w, h);
  const t = new THREE.CanvasTexture(c);
  t.wrapS = THREE.RepeatWrapping;
  t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(repeat[0], repeat[1]);
  t.anisotropy = 8;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  cache.set(key, t);
  return t;
}

const rnd = (seed: number) => () => {
  seed = (seed * 16807) % 2147483647;
  return (seed - 1) / 2147483646;
};

/** Vân gỗ (dùng làm map, nhân màu vật liệu để đổi tông gỗ). */
export function woodTex(): THREE.CanvasTexture {
  return mk('wood', 512, 512, (ctx, w, h) => {
    const r = rnd(7);
    ctx.fillStyle = '#d9b48a';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 120; i++) {
      const y = r() * h;
      const a = 0.05 + r() * 0.18;
      ctx.strokeStyle = `rgba(${90 + r() * 40},${55 + r() * 25},${30},${a})`;
      ctx.lineWidth = 0.6 + r() * 2.8;
      ctx.beginPath();
      ctx.moveTo(0, y);
      for (let x = 0; x <= w; x += 32) ctx.lineTo(x, y + Math.sin(x * 0.012 + i) * 6 + (r() - 0.5) * 3);
      ctx.stroke();
    }
    for (let i = 0; i < 6; i++) {
      const x = r() * w;
      const y = r() * h;
      const g = ctx.createRadialGradient(x, y, 1, x, y, 10 + r() * 14);
      g.addColorStop(0, 'rgba(80,45,20,0.45)');
      g.addColorStop(1, 'rgba(80,45,20,0)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.ellipse(x, y, 22, 8, 0, 0, Math.PI * 2);
      ctx.fill();
    }
  });
}

/** Đá marble trắng vân xám. */
export function marbleTex(): THREE.CanvasTexture {
  return mk('marble', 512, 512, (ctx, w, h) => {
    const r = rnd(11);
    ctx.fillStyle = '#f2f1ee';
    ctx.fillRect(0, 0, w, h);
    for (let i = 0; i < 18; i++) {
      ctx.strokeStyle = `rgba(110,110,118,${0.08 + r() * 0.22})`;
      ctx.lineWidth = 0.5 + r() * 2.2;
      ctx.beginPath();
      let x = r() * w;
      let y = 0;
      ctx.moveTo(x, y);
      while (y < h) {
        x += (r() - 0.5) * 40;
        y += 12 + r() * 24;
        ctx.lineTo(x, y);
      }
      ctx.stroke();
    }
  });
}

/** Vải dệt (map xám trung tính, nhân màu vải). */
export function fabricTex(): THREE.CanvasTexture {
  return mk(
    'fabric',
    256,
    256,
    (ctx, w, h) => {
      ctx.fillStyle = '#d4d4d4';
      ctx.fillRect(0, 0, w, h);
      for (let y = 0; y < h; y += 2) {
        ctx.fillStyle = y % 4 === 0 ? 'rgba(255,255,255,0.12)' : 'rgba(0,0,0,0.07)';
        ctx.fillRect(0, y, w, 1);
      }
      for (let x = 0; x < w; x += 2) {
        ctx.fillStyle = x % 4 === 0 ? 'rgba(255,255,255,0.08)' : 'rgba(0,0,0,0.05)';
        ctx.fillRect(x, 0, 1, h);
      }
    },
    true,
    [3, 3],
  );
}

/** Gạch thô (tường quán cà phê). */
export function brickTex(): THREE.CanvasTexture {
  return mk('brick', 512, 512, (ctx, w, h) => {
    const r = rnd(5);
    ctx.fillStyle = '#d6cfc4';
    ctx.fillRect(0, 0, w, h);
    const bh = 32;
    const bw = 96;
    for (let row = 0; row * bh < h; row++) {
      const off = row % 2 ? bw / 2 : 0;
      for (let x = -bw; x < w + bw; x += bw) {
        const base = [168 + r() * 30, 82 + r() * 22, 58 + r() * 16];
        ctx.fillStyle = `rgb(${base[0]},${base[1]},${base[2]})`;
        ctx.fillRect(x + off + 3, row * bh + 3, bw - 6, bh - 6);
        ctx.fillStyle = `rgba(0,0,0,${r() * 0.12})`;
        ctx.fillRect(x + off + 3, row * bh + 3, bw - 6, (bh - 6) * r());
      }
    }
  });
}

/** Sàn gỗ ván dài (quán cà phê / văn phòng). */
export function plankTex(): THREE.CanvasTexture {
  return mk('plank', 1024, 1024, (ctx, w, h) => {
    const r = rnd(3);
    const pw = 128;
    for (let x = 0; x < w; x += pw) {
      let y = -r() * 400;
      while (y < h) {
        const len = 300 + r() * 400;
        const t = 0.85 + r() * 0.3;
        ctx.fillStyle = `rgb(${Math.round(150 * t)},${Math.round(104 * t)},${Math.round(66 * t)})`;
        ctx.fillRect(x, y, pw, len);
        for (let i = 0; i < 14; i++) {
          ctx.strokeStyle = `rgba(70,40,20,${0.06 + r() * 0.12})`;
          ctx.lineWidth = 0.6 + r() * 1.6;
          const gx = x + r() * pw;
          ctx.beginPath();
          ctx.moveTo(gx, y);
          ctx.bezierCurveTo(gx + 6, y + len * 0.3, gx - 6, y + len * 0.7, gx + 2, y + len);
          ctx.stroke();
        }
        ctx.fillStyle = 'rgba(30,18,10,0.55)';
        ctx.fillRect(x, y + len - 2, pw, 2);
        y += len;
      }
      ctx.fillStyle = 'rgba(30,18,10,0.5)';
      ctx.fillRect(x + pw - 2, 0, 2, h);
    }
  });
}

/** Thảm tấm văn phòng. */
export function carpetTileTex(): THREE.CanvasTexture {
  return mk('carpetTile', 512, 512, (ctx, w, h) => {
    const r = rnd(9);
    const ts = 128;
    for (let y = 0; y < h; y += ts) {
      for (let x = 0; x < w; x += ts) {
        const g = 92 + r() * 14;
        ctx.fillStyle = `rgb(${g - 8},${g - 2},${g + 8})`;
        ctx.fillRect(x, y, ts, ts);
        for (let i = 0; i < 900; i++) {
          ctx.fillStyle = `rgba(${r() > 0.5 ? 255 : 0},${r() > 0.5 ? 255 : 0},255,${r() * 0.06})`;
          ctx.fillRect(x + r() * ts, y + r() * ts, 1.5, 1.5);
        }
        ctx.strokeStyle = 'rgba(0,0,0,0.12)';
        ctx.strokeRect(x + 0.5, y + 0.5, ts - 1, ts - 1);
      }
    }
  });
}

/** Lá cây (alpha) theo loài — thẻ lá dùng cho instancing. */
export function leafTex(kind: 'fiddle' | 'monstera' | 'palm' | 'snake'): THREE.CanvasTexture {
  return mk(`leaf:${kind}`, 256, 256, (ctx, w, h) => {
    ctx.clearRect(0, 0, w, h);
    const g = ctx.createLinearGradient(0, h, w * 0.2, 0);
    const [c1, c2] =
      kind === 'snake' ? ['#3f6b35', '#7aa35a'] : kind === 'palm' ? ['#3c7a32', '#77b34f'] : ['#1f5a2a', '#3f8c3c'];
    g.addColorStop(0, c1);
    g.addColorStop(1, c2);
    ctx.fillStyle = g;
    ctx.beginPath();
    if (kind === 'fiddle') {
      ctx.moveTo(128, 250);
      ctx.bezierCurveTo(20, 200, 10, 60, 128, 8);
      ctx.bezierCurveTo(246, 60, 236, 200, 128, 250);
    } else if (kind === 'monstera') {
      ctx.moveTo(128, 250);
      ctx.bezierCurveTo(-10, 210, 0, 30, 128, 10);
      ctx.bezierCurveTo(256, 30, 266, 210, 128, 250);
    } else if (kind === 'palm') {
      ctx.moveTo(128, 255);
      ctx.bezierCurveTo(112, 180, 112, 60, 128, 0);
      ctx.bezierCurveTo(144, 60, 144, 180, 128, 255);
    } else {
      ctx.moveTo(96, 255);
      ctx.bezierCurveTo(80, 160, 110, 40, 128, 0);
      ctx.bezierCurveTo(146, 40, 176, 160, 160, 255);
    }
    ctx.fill();
    // Gân lá
    ctx.strokeStyle = 'rgba(200,230,170,0.45)';
    ctx.lineWidth = 2.5;
    ctx.beginPath();
    ctx.moveTo(128, 250);
    ctx.lineTo(128, 12);
    ctx.stroke();
    if (kind === 'monstera' || kind === 'fiddle') {
      ctx.lineWidth = 1.2;
      for (let i = 0; i < 9; i++) {
        const y = 40 + i * 22;
        ctx.beginPath();
        ctx.moveTo(128, y + 14);
        ctx.quadraticCurveTo(90, y + 4, 40 + i * 2, y - 6);
        ctx.moveTo(128, y + 14);
        ctx.quadraticCurveTo(166, y + 4, 216 - i * 2, y - 6);
        ctx.stroke();
      }
    }
    if (kind === 'monstera') {
      // Khe xẻ đặc trưng
      ctx.globalCompositeOperation = 'destination-out';
      ctx.lineWidth = 9;
      for (let i = 0; i < 5; i++) {
        const y = 60 + i * 34;
        ctx.beginPath();
        ctx.moveTo(14, y);
        ctx.lineTo(88, y + 18);
        ctx.moveTo(242, y);
        ctx.lineTo(168, y + 18);
        ctx.stroke();
      }
      ctx.globalCompositeOperation = 'source-over';
    }
    if (kind === 'snake') {
      ctx.strokeStyle = 'rgba(20,50,20,0.35)';
      ctx.lineWidth = 3;
      for (let y = 30; y < 250; y += 16) {
        ctx.beginPath();
        ctx.moveTo(100, y);
        ctx.quadraticCurveTo(128, y - 6, 156, y);
        ctx.stroke();
      }
      ctx.strokeStyle = 'rgba(230,220,120,0.8)';
      ctx.lineWidth = 4;
      ctx.beginPath();
      ctx.moveTo(98, 255);
      ctx.bezierCurveTo(82, 160, 112, 40, 128, 2);
      ctx.moveTo(158, 255);
      ctx.bezierCurveTo(174, 160, 144, 40, 128, 2);
      ctx.stroke();
    }
  });
}

/** Mặt nhãn chữ (bảng hiệu, menu) — vẽ hi-res. */
export function labelTex(lines: { text: string; size: number; color: string; weight?: number; y: number }[], bg: string, w = 1024, h = 512): THREE.CanvasTexture {
  const key = `label:${bg}:${w}x${h}:${lines.map((l) => `${l.text}|${l.size}|${l.color}|${l.y}`).join(';')}`;
  return mk(
    key,
    w,
    h,
    (ctx) => {
      ctx.fillStyle = bg;
      ctx.fillRect(0, 0, w, h);
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      for (const l of lines) {
        ctx.fillStyle = l.color;
        ctx.font = `${l.weight ?? 700} ${l.size}px Inter, "Segoe UI", system-ui, sans-serif`;
        ctx.fillText(l.text, w / 2, l.y, w - 40);
      }
    },
    true,
  );
}
