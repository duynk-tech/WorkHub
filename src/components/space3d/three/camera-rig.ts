import * as THREE from 'three';
import type { OrbitControls } from 'three/examples/jsm/controls/OrbitControls.js';

/**
 * Camera góc 3 người:
 *  - Chống xuyên vật thể: raycast nhân vật → camera trên nhóm `occluders`, kéo camera vào khi bị che, nhả ra mượt.
 *  - Ghi nhớ khoảng cách người dùng chọn (zoom) để trả camera về sau khi hết vướng.
 *  - Intro bay vào cinematic khi vào không gian (bỏ qua bằng phím / click).
 */
export interface CameraRig {
  /** Gọi trước orbit.update() */
  beforeOrbit(): void;
  /** Gọi sau orbit.update(); trả về true khi intro đang chạy (khóa điều khiển) */
  afterOrbit(dt: number, frame: number): boolean;
  playIntro(end: { target: THREE.Vector3; position: THREE.Vector3 }, from: THREE.Vector3[]): void;
  skipIntro(): void;
  readonly introActive: boolean;
  notifyZoom(): void;
  /** Đổi khoảng cách camera ↔ nhân vật mượt (vd. quán cà phê: mở đầu xa để thấy trọn bảng hiệu, đi thì thu gần) */
  easeDistance(dist: number): void;
  dispose(): void;
}

const easeInOut = (t: number) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);

export function createCameraRig(
  camera: THREE.PerspectiveCamera,
  orbit: OrbitControls,
  getOccluders: () => THREE.Object3D[],
  isThirdPerson: () => boolean,
): CameraRig {
  const raycaster = new THREE.Raycaster();
  const dir = new THREE.Vector3();
  let preferredDist = camera.position.distanceTo(orbit.target);
  let currentDist = preferredDist;
  let hitDist = Infinity;
  let missStreak = 0;
  let distBefore = preferredDist;
  let lastZoomAt = 0;
  let easeTarget: number | null = null;

  let intro: {
    curve: THREE.CatmullRomCurve3;
    targetFrom: THREE.Vector3;
    targetTo: THREE.Vector3;
    endPos: THREE.Vector3;
    t: number;
    duration: number;
  } | null = null;

  const finishIntro = () => {
    if (!intro) return;
    camera.position.copy(intro.endPos);
    orbit.target.copy(intro.targetTo);
    preferredDist = camera.position.distanceTo(orbit.target);
    currentDist = preferredDist;
    intro = null;
    orbit.enabled = true;
    orbit.update();
  };

  return {
    get introActive() {
      return intro !== null;
    },
    notifyZoom() {
      lastZoomAt = performance.now();
      easeTarget = null;
    },
    easeDistance(dist: number) {
      easeTarget = dist;
    },
    beforeOrbit() {
      distBefore = camera.position.distanceTo(orbit.target);
    },
    afterOrbit(dt, frame) {
      if (intro) {
        intro.t = Math.min(1, intro.t + dt / intro.duration);
        const k = easeInOut(intro.t);
        camera.position.copy(intro.curve.getPointAt(k));
        orbit.target.copy(intro.targetFrom).lerp(intro.targetTo, k);
        camera.lookAt(orbit.target);
        if (intro.t >= 1) finishIntro();
        return true;
      }
      if (!isThirdPerson()) return false;

      if (easeTarget !== null) {
        preferredDist += (easeTarget - preferredDist) * (1 - Math.exp(-dt * 2.4));
        currentDist = Math.min(currentDist, preferredDist + 0.01);
        if (Math.abs(easeTarget - preferredDist) < 0.02) {
          preferredDist = easeTarget;
          easeTarget = null;
        }
      }

      const distAfter = camera.position.distanceTo(orbit.target);
      // Người dùng vừa zoom → ghi nhận khoảng cách mong muốn mới
      if (performance.now() - lastZoomAt < 450 && Math.abs(distAfter - distBefore) > 1e-3) {
        preferredDist = distAfter;
        currentDist = distAfter;
      }

      dir.copy(camera.position).sub(orbit.target);
      if (dir.lengthSq() < 1e-6) return false;
      dir.normalize();

      if (frame % 2 === 0) {
        raycaster.set(orbit.target, dir);
        raycaster.far = preferredDist + 0.4;
        raycaster.near = 0.2;
        const hits = raycaster.intersectObjects(getOccluders(), false);
        if (hits.length > 0) {
          const d = Math.max(1.2, hits[0].distance - 0.35);
          // Chỉ kéo vào khi bị che rõ ràng; nhả ra từ từ để không giật qua lại ở mép vật thể
          hitDist = hitDist === Infinity ? d : Math.min(d, hitDist + 0.15);
          missStreak = 0;
        } else if (++missStreak >= 6) {
          hitDist = Infinity;
        }
      }

      const want = Math.min(preferredDist, hitDist);
      // Kéo vào nhanh (tránh nhìn xuyên), nhả ra chậm
      const rate = easeTarget !== null ? 6 : want < currentDist - 0.05 ? 14 : 2.5;
      currentDist += (want - currentDist) * (1 - Math.exp(-dt * rate));
      camera.position.copy(orbit.target).addScaledVector(dir, currentDist);
      return false;
    },
    playIntro(end, from) {
      const pts = [...from, end.position.clone()];
      intro = {
        curve: new THREE.CatmullRomCurve3(pts, false, 'centripetal'),
        targetFrom: new THREE.Vector3(end.target.x, 3, end.target.z - 12),
        targetTo: end.target.clone(),
        endPos: end.position.clone(),
        t: 0,
        duration: 3.2,
      };
      orbit.enabled = false;
      camera.position.copy(pts[0]);
    },
    skipIntro() {
      finishIntro();
    },
    dispose() {
      intro = null;
    },
  };
}
