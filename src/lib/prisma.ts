import { PrismaClient } from '@prisma/client';

const PRISMA_CLIENT_VERSION = '2026-09-28-customer-v6';
const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient; prismaVersion?: string };

// In development, if Prisma schema was recently generated or version changed,
// ensure the cached singleton in globalThis is invalidated so new models and fields are accessible.
if (
  process.env.NODE_ENV !== 'production' &&
  globalForPrisma.prisma &&
  (globalForPrisma.prismaVersion !== PRISMA_CLIENT_VERSION ||
    !(globalForPrisma.prisma as any).customer ||
    !(globalForPrisma.prisma as any).customerLocation ||
    !(globalForPrisma.prisma as any).fnbEquipment ||
    !(globalForPrisma.prisma as any).customerOrder ||
    !(globalForPrisma.prisma as any).inventoryItem ||
    !(globalForPrisma.prisma as any).warehouse ||
    !(globalForPrisma.prisma as any).inventoryTransaction ||
    !(globalForPrisma.prisma as any).sparePartOrder ||
    !(globalForPrisma.prisma as any).sparePartOrderItem)
) {
  globalForPrisma.prisma.$disconnect().catch(() => {});
  globalForPrisma.prisma = undefined;
}

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === 'development' ? ['warn', 'error'] : ['error'],
  });

if (process.env.NODE_ENV !== 'production') {
  globalForPrisma.prisma = prisma;
  globalForPrisma.prismaVersion = PRISMA_CLIENT_VERSION;
}
