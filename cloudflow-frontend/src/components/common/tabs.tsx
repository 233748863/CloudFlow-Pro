/**
 * Tabs - 标签页组件
 * 
 * 用于在多个内容面板之间切换
 */
import React, { useState, createContext, useContext } from 'react';
import { cn } from '@/utils/cn';

// 创建 Tabs 上下文
const TabsContext = createContext<{
  value: string;
  onValueChange: (value: string) => void;
}>({
  value: '',
  onValueChange: () => {},
});

/**
 * Tabs - 标签页容器组件
 */
export const Tabs = ({ 
  children, 
  defaultValue, 
  value: controlledValue, 
  onValueChange,
  className = '' 
}: { 
  children: React.ReactNode; 
  defaultValue?: string;
  value?: string;
  onValueChange?: (value: string) => void;
  className?: string;
}) => {
  const [uncontrolledValue, setUncontrolledValue] = useState(defaultValue || '');
  const isControlled = controlledValue !== undefined;
  const value = isControlled ? controlledValue : uncontrolledValue;

  const handleValueChange = (newValue: string) => {
    if (!isControlled) {
      setUncontrolledValue(newValue);
    }
    onValueChange?.(newValue);
  };

  return (
    <TabsContext.Provider value={{ value, onValueChange: handleValueChange }}>
      <div className={className}>{children}</div>
    </TabsContext.Provider>
  );
};

/**
 * TabsList - 标签页列表容器
 */
export const TabsList = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => {
  return (
    <div role="tablist" className={cn('cf-tabs cf-responsive-tabs min-h-11', className)} onKeyDown={(event) => {
      if (!['ArrowLeft', 'ArrowRight', 'Home', 'End'].includes(event.key)) return;
      const buttons = Array.from(event.currentTarget.querySelectorAll<HTMLButtonElement>('[role="tab"]:not([disabled])'));
      if (!buttons.length) return;
      const current = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'Home' ? 0 : event.key === 'End' ? buttons.length - 1 : (current + (event.key === 'ArrowRight' ? 1 : -1) + buttons.length) % buttons.length;
      event.preventDefault();
      buttons[next]?.focus();
      buttons[next]?.click();
      buttons[next]?.scrollIntoView({ block: 'nearest', inline: 'nearest' });
    }}>
      {children}
    </div>
  );
};

/**
 * TabsTrigger - 标签页触发器（标签按钮）
 */
export const TabsTrigger = ({ 
  children, 
  value, 
  disabled = false,
  className = '' 
}: { 
  children: React.ReactNode; 
  value: string; 
  disabled?: boolean;
  className?: string;
}) => {
  const { value: selectedValue, onValueChange } = useContext(TabsContext);
  const isActive = selectedValue === value;

  return (
    <button
      type="button"
      role="tab"
      aria-selected={isActive}
      disabled={disabled}
      className={cn(
        'cf-tab cf-mobile-touch shrink-0 disabled:pointer-events-none disabled:opacity-50',
        isActive ? 'cf-tab-active' : '',
        className,
      )}
      onClick={() => onValueChange(value)}
    >
      {children}
    </button>
  );
};

/**
 * TabsContent - 标签页内容面板
 */
export const TabsContent = ({ 
  children, 
  value, 
  className = '' 
}: { 
  children: React.ReactNode; 
  value: string; 
  className?: string;
}) => {
  const { value: selectedValue } = useContext(TabsContext);
  
  if (selectedValue !== value) {
    return null;
  }

  return (
    <div role="tabpanel" className={cn('mt-3', className)}>
      {children}
    </div>
  );
};
