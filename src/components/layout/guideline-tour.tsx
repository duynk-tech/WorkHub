'use client';

import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Compass, X, ArrowRight, ArrowLeft, Check, Sparkles } from 'lucide-react';

export interface TourStep {
  target: string; // CSS selector, e.g. '[data-tour="sidebar-nav"]'
  title: string;
  content: string;
  badge?: string;
  placement?: 'bottom' | 'top' | 'right' | 'left';
}

const DEFAULT_STEPS: TourStep[] = [
  {
    target: '[data-tour="sidebar-nav"]',
    title: 'Thanh Điều Hướng Nghiệp Vụ',
    content: 'Tổ chức khoa học theo 4 nhóm: Công việc & Dự án, Nhân sự & Chấm công, Thiết bị & Dịch vụ F&B, Phân tích & Quản trị hệ thống.',
    badge: 'Bước 1/6',
    placement: 'right',
  },
  {
    target: '[data-tour="dashboard-tabs"]',
    title: 'Phân Hệ Theo Vai Trò',
    content: 'Dễ dàng chuyển đổi giữa các góc nhìn: Công việc cá nhân, Bán hàng & Chăm sóc F&B, Kho phụ tùng 2 miền và Dịch vụ cứu hộ SLA.',
    badge: 'Bước 2/6',
    placement: 'bottom',
  },
  {
    target: '[data-tour="dashboard-kpi"]',
    title: 'Chỉ Số Vận Hành Tức Thời',
    content: 'Theo dõi chỉ số trọng yếu trong ngày: Việc đang mở, đơn hàng chưa hoàn tất, doanh thu tháng và công nợ quá hạn.',
    badge: 'Bước 3/6',
    placement: 'bottom',
  },
  {
    target: '[data-tour="topbar-search"]',
    title: 'Tìm Kiếm Thông Minh (Cmd+K)',
    content: 'Gõ phím tắt Cmd+K (hoặc Ctrl+K) để tra cứu nhanh hồ sơ nhân sự, mã hợp đồng, phiếu báo hỏng hoặc linh kiện máy.',
    badge: 'Bước 4/6',
    placement: 'bottom',
  },
  {
    target: '[data-tour="tour-btn"]',
    title: 'La Bàn Hướng Dẫn Nhanh',
    content: 'Bất cứ khi nào cần ôn lại các khu vực tính năng, bạn có thể bấm vào biểu tượng La bàn này trên thanh tiêu đề.',
    badge: 'Bước 5/6',
    placement: 'bottom',
  },
  {
    target: '[data-tour="topbar-user"]',
    title: 'Hồ Sơ & Cá Nhân Hóa',
    content: 'Xem phân quyền vai trò, chuyển đổi giao diện Sáng / Tối và thiết lập thông tin thương hiệu doanh nghiệp.',
    badge: 'Bước 6/6',
    placement: 'bottom',
  },
];

interface GuidelineTourProps {
  steps?: TourStep[];
  storageKey?: string;
  autoStartFirstVisit?: boolean;
}

export function GuidelineTour({
  steps = DEFAULT_STEPS,
  storageKey = 'workhub_tour_completed',
  autoStartFirstVisit = true,
}: GuidelineTourProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [currentStep, setCurrentStep] = useState(0);
  const [targetRect, setTargetRect] = useState<DOMRect | null>(null);
  const [showWelcomeBanner, setShowWelcomeBanner] = useState(false);
  const popoverRef = useRef<HTMLDivElement>(null);

  // Check initial visit
  useEffect(() => {
    try {
      const completed = localStorage.getItem(storageKey);
      if (!completed && autoStartFirstVisit) {
        // Trì hoãn nhẹ 1 giây để giao diện render ổn định
        const timer = setTimeout(() => {
          setShowWelcomeBanner(true);
        }, 1200);
        return () => clearTimeout(timer);
      }
    } catch {
      // Ignored for SSR or private mode
    }
  }, [storageKey, autoStartFirstVisit]);

  // Lắng nghe sự kiện custom "start-guideline-tour" từ Topbar hoặc nơi khác
  useEffect(() => {
    const handleStart = () => {
      setShowWelcomeBanner(false);
      setCurrentStep(0);
      setIsOpen(true);
    };
    window.addEventListener('workhub:start-tour', handleStart);
    return () => window.removeEventListener('workhub:start-tour', handleStart);
  }, []);

  const prevTargetRef = useRef<HTMLElement | null>(null);

  const updateTargetPosition = useCallback(() => {
    if (!isOpen) {
      if (prevTargetRef.current) {
        prevTargetRef.current.removeAttribute('data-tour-active');
        prevTargetRef.current = null;
      }
      return;
    }
    const step = steps[currentStep];
    if (!step) return;

    // Clear previous
    if (prevTargetRef.current) {
      prevTargetRef.current.removeAttribute('data-tour-active');
      prevTargetRef.current = null;
    }

    const el = document.querySelector<HTMLElement>(step.target);
    if (el) {
      const rect = el.getBoundingClientRect();
      setTargetRect(rect);
      el.setAttribute('data-tour-active', 'true');
      prevTargetRef.current = el;

      // Cuộn nhẹ tới tầm nhìn nếu phần tử nằm ngoài màn hình
      if (rect.top < 0 || rect.bottom > window.innerHeight) {
        el.scrollIntoView({ behavior: 'smooth', block: 'nearest' });
      }
    } else {
      setTargetRect(null);
    }
  }, [isOpen, currentStep, steps]);

  useEffect(() => {
    updateTargetPosition();
    window.addEventListener('resize', updateTargetPosition);
    window.addEventListener('scroll', updateTargetPosition, true);
    return () => {
      window.removeEventListener('resize', updateTargetPosition);
      window.removeEventListener('scroll', updateTargetPosition, true);
      if (prevTargetRef.current) {
        prevTargetRef.current.removeAttribute('data-tour-active');
      }
    };
  }, [updateTargetPosition]);

  // Phím tắt bàn phím: Esc thoát, Phím Mũi tên trái/phải điều hướng
  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        handleClose();
      } else if (e.key === 'ArrowRight') {
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        handlePrev();
      }
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [isOpen, currentStep]);

  const handleClose = () => {
    if (prevTargetRef.current) {
      prevTargetRef.current.removeAttribute('data-tour-active');
      prevTargetRef.current = null;
    }
    setIsOpen(false);
    setShowWelcomeBanner(false);
    try {
      localStorage.setItem(storageKey, 'true');
    } catch {}
  };

  const handleNext = () => {
    if (currentStep < steps.length - 1) {
      setCurrentStep((prev) => prev + 1);
    } else {
      handleClose();
    }
  };

  const handlePrev = () => {
    if (currentStep > 0) {
      setCurrentStep((prev) => prev - 1);
    }
  };

  const startTourFromBanner = () => {
    setShowWelcomeBanner(false);
    setCurrentStep(0);
    setIsOpen(true);
  };

  const dismissBanner = () => {
    setShowWelcomeBanner(false);
    try {
      localStorage.setItem(storageKey, 'true');
    } catch {}
  };

  const step = steps[currentStep];

  // Tính toán vị trí của popover card theo targetRect
  let popoverStyle: React.CSSProperties = {
    position: 'fixed',
    zIndex: 99999,
  };

  if (targetRect) {
    const pad = 12;
    const cardWidth = 340;
    const cardHeight = 210;

    let placement = step?.placement || 'bottom';

    // Điều chỉnh vị trí thông minh nếu gần mép màn hình
    if (placement === 'bottom' && targetRect.bottom + cardHeight + pad > window.innerHeight) {
      placement = 'top';
    }
    if (placement === 'right' && targetRect.right + cardWidth + pad > window.innerWidth) {
      placement = 'bottom';
    }

    if (placement === 'right') {
      popoverStyle = {
        ...popoverStyle,
        top: Math.max(16, Math.min(window.innerHeight - cardHeight - 16, targetRect.top + (targetRect.height - cardHeight) / 2)),
        left: targetRect.right + pad,
      };
    } else if (placement === 'top') {
      popoverStyle = {
        ...popoverStyle,
        bottom: window.innerHeight - targetRect.top + pad,
        left: Math.max(16, Math.min(window.innerWidth - cardWidth - 16, targetRect.left + (targetRect.width - cardWidth) / 2)),
      };
    } else {
      // bottom
      popoverStyle = {
        ...popoverStyle,
        top: targetRect.bottom + pad,
        left: Math.max(16, Math.min(window.innerWidth - cardWidth - 16, targetRect.left + (targetRect.width - cardWidth) / 2)),
      };
    }
  } else {
    // Nếu không tìm thấy element thì căn giữa màn hình
    popoverStyle = {
      ...popoverStyle,
      top: '50%',
      left: '50%',
      transform: 'translate(-50%, -50%)',
    };
  }

  return (
    <>
      {/* Banner chào mừng kín đáo cho lần đầu */}
      {showWelcomeBanner && (
        <div className="tour-welcome-banner animate-in">
          <div style={{ display: 'flex', alignItems: 'center', gap: 10, flex: 1 }}>
            <span className="tour-welcome-icon">
              <Sparkles size={16} />
            </span>
            <div style={{ fontSize: 13, color: 'var(--text-strong)' }}>
              <strong>Chào mừng bạn đến với WorkHub!</strong> Khám phá nhanh các tính năng chính trong 1 phút?
            </div>
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
            <button className="btn btn-primary btn-sm" onClick={startTourFromBanner}>
              Bắt đầu <ArrowRight size={13} />
            </button>
            <button className="btn btn-ghost btn-sm" onClick={dismissBanner}>
              Để sau
            </button>
          </div>
        </div>
      )}

      {/* Tour Overlay & Spotlight */}
      {isOpen && (
        <div className="tour-overlay-container">
          {/* Backdrop tối mờ */}
          <div className="tour-backdrop" onClick={handleClose} />

          {/* Vùng Spotlight khoét sáng quanh element */}
          {targetRect && (
            <div
              className="tour-spotlight"
              style={{
                top: targetRect.top - 6,
                left: targetRect.left - 6,
                width: targetRect.width + 12,
                height: targetRect.height + 12,
              }}
            />
          )}

          {/* Card Popover nổi */}
          <div ref={popoverRef} className="tour-popover-card animate-in" style={popoverStyle}>
            <div className="tour-popover-header">
              <div style={{ display: 'flex', alignItems: 'center', gap: 7 }}>
                <span className="tour-step-badge">{step?.badge || `Bước ${currentStep + 1}/${steps.length}`}</span>
              </div>
              <button
                type="button"
                className="btn btn-ghost btn-icon btn-xs"
                onClick={handleClose}
                aria-label="Đóng hướng dẫn"
              >
                <X size={15} />
              </button>
            </div>

            <div className="tour-popover-body">
              <h4 className="tour-popover-title">{step?.title}</h4>
              <p className="tour-popover-desc">{step?.content}</p>
            </div>

            <div className="tour-popover-footer">
              <button type="button" className="btn btn-ghost btn-xs" onClick={handleClose} style={{ color: 'var(--text-muted)' }}>
                Bỏ qua
              </button>

              <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                {currentStep > 0 && (
                  <button type="button" className="btn btn-secondary btn-xs" onClick={handlePrev}>
                    <ArrowLeft size={13} /> Quay lại
                  </button>
                )}
                <button type="button" className="btn btn-primary btn-xs" onClick={handleNext}>
                  {currentStep === steps.length - 1 ? (
                    <>
                      Hoàn tất <Check size={13} />
                    </>
                  ) : (
                    <>
                      Tiếp theo <ArrowRight size={13} />
                    </>
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      )}
    </>
  );
}

/**
 * Hàm tiện ích để kích hoạt tour từ bất kỳ component nào
 */
export function triggerGuidelineTour() {
  if (typeof window !== 'undefined') {
    window.dispatchEvent(new CustomEvent('workhub:start-tour'));
  }
}
