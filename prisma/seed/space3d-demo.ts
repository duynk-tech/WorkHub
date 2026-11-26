import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { DEFAULT_SCENE_SIZE, templateFor } from '../../src/lib/space-3d-templates';
import type { SpaceSceneKind } from '../../src/lib/space-3d-catalog';

/**
 * Seed các không gian 3D mẫu: Showroom, Quán cà phê, Văn phòng, Kho.
 *   npm run db:seed:space3d            → chỉ tạo scene còn thiếu (an toàn, idempotent)
 *   npm run db:seed:space3d -- --reset → ÁP LẠI bố cục mẫu cho cả 4 scene (ghi đè bố cục đã thiết kế)
 */
const prisma = new PrismaClient();

const SCENES: { code: string; name: string; kind: SpaceSceneKind; isPublic: boolean }[] = [
  { code: 'SHOWROOM', name: 'Showroom & Văn phòng 3D', kind: 'SHOWROOM', isPublic: true },
  { code: 'CAFE', name: 'Quán cà phê mẫu', kind: 'CAFE', isPublic: true },
  { code: 'OFFICE', name: 'Văn phòng công ty', kind: 'OFFICE', isPublic: false },
];

async function main() {
  const reset = process.argv.includes('--reset');
  const departments = await prisma.department.findMany({
    where: { isActive: true },
    orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { id: 'asc' }],
    take: 8,
    select: { id: true, code: true, name: true },
  });

  for (const def of SCENES) {
    const existing = await prisma.spaceScene.findUnique({ where: { code: def.code } });
    const size = existing ? { widthM: existing.widthM, depthM: existing.depthM } : DEFAULT_SCENE_SIZE[def.kind];
    const objects = templateFor(def.kind, { ...size, departments });
    if (!existing) {
      await prisma.spaceScene.create({
        data: { ...def, ...size, wallHeightM: def.kind === 'CAFE' ? 3.8 : def.kind === 'OFFICE' ? 3.2 : 5, structuresJson: objects as never },
      });
      console.log(`+ Tạo ${def.code} (${objects.length} vật thể)`);
    } else if (reset) {
      await prisma.spaceScene.update({ where: { id: existing.id }, data: { structuresJson: objects as never } });
      console.log(`↻ Áp lại mẫu ${def.code} (${objects.length} vật thể)`);
    } else {
      console.log(`= Giữ nguyên ${def.code}`);
    }
  }

  if (reset) {
    const warehouses = await prisma.spaceScene.findMany({ where: { kind: 'WAREHOUSE' } });
    for (const w of warehouses) {
      const objects = templateFor('WAREHOUSE', { widthM: w.widthM, depthM: w.depthM });
      await prisma.spaceScene.update({ where: { id: w.id }, data: { structuresJson: objects as never } });
      console.log(`↻ Áp lại mẫu kho ${w.code} (${objects.length} vật thể)`);
    }
  }
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
