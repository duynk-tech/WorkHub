import 'server-only';
import { prisma } from '@/lib/prisma';
import { can, type AuthContext } from '@/server/auth/context';
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
} from '@/lib/space-3d-types';

const BOOTH_COLORS = ['#2563eb', '#0891b2', '#ea580c', '#7c3aed', '#059669', '#d97706'];

function parseStructures(raw: unknown): SpaceStructure[] {
  if (!Array.isArray(raw)) return [];
  return raw.filter((s): s is SpaceStructure => Boolean(s && typeof s === 'object' && typeof (s as { id?: unknown }).id === 'string'));
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
  const warehouses = await prisma.warehouse.findMany({
    where: { status: 'ACTIVE' },
    orderBy: { id: 'asc' },
    select: { id: true, code: true, name: true },
  });

  for (const wh of warehouses) {
    const code = `WH-${wh.id}`;
    const exists = await prisma.spaceScene.findUnique({ where: { code } });
    if (exists) continue;

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

export async function loadSpace3DData(
  ctx: AuthContext | null,
  requestedSceneCode?: string | null,
): Promise<SpacePayload> {
  const isStaff = Boolean(ctx);
  const canEdit = Boolean(
    ctx &&
      (ctx.isAdmin ||
        can(ctx, 'FEATURE_EQUIPMENT_MANAGE') ||
        can(ctx, 'FEATURE_SPARE_PARTS_MANAGE') ||
        can(ctx, 'FEATURE_SETTING_GENERAL')),
  );

  await ensureDefaultShowroomScene();
  if (isStaff) {
    await ensureWarehouseScenes();
  }

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

  const activeSceneRow =
    (requestedSceneCode ? allScenes.find((s) => s.code === requestedSceneCode) : null) ??
    allScenes.find((s) => s.code === 'SHOWROOM') ??
    allScenes[0];

  const activeSince = new Date(Date.now() - 8 * 60 * 60 * 1000);
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
      kind: (s.kind === 'WAREHOUSE' ? 'WAREHOUSE' : 'SHOWROOM') as 'SHOWROOM' | 'WAREHOUSE',
      isPublic: s.isPublic,
      warehouseId: s.warehouseId,
    })),
    activeScene: {
      id: activeSceneRow.id,
      code: activeSceneRow.code,
      name: activeSceneRow.name,
      kind: (activeSceneRow.kind === 'WAREHOUSE' ? 'WAREHOUSE' : 'SHOWROOM') as 'SHOWROOM' | 'WAREHOUSE',
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
  };
}
