/** Định danh khách tham quan trong Không gian 3D (dùng chung client & server). */

/** Mã khách hợp lệ (chuỗi hex ngẫu nhiên khách tự sinh & lưu localStorage) */
export const GUEST_KEY_RE = /^[a-f0-9]{32,64}$/;

/** Id số âm ổn định cho khách — dùng chung kiểu số với id nhân viên trong roster / vị trí */
export function guestNumericId(guestKey: string): number {
  let h = 2166136261;
  for (let i = 0; i < guestKey.length; i++) h = Math.imul(h ^ guestKey.charCodeAt(i), 16777619);
  return -((Math.abs(h) % 2_000_000_000) + 1);
}

export const GUEST_KEY_STORE = 'space3d.guestKey';

/** Lấy (hoặc tạo) mã khách 160-bit lưu trong trình duyệt */
export function getOrCreateGuestKey(): string {
  try {
    const existing = window.localStorage.getItem(GUEST_KEY_STORE);
    if (existing && GUEST_KEY_RE.test(existing)) return existing;
  } catch {
    // localStorage bị chặn
  }
  const bytes = new Uint8Array(20);
  crypto.getRandomValues(bytes);
  const key = Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
  try {
    window.localStorage.setItem(GUEST_KEY_STORE, key);
  } catch {
    // bỏ qua
  }
  return key;
}
