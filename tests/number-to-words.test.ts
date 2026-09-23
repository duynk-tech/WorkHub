import { describe, it, expect } from 'vitest';
import { readVndInWords } from '@/lib/number-to-words';

describe('đọc số tiền thành chữ', () => {
  it('con số trong báo giá thật', () => {
    expect(readVndInWords(1_608_750)).toBe('Một triệu sáu trăm lẻ tám nghìn bảy trăm năm mươi đồng');
  });

  it('số tròn không đọc thừa nhóm rỗng', () => {
    expect(readVndInWords(1_000_000)).toBe('Một triệu đồng');
    expect(readVndInWords(1_000_000_000)).toBe('Một tỷ đồng');
    expect(readVndInWords(325_000)).toBe('Ba trăm hai mươi lăm nghìn đồng');
  });

  it('hàng chục bằng 0 thì chèn "lẻ"', () => {
    expect(readVndInWords(101)).toBe('Một trăm lẻ một đồng');
    expect(readVndInWords(1_005)).toBe('Một nghìn không trăm lẻ năm đồng');
  });

  it('mười, mười lăm, mười một', () => {
    expect(readVndInWords(10)).toBe('Mười đồng');
    expect(readVndInWords(11)).toBe('Mười một đồng');
    expect(readVndInWords(15)).toBe('Mười lăm đồng');
  });

  it('mốt, tư, lăm sau hàng chục', () => {
    expect(readVndInWords(21)).toBe('Hai mươi mốt đồng');
    expect(readVndInWords(24)).toBe('Hai mươi tư đồng');
    expect(readVndInWords(25)).toBe('Hai mươi lăm đồng');
  });

  it('nhóm giữa mất hàng trăm phải đọc "không trăm" cho khỏi nhập nhằng', () => {
    // Thiếu "không trăm" thì 1.020.000 đọc y hệt 1.020.000 và 1.200.000
    expect(readVndInWords(1_020_000)).toBe('Một triệu không trăm hai mươi nghìn đồng');
    expect(readVndInWords(1_200_000)).toBe('Một triệu hai trăm nghìn đồng');
  });

  it('bỏ qua nhóm rỗng ở giữa, không đọc "không nghìn"', () => {
    expect(readVndInWords(1_000_500)).toBe('Một triệu năm trăm đồng');
    // Nhóm cuối vẫn phải có "không trăm" vì hàng trăm của chính nhóm đó bằng 0,
    // giống hệt ca 1.005 = "một nghìn không trăm lẻ năm"
    expect(readVndInWords(2_000_000_015)).toBe('Hai tỷ không trăm mười lăm đồng');
  });

  it('số lớn nhiều nhóm', () => {
    expect(readVndInWords(123_456_789)).toBe(
      'Một trăm hai mươi ba triệu bốn trăm năm mươi sáu nghìn bảy trăm tám mươi chín đồng',
    );
  });

  it('số 0 và số âm', () => {
    expect(readVndInWords(0)).toBe('Không đồng');
    expect(readVndInWords(-5_000)).toBe('Âm năm nghìn đồng');
  });

  it('làm tròn phần lẻ, chứng từ tiền Việt không có hào xu', () => {
    expect(readVndInWords(2_805_105.6)).toBe(readVndInWords(2_805_106));
  });

  it('giá trị không hợp lệ trả chuỗi rỗng thay vì đọc bừa', () => {
    expect(readVndInWords(null)).toBe('');
    expect(readVndInWords(undefined)).toBe('');
    expect(readVndInWords(NaN)).toBe('');
    expect(readVndInWords(1e12)).toBe('');
  });

  it('đổi được hậu tố cho chứng từ ngoại tệ', () => {
    expect(readVndInWords(12, 'euro')).toBe('Mười hai euro');
  });
});
