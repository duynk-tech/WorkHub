import { describe, it, expect } from 'vitest';
import { computeMetrics, distanceMeters, type ShiftInfo } from '@/server/modules/attendance/service';

const shift: ShiftInfo = {
  id: 1, startTime: '08:00', endTime: '17:30', breakMinutes: 90, lateToleranceMin: 5, workDays: 62,
};

// Thứ Sáu 18/09/2026 là ngày làm việc
const workday = new Date(2026, 8, 18);
const at = (h: number, m: number) => { const d = new Date(workday); d.setHours(h, m, 0, 0); return d; };

describe('Tính công theo ca làm việc', () => {
  it('đi đúng giờ, về đúng giờ', () => {
    const r = computeMetrics({ workDate: workday, checkInAt: at(8, 0), checkOutAt: at(17, 30), shift });
    expect(r.status).toBe('PRESENT');
    expect(r.lateMinutes).toBe(0);
    expect(r.workedMinutes).toBe(9 * 60 + 30 - 90);
  });

  it('trong khoảng dung sai thì không tính muộn', () => {
    const r = computeMetrics({ workDate: workday, checkInAt: at(8, 4), checkOutAt: at(17, 30), shift });
    expect(r.lateMinutes).toBe(0);
    expect(r.status).toBe('PRESENT');
  });

  it('vượt dung sai thì tính muộn đầy đủ số phút', () => {
    const r = computeMetrics({ workDate: workday, checkInAt: at(8, 20), checkOutAt: at(17, 30), shift });
    expect(r.lateMinutes).toBe(20);
    expect(r.status).toBe('LATE');
  });

  it('về sớm', () => {
    const r = computeMetrics({ workDate: workday, checkInAt: at(8, 0), checkOutAt: at(16, 30), shift });
    expect(r.earlyLeaveMinutes).toBe(60);
    expect(r.status).toBe('EARLY_LEAVE');
  });

  it('ở lại quá 15 phút tính OT', () => {
    const r = computeMetrics({ workDate: workday, checkInAt: at(8, 0), checkOutAt: at(19, 0), shift });
    expect(r.otMinutes).toBe(90);
  });

  it('thiếu check-out', () => {
    const r = computeMetrics({ workDate: workday, checkInAt: at(8, 0), checkOutAt: null, shift });
    expect(r.status).toBe('MISSING_CHECKOUT');
  });

  it('không check-in là vắng', () => {
    const r = computeMetrics({ workDate: workday, checkInAt: null, checkOutAt: null, shift });
    expect(r.status).toBe('ABSENT');
  });

  it('ngày lễ và ngày nghỉ phép không tính vắng', () => {
    expect(computeMetrics({ workDate: workday, checkInAt: null, checkOutAt: null, shift, isHoliday: true }).status).toBe('HOLIDAY');
    expect(computeMetrics({ workDate: workday, checkInAt: null, checkOutAt: null, shift, isOnLeave: true, leavePortion: 1 }).status).toBe('LEAVE');
  });

  it('chủ nhật không thuộc ca hành chính', () => {
    const sunday = new Date(2026, 8, 20);
    expect(computeMetrics({ workDate: sunday, checkInAt: null, checkOutAt: null, shift }).status).toBe('WEEKEND');
  });
});

describe('Khoảng cách geofence', () => {
  it('tính đúng khoảng cách giữa hai điểm gần nhau', () => {
    const d = distanceMeters({ lat: 10.762622, lng: 106.660172 }, { lat: 10.763622, lng: 106.660172 });
    expect(d).toBeGreaterThan(100);
    expect(d).toBeLessThan(120);
  });

  it('cùng một điểm thì khoảng cách bằng 0', () => {
    expect(distanceMeters({ lat: 21.028511, lng: 105.804817 }, { lat: 21.028511, lng: 105.804817 })).toBe(0);
  });
});
