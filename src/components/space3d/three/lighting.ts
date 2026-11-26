import * as THREE from 'three';
import { applyEmissiveFactor } from './materials';
import type { SkySystem } from './sky';
import type { RenderPipeline } from './pipeline';

/**
 * Rig Ánh sáng Ngày/Đêm chuyển mượt: nội suy `dayFactor` 0↔1 trong ~1.2s,
 * điều khiển nắng/trăng, hemisphere, fog, exposure, environment, bloom, vật liệu phát sáng và bầu trời.
 */
export interface DayNightRig {
  setNight(night: boolean, instant?: boolean): void;
  /** Gọi mỗi frame; trả về true khi đang chuyển cảnh */
  update(dt: number): boolean;
  setPipeline(p: RenderPipeline): void;
  readonly dayFactor: number;
}

const C = (hex: string) => new THREE.Color(hex);

const DAY = {
  sunColor: C('#fff4e0'),
  sunIntensity: 1.85,
  hemiSky: C('#eaf2ff'),
  hemiGround: C('#c9d3df'),
  hemiIntensity: 0.42,
  fillIntensity: 0.35,
  fog: C('#bfd3ea'),
  exposure: 0.95,
  env: 0.5,
  bloomStrength: 0.16,
  bloomThreshold: 1.45,
  floorTint: C('#eef1f5'),
};

const NIGHT = {
  sunColor: C('#9fb2ff'),
  sunIntensity: 0.35,
  hemiSky: C('#9fb4ff'),
  hemiGround: C('#1b2335'),
  hemiIntensity: 0.5,
  fillIntensity: 0.12,
  fog: C('#0a1122'),
  exposure: 1.08,
  env: 0.22,
  bloomStrength: 0.5,
  bloomThreshold: 1.05,
  floorTint: C('#7d8aa0'),
};

export function createDayNightRig(opts: {
  scene: THREE.Scene;
  renderer: THREE.WebGLRenderer;
  sun: THREE.DirectionalLight;
  hemi: THREE.HemisphereLight;
  fill: THREE.DirectionalLight;
  sky: SkySystem;
  floorMat: THREE.MeshStandardMaterial;
  pipeline: RenderPipeline;
  sunDistance?: number;
}): DayNightRig {
  const { scene, renderer, sun, hemi, fill, sky, floorMat } = opts;
  let pipeline = opts.pipeline;
  const sunDistance = opts.sunDistance ?? 40;
  const fog = (scene.fog as THREE.Fog) ?? new THREE.Fog('#dbe6f3', 70, 320);
  scene.fog = fog;

  let factor = 1;
  let target = 1;

  const apply = () => {
    const f = factor;
    // Ánh sáng chính bám theo hướng mặt trời (ban đêm giữ hướng cao để bóng trăng hợp lý)
    sky.setDayFactor(f);
    const dir = sky.sunDirection.clone();
    if (dir.y < 0.35) dir.y = 0.35;
    dir.normalize();
    sun.position.copy(dir).multiplyScalar(sunDistance);
    sun.color.copy(NIGHT.sunColor).lerp(DAY.sunColor, f);
    // Hoàng hôn ấm hơn
    const dusk = Math.max(0, 1 - Math.abs(f - 0.4) / 0.3);
    sun.color.lerp(C('#ffb27a'), dusk * 0.55);
    sun.intensity = THREE.MathUtils.lerp(NIGHT.sunIntensity, DAY.sunIntensity, f);
    hemi.color.copy(NIGHT.hemiSky).lerp(DAY.hemiSky, f);
    hemi.groundColor.copy(NIGHT.hemiGround).lerp(DAY.hemiGround, f);
    hemi.intensity = THREE.MathUtils.lerp(NIGHT.hemiIntensity, DAY.hemiIntensity, f);
    fill.intensity = THREE.MathUtils.lerp(NIGHT.fillIntensity, DAY.fillIntensity, f);
    fog.color.copy(NIGHT.fog).lerp(DAY.fog, f);
    renderer.toneMappingExposure = THREE.MathUtils.lerp(NIGHT.exposure, DAY.exposure, f);
    scene.environmentIntensity = THREE.MathUtils.lerp(NIGHT.env, DAY.env, f);
    floorMat.color.copy(NIGHT.floorTint).lerp(DAY.floorTint, f);
    pipeline.setBloom(
      THREE.MathUtils.lerp(NIGHT.bloomStrength, DAY.bloomStrength, f),
      THREE.MathUtils.lerp(NIGHT.bloomThreshold, DAY.bloomThreshold, f),
    );
    applyEmissiveFactor(f);
  };
  apply();

  return {
    get dayFactor() {
      return factor;
    },
    setNight(night, instant = false) {
      target = night ? 0 : 1;
      if (instant) {
        factor = target;
        apply();
      }
    },
    update(dt) {
      if (factor === target) return false;
      const step = dt / 1.2;
      factor = target > factor ? Math.min(target, factor + step) : Math.max(target, factor - step);
      apply();
      return true;
    },
    setPipeline(p) {
      pipeline = p;
      apply();
    },
  };
}
