import { prisma } from '@/lib/prisma';
import { nextSequentialCode } from '@/lib/code-sequence';
import type { Prisma } from '@prisma/client';
import type { SaveEquipmentInput } from './types';

export interface ListEquipmentFilter {
  search?: string;
  category?: string;
  ownershipType?: string;
  status?: string;
  customerId?: number;
  locationId?: number;
}

export async function generateMachineCode(): Promise<string> {
  const year = new Date().getFullYear();
  const prefix = `EQ-${year}-`;
  try {
    if (!prisma.fnbEquipment) return `${prefix}0001`;
    const rows = await prisma.fnbEquipment.findMany({
      where: { machineCode: { startsWith: prefix } },
      select: { machineCode: true },
    });
    return nextSequentialCode(prefix, rows.map((r) => r.machineCode));
  } catch {
    return `${prefix}0001`;
  }
}

export async function listEquipment(filter: ListEquipmentFilter = {}) {
  if (!prisma.fnbEquipment) return [];

  try {
    const where: Prisma.FnbEquipmentWhereInput = {};

    if (filter.search?.trim()) {
      const s = filter.search.trim();
      where.OR = [
        { name: { contains: s } },
        { machineCode: { contains: s } },
        { serialNumber: { contains: s } },
        { brand: { contains: s } },
        { model: { contains: s } },
      ];
    }

    if (filter.category) {
      where.category = filter.category;
    }

    if (filter.ownershipType) {
      where.ownershipType = filter.ownershipType;
    }

    if (filter.status) {
      where.status = filter.status;
    }

    if (filter.customerId) {
      where.customerId = filter.customerId;
    }

    if (filter.locationId) {
      where.locationId = filter.locationId;
    }

    return await prisma.fnbEquipment.findMany({
      where,
      include: {
        customer: { select: { id: true, name: true, code: true, phone: true } },
        location: { select: { id: true, name: true, address: true, managerName: true, phone: true } },
        _count: { select: { tickets: true } },
      },
      orderBy: { createdAt: 'desc' },
    });
  } catch (error) {
    console.error('[listEquipment error]:', error);
    return [];
  }
}

export async function getEquipmentById(id: number) {
  if (!prisma.fnbEquipment) return null;
  const numId = Number(id);
  if (!numId || isNaN(numId) || numId <= 0) return null;

  try {
    return await prisma.fnbEquipment.findUnique({
      where: { id: numId },
      include: {
        customer: {
          select: {
            id: true,
            name: true,
            code: true,
            phone: true,
            email: true,
            address: true,
            locations: { select: { id: true, name: true, address: true, managerName: true, phone: true } },
          },
        },
        location: {
          select: {
            id: true,
            name: true,
            address: true,
            managerName: true,
            phone: true,
          },
        },
        warehouse: {
          select: {
            id: true,
            code: true,
            name: true,
            type: true,
            address: true,
          },
        },
        tickets: {
          include: {
            assignedTo: { select: { id: true, fullName: true, avatarUrl: true, code: true } },
            partsUsed: {
              include: {
                item: { select: { id: true, itemCode: true, name: true, unit: true, category: true } },
              },
            },
          },
          orderBy: { createdAt: 'desc' },
        },
      },
    });
  } catch (error) {
    console.error('[getEquipmentById error]:', error);
    return null;
  }
}

export async function getEquipmentMetrics() {
  if (!prisma.fnbEquipment) {
    return { total: 0, operating: 0, breakdown: 0, underMaintenance: 0, inStock: 0 };
  }

  try {
    const [total, operating, breakdown, underMaintenance, inStock] = await Promise.all([
      prisma.fnbEquipment.count(),
      prisma.fnbEquipment.count({ where: { status: 'OPERATING' } }),
      prisma.fnbEquipment.count({ where: { status: 'BREAKDOWN' } }),
      prisma.fnbEquipment.count({ where: { status: 'UNDER_MAINTENANCE' } }),
      prisma.fnbEquipment.count({ where: { status: 'IN_STOCK' } }),
    ]);

    return {
      total,
      operating,
      breakdown,
      underMaintenance,
      inStock,
    };
  } catch (error) {
    console.error('[getEquipmentMetrics error]:', error);
    return { total: 0, operating: 0, breakdown: 0, underMaintenance: 0, inStock: 0 };
  }
}

export async function listCustomersWithLocations() {
  if (!prisma.customer) return [];

  try {
    return await prisma.customer.findMany({
      where: { status: 'ACTIVE' },
      select: {
        id: true,
        code: true,
        name: true,
        phone: true,
        locations: {
          select: {
            id: true,
            name: true,
            address: true,
            managerName: true,
            phone: true,
          },
        },
      },
      orderBy: { name: 'asc' },
    });
  } catch (error) {
    console.error('[listCustomersWithLocations error]:', error);
    return [];
  }
}

export async function saveEquipment(id: number | null, input: SaveEquipmentInput) {
  const machineCode = input.machineCode?.trim() || (id ? undefined : await generateMachineCode());

  const data: Prisma.FnbEquipmentCreateInput = {
    name: input.name.trim(),
    machineCode: machineCode!,
    serialNumber: input.serialNumber.trim(),
    category: input.category,
    brand: input.brand?.trim() || null,
    model: input.model?.trim() || null,
    ownershipType: input.ownershipType,
    status: input.status,
    specs: (input.specs as any) || null,
    notes: input.notes?.trim() || null,
    installedDate: input.installedDate ? new Date(input.installedDate) : null,
    warrantyExpiresAt: input.warrantyExpiresAt ? new Date(input.warrantyExpiresAt) : null,
    lastPmDate: input.lastPmDate ? new Date(input.lastPmDate) : null,
    nextPmDate: input.nextPmDate ? new Date(input.nextPmDate) : null,
    imageUrl: input.imageUrl?.trim() || null,
    customer: input.customerId ? { connect: { id: input.customerId } } : undefined,
    location: input.locationId ? { connect: { id: input.locationId } } : undefined,
  };

  if (id) {
    return prisma.fnbEquipment.update({
      where: { id },
      data: {
        name: data.name,
        serialNumber: data.serialNumber,
        category: data.category,
        brand: data.brand,
        model: data.model,
        ownershipType: data.ownershipType,
        status: data.status,
        specs: data.specs,
        notes: data.notes,
        installedDate: data.installedDate,
        warrantyExpiresAt: data.warrantyExpiresAt,
        lastPmDate: data.lastPmDate,
        nextPmDate: data.nextPmDate,
        imageUrl: data.imageUrl,
        customer: input.customerId ? { connect: { id: input.customerId } } : { disconnect: true },
        location: input.locationId ? { connect: { id: input.locationId } } : { disconnect: true },
      },
    });
  }

  return prisma.fnbEquipment.create({ data });
}

export async function deleteEquipment(id: number) {
  return prisma.fnbEquipment.delete({ where: { id } });
}
