import 'dotenv/config';
import { PrismaClient } from '@prisma/client';

/**
 * Seed "Giới thiệu sản phẩm" cho sản phẩm đang có hàng (máy, phụ tùng, vật tư) mà CHƯA có giới thiệu
 * (không ghi đè nội dung người dùng đã nhập). Trợ lý AI trong Showroom 3D dùng trường này để tư vấn.
 *   npm run db:seed:product-intro
 */
const prisma = new PrismaClient();

const BY_KIND: { match: RegExp; intro: (n: string, brand: string) => string }[] = [
  {
    match: /cà phê|espresso|coffee/i,
    intro: (n, b) =>
      `${n}${b} là lựa chọn chuyên nghiệp cho quán cà phê và chuỗi F&B: chiết xuất espresso ổn định, kiểm soát nhiệt độ chính xác cho crema dày và hương vị đồng đều. Thân máy bền bỉ, vận hành êm, dễ vệ sinh và bảo trì; phù hợp quán vừa và lớn cần phục vụ liên tục giờ cao điểm. Được hỗ trợ lắp đặt, hướng dẫn pha chế và bảo hành chính hãng.`,
  },
  {
    match: /xay|grinder|blender/i,
    intro: (n, b) =>
      `${n}${b} giúp xay / xay sinh tố nhanh, đều hạt, giữ trọn hương vị nguyên liệu. Motor công suất cao, lưỡi dao bền, vận hành ổn định cho cường độ quán F&B; thiết kế dễ tháo lắp vệ sinh. Phù hợp quầy bar cà phê, trà sữa và sinh tố.`,
  },
  {
    match: /kem|ice cream|gelato/i,
    intro: (n, b) =>
      `${n}${b} làm kem / gelato mịn, xốp với tốc độ làm lạnh nhanh và kiểm soát độ cứng chính xác. Buồng làm lạnh bằng inox an toàn thực phẩm, dễ vệ sinh; phù hợp tiệm kem, quán cà phê và nhà hàng muốn tự sản xuất kem tươi.`,
  },
  {
    match: /socola|chocolate/i,
    intro: (n, b) =>
      `${n}${b} chuyên ủ, tôi và giữ ấm socola với nhiệt độ ổn định, cho bề mặt bóng đẹp và kết cấu chuẩn. Phù hợp tiệm bánh, xưởng socola thủ công và quầy tráng miệng.`,
  },
];

function sparePartIntro(it: { name: string; manufacturer: string | null; compatibleWith: string | null; description: string | null; category: string }): string {
  const brand = it.manufacturer ? ` chính hãng ${it.manufacturer}` : '';
  const compat = it.compatibleWith ? ` Tương thích: ${it.compatibleWith}.` : '';
  const spec = (it.description || '').replace(/<!--[\s\S]*?-->/g, '').trim();
  const specLine = spec ? ` Đặc điểm: ${spec.replace(/\s+/g, ' ').slice(0, 220)}.` : '';
  if (it.category === 'CONSUMABLE') {
    return `${it.name}${brand} — vật tư tiêu hao dùng định kỳ cho máy và quầy pha chế, giúp thiết bị vận hành ổn định, đảm bảo vệ sinh an toàn thực phẩm.${specLine}${compat} Luôn có sẵn hàng, giao nhanh và tư vấn chu kỳ thay thế phù hợp với công suất quán.`;
  }
  return `${it.name}${brand} — linh kiện thay thế chất lượng cao giúp máy hoạt động bền bỉ như mới, hạn chế hỏng hóc và thời gian dừng máy.${specLine}${compat} Được kỹ thuật viên tư vấn đúng mã, hỗ trợ lắp đặt và bảo hành theo chính sách.`;
}

async function main() {
  const items = await prisma.inventoryItem.findMany({
    where: {
      status: 'ACTIVE',
      introduction: null,
      stocks: { some: { quantity: { gt: 0 } } },
    },
    select: { id: true, name: true, manufacturer: true, category: true, fnbCategory: true, compatibleWith: true, description: true },
  });
  let n = 0;
  for (const it of items) {
    const brand = it.manufacturer ? ` (${it.manufacturer})` : '';
    const isMachine = it.category === 'MACHINE' || it.category === 'EQUIPMENT' || Boolean(it.fnbCategory);
    const rule = BY_KIND.find((r) => r.match.test(it.name));
    const intro = !isMachine
      ? sparePartIntro(it)
      : rule
      ? rule.intro(it.name, brand)
      : `${it.name}${brand} là thiết bị chuyên dụng cho quán và bếp F&B: vận hành ổn định, tiết kiệm điện, dễ vệ sinh và bảo trì. Được tư vấn lựa chọn theo mô hình kinh doanh, lắp đặt tận nơi và bảo hành chính hãng.`;
    await prisma.inventoryItem.update({ where: { id: it.id }, data: { introduction: intro } });
    n += 1;
  }
  console.log(`Đã thêm giới thiệu cho ${n} sản phẩm (bỏ qua sản phẩm đã có giới thiệu).`);
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
