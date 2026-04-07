import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Check, ChevronDown } from 'lucide-react';

// Select 上下文，管理打开状态、选中值、标签映射
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

/**
 * Select 根组件
 * 管理下拉框的打开/关闭状态和选中值
 */
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

  // 点击外部区域关闭下拉框
  useEffect(() => {
    if (!open) return;
    const handleClickOutside = (e: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
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
      <div className={`relative ${open ? 'z-[120]' : 'z-0'}`} ref={containerRef}>{children}</div>
    </SelectContext.Provider>
  );
};

/**
 * SelectTrigger - 触发按钮
 * 点击展开/收起下拉列表
 */
export const SelectTrigger = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => {
  const { setOpen, open, disabled } = React.useContext(SelectContext);
  // 允许页面通过 className 显式控制宽度，避免固定的 w-full 把触发器宽度挤塌。
  const hasExplicitWidth = className
    .split(/\s+/)
    .some((token) => token.split(':').pop()?.startsWith('w-'));

  return (
    <button
      type="button"
      disabled={disabled}
      className={`flex h-10 items-center justify-between rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm transition-colors hover:border-pink-300 focus:outline-none focus:ring-2 focus:ring-pink-400 focus:ring-offset-1 focus:border-slate-200 disabled:cursor-not-allowed disabled:opacity-50 ${hasExplicitWidth ? '' : 'w-full'} ${className}`}
      onClick={() => {
        if (disabled) return;
        setOpen(!open);
      }}
    >
      {children}
      <ChevronDown size={16} className={`ml-2 text-slate-400 transition-transform duration-200 ${open ? 'rotate-180' : ''}`} />
    </button>
  );
};

/**
 * SelectValue - 显示当前选中值
 * 未选中时显示 placeholder
 */
export const SelectValue = ({ placeholder }: { placeholder?: string }) => {
  const { value, labels } = React.useContext(SelectContext);
  const hasRegisteredEmptyValue = Object.prototype.hasOwnProperty.call(labels, '');
  const hasValue = value !== undefined && (value !== '' || hasRegisteredEmptyValue);
  const displayValue = hasValue ? (labels[value as string] ?? value) : placeholder;
  return (
    <span className={`min-w-0 flex-1 truncate ${hasValue ? 'text-slate-900' : 'text-slate-400'}`}>
      {displayValue}
    </span>
  );
};

/**
 * SelectContent - 下拉列表容器
 * 始终渲染子元素以注册标签映射，关闭时隐藏
 */
export const SelectContent = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => {
  const { open } = React.useContext(SelectContext);
  return (
    <div
      className={`absolute z-[130] min-w-[8rem] max-h-60 overflow-y-auto rounded-lg border border-slate-200 bg-white text-slate-900 shadow-lg ${className} top-full mt-1 w-full ${
        open ? '' : 'invisible pointer-events-none h-0 overflow-hidden border-0 p-0 m-0'
      }`}
      style={open ? undefined : { position: 'absolute', width: 0, height: 0, overflow: 'hidden', clip: 'rect(0,0,0,0)' }}
    >
      <div className="p-1">{children}</div>
    </div>
  );
};

/**
 * SelectItem - 下拉选项
 * 选中项显示粉色背景和勾选图标
 */
export const SelectItem: React.FC<{ children: React.ReactNode; value: string; className?: string }> = ({ children, value, className = '' }) => {
  const { value: selectedValue, onValueChange, setOpen, registerLabel } = React.useContext(SelectContext);
  const isSelected = selectedValue === value;

  useEffect(() => {
    registerLabel(value, children);
  }, [value, children, registerLabel]);

  return (
    <div
      className={`relative flex w-full cursor-pointer items-center rounded-md py-2 pl-8 pr-2 text-sm transition-colors ${
        isSelected
          ? 'bg-pink-50 text-pink-700 font-medium'
          : 'hover:bg-pink-50/60 text-slate-700'
      } ${className}`}
      onClick={() => {
        onValueChange?.(value);
        setOpen(false);
      }}
    >
      {/* 选中勾选标记 */}
      {isSelected && (
        <span className="absolute left-2 flex h-4 w-4 items-center justify-center">
          <Check size={14} className="text-pink-500" />
        </span>
      )}
      {children}
    </div>
  );
};
