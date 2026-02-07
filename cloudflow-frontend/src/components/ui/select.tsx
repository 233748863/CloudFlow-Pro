import React, { useState, useEffect, useCallback } from 'react';

const SelectContext = React.createContext<{
  value?: string;
  onValueChange?: (value: string) => void;
  open: boolean;
  setOpen: (open: boolean) => void;
  labels: Record<string, React.ReactNode>;
  registerLabel: (value: string, label: React.ReactNode) => void;
}>({
  open: false,
  setOpen: () => {},
  labels: {},
  registerLabel: () => {},
});

export const Select = ({ children, value, onValueChange }: { children: React.ReactNode; value?: string; onValueChange?: (value: string) => void }) => {
  const [open, setOpen] = useState(false);
  const [labels, setLabels] = useState<Record<string, React.ReactNode>>({});

  const registerLabel = useCallback((val: string, label: React.ReactNode) => {
    setLabels((prev) => {
      if (prev[val] === label) return prev;
      return { ...prev, [val]: label };
    });
  }, []);

  return (
    <SelectContext.Provider value={{ value, onValueChange, open, setOpen, labels, registerLabel }}>
      <div className="relative">{children}</div>
    </SelectContext.Provider>
  );
};

export const SelectTrigger = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => {
  const { setOpen, open } = React.useContext(SelectContext);
  return (
    <button
      type="button"
      className={`flex h-10 w-full items-center justify-between rounded-md border border-slate-200 bg-white px-3 py-2 text-sm ring-offset-background placeholder:text-slate-500 focus:outline-none focus:ring-2 focus:ring-slate-950 focus:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${className}`}
      onClick={() => setOpen(!open)}
    >
      {children}
    </button>
  );
};

export const SelectValue = ({ placeholder }: { placeholder?: string }) => {
  const { value, labels } = React.useContext(SelectContext);
  return <span>{value ? labels[value] || value : placeholder}</span>;
};

export const SelectContent = ({ children, className = '' }: { children: React.ReactNode; className?: string }) => {
  const { open } = React.useContext(SelectContext);
  if (!open) return null;
  return (
    <div className={`absolute z-50 min-w-[8rem] overflow-hidden rounded-md border border-slate-200 bg-white text-slate-950 shadow-md animate-in fade-in-80 ${className} top-full mt-1 w-full`}>
      <div className="p-1">{children}</div>
    </div>
  );
};

export const SelectItem = ({ children, value, className = '' }: { children: React.ReactNode; value: string; className?: string }) => {
  const { onValueChange, setOpen, registerLabel } = React.useContext(SelectContext);
  
  useEffect(() => {
    registerLabel(value, children);
  }, [value, children, registerLabel]);

  return (
    <div
      className={`relative flex w-full cursor-default select-none items-center rounded-sm py-1.5 pl-8 pr-2 text-sm outline-none hover:bg-slate-100 focus:bg-slate-100 focus:text-slate-900 data-[disabled]:pointer-events-none data-[disabled]:opacity-50 ${className}`}
      onClick={() => {
        onValueChange?.(value);
        setOpen(false);
      }}
    >
      {children}
    </div>
  );
};
