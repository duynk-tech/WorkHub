import 'server-only';
import { createOpenAICompatible } from '@ai-sdk/openai-compatible';
import { prisma } from '@/lib/prisma';
import { getSetting } from '@/server/modules/settings/service';
import { getAppBranding } from '@/server/modules/settings/branding';
import { outboundProviderFetch } from '@/server/security/outbound-http';

/**
 * Trợ lý AI tư vấn sản phẩm trong Không gian 3D.
 * Dùng Vercel AI SDK (streamText) qua endpoint OpenAI-compatible đang cấu hình trong Cài đặt
 * (ai.baseUrl / ai.model / ai.geminiApiKey) — giống trợ lý Zalo hiện có.
 */

/** Model mặc định cho trợ lý AI trong Không gian 3D */
/** Alias của Google luôn trỏ tới bản Flash-Lite mới nhất */
export const SPACE_AI_DEFAULT_MODEL = 'gemini-flash-lite-latest';

export async function getSpaceAiModel() {
  const apiKey = process.env.GEMINI_API_KEY || (await getSetting<string>('ai.geminiApiKey', ''));
  if (!apiKey) return null;
  const baseURL = (
    (await getSetting<string>('ai.baseUrl', '')) ||
    process.env.AI_BASE_URL ||
    'https://generativelanguage.googleapis.com/v1beta/openai'
  )
    .replace(/\/+$/, '')
    .replace(/\/chat\/completions$/, '');
  // Chat showroom 3D cần trả lời nhanh & rẻ → mặc định Gemini Flash-Lite (đổi bằng setting ai.spaceModel / env SPACE_AI_MODEL)
  const modelId =
    (await getSetting<string>('ai.spaceModel', '')) || process.env.SPACE_AI_MODEL || SPACE_AI_DEFAULT_MODEL;
  const provider = createOpenAICompatible({
    name: 'workhub-ai',
    baseURL,
    apiKey,
    // Đi qua bộ lọc outbound (chống SSRF) như các lời gọi AI khác của hệ thống
    fetch: (input, init) =>
      outboundProviderFetch(typeof input === 'string' ? input : input instanceof URL ? input.toString() : input.url, init),
  });
  return provider.chatModel(modelId);
}

export interface AiProductContext {
  id: number;
  itemCode: string;
  name: string;
  manufacturer: string | null;
  category: string;
  sellingPrice: number | null;
  inStock: boolean;
  stockQty: number | null;
  introduction: string | null;
  description: string | null;
  /** Đang trưng bày tại quầy của nhân viên được hỏi */
  atBooth?: boolean;
}

const STOP = new Set(['máy', 'cho', 'của', 'các', 'những', 'có', 'không', 'là', 'gì', 'giá', 'bao', 'nhiêu', 'tôi', 'mình', 'bạn', 'em', 'anh', 'chị', 'về', 'loại', 'nào', 'được', 'với', 'và', 'hỏi']);

/** Tìm sản phẩm liên quan câu hỏi (tên, hãng, giới thiệu, mô tả); ưu tiên hàng còn tồn. */
export async function findProductsForQuestion(question: string, isStaff: boolean, limit = 8, focusIds: number[] = []): Promise<AiProductContext[]> {
  const tokens = Array.from(
    new Set(
      question
        .toLowerCase()
        .replace(/[^\p{L}\p{N}\s-]/gu, ' ')
        .split(/\s+/)
        .filter((t) => t.length >= 2 && !STOP.has(t)),
    ),
  ).slice(0, 6);
  const select = {
    id: true,
    itemCode: true,
    name: true,
    manufacturer: true,
    category: true,
    sellingPrice: true,
    introduction: true,
    description: true,
    stocks: { select: { quantity: true } },
  } as const;
  const matched = tokens.length
    ? await prisma.inventoryItem.findMany({
        where: {
          status: 'ACTIVE',
          OR: tokens.flatMap((t) => [
            { name: { contains: t, mode: 'insensitive' as const } },
            { manufacturer: { contains: t, mode: 'insensitive' as const } },
            { itemCode: { contains: t, mode: 'insensitive' as const } },
            { introduction: { contains: t, mode: 'insensitive' as const } },
          ]),
        },
        take: 40,
        select,
      })
    : [];
  // Không khớp gì → giới thiệu các máy/thiết bị đang có hàng
  const rows = matched.length
    ? matched
    : await prisma.inventoryItem.findMany({
        where: {
          status: 'ACTIVE',
          stocks: { some: { quantity: { gt: 0 } } },
          OR: [{ category: { in: ['MACHINE', 'EQUIPMENT'] } }, { fnbCategory: { not: null } }],
        },
        take: limit,
        select,
      });
  const score = (r: (typeof rows)[number]) => {
    const hay = `${r.name} ${r.manufacturer ?? ''} ${r.itemCode}`.toLowerCase();
    const hits = tokens.filter((t) => hay.includes(t)).length;
    const qty = r.stocks.reduce((a, s) => a + s.quantity, 0);
    return hits * 10 + (qty > 0 ? 3 : 0) + (r.introduction ? 1 : 0);
  };
  // Sản phẩm đang bày tại quầy luôn đứng đầu ngữ cảnh
  const focusRows = focusIds.length
    ? await prisma.inventoryItem.findMany({ where: { id: { in: focusIds.slice(0, 20) } }, select })
    : [];
  const focusSet = new Set(focusRows.map((r) => r.id));
  const ordered = [
    ...focusRows.sort((a, b) => score(b) - score(a)),
    ...rows.filter((r) => !focusSet.has(r.id)).sort((a, b) => score(b) - score(a)),
  ];
  return ordered
    .slice(0, Math.max(limit, Math.min(14, focusRows.length + 4)))
    .map((r) => {
      const qty = r.stocks.reduce((a, s) => a + s.quantity, 0);
      return {
        id: r.id,
        itemCode: r.itemCode,
        name: r.name,
        manufacturer: r.manufacturer,
        category: r.category,
        sellingPrice: r.sellingPrice ? Number(r.sellingPrice) : null,
        inStock: qty > 0,
        stockQty: isStaff ? qty : null,
        introduction: r.introduction ? r.introduction.slice(0, 900) : null,
        atBooth: focusSet.has(r.id),
        description: r.description ? r.description.replace(/<!--[\s\S]*?-->/g, '').trim().slice(0, 500) || null : null,
      };
    });
}

const money = (n: number) => `${new Intl.NumberFormat('vi-VN').format(Math.round(n))} ₫`;

export async function buildSpaceAiSystemPrompt(opts: {
  staffName: string | null;
  department: string | null;
  products: AiProductContext[];
  askerIsStaff: boolean;
  focusNote?: string | null;
}): Promise<string> {
  const branding = await getAppBranding();
  const company = branding.name || 'công ty';
  const productLines = opts.products.length
    ? opts.products
        .map((p, i) =>
          [
            `${i + 1}. ${p.atBooth ? '[ĐANG BÀY TẠI QUẦY] ' : ''}${p.name} (mã ${p.itemCode}${p.manufacturer ? `, hãng ${p.manufacturer}` : ''})`,
            `   - Giá bán niêm yết: ${p.sellingPrice ? money(p.sellingPrice) : 'liên hệ'}`,
            `   - Tình trạng: ${p.inStock ? 'còn hàng' : 'tạm hết hàng'}${p.stockQty !== null ? ` (tồn ${p.stockQty})` : ''}`,
            p.introduction ? `   - Giới thiệu: ${p.introduction.replace(/\s+/g, ' ')}` : '',
            !p.introduction && p.description ? `   - Mô tả: ${p.description.replace(/\s+/g, ' ')}` : '',
          ]
            .filter(Boolean)
            .join('\n'),
        )
        .join('\n')
    : '(Không tìm thấy sản phẩm phù hợp trong kho.)';
  return [
    `Bạn là trợ lý tư vấn bán hàng của ${company}${opts.staffName ? `, trả lời thay cho nhân viên ${opts.staffName}${opts.department ? ` (${opts.department})` : ''}` : ''} tại showroom 3D.`,
    'Phong cách: thân thiện, lịch sự, ngắn gọn (tối đa ~150 chữ), tiếng Việt, dùng gạch đầu dòng khi liệt kê.',
    'CHỈ dùng dữ liệu sản phẩm dưới đây; không bịa giá, thông số hay khuyến mãi. Nếu không chắc, mời khách để lại liên hệ hoặc chờ nhân viên.',
    opts.askerIsStaff ? 'Người hỏi là nhân viên nội bộ: được nêu số tồn kho.' : 'Người hỏi là khách tham quan: KHÔNG nêu số lượng tồn kho, chỉ nói còn hàng / tạm hết.',
    'Khi giới thiệu sản phẩm: dựa vào mục "Giới thiệu" đã nạp, nêu công dụng, điểm nổi bật, giá niêm yết và gợi ý sản phẩm liên quan nếu có.',
    opts.products.some((p) => p.atBooth)
      ? 'Khách đang đứng tại quầy: ưu tiên tư vấn các sản phẩm đánh dấu [ĐANG BÀY TẠI QUẦY]; nếu khách hỏi "cái này", "sản phẩm này" thì hiểu là sản phẩm tại quầy (nếu chỉ có 1).'
      : '',
    '',
    opts.focusNote ? `MÁY MẪU KHÁCH ĐANG XEM TẠI QUẦY (chưa có trong kho, giá liên hệ): ${opts.focusNote}` : '',
    'SẢN PHẨM LIÊN QUAN TRONG KHO:',
    productLines,
  ].join('\n');
}

// ───────────── Giới hạn tần suất (chống spam endpoint công khai) ─────────────
const buckets = new Map<string, number[]>();
export function spaceAiRateLimited(key: string, max = 12, windowMs = 60_000): boolean {
  const now = Date.now();
  const list = (buckets.get(key) ?? []).filter((t) => now - t < windowMs);
  if (list.length >= max) {
    buckets.set(key, list);
    return true;
  }
  list.push(now);
  buckets.set(key, list);
  if (buckets.size > 5000) {
    for (const [k, v] of buckets) if (!v.some((t) => now - t < windowMs)) buckets.delete(k);
  }
  return false;
}
