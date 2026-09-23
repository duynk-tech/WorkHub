'use client';

import React, { useState, useEffect, useRef } from 'react';
import { cn } from '@/lib/utils';
import { readVndInWords } from '@/lib/number-to-words';

export interface PriceInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'onChange' | 'value'> {
  value?: number | null;
  onChange?: (value: number | undefined) => void;
  currency?: 'VND' | 'EUR' | 'USD' | string;
  suffix?: string;
  allowDecimals?: boolean;
  sizeSm?: boolean;
  invalid?: boolean;
  showInWords?: boolean;
  /**
   * Đọc đủ số tiền thay vì ước lượng độ lớn.
   * Dùng cho ô nhập số tiền thu / chi: "~ 1.61 triệu" không phát hiện được lỗi gõ
   * thừa một số 0, còn đọc đủ từng hàng thì người nhập thấy ngay.
   */
  exactWords?: boolean;
}

/** Chuyển số thành chuỗi phân cách hàng nghìn */
export function formatNumberWithCommas(num: number | undefined | null, allowDecimals = false): string {
  if (num === undefined || num === null || isNaN(num)) return '';
  if (!allowDecimals) {
    return Math.round(num).toLocaleString('en-US');
  }
  // Cho phép số thập phân
  const parts = num.toString().split('.');
  parts[0] = parseInt(parts[0] || '0', 10).toLocaleString('en-US');
  return parts.join('.');
}

/** Chuyển số lớn sang chữ gợi ý (VD: 3.500.000 -> 3.5 triệu) */
export function formatVndInWords(num: number | undefined | null): string {
  if (!num || num <= 0) return '';
  if (num >= 1_000_000_000) {
    return `~ ${(num / 1_000_000_000).toFixed(2).replace(/\.?0+$/, '')} tỷ ₫`;
  }
  if (num >= 1_000_000) {
    return `~ ${(num / 1_000_000).toFixed(2).replace(/\.?0+$/, '')} triệu ₫`;
  }
  if (num >= 1_000) {
    return `~ ${(num / 1_000).toFixed(0)} nghìn ₫`;
  }
  return '';
}

export const PriceInput = React.forwardRef<HTMLInputElement, PriceInputProps>(
  function PriceInput(
    {
      value,
      onChange,
      currency = 'VND',
      suffix: customSuffix,
      allowDecimals = false,
      sizeSm,
      invalid,
      className,
      style,
      placeholder,
      showInWords = false,
      exactWords = false,
      disabled,
      ...props
    },
    forwardedRef
  ) {
    const isVnd = currency === 'VND';
    const isEur = currency === 'EUR';
    const isUsd = currency === 'USD';

    const shouldAllowDecimals = allowDecimals || isEur || isUsd;

    const defaultSuffix = customSuffix !== undefined
      ? customSuffix
      : isVnd
      ? '₫'
      : isEur
      ? '€'
      : isUsd
      ? '$'
      : '';

    const [displayVal, setDisplayVal] = useState<string>(() =>
      formatNumberWithCommas(value, shouldAllowDecimals)
    );

    const innerRef = useRef<HTMLInputElement | null>(null);

    // Đồng bộ khi prop value từ ngoài thay đổi
    useEffect(() => {
      const formatted = formatNumberWithCommas(value, shouldAllowDecimals);
      setDisplayVal(formatted);
    }, [value, shouldAllowDecimals]);

    const handleChange = (e: React.ChangeEvent<HTMLInputElement>) => {
      const input = e.target;
      const raw = input.value;
      const cursorPos = input.selectionStart || 0;

      if (!shouldAllowDecimals) {
        // Chỉ nhận số nguyên (VND, số lượng, v.v.)
        const digitsBeforeCursor = raw.slice(0, cursorPos).replace(/\D/g, '').length;
        const cleanDigits = raw.replace(/\D/g, '');

        if (!cleanDigits) {
          setDisplayVal('');
          onChange?.(undefined);
          return;
        }

        const num = parseInt(cleanDigits, 10);
        const formatted = num.toLocaleString('en-US');
        setDisplayVal(formatted);
        onChange?.(num);

        // Giữ vị trí con trỏ chuột chính xác sau khi thêm dấu phẩy
        requestAnimationFrame(() => {
          const el = innerRef.current || input;
          if (!el) return;
          let counted = 0;
          let newPos = formatted.length;
          for (let i = 0; i < formatted.length; i++) {
            if (/\d/.test(formatted[i])) {
              counted++;
              if (counted === digitsBeforeCursor) {
                newPos = i + 1;
                break;
              }
            }
          }
          el.setSelectionRange(newPos, newPos);
        });
      } else {
        // Cho phép số thập phân (EUR, USD, v.v.)
        // Thay dấu phẩy thành dấu chấm nếu người dùng gõ
        let normalized = raw.replace(/,/g, '.');
        // Chỉ giữ 1 dấu chấm
        const parts = normalized.split('.');
        const cleanInt = parts[0].replace(/\D/g, '');
        const cleanDec = parts.length > 1 ? parts.slice(1).join('').replace(/\D/g, '') : null;

        if (!cleanInt && cleanDec === null) {
          setDisplayVal('');
          onChange?.(undefined);
          return;
        }

        const formattedInt = cleanInt ? parseInt(cleanInt, 10).toLocaleString('en-US') : '0';
        const formatted = cleanDec !== null ? `${formattedInt}.${cleanDec}` : formattedInt;

        setDisplayVal(formatted);
        const num = parseFloat(`${cleanInt || '0'}.${cleanDec || ''}`);
        onChange?.(isNaN(num) ? undefined : num);
      }
    };

    const inWords =
      isVnd && showInWords && value && (exactWords || value >= 100_000)
        ? exactWords
          ? readVndInWords(value)
          : formatVndInWords(value)
        : '';

    return (
      <div style={{ position: 'relative', width: '100%' }}>
        <div style={{ position: 'relative', display: 'flex', alignItems: 'center' }}>
          <input
            ref={(node) => {
              innerRef.current = node;
              if (typeof forwardedRef === 'function') {
                forwardedRef(node);
              } else if (forwardedRef) {
                forwardedRef.current = node;
              }
            }}
            type="text"
            inputMode={shouldAllowDecimals ? 'decimal' : 'numeric'}
            className={cn('input', sizeSm && 'input-sm', invalid && 'input-error', className)}
            style={{
              paddingRight: defaultSuffix ? (sizeSm ? 28 : 34) : undefined,
              ...style,
            }}
            value={displayVal}
            onChange={handleChange}
            placeholder={placeholder}
            disabled={disabled}
            {...props}
          />

          {defaultSuffix && (
            <span
              style={{
                position: 'absolute',
                right: sizeSm ? 8 : 10,
                color: 'var(--text-muted, #64748b)',
                fontSize: sizeSm ? 11 : 13,
                fontWeight: 600,
                pointerEvents: 'none',
                userSelect: 'none',
              }}
            >
              {defaultSuffix}
            </span>
          )}
        </div>

        {inWords && (
          <div
            style={{
              fontSize: 11,
              color: 'var(--text-muted, #64748b)',
              marginTop: 2,
              paddingLeft: 2,
              fontWeight: 500,
            }}
          >
            {inWords}
          </div>
        )}
      </div>
    );
  }
);
