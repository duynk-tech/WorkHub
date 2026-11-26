'use client';

import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { SPACE_OBJECT_DEF_MAP } from '@/lib/space-3d-catalog';
import { normalizeSpaceObject } from '@/lib/space-3d-types';
import { buildSpaceObject } from './registry';
import { disposeObject } from '../avatars';

/**
 * Ảnh thu nhỏ thật cho Thư viện kéo thả: render từng vật thể bằng 1 renderer offscreen dùng chung,
 * cache dataURL theo kind. Sinh dần trong lúc rảnh để không giật khung hình.
 */
const cache = new Map<string, string>();
const listeners = new Set<() => void>();
let version = 0;
let renderer: THREE.WebGLRenderer | null = null;
let scene: THREE.Scene | null = null;
let camera: THREE.PerspectiveCamera | null = null;
const queue: string[] = [];
let running = false;

function setup() {
  if (renderer) return;
  renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true, preserveDrawingBuffer: true });
  renderer.setSize(192, 192);
  renderer.setPixelRatio(1);
  renderer.toneMapping = THREE.NeutralToneMapping;
  renderer.outputColorSpace = THREE.SRGBColorSpace;
  scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.8;
  const key = new THREE.DirectionalLight('#ffffff', 2);
  key.position.set(3, 5, 4);
  scene.add(key, new THREE.HemisphereLight('#ffffff', '#cbd5e1', 0.6));
  camera = new THREE.PerspectiveCamera(30, 1, 0.05, 100);
}

function renderOne(kind: string) {
  setup();
  const def = SPACE_OBJECT_DEF_MAP[kind];
  if (!def || !renderer || !scene || !camera) return;
  const o = normalizeSpaceObject({ id: `thumb-${kind}`, kind, widthM: def.size[0], depthM: def.size[1], heightM: def.size[2], color: def.color, accentColor: def.color });
  if (!o) return;
  const { root } = buildSpaceObject(o, { companyName: 'TIM CORP', logoUrl: '' });
  root.rotation.y = -0.6;
  scene.add(root);
  const box = new THREE.Box3().setFromObject(root);
  const size = box.getSize(new THREE.Vector3());
  const center = box.getCenter(new THREE.Vector3());
  const r = Math.max(size.x, size.y, size.z) * 0.62 + 0.05;
  const dist = r / Math.tan(THREE.MathUtils.degToRad(15));
  camera.position.set(center.x + dist * 0.55, center.y + dist * 0.42, center.z + dist * 0.72);
  camera.lookAt(center);
  renderer.render(scene, camera);
  cache.set(kind, renderer.domElement.toDataURL('image/png'));
  scene.remove(root);
  disposeObject(root);
}

function pump() {
  if (running) return;
  running = true;
  const step = () => {
    const kind = queue.shift();
    if (!kind) {
      running = false;
      return;
    }
    try {
      if (!cache.has(kind)) renderOne(kind);
    } catch {
      // Bỏ qua lỗi dựng 1 vật thể — thư viện vẫn hiện icon dự phòng
    }
    version += 1;
    listeners.forEach((l) => l());
    const ric = (window as unknown as { requestIdleCallback?: (cb: () => void) => void }).requestIdleCallback;
    if (ric) ric(step);
    else setTimeout(step, 16);
  };
  step();
}

export function requestThumbnails(kinds: string[]) {
  for (const k of kinds) if (!cache.has(k) && !queue.includes(k)) queue.push(k);
  pump();
}

export function getThumbnail(kind: string): string | null {
  return cache.get(kind) ?? null;
}

export function subscribeThumbnails(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function getThumbnailVersion(): number {
  return version;
}
