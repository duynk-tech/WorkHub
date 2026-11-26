import { NextResponse, type NextRequest } from 'next/server';
import crypto from 'crypto';
import path from 'node:path';
import { prisma } from '@/lib/prisma';
import { requireAuth, can } from '@/server/auth/context';
import { taskScopeWhere, logActivity } from '@/server/modules/task/service';
import { uploadFile } from '@/lib/storage';

export const dynamic = 'force-dynamic';

const MAX_FILE_SIZE = 4 * 1024 * 1024; // 4MB (dưới giới hạn 4.5MB của Vercel Serverless)

const ALLOWED_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.webp', '.gif',
  '.pdf', '.doc', '.docx', '.xls', '.xlsx', '.ppt', '.pptx',
  '.txt', '.csv', '.zip',
]);

export async function POST(
  req: NextRequest,
  context: { params: Promise<{ id: string }> },
) {
  try {
    const ctx = await requireAuth();
    const { id } = await context.params;
    const taskId = Number(id);
    if (!Number.isInteger(taskId) || taskId <= 0) {
      return NextResponse.json({ error: 'Mã công việc không hợp lệ' }, { status: 400 });
    }

    const task = await prisma.task.findFirst({
      where: { AND: [{ id: taskId }, await taskScopeWhere(ctx)] },
      select: { id: true, assigneeId: true, creatorId: true, reviewerId: true },
    });
    if (!task) {
      return NextResponse.json({ error: 'Không tìm thấy công việc hoặc ngoài phạm vi của bạn' }, { status: 404 });
    }

    const canEdit =
      task.assigneeId === ctx.employeeId ||
      task.creatorId === ctx.employeeId ||
      task.reviewerId === ctx.employeeId ||
      can(ctx, 'FEATURE_TASK_EDIT');
    if (!canEdit) {
      return NextResponse.json({ error: 'Bạn không có quyền tải tệp đính kèm cho công việc này' }, { status: 403 });
    }

    const formData = await req.formData();
    const file = formData.get('file') as File | null;
    if (!file || typeof file === 'string') {
      return NextResponse.json({ error: 'Không tìm thấy tệp tải lên' }, { status: 400 });
    }
    if (file.size <= 0 || file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: 'Tệp phải lớn hơn 0 byte và không vượt quá 4MB' }, { status: 400 });
    }

    const originalName = (file.name || 'file').trim().slice(0, 255);
    const ext = path.extname(originalName).toLowerCase();
    if (!ALLOWED_EXTENSIONS.has(ext)) {
      return NextResponse.json(
        { error: 'Định dạng không hỗ trợ. Chấp nhận ảnh, PDF, Word, Excel, PowerPoint, TXT, CSV hoặc ZIP.' },
        { status: 400 },
      );
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const safeBase = originalName
      .replace(/\.[^/.]+$/, '')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_')
      .slice(0, 40) || 'attachment';
    const uniqueName = `${safeBase}-${Date.now()}-${crypto.randomBytes(4).toString('hex')}${ext}`;
    const objectPath = `tasks/${taskId}/${uniqueName}`;

    const uploaded = await uploadFile({
      objectPath,
      buffer,
      contentType: file.type || 'application/octet-stream',
    });

    const attachment = await prisma.taskAttachment.create({
      data: {
        taskId,
        fileName: originalName,
        filePath: uploaded.url,
        mimeType: file.type || null,
        sizeBytes: buffer.length,
        uploadedById: ctx.employeeId,
      },
    });

    await logActivity(taskId, ctx.employeeId, 'ATTACHMENT', originalName, null, 'đã đính kèm');

    return NextResponse.json({ ok: true, attachment });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Tải tệp đính kèm thất bại';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
