import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import type { QualitySettings } from './quality';

/**
 * Pipeline render theo preset:
 *  - Thấp: render trực tiếp (không hậu kỳ)
 *  - Vừa: Bloom + SMAA (giữ chữ sắc hơn FXAA)
 *  - Cao: GTAO + Bloom + MSAA ×4
 */
export interface RenderPipeline {
  render(): void;
  setSize(w: number, h: number): void;
  setBloom(strength: number, threshold: number): void;
  dispose(): void;
}

export function createRenderPipeline(
  renderer: THREE.WebGLRenderer,
  scene: THREE.Scene,
  camera: THREE.PerspectiveCamera,
  q: QualitySettings,
  width: number,
  height: number,
): RenderPipeline {
  const pr = renderer.getPixelRatio();

  if (!q.composer) {
    return {
      render: () => renderer.render(scene, camera),
      setSize: () => undefined,
      setBloom: () => undefined,
      dispose: () => undefined,
    };
  }

  const target = new THREE.WebGLRenderTarget(width * pr, height * pr, {
    type: THREE.HalfFloatType,
    samples: q.msaa,
  });
  const composer = new EffectComposer(renderer, target);
  composer.setPixelRatio(pr);
  composer.setSize(width, height);

  composer.addPass(new RenderPass(scene, camera));

  let gtao: GTAOPass | null = null;
  if (q.ao) {
    gtao = new GTAOPass(scene, camera, width, height);
    gtao.updateGtaoMaterial({ radius: 0.6, distanceExponent: 1.4, thickness: 1.2, scale: 1, samples: 12 });
    gtao.updatePdMaterial({ lumaPhi: 10, depthPhi: 2, normalPhi: 3, radius: 6, rings: 2, samples: 12 });
    gtao.blendIntensity = 0.85;
    // GTAO mặc định chỉ ẩn Points/Line khi render normal/depth → ẩn thêm sprite, vật liệu trong suốt và bầu trời,
    // nếu không các quad sprite (mây, nhãn tên) / kính sẽ bị tối thành mảng.
    const g = gtao as unknown as { _overrideVisibility: () => void };
    const origOverride = g._overrideVisibility.bind(gtao);
    g._overrideVisibility = () => {
      origOverride();
      scene.traverse((o) => {
        const mat = (o as THREE.Mesh).material as THREE.Material | undefined;
        if ((o as THREE.Sprite).isSprite || o.userData.noAO || (mat && !Array.isArray(mat) && mat.transparent)) o.visible = false;
      });
    };
    composer.addPass(gtao);
  }

  const bloom = new UnrealBloomPass(new THREE.Vector2(width / 2, height / 2), 0.35, 0.55, 1.0);
  composer.addPass(bloom);
  composer.addPass(new OutputPass());

  let smaa: SMAAPass | null = null;
  if (q.fxaa) {
    smaa = new SMAAPass();
    composer.addPass(smaa);
  }

  return {
    render: () => composer.render(),
    setSize: (w, h) => {
      composer.setSize(w, h);
      bloom.setSize(w / 2, h / 2);
      gtao?.setSize(w, h);
    },
    setBloom: (strength, threshold) => {
      bloom.strength = strength;
      bloom.threshold = threshold;
    },
    dispose: () => {
      gtao?.dispose();
      bloom.dispose();
      smaa?.dispose();
      composer.dispose();
      target.dispose();
    },
  };
}
