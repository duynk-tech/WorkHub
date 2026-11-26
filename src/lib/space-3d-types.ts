export type SpaceKind = 'SHOWROOM' | 'WAREHOUSE';
export type Product3DType = 'BOX_PRESET' | 'PROCEDURAL_JSON' | 'GLB';
export type AvatarOutfitStyle = 'suit' | 'shirt' | 'polo';
export type AvatarHairStyle = 'slick' | 'short' | 'bob' | 'ponytail';

export interface Avatar3DConfig {
  outfitStyle: AvatarOutfitStyle;
  outfitColor: string;
  pantsColor: string;
  hairStyle: AvatarHairStyle;
  hairColor: string;
  skinTone: string;
  hasGlasses: boolean;
}

export const DEFAULT_AVATAR_3D_CONFIG: Avatar3DConfig = {
  outfitStyle: 'suit',
  outfitColor: '#1e3a8a',
  pantsColor: '#1e293b',
  hairStyle: 'slick',
  hairColor: '#1c1917',
  skinTone: '#fce2c4',
  hasGlasses: false,
};

export function normalizeAvatar3DConfig(raw: unknown): Avatar3DConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_AVATAR_3D_CONFIG };
  const r = raw as Record<string, unknown>;
  const outfitStyle: AvatarOutfitStyle =
    r.outfitStyle === 'suit' || r.outfitStyle === 'shirt' || r.outfitStyle === 'polo'
      ? r.outfitStyle
      : DEFAULT_AVATAR_3D_CONFIG.outfitStyle;
  const hairStyle: AvatarHairStyle =
    r.hairStyle === 'slick' || r.hairStyle === 'short' || r.hairStyle === 'bob' || r.hairStyle === 'ponytail'
      ? r.hairStyle
      : DEFAULT_AVATAR_3D_CONFIG.hairStyle;
  return {
    outfitStyle,
    outfitColor: typeof r.outfitColor === 'string' && r.outfitColor.startsWith('#') ? r.outfitColor : DEFAULT_AVATAR_3D_CONFIG.outfitColor,
    pantsColor: typeof r.pantsColor === 'string' && r.pantsColor.startsWith('#') ? r.pantsColor : DEFAULT_AVATAR_3D_CONFIG.pantsColor,
    hairStyle,
    hairColor: typeof r.hairColor === 'string' && r.hairColor.startsWith('#') ? r.hairColor : DEFAULT_AVATAR_3D_CONFIG.hairColor,
    skinTone: typeof r.skinTone === 'string' && r.skinTone.startsWith('#') ? r.skinTone : DEFAULT_AVATAR_3D_CONFIG.skinTone,
    hasGlasses: Boolean(r.hasGlasses),
  };
}

export interface Procedural3DPart {
  shape: 'box' | 'cylinder' | 'sphere';
  /** Tọa độ tương đối so với tâm đáy vật thể (đơn vị mét, y >= 0) */
  pos: [number, number, number];
  /** [w, h, d] cho box; [radiusTop, height, radiusBottom] cho cylinder; [radius, radius, radius] cho sphere */
  size: [number, number, number];
  rot?: [number, number, number];
  color: string;
  metalness?: number;
  roughness?: number;
  opacity?: number;
  emissive?: string;
}

export interface Product3DModelView {
  modelType: Product3DType;
  glbUrl: string | null;
  proceduralParts: Procedural3DPart[] | null;
  widthM: number;
  heightM: number;
  depthM: number;
  primaryColor: string;
  aiPrompt: string | null;
}

export interface SpaceStructure {
  id: string;
  kind: 'BOOTH' | 'RACK' | 'PODIUM';
  label: string;
  subLabel?: string;
  departmentId?: number | null;
  aisleCode?: string;
  posX: number;
  posZ: number;
  rotY: number;
  widthM: number;
  depthM: number;
  heightM: number;
  levels?: number; // Số tầng kệ (cho RACK)
  accentColor: string;
}

export interface SpacePlacementView {
  id: string; // Client/DB key
  dbId?: number;
  inventoryItemId: number | null;
  itemCode: string;
  name: string;
  category: string;
  manufacturer: string | null;
  description: string | null;
  imageUrl: string | null;
  sellingPrice: number | null;
  stockQty?: number | null; // Chỉ trả về cho nhân viên nội bộ
  locationCode: string | null;
  posX: number;
  posY: number;
  posZ: number;
  rotY: number;
  scale: number;
  isPublic: boolean;
  model3D: Product3DModelView;
}

export interface SpacePresenceView {
  employeeId: number;
  employeeName: string;
  department: string | null;
  stationLabel: string | null;
  posX: number;
  posZ: number;
  rotY: number;
  status: string;
  avatar: Avatar3DConfig;
}

export interface SpaceDepartmentInfo {
  id: number;
  code: string;
  name: string;
  memberCount?: number;
  openTaskCount?: number;
}

export interface SpaceCatalogItem {
  id: number;
  itemCode: string;
  name: string;
  category: string;
  manufacturer: string | null;
  description: string | null;
  imageUrl: string | null;
  sellingPrice: number | null;
  stockQty?: number | null;
  model3D: Product3DModelView;
}

export interface SpaceSceneSummary {
  code: string;
  name: string;
  kind: SpaceKind;
  isPublic: boolean;
  warehouseId: number | null;
}

export interface SpacePayload {
  isStaff: boolean;
  canEdit: boolean;
  currentUser: {
    employeeId: number;
    fullName: string;
    departmentName: string | null;
    isOnDuty: boolean;
    dutyStation: string | null;
    avatar: Avatar3DConfig;
  } | null;
  branding: {
    appName: string;
    companyName: string;
    logoUrl: string;
    hotline: string;
    address: string;
  };
  scenes: SpaceSceneSummary[];
  activeScene: {
    id: number;
    code: string;
    name: string;
    kind: SpaceKind;
    isPublic: boolean;
    widthM: number;
    depthM: number;
    wallHeightM: number;
    structures: SpaceStructure[];
    placements: SpacePlacementView[];
  };
  departments: SpaceDepartmentInfo[];
  presences: SpacePresenceView[];
  catalog: SpaceCatalogItem[];
}

export function defaultModel3D(category?: string, color?: string): Product3DModelView {
  const c = (category || '').toUpperCase();
  if (c === 'MACHINE' || c === 'EQUIPMENT') {
    return {
      modelType: 'PROCEDURAL_JSON',
      glbUrl: null,
      proceduralParts: synthesizeProcedural3D('máy pha cà phê công nghiệp inox 2 group', { widthM: 0.78, heightM: 0.56, depthM: 0.54 }, color || '#1e293b'),
      widthM: 0.78,
      heightM: 0.56,
      depthM: 0.54,
      primaryColor: color || '#1e293b',
      aiPrompt: 'Máy pha cà phê công nghiệp inox 2 group',
    };
  }
  return {
    modelType: 'BOX_PRESET',
    glbUrl: null,
    proceduralParts: null,
    widthM: 0.52,
    heightM: 0.42,
    depthM: 0.44,
    primaryColor: color || '#2563eb',
    aiPrompt: null,
  };
}

/**
 * Bộ tổng hợp mô hình 3D dạng Procedural JSON thông minh từ mô tả tiếng Việt / Anh.
 * Chạy tức thì không cần GPU, làm mặc định hoặc fallback khi chưa gắn API Key AI ngoài.
 */
export function synthesizeProcedural3D(
  prompt: string,
  dims: { widthM: number; heightM: number; depthM: number },
  primaryColor = '#1e293b',
): Procedural3DPart[] {
  const p = prompt.toLowerCase();
  const w = Math.max(0.25, Math.min(3.5, dims.widthM || 0.75));
  const h = Math.max(0.25, Math.min(3.0, dims.heightM || 0.6));
  const d = Math.max(0.25, Math.min(2.5, dims.depthM || 0.55));

  // Detect color hints from prompt
  let bodyColor = primaryColor;
  if (p.includes('đỏ') || p.includes('red')) bodyColor = '#b91c1c';
  else if (p.includes('trắng') || p.includes('white')) bodyColor = '#f1f5f9';
  else if (p.includes('xanh dương') || p.includes('blue')) bodyColor = '#1d4ed8';
  else if (p.includes('vàng') || p.includes('gold') || p.includes('đồng')) bodyColor = '#b45309';
  else if (p.includes('inox') || p.includes('bạc') || p.includes('thép') || p.includes('silver')) bodyColor = '#cbd5e1';
  else if (p.includes('đen') || p.includes('black')) bodyColor = '#1e293b';

  const metal = p.includes('inox') || p.includes('thép') || p.includes('kim loại') || p.includes('bạc') ? 0.75 : 0.35;

  // 1. Tủ mát / Tủ đông / Tủ trưng bày bánh
  if (p.includes('tủ') || p.includes('fridge') || p.includes('lạnh') || p.includes('đông') || p.includes('showcase')) {
    return [
      { shape: 'box', pos: [0, h * 0.5, 0], size: [w, h, d], color: bodyColor, metalness: metal, roughness: 0.32 },
      { shape: 'box', pos: [0, h * 0.12, d * 0.02], size: [w * 0.94, h * 0.18, d * 0.98], color: '#334155', metalness: 0.4, roughness: 0.6 },
      { shape: 'box', pos: [0, h * 0.58, d * 0.49], size: [w * 0.84, h * 0.68, 0.04], color: '#bae6fd', metalness: 0.1, roughness: 0.08, opacity: 0.72, emissive: '#38bdf8' },
      { shape: 'box', pos: [0, h * 0.44, 0], size: [w * 0.8, 0.03, d * 0.75], color: '#e2e8f0', metalness: 0.5, roughness: 0.3 },
      { shape: 'box', pos: [0, h * 0.66, 0], size: [w * 0.8, 0.03, d * 0.75], color: '#e2e8f0', metalness: 0.5, roughness: 0.3 },
      { shape: 'box', pos: [w * 0.38, h * 0.58, d * 0.52], size: [0.03, h * 0.32, 0.04], color: '#94a3b8', metalness: 0.85, roughness: 0.2 },
    ];
  }

  // 2. Máy xay cà phê (Grinder)
  if (p.includes('xay') || p.includes('grinder')) {
    return [
      { shape: 'box', pos: [0, h * 0.06, 0], size: [w * 0.9, h * 0.12, d * 0.9], color: '#1e293b', metalness: 0.4, roughness: 0.4 },
      { shape: 'cylinder', pos: [0, h * 0.36, -d * 0.06], size: [w * 0.34, h * 0.5, w * 0.38], color: bodyColor, metalness: metal, roughness: 0.3 },
      { shape: 'cylinder', pos: [0, h * 0.78, -d * 0.06], size: [w * 0.42, h * 0.32, w * 0.18], color: '#334155', metalness: 0.1, roughness: 0.15, opacity: 0.65 },
      { shape: 'cylinder', pos: [0, h * 0.96, -d * 0.06], size: [w * 0.44, h * 0.05, w * 0.44], color: '#0f172a', metalness: 0.3, roughness: 0.4 },
      { shape: 'box', pos: [0, h * 0.42, d * 0.3], size: [w * 0.34, h * 0.18, d * 0.25], color: '#0f172a', metalness: 0.5, roughness: 0.3, emissive: '#0284c7' },
    ];
  }

  // 3. Máy làm kem / Máy đá
  if (p.includes('kem') || p.includes('ice') || p.includes('đá')) {
    return [
      { shape: 'box', pos: [0, h * 0.5, -d * 0.04], size: [w, h, d * 0.9], color: bodyColor, metalness: 0.65, roughness: 0.25 },
      { shape: 'box', pos: [0, h * 0.82, d * 0.43], size: [w * 0.86, h * 0.22, 0.06], color: '#0f172a', metalness: 0.2, roughness: 0.3, emissive: '#2563eb' },
      { shape: 'cylinder', pos: [-w * 0.22, h * 0.52, d * 0.48], size: [0.03, h * 0.2, 0.03], color: '#e2e8f0', metalness: 0.85, roughness: 0.2 },
      { shape: 'cylinder', pos: [0, h * 0.52, d * 0.48], size: [0.03, h * 0.2, 0.03], color: '#e2e8f0', metalness: 0.85, roughness: 0.2 },
      { shape: 'cylinder', pos: [w * 0.22, h * 0.52, d * 0.48], size: [0.03, h * 0.2, 0.03], color: '#e2e8f0', metalness: 0.85, roughness: 0.2 },
      { shape: 'box', pos: [0, h * 0.28, d * 0.48], size: [w * 0.88, 0.05, d * 0.2], color: '#94a3b8', metalness: 0.7, roughness: 0.3 },
    ];
  }

  // 4. Lò nướng / Lò hấp / Máy rửa chén
  if (p.includes('lò') || p.includes('oven') || p.includes('nướng') || p.includes('rửa')) {
    return [
      { shape: 'box', pos: [0, h * 0.5, 0], size: [w, h, d], color: bodyColor, metalness: 0.7, roughness: 0.28 },
      { shape: 'box', pos: [-w * 0.1, h * 0.5, d * 0.49], size: [w * 0.68, h * 0.68, 0.04], color: '#1e293b', metalness: 0.2, roughness: 0.12, emissive: '#f59e0b' },
      { shape: 'box', pos: [w * 0.36, h * 0.5, d * 0.49], size: [w * 0.2, h * 0.72, 0.04], color: '#0f172a', metalness: 0.3, roughness: 0.35 },
      { shape: 'box', pos: [-w * 0.1, h * 0.86, d * 0.52], size: [w * 0.56, 0.035, 0.04], color: '#e2e8f0', metalness: 0.85, roughness: 0.2 },
    ];
  }

  // 5. Mặc định: Máy pha cà phê chuyên nghiệp (Espresso 2-group F&B)
  return [
    // Khay hứng nước dưới
    { shape: 'box', pos: [0, h * 0.08, d * 0.06], size: [w * 0.96, h * 0.16, d * 0.96], color: '#94a3b8', metalness: 0.8, roughness: 0.25 },
    // Thân máy chính phía sau
    { shape: 'box', pos: [0, h * 0.54, -d * 0.14], size: [w, h * 0.78, d * 0.64], color: bodyColor, metalness: metal, roughness: 0.28 },
    // Nóc hâm tách trên cùng
    { shape: 'box', pos: [0, h * 0.95, -d * 0.14], size: [w * 0.94, h * 0.06, d * 0.58], color: '#e2e8f0', metalness: 0.85, roughness: 0.2 },
    // Phần đầu group nhô ra phía trước
    { shape: 'box', pos: [0, h * 0.74, d * 0.24], size: [w * 0.94, h * 0.26, d * 0.34], color: '#0f172a', metalness: 0.4, roughness: 0.35 },
    // 2 đầu group pha cà phê
    { shape: 'cylinder', pos: [-w * 0.22, h * 0.56, d * 0.28], size: [0.06, h * 0.14, 0.055], color: '#e2e8f0', metalness: 0.9, roughness: 0.18 },
    { shape: 'cylinder', pos: [w * 0.22, h * 0.56, d * 0.28], size: [0.06, h * 0.14, 0.055], color: '#e2e8f0', metalness: 0.9, roughness: 0.18 },
    // 2 vòi đánh sữa 2 bên
    { shape: 'cylinder', pos: [-w * 0.4, h * 0.46, d * 0.26], size: [0.014, h * 0.34, 0.014], rot: [0.22, 0, -0.18], color: '#f8fafc', metalness: 0.95, roughness: 0.15 },
    { shape: 'cylinder', pos: [w * 0.4, h * 0.46, d * 0.26], size: [0.014, h * 0.34, 0.014], rot: [0.22, 0, 0.18], color: '#f8fafc', metalness: 0.95, roughness: 0.15 },
    // Đèn LED màn hình điều khiển
    { shape: 'box', pos: [0, h * 0.76, d * 0.42], size: [w * 0.22, h * 0.09, 0.02], color: '#0284c7', metalness: 0.1, roughness: 0.2, emissive: '#38bdf8' },
  ];
}
