import * as THREE from 'three';
import type { Avatar3DConfig, SpaceStructure } from '@/lib/space-3d-types';
import { NPC_PROFILES, consultantPatrol, findNpcSpots, pickerPatrol, localToWorld, pickPatronSeats, serveRoute, type NpcRole, type NpcSpot, type PatronSeat } from '@/lib/space-3d-npc';
import { DEFAULT_CAFE_MENU } from '@/lib/space-3d-cafe-menu';
import type { CafeMenuItem, DrinkOrderView } from '@/lib/space-3d-cafe-menu';
import { sharedMat } from './materials';
import {
  animateAvatarIdle,
  createChibiAvatar,
  disposeObject,
  poseEmote,
  poseSit,
  poseTalk,
  poseWalk,
  relaxPose,
  syncBubble,
  type AnimatedAvatar,
  type BubbleSlot,
} from './avatars';
import { buildDrink } from './props/drinks';

/**
 * Nhân vật tự động quán cà phê (chạy cục bộ ở mỗi máy, không qua realtime):
 * barista pha chế, chị bán bánh quê, người phục vụ bưng khay ra bàn, bảo vệ chào khách ở cổng.
 */

const LOOKS: Record<NpcRole, Avatar3DConfig> = {
  barista: { outfitStyle: 'shirt', outfitColor: '#f8fafc', pantsColor: '#1f2937', bottomStyle: 'pants', hairStyle: 'short', hairColor: '#1c1917', skinTone: '#e8b994', hasGlasses: false },
  vendor: { outfitStyle: 'shirt', outfitColor: '#7c4a2d', pantsColor: '#1f1f1f', bottomStyle: 'pants', hairStyle: 'bun', hairColor: '#1c1310', skinTone: '#e4b48d', hasGlasses: false },
  waiter: { outfitStyle: 'polo', outfitColor: '#8a5a35', pantsColor: '#1f1f1f', bottomStyle: 'pants', hairStyle: 'ponytail', hairColor: '#2b1b14', skinTone: '#f3cfb3', hasGlasses: false },
  guard: { outfitStyle: 'shirt', outfitColor: '#4d5d3a', pantsColor: '#3a4630', bottomStyle: 'pants', hairStyle: 'short', hairColor: '#111111', skinTone: '#d9a77f', hasGlasses: false },
  receptionist: { outfitStyle: 'uniform', outfitColor: '#1e3a8a', pantsColor: '#1f2937', bottomStyle: 'skirt', hairStyle: 'bun', hairColor: '#1c1310', skinTone: '#f3cfb3', hasGlasses: false },
  demo: { outfitStyle: 'shirt', outfitColor: '#111827', pantsColor: '#1f2937', bottomStyle: 'pants', hairStyle: 'slick', hairColor: '#1c1917', skinTone: '#e4b48d', hasGlasses: false },
  consultant: { outfitStyle: 'uniform', outfitColor: '#1e3a8a', pantsColor: '#334155', bottomStyle: 'pants', hairStyle: 'short', hairColor: '#111111', skinTone: '#e8b994', hasGlasses: true },
  labtech: { outfitStyle: 'shirt', outfitColor: '#f8fafc', pantsColor: '#e5e7eb', bottomStyle: 'pants', hairStyle: 'ponytail', hairColor: '#2b1b14', skinTone: '#f6d5bd', hasGlasses: false },
  storekeeper: { outfitStyle: 'polo', outfitColor: '#1e3a8a', pantsColor: '#1f2937', bottomStyle: 'pants', hairStyle: 'short', hairColor: '#111111', skinTone: '#d9a77f', hasGlasses: true },
  picker: { outfitStyle: 'shirt', outfitColor: '#475569', pantsColor: '#1e293b', bottomStyle: 'pants', hairStyle: 'short', hairColor: '#1c1917', skinTone: '#c98f65', hasGlasses: false },
  loader: { outfitStyle: 'polo', outfitColor: '#334155', pantsColor: '#3f3f46', bottomStyle: 'pants', hairStyle: 'short', hairColor: '#111111', skinTone: '#b97f56', hasGlasses: false },
};

// ───────────── Phụ kiện ─────────────
const apronMat = (color = '#5b3a22') => sharedMat(`npc:apron:${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.8 }));
function khanRanTex() {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  ctx.fillStyle = '#f5f5f4';
  ctx.fillRect(0, 0, 128, 128);
  ctx.fillStyle = '#1f2937';
  for (let y = 0; y < 128; y += 16) for (let x = (y / 16) % 2 ? 0 : 8; x < 128; x += 16) ctx.fillRect(x, y, 8, 8);
  ctx.fillStyle = 'rgba(31,41,55,0.45)';
  for (let i = 0; i < 128; i += 16) {
    ctx.fillRect(i + 3, 0, 2, 128);
    ctx.fillRect(0, i + 3, 128, 2);
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.repeat.set(3, 2);
  return t;
}
const khanRanMat = () => sharedMat('npc:khanran', () => new THREE.MeshStandardMaterial({ map: khanRanTex(), roughness: 0.85, side: THREE.DoubleSide }));

function addApron(av: AnimatedAvatar, color?: string) {
  const apron = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.5, 0.012), apronMat(color));
  apron.position.set(0, 0.86, 0.128);
  apron.rotation.x = 0.04;
  const bib = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.012), apronMat(color));
  bib.position.set(0, 1.2, 0.118);
  av.group.add(apron, bib);
}
function addKhanRan(av: AnimatedAvatar) {
  // Khăn rằn quấn đầu: chỏm cầu phủ đỉnh đầu + mối buộc sau gáy
  const cap = new THREE.Mesh(new THREE.SphereGeometry(0.138, 20, 12, 0, Math.PI * 2, 0, Math.PI * 0.42), khanRanMat());
  cap.scale.set(1.0, 0.95, 1.08);
  cap.position.y = 0.02;
  cap.rotation.x = -0.18;
  const knot = new THREE.Mesh(new THREE.SphereGeometry(0.035, 10, 8), khanRanMat());
  knot.position.set(0, 0.03, -0.14);
  av.headGroup.add(cap, knot);
}
/** Mũ trùm tóc vải trắng (phòng Lab thực phẩm) */
function addHairnet(av: AnimatedAvatar) {
  const net = new THREE.Mesh(
    new THREE.SphereGeometry(0.145, 18, 10, 0, Math.PI * 2, 0, Math.PI * 0.5),
    sharedMat('npc:hairnet', () => new THREE.MeshStandardMaterial({ color: '#f8fafc', roughness: 0.95 })),
  );
  net.scale.set(1, 0.9, 1.08);
  net.position.y = 0.025;
  net.rotation.x = -0.15;
  av.headGroup.add(net);
}
/** Áo phản quang (gilê vàng neon + 2 sọc bạc) — trước & sau thân */
function addSafetyVest(av: AnimatedAvatar) {
  const neon = sharedMat('npc:vest', () => new THREE.MeshStandardMaterial({ color: '#d4f20a', roughness: 0.6, emissive: '#3a4a00', emissiveIntensity: 0.25 }));
  const strip = sharedMat('npc:vestStrip', () => new THREE.MeshStandardMaterial({ color: '#e5e7eb', metalness: 0.6, roughness: 0.25 }));
  for (const sz of [1, -1]) {
    const panel = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.4, 0.012), neon);
    panel.position.set(0, 1.08, sz * 0.13);
    av.group.add(panel);
    for (const y of [0.98, 1.12]) {
      const st = new THREE.Mesh(new THREE.BoxGeometry(0.302, 0.025, 0.014), strip);
      st.position.set(0, y, sz * 0.131);
      av.group.add(st);
    }
  }
}
/** Mũ bảo hộ nhựa (vàng / trắng) có vành */
function addHardHat(av: AnimatedAvatar, color: string) {
  const mat = sharedMat(`npc:hat:${color}`, () => new THREE.MeshStandardMaterial({ color, roughness: 0.35 }));
  const dome = new THREE.Mesh(new THREE.SphereGeometry(0.15, 20, 10, 0, Math.PI * 2, 0, Math.PI * 0.5), mat);
  dome.scale.set(1, 0.85, 1.1);
  dome.position.y = 0.05;
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.175, 0.18, 0.012, 22), mat);
  brim.scale.set(1, 1, 1.15);
  brim.position.set(0, 0.05, 0.015);
  const ridge = new THREE.Mesh(new THREE.BoxGeometry(0.03, 0.02, 0.26), mat);
  ridge.position.set(0, 0.175, 0);
  av.headGroup.add(dome, brim, ridge);
}
/** Thùng carton bưng trước ngực */
function makeCarton(): THREE.Mesh {
  const m = new THREE.Mesh(
    new THREE.BoxGeometry(0.4, 0.28, 0.3),
    sharedMat('npc:carton', () => new THREE.MeshStandardMaterial({ color: '#b0875a', roughness: 0.85 })),
  );
  m.position.set(0, 1.0, 0.33);
  return m;
}
function addGuardCap(av: AnimatedAvatar) {
  const olive = sharedMat('npc:guardCap', () => new THREE.MeshStandardMaterial({ color: '#3f4a2f', roughness: 0.7 }));
  const crown = new THREE.Mesh(new THREE.CylinderGeometry(0.13, 0.125, 0.07, 22), olive);
  crown.position.set(0, 0.125, 0);
  const top = new THREE.Mesh(new THREE.CylinderGeometry(0.14, 0.13, 0.025, 22), olive);
  top.position.set(0, 0.165, 0.005);
  const brim = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.09, 0.012, 16, 1, false, -Math.PI / 2, Math.PI), sharedMat('npc:brim', () => new THREE.MeshStandardMaterial({ color: '#111111', roughness: 0.3 })));
  brim.position.set(0, 0.095, 0.1);
  brim.rotation.x = -0.15;
  const badge = new THREE.Mesh(new THREE.CircleGeometry(0.02, 12), sharedMat('npc:badge', () => new THREE.MeshStandardMaterial({ color: '#d4a017', metalness: 0.8, roughness: 0.3 })));
  badge.position.set(0, 0.13, 0.127);
  av.headGroup.add(crown, top, brim, badge);
}
function makeTray(): THREE.Group {
  const tray = new THREE.Group();
  const steel = sharedMat('npc:tray', () => new THREE.MeshStandardMaterial({ color: '#d1d5db', metalness: 0.85, roughness: 0.25 }));
  const plate = new THREE.Mesh(new THREE.CylinderGeometry(0.17, 0.165, 0.012, 28), steel);
  const rim = new THREE.Mesh(new THREE.TorusGeometry(0.168, 0.007, 6, 28), steel);
  rim.rotation.x = Math.PI / 2;
  rim.position.y = 0.008;
  tray.add(plate, rim);
  return tray;
}

// ───────────── Khách quen ngồi quán ─────────────
const PATRON_LOOKS: Avatar3DConfig[] = [
  { outfitStyle: 'shirt', outfitColor: '#e0e7ef', pantsColor: '#334155', bottomStyle: 'pants', hairStyle: 'short', hairColor: '#1c1917', skinTone: '#eac09c', hasGlasses: true },
  { outfitStyle: 'dress', outfitColor: '#be7c8f', pantsColor: '#1f2937', bottomStyle: 'pants', hairStyle: 'long', hairColor: '#2b1b14', skinTone: '#f6d5bd', hasGlasses: false },
  { outfitStyle: 'polo', outfitColor: '#3f6e57', pantsColor: '#6b5a45', bottomStyle: 'pants', hairStyle: 'slick', hairColor: '#111111', skinTone: '#d9a77f', hasGlasses: false },
  { outfitStyle: 'shirt', outfitColor: '#f3e6cf', pantsColor: '#3b4a5e', bottomStyle: 'skirt', hairStyle: 'bob', hairColor: '#3a2418', skinTone: '#f3cfb3', hasGlasses: false },
  { outfitStyle: 'polo', outfitColor: '#1e3a5f', pantsColor: '#cbbf9f', bottomStyle: 'pants', hairStyle: 'short', hairColor: '#2b2118', skinTone: '#e4b48d', hasGlasses: false },
  { outfitStyle: 'shirt', outfitColor: '#9a5b3a', pantsColor: '#1f2937', bottomStyle: 'pants', hairStyle: 'ponytail', hairColor: '#1c1310', skinTone: '#f1c9a5', hasGlasses: true },
];
const PATRON_DRINKS = ['CFSD', 'BACXIU', 'TRADAO', 'LATTE', 'MATCHA', 'CAPU'];

interface Patron {
  av: AnimatedAvatar;
  seat: PatronSeat;
  cupOnTable: THREE.Group;
  cupInHand: THREE.Group;
  /** Thời điểm bắt đầu nhấp ly kế tiếp */
  nextSip: number;
  sipStart: number;
  /** Lượt nói (cặp đôi đổi lượt) */
  talkUntil: number;
  nextTalk: number;
  phase: number;
}

// ───────────── Hệ thống NPC ─────────────
interface Npc {
  role: NpcRole;
  av: AnimatedAvatar;
  home: NpcSpot;
  bubble: BubbleSlot;
  bubbleUntil: number;
  walkTime: number;
  /** Đường đi còn lại */
  path: { x: number; z: number }[];
  /** Đang làm gì */
  mode: 'work' | 'walk' | 'greet' | 'deliver' | 'return';
  greetUntil: number;
  /** Người đã được chào gần đây: id → lúc chào */
  greeted: Map<string, number>;
  tray?: THREE.Group;
  carrying?: { orderId: number; cups: THREE.Group };
  nextPatrolAt: number;
  stuckTime: number;
  /** Điểm đi tuần (ngoài bảo vệ) */
  patrol?: { x: number; z: number }[];
  /** Thùng hàng đang bưng (công nhân soạn hàng) */
  carton?: THREE.Mesh;
}

export interface NpcPerson {
  id: string;
  x: number;
  z: number;
}

export interface NpcDelivery {
  order: DrinkOrderView;
}

export class NpcSystem {
  readonly group = new THREE.Group();
  private npcs: Npc[] = [];
  private patrons: Patron[] = [];
  private delivered = new Set<number>();
  private doorPts: { a: { x: number; z: number }; b: { x: number; z: number } } | null = null;

  constructor(private onArrive: (orderId: number) => void) {}

  get avatars(): AnimatedAvatar[] {
    return [...this.npcs.map((n) => n.av), ...this.patrons.map((p) => p.av)];
  }

  /** Ghế khách NPC đang ngồi (người chơi không ngồi chồng lên) */
  get occupiedSeats(): { x: number; z: number }[] {
    return [
      ...this.patrons.map((p) => ({ x: p.seat.seat.x, z: p.seat.seat.z })),
      ...this.npcs.filter((n) => n.home.sitY !== undefined).map((n) => ({ x: n.home.x, z: n.home.z })),
    ];
  }

  /** Khách quen: chọn bàn theo ngày (mọi máy cùng ngày thấy giống nhau), ngồi trò chuyện & nhâm nhi */
  private buildPatrons(structures: SpaceStructure[]) {
    const day = Math.floor(Date.now() / 86_400_000);
    const seats = pickPatronSeats(structures, day * 7919 + structures.length);
    const menu = new Map(DEFAULT_CAFE_MENU.map((m) => [m.code, m]));
    seats.forEach((ps, i) => {
      const look = PATRON_LOOKS[(i + day) % PATRON_LOOKS.length];
      const av = createChibiAvatar({ name: 'Khách', config: look, npc: true });
      // Khách thật ngoài đời không đeo bảng tên
      const tags: THREE.Object3D[] = [];
      av.group.traverse((c) => {
        if ((c as unknown as { isCSS2DObject?: boolean }).isCSS2DObject) tags.push(c);
      });
      tags.forEach((t) => t.parent?.remove(t));
      av.group.position.set(ps.seat.x, 0, ps.seat.z);
      av.group.rotation.y = ps.seat.rotY;
      const item = menu.get(PATRON_DRINKS[(i * 3 + day) % PATRON_DRINKS.length]) ?? DEFAULT_CAFE_MENU[1];
      const cupOnTable = buildDrink(item);
      cupOnTable.position.set(ps.cup.x, ps.cup.y, ps.cup.z);
      cupOnTable.rotation.y = Math.random() * 6;
      const cupInHand = buildDrink(item);
      cupInHand.position.set(0, -0.34, 0.06);
      cupInHand.visible = false;
      av.rightElbow.add(cupInHand);
      this.group.add(av.group, cupOnTable);
      this.patrons.push({
        av,
        seat: ps,
        cupOnTable,
        cupInHand,
        nextSip: 4 + Math.random() * 14,
        sipStart: -10,
        talkUntil: 0,
        nextTalk: i % 2 === 0 ? 1 + Math.random() * 2 : 6 + Math.random() * 3,
        phase: Math.random() * 10,
      });
    });
  }

  private updatePatrons(dt: number, now: number) {
    for (const p of this.patrons) {
      const av = p.av;
      animateAvatarIdle(av, now + p.phase);
      poseSit(av, p.seat.seat.y);
      // Đang nhấp ly: 2.6s nâng – uống – đặt xuống
      const st = (now - p.sipStart) / 2.6;
      const sipping = st >= 0 && st <= 1;
      if (!sipping && now > p.nextSip && now > p.talkUntil) {
        p.sipStart = now;
        p.nextSip = now + 12 + Math.random() * 16;
      }
      p.cupInHand.visible = sipping && st > 0.12 && st < 0.88;
      p.cupOnTable.visible = !p.cupInHand.visible;
      if (sipping) {
        poseEmote(av, 'sip', st, now);
        poseTalk(av, now, false);
        continue;
      }
      // Cặp đôi: đổi lượt nói, người nghe quay đầu về phía người nói & thỉnh thoảng gật
      const partner = p.seat.partner !== null ? this.patrons[p.seat.partner] : undefined;
      if (partner) {
        if (now > p.nextTalk && now > partner.talkUntil) {
          p.talkUntil = now + 2.5 + Math.random() * 4;
          p.nextTalk = p.talkUntil + 3 + Math.random() * 5;
        }
        const talking = now < p.talkUntil;
        const want = Math.atan2(partner.av.group.position.x - av.group.position.x, partner.av.group.position.z - av.group.position.z) - av.group.rotation.y;
        const yaw = Math.max(-0.5, Math.min(0.5, Math.atan2(Math.sin(want), Math.cos(want))));
        av.headGroup.rotation.y += (yaw - av.headGroup.rotation.y) * Math.min(1, dt * 3);
        poseTalk(av, now + p.phase, talking, Math.sin(now * 0.7 + p.phase) > -0.2);
        if (!talking && now < partner.talkUntil) av.headGroup.rotation.x += Math.max(0, Math.sin(now * 2.2 + p.phase)) * 0.004;
      } else {
        // Ngồi một mình: nhìn ngắm xung quanh chậm rãi
        const look = Math.sin(now * 0.23 + p.phase) * 0.45;
        av.headGroup.rotation.y += (look - av.headGroup.rotation.y) * Math.min(1, dt * 1.5);
        poseTalk(av, now, false);
      }
    }
  }

  /** Dựng lại NPC theo bố cục (chỉ quán cà phê) */
  rebuild(structures: SpaceStructure[], enabled: boolean) {
    this.dispose();
    if (!enabled) return;
    this.buildPatrons(structures);
    const spots = findNpcSpots(structures);
    for (const role of ['barista', 'vendor', 'waiter', 'guard', 'receptionist', 'demo', 'consultant', 'labtech', 'storekeeper', 'picker', 'loader'] as NpcRole[]) {
      const home = spots[role];
      if (!home) continue;
      const p = NPC_PROFILES[role];
      const av = createChibiAvatar({ name: `${p.name} · ${p.title}`, config: LOOKS[role], isStaff: true, npc: true });
      if (role === 'barista' || role === 'waiter') addApron(av);
      if (role === 'vendor') addKhanRan(av);
      if (role === 'guard') addGuardCap(av);
      if (role === 'demo') addApron(av, '#3f2a1d');
      if (role === 'storekeeper' || role === 'picker' || role === 'loader') {
        addSafetyVest(av);
        addHardHat(av, role === 'storekeeper' ? '#f8fafc' : '#facc15');
      }
      if (role === 'labtech') {
        addApron(av, '#f1f5f9');
        addHairnet(av);
      }
      av.group.position.set(home.x, 0, home.z);
      av.group.rotation.y = home.rotY;
      const npc: Npc = {
        role,
        av,
        home,
        bubble: { sprite: null, text: '' },
        bubbleUntil: 0,
        walkTime: Math.random() * 5,
        path: [],
        mode: 'work',
        greetUntil: 0,
        greeted: new Map(),
        nextPatrolAt: 20 + Math.random() * 30,
        stuckTime: 0,
        patrol: role === 'consultant' ? consultantPatrol(structures, home) : role === 'picker' ? pickerPatrol(structures, home) : undefined,
        carton: role === 'picker' ? makeCarton() : undefined,
      };
      if (npc.carton) av.group.add(npc.carton);
      if (role === 'waiter') {
        npc.tray = makeTray();
        npc.tray.position.set(0, -0.36, 0.08);
        av.rightElbow.add(npc.tray);
      }
      this.group.add(av.group);
      this.npcs.push(npc);
    }
    // Cửa nhà kính gần quầy bar → người phục vụ đi qua cửa
    const waiter = spots.waiter;
    const door = waiter
      ? structures
          .filter((o) => o.kind === 'DOOR')
          .map((o) => ({ o, d: Math.hypot(o.posX - waiter.x, o.posZ - waiter.z) }))
          .filter((e) => e.d < 8)
          .sort((a, b) => a.d - b.d)[0]?.o
      : undefined;
    if (door && waiter) {
      const p1 = localToWorld(door, 0, -0.8);
      const p2 = localToWorld(door, 0, 0.8);
      const inside = Math.hypot(p1.x - waiter.x, p1.z - waiter.z) < Math.hypot(p2.x - waiter.x, p2.z - waiter.z) ? p1 : p2;
      const outside = inside === p1 ? p2 : p1;
      this.doorPts = { a: inside, b: outside };
    } else {
      this.doorPts = null;
    }
  }

  private say(n: Npc, text: string, now: number) {
    n.bubble.text = '';
    syncBubble(n.bubble, n.av.group, text);
    n.bubbleUntil = now + 4.5;
  }

  private faceToward(n: Npc, x: number, z: number, k: number) {
    const want = Math.atan2(x - n.av.group.position.x, z - n.av.group.position.z);
    const d = Math.atan2(Math.sin(want - n.av.group.rotation.y), Math.cos(want - n.av.group.rotation.y));
    n.av.group.rotation.y += d * k;
  }

  /** Đi theo path; trả true khi tới nơi */
  private step(n: Npc, dt: number, speed: number, push: (pos: THREE.Vector3) => void): boolean {
    const target = n.path[0];
    if (!target) return true;
    const g = n.av.group.position;
    const dx = target.x - g.x;
    const dz = target.z - g.z;
    const dist = Math.hypot(dx, dz);
    if (dist < 0.15 || n.stuckTime > 2) {
      n.path.shift();
      n.stuckTime = 0;
      return n.path.length === 0;
    }
    const st = Math.min(dist, speed * dt);
    const bx = g.x;
    const bz = g.z;
    g.x += (dx / dist) * st;
    g.z += (dz / dist) * st;
    push(g);
    const moved = Math.hypot(g.x - bx, g.z - bz);
    n.stuckTime = moved < st * 0.3 ? n.stuckTime + dt : 0;
    n.av.group.rotation.y = Math.atan2(dx, dz);
    n.walkTime += dt * 9;
    poseWalk(n.av, n.walkTime);
    return false;
  }

  /**
   * Cập nhật mỗi khung hình.
   * @param people  người thật (mình + người khác) để chào / mời
   * @param deliveries  đơn cần bưng ra bàn (đang pha đủ lâu)
   * @param push  đẩy khỏi đồ đạc (tránh xuyên bàn ghế)
   */
  update(dt: number, now: number, people: NpcPerson[], deliveries: DrinkOrderView[], menu: CafeMenuItem[], push: (pos: THREE.Vector3) => void, frame: number) {
    this.updatePatrons(dt, now);
    for (const n of this.npcs) {
      const g = n.av.group.position;
      // NPC ở xa người chơi → cập nhật thưa cho nhẹ
      const nearest = people.reduce((m, p) => Math.min(m, Math.hypot(p.x - g.x, p.z - g.z)), Infinity);
      if (nearest > 25 && frame % 4 !== 0) continue;
      animateAvatarIdle(n.av, now);
      if (n.bubbleUntil && now > n.bubbleUntil) {
        syncBubble(n.bubble, n.av.group, null);
        n.bubbleUntil = 0;
      }
      if (n.role === 'waiter') this.updateWaiter(n, dt, now, deliveries, menu, push);
      else this.updateStation(n, dt, now, people, push);
    }
  }

  /** Barista / chị bán bánh / bảo vệ: làm việc tại chỗ, chào người lại gần */
  private updateStation(n: Npc, dt: number, now: number, people: NpcPerson[], push: (pos: THREE.Vector3) => void) {
    const g = n.av.group.position;
    const range = n.role === 'guard' ? 3 : 2.8;
    const visitor = people.find((p) => Math.hypot(p.x - g.x, p.z - g.z) < range && now - (n.greeted.get(p.id) ?? -1e9) > 120);
    if (visitor && n.mode !== 'walk') {
      n.greeted.set(visitor.id, now);
      n.mode = 'greet';
      n.greetUntil = now + 3;
      const lines: Record<Exclude<NpcRole, 'waiter'>, string> = {
        barista: 'Chào anh/chị, uống gì cứ gọi em nha!',
        vendor: 'Bánh quê nóng giòn nè, ghé ăn thử nha!',
        guard: 'Mời anh/chị vào ạ!',
        receptionist: 'Chào mừng anh/chị đến TIM Corp! Em hỗ trợ gì được ạ?',
        demo: 'Mời anh/chị ngồi thử ly espresso từ máy mới nha!',
        consultant: 'Anh/chị cần tư vấn máy nào cứ hỏi em ạ!',
        labtech: 'Đây là phòng R&D kem & socola, mời anh/chị xem ạ!',
        storekeeper: 'Anh/chị cần xuất nhập hàng gì cứ báo em nha!',
        picker: 'Chú ý làn xe nâng nha anh/chị!',
        loader: 'Chào anh/chị!',
      };
      this.say(n, lines[n.role as Exclude<NpcRole, 'waiter'>], now);
    }
    if (n.mode === 'greet') {
      if (visitor) this.faceToward(n, visitor.x, visitor.z, 1 - Math.exp(-dt * 6));
      if (n.home.sitY !== undefined) poseSit(n.av, n.home.sitY);
      else relaxPose(n.av);
      poseEmote(n.av, n.role === 'guard' || n.home.sitY !== undefined ? (n.home.sitY !== undefined ? 'nod' : 'bow') : 'wave', Math.min(1, 1 - (n.greetUntil - now) / 2.2), now);
      if (now > n.greetUntil) n.mode = 'work';
      return;
    }
    // Bảo vệ thỉnh thoảng đi vài bước tuần tra rồi về chỗ
    if (n.role === 'guard' && n.mode === 'work' && now > n.nextPatrolAt) {
      const a = n.home.rotY;
      n.path = [
        { x: n.home.x + Math.sin(a) * 2.2, z: n.home.z + Math.cos(a) * 2.2 },
        { x: n.home.x, z: n.home.z },
      ];
      n.mode = 'walk';
      n.nextPatrolAt = now + 40 + Math.random() * 40;
    }
    // Tư vấn viên đi dọc dãy quầy máy rồi về chỗ
    if (n.patrol?.length && n.mode === 'work' && now > n.nextPatrolAt) {
      n.path = [...n.patrol, { x: n.home.x, z: n.home.z }];
      n.mode = 'walk';
      n.nextPatrolAt = now + 35 + Math.random() * 30;
    }
    if (n.mode === 'walk') {
      if (this.step(n, dt, 1.0, push)) n.mode = 'work';
      if (n.carton) this.holdCarton(n);
      return;
    }
    // Tại chỗ: quay về hướng làm việc + động tác nghề
    this.faceToward(n, g.x + Math.sin(n.home.rotY), g.z + Math.cos(n.home.rotY), 1 - Math.exp(-dt * 3));
    if (n.home.sitY !== undefined) poseSit(n.av, n.home.sitY);
    else relaxPose(n.av);
    if (n.carton) {
      this.holdCarton(n);
      return;
    }
    if (n.role === 'barista' || n.role === 'vendor' || n.role === 'demo' || n.role === 'labtech' || n.role === 'loader') {
      const cyc = (now + (n.role === 'vendor' ? 3 : n.role === 'labtech' ? 5 : 0)) % 9;
      if (cyc < 6) poseEmote(n.av, 'brew', cyc / 6, now);
    } else if (n.role === 'receptionist' || n.role === 'consultant' || n.role === 'storekeeper') {
      // Lễ tân / tư vấn: thỉnh thoảng gật đầu nhẹ như đang trao đổi
      const cyc = (now + (n.role === 'consultant' ? 4 : 0)) % 11;
      if (cyc < 1.6) poseEmote(n.av, 'nod', cyc / 1.6, now);
    }
  }

  /** Người phục vụ: nhận đơn → bưng khay ra bàn → đặt ly → về quầy; rảnh thì đi tuần */
  private updateWaiter(n: Npc, dt: number, now: number, deliveries: DrinkOrderView[], menu: CafeMenuItem[], push: (pos: THREE.Vector3) => void) {
    const g = n.av.group.position;
    if (n.mode === 'work') {
      const job = deliveries.find((o) => !this.delivered.has(o.id));
      if (job) {
        // Xếp ly lên khay
        const cups = new THREE.Group();
        const byCode = new Map(menu.map((m) => [m.code, m]));
        let k = 0;
        for (const l of job.lines) {
          const it = byCode.get(l.code);
          for (let q = 0; q < l.qty && it && k < 4; q++, k++) {
            const cup = buildDrink(it);
            cup.scale.setScalar(0.85);
            cup.position.set((k % 2) * 0.1 - 0.05, 0.008, Math.floor(k / 2) * 0.1 - 0.05);
            cups.add(cup);
          }
        }
        n.tray?.add(cups);
        n.carrying = { orderId: job.id, cups };
        const route: { x: number; z: number }[] = [];
        if (this.doorPts) route.push(this.doorPts.a, this.doorPts.b);
        const from = route.length ? route[route.length - 1] : { x: g.x, z: g.z };
        if (job.spot) route.push(...serveRoute(from, job.spot, { x: job.posX, z: job.posZ }));
        else {
          // Không có bàn → đưa tận tay: đứng trước người gọi ~0.75m
          const dx = from.x - job.posX;
          const dz = from.z - job.posZ;
          const len = Math.hypot(dx, dz) || 1;
          route.push({ x: job.posX + (dx / len) * 0.75, z: job.posZ + (dz / len) * 0.75 });
        }
        n.path = route;
        n.mode = 'deliver';
        this.say(n, 'Có ngay ạ!', now);
      } else if (now > n.nextPatrolAt) {
        // Đi tuần quanh khu bàn rồi về
        n.path = [];
        if (this.doorPts) n.path.push(this.doorPts.a, this.doorPts.b);
        n.path.push({ x: this.doorPts ? this.doorPts.b.x + 3 : g.x + 3, z: this.doorPts ? this.doorPts.b.z + 2 : g.z + 2 });
        n.mode = 'return';
        n.nextPatrolAt = now + 45 + Math.random() * 30;
      } else {
        this.faceToward(n, g.x + Math.sin(n.home.rotY), g.z + Math.cos(n.home.rotY), 1 - Math.exp(-dt * 3));
        relaxPose(n.av);
      }
    }
    if (n.mode === 'deliver') {
      if (this.step(n, dt, 1.25, push)) {
        // Tới bàn: đặt ly, mời khách
        const id = n.carrying?.orderId;
        if (n.carrying) {
          n.tray?.remove(n.carrying.cups);
          disposeObject(n.carrying.cups);
          n.carrying = undefined;
        }
        if (id != null) {
          this.delivered.add(id);
          this.onArrive(id);
        }
        this.say(n, 'Nước của anh/chị đây ạ, chúc ngon miệng!', now);
        n.path = [];
        if (this.doorPts) n.path.push(this.doorPts.b, this.doorPts.a);
        n.path.push({ x: n.home.x, z: n.home.z });
        n.mode = 'return';
      }
    } else if (n.mode === 'return') {
      if (this.step(n, dt, 1.1, push)) {
        if (Math.hypot(g.x - n.home.x, g.z - n.home.z) > 0.3) {
          n.path = [];
          if (this.doorPts) n.path.push(this.doorPts.b, this.doorPts.a);
          n.path.push({ x: n.home.x, z: n.home.z });
        } else {
          n.mode = 'work';
        }
      }
    }
    // Tay bưng khay: cẳng tay nằm ngang trước người, khay luôn phẳng
    const r = n.av.rightArm;
    const e = n.av.rightElbow;
    r.rotation.x += (-0.25 - r.rotation.x) * 0.25;
    e.rotation.x += (-1.3 - e.rotation.x) * 0.25;
    if (n.tray) n.tray.rotation.x = -(r.rotation.x + e.rotation.x);
  }

  /** Hai tay đưa ra trước đỡ thùng hàng (ghi đè vung tay khi đi) */
  private holdCarton(n: Npc) {
    const k = 0.3;
    for (const arm of [n.av.leftArm, n.av.rightArm]) arm.rotation.x += (-0.55 - arm.rotation.x) * k;
    n.av.leftArm.rotation.z += (0.12 - n.av.leftArm.rotation.z) * k;
    n.av.rightArm.rotation.z += (-0.12 - n.av.rightArm.rotation.z) * k;
    for (const el of [n.av.leftElbow, n.av.rightElbow]) el.rotation.x += (-1.0 - el.rotation.x) * k;
  }

  /** Đơn đã được bưng tới (để không bưng lại) */
  markDelivered(orderId: number) {
    this.delivered.add(orderId);
  }

  dispose() {
    for (const n of this.npcs) {
      syncBubble(n.bubble, n.av.group, null);
      if (n.bubble.sprite) n.bubble.sprite.parent?.remove(n.bubble.sprite);
      this.group.remove(n.av.group);
      disposeObject(n.av.group);
    }
    this.npcs = [];
    for (const p of this.patrons) {
      this.group.remove(p.av.group, p.cupOnTable);
      disposeObject(p.av.group);
      p.cupOnTable.traverse((c) => (c as THREE.Mesh).geometry?.dispose());
    }
    this.patrons = [];
  }
}
