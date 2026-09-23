/**
 * Sinh mã chứng từ dạng <PREFIX><số thứ tự>.
 *
 * Lấy số lớn nhất đang có rồi cộng 1, KHÔNG đếm số bản ghi: đếm sẽ sinh mã trùng
 * ngay khi có một chứng từ bị xóa (xóa 1 phiếu → phiếu kế tiếp lặp lại mã cũ và
 * vi phạm ràng buộc unique).
 */
export function nextSequentialCode(prefix: string, existingCodes: string[], pad = 4): string {
  let max = 0;
  for (const code of existingCodes) {
    if (!code?.startsWith(prefix)) continue;
    const seq = parseInt(code.slice(prefix.length), 10);
    if (!isNaN(seq) && seq > max) max = seq;
  }
  return `${prefix}${String(max + 1).padStart(pad, '0')}`;
}
