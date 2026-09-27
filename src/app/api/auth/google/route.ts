import { NextRequest, NextResponse } from 'next/server';
import { beginGoogleFlow } from '@/server/auth/google/service';
export async function GET(req: NextRequest) {
  try { return NextResponse.redirect(await beginGoogleFlow(req.nextUrl.searchParams.get('next') ?? undefined)); }
  catch { return NextResponse.redirect(new URL('/login?sso=unavailable', req.url)); }
}
