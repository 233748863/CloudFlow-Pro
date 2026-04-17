import React, { useEffect } from 'react';
import { Search } from 'lucide-react';

interface SearchInputProps {
  value: string;
  placeholder?: string;
  debounceMs?: number;
  onChange: (value: string) => void;
  onSearch?: (value: string) => void;
}

export const SearchInput: React.FC<SearchInputProps> = ({
  value,
  placeholder = '搜索',
  debounceMs = 300,
  onChange,
  onSearch,
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
    <div className="relative w-full">
      <div className="pointer-events-none absolute inset-y-0 left-0 flex items-center pl-3">
        <Search size={16} className="text-slate-400" />
      </div>
      <input
        value={value}
        type="text"
        className="h-10 w-full rounded-xl border border-slate-200 bg-white pl-10 pr-4 text-sm text-slate-900 shadow-sm transition-all placeholder:text-slate-400 hover:border-slate-300 focus:border-teal-500 focus:outline-none focus:ring-2 focus:ring-teal-500/25"
        placeholder={placeholder}
        onChange={(event) => onChange(event.target.value)}
      />
    </div>
  );
};
