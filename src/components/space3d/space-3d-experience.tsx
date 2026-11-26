'use client';

import React, { useEffect, useMemo, useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Eye, Sun, Moon, Map as MapIcon, Package, Building2, Wrench, Sparkles, Upload,
  Save, RotateCw, Move, Trash2, Plus, X, ArrowLeft, UserCheck, LogIn, Search, Compass, Shirt,
} from 'lucide-react';
import {
  DEFAULT_AVATAR_3D_CONFIG,
  synthesizeProcedural3D,
  type Avatar3DConfig,
  type Procedural3DPart,
  type Product3DModelView,
  type SpaceCatalogItem,
  type SpacePayload,
  type SpacePlacementView,
  type SpaceStructure,
} from '@/lib/space-3d-types';
import {
  generateProduct3DAction,
  saveMyAvatar3DAction,
  saveProduct3DModelAction,
  saveSpaceSceneLayoutAction,
  toggleStaffDutyAction,
} from '@/server/modules/space3d/actions';
import type { TeleportTarget } from './space-3d-canvas';

const Space3DCanvas = dynamic(
  () => import('./space-3d-canvas').then((m) => m.Space3DCanvas),
  {
    ssr: false,
    loading: () => (
      <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: '#0f172a', color: '#e2e8f0', fontSize: 14 }}>
        Đang khởi tạo không gian 3D…
      </div>
    ),
  },
);

type DockTab = 'none' | 'departments' | 'products' | 'design' | 'map';

const money = (n: number) => `${new Intl.NumberFormat('vi-VN').format(Math.round(n))} ₫`;

export function Space3DExperience({ data }: { data: SpacePayload }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Guest entry overlay + Persistent Staff Avatar customizer
  const [entered, setEntered] = useState(data.isStaff);
  const [guestName, setGuestName] = useState('Khách tham quan');
  const [avatarConfig, setAvatarConfig] = useState<Avatar3DConfig>(
    data.currentUser?.avatar ?? { ...DEFAULT_AVATAR_3D_CONFIG },
  );
  const [avatarPanelOpen, setAvatarPanelOpen] = useState(false);
  const [activeBoothId, setActiveBoothId] = useState<string | null>(null);
  const playerName = data.currentUser?.fullName || guestName.trim() || 'Khách tham quan';

  const handleSaveMyAvatar = () => {
    if (!data.isStaff) {
      setAvatarPanelOpen(false);
      showToast(true, 'Đã áp dụng phong cách nhân vật');
      return;
    }
    startTransition(async () => {
      const res = await saveMyAvatar3DAction(avatarConfig);
      showToast(res.ok, res.message);
      if (res.ok) {
        setAvatarPanelOpen(false);
        router.refresh();
      }
    });
  };

  // HUD & Camera state
  const [nightMode, setNightMode] = useState(false);
  const [povMode, setPovMode] = useState<'THIRD' | 'FIRST'>('THIRD');
  const [dockTab, setDockTab] = useState<DockTab>('none');
  const [editMode, setEditMode] = useState(false);
  const [transformMode, setTransformMode] = useState<'translate' | 'rotate'>('translate');
  const [selectedPlacementId, setSelectedPlacementId] = useState<string | null>(null);
  const [inspectPlacementId, setInspectPlacementId] = useState<string | null>(null);
  const [teleportTarget, setTeleportTarget] = useState<TeleportTarget | null>(null);
  const [nearby, setNearby] = useState<{
    zoneName: string;
    nearPlacementId: string | null;
    playerPos: { x: number; z: number; rotY: number };
  }>({
    zoneName: data.activeScene.kind === 'WAREHOUSE' ? 'Khu vực Kho hàng' : 'Sảnh chính Công ty',
    nearPlacementId: null,
    playerPos: { x: 0, z: 10, rotY: 0 },
  });

  // Editable Scene State
  const [structures, setStructures] = useState<SpaceStructure[]>(data.activeScene.structures);
  const [placements, setPlacements] = useState<SpacePlacementView[]>(data.activeScene.placements);
  const [dirty, setDirty] = useState(false);
  const [searchText, setSearchText] = useState('');
  const [toastMsg, setToastMsg] = useState<{ ok: boolean; text: string } | null>(null);

  // AI 3D Product Studio Modal
  const [studioItem, setStudioItem] = useState<SpaceCatalogItem | null>(null);
  const [studioForm, setStudioForm] = useState<{
    modelType: 'BOX_PRESET' | 'PROCEDURAL_JSON' | 'GLB';
    widthCm: number;
    heightCm: number;
    depthCm: number;
    primaryColor: string;
    aiPrompt: string;
    glbUrl: string;
    proceduralParts: Procedural3DPart[] | null;
  }>({
    modelType: 'PROCEDURAL_JSON',
    widthCm: 75,
    heightCm: 56,
    depthCm: 54,
    primaryColor: '#1e293b',
    aiPrompt: '',
    glbUrl: '',
    proceduralParts: null,
  });
  const [uploadingGlb, setUploadingGlb] = useState(false);
  const glbInputRef = useRef<HTMLInputElement | null>(null);

  // Đồng bộ khi chuyển Scene
  useEffect(() => {
    setStructures(data.activeScene.structures);
    setPlacements(data.activeScene.placements);
    setSelectedPlacementId(null);
    setInspectPlacementId(null);
    setDirty(false);
  }, [data.activeScene.code, data.activeScene.structures, data.activeScene.placements]);

  const showToast = (ok: boolean, text: string) => {
    setToastMsg({ ok, text });
    window.setTimeout(() => setToastMsg((prev) => (prev?.text === text ? null : prev)), 3200);
  };

  // Phím tắt V (POV) và E (Xem vật thể gần nhất)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.code === 'KeyV') setPovMode((p) => (p === 'THIRD' ? 'FIRST' : 'THIRD'));
      if (e.code === 'KeyE' && nearby.nearPlacementId) {
        setInspectPlacementId(nearby.nearPlacementId);
      }
      if (e.code === 'Escape') {
        setInspectPlacementId(null);
        setDockTab('none');
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nearby.nearPlacementId]);

  const teleportTo = (x: number, z: number, lookX?: number, lookZ?: number) => {
    setTeleportTarget({ x, z, lookX, lookZ, nonce: Date.now() });
  };

  const selectedPlacement = useMemo(
    () => placements.find((p) => p.id === selectedPlacementId) ?? null,
    [placements, selectedPlacementId],
  );
  const inspectedPlacement = useMemo(
    () => placements.find((p) => p.id === inspectPlacementId) ?? null,
    [placements, inspectPlacementId],
  );
  const nearbyPlacement = useMemo(
    () => placements.find((p) => p.id === nearby.nearPlacementId) ?? null,
    [placements, nearby.nearPlacementId],
  );

  const handleSelectPlacement = (id: string | null) => {
    if (editMode) {
      setSelectedPlacementId(id);
    } else if (id) {
      setInspectPlacementId(id);
    }
  };

  const handleMovePlacement = (
    id: string,
    pos: { posX: number; posY: number; posZ: number; rotY: number },
  ) => {
    setPlacements((prev) => prev.map((p) => (p.id === id ? { ...p, ...pos } : p)));
    setDirty(true);
  };

  const handleAddPlacementFromCatalog = (item: SpaceCatalogItem) => {
    const newId = `new-${Date.now()}`;
    const px = Number((nearby.playerPos.x + Math.sin(nearby.playerPos.rotY) * 2.2).toFixed(2));
    const pz = Number((nearby.playerPos.z + Math.cos(nearby.playerPos.rotY) * 2.2).toFixed(2));
    const py = data.activeScene.kind === 'SHOWROOM' ? 0.92 : 0.15;

    const placed: SpacePlacementView = {
      id: newId,
      inventoryItemId: item.id,
      itemCode: item.itemCode,
      name: item.name,
      category: item.category,
      manufacturer: item.manufacturer,
      description: item.description,
      imageUrl: item.imageUrl,
      sellingPrice: item.sellingPrice,
      stockQty: item.stockQty,
      locationCode: data.activeScene.kind === 'WAREHOUSE' ? 'A1-T1-01' : 'SR-01',
      posX: px,
      posY: py,
      posZ: pz,
      rotY: 0,
      scale: 1,
      isPublic: data.activeScene.isPublic,
      model3D: item.model3D,
    };
    setPlacements((prev) => [...prev, placed]);
    setEditMode(true);
    setSelectedPlacementId(newId);
    setDockTab('design');
    setDirty(true);
    showToast(true, `Đã đặt "${item.name}" vào không gian 3D — kéo mũi tên để căn chỉnh`);
  };

  const handleAddStructure = (kind: 'RACK' | 'BOOTH') => {
    const idx = structures.length + 1;
    const st: SpaceStructure =
      kind === 'RACK'
        ? {
            id: `rack-${Date.now()}`,
            kind: 'RACK',
            label: `DÃY MỚI · KỆ 0${idx}`,
            aisleCode: `K${idx}`,
            posX: Number(nearby.playerPos.x.toFixed(1)),
            posZ: Number((nearby.playerPos.z - 3).toFixed(1)),
            rotY: 0,
            widthM: 6,
            depthM: 1.4,
            heightM: 3.6,
            levels: 3,
            accentColor: '#2563eb',
          }
        : {
            id: `booth-${Date.now()}`,
            kind: 'BOOTH',
            label: `QUẦY TRƯNG BÀY 0${idx}`,
            subLabel: `SHOWROOM 0${idx}`,
            posX: Number(nearby.playerPos.x.toFixed(1)),
            posZ: Number((nearby.playerPos.z - 4).toFixed(1)),
            rotY: 0,
            widthM: 5.2,
            depthM: 3.4,
            heightM: 3.2,
            accentColor: '#0891b2',
          };
    setStructures((prev) => [...prev, st]);
    setDirty(true);
    showToast(true, kind === 'RACK' ? 'Đã thêm dãy kệ kho 3D mới' : 'Đã thêm quầy trưng bày mới');
  };

  const handleSaveLayout = () => {
    startTransition(async () => {
      const res = await saveSpaceSceneLayoutAction(data.activeScene.code, {
        structures,
        placements: placements.map((p) => ({
          inventoryItemId: p.inventoryItemId,
          label: p.name,
          locationCode: p.locationCode,
          posX: p.posX,
          posY: p.posY,
          posZ: p.posZ,
          rotY: p.rotY,
          scale: p.scale,
          isPublic: p.isPublic,
        })),
      });
      showToast(res.ok, res.message);
      if (res.ok) {
        setDirty(false);
        router.refresh();
      }
    });
  };

  const handleToggleDuty = () => {
    if (!data.currentUser) return;
    const nextActive = !data.currentUser.isOnDuty;
    startTransition(async () => {
      const res = await toggleStaffDutyAction(
        data.activeScene.code,
        nearby.zoneName || data.currentUser?.departmentName || 'Quầy tư vấn',
        Number(nearby.playerPos.x.toFixed(2)),
        Number(nearby.playerPos.z.toFixed(2)),
        Number(nearby.playerPos.rotY.toFixed(2)),
        nextActive,
      );
      showToast(res.ok, res.message);
      if (res.ok) router.refresh();
    });
  };

  const open3DStudio = (item: SpaceCatalogItem) => {
    setStudioItem(item);
    setStudioForm({
      modelType: item.model3D.modelType,
      widthCm: Math.round(item.model3D.widthM * 100),
      heightCm: Math.round(item.model3D.heightM * 100),
      depthCm: Math.round(item.model3D.depthM * 100),
      primaryColor: item.model3D.primaryColor || '#1e293b',
      aiPrompt: item.model3D.aiPrompt || item.name,
      glbUrl: item.model3D.glbUrl || '',
      proceduralParts: item.model3D.proceduralParts,
    });
  };

  const handleGenerateAI3D = () => {
    const dims = {
      widthM: Math.max(0.15, studioForm.widthCm / 100),
      heightM: Math.max(0.15, studioForm.heightCm / 100),
      depthM: Math.max(0.15, studioForm.depthCm / 100),
    };
    startTransition(async () => {
      const res = await generateProduct3DAction(studioForm.aiPrompt, dims, studioForm.primaryColor);
      if (res.ok && res.parts) {
        setStudioForm((f) => ({ ...f, modelType: 'PROCEDURAL_JSON', proceduralParts: res.parts! }));
        showToast(true, `${res.message} (${res.parts.length} khối hình học)`);
      } else {
        const fallback = synthesizeProcedural3D(studioForm.aiPrompt, dims, studioForm.primaryColor);
        setStudioForm((f) => ({ ...f, modelType: 'PROCEDURAL_JSON', proceduralParts: fallback }));
        showToast(true, `Đã dựng mô hình 3D nội bộ (${fallback.length} khối)`);
      }
    });
  };

  const handleUploadGlb = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file) return;
    setUploadingGlb(true);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const res = await fetch('/api/space3d/upload-glb', { method: 'POST', body: fd });
      const json = await res.json();
      if (res.ok && json.ok) {
        setStudioForm((f) => ({ ...f, modelType: 'GLB', glbUrl: json.url }));
        showToast(true, 'Đã tải file .glb lên Storage thành công');
      } else {
        showToast(false, json.error || 'Tải lên file .glb thất bại');
      }
    } catch {
      showToast(false, 'Lỗi kết nối khi tải file .glb');
    } finally {
      setUploadingGlb(false);
    }
  };

  const handleSaveStudioModel = () => {
    if (!studioItem) return;
    const widthM = Math.max(0.15, studioForm.widthCm / 100);
    const heightM = Math.max(0.15, studioForm.heightCm / 100);
    const depthM = Math.max(0.15, studioForm.depthCm / 100);
    const parts =
      studioForm.modelType === 'PROCEDURAL_JSON'
        ? studioForm.proceduralParts || synthesizeProcedural3D(studioForm.aiPrompt || studioItem.name, { widthM, heightM, depthM }, studioForm.primaryColor)
        : null;

    startTransition(async () => {
      const res = await saveProduct3DModelAction(studioItem.id, {
        modelType: studioForm.modelType,
        glbUrl: studioForm.modelType === 'GLB' ? studioForm.glbUrl : null,
        proceduralParts: parts,
        widthM,
        heightM,
        depthM,
        primaryColor: studioForm.primaryColor,
        aiPrompt: studioForm.aiPrompt,
      });
      showToast(res.ok, res.message);
      if (res.ok) {
        const nextModel: Product3DModelView = {
          modelType: studioForm.modelType,
          glbUrl: studioForm.modelType === 'GLB' ? studioForm.glbUrl : null,
          proceduralParts: parts,
          widthM,
          heightM,
          depthM,
          primaryColor: studioForm.primaryColor,
          aiPrompt: studioForm.aiPrompt,
        };
        setPlacements((prev) =>
          prev.map((p) => (p.inventoryItemId === studioItem.id ? { ...p, model3D: nextModel } : p)),
        );
        setStudioItem(null);
        router.refresh();
      }
    });
  };

  const filteredPlacements = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return placements;
    return placements.filter(
      (p) =>
        p.name.toLowerCase().includes(q) ||
        p.itemCode.toLowerCase().includes(q) ||
        (p.locationCode || '').toLowerCase().includes(q),
    );
  }, [placements, searchText]);

  const filteredCatalog = useMemo(() => {
    const q = searchText.trim().toLowerCase();
    if (!q) return data.catalog;
    return data.catalog.filter(
      (c) => c.name.toLowerCase().includes(q) || c.itemCode.toLowerCase().includes(q),
    );
  }, [data.catalog, searchText]);

  const glassStyle: React.CSSProperties = {
    background: 'rgba(15, 23, 42, 0.86)',
    backdropFilter: 'blur(12px)',
    WebkitBackdropFilter: 'blur(12px)',
    border: '1px solid rgba(255, 255, 255, 0.12)',
    color: '#f8fafc',
  };

  return (
    <div style={{ position: 'fixed', inset: 0, overflow: 'hidden', fontFamily: 'var(--font-sans)' }}>
      <Space3DCanvas
        sceneKind={data.activeScene.kind}
        widthM={data.activeScene.widthM}
        depthM={data.activeScene.depthM}
        branding={data.branding}
        structures={structures}
        placements={placements}
        presences={data.presences}
        playerName={playerName}
        playerAvatar={avatarConfig}
        nightMode={nightMode}
        povMode={povMode}
        editMode={editMode}
        transformMode={transformMode}
        selectedPlacementId={selectedPlacementId}
        teleportTarget={teleportTarget}
        onSelectPlacement={handleSelectPlacement}
        onSelectBooth={(id) => setActiveBoothId(id)}
        onMovePlacement={handleMovePlacement}
        onNearbyChange={setNearby}
      />

      {/* Toast nổi */}
      {toastMsg && (
        <div
          style={{
            position: 'fixed',
            top: 72,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 60,
            padding: '8px 16px',
            borderRadius: 999,
            background: toastMsg.ok ? '#059669' : '#dc2626',
            color: '#fff',
            fontSize: 13,
            fontWeight: 500,
            boxShadow: '0 8px 24px rgba(0,0,0,0.25)',
          }}
        >
          {toastMsg.text}
        </div>
      )}

      {/* Màn hình chào cho Khách tham quan (Guest) */}
      {!entered && (
        <div
          style={{
            position: 'fixed',
            inset: 0,
            zIndex: 50,
            background: 'rgba(2, 6, 23, 0.65)',
            backdropFilter: 'blur(8px)',
            display: 'grid',
            placeItems: 'center',
            padding: 16,
          }}
        >
          <div
            style={{
              ...glassStyle,
              width: '100%',
              maxWidth: 420,
              borderRadius: 18,
              padding: 28,
              display: 'flex',
              flexDirection: 'column',
              gap: 16,
              textAlign: 'center',
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'center' }}>
              <div style={{ width: 68, height: 68, borderRadius: 16, background: '#ffffff', padding: 10, display: 'grid', placeItems: 'center' }}>
                <img src={data.branding.logoUrl} alt={data.branding.appName} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              </div>
            </div>
            <div>
              <div style={{ fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase', color: '#60a5fa', fontWeight: 700 }}>
                Showroom & Triển Lãm 3D · Beta
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: '#ffffff', lineHeight: 1.25 }}>
                {data.branding.companyName}
              </h1>
              <p style={{ fontSize: 13, color: '#cbd5e1', marginTop: 8, lineHeight: 1.5 }}>
                Tham quan trực tiếp không gian triển lãm máy móc, gặp nhân viên tư vấn tại quầy và xem thông số thiết bị trong không gian 3D.
              </p>
            </div>
            <input
              value={guestName}
              onChange={(e) => setGuestName(e.target.value)}
              placeholder="Tên hiển thị của bạn…"
              style={{
                width: '100%',
                padding: '10px 14px',
                borderRadius: 10,
                border: '1px solid rgba(255,255,255,0.22)',
                background: 'rgba(255,255,255,0.1)',
                color: '#ffffff',
                fontSize: 14,
                outline: 'none',
              }}
            />
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#cbd5e1' }}>Trang phục:</span>
                <div style={{ display: 'flex', gap: 5 }}>
                  {([
                    { key: 'suit', label: 'Vest' },
                    { key: 'shirt', label: 'Sơ mi' },
                    { key: 'polo', label: 'Polo' },
                  ] as const).map((o) => (
                    <button
                      key={o.key}
                      type="button"
                      onClick={() => setAvatarConfig((a) => ({ ...a, outfitStyle: o.key }))}
                      style={{
                        padding: '4px 10px', borderRadius: 99, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                        border: '1px solid rgba(255,255,255,0.2)',
                        background: avatarConfig.outfitStyle === o.key ? '#2563eb' : 'rgba(255,255,255,0.08)',
                        color: '#ffffff',
                      }}
                    >
                      {o.label}
                    </button>
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#cbd5e1' }}>Màu áo:</span>
                <div style={{ display: 'flex', gap: 6 }}>
                  {['#1e3a8a', '#2563eb', '#0f766e', '#334155', '#991b1b', '#7c3aed'].map((c) => (
                    <button
                      key={c}
                      type="button"
                      onClick={() => setAvatarConfig((a) => ({ ...a, outfitColor: c }))}
                      style={{
                        width: 24, height: 24, borderRadius: 99, background: c, cursor: 'pointer',
                        border: avatarConfig.outfitColor === c ? '2.5px solid #ffffff' : '1px solid rgba(255,255,255,0.25)',
                      }}
                      aria-label={`Chọn màu áo ${c}`}
                    />
                  ))}
                </div>
              </div>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#cbd5e1' }}>Kiểu tóc:</span>
                <div style={{ display: 'flex', gap: 5 }}>
                  {([
                    { key: 'slick', label: 'Rẽ ngôi' },
                    { key: 'short', label: 'Ngắn' },
                    { key: 'bob', label: 'Bob' },
                    { key: 'ponytail', label: 'Đuôi ngựa' },
                  ] as const).map((h) => (
                    <button
                      key={h.key}
                      type="button"
                      onClick={() => setAvatarConfig((a) => ({ ...a, hairStyle: h.key }))}
                      style={{
                        padding: '4px 8px', borderRadius: 99, fontSize: 11, fontWeight: 600, cursor: 'pointer',
                        border: '1px solid rgba(255,255,255,0.2)',
                        background: avatarConfig.hairStyle === h.key ? '#2563eb' : 'rgba(255,255,255,0.08)',
                        color: '#ffffff',
                      }}
                    >
                      {h.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <button
              type="button"
              onClick={() => setEntered(true)}
              style={{
                width: '100%',
                padding: '11px 16px',
                borderRadius: 10,
                border: 0,
                background: '#2563eb',
                color: '#fff',
                fontSize: 14,
                fontWeight: 600,
                cursor: 'pointer',
              }}
            >
              Vào tham quan ngay (Không cần đăng nhập)
            </button>
            <Link
              href="/login?next=/3d"
              style={{ fontSize: 12.5, color: '#94a3b8', textDecoration: 'none', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6 }}
            >
              <LogIn size={13} /> Đăng nhập tài khoản nhân viên
            </Link>
          </div>
        </div>
      )}

      {/* Thanh HUD phía trên (Top Floating Pill Bar — kiểu hopcho.maclife.vn) */}
      <div
        style={{
          position: 'fixed',
          top: 12,
          left: 14,
          right: 14,
          zIndex: 20,
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          gap: 10,
          flexWrap: 'wrap',
          pointerEvents: 'none',
        }}
      >
        <div
          style={{
            ...glassStyle,
            pointerEvents: 'auto',
            borderRadius: 999,
            padding: '6px 14px 6px 8px',
            display: 'flex',
            alignItems: 'center',
            gap: 10,
          }}
        >
          <div style={{ width: 30, height: 30, borderRadius: 8, background: '#fff', padding: 4, display: 'grid', placeItems: 'center' }}>
            <img src={data.branding.logoUrl} alt={data.branding.appName} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <span style={{ fontWeight: 700, fontSize: 13.5 }}>{data.branding.appName}</span>
          <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 7px', borderRadius: 99, background: '#2563eb', color: '#fff' }}>
            3D BETA
          </span>
          {data.presences.length > 0 && (
            <span style={{ fontSize: 12, color: '#34d399', display: 'inline-flex', alignItems: 'center', gap: 5 }}>
              ● {data.presences.length} nhân viên đang trực
            </span>
          )}
        </div>

        {/* Chọn không gian (Showroom / Các Kho hàng) */}
        {data.scenes.length > 1 && (
          <div
            style={{
              ...glassStyle,
              pointerEvents: 'auto',
              borderRadius: 999,
              padding: 4,
              display: 'flex',
              gap: 4,
            }}
          >
            {data.scenes.map((sc) => (
              <Link
                key={sc.code}
                href={`/3d?scene=${encodeURIComponent(sc.code)}`}
                style={{
                  padding: '5px 12px',
                  borderRadius: 999,
                  fontSize: 12,
                  fontWeight: 600,
                  textDecoration: 'none',
                  background: sc.code === data.activeScene.code ? '#2563eb' : 'transparent',
                  color: sc.code === data.activeScene.code ? '#fff' : '#cbd5e1',
                }}
              >
                {sc.name}
              </Link>
            ))}
          </div>
        )}

        <div style={{ display: 'flex', alignItems: 'center', gap: 6, pointerEvents: 'auto' }}>
          <button
            type="button"
            onClick={() => setAvatarPanelOpen((v) => !v)}
            style={{
              ...glassStyle,
              padding: '7px 12px',
              borderRadius: 999,
              fontSize: 12,
              fontWeight: 600,
              cursor: 'pointer',
              display: 'inline-flex',
              alignItems: 'center',
              gap: 6,
              background: avatarPanelOpen ? '#2563eb' : glassStyle.background,
            }}
          >
            <Shirt size={14} /> Diện mạo
          </button>
          {data.isStaff && (
            <button
              type="button"
              onClick={handleToggleDuty}
              disabled={pending}
              style={{
                ...glassStyle,
                padding: '7px 12px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 600,
                cursor: 'pointer',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 6,
                background: data.currentUser?.isOnDuty ? '#059669' : glassStyle.background,
              }}
            >
              <UserCheck size={14} />
              {data.currentUser?.isOnDuty ? 'Đang trực (Rời quầy)' : 'Vào trực quầy'}
            </button>
          )}
          {data.isStaff ? (
            <Link
              href="/dashboard"
              style={{
                ...glassStyle,
                padding: '7px 12px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 500,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <ArrowLeft size={14} /> Về WorkHub
            </Link>
          ) : (
            <Link
              href="/login?next=/3d"
              style={{
                ...glassStyle,
                padding: '7px 12px',
                borderRadius: 999,
                fontSize: 12,
                fontWeight: 500,
                textDecoration: 'none',
                display: 'inline-flex',
                alignItems: 'center',
                gap: 5,
              }}
            >
              <LogIn size={14} /> Nhân viên
            </Link>
          )}
        </div>
      </div>

      {/* Góc trên trái: Khu vực hiện tại + Góc POV + Ngày/Đêm */}
      <div style={{ position: 'fixed', top: 64, left: 14, zIndex: 20, display: 'flex', flexDirection: 'column', gap: 6, alignItems: 'flex-start' }}>
        <div style={{ ...glassStyle, borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6 }}>
          <Compass size={13} style={{ color: '#60a5fa' }} />
          <span>{nearby.zoneName}</span>
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <button
            type="button"
            onClick={() => setPovMode((p) => (p === 'THIRD' ? 'FIRST' : 'THIRD'))}
            style={{ ...glassStyle, borderRadius: 999, padding: '5px 11px', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            <Eye size={13} /> {povMode === 'FIRST' ? 'Góc nhìn 1 (V)' : 'Góc POV (V)'}
          </button>
          <button
            type="button"
            onClick={() => setNightMode((n) => !n)}
            style={{ ...glassStyle, borderRadius: 999, padding: '5px 11px', fontSize: 12, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 5 }}
          >
            {nightMode ? <Sun size={13} /> : <Moon size={13} />} {nightMode ? 'Ban ngày' : 'Ban đêm'}
          </button>
        </div>
        <div style={{ fontSize: 11, color: nightMode ? '#94a3b8' : '#334155', paddingLeft: 4, fontWeight: 500 }}>
          Click sàn / gian hàng để tự đi tới · WASD · Kéo xoay góc nhìn
        </div>
      </div>

      {/* Bảng Tùy chỉnh Diện mạo & Phong cách nhân vật (xem trực tiếp 3D + Lưu DB cho nhân viên) */}
      {avatarPanelOpen && (
        <div
          style={{
            ...glassStyle,
            position: 'fixed',
            top: 64,
            right: 14,
            zIndex: 35,
            width: 310,
            maxHeight: '76vh',
            overflowY: 'auto',
            borderRadius: 16,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div>
              <div style={{ fontSize: 10.5, color: '#60a5fa', fontWeight: 700 }}>PHONG CÁCH CÁ NHÂN</div>
              <div style={{ fontSize: 15, fontWeight: 700, color: '#ffffff' }}>Tùy chỉnh diện mạo 3D</div>
            </div>
            <button type="button" onClick={() => setAvatarPanelOpen(false)} style={{ background: 'none', border: 0, color: '#94a3b8', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11.5, color: '#cbd5e1', fontWeight: 600 }}>Kiểu trang phục</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6 }}>
              {([
                { key: 'suit', label: 'Vest công sở' },
                { key: 'shirt', label: 'Sơ mi' },
                { key: 'polo', label: 'Áo Polo' },
              ] as const).map((o) => (
                <button
                  key={o.key}
                  type="button"
                  onClick={() => setAvatarConfig((a) => ({ ...a, outfitStyle: o.key }))}
                  style={{
                    padding: '6px 6px', borderRadius: 8, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                    border: '1px solid rgba(255,255,255,0.18)',
                    background: avatarConfig.outfitStyle === o.key ? '#2563eb' : 'rgba(255,255,255,0.07)',
                    color: '#ffffff',
                  }}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11.5, color: '#cbd5e1', fontWeight: 600 }}>Màu trang phục</span>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: 7 }}>
              {['#1e3a8a', '#2563eb', '#0f766e', '#059669', '#334155', '#991b1b', '#7c3aed', '#f8fafc'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAvatarConfig((a) => ({ ...a, outfitColor: c }))}
                  style={{
                    width: 26, height: 26, borderRadius: 99, background: c, cursor: 'pointer',
                    border: avatarConfig.outfitColor === c ? '2.5px solid #60a5fa' : '1px solid rgba(255,255,255,0.3)',
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11.5, color: '#cbd5e1', fontWeight: 600 }}>Màu quần</span>
            <div style={{ display: 'flex', gap: 7 }}>
              {['#0f172a', '#334155', '#1e3a8a', '#d6ccc2'].map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setAvatarConfig((a) => ({ ...a, pantsColor: c }))}
                  style={{
                    width: 26, height: 26, borderRadius: 99, background: c, cursor: 'pointer',
                    border: avatarConfig.pantsColor === c ? '2.5px solid #60a5fa' : '1px solid rgba(255,255,255,0.3)',
                  }}
                />
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11.5, color: '#cbd5e1', fontWeight: 600 }}>Kiểu tóc</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {([
                { key: 'slick', label: 'Rẽ ngôi lịch sự' },
                { key: 'short', label: 'Ngắn hiện đại' },
                { key: 'bob', label: 'Tóc Bob' },
                { key: 'ponytail', label: 'Đuôi ngựa' },
              ] as const).map((h) => (
                <button
                  key={h.key}
                  type="button"
                  onClick={() => setAvatarConfig((a) => ({ ...a, hairStyle: h.key }))}
                  style={{
                    padding: '6px 8px', borderRadius: 8, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                    border: '1px solid rgba(255,255,255,0.18)',
                    background: avatarConfig.hairStyle === h.key ? '#2563eb' : 'rgba(255,255,255,0.07)',
                    color: '#ffffff',
                  }}
                >
                  {h.label}
                </button>
              ))}
            </div>
          </div>

          <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11.5, color: '#cbd5e1', fontWeight: 600 }}>Màu tóc</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {['#1c1917', '#451a03', '#713f12', '#475569'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setAvatarConfig((a) => ({ ...a, hairColor: c }))}
                    style={{
                      width: 24, height: 24, borderRadius: 99, background: c, cursor: 'pointer',
                      border: avatarConfig.hairColor === c ? '2.5px solid #60a5fa' : '1px solid rgba(255,255,255,0.3)',
                    }}
                  />
                ))}
              </div>
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11.5, color: '#cbd5e1', fontWeight: 600 }}>Tông da</span>
              <div style={{ display: 'flex', gap: 6 }}>
                {['#fde6cd', '#fce2c4', '#ecc39b'].map((c) => (
                  <button
                    key={c}
                    type="button"
                    onClick={() => setAvatarConfig((a) => ({ ...a, skinTone: c }))}
                    style={{
                      width: 24, height: 24, borderRadius: 99, background: c, cursor: 'pointer',
                      border: avatarConfig.skinTone === c ? '2.5px solid #60a5fa' : '1px solid rgba(255,255,255,0.3)',
                    }}
                  />
                ))}
              </div>
            </div>
          </div>

          <label style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', fontSize: 12.5, color: '#e2e8f0', cursor: 'pointer', padding: '6px 10px', borderRadius: 8, background: 'rgba(255,255,255,0.06)' }}>
            <span>Đeo kính mắt gọng mảnh</span>
            <input
              type="checkbox"
              checked={avatarConfig.hasGlasses}
              onChange={(e) => setAvatarConfig((a) => ({ ...a, hasGlasses: e.target.checked }))}
            />
          </label>

          <button
            type="button"
            onClick={handleSaveMyAvatar}
            disabled={pending}
            style={{
              width: '100%', padding: '9px 14px', borderRadius: 10, border: 0, cursor: 'pointer',
              background: '#16a34a', color: '#ffffff', fontSize: 13, fontWeight: 700,
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
            }}
          >
            <Save size={14} /> {pending ? 'Đang lưu…' : data.isStaff ? 'Lưu phong cách của tôi' : 'Áp dụng diện mạo'}
          </button>
        </div>
      )}

      {/* Thẻ thông tin nhanh khi click vào Gian hàng / Phòng ban */}
      {activeBoothId && (() => {
        const booth = structures.find((s) => s.id === activeBoothId);
        if (!booth) return null;
        const staffAtBooth = data.presences.filter(
          (pr) => pr.stationLabel === booth.label || Math.hypot(pr.posX - booth.posX, pr.posZ - booth.posZ) < 4.5,
        );
        return (
          <div
            style={{
              ...glassStyle,
              position: 'fixed',
              top: 64,
              right: 14,
              zIndex: 25,
              width: 270,
              borderRadius: 14,
              padding: 14,
              display: 'flex',
              flexDirection: 'column',
              gap: 8,
            }}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
              <div>
                <div style={{ fontSize: 10.5, color: '#60a5fa', fontWeight: 700 }}>{booth.subLabel || 'GIAN HÀNG TRIỂN LÃM'}</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#ffffff', marginTop: 2 }}>{booth.label}</div>
              </div>
              <button type="button" onClick={() => setActiveBoothId(null)} style={{ background: 'none', border: 0, color: '#94a3b8', cursor: 'pointer' }}>
                <X size={15} />
              </button>
            </div>
            {staffAtBooth.length > 0 ? (
              <div style={{ fontSize: 12, color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: 4 }}>
                <div style={{ fontSize: 11, color: '#34d399', fontWeight: 600 }}>● Nhân viên đang trực tại quầy:</div>
                {staffAtBooth.map((st) => (
                  <div key={st.employeeId} style={{ padding: '5px 8px', borderRadius: 8, background: 'rgba(255,255,255,0.08)' }}>
                    <div style={{ fontWeight: 600, color: '#ffffff' }}>{st.employeeName}</div>
                    {st.department && <div style={{ fontSize: 11, color: '#94a3b8' }}>{st.department}</div>}
                  </div>
                ))}
              </div>
            ) : (
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                Hiện chưa có nhân viên đứng trực tại gian hàng này.
              </div>
            )}
            {data.branding.hotline && (
              <div style={{ fontSize: 11.5, color: '#94a3b8' }}>
                Hotline: <b style={{ color: '#ffffff' }}>{data.branding.hotline}</b>
              </div>
            )}
          </div>
        );
      })()}

      {/* Thanh ngữ cảnh khi đứng gần thiết bị (Xem [E]) */}
      {!editMode && nearbyPlacement && !inspectPlacementId && (
        <div style={{ position: 'fixed', bottom: 86, left: '50%', transform: 'translateX(-50%)', zIndex: 25 }}>
          <button
            type="button"
            onClick={() => setInspectPlacementId(nearbyPlacement.id)}
            style={{
              ...glassStyle,
              borderRadius: 999,
              padding: '9px 18px',
              fontSize: 13.5,
              fontWeight: 600,
              cursor: 'pointer',
              borderColor: '#38bdf8',
              boxShadow: '0 8px 24px rgba(15,23,42,0.35)',
            }}
          >
            Chạm để xem: {nearbyPlacement.name} (E)
          </button>
        </div>
      )}

      {/* Thanh chỉnh sửa đối tượng đang chọn trong Chế độ Thiết kế */}
      {editMode && selectedPlacement && (
        <div
          style={{
            ...glassStyle,
            position: 'fixed',
            top: 64,
            right: 14,
            zIndex: 25,
            width: 280,
            borderRadius: 14,
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <span style={{ fontSize: 13, fontWeight: 700 }}>{selectedPlacement.name}</span>
            <button type="button" onClick={() => setSelectedPlacementId(null)} style={{ background: 'none', border: 0, color: '#94a3b8', cursor: 'pointer' }}>
              <X size={15} />
            </button>
          </div>
          <div style={{ fontSize: 11.5, color: '#94a3b8' }}>
            Tọa độ: X={selectedPlacement.posX}m · Y={selectedPlacement.posY}m · Z={selectedPlacement.posZ}m
          </div>
          <div style={{ display: 'flex', gap: 6 }}>
            <button
              type="button"
              onClick={() => setTransformMode('translate')}
              style={{
                flex: 1, padding: '6px 8px', borderRadius: 8, border: 0, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: transformMode === 'translate' ? '#2563eb' : 'rgba(255,255,255,0.1)', color: '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
            >
              <Move size={13} /> Di chuyển
            </button>
            <button
              type="button"
              onClick={() => setTransformMode('rotate')}
              style={{
                flex: 1, padding: '6px 8px', borderRadius: 8, border: 0, cursor: 'pointer', fontSize: 12, fontWeight: 600,
                background: transformMode === 'rotate' ? '#2563eb' : 'rgba(255,255,255,0.1)', color: '#fff',
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
              }}
            >
              <RotateCw size={13} /> Xoay
            </button>
          </div>
          <label style={{ fontSize: 11.5, color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: 4 }}>
            Mã vị trí kho (VD: A1-T2-01)
            <input
              value={selectedPlacement.locationCode || ''}
              onChange={(e) => {
                const val = e.target.value;
                setPlacements((prev) => prev.map((p) => (p.id === selectedPlacement.id ? { ...p, locationCode: val } : p)));
                setDirty(true);
              }}
              style={{ padding: '6px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12.5 }}
            />
          </label>
          <label style={{ fontSize: 11.5, color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: 4 }}>
            Cao độ tầng kệ Y (mét): {selectedPlacement.posY}m
            <div style={{ display: 'flex', gap: 4 }}>
              {[0, 0.15, 0.92, 1.32, 2.48].map((yVal) => (
                <button
                  key={yVal}
                  type="button"
                  onClick={() => {
                    setPlacements((prev) => prev.map((p) => (p.id === selectedPlacement.id ? { ...p, posY: yVal } : p)));
                    setDirty(true);
                  }}
                  style={{
                    flex: 1, padding: '4px 0', borderRadius: 6, border: 0, fontSize: 11, cursor: 'pointer',
                    background: Math.abs(selectedPlacement.posY - yVal) < 0.05 ? '#2563eb' : 'rgba(255,255,255,0.1)', color: '#fff',
                  }}
                >
                  {yVal}m
                </button>
              ))}
            </div>
          </label>
          <button
            type="button"
            onClick={() => {
              setPlacements((prev) => prev.filter((p) => p.id !== selectedPlacement.id));
              setSelectedPlacementId(null);
              setDirty(true);
            }}
            style={{
              padding: '7px 10px', borderRadius: 8, border: 0, cursor: 'pointer', fontSize: 12, fontWeight: 600,
              background: 'rgba(220,38,38,0.2)', color: '#fca5a5', display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 5,
            }}
          >
            <Trash2 size={13} /> Gỡ thiết bị khỏi vị trí
          </button>
        </div>
      )}

      {/* Bảng drawer mở lên từ Bottom Dock */}
      {dockTab !== 'none' && (
        <div
          style={{
            ...glassStyle,
            position: 'fixed',
            bottom: 82,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 30,
            width: 'min(94vw, 680px)',
            maxHeight: '56vh',
            borderRadius: 16,
            padding: 16,
            display: 'flex',
            flexDirection: 'column',
            gap: 12,
            overflow: 'hidden',
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
            <div style={{ fontSize: 14, fontWeight: 700 }}>
              {dockTab === 'departments' && 'Phòng ban & Khu trưng bày (Bấm để dịch chuyển)'}
              {dockTab === 'products' && 'Thiết bị trưng bày & Trình tạo 3D'}
              {dockTab === 'design' && 'Thiết kế bố cục Kho & Showroom 3D'}
              {dockTab === 'map' && 'Bản đồ 2D (Bấm vào điểm bất kỳ để Teleport)'}
            </div>
            <button type="button" onClick={() => setDockTab('none')} style={{ background: 'none', border: 0, color: '#94a3b8', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          </div>

          {/* Tab Phòng ban */}
          {dockTab === 'departments' && (
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(195px, 1fr))', gap: 8, overflowY: 'auto' }}>
              {structures.map((st) => (
                <button
                  key={st.id}
                  type="button"
                  onClick={() => {
                    const offset = st.posX < 0 ? 4 : -4;
                    teleportTo(st.posX + offset, st.posZ, st.posX, st.posZ);
                    setDockTab('none');
                  }}
                  style={{
                    textAlign: 'left',
                    padding: '10px 12px',
                    borderRadius: 10,
                    border: '1px solid rgba(255,255,255,0.12)',
                    background: 'rgba(255,255,255,0.06)',
                    color: '#fff',
                    cursor: 'pointer',
                  }}
                >
                  <div style={{ fontSize: 12.5, fontWeight: 600 }}>{st.label}</div>
                  <div style={{ fontSize: 11, color: '#94a3b8', marginTop: 2 }}>{st.subLabel || st.aisleCode || st.kind}</div>
                </button>
              ))}
            </div>
          )}

          {/* Tab Sản phẩm & Tạo 3D */}
          {dockTab === 'products' && (
            <>
              <div style={{ position: 'relative' }}>
                <Search size={14} style={{ position: 'absolute', left: 10, top: 10, color: '#94a3b8' }} />
                <input
                  value={searchText}
                  onChange={(e) => setSearchText(e.target.value)}
                  placeholder="Tìm mã hàng, tên máy hoặc mã vị trí (VD: A1-T1)…"
                  style={{
                    width: '100%', padding: '8px 12px 8px 32px', borderRadius: 9,
                    border: '1px solid rgba(255,255,255,0.16)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 13,
                  }}
                />
              </div>
              <div style={{ overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: 8 }}>
                <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#60a5fa', fontWeight: 600 }}>
                  Đang bố trí trong không gian ({filteredPlacements.length})
                </div>
                {filteredPlacements.map((p) => (
                  <div
                    key={p.id}
                    style={{
                      display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10,
                      padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.06)',
                    }}
                  >
                    <div style={{ minWidth: 0 }}>
                      <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                      <div style={{ fontSize: 11.5, color: '#94a3b8' }}>
                        {p.itemCode} {p.locationCode ? `· Vị trí ${p.locationCode}` : ''}
                        {p.sellingPrice ? ` · ${money(p.sellingPrice)}` : ''}
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => {
                        teleportTo(p.posX + (p.posX > 0 ? -3.2 : 3.2), p.posZ, p.posX, p.posZ);
                        setInspectPlacementId(p.id);
                        setDockTab('none');
                      }}
                      style={{ padding: '5px 10px', borderRadius: 8, border: 0, background: '#2563eb', color: '#fff', fontSize: 12, fontWeight: 600, cursor: 'pointer', flexShrink: 0 }}
                    >
                      Tới vị trí
                    </button>
                  </div>
                ))}

                {data.canEdit && (
                  <>
                    <div style={{ fontSize: 11, textTransform: 'uppercase', color: '#34d399', fontWeight: 600, marginTop: 6 }}>
                      Danh mục sản phẩm nội bộ — Tạo 3D & Đặt vào kho ({filteredCatalog.length})
                    </div>
                    {filteredCatalog.slice(0, 25).map((item) => (
                      <div
                        key={item.id}
                        style={{
                          display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8,
                          padding: '8px 10px', borderRadius: 10, background: 'rgba(255,255,255,0.04)',
                          border: '1px solid rgba(255,255,255,0.08)',
                        }}
                      >
                        <div style={{ minWidth: 0 }}>
                          <div style={{ fontSize: 12.5, fontWeight: 600 }}>{item.name}</div>
                          <div style={{ fontSize: 11, color: '#94a3b8' }}>
                            {item.itemCode} · {Math.round(item.model3D.widthM * 100)}×{Math.round(item.model3D.heightM * 100)}×{Math.round(item.model3D.depthM * 100)}cm · {item.model3D.modelType}
                          </div>
                        </div>
                        <div style={{ display: 'flex', gap: 6, flexShrink: 0 }}>
                          <button
                            type="button"
                            onClick={() => open3DStudio(item)}
                            style={{
                              padding: '5px 9px', borderRadius: 8, border: '1px solid rgba(96,165,250,0.5)',
                              background: 'rgba(37,99,235,0.2)', color: '#93c5fd', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}
                          >
                            <Sparkles size={12} /> Tạo 3D
                          </button>
                          <button
                            type="button"
                            onClick={() => handleAddPlacementFromCatalog(item)}
                            style={{
                              padding: '5px 9px', borderRadius: 8, border: 0,
                              background: '#059669', color: '#fff', fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                              display: 'inline-flex', alignItems: 'center', gap: 4,
                            }}
                          >
                            <Plus size={12} /> Đặt vào kho
                          </button>
                        </div>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </>
          )}

          {/* Tab Thiết kế / Sắp xếp */}
          {dockTab === 'design' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
              <div style={{ fontSize: 12.5, color: '#cbd5e1', lineHeight: 1.5 }}>
                Bật chế độ Thiết kế, bấm chọn trực tiếp vào thiết bị trong không gian 3D để hiện trục mũi tên kéo di chuyển (snap 0.25m) hoặc xoay góc, sau đó nhấn <b>Lưu sơ đồ 3D</b>.
              </div>
              <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8 }}>
                <button
                  type="button"
                  onClick={() => setEditMode((v) => !v)}
                  style={{
                    padding: '8px 14px', borderRadius: 9, border: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 600,
                    background: editMode ? '#f59e0b' : '#2563eb', color: '#fff',
                  }}
                >
                  {editMode ? 'Đang bật chế độ Kéo-Thả (Bấm để tắt)' : 'Bật chế độ Kéo-Thả 3D'}
                </button>
                <button
                  type="button"
                  onClick={() => handleAddStructure('RACK')}
                  style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12.5, cursor: 'pointer' }}
                >
                  + Thêm Kệ kho 3D
                </button>
                <button
                  type="button"
                  onClick={() => handleAddStructure('BOOTH')}
                  style={{ padding: '8px 12px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12.5, cursor: 'pointer' }}
                >
                  + Thêm Quầy trưng bày
                </button>
                <button
                  type="button"
                  onClick={handleSaveLayout}
                  disabled={pending}
                  style={{
                    marginLeft: 'auto', padding: '8px 16px', borderRadius: 9, border: 0, cursor: 'pointer', fontSize: 12.5, fontWeight: 700,
                    background: dirty ? '#16a34a' : '#334155', color: '#fff', display: 'inline-flex', alignItems: 'center', gap: 6,
                  }}
                >
                  <Save size={14} /> {pending ? 'Đang lưu…' : 'Lưu sơ đồ 3D'}
                </button>
              </div>
            </div>
          )}

          {/* Tab Bản đồ 2D (Minimap Teleport) */}
          {dockTab === 'map' && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
              <svg
                viewBox={`-${data.activeScene.widthM / 2 + 2} -${data.activeScene.depthM / 2 + 2} ${data.activeScene.widthM + 4} ${data.activeScene.depthM + 4}`}
                style={{ width: '100%', height: 240, background: '#020617', borderRadius: 12, border: '1px solid rgba(255,255,255,0.12)', cursor: 'crosshair' }}
                onClick={(e) => {
                  const svg = e.currentTarget;
                  const rect = svg.getBoundingClientRect();
                  const nx = (e.clientX - rect.left) / rect.width;
                  const ny = (e.clientY - rect.top) / rect.height;
                  const worldX = -(data.activeScene.widthM / 2 + 2) + nx * (data.activeScene.widthM + 4);
                  const worldZ = -(data.activeScene.depthM / 2 + 2) + ny * (data.activeScene.depthM + 4);
                  teleportTo(Number(worldX.toFixed(1)), Number(worldZ.toFixed(1)));
                  setDockTab('none');
                }}
              >
                {structures.map((st) => (
                  <g key={st.id} transform={`translate(${st.posX}, ${st.posZ}) rotate(${(-st.rotY * 180) / Math.PI})`}>
                    <rect
                      x={-st.widthM / 2}
                      y={-st.depthM / 2}
                      width={st.widthM}
                      height={st.depthM}
                      rx={0.3}
                      fill={st.accentColor}
                      fillOpacity={0.35}
                      stroke={st.accentColor}
                      strokeWidth={0.2}
                    />
                  </g>
                ))}
                {placements.map((p) => (
                  <circle key={p.id} cx={p.posX} cy={p.posZ} r={0.45} fill="#38bdf8" />
                ))}
                {data.presences.map((pr) => (
                  <g key={pr.employeeId}>
                    <circle cx={pr.posX} cy={pr.posZ} r={0.65} fill="#10b981" stroke="#ffffff" strokeWidth={0.2} />
                    <text
                      x={pr.posX}
                      y={pr.posZ - 1.1}
                      textAnchor="middle"
                      fill="#34d399"
                      fontSize="1.15"
                      fontWeight="700"
                    >
                      {pr.employeeName}
                    </text>
                  </g>
                ))}
                {/* Vị trí người chơi */}
                <circle cx={nearby.playerPos.x} cy={nearby.playerPos.z} r={0.75} fill="#2563eb" stroke="#ffffff" strokeWidth={0.25} />
              </svg>
              <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: '#94a3b8' }}>
                <span>● Xanh đậm: Vị trí của bạn</span>
                <span>● Xanh ngọc: Thiết bị</span>
                <span>● Xanh lá: Nhân viên đang trực</span>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Thanh Dock 4 nút nổi phía dưới (phong cách hopcho.maclife.vn) */}
      <div
        style={{
          ...glassStyle,
          position: 'fixed',
          bottom: 16,
          left: '50%',
          transform: 'translateX(-50%)',
          zIndex: 25,
          borderRadius: 16,
          padding: '6px 10px',
          display: 'flex',
          alignItems: 'center',
          gap: 6,
          boxShadow: '0 12px 32px rgba(0,0,0,0.35)',
        }}
      >
        {(
          [
            { key: 'departments', label: 'Phòng ban', icon: Building2, visible: true },
            { key: 'products', label: 'Sản phẩm & 3D', icon: Package, visible: true },
            { key: 'design', label: dirty ? 'Thiết kế ●' : 'Thiết kế kho', icon: Wrench, visible: data.canEdit },
            { key: 'map', label: 'Bản đồ', icon: MapIcon, visible: true },
          ] as const
        )
          .filter((item) => item.visible)
          .map((item) => {
            const active = dockTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => setDockTab(active ? 'none' : item.key)}
                style={{
                  display: 'flex',
                  flexDirection: 'column',
                  alignItems: 'center',
                  gap: 3,
                  minWidth: 88,
                  padding: '7px 10px',
                  borderRadius: 11,
                  border: 0,
                  cursor: 'pointer',
                  background: active ? '#2563eb' : 'transparent',
                  color: active ? '#fff' : '#cbd5e1',
                  fontSize: 11.5,
                  fontWeight: 600,
                }}
              >
                <item.icon size={16} />
                <span>{item.label}</span>
              </button>
            );
          })}
      </div>

      {/* Modal Xem chi tiết Thiết bị */}
      {inspectedPlacement && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 45, background: 'rgba(2,6,23,0.55)',
            display: 'grid', placeItems: 'center', padding: 16,
          }}
          onClick={() => setInspectPlacementId(null)}
        >
          <div
            style={{ ...glassStyle, width: '100%', maxWidth: 440, borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}
            onClick={(e) => e.stopPropagation()}
          >
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 10 }}>
              <div>
                <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 600 }}>
                  {inspectedPlacement.itemCode} {inspectedPlacement.locationCode ? `· Vị trí ${inspectedPlacement.locationCode}` : ''}
                </div>
                <h2 style={{ fontSize: 17, fontWeight: 700, marginTop: 2, color: '#ffffff' }}>{inspectedPlacement.name}</h2>
              </div>
              <button type="button" onClick={() => setInspectPlacementId(null)} style={{ background: 'none', border: 0, color: '#94a3b8', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>
            {inspectedPlacement.imageUrl && (
              <img
                src={inspectedPlacement.imageUrl}
                alt={inspectedPlacement.name}
                style={{ width: '100%', maxHeight: 180, objectFit: 'contain', background: '#fff', borderRadius: 10, padding: 8 }}
              />
            )}
            <div style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.5 }}>
              {inspectedPlacement.description || 'Thiết bị trưng bày chính hãng tại Showroom.'}
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
              <div style={{ padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.06)' }}>
                <div style={{ color: '#94a3b8' }}>Kích thước thực</div>
                <div style={{ fontWeight: 600, marginTop: 2 }}>
                  {Math.round(inspectedPlacement.model3D.widthM * 100)} × {Math.round(inspectedPlacement.model3D.heightM * 100)} × {Math.round(inspectedPlacement.model3D.depthM * 100)} cm
                </div>
              </div>
              {inspectedPlacement.sellingPrice ? (
                <div style={{ padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.06)' }}>
                  <div style={{ color: '#94a3b8' }}>Giá niêm yết</div>
                  <div style={{ fontWeight: 700, color: '#60a5fa', marginTop: 2 }}>{money(inspectedPlacement.sellingPrice)}</div>
                </div>
              ) : null}
              {data.isStaff && inspectedPlacement.stockQty !== null && inspectedPlacement.stockQty !== undefined && (
                <div style={{ padding: 8, borderRadius: 8, background: 'rgba(255,255,255,0.06)' }}>
                  <div style={{ color: '#94a3b8' }}>Tồn kho hiện tại</div>
                  <div style={{ fontWeight: 700, color: '#34d399', marginTop: 2 }}>{inspectedPlacement.stockQty}</div>
                </div>
              )}
            </div>
            {data.branding.hotline && !data.isStaff && (
              <div style={{ fontSize: 12, color: '#94a3b8' }}>
                Hotline tư vấn: <b style={{ color: '#fff' }}>{data.branding.hotline}</b>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Modal AI 3D Product Studio (Dựng 3D từ mô tả / Upload .glb) */}
      {studioItem && (
        <div
          style={{
            position: 'fixed', inset: 0, zIndex: 55, background: 'rgba(2,6,23,0.72)',
            display: 'grid', placeItems: 'center', padding: 16,
          }}
        >
          <div style={{ ...glassStyle, width: '100%', maxWidth: 520, borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 14 }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
              <div>
                <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 600 }}>PRODUCT 3D STUDIO</div>
                <h3 style={{ fontSize: 16, fontWeight: 700, color: '#ffffff' }}>{studioItem.name}</h3>
              </div>
              <button type="button" onClick={() => setStudioItem(null)} style={{ background: 'none', border: 0, color: '#94a3b8', cursor: 'pointer' }}>
                <X size={18} />
              </button>
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 8 }}>
              {[
                { label: 'Rộng (cm)', key: 'widthCm' as const },
                { label: 'Cao (cm)', key: 'heightCm' as const },
                { label: 'Sâu (cm)', key: 'depthCm' as const },
              ].map((f) => (
                <label key={f.key} style={{ fontSize: 11.5, color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: 4 }}>
                  {f.label}
                  <input
                    type="number"
                    min={15}
                    max={500}
                    value={studioForm[f.key]}
                    onChange={(e) => setStudioForm((s) => ({ ...s, [f.key]: Number(e.target.value) || 50 }))}
                    style={{ padding: '7px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 13 }}
                  />
                </label>
              ))}
            </div>

            <label style={{ fontSize: 12, color: '#cbd5e1', display: 'flex', flexDirection: 'column', gap: 5 }}>
              Mô tả thiết bị để AI dựng mô hình 3D (VD: Máy pha cà phê 2 group vỏ inox, Tủ mát kính 2 cánh…)
              <textarea
                rows={3}
                value={studioForm.aiPrompt}
                onChange={(e) => setStudioForm((s) => ({ ...s, aiPrompt: e.target.value }))}
                style={{ padding: '8px 10px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.18)', background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 13 }}
              />
            </label>

            <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap', alignItems: 'center' }}>
              <button
                type="button"
                onClick={handleGenerateAI3D}
                disabled={pending}
                style={{
                  padding: '8px 14px', borderRadius: 9, border: 0, background: '#2563eb', color: '#fff',
                  fontSize: 12.5, fontWeight: 600, cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <Sparkles size={14} /> AI Dựng 3D từ mô tả
              </button>

              <input ref={glbInputRef} type="file" accept=".glb" style={{ display: 'none' }} onChange={handleUploadGlb} />
              <button
                type="button"
                onClick={() => glbInputRef.current?.click()}
                disabled={uploadingGlb}
                style={{
                  padding: '8px 14px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.2)',
                  background: 'rgba(255,255,255,0.08)', color: '#fff', fontSize: 12.5, fontWeight: 500,
                  cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 6,
                }}
              >
                <Upload size={14} /> {uploadingGlb ? 'Đang tải…' : 'Tải file .glb (≤ 4MB)'}
              </button>
            </div>

            <div style={{ fontSize: 12, color: '#94a3b8' }}>
              Định dạng đang chọn: <b style={{ color: '#60a5fa' }}>{studioForm.modelType}</b>
              {studioForm.modelType === 'PROCEDURAL_JSON' && studioForm.proceduralParts && ` (${studioForm.proceduralParts.length} khối hình học)`}
              {studioForm.modelType === 'GLB' && studioForm.glbUrl && ` · Đã gắn tệp GLB`}
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, marginTop: 4 }}>
              <button
                type="button"
                onClick={() => setStudioItem(null)}
                style={{ padding: '8px 14px', borderRadius: 9, border: '1px solid rgba(255,255,255,0.16)', background: 'transparent', color: '#cbd5e1', fontSize: 13, cursor: 'pointer' }}
              >
                Hủy
              </button>
              <button
                type="button"
                onClick={handleSaveStudioModel}
                disabled={pending}
                style={{ padding: '8px 16px', borderRadius: 9, border: 0, background: '#16a34a', color: '#fff', fontSize: 13, fontWeight: 600, cursor: 'pointer' }}
              >
                Lưu mô hình 3D
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
