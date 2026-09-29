import 'server-only';
import { lookup } from 'node:dns/promises';
import { BlockList, isIP } from 'node:net';
import { request } from 'node:https';

const blocked = new BlockList();
for (const [address, prefix] of [
  ['0.0.0.0', 8], ['10.0.0.0', 8], ['100.64.0.0', 10], ['127.0.0.0', 8],
  ['169.254.0.0', 16], ['172.16.0.0', 12], ['192.0.0.0', 24], ['192.0.2.0', 24],
  ['192.168.0.0', 16], ['198.18.0.0', 15], ['198.51.100.0', 24], ['203.0.113.0', 24],
  ['224.0.0.0', 4], ['240.0.0.0', 4],
] as const) blocked.addSubnet(address, prefix, 'ipv4');
const globalV6 = new BlockList();
globalV6.addSubnet('2000::', 3, 'ipv6');
const blockedV6 = new BlockList();
blockedV6.addSubnet('2001::', 23, 'ipv6');
blockedV6.addSubnet('2001:db8::', 32, 'ipv6');
blockedV6.addSubnet('2002::', 16, 'ipv6');

export function isPublicAddress(address: string): boolean {
  const family = isIP(address);
  if (family === 4) return !blocked.check(address, 'ipv4');
  return family === 6 && globalV6.check(address, 'ipv6') && !blockedV6.check(address, 'ipv6');
}

/** Allowlist is controlled by deployment, not prompts or editable tool definitions. */
export async function resolveOutboundTarget(raw: string, purpose: 'tool' | 'provider' = 'tool') {
  const url = new URL(raw);
  const allowed = (purpose === 'provider'
    ? `https://generativelanguage.googleapis.com,${process.env.AI_PROVIDER_ALLOWED_ORIGINS || ''}`
    : process.env.AI_TOOL_ALLOWED_ORIGINS || '').split(',').map((s) => s.trim()).filter(Boolean);
  if (url.protocol !== 'https:' || url.username || url.password || !allowed.includes(url.origin)) {
    throw new Error(`Endpoint chưa được cho phép trong ${purpose === 'tool' ? 'AI_TOOL_ALLOWED_ORIGINS' : 'AI_PROVIDER_ALLOWED_ORIGINS'} (chỉ HTTPS)`);
  }
  const hostname = url.hostname.replace(/^\[|\]$/g, '');
  const addresses = await lookup(hostname, { all: true, verbatim: true });
  if (!addresses.length || addresses.some((a) => !isPublicAddress(a.address))) {
    throw new Error('Không được truy cập địa chỉ mạng nội bộ hoặc đặc biệt');
  }
  return { url, address: addresses[0] };
}

/** Pin validated DNS for the TLS connection, bound response size and never follow redirects. */
async function pinnedRequest(raw: string, method: string, headers: Record<string, string>, body: string | undefined, purpose: 'tool' | 'provider') {
  const { url, address } = await resolveOutboundTarget(raw, purpose);
  const maxBytes = purpose === 'provider' ? 1024 * 1024 : 256 * 1024;
  if (body && Buffer.byteLength(body) > maxBytes) throw new Error('Nội dung gửi quá lớn');
  for (const key of Object.keys(headers)) {
    if (['host', 'connection', 'content-length', 'transfer-encoding', 'upgrade'].includes(key.toLowerCase())) {
      throw new Error('Header không được phép');
    }
  }
  return new Promise<Response>((resolve, reject) => {
    const req = request(url, {
      method, headers,
      // Node can request all DNS candidates when autoSelectFamily is enabled.
      // Return the matching callback shape or https.request may receive an
      // undefined IP instead of the pinned address.
      lookup: (_hostname, options, callback) => {
        if (options.all) callback(null, [address]);
        else callback(null, address.address, address.family);
      },
    }, (res) => {
      let size = 0;
      const chunks: Buffer[] = [];
      res.on('data', (chunk: Buffer) => {
        size += chunk.length;
        if (size > maxBytes) { req.destroy(new Error('Kết quả công cụ quá lớn')); return; }
        chunks.push(chunk);
      });
      res.on('error', reject);
      res.on('end', () => {
        const status = res.statusCode || 502;
        if (status >= 300 && status < 400) { reject(new Error('Endpoint chuyển hướng không được phép')); return; }
        resolve(new Response([204, 205, 304].includes(status) ? null : Buffer.concat(chunks).toString('utf8'), {
          status, headers: { 'content-type': res.headers['content-type'] || 'text/plain' },
        }));
      });
    });
    const timer = setTimeout(() => req.destroy(new Error('Công cụ quá thời gian phản hồi')), 15000);
    req.on('close', () => clearTimeout(timer));
    req.on('error', reject);
    req.end(body);
  });
}

export async function outboundToolRequest(raw: string, method: string, headers: Record<string, string>, body?: string) {
  const response = await pinnedRequest(raw, method, headers, body, 'tool');
  if (!response.ok) throw new Error(`Endpoint trả HTTP ${response.status}`);
  return response.headers.get('content-type')?.includes('application/json') ? response.json() : response.text();
}

export async function outboundProviderFetch(raw: string, options: RequestInit = {}) {
  if (options.body !== undefined && typeof options.body !== 'string') throw new Error('Body không hợp lệ');
  return pinnedRequest(raw, options.method || 'GET', Object.fromEntries(new Headers(options.headers).entries()), options.body as string | undefined, 'provider');
}
