/** Tên đăng nhập được nhắc trong nội dung dạng @ten.dang.nhap (không phân biệt hoa thường). */
export function extractMentions(content: string): string[] {
  const names = new Set<string>();
  for (const m of content.matchAll(/(?:^|[\s(])@([a-zA-Z0-9._-]{2,64})/g)) {
    // Bỏ dấu chấm cuối câu: "cảm ơn @an.nguyen." → an.nguyen
    names.add(m[1].replace(/[.]+$/, '').toLowerCase());
  }
  return [...names].filter((n) => n.length >= 2);
}
