import { NextResponse, type NextRequest } from 'next/server';

const PUBLIC_PATHS = [
  '/login',
  '/sw.js',
  '/manifest.webmanifest',
  '/api/pwa-icon',
  '/3d',
  '/api/auth/google',
  '/install',
  '/api/zalo',
  '/api/mcp',
  '/api/cron',
  '/api/health',
  '/api/space3d/public',
  '/api/space3d/ai-chat', // Trợ lý AI tư vấn sản phẩm cho khách tham quan (có giới hạn tần suất)
];

export function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;
  const host = (req.headers.get('host') || '').toLowerCase();

  // Hỗ trợ tách subdomain riêng (VD: 3d.timcorp.vn hoặc 3d-worker-console.vercel.app)
  if ((host.startsWith('3d.') || host.startsWith('3d-')) && pathname === '/') {
    const url = req.nextUrl.clone();
    url.pathname = '/3d';
    return NextResponse.rewrite(url);
  }

  if (PUBLIC_PATHS.some((p) => pathname.startsWith(p))) return NextResponse.next();

  // Chỉ kiểm tra sự hiện diện của cookie ở tầng middleware (Edge).
  // Việc xác thực chữ ký và quyền do layout/server action thực hiện.
  const hasSession = req.cookies.has('workhub_session');
  if (!hasSession) {
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }
  return NextResponse.next();
}

export const config = {
  matcher: ['/((?!_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|glb|gltf)$).*)'],
};
