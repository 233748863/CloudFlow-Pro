import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Search, X, Check } from 'lucide-react';
import { cn } from '@/utils/cn';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import { BaseDialog } from './BaseDialog';
import { Button } from './button';

export interface SelectorShellOption {
  id: string;
  label: string;
  subLabel?: string;
  avatar?: string;
  indent?: number;
  disabled?: boolean;
}

export interface SelectorShellProps extends React.AriaAttributes {
  id?: string;
  options: SelectorShellOption[];
  loading?: boolean;
  value: string[];
  onToggle: (id: string) => void;
  onRemove: (id: string) => void;
  onOpen?: () => void;
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
  onOpen,
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
  id,
  ...accessibility
}) => {
  const isMobile = useBreakpoint() === 'mobile';
  const [searchTerm, setSearchTerm] = useState('');
  const [isOpen, setIsOpen] = useState(false);
  const [positioned, setPositioned] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0, maxHeight: 280, dropUp: false });

  const updateDropdownPos = useCallback(() => {
    if (!triggerRef.current) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const viewportPadding = 12;
    const gap = 6;
    const spaceAbove = Math.max(0, rect.top - viewportPadding - gap);
    const spaceBelow = Math.max(0, window.innerHeight - rect.bottom - viewportPadding - gap);
    const preferredSpace = dropdownPlacement === 'top' ? spaceAbove : spaceBelow;
    const otherSpace = dropdownPlacement === 'top' ? spaceBelow : spaceAbove;
    const flip = preferredSpace < 280 && otherSpace > preferredSpace;
    const dropUp = dropdownPlacement === 'top' ? !flip : flip;
    const width = Math.min(rect.width, Math.max(0, window.innerWidth - viewportPadding * 2));
    setDropdownPos({
      top: dropUp ? rect.top - gap : rect.bottom + gap,
      left: Math.max(viewportPadding, Math.min(rect.left, window.innerWidth - viewportPadding - width)),
      width,
      maxHeight: Math.min(280, dropUp ? spaceAbove : spaceBelow),
      dropUp,
    });
    setPositioned(true);
  }, [dropdownPlacement]);

  // 先于绘制测量位置，避免下拉在左上角闪现后再归位
  useLayoutEffect(() => {
    if (isOpen && !isMobile) updateDropdownPos();
    else setPositioned(false);
  }, [isOpen, isMobile, updateDropdownPos]);

  useEffect(() => {
    if (isOpen) {
      const t = setTimeout(() => inputRef.current?.focus(), 0);
      const onScroll = () => { if (!isMobile) updateDropdownPos(); };
      const onResize = () => { if (!isMobile) updateDropdownPos(); };
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
  }, [isOpen, isMobile, updateDropdownPos]);

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

  const toggleOpen = () => {
    if (disabled) return;
    if (!isOpen) onOpen?.();
    setIsOpen(!isOpen);
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

  const dropdownContent = (
    <>
      <div className="shrink-0 border-b border-slate-200 p-2 dark:border-slate-800">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 z-10 -translate-y-1/2 text-cf-faint" size={16} />
          <input ref={inputRef} data-autofocus type="search" value={searchTerm} onChange={(event) => setSearchTerm(event.target.value)} placeholder={searchPlaceholder} aria-label={searchPlaceholder} className="cf-control cf-mobile-touch h-10 w-full rounded-md pr-3 text-sm" style={{ paddingLeft: '2.25rem' }} />
        </div>
      </div>
      <div role="listbox" aria-label={placeholder} aria-multiselectable={multiple} className="min-h-0 flex-1 overflow-y-auto overscroll-contain" onKeyDown={(event) => {
        if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(event.key)) return;
        const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('button:not([disabled])'));
        if (!buttons.length) return;
        event.preventDefault();
        const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
        const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowDown' ? 1 : -1) + buttons.length) % buttons.length;
        buttons[next]?.focus();
      }}>
        {loading ? <div className="p-4 text-center text-sm text-cf-subtle">加载中...</div> : filteredOptions.length === 0 ? <div className="p-4 text-center text-sm text-cf-subtle">{emptyText}</div> : filteredOptions.map((option) => {
          const selected = value.includes(option.id);
          return (
            <button key={option.id} type="button" role="option" aria-selected={selected} disabled={option.disabled} onClick={() => handleToggle(option.id)} className={cn('cf-mobile-touch flex w-full items-center justify-between gap-2 px-3 py-2 text-left transition-colors', option.disabled ? 'cursor-not-allowed text-slate-300 dark:text-slate-600' : selected ? 'cf-option-active' : 'hover:bg-[var(--cf-surface-muted)] dark:hover:bg-slate-900')}>
              <div className="flex min-w-0 items-center gap-2" style={option.indent ? { paddingLeft: option.indent * 14 } : undefined}>
                {renderAvatar(option)}
                <div className="min-w-0"><div className="truncate text-sm font-medium text-cf-title">{option.label}</div>{option.subLabel ? <div className="truncate text-xs text-cf-subtle">{option.subLabel}</div> : null}</div>
              </div>
              {selected ? <Check className="shrink-0 text-[color:var(--cf-primary-600)] dark:text-[rgb(204,251,241)]" size={16} /> : null}
            </button>
          );
        })}
      </div>
    </>
  );

  return (
    <div ref={triggerRef} className={cn('relative min-w-0 w-full max-w-full', className)}>
      <div
        id={id}
        {...accessibility}
        onClick={toggleOpen}
        role="combobox"
        tabIndex={disabled ? -1 : 0}
        aria-label={placeholder}
        aria-expanded={isOpen}
        aria-haspopup="listbox"
        aria-disabled={disabled}
        onKeyDown={(event) => {
          if (event.target !== event.currentTarget || disabled) return;
          if (event.key === 'Enter' || event.key === ' ') {
            event.preventDefault();
            toggleOpen();
          }
        }}
        className={cn(
          'cf-control cf-mobile-touch flex w-full max-w-full items-center overflow-hidden rounded-md px-3 py-1.5 text-[13px]',
          multiple ? 'min-h-9' : 'h-9 min-h-9',
          disabled ? 'cursor-not-allowed bg-[var(--cf-surface-muted)] dark:bg-slate-900' : 'cursor-pointer',
          isOpen && 'cf-control-active',
        )}
      >
        {selectedOptions.length === 0 ? (
          <span className="text-[13px] text-cf-faint">{placeholder}</span>
        ) : multiple ? (
          <div className="flex w-full flex-wrap items-center gap-1">
            {selectedOptions.map((opt) => (
              <span
                key={opt.id}
                className="inline-flex items-center gap-1 rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-2 py-0.5 text-xs font-medium text-cf-body dark:border-slate-800 dark:bg-slate-900"
              >
                {opt.label}
                {!disabled && (
                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      onRemove(opt.id);
                    }}
                    aria-label={`移除${opt.label}`}
                    className="cf-mobile-touch rounded-md p-0.5 transition hover:bg-slate-200 dark:hover:bg-slate-800"
                  >
                    <X size={12} />
                  </button>
                )}
              </span>
            ))}
          </div>
        ) : (
          <div className="flex w-full min-w-0 items-center justify-between gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 overflow-hidden">
              <span className="min-w-0 truncate text-[13px] text-cf-title">{selectedOptions[0].label}</span>
              {selectedOptions[0].subLabel && (
                <span className="min-w-0 flex-1 truncate text-xs text-cf-faint">{selectedOptions[0].subLabel}</span>
              )}
            </div>
            {allowClear && !disabled && (
              <button
                type="button"
                onClick={handleClear}
                className="cf-mobile-touch rounded-md p-0.5 text-cf-faint transition hover:bg-slate-200 hover:text-cf-body dark:hover:bg-slate-800"
                aria-label="清空"
              >
                <X size={14} />
              </button>
            )}
          </div>
        )}
      </div>

      {isMobile ? (
        <BaseDialog open={isOpen && !disabled} title={placeholder} description={multiple ? `已选择 ${value.length} 项` : undefined} onClose={() => setIsOpen(false)} bodyClassName="!p-0 !overflow-hidden flex flex-col" zIndex={160} footer={multiple ? <Button type="button" onClick={() => setIsOpen(false)}>完成选择</Button> : undefined}>
          {dropdownContent}
        </BaseDialog>
      ) : isOpen && !disabled && positioned && createPortal(
        <>
          <div
            className="fixed inset-0 z-[159]"
            onClick={() => setIsOpen(false)}
          />
          <div
            role="dialog"
            aria-label={placeholder}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setIsOpen(false);
                triggerRef.current?.querySelector<HTMLElement>('[role="combobox"]')?.focus();
              }
            }}
            className={cn(
              // 与通用 Select 浮层保持同级，确保覆盖工作流节点设置面板（100）。
              'cf-floating-panel fixed z-[160] flex flex-col overflow-hidden rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] dark:border-slate-800 dark:bg-slate-950',
            )}
            style={{
              top: dropdownPos.top,
              left: dropdownPos.left,
              width: dropdownPos.width,
              maxHeight: dropdownPos.maxHeight,
              transform: dropdownPos.dropUp ? 'translateY(-100%)' : undefined,
              // 显式阴影：本项目 Tailwind shadow-* 不生效，浮层一律用 CSS box-shadow（与 .select-dropdown-portal 一致）
              boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -4px rgba(0, 0, 0, 0.1)',
            }}
          >
          {dropdownContent}
        </div>
        </>,
        document.body,
      )}
    </div>
  );
};
