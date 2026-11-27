import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { GTAOPass } from 'three/examples/jsm/postprocessing/GTAOPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { SMAAPass } from 'three/examples/jsm/postprocessing/SMAAPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';

/**
 * Chỉnh màu kiểu ảnh chụp (sau tone mapping, không gian sRGB):
 * đường cong S nhẹ tăng chiều sâu, tăng bão hoà vừa phải, vùng tối ngả lạnh / vùng sáng ngả ấm (split-tone),
 * tối góc ống kính (vignette) rất nhẹ.
 */
const PhotoGradeShader = {
  uniforms: { tDiffuse: { value: null }, uVignette: { value: 0.22 }, uSat: { value: 1.06 }, uContrast: { value: 0.07 } },
  vertexShader: `
    varying vec2 vUv;
    void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
  fragmentShader: `
    uniform sampler2D tDiffuse;
    uniform float uVignette;
    uniform float uSat;
    uniform float uContrast;
    varying vec2 vUv;
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      vec3 col = c.rgb;
      // S-curve quanh điểm giữa
      col = mix(col, col * col * (3.0 - 2.0 * col), uContrast * 2.0);
      float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
      col = mix(vec3(l), col, uSat);
      // Split-tone: bóng tối hơi lam, vùng sáng hơi hổ phách
      col += mix(vec3(-0.006, 0.0, 0.014), vec3(0.016, 0.008, -0.01), smoothstep(0.15, 0.85, l));
      // Vignette elip theo khung hình
      vec2 d = vUv - 0.5;
      float v = smoothstep(0.85, 0.25, length(d * vec2(1.0, 0.82)) * 1.25);
      col *= mix(1.0 - uVignette, 1.0, v);
      gl_FragColor = vec4(clamp(col, 0.0, 1.0), c.a);
    }`,
};
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
  const grade = new ShaderPass(PhotoGradeShader);
  composer.addPass(grade);

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
      grade.dispose();
      composer.dispose();
      target.dispose();
    },
  };
}
