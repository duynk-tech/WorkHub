import 'server-only';
import { prisma } from '@/lib/prisma';
import { type AuthContext } from '@/server/auth/context';
import { canDesignSpace } from './permissions';
import { normalizeSceneKind } from '@/lib/space-3d-catalog';
import { DEFAULT_SCENE_SIZE, templateFor, upgradeLegacyLayout } from '@/lib/space-3d-templates';
import { getAppBranding } from '@/server/modules/settings/branding';
import { getSettingsByKeys } from '@/server/modules/settings/service';
import {
  defaultModel3D,
  normalizeAvatar3DConfig,
  type Procedural3DPart,
  type Product3DModelView,
  type Product3DType,
  type SpaceCatalogItem,
  type SpacePayload,
  type SpacePlacementView,
  type SpaceStructure,
  normalizeSpaceObjects,
} from '@/lib/space-3d-types';

const BOOTH_COLORS = ['#2563eb', '#0891b2', '#ea580c', '#7c3aed', '#059669', '#d97706'];

/** Bỏ siêu dữ liệu nội bộ (<!--fees:...-->) trước khi đưa mô tả ra cho khách / AI */
function cleanPublicDescription(text: string | null | undefined): string | null {
  const t = (text || '').replace(/<!--[\s\S]*?-->/g, '').trim();
  return t ? t.slice(0, 600) : null;
}

/** Thời gian sống của bản ghi trực quầy nếu không có nhịp tim */
const PRESENCE_TTL_MS = 3 * 60 * 1000;

function parseStructures(raw: unknown): SpaceStructure[] {
  return normalizeSpaceObjects(raw);
}

function toModel3DView(
  category: string,
  row?: {
    modelType: string;
    glbUrl: string | null;
    proceduralJson: unknown;
    widthM: number;
    heightM: number;
    depthM: number;
    primaryColor: string;
    aiPrompt: string | null;
  } | null,
): Product3DModelView {
  if (!row) return defaultModel3D(category);
  const modelType = (row.modelType === 'GLB' || row.modelType === 'PROCEDURAL_JSON' ? row.modelType : 'BOX_PRESET') as Product3DType;
  return {
    modelType,
    glbUrl: row.glbUrl,
    proceduralParts: Array.isArray(row.proceduralJson) ? (row.proceduralJson as Procedural3DPart[]) : null,
    widthM: row.widthM,
    heightM: row.heightM,
    depthM: row.depthM,
    primaryColor: row.primaryColor,
    aiPrompt: row.aiPrompt,
  };
}

/** Tự tạo scene Showroom & Văn phòng mặc định từ phòng ban và sản phẩm thật của công ty. */
/**
 * Bổ sung scene Quán cà phê & Văn phòng (mẫu thiết kế) và nâng cấp 1 lần bố cục cũ của Showroom/Kho
 * (thêm lễ tân lệch bên cổng, vách thương hiệu, khu ghế chờ, kệ hàng, cây cảnh…) nếu chưa từng thiết kế.
 */
async function ensureDesignScenes() {
  const [existing, departments] = await Promise.all([
    prisma.spaceScene.findMany({ select: { id: true, code: true, kind: true, widthM: true, depthM: true, structuresJson: true } }),
    prisma.department.findMany({
      where: { isActive: true },
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      take: 8,
      select: { id: true, code: true, name: true },
    }),
  ]);
  const codes = new Set(existing.map((s) => s.code));
  const creates: Promise<unknown>[] = [];
  for (const def of [
    { code: 'CAFE', name: 'Quán cà phê mẫu', kind: 'CAFE' as const, isPublic: true },
    { code: 'OFFICE', name: 'Văn phòng công ty', kind: 'OFFICE' as const, isPublic: false },
  ]) {
    if (codes.has(def.code)) continue;
    const size = DEFAULT_SCENE_SIZE[def.kind];
    creates.push(
      prisma.spaceScene
        .create({
          data: {
            code: def.code,
            name: def.name,
            kind: def.kind,
            isPublic: def.isPublic,
            widthM: size.widthM,
            depthM: size.depthM,
            wallHeightM: def.kind === 'CAFE' ? 3.8 : 3.2,
            structuresJson: templateFor(def.kind, { ...size, departments }) as never,
          },
        })
        .catch(() => undefined), // tạo song song từ 2 request → bỏ qua lỗi trùng code
    );
  }
  for (const sc of existing) {
    const kind = normalizeSceneKind(sc.kind);
    const upgraded = upgradeLegacyLayout(kind, normalizeSpaceObjects(sc.structuresJson), {
      widthM: sc.widthM,
      depthM: sc.depthM,
      departments,
    });
    if (upgraded && upgraded.length > normalizeSpaceObjects(sc.structuresJson).length) {
      creates.push(prisma.spaceScene.update({ where: { id: sc.id }, data: { structuresJson: upgraded as never } }));
    }
  }
  await Promise.all(creates);
}

async function ensureDefaultShowroomScene() {
  const existing = await prisma.spaceScene.findUnique({ where: { code: 'SHOWROOM' } });
  if (existing) return existing;

  const [departments, sampleItems] = await Promise.all([
    prisma.department.findMany({
      where: { isActive: true },
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
      take: 6,
      select: { id: true, code: true, name: true },
    }),
    prisma.inventoryItem.findMany({
      where: { status: 'ACTIVE' },
      orderBy: [{ category: 'asc' }, { id: 'asc' }],
      take: 8,
      select: { id: true, itemCode: true, name: true, category: true },
    }),
  ]);

  const deptList = departments.length
    ? departments
    : [
        { id: 0, code: 'SALES', name: 'Phòng Kinh doanh' },
        { id: 0, code: 'TECH', name: 'Phòng Kỹ thuật' },
        { id: 0, code: 'WH', name: 'Kho vận & Giao nhận' },
        { id: 0, code: 'CS', name: 'Chăm sóc Khách hàng' },
      ];

  const structures: SpaceStructure[] = [];

  // Dãy trái: các quầy phòng ban / tư vấn (giống dãy sạp hopcho.maclife.vn)
  deptList.slice(0, 4).forEach((dept, idx) => {
    structures.push({
      id: `booth-left-${idx + 1}`,
      kind: 'BOOTH',
      label: dept.name.toUpperCase(),
      subLabel: `QUẦY ${dept.code || `0${idx + 1}`}`,
      departmentId: dept.id || null,
      posX: -10,
      posZ: -9 + idx * 6.2,
      rotY: Math.PI / 2,
      widthM: 5.2,
      depthM: 3.4,
      heightM: 3.2,
      accentColor: BOOTH_COLORS[idx % BOOTH_COLORS.length],
    });
  });

  // Dãy phải: khu trưng bày máy móc Showroom (Podium / Kệ trưng bày)
  const rightZones = [
    { label: 'KHU MÁY PHA CÀ PHÊ', sub: 'SHOWROOM A1', color: '#2563eb' },
    { label: 'KHU MÁY XAY & PHA CHẾ', sub: 'SHOWROOM A2', color: '#0891b2' },
    { label: 'KHU TỦ MÁT & BẢO QUẢN', sub: 'SHOWROOM A3', color: '#059669' },
    { label: 'KHU PHỤ TÙNG & LINH KIỆN', sub: 'SHOWROOM A4', color: '#ea580c' },
  ];
  rightZones.forEach((zone, idx) => {
    structures.push({
      id: `booth-right-${idx + 1}`,
      kind: 'BOOTH',
      label: zone.label,
      subLabel: zone.sub,
      posX: 10,
      posZ: -9 + idx * 6.2,
      rotY: -Math.PI / 2,
      widthM: 5.2,
      depthM: 3.4,
      heightM: 3.2,
      accentColor: zone.color,
    });
  });

  const scene = await prisma.spaceScene.create({
    data: {
      code: 'SHOWROOM',
      name: 'Showroom & Văn phòng 3D',
      kind: 'SHOWROOM',
      isPublic: true,
      widthM: 36,
      depthM: 32,
      wallHeightM: 5,
      structuresJson: structures as never,
    },
  });

  // Tự bố trí sẵn tối đa 8 thiết bị thật lên quầy trưng bày phía phải
  if (sampleItems.length > 0) {
    await prisma.spacePlacement.createMany({
      data: sampleItems.map((item, idx) => {
        const boothIdx = Math.floor(idx / 2);
        const slotOffset = idx % 2 === 0 ? -1.1 : 1.1;
        return {
          sceneId: scene.id,
          inventoryItemId: item.id,
          label: item.name,
          locationCode: `SR-A${boothIdx + 1}-${(idx % 2) + 1}`,
          posX: 9.2,
          posY: 0.92, // Đặt ngay trên mặt quầy trưng bày
          posZ: -9 + boothIdx * 6.2 + slotOffset,
          rotY: -Math.PI / 2,
          scale: 1,
          isPublic: true,
        };
      }),
    });
  }

  return scene;
}

/** Tự tạo scene Kho hàng 3D cho từng Warehouse thật khi nhân viên mở kho. */
async function ensureWarehouseScenes() {
  const [warehouses, whScenes] = await Promise.all([
    prisma.warehouse.findMany({
      where: { status: 'ACTIVE' },
      orderBy: { id: 'asc' },
      select: { id: true, code: true, name: true },
    }),
    prisma.spaceScene.findMany({ where: { code: { startsWith: 'WH-' } }, select: { code: true } }),
  ]);
  const existingCodes = new Set(whScenes.map((x) => x.code));

  for (const wh of warehouses) {
    const code = `WH-${wh.id}`;
    if (existingCodes.has(code)) continue;

    const racks: SpaceStructure[] = [
      { id: 'rack-a1', kind: 'RACK', label: 'DÃY A · KỆ 01', aisleCode: 'A1', posX: -9, posZ: -6, rotY: 0, widthM: 6, depthM: 1.4, heightM: 3.6, levels: 3, accentColor: '#2563eb' },
      { id: 'rack-a2', kind: 'RACK', label: 'DÃY A · KỆ 02', aisleCode: 'A2', posX: -9, posZ: 3, rotY: 0, widthM: 6, depthM: 1.4, heightM: 3.6, levels: 3, accentColor: '#2563eb' },
      { id: 'rack-b1', kind: 'RACK', label: 'DÃY B · KỆ 01', aisleCode: 'B1', posX: 9, posZ: -6, rotY: 0, widthM: 6, depthM: 1.4, heightM: 3.6, levels: 3, accentColor: '#0891b2' },
      { id: 'rack-b2', kind: 'RACK', label: 'DÃY B · KỆ 02', aisleCode: 'B2', posX: 9, posZ: 3, rotY: 0, widthM: 6, depthM: 1.4, heightM: 3.6, levels: 3, accentColor: '#0891b2' },
    ];

    const scene = await prisma.spaceScene.create({
      data: {
        code,
        name: `Kho 3D: ${wh.name}`,
        kind: 'WAREHOUSE',
        warehouseId: wh.id,
        isPublic: false,
        widthM: 34,
        depthM: 26,
        wallHeightM: 6,
        structuresJson: racks as never,
      },
    });

    // Tự đặt vài mã hàng đang tồn trong kho này lên kệ A1/B1
    const stocks = await prisma.inventoryStock.findMany({
      where: { warehouseId: wh.id, quantity: { gt: 0 } },
      take: 6,
      include: { item: { select: { id: true, name: true } } },
    });
    if (stocks.length > 0) {
      await prisma.spacePlacement.createMany({
        data: stocks.map((st, idx) => ({
          sceneId: scene.id,
          inventoryItemId: st.item.id,
          label: st.item.name,
          locationCode: `${idx < 3 ? 'A1' : 'B1'}-T1-0${(idx % 3) + 1}`,
          posX: (idx < 3 ? -9 : 9) + ((idx % 3) - 1) * 1.8,
          posY: 0.15,
          posZ: -6,
          rotY: 0,
          scale: 1,
          isPublic: false,
        })),
      });
    }
  }
}

const ENSURE_TTL_MS = 10 * 60_000;
let ensuredPublicAt = 0;
let ensuredStaffAt = 0;
async function ensureScenesCached(isStaff: boolean) {
  const now = Date.now();
  const needPublic = now - ensuredPublicAt > ENSURE_TTL_MS;
  const needStaff = isStaff && now - ensuredStaffAt > ENSURE_TTL_MS;
  if (!needPublic && !needStaff) return;
  await Promise.all([
    needPublic ? Promise.all([ensureDefaultShowroomScene(), ensureDesignScenes()]) : null,
    needStaff ? ensureWarehouseScenes() : null,
  ]);
  if (needPublic) ensuredPublicAt = now;
  if (needStaff) ensuredStaffAt = now;
}

export async function loadSpace3DData(
  ctx: AuthContext | null,
  requestedSceneCode?: string | null,
): Promise<SpacePayload> {
  const isStaff = Boolean(ctx);
  const canEdit = canDesignSpace(ctx);

  // Các bước "đảm bảo cảnh mặc định tồn tại" chỉ cần chạy định kỳ (không phải mỗi lượt tải trang):
  // mỗi tiến trình máy chủ kiểm tra lại sau 10 phút; các bước độc lập chạy song song.
  await ensureScenesCached(isStaff);

  const [branding, companyCfg, allScenes, departments] = await Promise.all([
    getAppBranding(),
    getSettingsByKeys(['company.name', 'company.phone', 'company.address']),
    prisma.spaceScene.findMany({
      where: isStaff ? {} : { isPublic: true },
      orderBy: [{ kind: 'asc' }, { id: 'asc' }],
    }),
    prisma.department.findMany({
      where: { isActive: true },
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }],
      select: {
        id: true,
        code: true,
        name: true,
        ...(isStaff ? { _count: { select: { employees: true, tasks: true } } } : {}),
      },
    }),
  ]);
  // Thứ tự hiển thị: Quán cà phê → Showroom & Văn phòng (ngay cạnh) → Văn phòng công ty → Kho
  const KIND_ORDER: Record<string, number> = { CAFE: 0, SHOWROOM: 1, OFFICE: 2, WAREHOUSE: 3 };
  allScenes.sort((a, b) => (KIND_ORDER[a.kind] ?? 9) - (KIND_ORDER[b.kind] ?? 9) || a.id - b.id);

  const activeSceneRow =
    (requestedSceneCode ? allScenes.find((s) => s.code === requestedSceneCode) : null) ??
    allScenes.find((s) => s.code === 'SHOWROOM') ??
    allScenes[0];

  // Chỉ coi là "đang trực" khi trình duyệt của nhân viên còn gửi nhịp tim (mỗi 60s).
  // Quá 3 phút không có tín hiệu (đóng tab, mất mạng, bản ghi seed cũ) → không hiển thị & dọn khỏi DB.
  const activeSince = new Date(Date.now() - PRESENCE_TTL_MS);
  // Dọn bản ghi trực cũ chạy nền (truy vấn bên dưới đã lọc theo thời gian) → không chặn tải trang
  void prisma.spacePresence.deleteMany({ where: { lastSeenAt: { lt: activeSince } } }).catch(() => undefined);
  const [placementRows, presenceRows, catalogRows, myAvatarRow] = await Promise.all([
    prisma.spacePlacement.findMany({
      where: {
        sceneId: activeSceneRow.id,
        ...(isStaff ? {} : { isPublic: true }),
      },
      include: {
        item: {
          select: {
            id: true,
            itemCode: true,
            name: true,
            category: true,
            manufacturer: true,
            description: true,
            imageUrl: true,
            sellingPrice: true,
            product3DModel: true,
            ...(isStaff ? { stocks: { select: { warehouseId: true, quantity: true } } } : {}),
          },
        },
      },
      orderBy: { id: 'asc' },
    }),
    prisma.spacePresence.findMany({
      where: { sceneCode: activeSceneRow.code, lastSeenAt: { gte: activeSince } },
      orderBy: { lastSeenAt: 'desc' },
    }),
    isStaff
      ? prisma.inventoryItem.findMany({
          where: { status: 'ACTIVE' },
          orderBy: [{ category: 'asc' }, { name: 'asc' }],
          take: 100,
          select: {
            id: true,
            itemCode: true,
            name: true,
            category: true,
            manufacturer: true,
            description: true,
            imageUrl: true,
            sellingPrice: true,
            product3DModel: true,
            stocks: { select: { warehouseId: true, quantity: true } },
          },
        })
      : Promise.resolve([]),
    ctx
      ? prisma.spaceAvatarConfig.findUnique({ where: { employeeId: ctx.employeeId } })
      : Promise.resolve(null),
  ]);

  const parsedStructures = parseStructures(activeSceneRow.structuresJson);

  // Hàng hoá công khai cho kệ trưng bày: ưu tiên SP có ảnh thật, kèm các SP được chọn tay trên kệ
  const manualIds = Array.from(
    new Set(parsedStructures.flatMap((o) => (o.merch?.mode === 'MANUAL' ? o.merch.itemIds : []))),
  ).slice(0, 200);
  // Ưu tiên MÁY MÓC / THIẾT BỊ đang CÓ TỒN trong kho (trưng bày tủ kính, bục), sau đó linh kiện & vật tư có tồn (kệ gondola)
  const merchSelect = {
    id: true,
    itemCode: true,
    name: true,
    category: true,
    manufacturer: true,
    imageUrl: true,
    sellingPrice: true,
    description: true,
    introduction: true,
    fnbCategory: true,
    product3DModel: true,
    stocks: { select: { quantity: true } },
  } as const;
  const inStock = { stocks: { some: { quantity: { gt: 0 } } } };
  const machineWhere = { OR: [{ category: { in: ['MACHINE', 'EQUIPMENT'] } }, { fnbCategory: { not: null } }] };
  const wantMerch = parsedStructures.some((o) => o.merch || o.kind === 'PODIUM') || canEdit;
  const [machineRows, partRows, manualRows] = wantMerch
    ? await Promise.all([
        prisma.inventoryItem.findMany({
          where: { status: 'ACTIVE', ...inStock, ...machineWhere },
          orderBy: [{ imageUrl: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
          take: 40,
          select: merchSelect,
        }),
        prisma.inventoryItem.findMany({
          where: { status: 'ACTIVE', ...inStock, NOT: machineWhere },
          orderBy: [{ imageUrl: { sort: 'asc', nulls: 'last' } }, { id: 'asc' }],
          take: 50,
          select: merchSelect,
        }),
        manualIds.length
          ? prisma.inventoryItem.findMany({ where: { id: { in: manualIds } }, select: merchSelect })
          : Promise.resolve([]),
      ])
    : [[], [], []];
  const seenMerch = new Set<number>();
  const merchItems = [...machineRows, ...partRows, ...manualRows]
    .filter((m) => (seenMerch.has(m.id) ? false : (seenMerch.add(m.id), true)))
    .map((m) => {
      const isMachine = m.category === 'MACHINE' || m.category === 'EQUIPMENT' || Boolean(m.fnbCategory);
      return {
        id: m.id,
        itemCode: m.itemCode,
        name: m.name,
        category: m.category,
        manufacturer: m.manufacturer,
        imageUrl: m.imageUrl,
        sellingPrice: m.sellingPrice ? Number(m.sellingPrice) : null,
        description: cleanPublicDescription(m.introduction || m.description),
        isMachine,
        stockQty: isStaff ? m.stocks.reduce((acc, st) => acc + st.quantity, 0) : null,
        model3D: isMachine ? toModel3DView('MACHINE', m.product3DModel) : null,
      };
    });
  const myPresence = ctx ? presenceRows.find((p) => p.employeeId === ctx.employeeId) ?? null : null;

  // Chỉ hiển thị các nhân viên THỰC SỰ đang đăng nhập và vào trực tại quầy (không tự tạo nhân viên ảo)
  const combinedPresences = presenceRows.map((p) => ({
    employeeId: p.employeeId,
    employeeName: p.employeeName,
    department: p.department,
    stationLabel: p.stationLabel,
    posX: p.posX,
    posZ: p.posZ,
    rotY: p.rotY,
    status: p.status,
    avatar: normalizeAvatar3DConfig(p.avatarJson),
  }));

  const placements: SpacePlacementView[] = placementRows.map((p) => {
    const item = p.item as (typeof p.item & { stocks?: { warehouseId: number; quantity: number }[] }) | null;
    const stockQty = isStaff && item?.stocks
      ? activeSceneRow.warehouseId
        ? item.stocks.filter((s) => s.warehouseId === activeSceneRow.warehouseId).reduce((acc, s) => acc + s.quantity, 0)
        : item.stocks.reduce((acc, s) => acc + s.quantity, 0)
      : null;

    return {
      id: `p-${p.id}`,
      dbId: p.id,
      inventoryItemId: p.inventoryItemId,
      itemCode: item?.itemCode ?? `OBJ-${p.id}`,
      name: p.label || item?.name || 'Thiết bị',
      category: item?.category ?? 'MACHINE',
      manufacturer: item?.manufacturer ?? null,
      description: item?.description ?? null,
      imageUrl: item?.imageUrl ?? null,
      sellingPrice: item?.sellingPrice ? Number(item.sellingPrice) : null,
      stockQty,
      locationCode: p.locationCode,
      posX: p.posX,
      posY: p.posY,
      posZ: p.posZ,
      rotY: p.rotY,
      scale: p.scale,
      isPublic: p.isPublic,
      model3D: toModel3DView(item?.category ?? 'MACHINE', item?.product3DModel),
    };
  });

  const catalog: SpaceCatalogItem[] = catalogRows.map((item) => {
    const stocks = (item as { stocks?: { warehouseId: number; quantity: number }[] }).stocks ?? [];
    const stockQty = activeSceneRow.warehouseId
      ? stocks.filter((s) => s.warehouseId === activeSceneRow.warehouseId).reduce((acc, s) => acc + s.quantity, 0)
      : stocks.reduce((acc, s) => acc + s.quantity, 0);

    return {
      id: item.id,
      itemCode: item.itemCode,
      name: item.name,
      category: item.category,
      manufacturer: item.manufacturer,
      description: item.description,
      imageUrl: item.imageUrl,
      sellingPrice: item.sellingPrice ? Number(item.sellingPrice) : null,
      stockQty,
      model3D: toModel3DView(item.category, item.product3DModel),
    };
  });

  return {
    isStaff,
    canEdit,
    currentUser: ctx
      ? {
          employeeId: ctx.employeeId,
          fullName: ctx.fullName,
          departmentName: ctx.departmentName,
          isOnDuty: Boolean(myPresence),
          dutyStation: myPresence?.stationLabel ?? null,
          avatar: normalizeAvatar3DConfig(myAvatarRow?.configJson),
          chatMode: myAvatarRow?.chatMode === 'AI' ? ('AI' as const) : ('LIVE' as const),
        }
      : null,
    branding: {
      appName: branding.name || 'TIM Corp',
      companyName: String(companyCfg['company.name'] || branding.name || 'CÔNG TY CP TIM Corp'),
      logoUrl: branding.logoUrl || '/logo-3d.png',
      hotline: String(companyCfg['company.phone'] || ''),
      address: String(companyCfg['company.address'] || ''),
    },
    scenes: allScenes.map((s) => ({
      code: s.code,
      name: s.name,
      kind: normalizeSceneKind(s.kind),
      isPublic: s.isPublic,
      warehouseId: s.warehouseId,
    })),
    activeScene: {
      id: activeSceneRow.id,
      code: activeSceneRow.code,
      name: activeSceneRow.name,
      updatedAt: activeSceneRow.updatedAt.toISOString(),
      kind: normalizeSceneKind(activeSceneRow.kind),
      isPublic: activeSceneRow.isPublic,
      widthM: activeSceneRow.widthM,
      depthM: activeSceneRow.depthM,
      wallHeightM: activeSceneRow.wallHeightM,
      structures: parsedStructures,
      placements,
    },
    departments: departments.map((d) => ({
      id: d.id,
      code: d.code,
      name: d.name,
      memberCount: (d as { _count?: { employees: number; tasks: number } })._count?.employees,
      openTaskCount: (d as { _count?: { employees: number; tasks: number } })._count?.tasks,
    })),
    presences: combinedPresences,
    catalog,
    merchItems,
  };
}
