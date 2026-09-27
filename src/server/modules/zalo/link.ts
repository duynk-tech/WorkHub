import { prisma } from '@/lib/prisma';
import { randomLinkCode } from '@/lib/utils';

const CODE_TTL_MINUTES = 10;

/** Sinh mã liên kết để người dùng nhắn cho bot. */
export async function createLinkCode(userId: number) {
  await prisma.zaloLinkCode.deleteMany({ where: { userId, usedAt: null } });

  let code = randomLinkCode(6);
  for (let i = 0; i < 5; i++) {
    const clash = await prisma.zaloLinkCode.findUnique({ where: { code } });
    if (!clash) break;
    code = randomLinkCode(6);
  }

  return prisma.zaloLinkCode.create({
    data: { code, userId, expiresAt: new Date(Date.now() + CODE_TTL_MINUTES * 60000) },
  });
}

/** Đối chiếu mã do người dùng gửi từ Zalo và gắn zaloUserId vào hồ sơ nhân sự. */
export async function consumeLinkCode(code: string, zaloUserId: string) {
  if (!/^[A-Z2-9]{6}$/.test(code.trim().toUpperCase())) return { ok: false as const, message: 'Mã liên kết không hợp lệ' };
  const attempts = await prisma.zaloInboundLog.count({
    where: { zaloUserId, createdAt: { gte: new Date(Date.now() - 10 * 60_000) },
      OR: [{ text: { startsWith: '/lienket' } }, { text: { startsWith: '/link' } }],
    },
  });
  if (attempts > 5) return { ok: false as const, message: 'Quá nhiều lần liên kết. Thử lại sau 10 phút.' };
  const record = await prisma.zaloLinkCode.findUnique({
    where: { code: code.trim().toUpperCase() },
    include: { user: { include: { employee: { select: { id: true, fullName: true, status: true } } } } },
  });

  if (!record) return { ok: false as const, message: 'Mã liên kết không đúng. Hãy lấy mã mới trong mục Hồ sơ cá nhân.' };
  if (!record.user.isActive || record.user.employee.status === 'RESIGNED' ||
      (record.user.lockedUntil && record.user.lockedUntil > new Date())) {
    return { ok: false as const, message: 'Tài khoản không được phép liên kết' };
  }
  if (record.usedAt) return { ok: false as const, message: 'Mã này đã được sử dụng.' };
  if (record.expiresAt < new Date()) return { ok: false as const, message: 'Mã đã hết hạn. Hãy lấy mã mới.' };

  const taken = await prisma.employee.findFirst({
    where: { zaloUserId, id: { not: record.user.employeeId } },
    select: { fullName: true },
  });
  if (taken) return { ok: false as const, message: `Tài khoản Zalo này đã liên kết với ${taken.fullName}.` };

  await prisma.$transaction(async (tx) => {
    const claimed = await tx.zaloLinkCode.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw new Error('Mã đã được sử dụng hoặc hết hạn');
    await tx.employee.update({ where: { id: record.user.employeeId }, data: { zaloUserId } });
    // A new link starts a new context, preventing access to the previous owner's chat.
    await tx.zaloInboundLog.create({ data: { zaloUserId, text: '/reset', response: 'Đã liên kết tài khoản', handled: true } });
  });

  return { ok: true as const, employee: record.user.employee, message: `Liên kết thành công với ${record.user.employee.fullName}` };
}

export async function unlinkZalo(userId: number) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { employeeId: true } });
  if (!user) return { ok: false as const, message: 'Không tìm thấy tài khoản' };
  await prisma.employee.update({ where: { id: user.employeeId }, data: { zaloUserId: null } });
  return { ok: true as const, message: 'Đã hủy liên kết Zalo' };
}

export async function findEmployeeByZaloId(zaloUserId: string) {
  const employee = await prisma.employee.findUnique({
    where: { zaloUserId },
    include: {
      user: { include: { roles: { include: { role: { include: { permissions: true } } } } } },
      department: { select: { id: true, name: true, path: true } },
    },
  });
  if (!employee?.user?.isActive || employee.status === 'RESIGNED' ||
      (employee.user.lockedUntil && employee.user.lockedUntil > new Date())) return null;
  return employee;
}
