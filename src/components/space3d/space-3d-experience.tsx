'use client';

import React, { useCallback, useEffect, useMemo, useRef, useState, useTransition } from 'react';
import dynamic from 'next/dynamic';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import {
  Eye, Sun, Moon, Map as MapIcon, Package, Building2, Wrench, Sparkles, Upload,
  Save, RotateCw, Move, Trash2, Plus, X, ArrowLeft, UserCheck, LogIn, Search, Compass, Shirt,
  MessageCircle, Settings2, ChevronDown, Users, Smile, Coffee, ClipboardList, Volume2, VolumeX,
} from 'lucide-react';
import {
  DEFAULT_AVATAR_3D_CONFIG,
  normalizeAvatar3DConfig,
  synthesizeProcedural3D,
  type Avatar3DConfig,
  type Procedural3DPart,
  type Product3DModelView,
  type SpaceCatalogItem,
  type SpacePayload,
  type SpacePlacementView,
  type SpacePresenceView,
  type SpaceStructure,
  normalizeSpaceObject,
  UNIFORM_BOTTOM_NAVY,
  UNIFORM_NAVY,
  UNIFORM_WHITE,
  type AvatarBottomStyle,
} from '@/lib/space-3d-types';
import {
  generateProduct3DAction,
  saveMyAvatar3DAction,
  saveProduct3DModelAction,
  saveSpaceSceneLayoutAction,
  setSpaceChatModeAction,
  heartbeatPresenceAction,
  toggleStaffDutyAction,
} from '@/server/modules/space3d/actions';
import type { TeleportTarget } from './space-3d-canvas';
import { useSpaceRealtime, type IncomingDm } from './use-space-realtime';
import { SpaceCafeMenu } from './space-cafe-menu';
import { SpaceCafeOrders } from './space-cafe-orders';
import { playChime, startCafeAmbience } from './space-sound';
import { clearDrinkOrdersAction, getCafeStateAction, npcAdvanceOrderAction, placeDrinkOrderAction, updateDrinkOrderAction } from '@/server/modules/space3d/cafe-actions';
import { DEFAULT_CAFE_MENU, orderSummary, type CafeMenuItem, type DrinkOrderView, type OrderLine } from '@/lib/space-3d-cafe-menu';
import { SpaceChatPanel, type ChatPeer } from './space-chat-panel';
import { SpaceVisitorChat, type VisitorChatTarget } from './space-visitor-chat';
import { SpaceGuestInbox, type GuestEvent } from './space-guest-inbox';
import { useLayoutHistory } from './editor/use-layout-history';
// Panel trình thiết kế tải trễ (kéo theo Three.js để render ảnh thu nhỏ) — chỉ người thiết kế mới cần
const EditorToolbar = dynamic(() => import('./editor/space-editor-panels').then((m) => m.EditorToolbar), { ssr: false });
const LibraryPanel = dynamic(() => import('./editor/space-editor-panels').then((m) => m.LibraryPanel), { ssr: false });
const InspectorPanel = dynamic(() => import('./editor/space-editor-panels').then((m) => m.InspectorPanel), { ssr: false });
import { normalizeSceneKind } from '@/lib/space-3d-catalog';
import { templateFor } from '@/lib/space-3d-templates';
import { resolveMerchItems } from '@/lib/space-3d-merch';
import { DEMO_PRODUCT_MAP } from '@/lib/space-3d-demo-products';
import { getOrCreateGuestKey, guestNumericId } from '@/lib/space-3d-guest';
import { SPACE_EMOTES } from '@/lib/space-3d-chat';
import {
  ROTATE_STEP,
  clampInside,
  createObject,
  duplicateObject,
  findCollisions,
  isStaffSeat,
  SEATABLE_KINDS,
  seatsFor,
  snapAngle,
} from '@/lib/space-3d-layout';
import {
  QUALITY_LABEL,
  readQualityPref,
  writeQualityPref,
  type QualityLevel,
  type QualityPref,
} from './three/quality';

const Space3DCanvas = dynamic(
  () => import('./space-3d-canvas').then((m) => m.Space3DCanvas),
  {
    ssr: false,
    loading: () => (
      <div style={{ position: 'fixed', inset: 0, display: 'grid', placeItems: 'center', background: '#0f172a', color: '#e2e8f0', fontSize: 14 }}>
        Đang khởi tạo TIM Space…
      </div>
    ),
  },
);

type DockTab = 'none' | 'departments' | 'products' | 'design' | 'map';

const money = (n: number) => `${new Intl.NumberFormat('vi-VN').format(Math.round(n))} ₫`;

/** Phong cách đẹp nhất mặc định cho khách theo giới tính */
/** Đồng phục nhân viên TIM Corp: áo trắng / xanh đậm có logo, quần tây (nam) hoặc chân váy (nữ) xanh đậm */
const UNIFORM_PRESETS: { key: string; label: string; outfitColor: string; bottomStyle: AvatarBottomStyle }[] = [
  { key: 'w-pants', label: 'Áo trắng · Quần tây', outfitColor: UNIFORM_WHITE, bottomStyle: 'pants' },
  { key: 'w-skirt', label: 'Áo trắng · Chân váy', outfitColor: UNIFORM_WHITE, bottomStyle: 'skirt' },
  { key: 'n-pants', label: 'Áo xanh · Quần tây', outfitColor: UNIFORM_NAVY, bottomStyle: 'pants' },
  { key: 'n-skirt', label: 'Áo xanh · Chân váy', outfitColor: UNIFORM_NAVY, bottomStyle: 'skirt' },
];

const GUEST_PRESETS: Record<'male' | 'female', Avatar3DConfig> = {
  male: { outfitStyle: 'suit', outfitColor: '#1e3a8a', pantsColor: '#1e293b', bottomStyle: 'pants', hairStyle: 'slick', hairColor: '#1c1917', skinTone: '#f1c9a5', hasGlasses: false },
  female: { outfitStyle: 'dress', outfitColor: '#1e3a8a', pantsColor: '#1e293b', bottomStyle: 'pants', hairStyle: 'long', hairColor: '#2b1b14', skinTone: '#f6d5bd', hasGlasses: false },
};

/** Khách tham quan nhàn rỗi quá 30 phút → thoát về màn hình chào */
const GUEST_IDLE_MS = 30 * 60 * 1000;
const GUEST_KEY = 'space3d.guest';

interface GuestSession {
  name: string;
  gender: 'male' | 'female';
  avatar: Avatar3DConfig;
  entered: boolean;
  lastActive: number;
}

function readGuestSession(): GuestSession | null {
  try {
    const raw = window.localStorage.getItem(GUEST_KEY);
    if (!raw) return null;
    const v = JSON.parse(raw) as Partial<GuestSession>;
    if (typeof v.lastActive !== 'number') return null;
    return {
      name: typeof v.name === 'string' && v.name.trim() ? v.name.slice(0, 40) : 'Khách tham quan',
      gender: v.gender === 'female' ? 'female' : 'male',
      avatar: normalizeAvatar3DConfig(v.avatar),
      entered: Boolean(v.entered),
      lastActive: v.lastActive,
    };
  } catch {
    return null;
  }
}

function writeGuestSession(s: GuestSession) {
  try {
    window.localStorage.setItem(GUEST_KEY, JSON.stringify(s));
  } catch {
    // localStorage bị chặn → phiên chỉ tồn tại trong tab hiện tại
  }
}

/** Nút icon tròn trên HUD (tooltip qua `title`, trạng thái bật, huy hiệu số) */
function HudButton({
  children,
  title,
  active = false,
  activeBg = '#2563eb',
  badge = 0,
  small = false,
  disabled = false,
  onClick,
}: {
  children: React.ReactNode;
  title: string;
  active?: boolean;
  activeBg?: string;
  badge?: number;
  small?: boolean;
  disabled?: boolean;
  onClick: () => void;
}) {
  const size = small ? 28 : 32;
  const [hover, setHover] = useState(false);
  return (
    <button
      type="button"
      aria-label={title}
      aria-pressed={active}
      disabled={disabled}
      onClick={onClick}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
      onFocus={() => setHover(true)}
      onBlur={() => setHover(false)}
      style={{
        position: 'relative',
        width: size,
        height: size,
        borderRadius: 999,
        border: 0,
        display: 'grid',
        placeItems: 'center',
        cursor: disabled ? 'default' : 'pointer',
        background: active ? activeBg : 'transparent',
        color: active ? '#fff' : '#cbd5e1',
        transition: 'background .15s',
        opacity: disabled ? 0.6 : 1,
      }}
    >
      {children}
      {badge > 0 && (
        <span style={{ position: 'absolute', top: -2, right: -2, minWidth: 15, height: 15, padding: '0 3px', borderRadius: 99, background: '#ef4444', color: '#fff', fontSize: 9.5, fontWeight: 700, display: 'grid', placeItems: 'center' }}>
          {badge > 99 ? '99+' : badge}
        </span>
      )}
      {hover && (
        // Tooltip hiện ngay khi rê chuột (title gốc của trình duyệt hiện chậm & khó đọc)
        <span
          role="tooltip"
          style={{
            position: 'absolute',
            top: 'calc(100% + 8px)',
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 70,
            width: 'max-content',
            maxWidth: 220,
            padding: '5px 9px',
            borderRadius: 8,
            background: 'rgba(15,23,42,0.95)',
            border: '1px solid rgba(255,255,255,0.14)',
            color: '#f8fafc',
            fontSize: 11.5,
            fontWeight: 600,
            lineHeight: 1.35,
            textAlign: 'center',
            whiteSpace: 'normal',
            pointerEvents: 'none',
            boxShadow: '0 6px 18px rgba(0,0,0,0.35)',
          }}
        >
          {title}
        </span>
      )}
    </button>
  );
}

export function Space3DExperience({ data }: { data: SpacePayload }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  // Guest entry overlay + Persistent Staff Avatar customizer
  const [entered, setEntered] = useState(data.isStaff);
  const [guestName, setGuestName] = useState('Khách tham quan');
  const [guestGender, setGuestGender] = useState<'male' | 'female'>('male');
  /** Chỉ bay intro khi khách vừa bấm vào (không bay lại khi khôi phục phiên sau reload) */
  const [introOnEnter, setIntroOnEnter] = useState(data.isStaff);
  const [avatarConfig, setAvatarConfig] = useState<Avatar3DConfig>(
    data.currentUser?.avatar ?? { ...DEFAULT_AVATAR_3D_CONFIG },
  );
  const [avatarPanelOpen, setAvatarPanelOpen] = useState(false);

  // ───── Phiên khách tham quan: nhớ sau reload, tự thoát khi idle lâu ─────
  useEffect(() => {
    if (data.isStaff) return;
    const saved = readGuestSession();
    if (!saved) return;
    setGuestName(saved.name);
    setGuestGender(saved.gender);
    setAvatarConfig(saved.avatar);
    if (Date.now() - saved.lastActive < GUEST_IDLE_MS && saved.entered) setEntered(true);
  }, [data.isStaff]);

  useEffect(() => {
    if (data.isStaff || !entered) return;
    writeGuestSession({ name: guestName, gender: guestGender, avatar: avatarConfig, entered: true, lastActive: Date.now() });
  }, [data.isStaff, entered, guestName, guestGender, avatarConfig]);

  useEffect(() => {
    if (data.isStaff || !entered) return;
    let last = Date.now();
    const touch = () => {
      const now = Date.now();
      if (now - last < 20_000) return;
      last = now;
      writeGuestSession({ name: guestName, gender: guestGender, avatar: avatarConfig, entered: true, lastActive: now });
    };
    const check = window.setInterval(() => {
      if (Date.now() - last > GUEST_IDLE_MS) {
        writeGuestSession({ name: guestName, gender: guestGender, avatar: avatarConfig, entered: false, lastActive: last });
        setEntered(false);
        setIntroOnEnter(false);
      }
    }, 60_000);
    window.addEventListener('pointerdown', touch);
    window.addEventListener('keydown', touch);
    window.addEventListener('wheel', touch, { passive: true });
    return () => {
      window.clearInterval(check);
      window.removeEventListener('pointerdown', touch);
      window.removeEventListener('keydown', touch);
      window.removeEventListener('wheel', touch);
    };
  }, [data.isStaff, entered, guestName, guestGender, avatarConfig]);

  const chooseGuestGender = (g: 'male' | 'female') => {
    setGuestGender(g);
    setAvatarConfig({ ...GUEST_PRESETS[g] });
  };
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
  const playerPosRef = useRef<{ x: number; z: number; rotY: number; sit?: number }>({ x: 0, z: 11, rotY: 0, sit: 0 });
  const [nearby, setNearby] = useState<{
    zoneName: string;
    nearPlacementId: string | null;
  }>({
    zoneName: data.activeScene.kind === 'WAREHOUSE' ? 'Khu vực Kho hàng' : 'Sảnh Triển Lãm Trung Tâm',
    nearPlacementId: null,
  });

  // ───── Đồ họa: preset chất lượng + debug ─────
  const [qualityPref, setQualityPref] = useState<QualityPref>('auto');
  const [qualityActive, setQualityActive] = useState<QualityLevel | null>(null);
  const [qualityMenuOpen, setQualityMenuOpen] = useState(false);
  const [sceneMenuOpen, setSceneMenuOpen] = useState(false);
  const [debug3D, setDebug3D] = useState(false);
  useEffect(() => {
    setQualityPref(readQualityPref());
    setDebug3D(new URLSearchParams(window.location.search).get('debug') === '1');
  }, []);
  const chooseQuality = (pref: QualityPref) => {
    setQualityPref(pref);
    writeQualityPref(pref);
    setQualityMenuOpen(false);
  };

  // ───── Realtime: nhân viên thấy nhau di chuyển + chat ─────
  const [chatOpen, setChatOpen] = useState(false);
  const [chatPeer, setChatPeer] = useState<ChatPeer | null>(null);
  const [chatUnread, setChatUnread] = useState(0);
  const [selectedRemoteId, setSelectedRemoteId] = useState<number | null>(null);
  const [bubbleOpen, setBubbleOpen] = useState(false);
  const [emoteOpen, setEmoteOpen] = useState(false);
  const [bubbleDraft, setBubbleDraft] = useState('');
  const dmHandlerRef = useRef<((dm: IncomingDm) => void) | null>(null);
  // Chế độ trả lời khách của nhân viên + khung hỏi đáp khách ↔ nhân viên / AI
  const [chatMode, setChatMode] = useState<'LIVE' | 'AI'>(data.currentUser?.chatMode ?? 'LIVE');
  const [visitorTarget, setVisitorTarget] = useState<VisitorChatTarget | null>(null);
  const [guestInboxOpen, setGuestInboxOpen] = useState(false);
  const [guestUnread, setGuestUnread] = useState(0);
  const guestEventRef = useRef<((e: GuestEvent) => void) | null>(null);
  const chatStateRef = useRef({ chatOpen, chatPeer });
  chatStateRef.current = { chatOpen, chatPeer };

  const cu = data.currentUser;
  // Khách tham quan đã vào → có mã khách để hiện nhân vật cho mọi người (kể cả nhân viên) cùng thấy
  const [guestKey, setGuestKey] = useState<string | null>(null);
  useEffect(() => {
    if (!cu && entered) setGuestKey(getOrCreateGuestKey());
  }, [cu, entered]);
  const realtimeSelf = useMemo(
    () =>
      cu
        ? {
            employeeId: cu.employeeId,
            employeeName: cu.fullName,
            department: cu.departmentName,
            avatar: cu.avatar,
            onDuty: cu.isOnDuty,
            stationLabel: cu.dutyStation,
            chatMode,
          }
        : guestKey
          ? {
              employeeId: guestNumericId(guestKey),
              employeeName: (guestName.trim() || 'Khách tham quan').slice(0, 40),
              department: null,
              // Khách không mặc đồng phục công ty (phòng khi còn lưu từ phiên cũ)
              avatar: avatarConfig.outfitStyle === 'uniform' ? { ...avatarConfig, outfitStyle: 'shirt' as const } : avatarConfig,
              onDuty: false,
              stationLabel: null,
              chatMode: 'LIVE' as const,
              isGuest: true,
            }
          : null,
    [cu, chatMode, guestKey, guestName, avatarConfig],
  );

  const handleIncomingDm = useCallback((dm: IncomingDm) => {
    dmHandlerRef.current?.(dm);
    const m = dm.message;
    if (!cu || m.fromEmployeeId === cu.employeeId) return;
    const { chatOpen: isOpen, chatPeer: peer } = chatStateRef.current;
    if (!isOpen || peer?.employeeId !== m.fromEmployeeId) {
      const preview = m.body.length > 60 ? `${m.body.slice(0, 60)}…` : m.body;
      setToastMsg({ ok: true, text: `💬 ${dm.fromName}: ${preview}` });
      window.setTimeout(() => setToastMsg((prev) => (prev?.text.startsWith(`💬 ${dm.fromName}`) ? null : prev)), 4000);
    }
  }, [cu]);

  const cafeRefreshRef = useRef<(() => void) | null>(null);
  const realtime = useSpaceRealtime({
    onOrder: () => cafeRefreshRef.current?.(),
    sceneCode: data.activeScene.code,
    self: realtimeSelf,
    guestKey: cu ? null : guestKey,
    playerPosRef,
    onDm: handleIncomingDm,
    onGuest: (evt) => {
      guestEventRef.current?.(evt);
      if (evt.message.fromGuest) {
        const preview = evt.message.body.length > 60 ? `${evt.message.body.slice(0, 60)}…` : evt.message.body;
        setToastMsg({ ok: true, text: `🙋 ${evt.message.guestName}: ${preview}` });
        window.setTimeout(() => setToastMsg((prev) => (prev?.text.startsWith('🙋') ? null : prev)), 4500);
      }
    },
  });
  const realtimeLive = realtime.status === 'live';
  const onlineIds = useMemo(() => new Set(realtime.roster.map((r) => r.employeeId)), [realtime.roster]);

  /** Danh sách nhân viên hiển thị trên Bản đồ 2D / thẻ Gian hàng: realtime khi đã kết nối, ngược lại dữ liệu SSR */
  const livePresences: SpacePresenceView[] = useMemo(() => {
    if (!realtimeLive) return data.presences;
    return realtime.roster.map((r) => {
      const st = realtime.remoteStateRef.current.get(r.employeeId);
      return {
        employeeId: r.employeeId,
        employeeName: r.employeeName,
        department: r.department,
        stationLabel: r.stationLabel,
        posX: st?.tx ?? r.x,
        posZ: st?.tz ?? r.z,
        rotY: st?.tr ?? r.r,
        status: r.onDuty ? 'ON_DUTY' : 'ONLINE',
        avatar: r.avatar,
      };
    });
    // dockTab: chụp lại vị trí mới nhất mỗi khi mở Bản đồ
  }, [realtimeLive, realtime.roster, realtime.remoteStateRef, data.presences, dockTab]); // eslint-disable-line react-hooks/exhaustive-deps
  const onDutyCount = livePresences.filter((p) => p.status === 'ON_DUTY').length;
  const guestOnlineCount = realtime.roster.filter((r) => r.isGuest).length;

  // ───── Khách mới vào → báo ngay cho nhân viên đang online (realtime) ─────
  const [guestArrivals, setGuestArrivals] = useState<{ id: number; name: string; at: number }[]>([]);
  const knownGuestsRef = useRef<Set<number> | null>(null);
  const guestSeenAtRef = useRef(new Map<number, number>());
  const liveSinceRef = useRef(0);
  useEffect(() => {
    if (realtimeLive) liveSinceRef.current = Date.now();
    else knownGuestsRef.current = null;
  }, [realtimeLive]);
  useEffect(() => {
    if (!realtimeLive) return;
    const now = Date.now();
    const guests = realtime.roster.filter((r) => r.isGuest);
    const ids = new Set(guests.map((g) => g.employeeId));
    const prev = knownGuestsRef.current;
    knownGuestsRef.current = ids;
    // Khách rời đi → gỡ thẻ thông báo của họ
    setGuestArrivals((a) => (a.some((x) => !ids.has(x.id)) ? a.filter((x) => ids.has(x.id)) : a));
    const seen = guestSeenAtRef.current;
    // Lần đồng bộ đầu tiên (những khách đã có sẵn) không báo; khách tải lại trang trong 2 phút cũng không báo lại
    const fresh = !cu || !prev || now - liveSinceRef.current < 2500 ? [] : guests.filter((g) => !prev.has(g.employeeId) && now - (seen.get(g.employeeId) ?? 0) > 120_000);
    for (const g of guests) seen.set(g.employeeId, now);
    if (!fresh.length) return;
    setGuestArrivals((a) => [...fresh.map((g) => ({ id: g.employeeId, name: g.employeeName, at: now })), ...a.filter((x) => !fresh.some((g) => g.employeeId === x.id))].slice(0, 3));
  }, [realtime.roster, realtimeLive, cu]);
  useEffect(() => {
    if (!guestArrivals.length) return;
    const t = window.setTimeout(() => setGuestArrivals((a) => a.filter((x) => Date.now() - x.at < 15_000)), 15_500);
    return () => window.clearTimeout(t);
  }, [guestArrivals]);
  /** Thông báo tự tắt sau vài giây (dùng trong callback trước khi showToast được khai báo) */
  const flashToast = (text: string, ms = 4500) => {
    setToastMsg({ ok: true, text });
    window.setTimeout(() => setToastMsg((prev) => (prev?.text === text ? null : prev)), ms);
  };
  // Đổi không gian → xoá thông báo của không gian cũ
  useEffect(() => {
    setToastMsg(null);
  }, [data.activeScene.code]);

  // ───── Quán cà phê: gọi món ↔ nhân viên phục vụ ─────
  const isCafe = data.activeScene.kind === 'CAFE';
  const [cafeMenu, setCafeMenu] = useState<CafeMenuItem[]>(DEFAULT_CAFE_MENU);
  const [drinkOrders, setDrinkOrders] = useState<DrinkOrderView[]>([]);
  const [cafeMenuOpen, setCafeMenuOpen] = useState(false);
  const [cafeOrdersOpen, setCafeOrdersOpen] = useState(false);
  // Chỉ mở 1 bảng nổi một lúc: mở bảng này → tự đóng các bảng khác (tránh đè lên nhau)
  const panelState = { avatar: avatarPanelOpen, quality: qualityMenuOpen, scene: sceneMenuOpen, chat: chatOpen, emote: emoteOpen, inbox: guestInboxOpen, cafeMenu: cafeMenuOpen, cafeOrders: cafeOrdersOpen };
  const panelPrevRef = useRef(panelState);
  useEffect(() => {
    const prev = panelPrevRef.current;
    panelPrevRef.current = panelState;
    const opened = (Object.keys(panelState) as (keyof typeof panelState)[]).find((k) => panelState[k] && !prev[k]);
    if (!opened) return;
    const close: Record<keyof typeof panelState, (v: boolean) => void> = {
      avatar: setAvatarPanelOpen, quality: setQualityMenuOpen, scene: setSceneMenuOpen, chat: setChatOpen,
      emote: setEmoteOpen, inbox: setGuestInboxOpen, cafeMenu: setCafeMenuOpen, cafeOrders: setCafeOrdersOpen,
    };
    for (const k of Object.keys(close) as (keyof typeof panelState)[]) if (k !== opened && panelState[k]) close[k](false);
  }); // eslint-disable-line react-hooks/exhaustive-deps
  const [cafeBusyId, setCafeBusyId] = useState<number | null>(null);
  const [ambienceOn, setAmbienceOn] = useState(false);
  const orderStatusRef = useRef<Map<number, string> | null>(null);
  const myRid = realtimeSelf?.employeeId ?? null;
  const myRidRef = useRef(myRid);
  myRidRef.current = myRid;
  const sceneCode = data.activeScene.code;
  const refreshCafe = useCallback(async () => {
    if (!isCafe) return;
    const st = await getCafeStateAction(sceneCode).catch(() => null);
    if (!st) return;
    setCafeMenu(st.menu);
    setDrinkOrders(st.orders);
    const prev = orderStatusRef.current;
    const next = new Map(st.orders.map((o) => [o.id, o.status as string]));
    orderStatusRef.current = next;
    if (!prev) return; // lần tải đầu: không báo
    const byCode = st.menu;
    for (const o of st.orders) {
      const before = prev.get(o.id);
      if (before === o.status) continue;
      const mine = o.customerRid === myRidRef.current;
      if (!before && o.status === 'NEW' && cu && !mine && data.canEdit) {
        setToastMsg({ ok: true, text: `☕ ${o.customerName} gọi: ${orderSummary(o.lines, byCode)}` });
        window.setTimeout(() => setToastMsg((p) => (p?.text.startsWith('☕') ? null : p)), 5000);
        playChime();
      } else if (mine && o.status === 'PREPARING') {
        flashToast(`👨‍🍳 ${o.servedByName ?? 'Quầy'} đang pha đồ uống cho bạn…`);
      } else if (mine && o.status === 'SERVED') {
        flashToast(`✅ Đồ uống của bạn đã được phục vụ${o.spot ? ' tại bàn' : ''}!`);
        playChime(0.08);
      }
    }
  }, [isCafe, sceneCode, cu]);
  cafeRefreshRef.current = () => void refreshCafe();
  useEffect(() => {
    orderStatusRef.current = null;
    setDrinkOrders([]);
    void refreshCafe();
    if (!isCafe) return;
    // Dự phòng khi mất realtime + để ly hết hạn (30 phút) tự biến mất
    const t = window.setInterval(() => void refreshCafe(), 60_000);
    return () => window.clearInterval(t);
  }, [refreshCafe, isCafe]);
  useEffect(() => {
    if (!ambienceOn || !isCafe) return;
    return startCafeAmbience();
  }, [ambienceOn, isCafe]);
  const myDrinkOrders = drinkOrders.filter((o) => myRid != null && o.customerRid === myRid);

  // ───── NPC quán cà phê tự phục vụ khi KHÔNG có nhân viên trực ─────
  // Quán cà phê có nhân viên riêng (NPC): nhân viên công ty vào quán cũng là khách → NPC luôn phục vụ
  const staffOnDuty = false;
  const preparingSeenRef = useRef(new Map<number, number>());
  const npcRequestedRef = useRef(new Set<string>());
  const [npcTick, setNpcTick] = useState(0);
  useEffect(() => {
    if (!isCafe) return;
    const now = Date.now();
    for (const o of drinkOrders) if (o.status === 'PREPARING' && !preparingSeenRef.current.has(o.id)) preparingSeenRef.current.set(o.id, now);
    // Đơn của mình đang chờ + không có nhân viên trực → barista NPC nhận pha sau 3 giây
    const timers: number[] = [];
    if (!staffOnDuty) {
      for (const o of myDrinkOrders) {
        const key = `${o.id}:PREPARING`;
        if (o.status !== 'NEW' || npcRequestedRef.current.has(key)) continue;
        npcRequestedRef.current.add(key);
        timers.push(window.setTimeout(() => void npcAdvanceOrderAction(o.id, 'PREPARING', cu ? null : guestKey).then(() => refreshCafe()), 3000));
      }
    }
    // Có đơn đang pha → nhịp 1 giây để đơn "pha xong" chuyển cho người phục vụ
    const t = drinkOrders.some((o) => o.status === 'PREPARING') ? window.setInterval(() => setNpcTick((x) => x + 1), 1000) : null;
    return () => {
      timers.forEach((x) => window.clearTimeout(x));
      if (t) window.clearInterval(t);
    };
  }, [drinkOrders, staffOnDuty, isCafe]); // eslint-disable-line react-hooks/exhaustive-deps
  /** Đơn pha xong (≥ 8 giây) → người phục vụ NPC bưng ra bàn */
  const npcDeliveries = useMemo(() => {
    void npcTick;
    const now = Date.now();
    return drinkOrders.filter((o) => o.status === 'PREPARING' && now - (preparingSeenRef.current.get(o.id) ?? now) >= 8000);
  }, [drinkOrders, npcTick]);
  const onNpcArrive = (orderId: number) => {
    const o = drinkOrders.find((x) => x.id === orderId);
    if (!o || o.customerRid !== myRid || staffOnDuty) return;
    const key = `${orderId}:SERVED`;
    if (npcRequestedRef.current.has(key)) return;
    npcRequestedRef.current.add(key);
    const tryServe = (left: number) =>
      void npcAdvanceOrderAction(orderId, 'SERVED', cu ? null : guestKey).then((res) => {
        if (res.ok) {
          // Không ngồi gần bàn → nhận ly tận tay, cầm trên tay
          if (!o.spot && o.lines[0]) {
            realtime.sendHold(o.lines[0].code);
            setHolding(o.lines[0].code);
          }
          void refreshCafe();
        }
        else if (left > 0) window.setTimeout(() => tryServe(left - 1), 2500);
      });
    tryServe(3);
  };
  const newOrderCount = drinkOrders.filter((o) => o.status === 'NEW').length;
  const placeOrder = async (lines: OrderLine[], note: string) => {
    const p = playerPosRef.current;
    // Đang ngồi → đặt ly ngay trước mặt (điểm cách ghế ~45cm theo hướng nhìn), không lệch sang chỗ khác trên bàn
    const ox = isSittingRef.current ? Math.sin(p.rotY) * 0.45 : 0;
    const oz = isSittingRef.current ? Math.cos(p.rotY) * 0.45 : 0;
    const res = await placeDrinkOrderAction({ sceneCode, guestKey: cu ? null : guestKey, name: playerName, lines, note, x: p.x, z: p.z, aimX: p.x + ox, aimZ: p.z + oz });
    showToast(res.ok, res.message);
    if (!res.ok) return false;
    realtime.sendBubble(`Cho mình ${orderSummary(lines, cafeMenu).toLowerCase()} nhé!`);
    await refreshCafe();
    return true;
  };
  const clearOrders = async (orderId: number | null) => {
    const res = await clearDrinkOrdersAction({ sceneCode, orderId, guestKey: cu ? null : guestKey });
    showToast(res.ok, res.message);
    if (res.ok) await refreshCafe();
  };
  const goToOrder = (o: DrinkOrderView) => {
    const tx = o.spot?.x ?? o.posX;
    const tz = o.spot?.z ?? o.posZ;
    const dx = o.posX - tx;
    const dz = o.posZ - tz;
    const len = Math.hypot(dx, dz) || 1;
    // Đứng cạnh bàn, lệch sang bên khách ~0.8m
    teleportTo(tx - (dz / len) * 0.8, tz + (dx / len) * 0.8, o.posX, o.posZ);
  };
  const updateOrder = async (o: DrinkOrderView, status: 'PREPARING' | 'SERVED' | 'CANCELLED') => {
    setCafeBusyId(o.id);
    const res = await updateDrinkOrderAction(o.id, status);
    setCafeBusyId(null);
    showToast(res.ok, res.message);
    if (!res.ok) return;
    if (status === 'SERVED') {
      goToOrder(o);
      realtime.sendBubble(`Đồ uống của ${o.customerName} đây ạ, chúc quý khách ngon miệng!`);
    }
    await refreshCafe();
  };

  const goToGuest = (id: number) => {
    const st = realtime.remoteStateRef.current.get(id);
    if (st) teleportTo(st.tx + 1.1, st.tz + 1.1, st.tx, st.tz);
    setSelectedRemoteId(id);
    setGuestArrivals((a) => a.filter((x) => x.id !== id));
  };
  const staffOnlineCount = realtime.roster.length - guestOnlineCount;
  const selectedRemote = selectedRemoteId ? realtime.roster.find((r) => r.employeeId === selectedRemoteId) ?? null : null;

  const openChatWith = (peer: ChatPeer | null) => {
    setChatPeer(peer);
    setChatOpen(true);
    setSelectedRemoteId(null);
  };

  const submitBubble = () => {
    if (realtime.sendBubble(bubbleDraft)) setBubbleDraft('');
    setBubbleOpen(false);
  };

  // Editable Scene State (vật thể có lịch sử hoàn tác)
  const layout = useLayoutHistory(data.activeScene.structures);
  const structures = layout.objects;
  useEffect(() => {
    const calc = () => {
      const isStaffUser = Boolean(data.currentUser);
      const all = structures.filter((o) => SEATABLE_KINDS.has(o.kind) && (isStaffUser || !isStaffSeat(o, structures)));
      const seats = all.flatMap((o) => seatsFor(o));
      if (!seats.length) {
        setSeatStats(null);
        return;
      }
      const sitters: { x: number; z: number }[] = [];
      realtime.remoteStateRef.current.forEach((st) => {
        if ((st.sit ?? 0) > 0) sitters.push({ x: st.tx, z: st.tz });
      });
      if (isSittingRef.current) sitters.push({ x: playerPosRef.current.x, z: playerPosRef.current.z });
      const used = seats.filter((st) => sitters.some((p) => Math.hypot(p.x - st.x, p.z - st.z) < 0.4)).length;
      setSeatStats((prev) => (prev && prev.used === used && prev.total === seats.length ? prev : { used, total: seats.length }));
    };
    calc();
    const t = window.setInterval(calc, 2000);
    return () => window.clearInterval(t);
  }, [structures, data.currentUser]); // eslint-disable-line react-hooks/exhaustive-deps

  const [selectedObjectId, setSelectedObjectId] = useState<string | null>(null);
  const [merchInfoId, setMerchInfoId] = useState<number | null>(null);
  // Ngồi ghế: ghế đang chọn (hiện nút "Ngồi ghế") / đang ngồi (hiện nút "Đứng dậy")
  const [seatPick, setSeatPick] = useState<{ label: string } | null>(null);
  const [isSitting, setIsSitting] = useState(false);
  /** Phòng đang đứng trong (camera đã chuyển vào phòng) */
  const [roomName, setRoomName] = useState<string | null>(null);
  const isSittingRef = useRef(false);
  /** Pantry: đứng gần quầy bếp / bình nước; đang cầm ly */
  const [pantryNear, setPantryNear] = useState(false);
  const [holding, setHolding] = useState<string | null>(null);
  const holdTimerRef = useRef<number | null>(null);
  /** Chỗ ngồi: đã có người / tổng (khách không tính ghế nhân viên) */
  const [seatStats, setSeatStats] = useState<{ used: number; total: number } | null>(null);
  const [seatCommand, setSeatCommand] = useState<{ kind: 'sit' | 'stand' | 'dutySit'; nonce: number } | null>(null);
  const [draggingKind, setDraggingKind] = useState<string | null>(null);
  const [planView, setPlanView] = useState(false);
  const [templateOpen, setTemplateOpen] = useState(false);
  const [baseUpdatedAt, setBaseUpdatedAt] = useState<string>(data.activeScene.updatedAt);
  const savedObjectsRef = useRef(data.activeScene.structures);
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
    layout.reset(data.activeScene.structures);
    savedObjectsRef.current = data.activeScene.structures;
    setBaseUpdatedAt(data.activeScene.updatedAt);
    setSelectedObjectId(null);
    setPlacements(data.activeScene.placements);
    setSelectedPlacementId(null);
    setInspectPlacementId(null);
    setDirty(false);
  }, [data.activeScene.code, data.activeScene.structures, data.activeScene.placements]); // eslint-disable-line react-hooks/exhaustive-deps

  const showToast = (ok: boolean, text: string) => {
    setToastMsg({ ok, text });
    window.setTimeout(() => setToastMsg((prev) => (prev?.text === text ? null : prev)), 3200);
  };

  const canBubble = Boolean(data.currentUser || guestKey) && realtimeLive;

  // Phím tắt V (POV) và E (Xem vật thể gần nhất)
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      if (e.code === 'KeyV') setPovMode((p) => (p === 'THIRD' ? 'FIRST' : 'THIRD'));
      if ((e.code === 'Enter' || e.code === 'NumpadEnter') && canBubble) {
        e.preventDefault();
        setBubbleOpen(true);
      }
      if (e.code === 'KeyE' && nearby.nearPlacementId) {
        setInspectPlacementId(nearby.nearPlacementId);
      }
      if (e.code === 'Escape') {
        setInspectPlacementId(null);
        setDockTab('none');
        setSelectedRemoteId(null);
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [nearby.nearPlacementId, canBubble]);

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
    const pos = playerPosRef.current;
    const px = Number((pos.x + Math.sin(pos.rotY) * 2.2).toFixed(2));
    const pz = Number((pos.z + Math.cos(pos.rotY) * 2.2).toFixed(2));
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
    setDockTab('none');
    setDirty(true);
    showToast(true, `Đã đặt "${item.name}" vào TIM Space — kéo mũi tên để căn chỉnh`);
  };

  /** Sản phẩm đang bày quanh 1 vị trí (quầy của nhân viên): hàng trên kệ/tủ/bục + máy đặt rời, gần nhất trước */
  const productsNear = (x: number, z: number, radius = 4): { ids: number[]; label: string | null } => {
    const ids: number[] = [];
    let label: string | null = null;
    let best = Infinity;
    for (const o of structures) {
      const reach = Math.hypot(o.widthM, o.depthM) / 2 + radius;
      const dist = Math.hypot(o.posX - x, o.posZ - z);
      if (dist > reach) continue;
      if (o.kind === 'BOOTH' && dist < best) {
        best = dist;
        label = o.label;
      }
      if (['GONDOLA', 'WALL_SHELF', 'DISPLAY_CABINET', 'PODIUM', 'RACK', 'PASTRY_CASE'].includes(o.kind)) {
        resolveMerchItems(o.merch, merchPool, o.kind)
          .slice(0, 6)
          .forEach((m) => ids.push(m.id));
      }
    }
    for (const p of placements) {
      if (p.inventoryItemId && Math.hypot(p.posX - x, p.posZ - z) <= radius + 1.5) ids.unshift(p.inventoryItemId);
    }
    return { ids: Array.from(new Set(ids)).slice(0, 20), label };
  };

  // Nhịp tim trực quầy: còn mở trang thì còn "Đang trực"; đóng tab / mất mạng → tự rời sau 3 phút
  const onDutyNow = Boolean(data.currentUser?.isOnDuty);
  useEffect(() => {
    if (!onDutyNow) return;
    const beat = () => {
      if (document.visibilityState === 'hidden') return;
      const p = playerPosRef.current;
      void heartbeatPresenceAction({ x: p.x, z: p.z, r: p.rotY }).catch(() => undefined);
    };
    beat();
    const t = window.setInterval(beat, 60_000);
    document.addEventListener('visibilitychange', beat);
    return () => {
      window.clearInterval(t);
      document.removeEventListener('visibilitychange', beat);
    };
  }, [onDutyNow]);

  // Kho hàng để xếp lên kệ: hàng công khai + danh mục của người thiết kế (SP vừa chọn tay hiện ngay, không cần tải lại)
  const merchPool = useMemo(() => {
    const seen = new Set(data.merchItems.map((m) => m.id));
    const extra = data.catalog
      .filter((c) => !seen.has(c.id))
      .map((c) => ({
        id: c.id,
        itemCode: c.itemCode,
        name: c.name,
        category: c.category,
        manufacturer: c.manufacturer,
        imageUrl: c.imageUrl,
        sellingPrice: c.sellingPrice,
        description: c.description,
        isMachine: c.category === 'MACHINE' || c.category === 'EQUIPMENT',
        stockQty: c.stockQty ?? null,
        model3D: c.category === 'MACHINE' || c.category === 'EQUIPMENT' ? c.model3D : null,
      }));
    return extra.length ? [...data.merchItems, ...extra] : data.merchItems;
  }, [data.merchItems, data.catalog]);

  // ───── Chuyển không gian (Showroom / Café / Văn phòng / Kho) có màn hình chờ ─────
  const [switching, setSwitching] = useState<{ code: string; name: string } | null>(null);
  const [, startSceneTransition] = useTransition();
  const switchScene = (code: string, name: string) => {
    if (code === data.activeScene.code || switching) return;
    if ((layoutDirty || dirty) && !window.confirm('Bố cục chưa lưu sẽ bị bỏ. Vẫn chuyển không gian?')) return;
    setSwitching({ code, name });
    setEditMode(false);
    startSceneTransition(() => router.push(`/3d?scene=${encodeURIComponent(code)}`));
  };
  useEffect(() => {
    if (!switching || data.activeScene.code !== switching.code) return;
    // Dữ liệu mới đã tới → chờ canvas dựng xong 2 khung hình rồi tắt màn chờ
    let r2 = 0;
    const r1 = requestAnimationFrame(() => {
      r2 = requestAnimationFrame(() => setSwitching(null));
    });
    return () => {
      cancelAnimationFrame(r1);
      cancelAnimationFrame(r2);
    };
  }, [data.activeScene.code, switching]);

  // ───── Trình thiết kế: thao tác vật thể ─────
  const sceneKindForEditor = normalizeSceneKind(data.activeScene.kind);
  const layoutDirty = structures !== savedObjectsRef.current;
  const selectedObject = selectedObjectId ? structures.find((o) => o.id === selectedObjectId) ?? null : null;
  const selectedCollides = selectedObjectId ? findCollisions(structures, selectedObjectId).length > 0 : false;

  const updateObject = (id: string, patch: Partial<SpaceStructure>) => {
    layout.commit((prev) =>
      prev.map((o) => {
        if (o.id !== id) return o;
        const next = normalizeSpaceObject({ ...o, ...patch });
        return next ? clampInside(next, data.activeScene.widthM, data.activeScene.depthM) : o;
      }),
    );
  };
  const addObjectAt = (kind: string, x: number, z: number) => {
    const ids = structures.map((o) => o.id);
    const created = createObject(kind, x, z, ids);
    if (!created) return;
    const placed = clampInside(created, data.activeScene.widthM, data.activeScene.depthM);
    layout.commit((prev) => [...prev, placed]);
    setSelectedObjectId(placed.id);
    setSelectedPlacementId(null);
  };
  const addObjectInFront = (kind: string) => {
    const p = playerPosRef.current;
    addObjectAt(kind, p.x + Math.sin(p.rotY) * 2.5, p.z + Math.cos(p.rotY) * 2.5);
  };
  const rotateSelected = (dir: 1 | -1) => {
    if (!selectedObject || selectedObject.locked) return;
    updateObject(selectedObject.id, { rotY: snapAngle(selectedObject.rotY + dir * ROTATE_STEP) });
  };
  const deleteSelected = () => {
    if (!selectedObjectId) return;
    const id = selectedObjectId;
    layout.commit((prev) => prev.filter((o) => o.id !== id));
    setSelectedObjectId(null);
  };
  const duplicateSelected = () => {
    if (!selectedObject) return;
    const copy = clampInside(duplicateObject(selectedObject, structures.map((o) => o.id)), data.activeScene.widthM, data.activeScene.depthM);
    layout.commit((prev) => [...prev, copy]);
    setSelectedObjectId(copy.id);
  };

  // Phím tắt trình thiết kế
  useEffect(() => {
    if (!editMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (['INPUT', 'TEXTAREA', 'SELECT'].includes((e.target as HTMLElement)?.tagName)) return;
      const mod = e.ctrlKey || e.metaKey;
      if (mod && e.code === 'KeyZ' && !e.shiftKey) {
        e.preventDefault();
        layout.undo();
      } else if (mod && (e.code === 'KeyY' || (e.code === 'KeyZ' && e.shiftKey))) {
        e.preventDefault();
        layout.redo();
      } else if (mod && e.code === 'KeyD') {
        e.preventDefault();
        duplicateSelected();
      } else if (e.code === 'KeyR' && !mod) {
        rotateSelected(e.shiftKey ? -1 : 1);
      } else if (e.code === 'Delete' || e.code === 'Backspace') {
        deleteSelected();
      } else if (selectedObject && !selectedObject.locked && e.altKey && e.code.startsWith('Arrow')) {
        // Alt + mũi tên: nhích vật thể 5cm (mũi tên thường vẫn để đi bộ)
        e.preventDefault();
        const d = 0.05;
        const dx = e.code === 'ArrowLeft' ? -d : e.code === 'ArrowRight' ? d : 0;
        const dz = e.code === 'ArrowUp' ? -d : e.code === 'ArrowDown' ? d : 0;
        updateObject(selectedObject.id, { posX: selectedObject.posX + dx, posZ: selectedObject.posZ + dz });
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSaveLayout = () => {
    startTransition(async () => {
      const res = await saveSpaceSceneLayoutAction(data.activeScene.code, {
        structures,
        baseUpdatedAt,
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
        savedObjectsRef.current = structures;
        if (res.updatedAt) setBaseUpdatedAt(res.updatedAt);
        router.refresh();
      }
    });
  };

  const handleToggleDuty = () => {
    if (!data.currentUser) return;
    const nextActive = !data.currentUser.isOnDuty;
    const pos = playerPosRef.current;
    startTransition(async () => {
      const res = await toggleStaffDutyAction(
        data.activeScene.code,
        nearby.zoneName || data.currentUser?.departmentName || 'Quầy tư vấn',
        Number(pos.x.toFixed(2)),
        Number(pos.z.toFixed(2)),
        Number(pos.rotY.toFixed(2)),
        nextActive,
      );
      showToast(res.ok, res.message);
      if (res.ok) {
        // Vào trực → tự đi tới ghế nhân viên sau quầy gần nhất; rời trực → đứng dậy
        setSeatCommand({ kind: nextActive ? 'dutySit' : 'stand', nonce: Date.now() });
        router.refresh();
      }
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
        currentEmployeeId={data.currentUser?.employeeId ?? null}
        isSelfOnDuty={Boolean(data.currentUser?.isOnDuty)}
        playerName={playerName}
        playerAvatar={!data.currentUser && avatarConfig.outfitStyle === 'uniform' ? { ...avatarConfig, outfitStyle: 'shirt' } : avatarConfig}
        playerPosRef={playerPosRef}
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
        remoteRoster={realtime.roster}
        remoteStateRef={realtime.remoteStateRef}
        bubbleRef={realtime.bubbleRef}
        typingRef={realtime.typingRef}
        emoteRef={realtime.emoteRef}
        selfRealtimeId={realtimeSelf?.employeeId ?? null}
        drinkOrders={isCafe ? drinkOrders : undefined}
        cafeMenu={cafeMenu}
        realtimeLive={realtimeLive}
        onSelectRemotePlayer={(id) => {
          setSelectedRemoteId(id);
          setActiveBoothId(null);
        }}
        qualityPref={qualityPref}
        onQualityChange={setQualityActive}
        playIntro={entered && introOnEnter}
        debug={debug3D}
        merchItems={merchPool}
        faceEmployeeId={visitorTarget?.employeeId ?? (chatOpen ? chatPeer?.employeeId ?? null : null)}
        onNotice={(t) => showToast(true, `ℹ️ ${t}`)}
        onRoomChange={setRoomName}
        holdRef={realtime.holdRef}
        onPantryNear={setPantryNear}
        onAutoEmote={(k) => realtime.sendEmote(k)}
        npcDeliveries={isCafe ? npcDeliveries : undefined}
        onNpcArrive={onNpcArrive}
        onSeatCandidate={setSeatPick}
        onSittingChange={(v) => {
          isSittingRef.current = v;
          setIsSitting(v);
        }}
        seatCommand={seatCommand}
        onSelectMerchItem={(id) => {
          if (!editMode) setMerchInfoId(id);
        }}
        planView={editMode && planView}
        selectedObjectId={selectedObjectId}
        onSelectObject={(id) => {
          setSelectedObjectId(id);
          if (id) setSelectedPlacementId(null);
        }}
        onObjectMoved={(id, pos) => updateObject(id, pos)}
        draggingKind={draggingKind}
        onDropObject={(kind, x, z) => {
          addObjectAt(kind, x, z);
          setDraggingKind(null);
        }}
      />

      {/* Trình thiết kế kéo thả (chỉ người có quyền FEATURE_SPACE_DESIGN) */}
      {editMode && data.canEdit && (
        <>
          <EditorToolbar
            dirty={layoutDirty || dirty}
            saving={pending}
            canUndo={layout.canUndo}
            canRedo={layout.canRedo}
            planView={planView}
            objectCount={structures.length}
            onUndo={layout.undo}
            onRedo={layout.redo}
            onSave={handleSaveLayout}
            onTogglePlan={() => setPlanView((v) => !v)}
            onTemplate={() => setTemplateOpen(true)}
            onExit={() => {
              setEditMode(false);
              setSelectedObjectId(null);
              setPlanView(false);
            }}
          />
          <LibraryPanel sceneKind={sceneKindForEditor} onDragKind={setDraggingKind} onAddKind={addObjectInFront} />
          {templateOpen && (
            <div
              style={{ position: 'fixed', inset: 0, zIndex: 46, background: 'rgba(2,6,23,0.55)', display: 'grid', placeItems: 'center', padding: 16 }}
              onClick={() => setTemplateOpen(false)}
            >
              <div style={{ ...glassStyle, width: '100%', maxWidth: 520, borderRadius: 16, padding: 18, display: 'flex', flexDirection: 'column', gap: 12 }} onClick={(e) => e.stopPropagation()}>
                <div style={{ fontSize: 15, fontWeight: 700 }}>Áp dụng bố cục mẫu</div>
                <div style={{ fontSize: 12.5, color: '#cbd5e1', lineHeight: 1.5 }}>
                  Bố cục hiện tại sẽ được thay bằng mẫu (vẫn có thể <b>Ctrl+Z</b> hoàn tác, chỉ lưu khi bấm <b>Lưu bố cục</b>). Mặt bằng: {data.activeScene.widthM}×{data.activeScene.depthM}m.
                </div>
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
                  {([
                    { kind: 'SHOWROOM', title: 'Showroom thiết bị', desc: 'Vách thương hiệu, lễ tân cạnh cổng, gian hàng phòng ban, kệ hàng, ghế chờ' },
                    { kind: 'CAFE', title: 'Quán cà phê', desc: 'Quầy bar + máy espresso, tủ bánh, bàn ghế, sofa, đèn thả, cây xanh' },
                    { kind: 'OFFICE', title: 'Văn phòng', desc: 'Lễ tân, phòng họp kính, cụm bàn làm việc, tủ hồ sơ' },
                    { kind: 'WAREHOUSE', title: 'Kho hàng', desc: 'Dãy kệ pallet, khu nhận hàng, xe nâng, góc văn phòng kho' },
                  ] as const).map((t) => (
                    <button
                      key={t.kind}
                      type="button"
                      onClick={() => {
                        layout.commit(() =>
                          templateFor(t.kind, { widthM: data.activeScene.widthM, depthM: data.activeScene.depthM, departments: data.departments }),
                        );
                        setSelectedObjectId(null);
                        setTemplateOpen(false);
                        showToast(true, `Đã áp dụng mẫu ${t.title} — bấm Lưu bố cục để giữ lại`);
                      }}
                      style={{
                        textAlign: 'left', padding: 12, borderRadius: 12, cursor: 'pointer', color: '#fff',
                        border: t.kind === sceneKindForEditor ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.14)',
                        background: 'rgba(255,255,255,0.05)',
                      }}
                    >
                      <div style={{ fontSize: 13.5, fontWeight: 700 }}>{t.title}</div>
                      <div style={{ fontSize: 11.5, color: '#94a3b8', marginTop: 4, lineHeight: 1.45 }}>{t.desc}</div>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}
          {selectedObject && (
            <InspectorPanel
              object={selectedObject}
              collides={selectedCollides}
              catalog={data.catalog}
              onChange={(patch) => updateObject(selectedObject.id, patch)}
              onRotate={rotateSelected}
              onDuplicate={duplicateSelected}
              onDelete={deleteSelected}
              onClose={() => setSelectedObjectId(null)}
            />
          )}
        </>
      )}

      {/* Thẻ nhân viên khi click vào nhân vật realtime */}
      {selectedRemote && (
        <div
          style={{
            ...glassStyle,
            position: 'fixed',
            top: 64,
            right: 14,
            zIndex: 26,
            width: 260,
            borderRadius: 14,
            padding: 14,
            display: 'flex',
            flexDirection: 'column',
            gap: 10,
          }}
        >
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 }}>
            <div style={{ minWidth: 0 }}>
              <div style={{ fontSize: 14.5, fontWeight: 700 }}>{selectedRemote.employeeName}</div>
              <div style={{ fontSize: 12, color: '#94a3b8' }}>{selectedRemote.isGuest ? 'Khách tham quan' : selectedRemote.department || 'Nhân viên'}</div>
              <div style={{ fontSize: 11.5, marginTop: 4, color: selectedRemote.onDuty ? '#34d399' : '#60a5fa' }}>
                {selectedRemote.onDuty
                  ? `● Đang trực${selectedRemote.stationLabel ? ` · ${selectedRemote.stationLabel}` : ''}`
                  : '● Đang trong TIM Space'}
              </div>
            </div>
            <button type="button" onClick={() => setSelectedRemoteId(null)} style={{ background: 'none', border: 0, color: '#94a3b8', cursor: 'pointer' }}>
              <X size={16} />
            </button>
          </div>
          {!selectedRemote.isGuest && (
          <button
            type="button"
            onClick={() => {
              const st = realtime.remoteStateRef.current.get(selectedRemote.employeeId);
              const near = productsNear(st?.tx ?? selectedRemote.x, st?.tz ?? selectedRemote.z);
              setVisitorTarget({
                employeeId: selectedRemote.employeeId,
                name: selectedRemote.employeeName,
                department: selectedRemote.department,
                chatMode: selectedRemote.chatMode ?? 'LIVE',
                online: true,
                focusProductIds: near.ids,
                focusLabel: near.label ?? selectedRemote.stationLabel,
              });
              setSelectedRemoteId(null);
            }}
            style={{
              display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
              padding: '8px 12px', borderRadius: 10, border: 0, cursor: 'pointer',
              background: selectedRemote.chatMode === 'AI' || data.currentUser ? 'linear-gradient(135deg,#7c3aed,#2563eb)' : '#16a34a',
              color: '#fff', fontSize: 13, fontWeight: 600,
            }}
          >
            {selectedRemote.chatMode === 'AI' || data.currentUser ? <Sparkles size={15} /> : <MessageCircle size={15} />}
            {data.currentUser ? 'Hỏi trợ lý AI về sản phẩm' : selectedRemote.chatMode === 'AI' ? 'Hỏi (Trợ lý AI trả lời)' : 'Hỏi nhân viên'}
          </button>
          )}
          {data.currentUser && !selectedRemote.isGuest && (
            <button
              type="button"
              onClick={() =>
                openChatWith({
                  employeeId: selectedRemote.employeeId,
                  name: selectedRemote.employeeName,
                  department: selectedRemote.department,
                })
              }
              style={{
                display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 6,
                padding: '8px 12px', borderRadius: 10, border: 0, cursor: 'pointer',
                background: '#2563eb', color: '#fff', fontSize: 13, fontWeight: 600,
              }}
            >
              <MessageCircle size={15} /> Nhắn tin
            </button>
          )}
        </div>
      )}

      {/* Hỏi đáp với nhân viên: trực tiếp (khách) hoặc Trợ lý AI chạy chữ realtime */}
      {visitorTarget && (
        <SpaceVisitorChat
          key={`${visitorTarget.employeeId}-${visitorTarget.chatMode}-${visitorTarget.initialQuestion ?? ''}`}
          target={visitorTarget}
          askerIsStaff={Boolean(data.currentUser)}
          guestName={playerName}
          onClose={() => setVisitorTarget(null)}
          glassStyle={glassStyle}
          onSpeak={(t) => realtime.sendBubble(t)}
          onTyping={() => realtime.sendTyping()}
          onAssistantText={(t) => visitorTarget.employeeId > 0 && realtime.setLocalBubble(visitorTarget.employeeId, t)}
        />
      )}
      {data.currentUser && (
        <SpaceGuestInbox
          myEmployeeId={data.currentUser.employeeId}
          open={guestInboxOpen}
          onClose={() => setGuestInboxOpen(false)}
          onUnreadChange={setGuestUnread}
          eventRef={guestEventRef}
          glassStyle={glassStyle}
          onSpeak={(t) => realtime.sendBubble(t)}
          onTyping={() => realtime.sendTyping()}
        />
      )}

      {/* Panel tin nhắn 1-1 (chỉ nhân viên) */}
      {data.currentUser && (
        <SpaceChatPanel
          myEmployeeId={data.currentUser.employeeId}
          open={chatOpen}
          peer={chatPeer}
          onPeerChange={setChatPeer}
          onClose={() => setChatOpen(false)}
          onUnreadChange={setChatUnread}
          dmHandlerRef={dmHandlerRef}
          onlineIds={onlineIds}
          glassStyle={glassStyle}
        />
      )}

      {/* Ô bong bóng chat gần (Enter) */}
      {bubbleOpen && canBubble && (
        <form
          onSubmit={(e) => {
            e.preventDefault();
            submitBubble();
          }}
          style={{
            ...glassStyle,
            position: 'fixed',
            bottom: 92,
            left: '50%',
            transform: 'translateX(-50%)',
            zIndex: 41,
            width: 'min(420px, calc(100vw - 32px))',
            borderRadius: 999,
            padding: 5,
            display: 'flex',
            gap: 6,
          }}
        >
          <input
            autoFocus
            value={bubbleDraft}
            maxLength={200}
            onChange={(e) => {
              setBubbleDraft(e.target.value);
              if (e.target.value) realtime.sendTyping();
            }}
            onKeyDown={(e) => {
              if (e.key === 'Escape') setBubbleOpen(false);
            }}
            onBlur={() => setBubbleOpen(false)}
            placeholder="Nói với mọi người xung quanh (≤ 8m)… Enter để gửi"
            style={{
              flex: 1, minWidth: 0, padding: '7px 14px', borderRadius: 999,
              border: 0, background: 'transparent', color: '#f8fafc', fontSize: 13, outline: 'none',
            }}
          />
        </form>
      )}

      {/* Pantry: lấy nước / đặt ly xuống */}
      {!editMode && realtimeSelf && (pantryNear || holding) && !isSitting && (
        <div style={{ position: 'fixed', left: '50%', bottom: 140, transform: 'translateX(-50%)', zIndex: 26 }}>
          {holding ? (
            <button
              type="button"
              onClick={() => {
                realtime.sendHold(null);
                setHolding(null);
                if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
              }}
              style={{ ...glassStyle, padding: '9px 16px', borderRadius: 999, border: '1px solid rgba(255,255,255,0.2)', cursor: 'pointer', fontSize: 13, fontWeight: 700 }}
            >
              Đặt ly xuống
            </button>
          ) : (
            <button
              type="button"
              onClick={() => {
                // Pha / rót nước 2 giây rồi cầm ly trên tay (3 phút tự đặt xuống)
                realtime.sendEmote('brew');
                window.setTimeout(() => {
                  const code = Math.random() < 0.5 ? 'LATTE' : 'NUOC';
                  realtime.sendHold(code);
                  setHolding(code);
                  if (holdTimerRef.current) window.clearTimeout(holdTimerRef.current);
                  holdTimerRef.current = window.setTimeout(() => {
                    realtime.sendHold(null);
                    setHolding(null);
                  }, 180_000);
                }, 1800);
              }}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 999, border: 0, cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg,#b45309,#d97706)', boxShadow: '0 10px 28px rgba(180,83,9,0.45)' }}
            >
              ☕ Lấy nước
            </button>
          )}
        </div>
      )}

      {/* Nút Ngồi ghế / Đứng dậy */}
      {!editMode && (seatPick || isSitting) && (
        <div style={{ position: 'fixed', left: '50%', bottom: 92, transform: 'translateX(-50%)', zIndex: 26 }}>
          {isSitting ? (
            <button
              type="button"
              onClick={() => setSeatCommand({ kind: 'stand', nonce: Date.now() })}
              style={{ ...glassStyle, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 999, cursor: 'pointer', fontSize: 13.5, fontWeight: 700, boxShadow: '0 10px 28px rgba(0,0,0,0.35)' }}
            >
              <ArrowLeft size={15} style={{ transform: 'rotate(90deg)' }} /> Đứng dậy
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setSeatCommand({ kind: 'sit', nonce: Date.now() })}
              style={{ display: 'inline-flex', alignItems: 'center', gap: 8, padding: '10px 18px', borderRadius: 999, border: 0, cursor: 'pointer', fontSize: 13.5, fontWeight: 700, color: '#fff', background: 'linear-gradient(135deg,#2563eb,#0891b2)', boxShadow: '0 10px 28px rgba(37,99,235,0.45)' }}
            >
              🪑 Ngồi ghế
            </button>
          )}
        </div>
      )}

      {/* Màn chờ khi chuyển không gian */}
      {switching && (
        <div style={{ position: 'fixed', inset: 0, zIndex: 70, display: 'grid', placeItems: 'center', background: 'rgba(2,6,23,0.62)', backdropFilter: 'blur(10px)', WebkitBackdropFilter: 'blur(10px)' }}>
          <style>{`@keyframes space3dSpin{to{transform:rotate(360deg)}}@keyframes space3dBar{0%{transform:translateX(-100%)}100%{transform:translateX(250%)}}`}</style>
          <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 14, color: '#f8fafc', textAlign: 'center', padding: 24 }}>
            <div style={{ position: 'relative', width: 64, height: 64 }}>
              <div style={{ position: 'absolute', inset: 0, borderRadius: 99, border: '3px solid rgba(255,255,255,0.12)', borderTopColor: '#60a5fa', animation: 'space3dSpin .8s linear infinite' }} />
              <img src={data.branding.logoUrl} alt="" style={{ position: 'absolute', inset: 14, width: 36, height: 36, objectFit: 'contain', borderRadius: 8, background: '#fff', padding: 4 }} />
            </div>
            <div>
              <div style={{ fontSize: 11, letterSpacing: '0.12em', color: '#93c5fd', fontWeight: 700 }}>ĐANG CHUYỂN KHÔNG GIAN</div>
              <div style={{ fontSize: 18, fontWeight: 700, marginTop: 4 }}>{switching.name}</div>
              <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 4 }}>Đang dựng kiến trúc, nội thất và hàng hoá…</div>
            </div>
            <div style={{ width: 200, height: 4, borderRadius: 99, background: 'rgba(255,255,255,0.1)', overflow: 'hidden' }}>
              <div style={{ width: '40%', height: '100%', borderRadius: 99, background: 'linear-gradient(90deg,#2563eb,#60a5fa)', animation: 'space3dBar 1.1s ease-in-out infinite' }} />
            </div>
          </div>
        </div>
      )}

      {/* Toast nổi */}
      {isCafe && entered && realtimeSelf && !editMode && !cafeMenuOpen && (
        <button
          type="button"
          onClick={() => setCafeMenuOpen(true)}
          style={{
            ...glassStyle,
            position: 'fixed', right: 14, bottom: 92, zIndex: 30,
            display: 'inline-flex', alignItems: 'center', gap: 7, padding: '10px 16px', borderRadius: 999,
            border: '1px solid rgba(251,191,36,0.5)', background: 'linear-gradient(135deg,rgba(245,158,11,0.9),rgba(180,83,9,0.9))',
            color: '#fff', fontWeight: 700, fontSize: 13.5, cursor: 'pointer', boxShadow: '0 8px 22px rgba(0,0,0,0.35)',
          }}
        >
          <Coffee size={16} /> Gọi món
          {myDrinkOrders.some((o) => o.status !== 'SERVED') && <span style={{ fontSize: 11, opacity: 0.9 }}>· đang chờ</span>}
        </button>
      )}
      {isCafe && cafeMenuOpen && (
        <SpaceCafeMenu menu={cafeMenu} myOrders={myDrinkOrders} onClose={() => setCafeMenuOpen(false)} onPlace={placeOrder} onClear={(id) => {
            // Menu cá nhân: "dọn tất cả" = chỉ các ly của mình (nhân viên cũng vậy)
            if (id !== null) void clearOrders(id);
            else for (const o of myDrinkOrders.filter((x) => x.status === 'SERVED')) void clearOrders(o.id);
          }} glassStyle={glassStyle} />
      )}
      {isCafe && cu && data.canEdit && cafeOrdersOpen && (
        <SpaceCafeOrders
          menu={cafeMenu}
          orders={drinkOrders}
          busyId={cafeBusyId}
          onClose={() => setCafeOrdersOpen(false)}
          onUpdate={(o, st) => void updateOrder(o, st)}
          onGoTo={goToOrder}
          onClear={(id) => void clearOrders(id)}
          glassStyle={glassStyle}
        />
      )}
      {guestArrivals.length > 0 && (
        <div style={{ position: 'fixed', top: 112, left: '50%', transform: 'translateX(-50%)', zIndex: 59, display: 'flex', flexDirection: 'column', gap: 6, width: 'min(360px, calc(100vw - 32px))' }}>
          {guestArrivals.map((g) => (
            <div
              key={g.id}
              role="status"
              style={{
                display: 'flex', alignItems: 'center', gap: 10, padding: '8px 10px 8px 12px', borderRadius: 14,
                background: 'rgba(15,23,42,0.92)', border: '1px solid rgba(96,165,250,0.45)', color: '#fff',
                boxShadow: '0 8px 24px rgba(0,0,0,0.35)', backdropFilter: 'blur(8px)', fontSize: 12.5,
              }}
            >
              <span style={{ fontSize: 18 }}>🙋</span>
              <div style={{ flex: 1, minWidth: 0 }}>
                <div style={{ fontWeight: 700, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{g.name}</div>
                <div style={{ fontSize: 11, color: '#93c5fd' }}>Khách tham quan vừa vào {data.activeScene.name}</div>
              </div>
              <button
                type="button"
                onClick={() => goToGuest(g.id)}
                style={{ padding: '5px 10px', borderRadius: 99, border: 0, background: '#2563eb', color: '#fff', fontSize: 11.5, fontWeight: 700, cursor: 'pointer', whiteSpace: 'nowrap' }}
              >
                Đến đón
              </button>
              <button
                type="button"
                aria-label="Đóng"
                onClick={() => setGuestArrivals((a) => a.filter((x) => x.id !== g.id))}
                style={{ background: 'none', border: 0, color: '#94a3b8', cursor: 'pointer', padding: 2 }}
              >
                <X size={14} />
              </button>
            </div>
          ))}
        </div>
      )}
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
                TIM Space · Beta
              </div>
              <h1 style={{ fontSize: 22, fontWeight: 700, marginTop: 6, color: '#ffffff', lineHeight: 1.25 }}>
                {data.branding.companyName}
              </h1>
              <p style={{ fontSize: 13, color: '#cbd5e1', marginTop: 8, lineHeight: 1.5 }}>
                Tham quan trực tiếp không gian triển lãm máy móc, gặp nhân viên tư vấn tại quầy và xem thông số thiết bị ngay trong TIM Space.
              </p>
            </div>
            {data.scenes.length > 1 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6, textAlign: 'left' }}>
                <span style={{ fontSize: 12, color: '#cbd5e1' }}>Chọn không gian muốn tham quan:</span>
                <div style={{ display: 'grid', gridTemplateColumns: `repeat(${Math.min(3, data.scenes.length)}, 1fr)`, gap: 8 }}>
                  {data.scenes.map((sc) => {
                    const active = sc.code === data.activeScene.code;
                    const icon = sc.kind === 'CAFE' ? '☕' : sc.kind === 'OFFICE' ? '🏢' : sc.kind === 'WAREHOUSE' ? '📦' : '🏬';
                    const hint = sc.kind === 'CAFE' ? 'Ngồi bàn, gọi nước' : sc.kind === 'OFFICE' ? 'Phòng họp, pantry' : sc.kind === 'WAREHOUSE' ? 'Kho hàng' : 'Xem máy, gặp tư vấn';
                    return (
                      <button
                        key={sc.code}
                        type="button"
                        disabled={active || switching !== null}
                        onClick={() => switchScene(sc.code, sc.name)}
                        style={{
                          padding: '9px 8px',
                          borderRadius: 12,
                          border: active ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.18)',
                          background: active ? 'rgba(37,99,235,0.35)' : 'rgba(255,255,255,0.06)',
                          color: '#fff',
                          cursor: active ? 'default' : 'pointer',
                          textAlign: 'left',
                        }}
                      >
                        <div style={{ fontSize: 18 }}>{icon}</div>
                        <div style={{ fontSize: 12.5, fontWeight: 700, marginTop: 2, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sc.name}</div>
                        <div style={{ fontSize: 10.5, color: '#cbd5e1', marginTop: 1 }}>{active ? '✓ Đang chọn' : hint}</div>
                      </button>
                    );
                  })}
                </div>
              </div>
            )}
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
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8 }}>
              {([
                { key: 'male', label: 'Nam', hint: 'Vest công sở · tóc rẽ ngôi' },
                { key: 'female', label: 'Nữ', hint: 'Đầm công sở · tóc dài xõa' },
              ] as const).map((g) => (
                <button
                  key={g.key}
                  type="button"
                  onClick={() => chooseGuestGender(g.key)}
                  style={{
                    padding: '10px 12px',
                    borderRadius: 12,
                    border: guestGender === g.key ? '2px solid #60a5fa' : '1px solid rgba(255,255,255,0.18)',
                    background: guestGender === g.key ? 'rgba(37,99,235,0.35)' : 'rgba(255,255,255,0.06)',
                    color: '#fff',
                    cursor: 'pointer',
                    textAlign: 'left',
                  }}
                >
                  <div style={{ fontSize: 14, fontWeight: 700 }}>{g.label}</div>
                  <div style={{ fontSize: 11, color: '#cbd5e1', marginTop: 2 }}>{g.hint}</div>
                </button>
              ))}
            </div>
            <div style={{ display: 'flex', flexDirection: 'column', gap: 8, textAlign: 'left' }}>
              <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 8 }}>
                <span style={{ fontSize: 12, color: '#cbd5e1' }}>Trang phục:</span>
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {([
                    { key: 'suit', label: 'Vest' },
                    { key: 'dress', label: 'Đầm' },
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
                <div style={{ display: 'flex', gap: 5, flexWrap: 'wrap', justifyContent: 'flex-end' }}>
                  {([
                    { key: 'slick', label: 'Rẽ ngôi' },
                    { key: 'short', label: 'Ngắn' },
                    { key: 'bob', label: 'Bob' },
                    { key: 'ponytail', label: 'Đuôi ngựa' },
                    { key: 'long', label: 'Dài xõa' },
                    { key: 'bun', label: 'Búi' },
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
              onClick={() => {
                setIntroOnEnter(true);
                setEntered(true);
              }}
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
      {/* ───── Thanh trên: Thương hiệu · Chọn không gian · Cụm công cụ (icon gọn, có tooltip) ───── */}
      <div
        style={{
          position: 'fixed',
          top: 12,
          left: 14,
          right: 14,
          zIndex: 20,
          display: 'grid',
          gridTemplateColumns: 'minmax(0,1fr) auto minmax(0,1fr)',
          alignItems: 'center',
          gap: 10,
          pointerEvents: 'none',
        }}
      >
        {/* Trái: thương hiệu + số người online */}
        <div style={{ justifySelf: 'start', minWidth: 0, pointerEvents: 'auto', ...glassStyle, borderRadius: 999, padding: '5px 12px 5px 6px', display: 'flex', alignItems: 'center', gap: 9 }}>
          <div style={{ width: 28, height: 28, borderRadius: 8, background: '#fff', padding: 3, display: 'grid', placeItems: 'center', flex: 'none' }}>
            <img src={data.branding.logoUrl} alt={data.branding.appName} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <span style={{ fontWeight: 700, fontSize: 13, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.branding.appName}</span>
          <span style={{ fontSize: 9.5, fontWeight: 700, padding: '2px 6px', borderRadius: 99, background: '#2563eb', color: '#fff', flex: 'none' }}>3D</span>
          {(realtimeLive || data.presences.length > 0) && (
            <span title="Nhân viên trực tuyến · Khách tham quan" style={{ fontSize: 11.5, color: '#34d399', whiteSpace: 'nowrap', flex: 'none' }}>
              ● Trực tuyến: {realtimeLive ? staffOnlineCount + (data.currentUser ? 1 : 0) : data.presences.length}
              {realtimeLive ? ` · Khách: ${guestOnlineCount + (!data.currentUser && guestKey ? 1 : 0)}` : ''}
            </span>
          )}
        </div>

        {/* Giữa: chọn không gian dạng menu thả xuống */}
        <div style={{ position: 'relative', pointerEvents: 'auto' }}>
          {data.scenes.length > 1 ? (
            <button
              type="button"
              onClick={() => setSceneMenuOpen((v) => !v)}
              style={{ ...glassStyle, display: 'inline-flex', alignItems: 'center', gap: 8, padding: '7px 14px', borderRadius: 999, cursor: 'pointer', fontSize: 12.5, fontWeight: 600, maxWidth: 'min(42vw, 360px)' }}
            >
              <MapIcon size={14} color="#60a5fa" />
              <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{data.activeScene.name}</span>
              <ChevronDown size={14} style={{ flex: 'none', transform: sceneMenuOpen ? 'rotate(180deg)' : 'none', transition: 'transform .15s' }} />
            </button>
          ) : (
            <div style={{ ...glassStyle, padding: '7px 14px', borderRadius: 999, fontSize: 12.5, fontWeight: 600 }}>{data.activeScene.name}</div>
          )}
          {sceneMenuOpen && (
            <div style={{ ...glassStyle, position: 'absolute', top: 'calc(100% + 6px)', left: '50%', transform: 'translateX(-50%)', minWidth: 280, borderRadius: 14, padding: 6, display: 'flex', flexDirection: 'column', gap: 2, zIndex: 40, boxShadow: '0 12px 28px rgba(0,0,0,0.35)' }}>
              <div style={{ fontSize: 10.5, color: '#94a3b8', padding: '4px 8px', fontWeight: 700, letterSpacing: 0.4 }}>CHUYỂN KHÔNG GIAN</div>
              {data.scenes.map((sc) => {
                const active = sc.code === data.activeScene.code;
                const kindLabel = sc.kind === 'WAREHOUSE' ? 'Kho' : sc.kind === 'CAFE' ? 'Café' : sc.kind === 'OFFICE' ? 'Văn phòng' : 'Showroom';
                return (
                  <button
                    key={sc.code}
                    type="button"
                    onClick={() => {
                      setSceneMenuOpen(false);
                      switchScene(sc.code, sc.name);
                    }}
                    style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, padding: '8px 10px', borderRadius: 9, border: 0, cursor: 'pointer', textAlign: 'left', background: active ? 'rgba(37,99,235,0.85)' : 'transparent', color: '#f8fafc', fontSize: 12.5 }}
                  >
                    <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{sc.name}</span>
                    <span style={{ fontSize: 10.5, color: active ? '#dbeafe' : '#64748b', flex: 'none' }}>{kindLabel}</span>
                  </button>
                );
              })}
            </div>
          )}
        </div>

        {/* Phải: cụm công cụ icon gọn */}
        <div style={{ justifySelf: 'end', pointerEvents: 'auto', display: 'flex', alignItems: 'center', gap: 6 }}>
          <div style={{ ...glassStyle, borderRadius: 999, padding: 4, display: 'flex', alignItems: 'center', gap: 2, position: 'relative' }}>
            <HudButton title={`Chất lượng đồ họa: ${QUALITY_LABEL[qualityPref]}${qualityPref === 'auto' && qualityActive ? ` (${QUALITY_LABEL[qualityActive]})` : ''}`} active={qualityMenuOpen} onClick={() => setQualityMenuOpen((v) => !v)}>
              <Settings2 size={15} />
            </HudButton>
            <HudButton title="Diện mạo nhân vật" active={avatarPanelOpen} onClick={() => setAvatarPanelOpen((v) => !v)}>
              <Shirt size={15} />
            </HudButton>
            {data.isStaff && (
              <>
                <span style={{ width: 1, height: 18, background: 'rgba(255,255,255,0.14)', margin: '0 3px' }} />
                <HudButton
                  title={data.currentUser?.isOnDuty ? 'Đang trực quầy — bấm để rời quầy' : 'Vào trực quầy tại vị trí hiện tại'}
                  active={Boolean(data.currentUser?.isOnDuty)}
                  activeBg="#059669"
                  disabled={pending}
                  onClick={handleToggleDuty}
                >
                  <UserCheck size={15} />
                </HudButton>
                <HudButton
                  title={chatMode === 'AI' ? 'Trợ lý AI đang trả lời khách thay bạn — bấm để tự trả lời' : 'Bạn đang tự trả lời khách — bấm để bật Trợ lý AI'}
                  active={chatMode === 'AI'}
                  activeBg="linear-gradient(135deg,#7c3aed,#2563eb)"
                  onClick={() => {
                    const next = chatMode === 'AI' ? 'LIVE' : 'AI';
                    setChatMode(next);
                    startTransition(async () => {
                      const res = await setSpaceChatModeAction(next);
                      showToast(res.ok, res.message);
                      if (!res.ok) setChatMode(chatMode);
                    });
                  }}
                >
                  {chatMode === 'AI' ? <Sparkles size={15} /> : <MessageCircle size={15} />}
                </HudButton>
                <HudButton title="Khách đang hỏi bạn" active={guestInboxOpen} activeBg="#16a34a" badge={guestUnread} onClick={() => setGuestInboxOpen((v) => !v)}>
                  <Users size={15} />
                </HudButton>
                {isCafe && data.canEdit && (
                  <HudButton title="Quản lý đơn gọi món (quán do nhân viên quán tự động phục vụ)" active={cafeOrdersOpen} activeBg="#d97706" badge={newOrderCount} onClick={() => setCafeOrdersOpen((v) => !v)}>
                    <ClipboardList size={15} />
                  </HudButton>
                )}
              </>
            )}
            {qualityMenuOpen && (
              <div style={{ ...glassStyle, position: 'absolute', top: 'calc(100% + 6px)', right: 0, minWidth: 200, borderRadius: 12, padding: 6, display: 'flex', flexDirection: 'column', gap: 2, zIndex: 40, boxShadow: '0 12px 28px rgba(0,0,0,0.35)' }}>
                <div style={{ fontSize: 10.5, color: '#94a3b8', padding: '4px 8px', fontWeight: 600, letterSpacing: 0.4 }}>CHẤT LƯỢNG ĐỒ HỌA</div>
                {(['auto', 'high', 'medium', 'low'] as const).map((opt) => (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => chooseQuality(opt)}
                    style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, border: 0, cursor: 'pointer', background: qualityPref === opt ? 'rgba(37,99,235,0.85)' : 'transparent', color: '#f8fafc', fontSize: 12.5, textAlign: 'left' }}
                  >
                    <span>
                      {QUALITY_LABEL[opt]}
                      {opt === 'auto' && qualityActive ? ` · ${QUALITY_LABEL[qualityActive]}` : ''}
                    </span>
                    <span style={{ fontSize: 10.5, color: qualityPref === opt ? '#dbeafe' : '#64748b' }}>
                      {opt === 'auto' ? 'đo FPS' : opt === 'high' ? 'AO + Bloom + MSAA' : opt === 'medium' ? 'Bloom + SMAA' : 'nhẹ nhất'}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
          <Link
            href={data.isStaff ? '/dashboard' : '/login?next=/3d'}
            title={data.isStaff ? 'Về trang quản trị WorkHub' : 'Đăng nhập nhân viên'}
            style={{ ...glassStyle, padding: '8px 12px', borderRadius: 999, fontSize: 12, fontWeight: 600, textDecoration: 'none', display: 'inline-flex', alignItems: 'center', gap: 5, whiteSpace: 'nowrap' }}
          >
            {data.isStaff ? <ArrowLeft size={14} /> : <LogIn size={14} />}
            {data.isStaff ? 'WorkHub' : 'Nhân viên'}
          </Link>
        </div>
      </div>

      {/* Góc trên trái (dưới thanh trên): khu vực đang đứng + góc nhìn + ngày/đêm */}
      <div style={{ position: 'fixed', top: 60, left: 14, zIndex: 19, display: 'flex', alignItems: 'center', gap: 6 }}>
        <div
          title="Click sàn / gian hàng để tự đi tới · WASD di chuyển · Kéo để xoay góc nhìn"
          style={{ ...glassStyle, borderRadius: 999, padding: '5px 12px', fontSize: 12, fontWeight: 500, display: 'inline-flex', alignItems: 'center', gap: 6, maxWidth: 260 }}
        >
          <Compass size={13} style={{ color: roomName ? '#34d399' : '#60a5fa', flex: 'none' }} />
          <span style={{ whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{roomName ? `Trong phòng: ${roomName}` : nearby.zoneName}</span>
        </div>
        {seatStats && (
          <div
            title={seatStats.used >= seatStats.total ? 'Đã hết chỗ ngồi' : 'Số chỗ đang có người ngồi / tổng số chỗ ngồi'}
            style={{
              ...glassStyle, borderRadius: 999, padding: '5px 11px', fontSize: 12, fontWeight: 600, whiteSpace: 'nowrap',
              color: seatStats.used >= seatStats.total ? '#fca5a5' : '#e2e8f0',
            }}
          >
            🪑 {seatStats.used}/{seatStats.total}{seatStats.used >= seatStats.total ? ' · Hết chỗ' : ''}
          </div>
        )}
        <div style={{ ...glassStyle, borderRadius: 999, padding: 3, display: 'flex', gap: 2 }}>
          <HudButton small title={povMode === 'FIRST' ? 'Đang ở góc nhìn thứ nhất (V)' : 'Chuyển góc nhìn thứ nhất (V)'} active={povMode === 'FIRST'} onClick={() => setPovMode((p) => (p === 'THIRD' ? 'FIRST' : 'THIRD'))}>
            <Eye size={14} />
          </HudButton>
          <HudButton small title={nightMode ? 'Chuyển sang ban ngày' : 'Chuyển sang ban đêm'} active={nightMode} activeBg="#334155" onClick={() => setNightMode((n) => !n)}>
            {nightMode ? <Sun size={14} /> : <Moon size={14} />}
          </HudButton>
          {realtimeSelf && (
            <HudButton small title="Biểu cảm: vẫy tay, gật đầu, cúi chào, vỗ tay" active={emoteOpen} onClick={() => setEmoteOpen((v) => !v)}>
              <Smile size={14} />
            </HudButton>
          )}
          {isCafe && (
            <HudButton small title={ambienceOn ? 'Tắt âm thanh quán' : 'Bật âm thanh quán cà phê'} active={ambienceOn} activeBg="#b45309" onClick={() => setAmbienceOn((v) => !v)}>
              {ambienceOn ? <Volume2 size={14} /> : <VolumeX size={14} />}
            </HudButton>
          )}
        </div>
        {emoteOpen && realtimeSelf && (
          <div style={{ ...glassStyle, borderRadius: 999, padding: 3, display: 'flex', gap: 2 }}>
            {SPACE_EMOTES.map((em) => (
              <button
                key={em.key}
                type="button"
                title={em.label}
                aria-label={em.label}
                onClick={() => {
                  realtime.sendEmote(em.key);
                  setEmoteOpen(false);
                }}
                style={{ width: 30, height: 28, borderRadius: 999, border: 0, background: 'transparent', cursor: 'pointer', fontSize: 16, lineHeight: '28px' }}
              >
                {em.icon}
              </button>
            ))}
          </div>
        )}
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

          {data.currentUser && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11.5, color: '#cbd5e1', fontWeight: 600 }}>Đồng phục TIM Corp</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr', gap: 5 }}>
              {UNIFORM_PRESETS.map((u) => {
                const active =
                  avatarConfig.outfitStyle === 'uniform' &&
                  avatarConfig.outfitColor === u.outfitColor &&
                  avatarConfig.bottomStyle === u.bottomStyle;
                return (
                  <button
                    key={u.key}
                    type="button"
                    onClick={() => setAvatarConfig((a) => ({ ...a, outfitStyle: 'uniform', outfitColor: u.outfitColor, pantsColor: UNIFORM_BOTTOM_NAVY, bottomStyle: u.bottomStyle }))}
                    style={{
                      display: 'flex', alignItems: 'center', gap: 8, padding: '7px 10px', borderRadius: 8, fontSize: 12, fontWeight: 600, cursor: 'pointer', textAlign: 'left', whiteSpace: 'nowrap',
                      border: active ? '1.5px solid #60a5fa' : '1px solid rgba(255,255,255,0.18)',
                      background: active ? 'rgba(37,99,235,0.35)' : 'rgba(255,255,255,0.07)',
                      color: '#ffffff',
                    }}
                  >
                    <span style={{ display: 'flex', flexDirection: 'column', width: 14, flexShrink: 0, borderRadius: 3, overflow: 'hidden', border: '1px solid rgba(255,255,255,0.35)' }}>
                      <span style={{ height: 10, background: u.outfitColor }} />
                      <span style={{ height: 8, background: UNIFORM_BOTTOM_NAVY }} />
                    </span>
                    {u.label}
                  </button>
                );
              })}
            </div>
          </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11.5, color: '#cbd5e1', fontWeight: 600 }}>Kiểu trang phục</span>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
              {([
                // Đồng phục công ty chỉ dành cho nhân viên
                ...(data.currentUser ? ([{ key: 'uniform', label: 'Đồng phục logo' }] as const) : []),
                { key: 'suit', label: 'Vest công sở' },
                { key: 'dress', label: 'Đầm công sở' },
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
              {[UNIFORM_WHITE, UNIFORM_NAVY, '#1e3a8a', '#2563eb', '#0f766e', '#059669', '#334155', '#991b1b', '#7c3aed'].map((c) => (
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

          {(avatarConfig.outfitStyle === 'uniform' || avatarConfig.outfitStyle === 'shirt') && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
              <span style={{ fontSize: 11.5, color: '#cbd5e1', fontWeight: 600 }}>Phần dưới</span>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                {([
                  { key: 'pants', label: 'Quần tây' },
                  { key: 'skirt', label: 'Chân váy công sở' },
                ] as const).map((b) => (
                  <button
                    key={b.key}
                    type="button"
                    onClick={() => setAvatarConfig((a) => ({ ...a, bottomStyle: b.key }))}
                    style={{
                      padding: '6px 6px', borderRadius: 8, fontSize: 11.5, fontWeight: 600, cursor: 'pointer',
                      border: '1px solid rgba(255,255,255,0.18)',
                      background: avatarConfig.bottomStyle === b.key ? '#2563eb' : 'rgba(255,255,255,0.07)',
                      color: '#ffffff',
                    }}
                  >
                    {b.label}
                  </button>
                ))}
              </div>
            </div>
          )}

          <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
            <span style={{ fontSize: 11.5, color: '#cbd5e1', fontWeight: 600 }}>{avatarConfig.bottomStyle === 'skirt' && avatarConfig.outfitStyle !== 'dress' ? 'Màu váy' : 'Màu quần'}</span>
            <div style={{ display: 'flex', gap: 7 }}>
              {[UNIFORM_BOTTOM_NAVY, '#0f172a', '#334155', '#1e3a8a', '#d6ccc2'].map((c) => (
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
                { key: 'long', label: 'Dài xõa ngang lưng' },
                { key: 'bun', label: 'Búi công sở' },
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
        const staffAtBooth = livePresences.filter(
          (pr) => pr.status === 'ON_DUTY',
        ).filter(
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
              {dockTab === 'design' && 'Thiết kế bố cục TIM Space'}
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
                {livePresences
                  .filter((pr) => !data.currentUser || pr.employeeId !== data.currentUser.employeeId)
                  .map((pr) => (
                  <g key={pr.employeeId}>
                    <circle cx={pr.posX} cy={pr.posZ} r={0.65} fill={pr.status === 'ON_DUTY' ? '#10b981' : '#a78bfa'} stroke="#ffffff" strokeWidth={0.2} />
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
                <circle cx={playerPosRef.current.x} cy={playerPosRef.current.z} r={0.75} fill={data.currentUser?.isOnDuty ? '#10b981' : '#2563eb'} stroke="#ffffff" strokeWidth={0.25} />
              </svg>
              <div style={{ display: 'flex', gap: 14, fontSize: 11.5, color: '#94a3b8' }}>
                <span>● Xanh đậm: Vị trí của bạn</span>
                <span>● Xanh ngọc: Thiết bị</span>
                <span>● Xanh lá: Nhân viên đang trực</span>
                {realtimeLive && <span>● Tím: Nhân viên online</span>}
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
            { key: 'design', label: layoutDirty || dirty ? 'Thiết kế ●' : 'Thiết kế', icon: Wrench, visible: data.canEdit },
            { key: 'map', label: 'Bản đồ', icon: MapIcon, visible: true },
          ] as const
        )
          .filter((item) => item.visible)
          .map((item) => {
            const active = item.key === 'design' ? editMode : dockTab === item.key;
            return (
              <button
                key={item.key}
                type="button"
                onClick={() => {
                  if (item.key === 'design') {
                    setEditMode((v) => !v);
                    setDockTab('none');
                    return;
                  }
                  setDockTab(active ? 'none' : item.key);
                }}
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
        {data.currentUser && (
          <button
            type="button"
            onClick={() => setChatOpen((o) => !o)}
            style={{
              position: 'relative',
              display: 'flex',
              flexDirection: 'column',
              alignItems: 'center',
              gap: 3,
              minWidth: 88,
              padding: '7px 10px',
              borderRadius: 11,
              border: 0,
              cursor: 'pointer',
              background: chatOpen ? '#2563eb' : 'transparent',
              color: chatOpen ? '#fff' : '#cbd5e1',
              fontSize: 11.5,
              fontWeight: 600,
            }}
          >
            <MessageCircle size={16} />
            <span>Tin nhắn</span>
            {chatUnread > 0 && (
              <span
                style={{
                  position: 'absolute', top: 2, right: 16, minWidth: 16, height: 16, padding: '0 4px',
                  borderRadius: 99, background: '#ef4444', color: '#fff', fontSize: 10, fontWeight: 700,
                  display: 'grid', placeItems: 'center',
                }}
              >
                {chatUnread > 99 ? '99+' : chatUnread}
              </span>
            )}
          </button>
        )}
      </div>

      {/* Modal Xem chi tiết Thiết bị */}
      {/* Thông tin sản phẩm trên kệ / máy trưng bày */}
      {merchInfoId !== null && (() => {
        const item = merchPool.find((m) => m.id === merchInfoId) ?? DEMO_PRODUCT_MAP.get(merchInfoId);
        if (!item) return null;
        return (
          <div
            style={{ position: 'fixed', inset: 0, zIndex: 45, background: 'rgba(2,6,23,0.55)', display: 'grid', placeItems: 'center', padding: 16 }}
            onClick={() => setMerchInfoId(null)}
          >
            <div
              style={{ ...glassStyle, width: '100%', maxWidth: 420, borderRadius: 16, padding: 20, display: 'flex', flexDirection: 'column', gap: 12 }}
              onClick={(e) => e.stopPropagation()}
            >
              <div style={{ display: 'flex', justifyContent: 'space-between', gap: 10 }}>
                <div style={{ minWidth: 0 }}>
                  <div style={{ fontSize: 11, color: '#60a5fa', fontWeight: 600 }}>
                    {'model' in item ? `Model ${(item as { model: string }).model}` : item.itemCode}
                    {item.isMachine ? ' · Máy / thiết bị' : ''}
                    {item.id < 0 ? ' · Mẫu trưng bày' : ''}
                  </div>
                  <h2 style={{ fontSize: 17, fontWeight: 700, marginTop: 2, color: '#fff', lineHeight: 1.3 }}>{item.name}</h2>
                  {item.manufacturer && <div style={{ fontSize: 12.5, color: '#94a3b8', marginTop: 2 }}>Hãng: {item.manufacturer}</div>}
                </div>
                <button type="button" onClick={() => setMerchInfoId(null)} style={{ background: 'none', border: 0, color: '#94a3b8', cursor: 'pointer', alignSelf: 'flex-start' }}>
                  <X size={18} />
                </button>
              </div>
              {item.imageUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.imageUrl} alt={item.name} style={{ width: '100%', maxHeight: 200, objectFit: 'contain', background: '#fff', borderRadius: 10, padding: 8 }} />
              )}
              {item.description && <p style={{ fontSize: 13, color: '#cbd5e1', lineHeight: 1.55, whiteSpace: 'pre-line' }}>{item.description}</p>}
              <div style={{ display: 'flex', alignItems: 'baseline', justifyContent: 'space-between', gap: 10, padding: '10px 12px', borderRadius: 12, background: 'rgba(37,99,235,0.15)', border: '1px solid rgba(96,165,250,0.3)' }}>
                <span style={{ fontSize: 12, color: '#93c5fd' }}>Giá bán niêm yết</span>
                <span style={{ fontSize: 20, fontWeight: 800, color: '#fff' }}>{item.sellingPrice ? money(item.sellingPrice) : 'Liên hệ'}</span>
              </div>
              {typeof item.stockQty === 'number' && (
                <div style={{ fontSize: 12.5, color: item.stockQty > 0 ? '#34d399' : '#fca5a5' }}>
                  ● Tồn kho: {item.stockQty}
                </div>
              )}
              <button
                type="button"
                onClick={() => {
                  // Nhờ nhân viên online gần nhất (nếu có) — trợ lý AI trả lời bằng thông tin sản phẩm đã nạp
                  const me = playerPosRef.current;
                  let nearest: (typeof realtime.roster)[number] | null = null;
                  let bestD = Infinity;
                  for (const r of realtime.roster) {
                    const st = realtime.remoteStateRef.current.get(r.employeeId);
                    const d = Math.hypot((st?.tx ?? r.x) - me.x, (st?.tz ?? r.z) - me.z);
                    if (d < bestD) {
                      bestD = d;
                      nearest = r;
                    }
                  }
                  setVisitorTarget({
                    employeeId: nearest?.employeeId ?? 0,
                    name: nearest?.employeeName ?? data.branding.appName,
                    department: nearest?.department ?? null,
                    chatMode: 'AI',
                    online: Boolean(nearest),
                    focusProductIds: item.id > 0 ? [item.id] : [],
                    focusNote: item.id < 0 ? `${item.name} (${'model' in item ? (item as { model: string }).model : ''}): ${item.description ?? ''}` : undefined,
                    focusLabel: null,
                    initialQuestion: `Giới thiệu giúp mình về ${item.name}`,
                  });
                  setMerchInfoId(null);
                }}
                style={{
                  display: 'inline-flex', alignItems: 'center', justifyContent: 'center', gap: 7, padding: '10px 14px', borderRadius: 12, border: 0,
                  cursor: 'pointer', background: 'linear-gradient(135deg,#7c3aed,#2563eb)', color: '#fff', fontSize: 13.5, fontWeight: 700,
                }}
              >
                <Sparkles size={15} /> Hỏi tư vấn sản phẩm này
              </button>
            </div>
          </div>
        );
      })()}

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
