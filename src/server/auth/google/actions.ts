'use server';
import { redirect } from 'next/navigation';
import { revalidatePath } from 'next/cache';
import { requireAuth } from '@/server/auth/context';
import { prisma } from '@/lib/prisma';
import { sha256 } from '@/lib/crypto';
import { verifyPassword } from '@/server/auth/password';
import { beginGoogleFlow } from './service';
import { writeAudit } from '@/server/lib/audit';
type State = { error?: string; success?: string };
async function verifyCurrentPassword(form: FormData) {
  const ctx = await requireAuth();
  const user = await prisma.user.findUniqueOrThrow({ where: { id: ctx.userId } });
  const password = form.get('password');
  if (typeof password !== 'string' || !password || !await verifyPassword(password, user.passwordHash)) {
    const updated = await prisma.user.update({ where: { id: user.id }, data: { failedAttempts: { increment: 1 } } });
    if (updated.failedAttempts >= 5) await prisma.user.update({ where: { id: user.id }, data: { lockedUntil: new Date(Date.now() + 600000) } });
    return null;
  }
  return user;
}
export async function linkGoogleAction(_state: State, form: FormData): Promise<State> {
  const user = await verifyCurrentPassword(form);
  if (!user) return { error: 'Mật khẩu không đúng' };
  let url: string;
  try { url = await beginGoogleFlow('/profile', { userId: user.id, credentialVersion: sha256(user.passwordHash) }); }
  catch { return { error: 'Google SSO chưa sẵn sàng' }; }
  redirect(url);
}
export async function unlinkGoogleAction(_state: State, form: FormData): Promise<State> {
  const user = await verifyCurrentPassword(form);
  if (!user) return { error: 'Mật khẩu không đúng' };
  await prisma.$transaction(async (tx) => {
    await tx.externalIdentity.deleteMany({ where: { userId: user.id, provider: 'google' } });
    await writeAudit({ actorId: user.id, entityType: 'User', entityId: String(user.id), action: 'UNLINK_GOOGLE' }, tx);
  });
  revalidatePath('/profile');
  return { success: 'Đã hủy liên kết Google' };
}
