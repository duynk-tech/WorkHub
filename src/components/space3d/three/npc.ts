import * as THREE from 'three';
import type { Avatar3DConfig, SpaceStructure } from '@/lib/space-3d-types';
import { NPC_PROFILES, findNpcSpots, localToWorld, serveRoute, type NpcRole, type NpcSpot } from '@/lib/space-3d-npc';
import type { CafeMenuItem, DrinkOrderView } from '@/lib/space-3d-cafe-menu';
import { sharedMat } from './materials';
import {
  animateAvatarIdle,
  createChibiAvatar,
  disposeObject,
  poseEmote,
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
};

// ───────────── Phụ kiện ─────────────
const apronMat = () => sharedMat('npc:apron', () => new THREE.MeshStandardMaterial({ color: '#5b3a22', roughness: 0.8 }));
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

function addApron(av: AnimatedAvatar) {
  const apron = new THREE.Mesh(new THREE.BoxGeometry(0.28, 0.5, 0.012), apronMat());
  apron.position.set(0, 0.86, 0.128);
  apron.rotation.x = 0.04;
  const bib = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.22, 0.012), apronMat());
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
  private delivered = new Set<number>();
  private doorPts: { a: { x: number; z: number }; b: { x: number; z: number } } | null = null;

  constructor(private onArrive: (orderId: number) => void) {}

  get avatars(): AnimatedAvatar[] {
    return this.npcs.map((n) => n.av);
  }

  /** Dựng lại NPC theo bố cục (chỉ quán cà phê) */
  rebuild(structures: SpaceStructure[], enabled: boolean) {
    this.dispose();
    if (!enabled) return;
    const spots = findNpcSpots(structures);
    for (const role of ['barista', 'vendor', 'waiter', 'guard'] as NpcRole[]) {
      const home = spots[role];
      if (!home) continue;
      const p = NPC_PROFILES[role];
      const av = createChibiAvatar({ name: `${p.name} · ${p.title}`, config: LOOKS[role], isStaff: true, npc: true });
      if (role === 'barista' || role === 'waiter') addApron(av);
      if (role === 'vendor') addKhanRan(av);
      if (role === 'guard') addGuardCap(av);
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
      };
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
      };
      this.say(n, lines[n.role as Exclude<NpcRole, 'waiter'>], now);
    }
    if (n.mode === 'greet') {
      if (visitor) this.faceToward(n, visitor.x, visitor.z, 1 - Math.exp(-dt * 6));
      relaxPose(n.av);
      poseEmote(n.av, n.role === 'guard' ? 'bow' : 'wave', Math.min(1, 1 - (n.greetUntil - now) / 2.2), now);
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
    if (n.mode === 'walk') {
      if (this.step(n, dt, 1.1, push)) n.mode = 'work';
      return;
    }
    // Tại chỗ: quay về hướng làm việc + động tác nghề
    this.faceToward(n, g.x + Math.sin(n.home.rotY), g.z + Math.cos(n.home.rotY), 1 - Math.exp(-dt * 3));
    relaxPose(n.av);
    if (n.role !== 'guard') {
      const cyc = (now + (n.role === 'vendor' ? 3 : 0)) % 9;
      if (cyc < 6) poseEmote(n.av, 'brew', cyc / 6, now);
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
  }
}
