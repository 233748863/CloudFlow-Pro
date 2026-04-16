import React, { useState, useEffect, useCallback, useRef } from 'react';
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
}>({
  disabled: false,
  open: false,
  setOpen: () => {},
  labels: {},
  registerLabel: () => {},
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

  const registerLabel = useCallback((val: string, label: React.ReactNode) => {
    setLabels((prev) => {
      if (prev[val] === label) return prev;
      return { ...prev, [val]: label };
    });
  }, []);

  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [open]);

  useEffect(() => {
    if (disabled && open) {
      setOpen(false);
    }
  }, [disabled, open]);

  return (
    <SelectContext.Provider value={{ value, onValueChange, disabled, open, setOpen, labels, registerLabel }}>
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
        'cf-glass-input flex h-11 items-center justify-between rounded-2xl px-3.5 py-2 text-left text-sm text-slate-700 transition-all hover:border-pink-100 focus:outline-none focus:ring-2 focus:ring-pink-300 focus:ring-offset-1 focus:border-white/90 disabled:cursor-not-allowed disabled:opacity-50',
        !hasExplicitWidth && 'w-full',
        open && 'ring-2 ring-pink-300 border-white/90',
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
          open && 'rotate-180 text-pink-500',
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
    <span className={cn('min-w-0 flex-1 truncate', hasValue ? 'text-slate-900' : 'text-slate-400')}>
      {displayValue}
    </span>
  );
};

export const SelectContent = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => {
  const { open } = React.useContext(SelectContext);

  return (
    <div
      className={cn(
        'absolute top-full z-[130] mt-1 w-full min-w-[12rem] overflow-hidden rounded-[24px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.92),rgba(248,250,252,0.8))] text-slate-900 shadow-[0_18px_36px_rgba(15,23,42,0.12),inset_0_1px_0_rgba(255,255,255,0.72)] backdrop-blur-2xl',
        open ? 'max-h-64 overflow-y-auto' : 'invisible pointer-events-none h-0 overflow-hidden border-0 p-0 m-0',
        className,
      )}
      style={open ? undefined : { position: 'absolute', width: 0, height: 0, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}
    >
      <div className="p-1.5">{children}</div>
    </div>
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
        'relative flex w-full cursor-pointer items-center rounded-[18px] py-2.5 pl-8 pr-3 text-sm transition-colors',
        isSelected
          ? 'bg-[linear-gradient(135deg,rgba(244,114,182,0.16),rgba(236,72,153,0.08))] text-pink-700 font-medium'
          : 'text-slate-700 hover:bg-white hover:text-pink-600',
        className,
      )}
      onClick={() => {
        onValueChange?.(value);
        setOpen(false);
      }}
    >
      {isSelected ? (
        <span className="absolute left-2.5 flex h-4 w-4 items-center justify-center">
          <Check size={14} className="text-pink-500" />
        </span>
      ) : null}
      {children}
    </div>
  );
};
