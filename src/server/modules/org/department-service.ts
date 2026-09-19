import { prisma } from '@/lib/prisma';

export interface DepartmentNode {
  id: number;
  code: string;
  name: string;
  parentId: number | null;
  path: string;
  level: number;
  sortOrder: number;
  isActive: boolean;
  description: string | null;
  managerId: number | null;
  managerName: string | null;
  employeeCount: number;
  /** Tổng nhân sự tính cả các đơn vị trực thuộc */
  totalEmployeeCount: number;
  children: DepartmentNode[];
}

/** Lấy toàn bộ cây phòng ban kèm số nhân sự (tự cộng dồn từ dưới lên). */
export async function getDepartmentTree(): Promise<DepartmentNode[]> {
  const [departments, counts] = await Promise.all([
    prisma.department.findMany({
      orderBy: [{ level: 'asc' }, { sortOrder: 'asc' }, { name: 'asc' }],
      include: { manager: { select: { id: true, fullName: true } } },
    }),
    prisma.employee.groupBy({
      by: ['departmentId'],
      where: { status: { not: 'RESIGNED' } },
      _count: { _all: true },
    }),
  ]);

  const countMap = new Map(counts.map((c) => [c.departmentId, c._count._all]));
  const nodeMap = new Map<number, DepartmentNode>();

  for (const d of departments) {
    nodeMap.set(d.id, {
      id: d.id, code: d.code, name: d.name, parentId: d.parentId, path: d.path,
      level: d.level, sortOrder: d.sortOrder, isActive: d.isActive, description: d.description,
      managerId: d.managerId, managerName: d.manager?.fullName ?? null,
      employeeCount: countMap.get(d.id) ?? 0,
      totalEmployeeCount: countMap.get(d.id) ?? 0,
      children: [],
    });
  }

  const roots: DepartmentNode[] = [];
  for (const node of nodeMap.values()) {
    if (node.parentId && nodeMap.has(node.parentId)) {
      nodeMap.get(node.parentId)!.children.push(node);
    } else {
      roots.push(node);
    }
  }

  // Cộng dồn số nhân sự theo nhánh (duyệt hậu thứ tự)
  const accumulate = (node: DepartmentNode): number => {
    node.totalEmployeeCount = node.employeeCount + node.children.reduce((s, c) => s + accumulate(c), 0);
    return node.totalEmployeeCount;
  };
  roots.forEach(accumulate);

  return roots;
}

export function flattenTree(nodes: DepartmentNode[], out: DepartmentNode[] = []): DepartmentNode[] {
  for (const n of nodes) {
    out.push(n);
    flattenTree(n.children, out);
  }
  return out;
}

async function computePath(parentId: number | null, selfId: number): Promise<{ path: string; level: number }> {
  if (!parentId) return { path: `/${selfId}/`, level: 1 };
  const parent = await prisma.department.findUnique({ where: { id: parentId }, select: { path: true, level: true } });
  if (!parent) return { path: `/${selfId}/`, level: 1 };
  return { path: `${parent.path}${selfId}/`, level: parent.level + 1 };
}

export interface DepartmentInput {
  code: string;
  name: string;
  parentId: number | null;
  managerId: number | null;
  email?: string | null;
  phone?: string | null;
  costCenter?: string | null;
  description?: string | null;
  sortOrder?: number;
  isActive?: boolean;
}

export async function createDepartment(input: DepartmentInput) {
  const existing = await prisma.department.findUnique({ where: { code: input.code } });
  if (existing) throw new Error(`Mã phòng ban "${input.code}" đã tồn tại`);

  return prisma.$transaction(async (tx) => {
    const created = await tx.department.create({
      data: {
        code: input.code, name: input.name, parentId: input.parentId, managerId: input.managerId,
        email: input.email, phone: input.phone, costCenter: input.costCenter,
        description: input.description, sortOrder: input.sortOrder ?? 0,
        isActive: input.isActive ?? true, path: '/', level: 1,
      },
    });
    const { path, level } = await computePath(input.parentId, created.id);
    return tx.department.update({ where: { id: created.id }, data: { path, level } });
  });
}

export async function updateDepartment(id: number, input: DepartmentInput) {
  const current = await prisma.department.findUnique({ where: { id } });
  if (!current) throw new Error('Không tìm thấy phòng ban');

  const duplicate = await prisma.department.findFirst({ where: { code: input.code, id: { not: id } } });
  if (duplicate) throw new Error(`Mã phòng ban "${input.code}" đã được dùng`);

  const parentChanged = current.parentId !== input.parentId;
  if (parentChanged && input.parentId) {
    // Không cho phép chuyển một đơn vị vào chính nhánh con của nó
    const target = await prisma.department.findUnique({ where: { id: input.parentId }, select: { path: true } });
    if (!target) throw new Error('Không tìm thấy đơn vị cấp trên');
    if (target.path.startsWith(current.path)) {
      throw new Error('Không thể chuyển phòng ban vào chính đơn vị trực thuộc của nó');
    }
  }

  return prisma.$transaction(async (tx) => {
    await tx.department.update({
      where: { id },
      data: {
        code: input.code, name: input.name, parentId: input.parentId, managerId: input.managerId,
        email: input.email, phone: input.phone, costCenter: input.costCenter,
        description: input.description, sortOrder: input.sortOrder ?? current.sortOrder,
        isActive: input.isActive ?? current.isActive,
      },
    });

    if (!parentChanged) return;

    // Di chuyển nhánh: cập nhật lại path/level cho toàn bộ cây con
    const { path: newPath, level: newLevel } = await computePath(input.parentId, id);
    const descendants = await tx.department.findMany({
      where: { path: { startsWith: current.path } },
      select: { id: true, path: true, level: true },
    });
    const levelDelta = newLevel - current.level;

    for (const d of descendants) {
      const suffix = d.path.slice(current.path.length);
      await tx.department.update({
        where: { id: d.id },
        data: { path: `${newPath}${suffix}`, level: d.level + levelDelta },
      });
    }
  });
}

export async function deleteDepartment(id: number) {
  const [childCount, employeeCount] = await Promise.all([
    prisma.department.count({ where: { parentId: id } }),
    prisma.employee.count({ where: { departmentId: id } }),
  ]);
  if (childCount > 0) throw new Error('Phòng ban còn đơn vị trực thuộc, hãy xử lý các đơn vị con trước');
  if (employeeCount > 0) throw new Error(`Phòng ban còn ${employeeCount} nhân sự, hãy chuyển nhân sự sang đơn vị khác trước`);
  return prisma.department.delete({ where: { id } });
}

/** Kiểm tra tính toàn vẹn của cây: path sai, vòng lặp, level lệch. */
export async function verifyTreeIntegrity() {
  const all = await prisma.department.findMany({ select: { id: true, parentId: true, path: true, level: true } });
  const byId = new Map(all.map((d) => [d.id, d]));
  const issues: string[] = [];

  for (const d of all) {
    let expectedPath = `/${d.id}/`;
    let expectedLevel = 1;
    if (d.parentId) {
      const parent = byId.get(d.parentId);
      if (!parent) {
        issues.push(`Phòng ban #${d.id} tham chiếu đơn vị cha không tồn tại`);
        continue;
      }
      expectedPath = `${parent.path}${d.id}/`;
      expectedLevel = parent.level + 1;
    }
    if (d.path !== expectedPath) issues.push(`Phòng ban #${d.id} sai path (${d.path} ≠ ${expectedPath})`);
    if (d.level !== expectedLevel) issues.push(`Phòng ban #${d.id} sai level (${d.level} ≠ ${expectedLevel})`);
  }
  return issues;
}

/** Sửa lại toàn bộ path/level từ gốc — dùng khi phát hiện sai lệch. */
export async function rebuildTreePaths() {
  const all = await prisma.department.findMany({ select: { id: true, parentId: true }, orderBy: { id: 'asc' } });
  const childrenOf = new Map<number | null, number[]>();
  for (const d of all) {
    const key = d.parentId ?? null;
    if (!childrenOf.has(key)) childrenOf.set(key, []);
    childrenOf.get(key)!.push(d.id);
  }

  let fixed = 0;
  const walk = async (parentId: number | null, parentPath: string, level: number) => {
    for (const id of childrenOf.get(parentId) ?? []) {
      const path = `${parentPath}${id}/`;
      await prisma.department.update({ where: { id }, data: { path, level } });
      fixed++;
      await walk(id, path, level + 1);
    }
  };
  await walk(null, '/', 1);
  return fixed;
}
