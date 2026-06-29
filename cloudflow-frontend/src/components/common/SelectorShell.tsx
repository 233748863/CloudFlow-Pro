import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Check } from 'lucide-react';
import { cn } from '@/utils/cn';

export interface SelectorShellOption {
  id: string;
  label: string;
  subLabel?: string;
  avatar?: string;
  indent?: number;
  disabled?: boolean;
}

export interface SelectorShellProps {
  options: SelectorShellOption[];
  loading?: boolean;
  value: string[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  multiple?: boolean;
  placeholder?: string;
  searchPlaceholder?: string;
  disabled?: boolean;
  allowClear?: boolean;
  emptyText?: string;
  className?: string;
  dropdownPlacement?: 'bottom' | 'top';
  /** 自定义筛选函数；不传则按 label/subLabel 子串匹配 */
  filter?: (option: SelectorShellOption, keyword: string) => boolean;
  /** 是否将所有 option 渲染为带头像样式（标签首字+背景圆形）；默认 true，部门/岗位选择器可关闭 */
  showAvatar?: boolean;
}

const defaultFilter = (option: SelectorShellOption, keyword: string) => {
  if (!keyword) return true;
  const k = keyword.toLowerCase();
  return (
    option.label.toLowerCase().includes(k) ||
    (option.subLabel ? option.subLabel.toLowerCase().includes(k) : false)
  );
};

/**
 * 选择器共用 UI 壳：下拉、搜索、标签、选中态、清空
 * UserSelector / EmployeeSelector / DeptSelector / PostSelector / PositionSelector 全部基于此组件
 */
export const SelectorShell: React.FC<SelectorShellProps> = ({
  options,
  loading = false,
  value,
  onToggle,
  onRemove,
  multiple = true,
  placeholder = '请选择',
  searchPlaceholder = '搜索...',
  disabled = false,
  allowClear = true,
  emptyText = '暂无数据',
  className = '',
  dropdownPlacement = 'bottom',
  filter = defaultFilter,
  showAvatar = true,
}) => {
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState<{ top: number; left: number; width: number }>({ top: 0, left: 0, width: 0 });

  const updateDropdownPos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    if (dropdownPlacement === 'top') {
      setDropdownPos({ top: rect.top, left: rect.left, width: rect.width });
    } else {
      setDropdownPos({ top: rect.bottom, left: rect.left, width: rect.width });
    }
  }, [dropdownPlacement]);

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      updateDropdownPos();
      const onScroll = () => updateDropdownPos();
      const onResize = () => updateDropdownPos();
      window.addEventListener('scroll', onScroll, true);
      window.addEventListener('resize', onResize);
      return () => {
        clearTimeout(t);
        window.removeEventListener('scroll', onScroll, true);
        window.removeEventListener('resize', onResize);
      };
    }
    setSearchTerm('');
    return undefined;
  }, [isOpen, updateDropdownPos]);

  const selectedOptions = useMemo(
    () => value.map((id) => options.find((o) => o.id === id)).filter(Boolean) as SelectorShellOption[],
    [options, value],
  );

  const filteredOptions = useMemo(() => {
    const keyword = searchTerm.trim();
    return options.filter((opt) => filter(opt, keyword));
  }, [filter, options, searchTerm]);

  const handleToggle = (id: string) => {
    onToggle(id);
    if (!multiple) setIsOpen(false);
  };

  const handleClear = (e: React.MouseEvent) => {
    e.stopPropagation();
    value.forEach((id) => onRemove(id));
  };

  const renderAvatar = (option: SelectorShellOption) => {
    if (!showAvatar) return null;
    return (
      <div className="flex h-8 w-8 shrink-0 items-center justify-center rounded-md bg-[var(--cf-surface-muted)] text-sm font-medium text-[color:var(--cf-primary-600)] dark:bg-slate-900 dark:text-[rgb(204,251,241)]">
        {option.label[0] || '?'}
      </div>
    );
  };

  return (
    <div ref={triggerRef} className={cn('relative min-w-0 w-full max-w-full', className)}>
      <div
        onClick={() => !disabled && setIsOpen(!isOpen)}
        className={cn(
          'cf-control min-h-[44px] w-full max-w-full overflow-hidden rounded-md px-3.5 py-2.5',
          disabled ? 'cursor-not-allowed bg-[var(--cf-surface-muted)] dark:bg-slate-900' : 'cursor-pointer',
          isOpen && 'cf-control-active',
        )}
      >
        {selectedOptions.length === 0 ? (
          <span className="text-sm text-slate-400">{placeholder}</span>
        ) : multiple ? (
          <div className="flex flex-wrap items-center gap-1">
            {selectedOptions.map((opt) => (
              <span
                key={opt.id}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-2 py-1 text-xs font-medium text-slate-700 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-200"
              >
                {opt.label}
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(opt.id);
                    }}
                    className="rounded-md p-0.5 transition hover:bg-slate-200 dark:hover:bg-slate-800"
                  >
                    <X size={12} />
                  </button>
                )}
              </span>
            ))}
          </div>
        ) : (
          <div className="flex min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
              <span className="min-w-0 truncate text-sm text-slate-800 dark:text-slate-100">{selectedOptions[0].label}</span>
              {selectedOptions[0].subLabel && (
                <span className="min-w-0 flex-1 truncate text-xs text-slate-400">{selectedOptions[0].subLabel}</span>
              )}
            </div>
            {allowClear && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="rounded-md p-0.5 text-slate-400 transition hover:bg-slate-200 hover:text-slate-700 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-200"
                aria-label="清空"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {isOpen && !disabled && createPortal(
        <>
          <div
            className="fixed inset-0 z-[79]"
            onClick={() => setIsOpen(false)}
          />
          <div
            className={cn(
              'fixed z-[80] overflow-hidden rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] shadow-none dark:border-slate-800 dark:bg-slate-950 dark:shadow-none',
            )}
            style={{
              top: dropdownPlacement === 'top' ? dropdownPos.top - 6 : dropdownPos.top + 6,
              left: dropdownPos.left,
              width: dropdownPos.width,
              transform: dropdownPlacement === 'top' ? 'translateY(-100%)' : undefined,
            }}
          >
          <div className="border-b border-slate-200 p-2 dark:border-slate-800">
            <div className="relative">
              <Search className="absolute left-2 top-1/2 -translate-y-1/2 text-slate-400" size={16} />
              <input
                ref={inputRef}
                type="text"
                value={searchTerm}
                onChange={(e) => setSearchTerm(e.target.value)}
                placeholder={searchPlaceholder}
                className="cf-control h-10 w-full rounded-md pl-8 pr-3 text-sm"
                onClick={(e) => e.stopPropagation()}
              />
            </div>
          </div>

          <div className="max-h-56 overflow-y-auto">
            {loading ? (
              <div className="p-4 text-center text-sm text-slate-500">加载中...</div>
            ) : filteredOptions.length === 0 ? (
              <div className="p-4 text-center text-sm text-slate-500">{emptyText}</div>
            ) : (
              filteredOptions.map((opt) => {
                const isSelected = value.includes(opt.id);
                return (
                  <div
                    key={opt.id}
                    onClick={() => !opt.disabled && handleToggle(opt.id)}
                    className={cn(
                      'flex items-center justify-between gap-2 px-3 py-2 transition-colors',
                      opt.disabled
                        ? 'cursor-not-allowed text-slate-300 dark:text-slate-600'
                        : isSelected
                          ? 'cf-option-active cursor-pointer'
                          : 'cursor-pointer hover:bg-[var(--cf-surface-muted)] dark:hover:bg-slate-900',
                    )}
                  >
                    <div
                      className="flex min-w-0 items-center gap-2"
                      style={opt.indent ? { paddingLeft: opt.indent * 14 } : undefined}
                    >
                      {renderAvatar(opt)}
                      <div className="min-w-0">
                        <div className="truncate text-sm font-medium text-slate-800 dark:text-slate-100">{opt.label}</div>
                        {opt.subLabel && (
                          <div className="truncate text-xs text-slate-500 dark:text-slate-400">{opt.subLabel}</div>
                        )}
                      </div>
                    </div>
                    {isSelected && (
                      <Check className="shrink-0 text-[color:var(--cf-primary-600)] dark:text-[rgb(204,251,241)]" size={16} />
                    )}
                  </div>
                );
              })
            )}
          </div>
        </div>
        </>,
        document.body,
      )}
    </div>
  );
};
