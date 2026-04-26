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
    <div className={cn('cf-tabs min-h-11', className)}>
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
  className = '' 
}: { 
  children: React.ReactNode; 
  value: string; 
  className?: string;
}) => {
  const { value: selectedValue, onValueChange } = useContext(TabsContext);
  const isActive = selectedValue === value;

  return (
    <button
      type="button"
      className={cn(
        'cf-tab disabled:pointer-events-none disabled:opacity-50',
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
    <div className={cn('mt-3', className)}>
      {children}
    </div>
  );
};
