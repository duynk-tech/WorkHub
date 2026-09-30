import { NextResponse } from 'next/server';
import { getAuthContext } from '@/server/auth/context';
import { handleZaloAiQuery } from '@/server/modules/zalo/ai-agent';

export const dynamic = 'force-dynamic';

type ChatTurn = { role: 'user' | 'assistant'; content: string };

export async function POST(req: Request) {
  try {
    const ctx = await getAuthContext();
    if (!ctx) return NextResponse.json({ ok: false, error: 'Phiên đăng nhập đã hết hạn. Vui lòng đăng nhập lại.' }, { status: 401 });
    const body = await req.json();
    const prompt = typeof body?.prompt === 'string' ? body.prompt.trim() : '';
    if (!prompt || prompt.length > 3000) {
      return NextResponse.json({ ok: false, error: 'Tin nhắn cần có nội dung và tối đa 3.000 ký tự.' }, { status: 400 });
    }

    const history: ChatTurn[] = Array.isArray(body?.history)
      ? body.history
          .slice(-12)
          .filter((turn: unknown): turn is ChatTurn =>
            Boolean(turn && typeof turn === 'object' &&
              ((turn as ChatTurn).role === 'user' || (turn as ChatTurn).role === 'assistant') &&
              typeof (turn as ChatTurn).content === 'string'),
          )
          .map((turn: ChatTurn) => ({ role: turn.role, content: turn.content.slice(0, 3000) }))
      : [];

    const reply = await handleZaloAiQuery(ctx.employeeId, prompt, undefined, history);
    return NextResponse.json({ ok: true, reply });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Không thể gửi tin nhắn tới trợ lý AI.';
    const status = message.includes('chưa đăng nhập') ? 401 : 500;
    return NextResponse.json({ ok: false, error: message }, { status });
  }
}
