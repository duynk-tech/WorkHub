/**
 * Đọc số tiền thành chữ tiếng Việt cho chứng từ in.
 *
 * Khác với gợi ý độ lớn ("~ 1.61 triệu") dùng dưới ô nhập liệu: trên báo giá,
 * hợp đồng và phiếu thu, số tiền bằng chữ là căn cứ đối chiếu khi con số bị sửa,
 * nên phải đọc đủ từng hàng chứ không làm tròn.
 */

const DIGITS = ['không', 'một', 'hai', 'ba', 'bốn', 'năm', 'sáu', 'bảy', 'tám', 'chín'];
/** Nhóm ba chữ số, từ nhỏ tới lớn. */
const GROUPS = ['', ' nghìn', ' triệu', ' tỷ'];

/**
 * Đọc một nhóm ba chữ số.
 * `full` = true khi nhóm này đứng sau một nhóm lớn hơn, lúc đó hàng trăm bằng 0
 * vẫn phải đọc "không trăm" để không nhập nhằng: 1.020.000 là "một triệu không
 * trăm hai mươi nghìn", không phải "một triệu hai mươi nghìn".
 */
function readTriple(n: number, full: boolean): string {
  const tram = Math.floor(n / 100);
  const chuc = Math.floor((n % 100) / 10);
  const donvi = n % 10;
  const out: string[] = [];

  if (tram > 0) out.push(`${DIGITS[tram]} trăm`);
  else if (full && (chuc > 0 || donvi > 0)) out.push('không trăm');

  if (chuc > 1) {
    out.push(`${DIGITS[chuc]} mươi`);
    // "mốt" thay "một", "tư" thay "bốn", "lăm" thay "năm" sau hàng chục
    if (donvi === 1) out.push('mốt');
    else if (donvi === 4) out.push('tư');
    else if (donvi === 5) out.push('lăm');
    else if (donvi > 0) out.push(DIGITS[donvi]);
  } else if (chuc === 1) {
    out.push('mười');
    if (donvi === 1) out.push('một');
    else if (donvi === 5) out.push('lăm');
    else if (donvi > 0) out.push(DIGITS[donvi]);
  } else if (donvi > 0) {
    // Hàng chục bằng 0 nhưng có hàng đơn vị thì phải chèn "lẻ"
    if (tram > 0 || full) out.push('lẻ');
    out.push(DIGITS[donvi]);
  }

  return out.join(' ');
}

/** Viết hoa chữ cái đầu, phần còn lại giữ nguyên. */
function capitalize(s: string): string {
  return s ? s.charAt(0).toUpperCase() + s.slice(1) : s;
}

/**
 * Đọc số tiền VNĐ thành chữ, có hậu tố "đồng".
 * Số lẻ sau dấu phẩy được làm tròn — tiền Việt không dùng hào xu trên chứng từ.
 */
export function readVndInWords(amount: number | undefined | null, suffix = 'đồng'): string {
  if (amount === null || amount === undefined || !Number.isFinite(amount)) return '';

  const rounded = Math.round(amount);
  if (rounded === 0) return capitalize(`không ${suffix}`);

  const negative = rounded < 0;
  let n = Math.abs(rounded);

  // Vượt quá 4 nhóm (nghìn tỷ trở lên) thì không đọc bừa
  if (n >= 1e12) return '';

  const triples: number[] = [];
  while (n > 0) {
    triples.push(n % 1000);
    n = Math.floor(n / 1000);
  }

  const parts: string[] = [];
  for (let i = triples.length - 1; i >= 0; i -= 1) {
    const value = triples[i];
    // Nhóm rỗng ở giữa thì bỏ qua, không đọc "không nghìn"
    if (value === 0) continue;
    parts.push(readTriple(value, i !== triples.length - 1) + GROUPS[i]);
  }

  const words = parts.join(' ').replace(/\s+/g, ' ').trim();
  return capitalize(`${negative ? 'âm ' : ''}${words} ${suffix}`);
}
