import { useState, useEffect, useRef } from "react";
import { Input } from "../common/input";

/**
 * P2-4: 减少历史撤销记录污染的本地化受控组件。
 * 默认行为：本地维护 val，blur 或 Enter 时提交给上层 onChange。
 * 当传入 `delay`（>0）时启用 debounce：每次输入后 delay 毫秒未再输入则自动提交，
 * blur/Enter 仍作为兜底立即提交。长描述场景建议传 500ms 减少 onBlur 等待感。
 */
interface LazyInputCommonProps {
  value: any;
  onChange: (value: any) => void;
  delay?: number;
}

export const LazyInput = ({
  value,
  onChange,
  delay,
  ...props
}: LazyInputCommonProps & Record<string, any>) => {
  const [val, setVal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setVal(value);
  }, [value]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const commit = (next: any) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onChange(next);
  };

  return (
    <Input
      {...props}
      value={val || ""}
      onChange={(e: any) => {
        const next = e.target.value;
        setVal(next);
        if (typeof delay === "number" && delay > 0) {
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => commit(next), delay);
        }
      }}
      onBlur={() => commit(val)}
      onKeyDown={(e: any) => {
        if (e.key === "Enter") commit(val);
      }}
    />
  );
};

interface LazyTextareaProps {
  value: any;
  onChange: (value: any) => void;
  delay?: number;
  className?: string;
}

export const LazyTextarea = ({
  value,
  onChange,
  delay,
  className,
  ...props
}: LazyTextareaProps & Record<string, any>) => {
  const [val, setVal] = useState(value);
  const timerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    setVal(value);
  }, [value]);

  useEffect(
    () => () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    },
    [],
  );

  const commit = (next: any) => {
    if (timerRef.current) {
      clearTimeout(timerRef.current);
      timerRef.current = null;
    }
    onChange(next);
  };

  return (
    <textarea
      {...props}
      className={`min-h-[88px] w-full rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm text-slate-700 outline-none transition-all placeholder:text-slate-400 focus:border-slate-400 focus:ring-2 focus:ring-slate-200 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-200 dark:placeholder:text-slate-500 dark:focus:border-slate-500 dark:focus:ring-slate-800 ${className || ""}`}
      value={val || ""}
      onChange={(e: any) => {
        const next = e.target.value;
        setVal(next);
        if (typeof delay === "number" && delay > 0) {
          if (timerRef.current) clearTimeout(timerRef.current);
          timerRef.current = setTimeout(() => commit(next), delay);
        }
      }}
      onBlur={() => commit(val)}
    />
  );
};
