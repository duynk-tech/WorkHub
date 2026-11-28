'use client';

import React, { useState, useRef, useEffect, useLayoutEffect, useMemo } from 'react';
import { createPortal } from 'react-dom';
import { Search, ChevronDown, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';

export interface SearchableSelectOption {
  value: string;
  label: string;
  subLabel?: string;
  icon?: React.ReactNode;
  /** Nhóm hiển thị trong danh sách (VD: "Máy móc F&B", "Linh kiện"). */
  group?: string;
  /** Nội dung phụ dùng để tìm kiếm nhưng không hiển thị (mã, hãng...). */
  keywords?: string;
  [key: string]: any;
}

export interface SearchableSelectProps {
  value: string;
  onChange: (value: string) => void;
  options: SearchableSelectOption[];
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  className?: string;
  style?: React.CSSProperties;
  allowClear?: boolean;
  emptyText?: string;
  /** Thu gọn chiều cao cho các hàng nhập liệu dày đặc (khớp với Input sizeSm). */
  sizeSm?: boolean;
  triggerStyle?: React.CSSProperties;
  /** Độ rộng tối thiểu của menu thả xuống khi mở (tránh bị cụt chữ trong bảng nhỏ). */
  popoverMinWidth?: number;
}

function normalizeSearch(str: string): string {
  return str
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/đ/g, 'd')
    .replace(/Đ/g, 'd')
    .trim();
}

export function SearchableSelect({
  value,
  onChange,
  options,
  placeholder = '-- Chọn --',
  searchPlaceholder = 'Tìm kiếm...',
  disabled = false,
  className = '',
  style,
  allowClear = false,
  emptyText = 'Không tìm thấy kết quả phù hợp',
  sizeSm = false,
  triggerStyle,
  popoverMinWidth,
}: SearchableSelectProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const popoverRef = useRef<HTMLDivElement>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const [mounted, setMounted] = useState(false);
  /** Vị trí popover (fixed) — render qua portal để không bị modal/khung cuộn cắt mất. */
  const [pos, setPos] = useState<{ top: number; left: number; width: number; maxHeight: number } | null>(null);

  useEffect(() => setMounted(true), []);

  const selectedOption = useMemo(() => {
    return options.find((opt) => opt.value === value);
  }, [options, value]);

  // Filter options
  const filteredOptions = useMemo(() => {
    if (!searchQuery.trim()) return options;
    const query = normalizeSearch(searchQuery);
    return options.filter((opt) => {
      const matchLabel = normalizeSearch(opt.label).includes(query);
      const matchSub = opt.subLabel ? normalizeSearch(opt.subLabel).includes(query) : false;
      const matchVal = normalizeSearch(opt.value).includes(query);
      const matchKw = opt.keywords ? normalizeSearch(opt.keywords).includes(query) : false;
      return matchLabel || matchSub || matchVal || matchKw;
    });
  }, [options, searchQuery]);

  /** Gom nhóm theo option.group, giữ nguyên thứ tự xuất hiện. */
  const groupedOptions = useMemo(() => {
    const groups: { name: string; items: SearchableSelectOption[] }[] = [];
    for (const opt of filteredOptions) {
      const name = opt.group || '';
      const existing = groups.find((g) => g.name === name);
      if (existing) existing.items.push(opt);
      else groups.push({ name, items: [opt] });
    }
    return groups;
  }, [filteredOptions]);

  // Click outside listener
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      const target = event.target as Node;
      const insideTrigger = containerRef.current?.contains(target);
      const insidePopover = popoverRef.current?.contains(target);
      if (!insideTrigger && !insidePopover) {
        setIsOpen(false);
        setSearchQuery('');
      }
    }

    if (isOpen) {
      document.addEventListener('mousedown', handleClickOutside);
    }
    return () => {
      document.removeEventListener('mousedown', handleClickOutside);
    };
  }, [isOpen]);

  // Đo vị trí trigger để đặt popover (và cập nhật khi cuộn / đổi kích thước)
  useLayoutEffect(() => {
    if (!isOpen) {
      setPos(null);
      return;
    }

    const update = () => {
      const el = triggerRef.current;
      if (!el) return;
      const rect = el.getBoundingClientRect();
      const spaceBelow = window.innerHeight - rect.bottom - 12;
      const spaceAbove = rect.top - 12;
      const openUp = spaceBelow < 200 && spaceAbove > spaceBelow;
      const maxHeight = Math.max(160, Math.min(300, openUp ? spaceAbove : spaceBelow));
      const popoverWidth = Math.max(rect.width, popoverMinWidth || 0);
      const maxLeft = Math.max(12, window.innerWidth - popoverWidth - 12);
      const left = Math.max(12, Math.min(rect.left, maxLeft));
      setPos({
        top: openUp ? rect.top - 4 - maxHeight : rect.bottom + 4,
        left,
        width: popoverWidth,
        maxHeight,
      });
    };

    update();
    window.addEventListener('scroll', update, true);
    window.addEventListener('resize', update);
    return () => {
      window.removeEventListener('scroll', update, true);
      window.removeEventListener('resize', update);
    };
  }, [isOpen]);

  // Focus search input when open
  useEffect(() => {
    if (isOpen) {
      setTimeout(() => {
        searchInputRef.current?.focus();
      }, 50);
    } else {
      setSearchQuery('');
    }
  }, [isOpen]);

  // Keydown handler (Escape)
  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Escape' && isOpen) {
      // Chỉ đóng dropdown, không để Escape lọt ra ngoài làm đóng luôn modal cha
      e.stopPropagation();
      e.nativeEvent.stopImmediatePropagation();
      setIsOpen(false);
      setSearchQuery('');
    }
  };

  return (
    <div
      ref={containerRef}
      style={{ position: 'relative', width: '100%', minWidth: 0, ...style }}
      className={className}
      onKeyDown={handleKeyDown}
    >
      {/* Trigger Button */}
      <div
        ref={triggerRef}
        role="button"
        tabIndex={disabled ? -1 : 0}
        onClick={() => {
          if (!disabled) setIsOpen(!isOpen);
        }}
        onKeyDown={(e) => {
          if ((e.key === 'Enter' || e.key === ' ') && !disabled) {
            e.preventDefault();
            setIsOpen(!isOpen);
          }
        }}
        className={cn(
          'searchable-select-trigger',
          isOpen && 'open',
          disabled && 'disabled'
        )}
        style={{
          border: isOpen ? '1px solid var(--brand)' : '1px solid var(--border-base)',
          background: disabled ? 'var(--surface-sunken)' : 'var(--surface-card)',
          borderRadius: 'var(--radius-md)',
          boxShadow: isOpen ? 'var(--shadow-focus)' : 'none',
          color: selectedOption && selectedOption.value ? 'var(--text-strong)' : 'var(--text-muted)',
          ...(sizeSm ? { height: 32, fontSize: 12.5, padding: '0 9px' } : null),
          ...triggerStyle,
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: 8, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap', minWidth: 0, flex: 1 }}>
          {selectedOption?.icon && (
            <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>
              {selectedOption.icon}
            </span>
          )}
          <span style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
            {selectedOption ? selectedOption.label : placeholder}
          </span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: 4, flexShrink: 0 }}>
          {allowClear && selectedOption && selectedOption.value && (
            <span
              role="button"
              tabIndex={0}
              onClick={(e) => {
                e.stopPropagation();
                onChange('');
              }}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                justifyContent: 'center',
                padding: 2,
                borderRadius: '50%',
                color: 'var(--text-muted)',
              }}
              className="hover:bg-slate-100 dark:hover:bg-slate-800"
              title="Xóa lựa chọn"
            >
              <X style={{ width: 13, height: 13 }} />
            </span>
          )}
          <ChevronDown
            style={{
              width: 14,
              height: 14,
              color: 'var(--text-muted)',
              transform: isOpen ? 'rotate(180deg)' : 'none',
              transition: 'transform 0.2s ease',
            }}
          />
        </div>
      </div>

      {/* Popover Dropdown — portal ra body để không bị cắt trong modal */}
      {isOpen && mounted && pos && createPortal(
        <div
          ref={popoverRef}
          style={{
            position: 'fixed',
            top: pos.top,
            left: pos.left,
            width: pos.width,
            zIndex: 1100,
            background: 'var(--surface-card)',
            border: '1px solid var(--border-base)',
            borderRadius: 'var(--radius-md)',
            boxShadow: 'var(--shadow-lg)',
            overflow: 'hidden',
          }}
          onKeyDown={handleKeyDown}
        >
          {/* Search Box */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: 8,
              padding: '8px 12px',
              borderBottom: '1px solid var(--border-base)',
              background: 'var(--surface-sunken)',
            }}
          >
            <Search style={{ width: 14, height: 14, color: 'var(--text-muted)', flexShrink: 0 }} />
            <input
              ref={searchInputRef}
              type="text"
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder={searchPlaceholder}
              style={{
                width: '100%',
                border: 'none',
                background: 'transparent',
                outline: 'none',
                fontSize: 13,
                color: 'var(--text-strong)',
              }}
            />
            {searchQuery && (
              <span
                role="button"
                tabIndex={0}
                onClick={() => setSearchQuery('')}
                style={{ cursor: 'pointer', display: 'inline-flex', color: 'var(--text-muted)' }}
              >
                <X style={{ width: 13, height: 13 }} />
              </span>
            )}
          </div>

          {/* Options List */}
          <div
            style={{
              maxHeight: Math.max(120, pos.maxHeight - 46),
              overflowY: 'auto',
              padding: 4,
            }}
          >
            {filteredOptions.length === 0 ? (
              <div
                style={{
                  padding: '16px 12px',
                  textAlign: 'center',
                  color: 'var(--text-muted)',
                  fontSize: 12.5,
                }}
              >
                {emptyText}
              </div>
            ) : (
              groupedOptions.map((group) => (
                <div key={group.name || '__ungrouped'}>
                  {group.name && (
                    <div
                      style={{
                        padding: '6px 10px 3px',
                        fontSize: 10.5,
                        fontWeight: 700,
                        letterSpacing: '0.4px',
                        textTransform: 'uppercase',
                        color: 'var(--text-muted)',
                      }}
                    >
                      {group.name}
                    </div>
                  )}
                  {group.items.map((opt) => {
                    const isSelected = opt.value === value;

                    return (
                  <div
                    key={opt.value}
                    role="option"
                    aria-selected={isSelected}
                    onClick={() => {
                      onChange(opt.value);
                      setIsOpen(false);
                      setSearchQuery('');
                    }}
                    style={{
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'space-between',
                      gap: 8,
                      padding: '7px 10px',
                      borderRadius: 'var(--radius-sm)',
                      fontSize: 13,
                      cursor: 'pointer',
                      background: isSelected
                        ? 'var(--brand-soft)'
                        : 'transparent',
                      color: isSelected ? 'var(--brand)' : 'var(--text-strong)',
                      fontWeight: isSelected ? 600 : 400,
                      transition: 'background 0.12s ease',
                    }}
                    className={isSelected ? '' : 'hover:bg-slate-100 dark:hover:bg-slate-800'}
                  >
                    <div style={{ display: 'flex', alignItems: 'center', gap: 8, minWidth: 0, flex: 1 }}>
                      {opt.icon && (
                        <span style={{ flexShrink: 0, display: 'inline-flex', alignItems: 'center' }}>
                          {opt.icon}
                        </span>
                      )}
                      <div style={{ overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                        <span>{opt.label}</span>
                        {opt.subLabel && (
                          <span
                            style={{
                              marginLeft: 6,
                              fontSize: 11,
                              color: 'var(--text-muted)',
                              fontWeight: 400,
                            }}
                          >
                            ({opt.subLabel})
                          </span>
                        )}
                      </div>
                    </div>

                    {isSelected && (
                      <Check style={{ width: 14, height: 14, color: 'var(--brand)', flexShrink: 0 }} />
                    )}
                  </div>
                    );
                  })}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body,
      )}
    </div>
  );
}
