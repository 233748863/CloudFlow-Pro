import React, { useState, useEffect, useCallback, useRef } from 'react';
import { createPortal } from 'react-dom';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';

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
        labels,
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
      className={cn(
        'cf-control flex h-11 items-center justify-between rounded-xl px-4 py-2.5 text-left text-sm',
        !hasExplicitWidth && 'w-full',
        open && 'cf-control-active',
        className,
      )}
      onClick={() => {
        if (disabled) return;
        setOpen(!open);
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

  const explicitWidth = className
    .split(/\s+/)
    .some((token) => {
      const base = token.split(':').pop() || '';
      return base.startsWith('w-') || base.startsWith('min-w-') || base.startsWith('max-w-');
    });

  const updatePlacement = useCallback(() => {
    if (!containerRef.current) return;

    const rect = containerRef.current.getBoundingClientRect();
    const viewportPadding = 12;
    const defaultWidth = Math.max(rect.width, 192);
    const dropdownWidth = explicitWidth
      ? (dropdownRef.current?.offsetWidth ?? defaultWidth)
      : defaultWidth;
    const dropdownHeight = dropdownRef.current?.offsetHeight ?? 260;
    const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
    const spaceAbove = rect.top - viewportPadding;
    const dropUp = spaceBelow < Math.min(dropdownHeight, 256) && spaceAbove > spaceBelow;
    const maxHeight = Math.max(120, (dropUp ? spaceAbove : spaceBelow) - 6);
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
  }, [containerRef, dropdownRef, explicitWidth]);

  useEffect(() => {
    if (!open) return;

    const rafId = window.requestAnimationFrame(updatePlacement);
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);

    return () => {
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
      }}
    >
      <div className="p-1.5">{children}</div>
    </div>,
    document.body,
  );
};

export const SelectItem: React.FC<{ children: React.ReactNode; value: string; className?: string }> = ({ children, value, className = '' }) => {
  const { value: selectedValue, onValueChange, setOpen, registerLabel } = React.useContext(SelectContext);
  const isSelected = selectedValue === value;

  useEffect(() => {
    registerLabel(value, children);
  }, [value, children, registerLabel]);

  return (
    <div
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
