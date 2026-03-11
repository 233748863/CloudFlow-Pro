import React, { useState, useRef, useEffect, useCallback } from 'react';
import { ChevronLeft, ChevronRight, Calendar, Clock, X } from 'lucide-react';

// ==================== 类型定义 ====================

/** 选择器模式：仅日期、仅时间、日期+时间 */
type PickerMode = 'date' | 'time' | 'datetime-local';
type QuickDateKind = 'today' | 'tomorrow' | 'weekend' | 'nextMonday' | 'monthEnd';

interface DatePickerProps {
  /** 选择器模式 */
  type?: PickerMode;
  /** 当前值（格式：date='YYYY-MM-DD', time='HH:mm', datetime-local='YYYY-MM-DDTHH:mm'） */
  value?: string;
  /** 值变化回调，模拟原生 input 的 onChange 事件 */
  onChange?: (e: { target: { value: string } }) => void;
  /** 占位文本 */
  placeholder?: string;
  /** 是否禁用 */
  disabled?: boolean;
  /** 是否必填 */
  required?: boolean;
  /** 自定义类名 */
  className?: string;
  /** 最小值 */
  min?: string;
  /** 最大值 */
  max?: string;
  /** input 的 id */
  id?: string;
  /** input 的 name */
  name?: string;
}

// ==================== 工具函数 ====================

/** 获取某月的天数 */
function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

/** 获取某月第一天是星期几（0=周日，转换为周一开始） */
function getFirstDayOfMonth(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1; // 转换为周一=0
}

/** 补零 */
function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

/** 格式化日期为 YYYY-MM-DD */
function formatDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

/** 格式化时间为 HH:mm */
function formatTime(hour: number, minute: number): string {
  return `${pad(hour)}:${pad(minute)}`;
}

/** 解析日期字符串 */
function parseDate(str: string): { year: number; month: number; day: number } | null {
  if (!str) return null;
  const parts = str.split('-');
  if (parts.length < 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (isNaN(year) || isNaN(month) || isNaN(day)) return null;
  return { year, month, day };
}

/** 解析时间字符串 */
function parseTime(str: string): { hour: number; minute: number } | null {
  if (!str) return null;
  const parts = str.split(':');
  if (parts.length < 2) return null;
  const hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1], 10);
  if (isNaN(hour) || isNaN(minute)) return null;
  return { hour, minute };
}

/** 月份名称 */
const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const WEEKDAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'];

// ==================== 日历面板组件 ====================

interface CalendarPanelProps {
  year: number;
  month: number;
  selectedDate: { year: number; month: number; day: number } | null;
  onSelectDate: (year: number, month: number, day: number) => void;
  onChangeMonth: (year: number, month: number) => void;
  onQuickDate?: (kind: QuickDateKind) => void;
}

function CalendarPanel({ year, month, selectedDate, onSelectDate, onChangeMonth, onQuickDate }: CalendarPanelProps) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const today = new Date();
  const todayStr = formatDate(today.getFullYear(), today.getMonth(), today.getDate());
  const quickDateButtonClass = "px-2 py-1 text-xs text-pink-600 bg-pink-50 hover:bg-pink-100 rounded-md font-medium transition-colors shrink-0";

  // 上个月的尾部天数
  const prevMonthDays = getDaysInMonth(year, month - 1 < 0 ? 11 : month - 1);
  const prevDays: number[] = [];
  for (let i = firstDay - 1; i >= 0; i--) {
    prevDays.push(prevMonthDays - i);
  }

  // 当月天数
  const currentDays: number[] = [];
  for (let i = 1; i <= daysInMonth; i++) {
    currentDays.push(i);
  }

  // 下个月的头部天数（补满6行）
  const totalCells = prevDays.length + currentDays.length;
  const nextDaysCount = totalCells <= 35 ? 35 - totalCells : 42 - totalCells;
  const nextDays: number[] = [];
  for (let i = 1; i <= nextDaysCount; i++) {
    nextDays.push(i);
  }

  /** 切换到上个月 */
  const goToPrevMonth = () => {
    if (month === 0) onChangeMonth(year - 1, 11);
    else onChangeMonth(year, month - 1);
  };

  /** 切换到下个月 */
  const goToNextMonth = () => {
    if (month === 11) onChangeMonth(year + 1, 0);
    else onChangeMonth(year, month + 1);
  };

  /** 回到今天 */
  const goToToday = () => {
    const now = new Date();
    onChangeMonth(now.getFullYear(), now.getMonth());
    onSelectDate(now.getFullYear(), now.getMonth(), now.getDate());
  };

  return (
    <div className="p-3">
      {/* 月份导航 */}
      <div className="flex items-center justify-between mb-2.5">
        <button
          type="button"
          onClick={goToPrevMonth}
          className="h-7 w-7 grid place-items-center rounded-lg hover:bg-pink-50 text-slate-500 hover:text-pink-600 transition-colors"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-bold text-slate-800">
          {year}年 {MONTH_NAMES[month]}
        </span>
        <button
          type="button"
          onClick={goToNextMonth}
          className="h-7 w-7 grid place-items-center rounded-lg hover:bg-pink-50 text-slate-500 hover:text-pink-600 transition-colors"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      {/* 星期标题 */}
      <div className="grid grid-cols-7 gap-1 mb-1">
        {WEEKDAY_NAMES.map(name => (
          <div key={name} className="text-center text-xs font-medium text-slate-400 py-1">
            {name}
          </div>
        ))}
      </div>

      {/* 日期网格 */}
      <div className="grid grid-cols-7 gap-1">
        {/* 上月尾部 */}
        {prevDays.map(day => (
          <button
            key={`prev-${day}`}
            type="button"
            onClick={() => {
              if (month === 0) onSelectDate(year - 1, 11, day);
              else onSelectDate(year, month - 1, day);
              goToPrevMonth();
            }}
            className="h-8 rounded-lg text-[11px] text-slate-300 hover:bg-slate-50 hover:text-slate-400 transition-colors"
          >
            {day}
          </button>
        ))}

        {/* 当月 */}
        {currentDays.map(day => {
          const dateStr = formatDate(year, month, day);
          const isToday = dateStr === todayStr;
          const isSelected = selectedDate &&
            selectedDate.year === year &&
            selectedDate.month === month &&
            selectedDate.day === day;

          return (
            <button
              key={`cur-${day}`}
              type="button"
              onClick={() => onSelectDate(year, month, day)}
              className={`
                h-8 rounded-lg text-[11px] font-medium transition-all
                ${isSelected
                  ? 'bg-pink-500 text-white font-semibold shadow-sm shadow-pink-200'
                  : isToday
                    ? 'bg-pink-50 text-pink-600 font-semibold ring-1 ring-pink-200'
                    : 'text-slate-700 hover:bg-pink-50 hover:text-pink-600'
                }
              `}
            >
              {day}
            </button>
          );
        })}

        {/* 下月头部 */}
        {nextDays.map(day => (
          <button
            key={`next-${day}`}
            type="button"
            onClick={() => {
              if (month === 11) onSelectDate(year + 1, 0, day);
              else onSelectDate(year, month + 1, day);
              goToNextMonth();
            }}
            className="h-8 rounded-lg text-[11px] text-slate-300 hover:bg-slate-50 hover:text-slate-400 transition-colors"
          >
            {day}
          </button>
        ))}
      </div>

      {/* 底部快捷日期（同一行展示） */}
      <div className="mt-2.5 pt-2.5 border-t border-slate-100">
        <div className="flex items-center gap-1.5 flex-nowrap overflow-x-auto hide-scrollbar">
          <button
            type="button"
            onClick={() => (onQuickDate ? onQuickDate('today') : goToToday())}
            className={quickDateButtonClass}
          >
            今天
          </button>
          {onQuickDate && (
            <>
              <button
                type="button"
                onClick={() => onQuickDate('tomorrow')}
                className={quickDateButtonClass}
              >
                明天
              </button>
              <button
                type="button"
                onClick={() => onQuickDate('weekend')}
                className={quickDateButtonClass}
              >
                本周末
              </button>
              <button
                type="button"
                onClick={() => onQuickDate('nextMonday')}
                className={quickDateButtonClass}
              >
                下周一
              </button>
              <button
                type="button"
                onClick={() => onQuickDate('monthEnd')}
                className={quickDateButtonClass}
              >
                本月末
              </button>
            </>
          )}
        </div>
      </div>
    </div>
  );
}

// ==================== 时间选择面板组件 ====================

interface TimePanelProps {
  hour: number;
  minute: number;
  onChangeTime: (hour: number, minute: number) => void;
}

function TimePanel({ hour, minute, onChangeTime }: TimePanelProps) {
  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);

  // 滚动到选中项
  useEffect(() => {
    if (hourRef.current) {
      const selected = hourRef.current.querySelector('[data-selected="true"]');
      if (selected) selected.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
    if (minuteRef.current) {
      const selected = minuteRef.current.querySelector('[data-selected="true"]');
      if (selected) selected.scrollIntoView({ block: 'center', behavior: 'auto' });
    }
  }, [hour, minute]);

  return (
    <div className="flex border-t border-slate-100 md:border-t-0 md:border-l h-52 md:h-[300px] w-full flex-col bg-white">
      {/* 小时列 */}
      <div className="flex-1 flex flex-col border-b border-slate-100 min-h-0">
        <div className="text-center text-[11px] font-semibold text-slate-500 py-2 bg-slate-50/80 shrink-0">
          时
        </div>
        <div ref={hourRef} className="flex-1 overflow-y-auto overflow-x-hidden hide-scrollbar">
          {Array.from({ length: 24 }, (_, i) => (
            <button
              key={i}
              type="button"
              data-selected={i === hour}
              onClick={() => onChangeTime(i, minute)}
              className={`
                w-full mx-1 my-0.5 py-1.5 text-[11px] rounded-md text-center transition-colors
                ${i === hour
                  ? 'bg-pink-500 text-white font-semibold shadow-sm shadow-pink-200'
                  : 'text-slate-600 hover:bg-pink-50 hover:text-pink-600'
                }
              `}
            >
              {pad(i)}
            </button>
          ))}
        </div>
      </div>

      {/* 分钟列 */}
      <div className="flex-1 flex flex-col min-h-0">
        <div className="text-center text-[11px] font-semibold text-slate-500 py-2 bg-slate-50/80 shrink-0">
          分
        </div>
        <div ref={minuteRef} className="flex-1 overflow-y-auto overflow-x-hidden hide-scrollbar">
          {Array.from({ length: 60 }, (_, i) => (
            <button
              key={i}
              type="button"
              data-selected={i === minute}
              onClick={() => onChangeTime(hour, i)}
              className={`
                w-full mx-1 my-0.5 py-1.5 text-[11px] rounded-md text-center transition-colors
                ${i === minute
                  ? 'bg-pink-500 text-white font-semibold shadow-sm shadow-pink-200'
                  : 'text-slate-600 hover:bg-pink-50 hover:text-pink-600'
                }
              `}
            >
              {pad(i)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ==================== 主组件 ====================

export const DatePicker = React.forwardRef<HTMLDivElement, DatePickerProps>(
  ({ type = 'date', value = '', onChange, placeholder, disabled, className = '', min, max, id, name, required }, ref) => {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);

    // 解析当前值
    const now = new Date();
    let currentDate = parseDate(type === 'datetime-local' ? value?.split('T')[0] || '' : type === 'date' ? value : '');
    let currentTime = parseTime(type === 'datetime-local' ? value?.split('T')[1] || '' : type === 'time' ? value : '');

    // 日历浏览的年月（不影响选中值）
    const [viewYear, setViewYear] = useState(currentDate?.year ?? now.getFullYear());
    const [viewMonth, setViewMonth] = useState(currentDate?.month ?? now.getMonth());

    // 临时时间状态（用于 datetime-local 模式下独立调整时间）
    const [tempHour, setTempHour] = useState(currentTime?.hour ?? now.getHours());
    const [tempMinute, setTempMinute] = useState(currentTime?.minute ?? now.getMinutes());

    // 同步外部值变化到内部状态
    useEffect(() => {
      const d = parseDate(type === 'datetime-local' ? value?.split('T')[0] || '' : type === 'date' ? value : '');
      const t = parseTime(type === 'datetime-local' ? value?.split('T')[1] || '' : type === 'time' ? value : '');
      if (d) {
        setViewYear(d.year);
        setViewMonth(d.month);
      }
      if (t) {
        setTempHour(t.hour);
        setTempMinute(t.minute);
      }
    }, [value, type]);

    // 点击外部关闭
    useEffect(() => {
      function handleClickOutside(e: MouseEvent) {
        if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
          setOpen(false);
        }
      }
      if (open) {
        document.addEventListener('mousedown', handleClickOutside);
        return () => document.removeEventListener('mousedown', handleClickOutside);
      }
    }, [open]);

    // 弹出方向检测（上/下）
    const [dropUp, setDropUp] = useState(false);
    useEffect(() => {
      if (open && containerRef.current) {
        const rect = containerRef.current.getBoundingClientRect();
        const spaceBelow = window.innerHeight - rect.bottom;
        // 日历面板大约 360px 高
        setDropUp(spaceBelow < 380 && rect.top > 380);
      }
    }, [open]);

    /** 触发 onChange */
    const emitChange = useCallback((newValue: string) => {
      if (onChange) {
        onChange({ target: { value: newValue } });
      }
    }, [onChange]);

    /** 选择日期 */
    const handleSelectDate = (year: number, month: number, day: number) => {
      if (type === 'date') {
        emitChange(formatDate(year, month, day));
        setOpen(false);
      } else if (type === 'datetime-local') {
        // 日期+时间模式：选日期后保持面板打开，等用户调时间
        emitChange(`${formatDate(year, month, day)}T${formatTime(tempHour, tempMinute)}`);
      }
    };

    /** 选择时间 */
    const handleChangeTime = (hour: number, minute: number) => {
      setTempHour(hour);
      setTempMinute(minute);
      if (type === 'time') {
        emitChange(formatTime(hour, minute));
      } else if (type === 'datetime-local' && currentDate) {
        emitChange(`${formatDate(currentDate.year, currentDate.month, currentDate.day)}T${formatTime(hour, minute)}`);
      }
    };

    // 快捷时间按钮：基于“当前选中时间”进行计算，例如 14:25 +30min => 14:55
    const applyQuickDateTime = useCallback((kind: 'now' | 'round' | 'add15' | 'add30' | 'add60') => {
      const base = new Date();
      if (currentDate) {
        base.setFullYear(currentDate.year, currentDate.month, currentDate.day);
      }
      const baseHour = currentTime?.hour ?? tempHour ?? base.getHours();
      const baseMinute = currentTime?.minute ?? tempMinute ?? base.getMinutes();
      base.setHours(baseHour, baseMinute, 0, 0);

      if (kind === 'now') {
        // “此刻”直接使用当前系统时间
        base.setTime(Date.now());
      } else if (kind === 'round') {
        // “整点”默认进位到下一个整点，例如 14:25 => 15:00
        const needsCarry = base.getMinutes() > 0 || base.getSeconds() > 0;
        if (needsCarry) {
          base.setHours(base.getHours() + 1, 0, 0, 0);
        } else {
          base.setMinutes(0, 0, 0);
        }
      } else {
        const deltaMinutes = kind === 'add15' ? 15 : kind === 'add30' ? 30 : 60;
        base.setMinutes(base.getMinutes() + deltaMinutes);
      }

      const y = base.getFullYear();
      const m = base.getMonth();
      const d = base.getDate();
      const h = base.getHours();
      const min = base.getMinutes();
      setViewYear(y);
      setViewMonth(m);
      setTempHour(h);
      setTempMinute(min);
      emitChange(`${formatDate(y, m, d)}T${formatTime(h, min)}`);
    }, [currentDate, currentTime, tempHour, tempMinute, emitChange]);

    // 快捷日期按钮：只改日期，时间保持“当前选中时间”
    // 例：2026/03/10 14:25 -> 明天 14:25
    // 本周末定义：周六为周末起点；若今天是周日，则取下周六
    const applyQuickDate = useCallback((kind: 'today' | 'tomorrow' | 'weekend' | 'nextMonday' | 'monthEnd') => {
      const base = new Date();
      const ref = currentDate
        ? new Date(currentDate.year, currentDate.month, currentDate.day)
        : new Date();
      const baseHour = currentTime?.hour ?? tempHour ?? base.getHours();
      const baseMinute = currentTime?.minute ?? tempMinute ?? base.getMinutes();

      let target = new Date(ref);
      if (kind === 'today') {
        target = new Date();
      } else if (kind === 'tomorrow') {
        target = new Date(ref);
        target.setDate(ref.getDate() + 1);
      } else if (kind === 'weekend') {
        const day = ref.getDay(); // 0=周日, 6=周六
        const diff = day === 0 ? 6 : 6 - day;
        target = new Date(ref);
        target.setDate(ref.getDate() + diff);
      } else if (kind === 'nextMonday') {
        const day = ref.getDay(); // 0=周日, 1=周一
        const diff = day === 1 ? 7 : (8 - day) % 7;
        target = new Date(ref);
        target.setDate(ref.getDate() + diff);
      } else if (kind === 'monthEnd') {
        target = new Date(ref.getFullYear(), ref.getMonth() + 1, 0);
      }

      target.setHours(baseHour, baseMinute, 0, 0);
      const y = target.getFullYear();
      const m = target.getMonth();
      const d = target.getDate();
      const h = target.getHours();
      const min = target.getMinutes();
      setViewYear(y);
      setViewMonth(m);
      setTempHour(h);
      setTempMinute(min);
      if (type === 'date') {
        emitChange(formatDate(y, m, d));
        setOpen(false);
      } else if (type === 'datetime-local') {
        emitChange(`${formatDate(y, m, d)}T${formatTime(h, min)}`);
      }
    }, [currentDate, currentTime, tempHour, tempMinute, emitChange, type, setOpen]);

    /** 清空值 */
    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation();
      emitChange('');
      setOpen(false);
    };

    /** 显示文本 */
    const displayText = (() => {
      if (!value) return '';
      if (type === 'date' && currentDate) {
        return `${currentDate.year}/${pad(currentDate.month + 1)}/${pad(currentDate.day)}`;
      }
      if (type === 'time' && currentTime) {
        return `${pad(currentTime.hour)}:${pad(currentTime.minute)}`;
      }
      if (type === 'datetime-local' && currentDate) {
        const t = currentTime || { hour: 0, minute: 0 };
        return `${currentDate.year}/${pad(currentDate.month + 1)}/${pad(currentDate.day)} ${pad(t.hour)}:${pad(t.minute)}`;
      }
      return value;
    })();

    /** 默认占位文本 */
    const defaultPlaceholder = type === 'date' ? '选择日期' : type === 'time' ? '选择时间' : '选择日期和时间';
    const quickTimeButtonClass = "px-2.5 py-1 text-[11px] rounded-md bg-white border border-slate-200 text-slate-600 hover:text-pink-600 hover:border-pink-200 hover:bg-pink-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed";

    return (
      <div ref={containerRef} className={`relative ${className}`}>
        {/* 隐藏的原生 input，用于表单提交 */}
        <input type="hidden" id={id} name={name} value={value} required={required} />

        {/* 触发按钮 */}
        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen(!open)}
          className={`
            group w-full h-11 flex items-center gap-2 px-3 text-sm text-left
            border border-slate-200 rounded-xl bg-white shadow-sm
            hover:border-pink-300 hover:shadow transition-all
            focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-pink-300 focus-visible:ring-offset-1 focus-visible:ring-offset-white
            disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:border-slate-200 disabled:hover:shadow-none
            ${open ? 'ring-2 ring-pink-300 border-pink-200 shadow-md' : ''}
          `}
        >
          {type !== 'time' && (
            <Calendar
              size={14}
              className={`shrink-0 ${open ? 'text-pink-500' : 'text-slate-400 group-hover:text-pink-500'}`}
            />
          )}
          {type === 'time' && (
            <Clock
              size={14}
              className={`shrink-0 ${open ? 'text-pink-500' : 'text-slate-400 group-hover:text-pink-500'}`}
            />
          )}

          <span className={`flex-1 truncate ${displayText ? 'text-slate-700' : 'text-slate-400'}`}>
            {displayText || placeholder || defaultPlaceholder}
          </span>

          {value && !disabled && (
            <X
              size={14}
              className="text-slate-300 hover:text-slate-600 shrink-0 cursor-pointer transition-colors"
              onClick={handleClear}
            />
          )}
        </button>

        {/* 弹出面板 */}
        {open && (
          <div
            ref={dropdownRef}
            className={`
              absolute z-[100] bg-white rounded-2xl shadow-2xl border border-slate-100 ring-1 ring-black/5 overflow-hidden flex flex-col
              w-full min-w-[18rem]
              ${dropUp ? 'bottom-full mb-1.5' : 'top-full mt-1.5'}
              left-0 animate-in fade-in-0 zoom-in-95 duration-150
            `}
          >
            <div className="flex flex-col md:flex-row items-stretch">
              {/* 日期面板 */}
              {(type === 'date' || type === 'datetime-local') && (
                <div className="shrink-0 md:basis-[82%] md:max-w-[82%]">
                  <CalendarPanel
                    year={viewYear}
                    month={viewMonth}
                    selectedDate={currentDate}
                    onSelectDate={handleSelectDate}
                    onChangeMonth={(y, m) => { setViewYear(y); setViewMonth(m); }}
                    onQuickDate={applyQuickDate}
                  />
                </div>
              )}

              {/* 时间面板 */}
              {(type === 'time' || type === 'datetime-local') && (
                <div className="shrink-0 md:basis-[18%] md:max-w-[18%]">
                  <TimePanel
                    hour={tempHour}
                    minute={tempMinute}
                    onChangeTime={handleChangeTime}
                  />
                </div>
              )}
            </div>

            {/* datetime-local 模式的确认按钮 */}
            {type === 'datetime-local' && (
              <div className="p-2.5 border-t border-slate-100 bg-slate-50/80 w-full">
                {/* 快捷时间按钮：恢复为文字按钮 */}
                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => applyQuickDateTime('now')}
                    className={quickTimeButtonClass}
                  >
                    此刻
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => applyQuickDateTime('round')}
                    className={quickTimeButtonClass}
                  >
                    整点
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => applyQuickDateTime('add15')}
                    className={quickTimeButtonClass}
                  >
                    +15min
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => applyQuickDateTime('add30')}
                    className={quickTimeButtonClass}
                  >
                    +30min
                  </button>
                  <button
                    type="button"
                    disabled={disabled}
                    onClick={() => applyQuickDateTime('add60')}
                    className={quickTimeButtonClass}
                  >
                    +1h
                  </button>
                </div>

                <div className="flex justify-between items-center mt-2">
                  <span className="text-xs text-slate-600 font-medium">
                    {currentDate ? `${currentDate.year}/${pad(currentDate.month + 1)}/${pad(currentDate.day)} ${pad(tempHour)}:${pad(tempMinute)}` : '请选择日期'}
                  </span>
                  <button
                    type="button"
                    onClick={(e) => { e.preventDefault(); e.stopPropagation(); setOpen(false); }}
                    className="px-3 py-1.5 text-xs bg-pink-500 text-white rounded-lg hover:bg-pink-600 transition-colors font-medium shadow-sm shadow-pink-200"
                  >
                    确定
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    );
  }
);

DatePicker.displayName = 'DatePicker';

export default DatePicker;
