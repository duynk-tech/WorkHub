import { NextResponse } from 'next/server';
import { streamText } from 'ai';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { getAuthContext } from '@/server/auth/context';
import {
  buildSpaceAiSystemPrompt,
  findProductsForQuestion,
  getSpaceAiModel,
  spaceAiRateLimited,
} from '@/server/modules/space3d/ai-chat';

export const dynamic = 'force-dynamic';
export const maxDuration = 60;

const bodySchema = z.object({
  messages: z
    .array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(2000) }))
    .min(1)
    .max(20),
  staffEmployeeId: z.number().int().positive().nullable().optional(),
  guestKey: z.string().max(64).optional(),
  /** Sản phẩm đang trưng bày tại quầy của nhân viên / sản phẩm khách vừa bấm xem */
  focusProductIds: z.array(z.number().int().positive()).max(20).optional(),
  /** Mô tả máy mẫu đang trưng bày (chưa có trong kho) */
  focusNote: z.string().max(800).optional(),
});

/**
 * Chat AI tư vấn sản phẩm (công khai cho khách tham quan) — trả về luồng chữ (text stream)
 * để client hiển thị chạy chữ theo thời gian thực.
 */
export async function POST(req: Request) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => null));
  if (!parsed.success) return NextResponse.json({ error: 'Yêu cầu không hợp lệ' }, { status: 400 });
  const { messages, staffEmployeeId, guestKey, focusProductIds = [], focusNote } = parsed.data;
  if (messages[messages.length - 1].role !== 'user') return NextResponse.json({ error: 'Thiếu câu hỏi' }, { status: 400 });

  const ctx = await getAuthContext();
  const ip = (req.headers.get('x-forwarded-for') || '').split(',')[0].trim() || 'unknown';
  const rateKey = ctx ? `emp:${ctx.employeeId}` : `guest:${guestKey || ip}`;
  if (spaceAiRateLimited(rateKey, ctx ? 30 : 12) || (!ctx && spaceAiRateLimited(`ip:${ip}`, 30))) {
    return NextResponse.json({ error: 'Bạn hỏi hơi nhanh, vui lòng thử lại sau ít giây.' }, { status: 429 });
  }

  const model = await getSpaceAiModel();
  if (!model) {
    return NextResponse.json({ error: 'Trợ lý AI chưa được cấu hình (thiếu khoá AI trong Cài đặt).' }, { status: 503 });
  }

  const staff = staffEmployeeId
    ? await prisma.employee.findFirst({
        where: { id: staffEmployeeId, status: 'ACTIVE' },
        select: { fullName: true, department: { select: { name: true } } },
      })
    : null;
  const question = messages.filter((m) => m.role === 'user').slice(-2).map((m) => m.content).join(' ');
  const products = await findProductsForQuestion(question, Boolean(ctx), 8, focusProductIds);
  const system = await buildSpaceAiSystemPrompt({
    staffName: staff?.fullName ?? null,
    department: staff?.department?.name ?? null,
    products,
    askerIsStaff: Boolean(ctx),
    focusNote: focusNote ?? null,
  });

  const result = streamText({
    model,
    system,
    messages,
    temperature: 0.4,
    maxOutputTokens: 700,
  });
  // Tự dựng luồng chữ để khi model lỗi (sai khoá, hết hạn mức…) khách thấy thông báo thay vì câu trả lời rỗng
  const encoder = new TextEncoder();
  const body = new ReadableStream<Uint8Array>({
    async start(controller) {
      let wrote = false;
      try {
        for await (const part of result.fullStream) {
          if (part.type === 'text-delta' && part.text) {
            wrote = true;
            controller.enqueue(encoder.encode(part.text));
          } else if (part.type === 'error') {
            throw part.error;
          }
        }
      } catch (err) {
        console.error('[space3d-ai] stream error:', err);
        controller.enqueue(
          encoder.encode(`${wrote ? '\n\n' : ''}⚠️ Trợ lý AI đang gặp sự cố, vui lòng thử lại sau hoặc chuyển sang trò chuyện trực tiếp với nhân viên.`),
        );
      } finally {
        controller.close();
      }
    },
  });
  return new Response(body, {
    headers: {
      'Content-Type': 'text/plain; charset=utf-8',
      'Cache-Control': 'no-store',
      'X-Products': products.map((p) => p.id).join(','),
    },
  });
}
