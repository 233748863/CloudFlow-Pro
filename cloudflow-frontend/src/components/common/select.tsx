import React, { useState, useEffect, useLayoutEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
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

const SelectContext = React.createContext<{
  value?: string;
  onValueChange?: (value: string) => void;
  disabled: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  labels: Record<string, React.ReactNode>;
  registerLabel: (value: string, label: React.ReactNode) => void;
  containerRef: React.RefObject<HTMLDivElement | null>;
  dropdownRef: React.RefObject<HTMLDivElement | null>;
}>({
  disabled: false,
  open: false,
  setOpen: () => {},
  labels: {},
  registerLabel: () => {},
  containerRef: { current: null },
  dropdownRef: { current: null },
});

export const Select = ({
  children,
  value,
  onValueChange,
  disabled = false,
}: {
  children: React.ReactNode;
  value?: string;
  onValueChange?: (value: string) => void;
  disabled?: boolean;
}) => {
  const [open, setOpen] = useState(false);
  const [labels, setLabels] = useState<Record<string, React.ReactNode>>({});
  const containerRef = useRef<HTMLDivElement>(null);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const staticLabels = React.useMemo(() => collectSelectLabels(children), [children]);
  const mergedLabels = React.useMemo(
    () => ({ ...staticLabels, ...labels }),
    [staticLabels, labels],
  );

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
        'cf-control flex !h-10 min-h-10 items-center justify-between rounded-xl px-4 py-2.5 text-left text-sm',
        !hasExplicitWidth && 'w-full',
        open && 'cf-control-active',
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
      <ChevronDown
        size={16}
        className={cn(
          'ml-2 shrink-0 text-slate-400 transition-transform duration-200',
          open && 'rotate-180 text-[color:var(--cf-primary-600)] dark:text-[color:rgb(204_251_241)]',
        )}
      />
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
        'min-w-0 flex-1 truncate',
        hasValue ? 'text-slate-900 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500',
      )}
    >
      {displayValue}
    </span>
  );
};

export const SelectContent = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => {
  const { open, containerRef, dropdownRef } = React.useContext(SelectContext);
  const [placement, setPlacement] = useState({
    top: 0,
    left: 0,
    width: 192,
    maxHeight: 256,
  });
  const [positionReady, setPositionReady] = useState(false);
  const measurementPassRef = useRef(0);

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

  if (!open || typeof document === 'undefined') {
    return null;
  }

  return createPortal(
    <div
      ref={dropdownRef}
      role="listbox"
      className={cn(
        'fixed z-[160] overflow-y-auto rounded-xl border border-slate-200 bg-white text-slate-900 shadow-[0_18px_36px_rgba(15,23,42,0.12)]',
        'dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:shadow-[0_18px_36px_rgba(2,6,23,0.5)]',
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
      <div className="p-1.5">{children}</div>
    </div>,
    document.body,
  );
};

type SelectItemProps = {
  children: React.ReactNode;
  value: string;
  label?: React.ReactNode;
  className?: string;
};

type SelectItemComponent = React.FC<SelectItemProps> & {
  __CF_SELECT_ITEM__?: boolean;
};

export const SelectItem: SelectItemComponent = ({ children, value, label, className = '' }) => {
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
        'relative flex w-full cursor-pointer items-center rounded-lg py-2.5 pl-8 pr-3 text-sm transition-colors',
        isSelected
          ? 'cf-option-active'
          : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-800 dark:hover:text-white',
        className,
      )}
      onClick={() => {
        onValueChange?.(value);
        setOpen(false);
      }}
    >
      {isSelected ? (
        <span className="absolute left-2.5 flex h-4 w-4 items-center justify-center">
          <Check size={14} className="text-[color:var(--cf-primary-600)] dark:text-[color:rgb(204_251_241)]" />
        </span>
      ) : null}
      {children}
    </div>
  );
};

SelectItem.displayName = SELECT_ITEM_DISPLAY_NAME;
SelectItem.__CF_SELECT_ITEM__ = true;
