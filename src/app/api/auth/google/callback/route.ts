import { NextRequest, NextResponse } from 'next/server';
import { consumeGoogleFlow, exchangeGoogleCode } from '@/server/auth/google/service';
import { prisma } from '@/lib/prisma';
import { sha256 } from '@/lib/crypto';
import { readSessionCookie, createSessionCookie } from '@/server/auth/session';
import { safeRedirectPath } from '@/lib/safe-redirect';
export async function GET(req: NextRequest) {
  let linking = false;
  try {
    const flow = await consumeGoogleFlow(req.nextUrl.searchParams.get('state'));
    linking = Boolean(flow.linkUserId);
    const code = req.nextUrl.searchParams.get('code');
    if (!code || req.nextUrl.searchParams.has('error')) throw new Error('cancelled');
    const identity = await exchangeGoogleCode(code, flow);
    let user;
    if (flow.linkUserId) {
      const session = await readSessionCookie();
      user = await prisma.user.findUnique({ where: { id: flow.linkUserId }, include: { employee: true } });
      if (!session || session.userId !== flow.linkUserId || !user || session.credentialVersion !== sha256(user.passwordHash) || flow.credentialVersion !== session.credentialVersion) throw new Error('invalid link');
    } else {
      const linked = await prisma.externalIdentity.findUnique({ where: { provider_subject: { provider: 'google', subject: identity.subject } }, include: { user: { include: { employee: true } } } });
      user = linked?.user;
    }
    if (!user || !user.isActive || user.employee.status === 'RESIGNED' || (user.lockedUntil && user.lockedUntil > new Date())) throw new Error('account unavailable');
    const ip = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null;
    await prisma.$transaction(async (tx) => {
      if (flow.linkUserId) {
        // Unique constraints prevent one Google identity being linked to multiple users.
        const existing = await tx.externalIdentity.findUnique({ where: { userId_provider: { userId: user.id, provider: 'google' } } });
        if (existing && existing.subject !== identity.subject) throw new Error('already linked');
        if (!existing) await tx.externalIdentity.create({ data: { userId: user.id, provider: 'google', ...identity } });
      }
      await tx.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date(), lastLoginIp: ip, failedAttempts: 0 } });
      await tx.auditLog.create({ data: { actorId: user.id, entityType: 'User', entityId: String(user.id), action: flow.linkUserId ? 'LINK_GOOGLE' : 'LOGIN_GOOGLE', ip } });
    });
    await createSessionCookie({ userId: user.id, username: user.username, credentialVersion: sha256(user.passwordHash) });
    return NextResponse.redirect(new URL(flow.linkUserId ? '/profile?google=linked' : safeRedirectPath(flow.next), req.url));
  } catch {
    return NextResponse.redirect(new URL(linking ? '/profile?google=failed' : '/login?sso=failed', req.url));
  }
}
