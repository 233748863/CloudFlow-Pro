import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown, Search } from 'lucide-react';
import { cn } from '@/utils/cn';

const SELECT_ITEM_DISPLAY_NAME = 'CloudFlowSelectItem';

const isSelectItemType = (type: unknown) => {
  if (!type) {
    return false;
  }

  if (type === SelectItem) {
    return true;
  }

  const candidate = type as {
    __CF_SELECT_ITEM__?: boolean;
    displayName?: string;
    type?: {
      __CF_SELECT_ITEM__?: boolean;
      displayName?: string;
    };
  };

  if (candidate.__CF_SELECT_ITEM__ || candidate.displayName === SELECT_ITEM_DISPLAY_NAME) {
    return true;
  }

  return Boolean(
    candidate.type &&
    (candidate.type.__CF_SELECT_ITEM__ || candidate.type.displayName === SELECT_ITEM_DISPLAY_NAME),
  );
};

const collectSelectLabels = (
  node: React.ReactNode,
  next: Record<string, React.ReactNode> = {},
): Record<string, React.ReactNode> => {
  React.Children.forEach(node, (child) => {
    if (!React.isValidElement<{ children?: React.ReactNode; label?: React.ReactNode; value?: string }>(child)) {
      return;
    }

    if (
      isSelectItemType(child.type) &&
      typeof child.props.value === 'string' &&
      !Object.prototype.hasOwnProperty.call(next, child.props.value)
    ) {
      next[child.props.value] = child.props.label ?? child.props.children;
    }

    if (child.props.children) {
      collectSelectLabels(child.props.children, next);
    }
  });

  return next;
};

const getTextContent = (node: React.ReactNode): string => {
  if (node === null || node === undefined || typeof node === 'boolean') {
    return '';
  }

  if (typeof node === 'string' || typeof node === 'number') {
    return String(node);
  }

  if (Array.isArray(node)) {
    return node.map(getTextContent).join(' ');
  }

  if (React.isValidElement<{ children?: React.ReactNode; label?: React.ReactNode }>(node)) {
    return getTextContent(node.props.label ?? node.props.children);
  }

  return '';
};

const countSelectItems = (node: React.ReactNode): number => {
  let count = 0;

  React.Children.forEach(node, (child) => {
    if (!React.isValidElement<{ children?: React.ReactNode }>(child)) {
      return;
    }

    if (isSelectItemType(child.type)) {
      count += 1;
      return;
    }

    if (child.props.children) {
      count += countSelectItems(child.props.children);
    }
  });

  return count;
};

const filterSelectChildren = (
  node: React.ReactNode,
  normalizedQuery: string,
): { children: React.ReactNode; count: number } => {
  let count = 0;

  const children = React.Children.map(node, (child) => {
    if (!React.isValidElement<{ children?: React.ReactNode; label?: React.ReactNode }>(child)) {
      return child;
    }

    if (isSelectItemType(child.type)) {
      const text = getTextContent(child.props.label ?? child.props.children).toLowerCase();
      const matched = !normalizedQuery || text.includes(normalizedQuery);
      if (matched) {
        count += 1;
        return child;
      }
      return null;
    }

    if (!child.props.children) {
      return child;
    }

    const filtered = filterSelectChildren(child.props.children, normalizedQuery);
    count += filtered.count;

    if (normalizedQuery && filtered.count === 0) {
      return null;
    }

    return React.cloneElement(child, undefined, filtered.children);
  });

  return { children, count };
};

const SelectContext = React.createContext<{
  value?: string;
  onValueChange?: (value: string) => void;
  disabled: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  labels: Record<string, React.ReactNode>;
  registerLabel: (value: string, label: React.ReactNode) => void;
  searchable: boolean;
  searchQuery: string;
  setSearchQuery: (query: string) => void;
  searchPlaceholder: string;
  emptyText: string;
  containerRef: React.RefObject<HTMLDivElement | null>;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
}>({
  disabled: false,
  open: false,
  setOpen: () => {},
  labels: {},
  registerLabel: () => {},
  searchable: false,
  searchQuery: '',
  setSearchQuery: () => {},
  searchPlaceholder: '搜索...',
  emptyText: '没有匹配的选项',
  containerRef: { current: null },
  dropdownRef: { current: null },
});

export const Select = ({
  children,
  value,
  onValueChange,
  disabled = false,
  searchable = 'auto',
  searchPlaceholder = '搜索...',
  emptyText = '没有匹配的选项',
}: {
  children: React.ReactNode;
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
  searchable?: boolean | 'auto';
  searchPlaceholder?: string;
  emptyText?: string;
}) => {
  const [open, setOpen] = useState(false);
  const [labels, setLabels] = useState<Record<string, React.ReactNode>>({});
  const [searchQuery, setSearchQuery] = useState('');
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const staticLabels = React.useMemo(() => collectSelectLabels(children), [children]);
  const optionCount = React.useMemo(() => countSelectItems(children), [children]);
  const mergedLabels = React.useMemo(
    () => ({ ...staticLabels, ...labels }),
    [staticLabels, labels],
  );
  const searchEnabled = searchable === 'auto' ? optionCount > 5 : searchable;

  const registerLabel = useCallback((val: string, label: React.ReactNode) => {
    setLabels((prev) => {
      if (prev[val] === label) return prev;
      return { ...prev, [val]: label };
    });
  }, []);

  useEffect(() => {
    if (!open) return;

    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (containerRef.current?.contains(target)) return;
      if (dropdownRef.current?.contains(target)) return;
      setOpen(false);
    };

    const handleEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside, true);
    window.addEventListener('keydown', handleEscape);

    return () => {
      document.removeEventListener('mousedown', handleClickOutside, true);
      window.removeEventListener('keydown', handleEscape);
    };
  }, [open]);

  useEffect(() => {
    if (!open) {
      setSearchQuery('');
    }
  }, [open]);

  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
    }
  }, [disabled, open]);

  return (
    <SelectContext.Provider
      value={{
        value,
        onValueChange,
        disabled,
        open,
        setOpen,
        labels: mergedLabels,
        registerLabel,
        searchable: searchEnabled,
        searchQuery,
        setSearchQuery,
        searchPlaceholder,
        emptyText,
        containerRef,
        dropdownRef,
      }}
    >
      <div className={cn('relative', open ? 'z-[120]' : 'z-0')} ref={containerRef}>
        {children}
      </div>
    </SelectContext.Provider>
  );
};

export const SelectTrigger = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => {
  const { setOpen, open, disabled } = React.useContext(SelectContext);
  const hasExplicitWidth = className
    .split(/\s+/)
    .some((token) => token.split(':').pop()?.startsWith('w-'));

  return (
    <button
      type="button"
      disabled={disabled}
      aria-expanded={open}
      aria-haspopup="listbox"
      className={cn(
        'select-trigger cf-control flex h-9 min-h-9 items-center justify-between rounded-md px-3 py-1.5 text-left text-[13px]',
        !hasExplicitWidth && 'w-full',
        open && 'select-trigger-open cf-control-active',
        disabled && 'select-trigger-disabled',
        className,
      )}
      onClick={() => {
        if (disabled) return;
        setOpen(!open);
      }}
      onKeyDown={(event) => {
        if (disabled) return;
        if (event.key === 'ArrowDown' || event.key === 'ArrowUp' || event.key === 'Enter' || event.key === ' ') {
          event.preventDefault();
          setOpen(true);
        }
      }}
    >
      {children}
      <span className="select-icon ml-2 shrink-0">
        <ChevronDown
          size={16}
          className={cn(
            'transition-transform duration-200',
            open && 'rotate-180 text-[color:var(--cf-primary-600)] dark:text-[color:rgb(204_251_241)]',
          )}
        />
      </span>
    </button>
  );
};

export const SelectValue = ({ placeholder }: { placeholder?: string }) => {
  const { value, labels } = React.useContext(SelectContext);
  const hasRegisteredEmptyValue = Object.prototype.hasOwnProperty.call(labels, '');
  const hasValue = value !== undefined && (value !== '' || hasRegisteredEmptyValue);
  const displayValue = hasValue ? (labels[value as string] ?? value) : placeholder;

  return (
    <span
      className={cn(
        'select-value min-w-0 flex-1 truncate',
        hasValue ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500',
      )}
    >
      {displayValue}
    </span>
  );
};

export const SelectContent = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => {
  const {
    open,
    searchable,
    searchQuery,
    setSearchQuery,
    searchPlaceholder,
    emptyText,
    setOpen,
    containerRef,
    dropdownRef,
  } = React.useContext(SelectContext);
  const [placement, setPlacement] = useState({
    top: 0,
    left: 0,
    width: 192,
    maxHeight: 256,
  });
  const [positionReady, setPositionReady] = useState(false);
  const measurementPassRef = useRef(0);
  const searchInputRef = useRef<HTMLInputElement>(null);

  const explicitWidth = className
    .split(/\s+/)
    .some((token) => {
      const base = token.split(':').pop() || '';
      return base.startsWith('w-') || base.startsWith('min-w-') || base.startsWith('max-w-');
    });

  const updatePlacement = useCallback(() => {
    if (!containerRef.current) {
      setPositionReady(false);
      return;
    }

    const rect = containerRef.current.getBoundingClientRect();
    const viewportPadding = 12;
    const defaultWidth = Math.max(rect.width, 192);
    const measuredDropdownHeight = dropdownRef.current?.offsetHeight ?? 0;
    const hasMeasuredDropdown = measuredDropdownHeight > 0;
    const dropdownWidth = explicitWidth
      ? (dropdownRef.current?.offsetWidth ?? defaultWidth)
      : defaultWidth;
    const dropdownHeight = hasMeasuredDropdown ? measuredDropdownHeight : 260;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const dropUp = spaceBelow < Math.min(dropdownHeight, 256) && spaceAbove > spaceBelow;
    const maxHeight = Math.min(320, Math.max(120, (dropUp ? spaceAbove : spaceBelow) - 6));
    const renderedHeight = Math.min(dropdownHeight, maxHeight);

    let left = rect.left;
    if (left + dropdownWidth > window.innerWidth - viewportPadding) {
      left = Math.max(viewportPadding, window.innerWidth - dropdownWidth - viewportPadding);
    }

    const top = dropUp
      ? Math.max(viewportPadding, rect.top - renderedHeight - 6)
      : rect.bottom + 6;

    setPlacement({
      top,
      left,
      width: defaultWidth,
      maxHeight,
    });
    measurementPassRef.current += 1;
    setPositionReady(hasMeasuredDropdown && measurementPassRef.current >= 2);
  }, [containerRef, dropdownRef, explicitWidth]);

  useLayoutEffect(() => {
    if (!open) {
      measurementPassRef.current = 0;
      setPositionReady(false);
      return;
    }

    measurementPassRef.current = 0;
    setPositionReady(false);
    updatePlacement();
    let rafId = window.requestAnimationFrame(() => {
      updatePlacement();
      rafId = window.requestAnimationFrame(updatePlacement);
    });
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);

    return () => {
      measurementPassRef.current = 0;
      window.cancelAnimationFrame(rafId);
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
  }, [open, updatePlacement]);

  useEffect(() => {
    if (open && searchable && positionReady) {
      searchInputRef.current?.focus();
    }
  }, [open, positionReady, searchable]);

  if (!open || typeof document === 'undefined') {
    return null;
  }

  const normalizedQuery = searchQuery.trim().toLowerCase();
  const filtered = filterSelectChildren(children, normalizedQuery);

  return createPortal(
    <div
      ref={dropdownRef}
      role="listbox"
      className={cn(
        'select-dropdown-portal fixed z-[160] overflow-hidden rounded-md border border-slate-200 bg-[var(--cf-surface-strong)] text-slate-900 shadow-none dark:border-slate-800 dark:bg-slate-950 dark:text-slate-100 dark:shadow-none',
        className,
      )}
      style={{
        top: placement.top,
        left: placement.left,
        width: explicitWidth ? undefined : placement.width,
        maxHeight: placement.maxHeight,
        visibility: positionReady ? 'visible' : 'hidden',
        pointerEvents: positionReady ? undefined : 'none',
      }}
    >
      {searchable ? (
        <div className="select-search">
          <Search size={16} className="shrink-0 text-slate-400" />
          <input
            ref={searchInputRef}
            className="select-search-input cf-control"
            value={searchQuery}
            type="text"
            placeholder={searchPlaceholder}
            onChange={(event) => setSearchQuery(event.target.value)}
            onClick={(event) => event.stopPropagation()}
            onKeyDown={(event) => {
              if (event.key === 'Escape') {
                event.preventDefault();
                setOpen(false);
              }
            }}
          />
        </div>
      ) : null}
      <div className="select-options">
        {filtered.count > 0 ? filtered.children : <div className="select-empty">{emptyText}</div>}
      </div>
    </div>,
    document.body,
  );
};

type SelectItemProps = {
  children: React.ReactNode;
  value: string;
  label?: React.ReactNode;
  className?: string;
  disabled?: boolean;
};

type SelectItemComponent = React.FC<SelectItemProps> & {
  __CF_SELECT_ITEM__?: boolean;
};

export const SelectItem: SelectItemComponent = ({ children, value, label, className = '', disabled = false }) => {
  const { value: selectedValue, onValueChange, setOpen, registerLabel } = React.useContext(SelectContext);
  const isSelected = selectedValue === value;

  useEffect(() => {
    registerLabel(value, label ?? children);
  }, [value, children, label, registerLabel]);

  return (
    <div
      role="option"
      aria-selected={isSelected}
      className={cn(
        'select-option relative flex w-full cursor-pointer items-center justify-between gap-2 px-3 py-2 text-[13px] transition-colors',
        disabled && 'select-option-disabled cursor-not-allowed opacity-40',
        isSelected
          ? 'select-option-selected cf-option-active'
          : 'text-slate-700 hover:bg-[var(--cf-surface-muted)] hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white',
        className,
      )}
      onClick={() => {
        if (disabled) return;
        onValueChange?.(value);
        setOpen(false);
      }}
    >
      <div className="select-option-label min-w-0 flex-1 overflow-hidden text-left">{children}</div>
      {isSelected ? (
        <Check size={16} className="select-check shrink-0 text-[color:var(--cf-primary-600)] dark:text-[color:rgb(204_251_241)]" />
      ) : null}
    </div>
  );
};

SelectItem.displayName = SELECT_ITEM_DISPLAY_NAME;
SelectItem.__CF_SELECT_ITEM__ = true;
