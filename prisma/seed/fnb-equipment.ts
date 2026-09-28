import 'dotenv/config';
import { PrismaClient } from '@prisma/client';
import { nextSequentialCode } from '../../src/lib/code-sequence';
import selmiOrderParts from './selmi-order-parts.json';
import { assertDemoSeedSchema } from './schema-guard';

/**
 * Sinh mã khách trong seed.
 *
 * Không dùng lại hàm ở customer/service vì file đó kéo theo `server-only` của
 * Next, chạy trong seed là lỗi ngay. Dùng chung nextSequentialCode để khuôn mã
 * vẫn khớp tuyệt đối với lúc chạy thật.
 */
async function nextCustomerCode(prisma: PrismaClient): Promise<string> {
  const prefix = `CUS-${new Date().getFullYear()}-`;
  const rows = await prisma.customer.findMany({
    where: { code: { startsWith: prefix } },
    select: { code: true },
  });
  return nextSequentialCode(prefix, rows.map((r) => r.code));
}

export async function seedDemoFnbEquipment(prisma: PrismaClient, technicianId?: number) {
  await assertDemoSeedSchema(prisma);

  console.log('--- Bắt đầu khởi tạo dữ liệu mẫu Thiết bị & Máy móc F&B ---');

  // 1. Khách hàng chuỗi F&B
  const customersData = [
    {
      code: 'CUST-GG',
      name: 'Công ty CP Tập đoàn Golden Gate (Cổng Vàng)',
      phone: '02473038888',
      email: 'contact@ggg.com.vn',
      taxCode: '0102721191',
      address: 'Tầng 6, Tòa nhà Toyota, 315 Trường Chinh, Thanh Xuân, Hà Nội',
      locations: [
        {
          name: 'Gogi House - Vincom Center Bà Triệu',
          address: 'Tầng 5 Vincom Center, 191 Bà Triệu, Lê Đại Hành, Hai Bà Trưng, Hà Nội',
          managerName: 'Nguyễn Thu Trang',
          phone: '0988123456',
        },
        {
          name: 'Kichi Kichi - Vạn Hạnh Mall',
          address: 'Tầng 5 Vạn Hạnh Mall, 11 Sư Vạn Hạnh, Phường 12, Quận 10, TP.HCM',
          managerName: 'Trần Hoàng Nam',
          phone: '0909654321',
        },
      ],
    },
    {
      code: 'CUST-MAROU',
      name: 'Công ty TNHH Kem & Socola Maison Marou',
      phone: '02839141528',
      email: 'info@marouchocolate.com',
      taxCode: '0311234567',
      address: '167-169 Calmette, Phường Nguyễn Thái Bình, Quận 1, TP.HCM',
      locations: [
        {
          name: 'Maison Marou Cafe Saigon',
          address: '167-169 Calmette, Phường Nguyễn Thái Bình, Quận 1, TP.HCM',
          managerName: 'Lê Văn Phúc',
          phone: '0912334455',
        },
        {
          name: 'Maison Marou Flagship Hà Nội',
          address: '91A Thợ Nhuộm, Hoàn Kiếm, Hà Nội',
          managerName: 'Đỗ Minh Khang',
          phone: '0977889900',
        },
      ],
    },
    {
      code: 'CUST-TLJ',
      name: 'Công ty CP Bánh ngọt & Tráng miệng Tous les Jours Việt Nam',
      phone: '02838272772',
      email: 'cskh@touslesjours.com.vn',
      taxCode: '0304556677',
      address: '180 Hai Bà Trưng, Phường Đa Kao, Quận 1, TP.HCM',
      locations: [
        {
          name: 'Tous les Jours - Hai Bà Trưng',
          address: '180 Hai Bà Trưng, Phường Đa Kao, Quận 1, TP.HCM',
          managerName: 'Phạm Thu Hà',
          phone: '0933221144',
        },
      ],
    },
    {
      code: 'CUST-PL',
      name: 'Công ty CP Trà & Cà phê Phúc Long',
      phone: '1900234518',
      email: 'info@phuclong.masangroup.com',
      taxCode: '0302789123',
      address: 'Phòng 702, Tầng 7, Tòa nhà Central Plaza, 17 Lê Duẩn, Bến Nghé, Quận 1, TP.HCM',
      locations: [
        {
          name: 'Phúc Long Premium - Landmark 81',
          address: 'Tầng trệt Landmark 81, Vinhomes Central Park, 720A Điện Biên Phủ, Bình Thạnh, TP.HCM',
          managerName: 'Vũ Hải Đăng',
          phone: '0945678901',
        },
      ],
    },
  ];

  const customerMap = new Map<string, { id: number; locationMap: Map<string, number> }>();

  for (const cData of customersData) {
    /**
     * Nhận diện khách bằng TÊN, không bằng mã.
     *
     * Mã khách đã chuyển sang khuôn CUS-YYYY-XXXX sinh tự động, nên mã cứng
     * trong seed (CUST-GG…) không còn khớp dữ liệu thật. Dò theo mã sẽ không
     * thấy và tạo thêm một bản ghi trùng cho cùng một doanh nghiệp.
     */
    let customer = await prisma.customer.findFirst({ where: { name: cData.name } });
    if (!customer) {
      customer = await prisma.customer.create({
        data: {
          code: await nextCustomerCode(prisma),
          name: cData.name,
          phone: cData.phone,
          email: cData.email,
          notes: cData.taxCode ? `MST: ${cData.taxCode}` : undefined,
          address: cData.address,
          status: 'ACTIVE',
        },
      });
    }

    const locMap = new Map<string, number>();
    for (const locData of cData.locations) {
      let loc = await prisma.customerLocation.findFirst({
        where: { customerId: customer.id, name: locData.name },
      });
      if (!loc) {
        loc = await prisma.customerLocation.create({
          data: {
            customerId: customer.id,
            name: locData.name,
            address: locData.address,
            managerName: locData.managerName,
            phone: locData.phone,
          },
        });
      }
      locMap.set(locData.name, loc.id);
    }

    // Khóa map là mã cứng trong mảng seed, chỉ dùng để tra nội bộ bên dưới —
    // không còn là mã lưu xuống cơ sở dữ liệu
    customerMap.set(cData.code, { id: customer.id, locationMap: locMap });
  }

  console.log(`→ Khách hàng & Điểm lắp đặt : ${customerMap.size} chuỗi khách hàng`);

  // 2. Thiết bị & Máy móc F&B
  const gg = customerMap.get('CUST-GG');
  const marou = customerMap.get('CUST-MAROU');
  const tlj = customerMap.get('CUST-TLJ');
  const pl = customerMap.get('CUST-PL');

  const equipmentList = [
    // 1. Máy làm kem tươi cao cấp Taylor C708
    {
      machineCode: 'EQ-2026-0001',
      name: 'Máy làm kem tươi Taylor C708 (Công nghệ giữ tươi ban đêm)',
      serialNumber: 'TYL-C708-VN8892',
      category: 'ICE_CREAM_MACHINE',
      brand: 'Taylor (Hoa Kỳ)',
      model: 'C708',
      ownershipType: 'RENTAL',
      status: 'OPERATING',
      customerId: gg?.id,
      locationId: gg?.locationMap.get('Gogi House - Vincom Center Bà Triệu'),
      installedDate: new Date('2025-10-15'),
      warrantyExpiresAt: new Date('2027-10-15'),
      lastPmDate: new Date('2026-08-10'),
      nextPmDate: new Date('2026-11-10'),
      notes: 'Máy vận hành tại quầy tráng miệng. Đã kích hoạt bơm tăng xốp và chế độ giữ lạnh qua đêm, không cần rút kem xả bồn hàng ngày.',
      specs: {
        iceCream: {
          machineType: 'Soft-Serve để bàn 1 vòi cao cấp',
          flavorCount: '1 vị (Vani Madagascar)',
          capacityPerHour: '38 Lít/giờ (~350 cây kem/h)',
          cylinderCapacity: '3.2 Lít',
          hopperCapacity: '18.9 Lít',
          compressor: 'Embraco Aspera 1.5HP (Ý)',
          refrigerant: 'R404A',
          powerWatts: '2800W',
          voltage: '220V / 50Hz / 1 Pha',
          coolingType: 'Làm mát bằng gió (Air Cooled)',
          preCooling: true,
          airPump: true,
        },
        dimensions: '464 x 822 x 864 mm',
        weightKg: '145',
        madeIn: 'Hoa Kỳ (USA)',
      },
    },

    // 2. Máy làm kem Gelato Carpigiani Labo
    {
      machineCode: 'EQ-2026-0002',
      name: 'Máy làm kem Gelato Carpigiani Labo 14 20 M',
      serialNumber: 'CPG-LB14-9921',
      category: 'ICE_CREAM_MACHINE',
      brand: 'Carpigiani (Ý)',
      model: 'Labo 14 20 M',
      ownershipType: 'SOLD',
      status: 'OPERATING',
      customerId: tlj?.id,
      locationId: tlj?.locationMap.get('Tous les Jours - Hai Bà Trưng'),
      installedDate: new Date('2025-11-20'),
      warrantyExpiresAt: new Date('2026-11-20'),
      lastPmDate: new Date('2026-07-15'),
      nextPmDate: new Date('2026-10-15'),
      notes: 'Máy làm kem mẻ thủ công Gelato cao cấp, sản xuất trực tiếp mỗi ngày tại xưởng bánh.',
      specs: {
        iceCream: {
          machineType: 'Batch Freezer làm kem Gelato cối đứng',
          flavorCount: 'Làm mẻ Gelato thủ công',
          capacityPerHour: '20 kg/giờ (3-4 mẻ/giờ)',
          cylinderCapacity: '4 Lít / mẻ',
          hopperCapacity: '5 Lít',
          compressor: 'Danfoss Maneurop 2HP (Pháp)',
          refrigerant: 'R404A',
          powerWatts: '3200W',
          voltage: '380V / 50Hz / 3 Pha',
          coolingType: 'Làm mát bằng nước (Water Cooled)',
          preCooling: false,
          airPump: false,
        },
        dimensions: '440 x 720 x 1200 mm',
        weightKg: '190',
        madeIn: 'Ý (Italy)',
      },
    },

    // 3. Máy tôi socola Selmi Plus EX
    {
      machineCode: 'EQ-2026-0003',
      name: 'Máy gia nhiệt & Tôi Socola tự động Selmi Plus EX',
      serialNumber: 'SLM-PEX-202603',
      category: 'CHOCOLATE_MACHINE',
      brand: 'Selmi (Ý)',
      model: 'Plus EX',
      ownershipType: 'SOLD',
      status: 'OPERATING',
      customerId: marou?.id,
      locationId: marou?.locationMap.get('Maison Marou Cafe Saigon'),
      installedDate: new Date('2025-06-10'),
      warrantyExpiresAt: new Date('2027-06-10'),
      lastPmDate: new Date('2026-06-10'),
      nextPmDate: new Date('2026-12-10'),
      notes: 'Trang bị kèm bàn rung nhiệt loại bỏ bọt khí khuôn socola thanh 70% Dark Chocolate.',
      specs: {
        chocolate: {
          machineType: 'Continuous Tempering (Tôi socola liên tục)',
          tankCapacityKg: '24 kg',
          outputPerHourKg: '90 kg/h',
          tempRange: '20°C - 60°C (±0.1°C)',
          heatingMethod: 'Gia nhiệt cách thủy tuần hoàn cưỡng bức',
          hasFootPedal: true,
          powerWatts: '1600W',
          voltage: '380V / 50Hz / 3 Pha',
          materialGrade: 'Inox 316 chuẩn dược - thực phẩm cao cấp',
        },
        dimensions: '510 x 740 x 1470 mm',
        weightKg: '110',
        madeIn: 'Ý (Italy)',
      },
    },

    // 4. Máy phủ & rót socola FBM Prima (Đang báo hỏng)
    {
      machineCode: 'EQ-2026-0004',
      name: 'Máy nấu chảy & Phủ Socola FBM Prima Enrober',
      serialNumber: 'FBM-PRM-8834',
      category: 'CHOCOLATE_MACHINE',
      brand: 'FBM (Ý)',
      model: 'Prima',
      ownershipType: 'CONSIGNMENT',
      status: 'BREAKDOWN',
      customerId: marou?.id,
      locationId: marou?.locationMap.get('Maison Marou Flagship Hà Nội'),
      installedDate: new Date('2025-09-01'),
      warrantyExpiresAt: new Date('2026-09-01'),
      lastPmDate: new Date('2026-05-15'),
      nextPmDate: new Date('2026-08-15'),
      notes: 'Đang báo mã lỗi E02 (Lỗi cảm biến nhiệt độ bồn nấu). Quán không duy trì được nhiệt độ 31.5°C của socola khiến socola bị đông đặc vón cục.',
      specs: {
        chocolate: {
          machineType: 'Melting & Enrobing (Nấu chảy và phủ socola)',
          tankCapacityKg: '10 kg',
          outputPerHourKg: '35 kg/h',
          tempRange: '30°C - 55°C',
          heatingMethod: 'Thanh nhiệt điện trở bọc bảo ôn',
          hasFootPedal: true,
          powerWatts: '1200W',
          voltage: '220V / 50Hz',
          materialGrade: 'Inox 304',
        },
        dimensions: '480 x 600 x 920 mm',
        weightKg: '68',
        madeIn: 'Ý (Italy)',
      },
    },

    // 5. Máy pha cafe La Marzocco Linea PB (Đang bảo dưỡng)
    {
      machineCode: 'EQ-2026-0005',
      name: 'Máy pha cà phê chuyên nghiệp La Marzocco Linea PB 2 Group',
      serialNumber: 'LM-PB2G-9844',
      category: 'BEVERAGE_BAR',
      brand: 'La Marzocco (Ý)',
      model: 'Linea PB 2 Group',
      ownershipType: 'RENTAL',
      status: 'UNDER_MAINTENANCE',
      customerId: pl?.id,
      locationId: pl?.locationMap.get('Phúc Long Premium - Landmark 81'),
      installedDate: new Date('2025-08-01'),
      warrantyExpiresAt: new Date('2027-08-01'),
      lastPmDate: new Date('2026-06-20'),
      nextPmDate: new Date('2026-09-20'),
      notes: 'Kỹ thuật viên đang tẩy cặn canxi lò hơi và thay roong cao su silicone họng pha.',
      specs: {
        kitchen: {
          equipmentType: 'Máy pha cà phê Espresso 2 họng (Dual Boiler)',
          powerType: 'Điện',
          capacity: '2 Group Head, Nồi hơi cafe 3.4L, Nồi hơi nước sôi 7L',
          powerKw: '4.6 kW',
          voltage: '220V / 50Hz',
          tempRange: '88°C - 96°C (PID kép)',
        },
        dimensions: '710 x 590 x 533 mm',
        weightKg: '61',
        madeIn: 'Ý (Italy)',
      },
    },

    // 6. Máy làm kem tươi Donper D840P (Lưu kho dự phòng)
    {
      machineCode: 'EQ-2026-0006',
      name: 'Máy làm kem tươi Donper D840P (Lưu kho dự phòng)',
      serialNumber: 'DNP-D840-7712',
      category: 'ICE_CREAM_MACHINE',
      brand: 'Donper',
      model: 'D840P',
      ownershipType: 'SOLD',
      status: 'IN_STOCK',
      customerId: null,
      locationId: null,
      installedDate: null,
      warrantyExpiresAt: new Date('2027-12-31'),
      lastPmDate: null,
      nextPmDate: null,
      notes: 'Máy mới 100% trong thùng gỗ tại kho, sẵn sàng xuất ứng cứu khi khách hàng chuỗi gặp sự cố lớn.',
      specs: {
        iceCream: {
          machineType: 'Máy kem tươi 3 vòi (2 vị + 1 mix)',
          flavorCount: '2 vị + 1 hỗn hợp',
          capacityPerHour: '40 Lít/giờ',
          cylinderCapacity: '2.0 Lít x 2',
          hopperCapacity: '9.5 Lít x 2',
          compressor: 'Embraco Aspera 1.75HP',
          refrigerant: 'R410A',
          powerWatts: '2900W',
          voltage: '220V / 50Hz',
          coolingType: 'Làm mát bằng gió',
          preCooling: true,
          airPump: true,
        },
        dimensions: '540 x 780 x 1400 mm',
        weightKg: '165',
        madeIn: 'Donper OEM',
      },
    },

    // 7. Máy làm đá viên Hoshizaki
    {
      machineCode: 'EQ-2026-0007',
      name: 'Máy làm đá viên vuông cao cấp Hoshizaki IM-100CNE',
      serialNumber: 'HSZ-IM100-5521',
      category: 'KITCHEN_COLD',
      brand: 'Hoshizaki (Nhật Bản)',
      model: 'IM-100CNE',
      ownershipType: 'RENTAL',
      status: 'OPERATING',
      customerId: gg?.id,
      locationId: gg?.locationMap.get('Kichi Kichi - Vạn Hạnh Mall'),
      installedDate: new Date('2025-12-01'),
      warrantyExpiresAt: new Date('2027-12-01'),
      lastPmDate: new Date('2026-08-01'),
      nextPmDate: new Date('2026-11-01'),
      notes: 'Đá viên vuông pha chế trong suốt, không lẫn bọt khí. Đạt chuẩn vệ sinh thực phẩm HACCP quốc tế.',
      specs: {
        kitchen: {
          equipmentType: 'Máy làm đá viên tinh khiết (Cube Ice)',
          powerType: 'Điện',
          capacity: 'Năng suất 95 kg/24h, Thùng chứa 38 kg',
          powerKw: '0.63 kW',
          voltage: '220V / 50Hz',
          tempRange: '-20°C (Buồng đóng băng)',
        },
        dimensions: '1004 x 600 x 800 mm',
        weightKg: '77',
        madeIn: 'Nhật Bản / Anh (UK)',
      },
    },

    // 8. Lò nướng đối lưu Unox Combi
    {
      machineCode: 'EQ-2026-0008',
      name: 'Lò nướng đối lưu Combi Unox Cheftop Mind.Maps Plus 7 khay',
      serialNumber: 'UNX-CT07-3319',
      category: 'KITCHEN_HOT',
      brand: 'Unox (Ý)',
      model: 'XEVC-0711-EPR',
      ownershipType: 'SOLD',
      status: 'OPERATING',
      customerId: tlj?.id,
      locationId: tlj?.locationMap.get('Tous les Jours - Hai Bà Trưng'),
      installedDate: new Date('2025-07-20'),
      warrantyExpiresAt: new Date('2026-07-20'),
      lastPmDate: new Date('2026-07-10'),
      nextPmDate: new Date('2026-10-10'),
      notes: 'Lò nướng bánh chuyên dụng kết hợp hấp và nướng đối lưu kỹ thuật số.',
      specs: {
        kitchen: {
          equipmentType: 'Lò nướng Combi 7 khay GN 1/1',
          powerType: 'Điện',
          capacity: '7 khay GN 1/1 (530 x 325 mm)',
          powerKw: '9.9 kW',
          voltage: '380V / 50Hz / 3 Pha',
          tempRange: '30°C - 260°C',
        },
        dimensions: '750 x 783 x 843 mm',
        weightKg: '86',
        madeIn: 'Ý (Italy)',
      },
    },
  ];

  const createdEquipmentMap = new Map<string, number>();

  for (const eq of equipmentList) {
    const existing = await prisma.fnbEquipment.findUnique({
      where: { machineCode: eq.machineCode },
    });

    if (existing) {
      const updated = await prisma.fnbEquipment.update({
        where: { id: existing.id },
        data: eq,
      });
      createdEquipmentMap.set(eq.machineCode, updated.id);
    } else {
      const created = await prisma.fnbEquipment.create({
        data: eq,
      });
      createdEquipmentMap.set(eq.machineCode, created.id);
    }
  }

  console.log(`→ Thiết bị & Máy móc F&B   : ${createdEquipmentMap.size} máy (Kem, Socola, Bếp, Bar)`);

  // 3. Phiếu Báo hỏng & Dịch vụ Kỹ thuật Hiện trường (Service Tickets)
  const eqBreakdownId = createdEquipmentMap.get('EQ-2026-0004');
  const eqMaintenanceId = createdEquipmentMap.get('EQ-2026-0005');

  if (eqBreakdownId) {
    const ticket1Code = 'TICK-2026-0001';
    const existingTicket1 = await prisma.serviceTicket.findUnique({ where: { ticketCode: ticket1Code } });
    if (!existingTicket1) {
      await prisma.serviceTicket.create({
        data: {
          ticketCode: ticket1Code,
          equipmentId: eqBreakdownId,
          customerId: marou?.id,
          locationId: marou?.locationMap.get('Maison Marou Flagship Hà Nội'),
          priority: 'CRITICAL',
          title: 'Sự cố khẩn cấp: Máy socola FBM Prima báo lỗi cảm biến E02',
          description: 'Máy socola tại quầy không duy trì được nhiệt độ 31.5°C, màn hình chớp tắt báo mã lỗi E02 (Sensor / Overheat Fault). Socola trong bồn bắt đầu đông đặc vón cục. Yêu cầu kỹ thuật viên kiểm tra và xử lý sớm.',
          reportedBy: 'Đỗ Minh Khang (Quản lý quán)',
          reportedPhone: '0977889900',
          assignedToId: technicianId || null,
          status: 'IN_PROGRESS',
        },
      });
    }
  }

  if (eqMaintenanceId) {
    const ticket2Code = 'TICK-2026-0002';
    const existingTicket2 = await prisma.serviceTicket.findUnique({ where: { ticketCode: ticket2Code } });
    if (!existingTicket2) {
      await prisma.serviceTicket.create({
        data: {
          ticketCode: ticket2Code,
          equipmentId: eqMaintenanceId,
          customerId: pl?.id,
          locationId: pl?.locationMap.get('Phúc Long Premium - Landmark 81'),
          priority: 'MEDIUM',
          title: 'Bảo dưỡng định kỳ Quý 3/2026 - Tẩy cặn lò hơi & thay seal họng pha',
          description: 'Thực hiện bảo trì 3 tháng/lần theo hợp đồng cho thuê: vệ sinh van 3 ngã, thay gioăng cao su silicone 8.5mm, tẩy cặn canxi lò hơi đánh sữa.',
          reportedBy: 'Hệ thống tự động lên lịch PM',
          reportedPhone: '1900234518',
          assignedToId: technicianId || null,
          status: 'RESOLVED',
          resolutionNote: 'Đã hoàn tất tẩy cặn, áp suất ổn định ở mức 9 bar, nước ra đều nhiệt độ 93.5°C. Quán đã nghiệm thu ký biên bản bàn giao kỹ thuật.',
          resolvedAt: new Date('2026-09-19T11:30:00'),
          rating: 5,
        },
      });
    }
  }

  console.log('→ Phiếu Báo hỏng (Tickets) : 2 phiếu (1 Khẩn cấp, 1 Đã hoàn tất)');

  // 4. Kho & Linh kiện Phụ tùng (Warehouses & Spare Parts)
  const whHn = await prisma.warehouse.upsert({
    where: { code: 'WH-HN' },
    update: {},
    create: {
      code: 'WH-HN',
      name: 'Kho Kỹ thuật & Phụ tùng Miền Bắc (Hà Nội)',
      type: 'CENTRAL',
      address: 'Số 48 Ngõ 120 Trần Duy Hưng, Cầu Giấy, Hà Nội',
      status: 'ACTIVE',
    },
  });

  const whHcm = await prisma.warehouse.upsert({
    where: { code: 'WH-HCM' },
    update: {},
    create: {
      code: 'WH-HCM',
      name: 'Kho Kỹ thuật & Phụ tùng Miền Nam (TP.HCM)',
      type: 'CENTRAL',
      address: 'Số 12 Đường Số 7, KDC Cityland Center Hills, Gò Vấp, TP.HCM',
      status: 'ACTIVE',
    },
  });

  const spareParts = [
    {
      itemCode: 'PART-TYL-BLADE',
      name: 'Bộ lưỡi dao gạt lòng xi lanh máy kem Taylor (Bộ 4 chiếc)',
      category: 'SPARE_PART',
      unit: 'Bộ',
      compatibleWith: 'Taylor C708, C712, C713, C723',
      minStockAlert: 5,
      costPrice: 2800000,
      sellingPrice: 3800000,
      hnQty: 12,
      hcmQty: 18,
    },
    {
      itemCode: 'PART-ORING-SILICONE',
      name: 'Bộ gioăng cao su O-Ring silicone chịu nhiệt máy làm kem tươi',
      category: 'CONSUMABLE',
      unit: 'Bộ',
      compatibleWith: 'Taylor, Donper, Carpigiani',
      minStockAlert: 15,
      costPrice: 450000,
      sellingPrice: 680000,
      hnQty: 8, // < minStockAlert (Cảnh báo tồn kho thấp!)
      hcmQty: 4, // < minStockAlert (Cảnh báo tồn kho thấp!)
    },
    {
      itemCode: 'PART-TEMP-PT100',
      name: 'Cảm biến nhiệt độ PT100 độ chính xác cao bồn socola',
      category: 'SPARE_PART',
      unit: 'Cái',
      compatibleWith: 'Selmi Plus EX, FBM Prima, Gami',
      minStockAlert: 5,
      costPrice: 1950000,
      sellingPrice: 2800000,
      hnQty: 2, // < minStockAlert (Cảnh báo tồn kho thấp!)
      hcmQty: 1, // < minStockAlert (Cảnh báo tồn kho thấp!)
    },
    {
      itemCode: 'PART-AIR-PUMP',
      name: 'Cụm bơm tăng xốp nguyên liệu (Air Pump Assembly)',
      category: 'SPARE_PART',
      unit: 'Cụm',
      compatibleWith: 'Taylor C708, Donper D840P',
      minStockAlert: 3,
      costPrice: 6500000,
      sellingPrice: 8900000,
      hnQty: 4,
      hcmQty: 6,
    },
    {
      itemCode: 'PART-VALVE-3WAY',
      name: 'Van điện từ Solenoid 3-way ODE Italy 230V máy cafe',
      category: 'SPARE_PART',
      unit: 'Cái',
      compatibleWith: 'La Marzocco Linea, Nuova Simonelli, Faema',
      minStockAlert: 8,
      costPrice: 1350000,
      sellingPrice: 1950000,
      hnQty: 10,
      hcmQty: 15,
    },
    {
      itemCode: 'PART-PUMP-PROCON',
      name: 'Bơm áp lực nước Procon 230V 100L/h họng pha cafe',
      category: 'SPARE_PART',
      unit: 'Cái',
      compatibleWith: 'La Marzocco, Synesso, Slayer',
      minStockAlert: 4,
      costPrice: 3200000,
      sellingPrice: 4600000,
      hnQty: 5,
      hcmQty: 7,
    },
    {
      itemCode: 'PART-HEATER-UNOX',
      name: 'Thanh điện trở vòng nhiệt lò nướng đối lưu Unox 3300W',
      category: 'SPARE_PART',
      unit: 'Thanh',
      compatibleWith: 'Unox Cheftop, Bakerlux Shop.Pro',
      minStockAlert: 3,
      costPrice: 2450000,
      sellingPrice: 3500000,
      hnQty: 1, // < minStockAlert (Cảnh báo tồn kho thấp!)
      hcmQty: 2,
    },
    {
      itemCode: 'PART-FILTER-WATER',
      name: 'Lõi lọc tinh chuyên dụng máy pha cafe Pentair Everpure 4CB5',
      category: 'CONSUMABLE',
      unit: 'Cây',
      compatibleWith: 'Tất cả các dòng máy pha Espresso',
      minStockAlert: 20,
      costPrice: 1400000,
      sellingPrice: 1950000,
      hnQty: 25,
      hcmQty: 30,
    },
    ...selmiOrderParts,
  ];

  const partItemMap = new Map<string, number>();

  for (const part of spareParts) {
    const { hnQty, hcmQty, ...itemData } = part;
    const item = await prisma.inventoryItem.upsert({
      where: { itemCode: itemData.itemCode },
      update: itemData,
      create: itemData,
    });
    partItemMap.set(part.itemCode, item.id);

    await prisma.inventoryStock.upsert({
      where: { warehouseId_itemId: { warehouseId: whHn.id, itemId: item.id } },
      update: { quantity: hnQty },
      create: { warehouseId: whHn.id, itemId: item.id, quantity: hnQty },
    });

    await prisma.inventoryStock.upsert({
      where: { warehouseId_itemId: { warehouseId: whHcm.id, itemId: item.id } },
      update: { quantity: hcmQty },
      create: { warehouseId: whHcm.id, itemId: item.id, quantity: hcmQty },
    });
  }

  console.log(`→ Kho & Phụ tùng thay thế  : 2 kho, ${spareParts.length} mã linh kiện (bao gồm mã cảnh báo tồn kho thấp)`);

  // 5. Đơn hàng nhập khẩu nhà cung cấp (Purchase Orders - PO)
  const po1Code = 'PO-2026-0001';
  let po1 = await prisma.sparePartOrder.findUnique({ where: { orderCode: po1Code } });
  if (!po1) {
    po1 = await prisma.sparePartOrder.create({
      data: {
        orderCode: po1Code,
        supplier: 'Taylor Company (USA)',
        status: 'SHIPPING_INTL',
        currency: 'USD',
        exchangeRate: 25400,
        shippingFee: 6500000,
        customsFee: 2200000,
        totalItemsQty: 20,
        subtotalVnd: 56000000,
        totalVnd: 64700000,
        paidAmount: 32000000, // Đã đặt cọc 50%
        trackingNumber: 'DHL-EXPRESS-992817261',
        etaDate: new Date(Date.now() + 5 * 86400000),
        targetWarehouseId: whHcm.id,
        notes: 'Lô linh kiện dao gạt và bơm tăng xốp máy kem Taylor về cảng Cát Lái',
        createdById: technicianId || 1,
      },
    });

    const tylBladeId = partItemMap.get('PART-TYL-BLADE');
    const airPumpId = partItemMap.get('PART-AIR-PUMP');
    if (tylBladeId && airPumpId) {
      await prisma.sparePartOrderItem.createMany({
        data: [
          {
            orderId: po1.id,
            itemId: tylBladeId,
            quantity: 10,
            unitPriceEur: 110,
            unitPriceVnd: 2800000,
            discountVnd: 0,
            finalPriceVnd: 28000000,
          },
          {
            orderId: po1.id,
            itemId: airPumpId,
            quantity: 10,
            unitPriceEur: 255,
            unitPriceVnd: 2800000,
            discountVnd: 0,
            finalPriceVnd: 28000000,
          },
        ],
        skipDuplicates: true,
      });
    }
  }

  const po2Code = 'PO-2026-0002';
  let po2 = await prisma.sparePartOrder.findUnique({ where: { orderCode: po2Code } });
  if (!po2) {
    po2 = await prisma.sparePartOrder.create({
      data: {
        orderCode: po2Code,
        supplier: 'Selmi Group Italy',
        status: 'CUSTOMS_CLEARING',
        currency: 'EUR',
        exchangeRate: 27800,
        shippingFee: 4500000,
        customsFee: 1800000,
        totalItemsQty: 10,
        subtotalVnd: 38000000,
        totalVnd: 44300000,
        paidAmount: 44300000, // Đã thanh toán 100%
        trackingNumber: 'FEDEX-IT-882711029',
        etaDate: new Date(Date.now() + 2 * 86400000),
        targetWarehouseId: whHn.id,
        notes: 'Cảm biến nhiệt độ PT100 và bo mạch điều khiển máy socola',
        createdById: technicianId || 1,
      },
    });

    const pt100Id = partItemMap.get('PART-TEMP-PT100');
    const powerBoardId = partItemMap.get('COMMSESPMIC____000001');
    if (pt100Id && powerBoardId) {
      await prisma.sparePartOrderItem.createMany({
        data: [
          {
            orderId: po2.id,
            itemId: pt100Id,
            quantity: 6,
            unitPriceEur: 70,
            unitPriceVnd: 1950000,
            discountVnd: 0,
            finalPriceVnd: 11700000,
          },
          {
            orderId: po2.id,
            itemId: powerBoardId,
            quantity: 4,
            unitPriceEur: 487.5,
            unitPriceVnd: 6575000,
            discountVnd: 0,
            finalPriceVnd: 26300000,
          },
        ],
        skipDuplicates: true,
      });
    }
  }

  // 6. Báo Giá & Đơn Bán Hàng Khách Hàng (Quotations, Orders & Payments)
  const quote1Code = 'BG-2026-0001';
  let quote1 = await prisma.customerQuotation.findUnique({ where: { quoteCode: quote1Code } });
  if (!quote1 && pl) {
    quote1 = await prisma.customerQuotation.create({
      data: {
        quoteCode: quote1Code,
        customerId: pl.id,
        locationId: pl.locationMap.get('Phúc Long Premium - Landmark 81'),
        status: 'ACCEPTED',
        subtotal: 185000000,
        vatRate: 8,
        vatAmount: 14800000,
        totalAmount: 199800000,
        paymentTerms: 'Đặt cọc 40% khi ký hợp đồng, 60% sau khi bàn giao nghiệm thu',
        deliveryTime: '3 ngày kể từ ngày đặt cọc',
        warrantyTerms: 'Bảo hành 24 tháng chính hãng, bảo dưỡng định kỳ 3 tháng/lần',
        notes: 'Báo giá cung cấp gói thiết bị quầy bar và máy pha cà phê cao cấp',
      },
    });

    await prisma.customerQuotationItem.createMany({
      data: [
        {
          quotationId: quote1.id,
          itemType: 'EQUIPMENT',
          name: 'Máy pha cà phê La Marzocco Linea PB 2 Group',
          quantity: 1,
          unitPrice: 175000000,
          totalPrice: 175000000,
        },
        {
          quotationId: quote1.id,
          itemType: 'SERVICE',
          name: 'Gói lắp đặt cân chỉnh áp suất và đào tạo Barista vận hành',
          quantity: 1,
          unitPrice: 10000000,
          totalPrice: 10000000,
        },
      ],
      skipDuplicates: true,
    });
  }

  const quote2Code = 'BG-2026-0002';
  let quote2 = await prisma.customerQuotation.findUnique({ where: { quoteCode: quote2Code } });
  if (!quote2 && gg) {
    quote2 = await prisma.customerQuotation.create({
      data: {
        quoteCode: quote2Code,
        customerId: gg.id,
        locationId: gg.locationMap.get('Gogi House - Vincom Center Bà Triệu'),
        status: 'SENT',
        subtotal: 42000000,
        vatRate: 8,
        vatAmount: 3360000,
        totalAmount: 45360000,
        paymentTerms: 'Thanh toán 100% trong vòng 15 ngày kể từ ngày nhận hàng',
        deliveryTime: 'Giao ngay từ kho Hà Nội',
        warrantyTerms: 'Bảo hành linh kiện 6 tháng theo tiêu chuẩn nhà sản xuất',
        notes: 'Báo giá lô phụ tùng bảo dưỡng định kỳ máy làm kem Taylor',
      },
    });
  }

  // Đơn hàng bán ORD-2026-0001 (Phúc Long Landmark 81 - Đã thu đủ)
  const ord1Code = 'ORD-2026-0001';
  let ord1 = await prisma.customerOrder.findUnique({ where: { orderCode: ord1Code } });
  if (!ord1 && pl) {
    ord1 = await prisma.customerOrder.create({
      data: {
        orderCode: ord1Code,
        customerId: pl.id,
        locationId: pl.locationMap.get('Phúc Long Premium - Landmark 81'),
        orderType: 'MACHINE_PURCHASE',
        status: 'COMPLETED',
        goodsAmount: 185000000,
        shippingFee: 0,
        vatRate: 8,
        vatAmount: 14800000,
        totalAmount: 199800000,
        paidAmount: 199800000, // Đã thu 100%
        orderDate: new Date(Date.now() - 20 * 86400000),
        deliveryDate: new Date(Date.now() - 17 * 86400000),
        invoiceNo: '0001289',
        invoiceSerial: '1C26TAA',
        notes: 'Đã bàn giao lắp đặt hoàn tất tại quầy Bar tầng trệt Landmark 81',
      },
    });

    // Phiếu thu tiền
    await prisma.customerPayment.upsert({
      where: { paymentCode: 'TT-2026-0001' },
      update: {},
      create: {
        paymentCode: 'TT-2026-0001',
        customerId: pl.id,
        orderId: ord1.id,
        amount: 199800000,
        method: 'TRANSFER',
        paidAt: new Date(Date.now() - 15 * 86400000),
        reference: 'UNC-VCB-998124',
        note: 'Phúc Long thanh toán tiền máy pha cafe Linea PB',
      },
    });
  }

  if (ord1) {
    const existingItems1 = await prisma.customerOrderItem.count({ where: { orderId: ord1.id } });
    if (existingItems1 === 0) {
      await prisma.customerOrderItem.createMany({
        data: [
          {
            orderId: ord1.id,
            itemType: 'EQUIPMENT',
            name: 'Máy pha cà phê chuyên nghiệp La Marzocco Linea PB 2 Group',
            quantity: 1,
            unitPrice: 175000000,
            totalPrice: 175000000,
            equipmentId: createdEquipmentMap.get('EQ-2026-0005'),
            notes: 'Máy pha cà phê 2 Group Head Dual Boiler nhập khẩu Ý',
          },
          {
            orderId: ord1.id,
            itemType: 'SPARE_PART',
            name: 'Hệ thống xử lý nước & lọc canxi BWT Bestmax Premium 2XL',
            quantity: 1,
            unitPrice: 10000000,
            totalPrice: 10000000,
            notes: 'Hệ thống lọc nước chuyên dụng cho máy pha cafe espresso',
          },
        ],
      });
    }
  }

  // Đơn hàng bán ORD-2026-0002 (Golden Gate - Còn nợ công nợ)
  const ord2Code = 'ORD-2026-0002';
  let ord2 = await prisma.customerOrder.findUnique({ where: { orderCode: ord2Code } });
  if (!ord2 && gg) {
    ord2 = await prisma.customerOrder.create({
      data: {
        orderCode: ord2Code,
        customerId: gg.id,
        locationId: gg.locationMap.get('Kichi Kichi - Vạn Hạnh Mall'),
        orderType: 'RENTAL',
        status: 'DELIVERED',
        goodsAmount: 68000000,
        shippingFee: 1500000,
        vatRate: 8,
        vatAmount: 5560000,
        totalAmount: 75060000,
        paidAmount: 35000000, // Đã đặt cọc 35 triệu, CÒN NỢ 40.060.000 ₫
        orderDate: new Date(Date.now() - 7 * 86400000),
        dueDate: new Date(Date.now() + 10 * 86400000),
        notes: 'Thuê máy làm đá viên Hoshizaki 100 kg/24h kèm phụ tùng bảo dưỡng',
      },
    });

    await prisma.customerPayment.upsert({
      where: { paymentCode: 'TT-2026-0002' },
      update: {},
      create: {
        paymentCode: 'TT-2026-0002',
        customerId: gg.id,
        orderId: ord2.id,
        amount: 35000000,
        method: 'TRANSFER',
        paidAt: new Date(Date.now() - 5 * 86400000),
        reference: 'TCB-TRANS-77124',
        note: 'Golden Gate đặt cọc đợt 1 tiền thuê thiết bị',
      },
    });
  }

  if (ord2) {
    const existingItems2 = await prisma.customerOrderItem.count({ where: { orderId: ord2.id } });
    if (existingItems2 === 0) {
      await prisma.customerOrderItem.createMany({
        data: [
          {
            orderId: ord2.id,
            itemType: 'EQUIPMENT',
            name: 'Máy làm đá viên vuông cao cấp Hoshizaki IM-100CNE (Gói thuê 6 tháng)',
            quantity: 1,
            unitPrice: 58000000,
            totalPrice: 58000000,
            equipmentId: createdEquipmentMap.get('EQ-2026-0007'),
            notes: 'Thuê máy làm đá viên 100kg/24h đặt tại Kichi Kichi Vạn Hạnh Mall',
          },
          {
            orderId: ord2.id,
            itemType: 'SPARE_PART',
            name: 'Bộ lõi lọc nước thô & khử cặn Hoshizaki 4HC-H (2 lõi)',
            quantity: 2,
            unitPrice: 3200000,
            totalPrice: 6400000,
            notes: 'Lõi lọc nước thay định kỳ 6 tháng',
          },
          {
            orderId: ord2.id,
            itemType: 'SERVICE',
            name: 'Dịch vụ vận chuyển, lắp đặt đường ống cấp thoát nước & hiệu chỉnh máy',
            quantity: 1,
            unitPrice: 3600000,
            totalPrice: 3600000,
            notes: 'Bàn giao kỹ thuật và hướng dẫn vận hành quầy Bar',
          },
        ],
      });
    }
  }

  // 7. Sổ Chứng Từ & Báo Cáo Kho (Inventory Transactions)
  const trans1Code = 'XK-2026-0001';
  let trans1 = await prisma.inventoryTransaction.findUnique({ where: { transCode: trans1Code } });
  if (!trans1) {
    trans1 = await prisma.inventoryTransaction.create({
      data: {
        transCode: trans1Code,
        type: 'OUT',
        sourceWarehouseId: whHcm.id,
        reasonCode: 'SALE_EXPORT',
        partnerName: 'Công ty CP Trà & Cà phê Phúc Long',
        deliveredBy: 'Trần Văn Hùng (Kho HCM)',
        receivedBy: 'Vũ Hải Đăng (Quản lý Phúc Long)',
        totalValue: 125000000,
        status: 'COMPLETED',
        transDate: new Date(Date.now() - 17 * 86400000),
        note: 'Xuất kho máy pha cà phê phục vụ hợp đồng ORD-2026-0001',
        createdById: technicianId || 1,
      },
    });
  }

  const trans2Code = 'NK-2026-0001';
  let trans2 = await prisma.inventoryTransaction.findUnique({ where: { transCode: trans2Code } });
  if (!trans2) {
    trans2 = await prisma.inventoryTransaction.create({
      data: {
        transCode: trans2Code,
        type: 'IN',
        targetWarehouseId: whHn.id,
        reasonCode: 'PO_IMPORT',
        partnerName: 'Hãng máy Unox Italy',
        deliveredBy: 'Đơn vị vận chuyển Kuehne+Nagel',
        receivedBy: 'Nguyễn Văn Nam (Kho HN)',
        totalValue: 85000000,
        status: 'COMPLETED',
        transDate: new Date(Date.now() - 10 * 86400000),
        note: 'Nhập kho lô linh kiện điện trở nhiệt và board điều khiển lò nướng',
        createdById: technicianId || 1,
      },
    });
  }

  console.log('→ Đơn hàng, Báo giá, Thu chi & Chứng từ kho: Đã khởi tạo đầy đủ');
  console.log('✅ Khởi tạo dữ liệu mẫu Thiết bị & Máy móc F&B hoàn tất!');
}


// Chạy trực tiếp qua: npx tsx prisma/seed/fnb-equipment.ts
if (process.argv[1]?.includes('fnb-equipment')) {
  const prisma = new PrismaClient();
  seedDemoFnbEquipment(prisma)
    .catch((e) => {
      console.error('❌ Lỗi khi seed dữ liệu thiết bị F&B:', e);
      process.exit(1);
    })
    .finally(async () => {
      await prisma.$disconnect();
    });
}
