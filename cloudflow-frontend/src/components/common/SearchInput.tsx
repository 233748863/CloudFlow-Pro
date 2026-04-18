import React, { useEffect } from 'react';
import { Search } from 'lucide-react';
import { Input } from '@/components/ui';
import { cn } from '@/utils/cn';

interface SearchInputProps
  extends Omit<React.InputHTMLAttributes<HTMLInputElement>, 'value' | 'onChange'> {
  value: string;
  placeholder?: string;
  debounceMs?: number;
  onChange: (value: string) => void;
  onSearch?: (value: string) => void;
  className?: string;
  inputClassName?: string;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  placeholder = '搜索',
  debounceMs = 300,
  onChange,
  onSearch,
  className,
  inputClassName,
  ...props
}) => {
  useEffect(() => {
    if (!onSearch) {
      return;
    }

    const timer = window.setTimeout(() => {
      onSearch(value);
    }, debounceMs);

    return () => {
      window.clearTimeout(timer);
    };
  }, [debounceMs, onSearch, value]);

  return (
    <div className={cn('relative w-full', className)}>
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <Search size={16} className="text-slate-400" />
      </div>
      <Input
        value={value}
        type="text"
        className={cn('pl-10', inputClassName)}
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
        {...props}
      />
    </div>
  );
};
