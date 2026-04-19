/**
 * Tabs - 标签页组件
 * 
 * 用于在多个内容面板之间切换
 */
import React, { useState, createContext, useContext } from 'react';

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
    <div className={`inline-flex min-h-11 items-center justify-center rounded-xl border border-slate-200 bg-slate-50 p-1 text-slate-500 shadow-sm ${className}`}>
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
      className={`inline-flex items-center justify-center whitespace-nowrap rounded-lg px-3.5 py-2 text-sm font-medium ring-offset-white transition-all duration-200 ease-in-out focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/30 focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50 ${
        isActive 
          ? 'border border-slate-200 bg-white text-cyan-700 shadow-sm' 
          : 'text-slate-500 hover:bg-white hover:text-slate-900'
      } ${className}`}
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
    <div className={`mt-3 ring-offset-background focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-cyan-500/30 focus-visible:ring-offset-2 ${className}`}>
      {children}
    </div>
  );
};
