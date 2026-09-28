'use server';

import { promises as fs } from 'fs';
import path from 'path';
import crypto from 'crypto';
import { revalidatePath } from 'next/cache';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { requireAuth } from '@/server/auth/context';

const MAX_AVATAR_SIZE = 5 * 1024 * 1024; // 5MB

const ALLOWED_MIME_TYPES: Record<string, string> = {
  'image/png': '.png',
  'image/jpeg': '.jpg',
  'image/jpg': '.jpg',
  'image/webp': '.webp',
  'image/gif': '.gif',
};

function validateMagicBytes(buffer: Buffer, ext: string): boolean {
  if (buffer.length < 4) return false;

  if (ext === '.png') {
    return buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47;
  }
  if (ext === '.jpg') {
    return buffer[0] === 0xff && buffer[1] === 0xd8 && buffer[2] === 0xff;
  }
  if (ext === '.gif') {
    return buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46 && buffer[3] === 0x38;
  }
  if (ext === '.webp') {
    return (
      buffer.length >= 12 &&
      buffer.toString('ascii', 0, 4) === 'RIFF' &&
      buffer.toString('ascii', 8, 12) === 'WEBP'
    );
  }
  return true;
}

export interface ProfileActionResult {
  ok: boolean;
  message: string;
  url?: string;
}

/** Tải lên và cập nhật ảnh đại diện cho nhân sự hiện tại */
export async function uploadAvatarAction(formData: FormData): Promise<ProfileActionResult> {
  try {
    const ctx = await requireAuth();
    const file = formData.get('file') as File | null;

    if (!file || typeof file === 'string') {
      return { ok: false, message: 'Vui lòng chọn tệp ảnh để tải lên' };
    }

    if (file.size > MAX_AVATAR_SIZE) {
      return { ok: false, message: 'Dung lượng ảnh vượt quá 5MB. Vui lòng chọn ảnh nhỏ hơn.' };
    }

    const mimeType = (file.type || '').toLowerCase();
    const ext = ALLOWED_MIME_TYPES[mimeType];
    if (!ext) {
      return { ok: false, message: 'Định dạng ảnh không được hỗ trợ (chỉ nhận PNG, JPG, WebP, GIF)' };
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    if (!validateMagicBytes(buffer, ext)) {
      return { ok: false, message: 'Nội dung tệp ảnh không hợp lệ hoặc bị lỗi' };
    }

    const randomSuffix = crypto.randomBytes(6).toString('hex');
    const filename = `avatar-${ctx.employeeId}-${Date.now()}-${randomSuffix}${ext}`;

    const avatarsDir = path.join(process.cwd(), 'public', 'uploads', 'avatars');
    await fs.mkdir(avatarsDir, { recursive: true });

    const filePath = path.join(avatarsDir, filename);
    await fs.writeFile(filePath, buffer);

    const avatarUrl = `/uploads/avatars/${filename}`;

    await prisma.employee.update({
      where: { id: ctx.employeeId },
      data: { avatarUrl },
    });

    await prisma.auditLog.create({
      data: {
        actorId: ctx.userId,
        entityType: 'Employee',
        entityId: String(ctx.employeeId),
        action: 'UPDATE_AVATAR',
        diffJson: { avatarUrl } as never,
      },
    });

    revalidatePath('/profile');
    revalidatePath('/', 'layout');

    return { ok: true, message: 'Cập nhật ảnh đại diện thành công', url: avatarUrl };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Tải lên ảnh thất bại';
    return { ok: false, message };
  }
}

/** Đặt đường dẫn ảnh đại diện (chọn từ Media Library hoặc link có sẵn) */
export async function setAvatarUrlAction(url: string | null): Promise<ProfileActionResult> {
  try {
    const ctx = await requireAuth();

    await prisma.employee.update({
      where: { id: ctx.employeeId },
      data: { avatarUrl: url },
    });

    await prisma.auditLog.create({
      data: {
        actorId: ctx.userId,
        entityType: 'Employee',
        entityId: String(ctx.employeeId),
        action: url ? 'UPDATE_AVATAR' : 'REMOVE_AVATAR',
        diffJson: { avatarUrl: url } as never,
      },
    });

    revalidatePath('/profile');
    revalidatePath('/', 'layout');

    return {
      ok: true,
      message: url ? 'Đã đổi ảnh đại diện thành công' : 'Đã xóa ảnh đại diện',
      url: url ?? undefined,
    };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Thao tác thất bại';
    return { ok: false, message };
  }
}

const contactSchema = z.object({
  phone: z.string().max(32).nullable().optional(),
  email: z.string().email('Email không đúng định dạng').nullable().optional().or(z.literal('')),
  gender: z.string().max(16).nullable().optional(),
  dateOfBirth: z.string().nullable().optional(),
});

/** Cập nhật thông tin liên hệ cá nhân */
export async function updateContactInfoAction(data: {
  phone?: string | null;
  email?: string | null;
  gender?: string | null;
  dateOfBirth?: string | null;
}): Promise<ProfileActionResult> {
  try {
    const ctx = await requireAuth();
    const parsed = contactSchema.safeParse(data);
    if (!parsed.success) {
      return { ok: false, message: parsed.error.issues[0]?.message ?? 'Dữ liệu không hợp lệ' };
    }

    const { phone, email, gender, dateOfBirth } = parsed.data;

    if (email && email.trim() !== '') {
      const existing = await prisma.employee.findFirst({
        where: {
          email: email.trim(),
          id: { not: ctx.employeeId },
        },
      });
      if (existing) {
        return { ok: false, message: `Email "${email}" đã được nhân sự khác sử dụng` };
      }
    }

    await prisma.employee.update({
      where: { id: ctx.employeeId },
      data: {
        phone: phone ? phone.trim() : null,
        email: email && email.trim() !== '' ? email.trim() : null,
        gender: gender || null,
        dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
      },
    });

    await prisma.auditLog.create({
      data: {
        actorId: ctx.userId,
        entityType: 'Employee',
        entityId: String(ctx.employeeId),
        action: 'UPDATE_PROFILE',
        diffJson: { phone, email, gender, dateOfBirth } as never,
      },
    });

    revalidatePath('/profile');
    revalidatePath('/', 'layout');

    return { ok: true, message: 'Đã cập nhật thông tin cá nhân' };
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Cập nhật thất bại';
    return { ok: false, message };
  }
}
