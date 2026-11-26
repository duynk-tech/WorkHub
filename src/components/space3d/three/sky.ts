import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/**
 * Bầu trời procedural: Sky vật lý (ngày → hoàng hôn) + dome đêm có sao & trăng + mây trôi.
 * `setDayFactor(f)` với f: 1 = trưa, 0 = đêm.
 */
export interface SkySystem {
  group: THREE.Group;
  sunDirection: THREE.Vector3;
  setDayFactor(f: number): void;
  update(dt: number, cameraPos: THREE.Vector3): void;
  dispose(): void;
}

function createCloudTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 256;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  for (let i = 0; i < 14; i++) {
    const x = 40 + Math.random() * 176;
    const y = 50 + Math.random() * 36;
    const r = 18 + Math.random() * 30;
    const g = ctx.createRadialGradient(x, y, 0, x, y, r);
    g.addColorStop(0, 'rgba(255,255,255,0.9)');
    g.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

function createMoonTexture(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = 128;
  c.height = 128;
  const ctx = c.getContext('2d')!;
  const g = ctx.createRadialGradient(64, 64, 0, 64, 64, 64);
  g.addColorStop(0, 'rgba(255,255,245,1)');
  g.addColorStop(0.32, 'rgba(240,244,255,1)');
  g.addColorStop(0.38, 'rgba(200,215,255,0.35)');
  g.addColorStop(1, 'rgba(160,180,255,0)');
  ctx.fillStyle = g;
  ctx.fillRect(0, 0, 128, 128);
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  return tex;
}

export function createSkySystem(): SkySystem {
  const group = new THREE.Group();
  group.userData.noAO = true;

  // Bầu trời gradient procedural: trưa xanh trong → hoàng hôn cam hồng → đêm xanh thẫm, có đĩa & quầng mặt trời
  const skyMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: { uDay: { value: 1 }, uSunDir: { value: new THREE.Vector3(0, 1, 0) } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uDay; uniform vec3 uSunDir; varying vec3 vDir;
      #include <common>
      void main(){
        vec3 d = normalize(vDir);
        float h = clamp(d.y, -0.15, 1.0);
        float t = smoothstep(-0.02, 0.55, h);
        vec3 dayZ = vec3(0.11, 0.33, 0.78), dayH = vec3(0.56, 0.72, 0.92);
        vec3 duskZ = vec3(0.16, 0.20, 0.45), duskH = vec3(1.0, 0.56, 0.36);
        vec3 nightZ = vec3(0.008, 0.016, 0.06), nightH = vec3(0.06, 0.1, 0.21);
        float dusk = 1.0 - abs(uDay - 0.4) / 0.4; dusk = clamp(dusk, 0.0, 1.0);
        vec3 zen = mix(nightZ, dayZ, smoothstep(0.15, 0.8, uDay));
        vec3 hor = mix(nightH, dayH, smoothstep(0.15, 0.8, uDay));
        zen = mix(zen, duskZ, dusk * 0.6);
        hor = mix(hor, duskH, dusk * 0.85);
        vec3 col = mix(hor, zen, t);
        float sd = max(dot(d, normalize(uSunDir)), 0.0);
        col += vec3(1.0, 0.86, 0.66) * pow(sd, 18.0) * 0.55 * smoothstep(0.05, 0.6, uDay);
        col += vec3(1.0, 0.95, 0.85) * smoothstep(0.9993, 0.9997, sd) * 6.0 * smoothstep(0.2, 0.6, uDay);
        // Dải sáng mờ sát chân trời
        col = mix(col, hor * 1.05, (1.0 - smoothstep(0.0, 0.12, h)) * 0.5);
        gl_FragColor = vec4(col, 1.0);
        #include <tonemapping_fragment>
        #include <colorspace_fragment>
      }`,
  });
  const sky = new THREE.Mesh(new THREE.SphereGeometry(900, 32, 20), skyMat);
  sky.renderOrder = -2;
  group.add(sky);

  // Dome đêm (gradient) — mờ dần vào khi trời tối
  const nightMat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    transparent: true,
    depthWrite: false,
    fog: false,
    uniforms: { uOpacity: { value: 0 } },
    vertexShader: `varying vec3 vDir; void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
    fragmentShader: `uniform float uOpacity; varying vec3 vDir;
      void main(){
        float h = clamp(vDir.y, -0.2, 1.0);
        vec3 horizon = vec3(0.09, 0.13, 0.26);
        vec3 zenith = vec3(0.01, 0.02, 0.07);
        vec3 col = mix(horizon, zenith, smoothstep(0.0, 0.7, h));
        gl_FragColor = vec4(col, uOpacity);
        #include <colorspace_fragment>
      }`,
  });
  const nightDome = new THREE.Mesh(new THREE.SphereGeometry(880, 32, 16), nightMat);
  nightDome.renderOrder = -1;
  group.add(nightDome);

  // Trường sao
  const starCount = 1400;
  const starPos = new Float32Array(starCount * 3);
  const starSize = new Float32Array(starCount);
  for (let i = 0; i < starCount; i++) {
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(Math.random() * 0.92 + 0.05);
    const r = 820;
    starPos[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    starPos[i * 3 + 1] = r * Math.cos(phi);
    starPos[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
    starSize[i] = 1.2 + Math.random() * 2.4;
  }
  const starGeo = new THREE.BufferGeometry();
  starGeo.setAttribute('position', new THREE.BufferAttribute(starPos, 3));
  starGeo.setAttribute('aSize', new THREE.BufferAttribute(starSize, 1));
  const starMat = new THREE.ShaderMaterial({
    transparent: true,
    depthWrite: false,
    fog: false,
    blending: THREE.AdditiveBlending,
    uniforms: { uOpacity: { value: 0 }, uTime: { value: 0 } },
    vertexShader: `attribute float aSize; uniform float uTime; varying float vTw;
      void main(){
        vTw = 0.6 + 0.4 * sin(uTime * 2.0 + position.x * 0.05 + position.z * 0.03);
        gl_PointSize = aSize;
        gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0);
      }`,
    fragmentShader: `uniform float uOpacity; varying float vTw;
      void main(){
        float d = length(gl_PointCoord - 0.5);
        float a = smoothstep(0.5, 0.0, d) * uOpacity * vTw;
        gl_FragColor = vec4(vec3(1.4, 1.45, 1.6), a);
      }`,
  });
  const stars = new THREE.Points(starGeo, starMat);
  stars.renderOrder = 0;
  group.add(stars);

  // Trăng (bloom ban đêm)
  const moonMat = new THREE.SpriteMaterial({ map: createMoonTexture(), transparent: true, depthWrite: false, fog: false, opacity: 0 });
  moonMat.color.setScalar(2.2);
  const moon = new THREE.Sprite(moonMat);
  moon.scale.setScalar(70);
  moon.position.set(-260, 300, -420);
  group.add(moon);

  // Mây trôi
  const cloudTex = createCloudTexture();
  const cloudMat = new THREE.SpriteMaterial({ map: cloudTex, transparent: true, depthWrite: false, fog: false, opacity: 0.85 });
  const clouds: THREE.Sprite[] = [];
  for (let i = 0; i < 12; i++) {
    const s = new THREE.Sprite(cloudMat);
    const ang = (i / 12) * Math.PI * 2 + Math.random() * 0.4;
    const r = 260 + Math.random() * 160;
    s.position.set(Math.cos(ang) * r, 70 + Math.random() * 70, Math.sin(ang) * r);
    const sc = 90 + Math.random() * 90;
    s.scale.set(sc * 2, sc, 1);
    s.userData.speed = 1.5 + Math.random() * 2;
    clouds.push(s);
    group.add(s);
  }

  const sunDirection = new THREE.Vector3();
  let time = 0;

  const setDayFactor = (f: number) => {
    // Ngày: mặt trời cao 38°; hoàng hôn khi f≈0.35; đêm: dưới đường chân trời
    const elevation = THREE.MathUtils.lerp(-6, 38, Math.pow(f, 0.8));
    const azimuth = 145;
    const phi = THREE.MathUtils.degToRad(90 - elevation);
    const theta = THREE.MathUtils.degToRad(azimuth);
    sunDirection.setFromSphericalCoords(1, phi, theta);
    skyMat.uniforms.uSunDir.value.copy(sunDirection);
    skyMat.uniforms.uDay.value = f;

    const night = THREE.MathUtils.smoothstep(1 - f, 0.45, 0.95);
    nightMat.uniforms.uOpacity.value = night;
    starMat.uniforms.uOpacity.value = night;
    moonMat.opacity = night;
    cloudMat.opacity = 0.85 * (1 - night) + 0.12 * night;
    cloudMat.color.setRGB(1, THREE.MathUtils.lerp(0.72, 1, f), THREE.MathUtils.lerp(0.6, 1, f));
  };
  setDayFactor(1);

  return {
    group,
    sunDirection,
    setDayFactor,
    update(dt, cameraPos) {
      time += dt;
      starMat.uniforms.uTime.value = time;
      group.position.copy(cameraPos);
      for (const c of clouds) {
        const sp = c.userData.speed as number;
        const x = c.position.x;
        const z = c.position.z;
        const a = (sp * dt) / 400;
        c.position.x = x * Math.cos(a) - z * Math.sin(a);
        c.position.z = x * Math.sin(a) + z * Math.cos(a);
      }
    },
    dispose() {
      sky.geometry.dispose();
      skyMat.dispose();
      nightDome.geometry.dispose();
      nightMat.dispose();
      starGeo.dispose();
      starMat.dispose();
      moonMat.map?.dispose();
      moonMat.dispose();
      cloudTex.dispose();
      cloudMat.dispose();
    },
  };
}

/** Environment map procedural (RoomEnvironment → PMREM) cho phản chiếu PBR. */
export function createEnvironmentMap(renderer: THREE.WebGLRenderer): THREE.WebGLRenderTarget {
  const pmrem = new THREE.PMREMGenerator(renderer);
  const room = new RoomEnvironment();
  const rt = pmrem.fromScene(room, 0.035);
  room.traverse((o) => {
    const m = o as THREE.Mesh;
    m.geometry?.dispose?.();
    const mat = m.material as THREE.Material | undefined;
    mat?.dispose?.();
  });
  pmrem.dispose();
  return rt;
}
