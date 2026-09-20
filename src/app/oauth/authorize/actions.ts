'use server';

import { redirect } from 'next/navigation';
import { requireAuth } from '@/server/auth/context';
import { createAuthCode } from '@/lib/mcp-oauth';

export async function approveOAuthConsent(formData: FormData) {
  const ctx = await requireAuth();

  const clientId = String(formData.get('client_id') || '');
  const redirectUri = String(formData.get('redirect_uri') || '');
  const state = String(formData.get('state') || '');
  const scope = String(formData.get('scope') || 'mcp');
  const codeChallenge = String(formData.get('code_challenge') || '');
  const codeChallengeMethod = String(formData.get('code_challenge_method') || 'S256');

  if (!clientId || !redirectUri) {
    throw new Error('Thiếu tham số client_id hoặc redirect_uri');
  }

  // Sinh authorization code cho OAuth 2.1 PKCE
  const code = await createAuthCode({
    userId: ctx.userId,
    clientId,
    redirectUri,
    codeChallenge,
    codeChallengeMethod,
    scope,
  });

  const redirectUrl = new URL(redirectUri);
  redirectUrl.searchParams.set('code', code);
  if (state) {
    redirectUrl.searchParams.set('state', state);
  }

  redirect(redirectUrl.toString());
}
