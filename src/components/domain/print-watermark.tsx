'use client';

import React, { useState } from 'react';
import { usePrintWatermark } from '@/components/layout/print-watermark-context';

export interface PrintWatermarkProps {
  /** Ghi đè URL logo (nếu không truyền sẽ lấy từ cấu hình hệ thống) */
  logoUrl?: string | null;
  /** Ghi đè độ mờ watermark (ví dụ: 0.08 tương đương 8%) */
  opacity?: number;
  /** Bật/tắt hiển thị */
  enabled?: boolean;
  /** Tên đơn vị / thương hiệu hiển thị khi dùng con dấu vector */
  companyName?: string;
  /** Độ rộng tối đa của watermark (mặc định: 420px) */
  size?: number | string;
  className?: string;
  style?: React.CSSProperties;
}

/**
 * Component hiển thị Logo Watermark làm nền chìm dưới văn bản cho tất cả phiếu in A4.
 * Tự động canh giữa tờ giấy, nằm bên dưới nội dung (z-index: 0), không cản trở việc đọc chữ.
 */
export function PrintWatermark({
  logoUrl: propLogoUrl,
  opacity: propOpacity,
  enabled: propEnabled,
  companyName: propCompanyName,
  size = 400,
  className,
  style,
}: PrintWatermarkProps) {
  const context = usePrintWatermark();
  const [imageError, setImageError] = useState(false);

  const isEnabled = propEnabled ?? context?.enabled ?? true;
  if (!isEnabled) return null;

  const rawLogo = propLogoUrl !== undefined ? propLogoUrl : (context?.logoUrl ?? null);
  const rawOpacity = propOpacity ?? context?.opacity ?? 0.08;
  const numOpacity = Number(rawOpacity) > 0 && Number(rawOpacity) <= 1 ? Number(rawOpacity) : 0.08;
  const companyName = propCompanyName || context?.companyName || 'CÔNG TY SUNNY';

  const widthStyle = typeof size === 'number' ? `${size}px` : size;

  return (
    <div
      className={`print-watermark-container ${className || ''}`}
      style={{
        position: 'absolute',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        width: widthStyle,
        maxWidth: '70%',
        pointerEvents: 'none',
        userSelect: 'none',
        zIndex: 0,
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        opacity: numOpacity,
        ...style,
      }}
      aria-hidden="true"
    >
      {rawLogo && !imageError ? (
        <img
          src={rawLogo}
          alt=""
          onError={() => setImageError(true)}
          style={{
            width: '100%',
            height: 'auto',
            maxHeight: widthStyle,
            objectFit: 'contain',
            filter: 'grayscale(20%)',
          }}
        />
      ) : (
        /* Fallback: Con dấu tròn vector chuẩn nhận diện thương hiệu doanh nghiệp */
        <svg
          viewBox="0 0 400 400"
          style={{
            width: '100%',
            height: 'auto',
            maxHeight: widthStyle,
            color: '#1e293b',
          }}
        >
          {/* Viền đôi vòng tròn ngoài */}
          <circle cx="200" cy="200" r="190" fill="none" stroke="currentColor" strokeWidth="3.5" strokeDasharray="9 5" />
          <circle cx="200" cy="200" r="176" fill="none" stroke="currentColor" strokeWidth="2.5" />
          <circle cx="200" cy="200" r="128" fill="none" stroke="currentColor" strokeWidth="1.5" />

          {/* Cung chữ tên công ty ở phía trên */}
          <path
            id="print-watermark-arc-top"
            d="M 64,200 A 136,136 0 1,1 336,200"
            fill="none"
          />
          <text
            fontSize="17"
            fontWeight="bold"
            fill="currentColor"
            letterSpacing="4"
            textAnchor="middle"
          >
            <textPath href="#print-watermark-arc-top" startOffset="50%">
              {companyName.toUpperCase()}
            </textPath>
          </text>

          {/* Cung chữ tiêu ngữ phía dưới */}
          <path
            id="print-watermark-arc-bottom"
            d="M 336,200 A 136,136 0 0,1 64,200"
            fill="none"
          />
          <text
            fontSize="13"
            fontWeight="600"
            fill="currentColor"
            letterSpacing="3"
            textAnchor="middle"
          >
            <textPath href="#print-watermark-arc-bottom" startOffset="50%">
              ★ CHÍNH HÃNG • UY TÍN • CHẤT LƯỢNG ★
            </textPath>
          </text>

          {/* Tâm con dấu: Biểu tượng hoa thị & tên viết tắt */}
          <g transform="translate(200, 200)">
            <circle cx="0" cy="0" r="48" fill="none" stroke="currentColor" strokeWidth="2" />
            <polygon
              points="0,-40 10,-12 38,0 10,12 0,40 -10,12 -38,0 -10,-12"
              fill="currentColor"
              opacity="0.25"
            />
            <text
              x="0"
              y="6"
              fontSize="24"
              fontWeight="900"
              fill="currentColor"
              textAnchor="middle"
              dominantBaseline="middle"
              fontFamily="'Times New Roman', serif"
            >
              SUNNY
            </text>
          </g>
        </svg>
      )}
    </div>
  );
}
