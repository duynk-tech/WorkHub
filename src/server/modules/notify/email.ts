import nodemailer, { type Transporter } from 'nodemailer';

/**
 * Kênh email qua SMTP — đổi nhà cung cấp chỉ bằng biến môi trường, không đụng code.
 *
 * Miễn phí gợi ý:
 *  - Gmail: SMTP_HOST=smtp.gmail.com, SMTP_PORT=465, SMTP_USER=<gmail>, SMTP_PASS=<App Password 16 ký tự>
 *  - Brevo: SMTP_HOST=smtp-relay.brevo.com, SMTP_PORT=587, SMTP_USER/SMTP_PASS lấy ở mục SMTP & API
 * Chưa cấu hình thì mọi lệnh gửi trả `skipped` — không làm hỏng luồng thông báo khác.
 */

export interface EmailInput {
  to: string | string[];
  subject: string;
  html: string;
  text?: string;
  attachments?: { filename: string; content: Buffer; contentType?: string }[];
}

export interface EmailResult {
  ok: boolean;
  skipped?: boolean;
  error?: string;
}

let cached: { key: string; transport: Transporter } | null = null;

export function isEmailConfigured(env: NodeJS.ProcessEnv = process.env): boolean {
  return Boolean(env.SMTP_HOST && env.SMTP_USER && env.SMTP_PASS);
}

function transport(): Transporter {
  const port = Number(process.env.SMTP_PORT || 465);
  const key = `${process.env.SMTP_HOST}:${port}:${process.env.SMTP_USER}`;
  if (cached?.key === key) return cached.transport;
  const t = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port,
    secure: port === 465,
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  cached = { key, transport: t };
  return t;
}

export async function sendEmail(input: EmailInput): Promise<EmailResult> {
  if (!isEmailConfigured()) return { ok: false, skipped: true, error: 'SMTP chưa được cấu hình' };
  const to = (Array.isArray(input.to) ? input.to : [input.to]).filter(Boolean);
  if (!to.length) return { ok: false, skipped: true, error: 'Không có địa chỉ nhận' };
  try {
    await transport().sendMail({
      from: process.env.SMTP_FROM || process.env.SMTP_USER,
      to: to.join(', '),
      subject: input.subject,
      html: input.html,
      text: input.text ?? htmlToText(input.html),
      attachments: input.attachments,
    });
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

const escapeHtml = (s: string) =>
  s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

export function htmlToText(html: string): string {
  return html.replace(/<br\s*\/?>/gi, '\n').replace(/<\/p>/gi, '\n\n').replace(/<[^>]+>/g, '').replace(/&nbsp;/g, ' ').trim();
}

/**
 * Khung email thống nhất: tên app, tiêu đề, nội dung (văn bản thường, xuống dòng giữ nguyên),
 * nút mở trong ứng dụng. Inline style vì trình đọc mail bỏ qua <style>.
 */
export function renderEmailHtml(opts: {
  appName: string;
  logoUrl?: string | null;
  title: string;
  body: string;
  link?: string | null;
  linkLabel?: string;
  footer?: string;
}): string {
  const body = escapeHtml(opts.body).replace(/\n/g, '<br>');
  const logo = opts.logoUrl
    ? `<img src="${escapeHtml(opts.logoUrl)}" alt="" width="28" height="28" style="vertical-align:middle;border-radius:6px;margin-right:8px">`
    : '';
  const button = opts.link
    ? `<p style="margin:24px 0 0"><a href="${escapeHtml(opts.link)}" style="display:inline-block;background:#2563eb;color:#ffffff;text-decoration:none;font-weight:600;font-size:14px;padding:10px 18px;border-radius:8px">${escapeHtml(opts.linkLabel ?? 'Mở trong ứng dụng')}</a></p>`
    : '';
  return `<!doctype html><html lang="vi"><body style="margin:0;background:#f8fafc;font-family:Inter,Segoe UI,Arial,sans-serif;color:#0f172a">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px"><tr><td align="center">
<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border:1px solid #e2e8f0;border-radius:12px">
<tr><td style="padding:18px 24px;border-bottom:1px solid #e2e8f0;font-weight:700;font-size:15px">${logo}${escapeHtml(opts.appName)}</td></tr>
<tr><td style="padding:24px">
<h1 style="margin:0 0 12px;font-size:18px;font-weight:600;color:#020617">${escapeHtml(opts.title)}</h1>
<div style="font-size:14px;line-height:1.65;color:#334155">${body}</div>${button}
</td></tr></table>
<p style="max-width:560px;margin:14px auto 0;font-size:12px;color:#64748b">${escapeHtml(opts.footer ?? `Email tự động từ ${opts.appName}. Bạn có thể tắt nhận email trong trang Hồ sơ.`)}</p>
</td></tr></table></body></html>`;
}
