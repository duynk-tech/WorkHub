import * as THREE from 'three';
import type { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';
import type { Procedural3DPart, Product3DModelView, SpacePlacementView } from '@/lib/space-3d-types';
import { createBadgeSprite } from './avatars';

/** Dựng vật thể 3D của sản phẩm từ Product3DModelView. */
export function buildProductGroup(placement: SpacePlacementView, gltfLoader: GLTFLoader): THREE.Group {
  const root = new THREE.Group();
  root.userData = { placementId: placement.id };
  const m: Product3DModelView = placement.model3D;

  const addProcedural = (parts: Procedural3DPart[]) => {
    for (const part of parts) {
      let geo: THREE.BufferGeometry;
      if (part.shape === 'cylinder') {
        geo = new THREE.CylinderGeometry(part.size[0], part.size[2] ?? part.size[0], part.size[1], 14);
      } else if (part.shape === 'sphere') {
        geo = new THREE.SphereGeometry(part.size[0], 14, 12);
      } else {
        geo = new THREE.BoxGeometry(part.size[0], part.size[1], part.size[2]);
      }
      const mat = new THREE.MeshStandardMaterial({
        color: part.color || m.primaryColor,
        metalness: part.metalness ?? 0.35,
        roughness: part.roughness ?? 0.4,
        transparent: (part.opacity ?? 1) < 1,
        opacity: part.opacity ?? 1,
        emissive: part.emissive ? new THREE.Color(part.emissive) : undefined,
        emissiveIntensity: part.emissive ? 0.35 : 0,
      });
      const mesh = new THREE.Mesh(geo, mat);
      mesh.position.set(part.pos[0], part.pos[1], part.pos[2]);
      if (part.rot) mesh.rotation.set(part.rot[0], part.rot[1], part.rot[2]);
      mesh.castShadow = true;
      mesh.receiveShadow = true;
      mesh.userData = { placementId: placement.id };
      root.add(mesh);
    }
  };

  if (m.modelType === 'GLB' && m.glbUrl) {
    const placeholder = new THREE.Mesh(
      new THREE.BoxGeometry(m.widthM, m.heightM, m.depthM),
      new THREE.MeshStandardMaterial({ color: m.primaryColor, wireframe: true }),
    );
    placeholder.position.y = m.heightM * 0.5;
    placeholder.userData = { placementId: placement.id };
    root.add(placeholder);

    gltfLoader.load(m.glbUrl, (gltf) => {
      root.remove(placeholder);
      const model = gltf.scene;
      const box = new THREE.Box3().setFromObject(model);
      const size = box.getSize(new THREE.Vector3());
      const center = box.getCenter(new THREE.Vector3());
      const maxDim = Math.max(size.x, size.y, size.z) || 1;
      const targetMax = Math.max(m.widthM, m.heightM, m.depthM);
      const s = targetMax / maxDim;
      model.scale.multiplyScalar(s);
      model.position.set(-center.x * s, -box.min.y * s, -center.z * s);
      model.traverse((obj) => {
        if ((obj as THREE.Mesh).isMesh) {
          obj.castShadow = true;
          obj.receiveShadow = true;
          obj.userData = { placementId: placement.id };
        }
      });
      root.add(model);
    });
  } else if (m.modelType === 'PROCEDURAL_JSON' && m.proceduralParts && m.proceduralParts.length > 0) {
    addProcedural(m.proceduralParts);
  } else {
    const box = new THREE.Mesh(
      new THREE.BoxGeometry(m.widthM, m.heightM, m.depthM),
      new THREE.MeshStandardMaterial({ color: m.primaryColor, roughness: 0.42, metalness: 0.22 }),
    );
    box.position.y = m.heightM * 0.5;
    box.castShadow = true;
    box.receiveShadow = true;
    box.userData = { placementId: placement.id };
    root.add(box);

    if (placement.imageUrl) {
      const loader = new THREE.TextureLoader();
      loader.setCrossOrigin('anonymous');
      loader.load(placement.imageUrl, (tex) => {
        tex.colorSpace = THREE.SRGBColorSpace;
        const front = new THREE.Mesh(
          new THREE.PlaneGeometry(m.widthM * 0.85, m.heightM * 0.85),
          new THREE.MeshBasicMaterial({ map: tex }),
        );
        front.position.set(0, m.heightM * 0.5, m.depthM * 0.5 + 0.008);
        front.userData = { placementId: placement.id };
        root.add(front);
      });
    }
  }

  const tagText = placement.locationCode ? `${placement.itemCode} · ${placement.locationCode}` : placement.itemCode;
  const tag = createBadgeSprite(tagText, '#0f172a', '#e2e8f0');
  tag.position.y = m.heightM + 0.38;
  root.add(tag);

  root.position.set(placement.posX, placement.posY, placement.posZ);
  root.rotation.y = placement.rotY;
  root.scale.setScalar(placement.scale || 1);
  return root;
}
