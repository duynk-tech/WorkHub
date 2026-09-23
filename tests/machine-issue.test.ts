import { describe, it, expect } from 'vitest';

/**
 * Kiểm tra serial trước khi trừ tồn — đúng luật mà issueCustomerOrderStock áp dụng.
 * Mỗi chiếc máy là một tài sản riêng, thiếu hay trùng serial là hồ sơ máy và tồn
 * kho lệch nhau vĩnh viễn, nên phải chặn ngay chứ không sửa sau.
 */
function validateSerials(
  lines: { id: number; name: string; quantity: number }[],
  units: { orderItemId: number; serialNumber: string }[],
  existingSerials: string[] = [],
): string | null {
  for (const line of lines) {
    const mine = units.filter((u) => u.orderItemId === line.id);
    if (mine.length !== line.quantity) {
      return `Máy "${line.name}" bán ${line.quantity} chiếc nhưng mới khai ${mine.length} số serial`;
    }
    if (mine.some((u) => !u.serialNumber?.trim())) return `Máy "${line.name}" có số serial để trống`;
  }
  const all = units.map((u) => u.serialNumber.trim());
  const dup = all.filter((sn, i) => all.indexOf(sn) !== i);
  if (dup.length) return `Số serial bị nhập trùng trong cùng phiếu: ${[...new Set(dup)].join(', ')}`;
  const clash = all.filter((sn) => existingSerials.includes(sn));
  if (clash.length) return `Số serial đã có trong hệ thống: ${clash.join(', ')}`;
  return null;
}

const LINE = [{ id: 1, name: 'Máy làm kem Taylor C709', quantity: 2 }];

describe('xuất bán máy từ kho', () => {
  it('khai đủ và không trùng thì cho qua', () => {
    expect(validateSerials(LINE, [
      { orderItemId: 1, serialNumber: 'SN-001' },
      { orderItemId: 1, serialNumber: 'SN-002' },
    ])).toBeNull();
  });

  it('thiếu serial thì chặn, nói rõ thiếu mấy chiếc', () => {
    const err = validateSerials(LINE, [{ orderItemId: 1, serialNumber: 'SN-001' }]);
    expect(err).toContain('bán 2 chiếc nhưng mới khai 1');
  });

  it('serial để trống bị coi là thiếu', () => {
    expect(validateSerials(LINE, [
      { orderItemId: 1, serialNumber: 'SN-001' },
      { orderItemId: 1, serialNumber: '   ' },
    ])).toContain('để trống');
  });

  it('trùng serial trong cùng phiếu thì chặn', () => {
    expect(validateSerials(LINE, [
      { orderItemId: 1, serialNumber: 'SN-X' },
      { orderItemId: 1, serialNumber: 'SN-X' },
    ])).toContain('trùng trong cùng phiếu');
  });

  it('serial đã có trong hệ thống thì chặn', () => {
    expect(validateSerials(LINE, [
      { orderItemId: 1, serialNumber: 'SN-001' },
      { orderItemId: 1, serialNumber: 'CPG-LB14-9921' },
    ], ['CPG-LB14-9921'])).toContain('đã có trong hệ thống');
  });

  it('nhiều dòng máy thì kiểm từng dòng riêng', () => {
    const lines = [
      { id: 1, name: 'Máy kem', quantity: 1 },
      { id: 2, name: 'Máy socola', quantity: 2 },
    ];
    expect(validateSerials(lines, [
      { orderItemId: 1, serialNumber: 'A1' },
      { orderItemId: 2, serialNumber: 'B1' },
    ])).toContain('Máy socola');
  });

  it('đơn không có máy thì không đòi serial', () => {
    expect(validateSerials([], [])).toBeNull();
  });
});

describe('hạn bảo hành tính từ ngày giao', () => {
  /**
   * Cột @db.Date lấy phần ngày theo UTC, nên ngày giao phải chuẩn hóa về nửa đêm
   * UTC của ngày ĐỊA PHƯƠNG. Dùng thẳng new Date() thì máy giao trước 7h sáng giờ
   * Việt Nam bị ghi lùi một ngày.
   */
  const issueDateOf = (local: Date) =>
    new Date(Date.UTC(local.getFullYear(), local.getMonth(), local.getDate()));

  const expiry = (months: number, local = new Date(2026, 8, 22)) => {
    const from = issueDateOf(local);
    return months > 0 ? new Date(new Date(from).setUTCMonth(from.getUTCMonth() + months)) : null;
  };

  it('24 tháng thì hết hạn đúng hai năm sau', () => {
    expect(expiry(24)?.toISOString().slice(0, 10)).toBe('2028-09-22');
  });

  it('12 tháng', () => {
    expect(expiry(12)?.toISOString().slice(0, 10)).toBe('2027-09-22');
  });

  it('0 tháng nghĩa là không bảo hành, không đặt hạn', () => {
    expect(expiry(0)).toBeNull();
  });

  it('giao lúc rạng sáng giờ Việt Nam vẫn ghi đúng ngày, không lùi một ngày', () => {
    // 22/09/2026 lúc 00:30 giờ VN = 21/09 17:30 UTC
    const earlyMorning = new Date(2026, 8, 22, 0, 30);
    expect(issueDateOf(earlyMorning).toISOString().slice(0, 10)).toBe('2026-09-22');
    expect(expiry(12, earlyMorning)?.toISOString().slice(0, 10)).toBe('2027-09-22');
  });
});
