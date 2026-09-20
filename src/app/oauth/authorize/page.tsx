import { redirect } from 'next/navigation';
import { getAuthContext } from '@/server/auth/context';
import { getOAuthClient } from '@/lib/mcp-oauth';
import { approveOAuthConsent } from './actions';
import { ShieldCheck, Bot, Sparkles, Check, ArrowRight, X } from 'lucide-react';
import { Button } from '@/components/ui';
import { ThemeToggle } from '@/components/ui/theme-toggle';
import { getAppBranding } from '@/server/modules/settings/branding';

export const metadata = {
  title: 'Ủy quyền ứng dụng (OAuth 2.1)',
};

export default async function OAuthAuthorizePage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | undefined>>;
}) {
  const sp = await searchParams;
  const clientId = sp.client_id || '';
  const redirectUri = sp.redirect_uri || '';
  const scope = sp.scope || 'mcp';
  const state = sp.state || '';
  const codeChallenge = sp.code_challenge || '';
  const codeChallengeMethod = sp.code_challenge_method || 'S256';
  const responseType = sp.response_type || 'code';

  // Nếu thiếu redirectUri
  if (!redirectUri) {
    return (
      <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 }}>
        <div style={{ maxWidth: 450, width: '100%', background: 'var(--surface-card)', padding: 24, borderRadius: 'var(--radius-lg)', border: '1px solid var(--border-base)', textAlign: 'center' }}>
          <h2 style={{ color: 'var(--danger)', marginBottom: 8 }}>Lỗi tham số OAuth</h2>
          <p className="hint">Thiếu tham số bắt buộc <code>redirect_uri</code>.</p>
        </div>
      </div>
    );
  }

  // Kiểm tra đăng nhập
  const ctx = await getAuthContext();
  if (!ctx) {
    const currentUrl = `/oauth/authorize?client_id=${encodeURIComponent(clientId)}&redirect_uri=${encodeURIComponent(redirectUri)}&scope=${encodeURIComponent(scope)}&state=${encodeURIComponent(state)}&code_challenge=${encodeURIComponent(codeChallenge)}&code_challenge_method=${encodeURIComponent(codeChallengeMethod)}&response_type=${encodeURIComponent(responseType)}`;
    redirect(`/login?next=${encodeURIComponent(currentUrl)}`);
  }

  // Lấy thông tin client và branding
  const [client, branding] = await Promise.all([
    getOAuthClient(clientId),
    getAppBranding(),
  ]);
  const clientName = client?.clientName || 'ChatGPT / AI Assistant';

  // URL hủy ủy quyền
  const cancelUrl = new URL(redirectUri);
  cancelUrl.searchParams.set('error', 'access_denied');
  cancelUrl.searchParams.set('error_description', 'Người dùng đã hủy yêu cầu ủy quyền');
  if (state) cancelUrl.searchParams.set('state', state);

  return (
    <div style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20, background: 'var(--surface-canvas)' }}>
      <div style={{ position: 'absolute', top: 16, right: 16 }}>
        <ThemeToggle />
      </div>

      <div
        style={{
          maxWidth: 480,
          width: '100%',
          background: 'var(--surface-card)',
          borderRadius: 'var(--radius-lg)',
          border: '1px solid var(--border-base)',
          boxShadow: 'var(--shadow-md)',
          overflow: 'hidden',
        }}
      >
        {/* Header */}
        <div style={{ background: 'var(--surface-sunken)', padding: '24px 24px 20px', borderBottom: '1px solid var(--border-subtle)', textAlign: 'center' }}>
          <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', gap: 12, marginBottom: 12 }}>
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 'var(--radius-md)',
                background: 'var(--brand)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: 20,
                fontWeight: 700,
                overflow: 'hidden',
              }}
            >
              {branding.logoUrl ? (
                <img src={branding.logoUrl} alt={branding.name} style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
              ) : (
                branding.logoText || 'W'
              )}
            </div>
            <ArrowRight size={18} style={{ color: 'var(--text-muted)' }} />
            <div
              style={{
                width: 44,
                height: 44,
                borderRadius: 'var(--radius-md)',
                background: '#10a37f',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Bot size={22} />
            </div>
          </div>
          <h2 style={{ fontSize: 18, fontWeight: 650, margin: '0 0 6px', color: 'var(--text-strong)' }}>
            Ủy quyền ứng dụng
          </h2>
          <p className="hint" style={{ margin: 0, fontSize: 13 }}>
            <strong>{clientName}</strong> muốn kết nối tới tài khoản {branding.name} của bạn qua giao thức MCP
          </p>
        </div>

        {/* Content */}
        <div style={{ padding: 24 }} className="stack">
          {/* User badge info */}
          <div
            style={{
              padding: '12px 14px',
              background: 'var(--surface-sunken)',
              borderRadius: 'var(--radius-md)',
              border: '1px solid var(--border-subtle)',
              display: 'flex',
              alignItems: 'center',
              gap: 12,
            }}
          >
            <div
              style={{
                width: 36,
                height: 36,
                borderRadius: '50%',
                background: 'var(--brand-subtle, #e0e7ff)',
                color: 'var(--brand)',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontWeight: 650,
                fontSize: 14,
              }}
            >
              {ctx.fullName.charAt(0).toUpperCase()}
            </div>
            <div style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 13.5, fontWeight: 600, color: 'var(--text-strong)' }}>
                {ctx.fullName}
              </div>
              <div className="hint" style={{ fontSize: 12 }}>
                {ctx.positionName || 'Nhân viên'} • {ctx.departmentName || 'Công ty'}
              </div>
            </div>
            <ShieldCheck size={18} style={{ color: 'var(--success)' }} />
          </div>

          {/* Permissions list */}
          <div>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 8, color: 'var(--text-strong)' }}>
              Quyền hạn ứng dụng sẽ được cấp:
            </div>
            <ul style={{ margin: 0, padding: 0, listStyle: 'none', display: 'flex', flexDirection: 'column', gap: 8 }}>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--text-muted)' }}>
                <Check size={15} style={{ color: 'var(--success)', marginTop: 2, flexShrink: 0 }} />
                <span>Tra cứu thông tin công việc, danh sách nhân sự và chấm công</span>
              </li>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--text-muted)' }}>
                <Check size={15} style={{ color: 'var(--success)', marginTop: 2, flexShrink: 0 }} />
                <span>Tạo công việc, nộp đơn nghỉ phép thay bạn theo đúng phân quyền tài khoản</span>
              </li>
              <li style={{ display: 'flex', alignItems: 'flex-start', gap: 8, fontSize: 12.5, color: 'var(--text-muted)' }}>
                <Check size={15} style={{ color: 'var(--success)', marginTop: 2, flexShrink: 0 }} />
                <span>Bảo mật: Token tự động hết hạn và có thể thu hồi bất cứ lúc nào trong Cấu hình</span>
              </li>
            </ul>
          </div>

          {/* Actions Form */}
          <form action={approveOAuthConsent} style={{ marginTop: 12 }}>
            <input type="hidden" name="client_id" value={clientId} />
            <input type="hidden" name="redirect_uri" value={redirectUri} />
            <input type="hidden" name="scope" value={scope} />
            <input type="hidden" name="state" value={state} />
            <input type="hidden" name="code_challenge" value={codeChallenge} />
            <input type="hidden" name="code_challenge_method" value={codeChallengeMethod} />

            <div style={{ display: 'flex', gap: 10 }}>
              <a
                href={cancelUrl.toString()}
                style={{
                  flex: 1,
                  display: 'inline-flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  height: 38,
                  padding: '0 16px',
                  borderRadius: 'var(--radius-md)',
                  border: '1px solid var(--border-base)',
                  background: 'var(--surface-card)',
                  color: 'var(--text-muted)',
                  fontSize: 13,
                  fontWeight: 500,
                  textDecoration: 'none',
                }}
              >
                <X size={14} style={{ marginRight: 6 }} /> Từ chối
              </a>
              <Button type="submit" variant="primary" style={{ flex: 1.4, height: 38 }}>
                <Sparkles size={14} style={{ marginRight: 6 }} /> Cho phép kết nối
              </Button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}
