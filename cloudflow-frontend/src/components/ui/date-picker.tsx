import React, { useCallback, useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { Calendar, ChevronLeft, ChevronRight, Clock, X } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Button } from './button';

type PickerMode = 'date' | 'time' | 'datetime-local';
type QuickDateKind = 'today' | 'tomorrow' | 'weekend' | 'nextMonday' | 'monthEnd';

interface DatePickerProps {
  type?: PickerMode;
  value?: string;
  onChange?: (e: { target: { value: string } }) => void;
  placeholder?: string;
  disabled?: boolean;
  required?: boolean;
  className?: string;
  min?: string;
  max?: string;
  id?: string;
  name?: string;
  variant?: 'default' | 'glass';
}

const MONTH_NAMES = ['1月', '2月', '3月', '4月', '5月', '6月', '7月', '8月', '9月', '10月', '11月', '12月'];
const WEEKDAY_NAMES = ['一', '二', '三', '四', '五', '六', '日'];

function pad(n: number): string {
  return n < 10 ? `0${n}` : `${n}`;
}

function getDaysInMonth(year: number, month: number): number {
  return new Date(year, month + 1, 0).getDate();
}

function getFirstDayOfMonth(year: number, month: number): number {
  const day = new Date(year, month, 1).getDay();
  return day === 0 ? 6 : day - 1;
}

function formatDate(year: number, month: number, day: number): string {
  return `${year}-${pad(month + 1)}-${pad(day)}`;
}

function formatTime(hour: number, minute: number): string {
  return `${pad(hour)}:${pad(minute)}`;
}

function parseDate(str: string): { year: number; month: number; day: number } | null {
  if (!str) return null;
  const parts = str.split('-');
  if (parts.length < 3) return null;
  const year = parseInt(parts[0], 10);
  const month = parseInt(parts[1], 10) - 1;
  const day = parseInt(parts[2], 10);
  if (Number.isNaN(year) || Number.isNaN(month) || Number.isNaN(day)) return null;
  return { year, month, day };
}

function parseTime(str: string): { hour: number; minute: number } | null {
  if (!str) return null;
  const parts = str.split(':');
  if (parts.length < 2) return null;
  const hour = parseInt(parts[0], 10);
  const minute = parseInt(parts[1], 10);
  if (Number.isNaN(hour) || Number.isNaN(minute)) return null;
  return { hour, minute };
}

function toDisplayDate(value?: string) {
  const parsed = parseDate(value || '');
  if (!parsed) return '';
  return `${parsed.year}/${pad(parsed.month + 1)}/${pad(parsed.day)}`;
}

interface CalendarPanelProps {
  year: number;
  month: number;
  selectedDate: { year: number; month: number; day: number } | null;
  onSelectDate: (year: number, month: number, day: number) => void;
  onChangeMonth: (year: number, month: number) => void;
  onQuickDate?: (kind: QuickDateKind) => void;
}

function CalendarPanel({
  year,
  month,
  selectedDate,
  onSelectDate,
  onChangeMonth,
  onQuickDate,
}: CalendarPanelProps) {
  const daysInMonth = getDaysInMonth(year, month);
  const firstDay = getFirstDayOfMonth(year, month);
  const today = new Date();
  const todayStr = formatDate(today.getFullYear(), today.getMonth(), today.getDate());

  const prevMonthDays = getDaysInMonth(year, month === 0 ? 11 : month - 1);
  const prevDays: number[] = [];
  for (let i = firstDay - 1; i >= 0; i -= 1) {
    prevDays.push(prevMonthDays - i);
  }

  const currentDays = Array.from({ length: daysInMonth }, (_, i) => i + 1);
  const totalCells = prevDays.length + currentDays.length;
  const nextDaysCount = totalCells <= 35 ? 35 - totalCells : 42 - totalCells;
  const nextDays = Array.from({ length: nextDaysCount }, (_, i) => i + 1);

  const goToPrevMonth = () => {
    if (month === 0) onChangeMonth(year - 1, 11);
    else onChangeMonth(year, month - 1);
  };

  const goToNextMonth = () => {
    if (month === 11) onChangeMonth(year + 1, 0);
    else onChangeMonth(year, month + 1);
  };

  return (
    <div className="bg-white p-3 dark:bg-slate-950">
      <div className="mb-2.5 flex items-center justify-between">
        <button
          type="button"
          onClick={goToPrevMonth}
          className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="text-sm font-bold text-slate-800 dark:text-slate-100">
          {year}年 {MONTH_NAMES[month]}
        </span>
        <button
          type="button"
          onClick={goToNextMonth}
          className="grid h-7 w-7 place-items-center rounded-lg border border-slate-200 bg-white text-slate-500 shadow-sm transition-colors hover:bg-slate-50 hover:text-slate-700 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="mb-1 grid grid-cols-7 gap-1">
        {WEEKDAY_NAMES.map((name) => (
          <div key={name} className="py-1 text-center text-xs font-medium text-slate-400">
            {name}
          </div>
        ))}
      </div>

      <div className="grid grid-cols-7 gap-1">
        {prevDays.map((day) => (
          <button
            key={`prev-${day}`}
            type="button"
            onClick={() => {
              if (month === 0) onSelectDate(year - 1, 11, day);
              else onSelectDate(year, month - 1, day);
              goToPrevMonth();
            }}
            className="h-8 rounded-lg text-[11px] text-slate-300 transition-colors hover:bg-slate-50 hover:text-slate-500 dark:text-slate-600 dark:hover:bg-slate-900 dark:hover:text-slate-400"
          >
            {day}
          </button>
        ))}

        {currentDays.map((day) => {
          const dateStr = formatDate(year, month, day);
          const isToday = dateStr === todayStr;
          const isSelected = selectedDate
            && selectedDate.year === year
            && selectedDate.month === month
            && selectedDate.day === day;

          return (
            <button
              key={`cur-${day}`}
              type="button"
              onClick={() => onSelectDate(year, month, day)}
              className={cn(
                'h-8 rounded-lg text-[11px] font-medium transition-all',
                isSelected
                  ? 'bg-[color:var(--cf-primary-500)] text-white font-semibold shadow-[0_10px_20px_rgba(20,184,166,0.18)]'
                  : isToday
                    ? 'bg-[rgba(240,253,250,0.96)] text-[color:var(--cf-primary-700)] font-semibold ring-1 ring-[rgba(153,246,228,0.96)] dark:bg-[rgba(20,184,166,0.18)] dark:text-[rgb(204,251,241)] dark:ring-[rgba(20,184,166,0.28)]'
                    : 'text-slate-700 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-200 dark:hover:bg-slate-900 dark:hover:text-slate-100',
              )}
            >
              {day}
            </button>
          );
        })}

        {nextDays.map((day) => (
          <button
            key={`next-${day}`}
            type="button"
            onClick={() => {
              if (month === 11) onSelectDate(year + 1, 0, day);
              else onSelectDate(year, month + 1, day);
              goToNextMonth();
            }}
            className="h-8 rounded-lg text-[11px] text-slate-300 transition-colors hover:bg-slate-50 hover:text-slate-500 dark:text-slate-600 dark:hover:bg-slate-900 dark:hover:text-slate-400"
          >
            {day}
          </button>
        ))}
      </div>

      <div className="mt-2.5 border-t border-slate-100 pt-2.5 dark:border-slate-800">
        <div className="hide-scrollbar flex flex-nowrap items-center gap-1.5 overflow-x-auto">
          <button
            type="button"
            onClick={() => (onQuickDate ? onQuickDate('today') : undefined)}
            className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-100"
          >
            今天
          </button>
          {onQuickDate ? (
            <>
              <button
                type="button"
                onClick={() => onQuickDate('tomorrow')}
                className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-100"
              >
                明天
              </button>
              <button
                type="button"
                onClick={() => onQuickDate('weekend')}
                className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-100"
              >
                本周末
              </button>
              <button
                type="button"
                onClick={() => onQuickDate('nextMonday')}
                className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-100"
              >
                下周一
              </button>
              <button
                type="button"
                onClick={() => onQuickDate('monthEnd')}
                className="shrink-0 rounded-md border border-slate-200 bg-white px-2 py-1 text-xs font-medium text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-100"
              >
                本月末
              </button>
            </>
          ) : null}
        </div>
      </div>
    </div>
  );
}

interface TimePanelProps {
  hour: number;
  minute: number;
  onChangeTime: (hour: number, minute: number) => void;
  layout?: 'row' | 'col';
}

function TimePanel({ hour, minute, onChangeTime, layout = 'col' }: TimePanelProps) {
  const hourRef = useRef<HTMLDivElement>(null);
  const minuteRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    hourRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'center' });
    minuteRef.current?.querySelector('[data-selected="true"]')?.scrollIntoView({ block: 'center' });
  }, [hour, minute]);

  const isRow = layout === 'row';

  return (
    <div
      className={cn(
        'flex bg-white dark:bg-slate-950',
        isRow ? 'h-64 w-max flex-row' : 'h-52 w-full flex-col border-t border-slate-100 md:h-[300px] md:border-l md:border-t-0 dark:border-slate-800',
      )}
    >
      <div className={cn('flex min-h-0 flex-col', isRow ? 'w-[5.25rem] border-r border-slate-100 dark:border-slate-800' : 'flex-1 border-b border-slate-100 dark:border-slate-800')}>
        <div className="shrink-0 bg-slate-50 py-2 text-center text-[11px] font-semibold text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          时
        </div>
        <div ref={hourRef} className="hide-scrollbar flex-1 overflow-y-auto overflow-x-hidden">
          {Array.from({ length: 24 }, (_, i) => (
            <button
              key={i}
              type="button"
              data-selected={i === hour}
              onClick={() => onChangeTime(i, minute)}
              className={cn(
                'mx-1 my-0.5 rounded-md py-1.5 text-center text-[11px] transition-colors',
                isRow ? 'w-[calc(100%-0.5rem)]' : 'w-full',
                i === hour
                  ? 'bg-[color:var(--cf-primary-500)] text-white font-semibold shadow-[0_10px_20px_rgba(20,184,166,0.18)]'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-100',
              )}
            >
              {pad(i)}
            </button>
          ))}
        </div>
      </div>

      <div className={cn('flex min-h-0 flex-col', isRow ? 'w-[5.25rem]' : 'flex-1')}>
        <div className="shrink-0 bg-slate-50 py-2 text-center text-[11px] font-semibold text-slate-500 dark:bg-slate-900 dark:text-slate-400">
          分
        </div>
        <div ref={minuteRef} className="hide-scrollbar flex-1 overflow-y-auto overflow-x-hidden">
          {Array.from({ length: 60 }, (_, i) => (
            <button
              key={i}
              type="button"
              data-selected={i === minute}
              onClick={() => onChangeTime(hour, i)}
              className={cn(
                'mx-1 my-0.5 rounded-md py-1.5 text-center text-[11px] transition-colors',
                isRow ? 'w-[calc(100%-0.5rem)]' : 'w-full',
                i === minute
                  ? 'bg-[color:var(--cf-primary-500)] text-white font-semibold shadow-[0_10px_20px_rgba(20,184,166,0.18)]'
                  : 'text-slate-600 hover:bg-slate-50 hover:text-slate-900 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-100',
              )}
            >
              {pad(i)}
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

export const DatePicker = React.forwardRef<HTMLDivElement, DatePickerProps>(
  ({ type = 'date', value = '', onChange, placeholder, disabled, className = '', id, name, required }, ref) => {
    const [open, setOpen] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [placement, setPlacement] = useState({
      top: 0,
      left: 0,
      width: 288,
      maxHeight: 380,
    });

    const now = new Date();
    const currentDate = parseDate(type === 'datetime-local' ? value?.split('T')[0] || '' : type === 'date' ? value : '');
    const currentTime = parseTime(type === 'datetime-local' ? value?.split('T')[1] || '' : type === 'time' ? value : '');

    const [viewYear, setViewYear] = useState(currentDate?.year ?? now.getFullYear());
    const [viewMonth, setViewMonth] = useState(currentDate?.month ?? now.getMonth());
    const [tempHour, setTempHour] = useState(currentTime?.hour ?? now.getHours());
    const [tempMinute, setTempMinute] = useState(currentTime?.minute ?? now.getMinutes());

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
    }, [type, value]);

    const emitChange = useCallback((newValue: string) => {
      onChange?.({ target: { value: newValue } });
    }, [onChange]);

    useEffect(() => {
      if (!open) return;

      const handleClickOutside = (event: MouseEvent) => {
        const target = event.target as Node;
        if (containerRef.current?.contains(target)) return;
        if (dropdownRef.current?.contains(target)) return;
        setOpen(false);
      };

      const handleEscape = (event: KeyboardEvent) => {
        if (event.key === 'Escape') {
          setOpen(false);
        }
      };

      document.addEventListener('mousedown', handleClickOutside, true);
      window.addEventListener('keydown', handleEscape);

      return () => {
        document.removeEventListener('mousedown', handleClickOutside, true);
        window.removeEventListener('keydown', handleEscape);
      };
    }, [open]);

    useEffect(() => {
      if (!(open && containerRef.current)) return;

      const updatePlacement = () => {
        if (!containerRef.current) return;

        const rect = containerRef.current.getBoundingClientRect();
        const viewportPadding = 16;
        const defaultWidth = type === 'time' ? 184 : type === 'datetime-local' ? 420 : Math.max(rect.width, 288);
        const dropdownWidth = dropdownRef.current?.offsetWidth ?? defaultWidth;
        const dropdownHeight = dropdownRef.current?.offsetHeight ?? 380;
        const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
        const spaceAbove = rect.top - viewportPadding;
        const dropUp = spaceBelow < Math.min(dropdownHeight, 380) && spaceAbove > spaceBelow;
        const maxHeight = Math.max(180, (dropUp ? spaceAbove : spaceBelow) - 6);
        const renderedHeight = Math.min(dropdownHeight, maxHeight);

        let left = rect.left;
        if (left + dropdownWidth > window.innerWidth - viewportPadding) {
          left = Math.max(viewportPadding, window.innerWidth - dropdownWidth - viewportPadding);
        }

        const top = dropUp
          ? Math.max(viewportPadding, rect.top - renderedHeight - 6)
          : rect.bottom + 6;

        setPlacement({
          top,
          left,
          width: defaultWidth,
          maxHeight,
        });
      };

      const rafId = window.requestAnimationFrame(updatePlacement);
      window.addEventListener('resize', updatePlacement);
      window.addEventListener('scroll', updatePlacement, true);

      return () => {
        window.cancelAnimationFrame(rafId);
        window.removeEventListener('resize', updatePlacement);
        window.removeEventListener('scroll', updatePlacement, true);
      };
    }, [open, type]);

    const handleSelectDate = (year: number, month: number, day: number) => {
      if (type === 'date') {
        emitChange(formatDate(year, month, day));
        setOpen(false);
      } else if (type === 'datetime-local') {
        emitChange(`${formatDate(year, month, day)}T${formatTime(tempHour, tempMinute)}`);
      }
    };

    const handleChangeTime = (hour: number, minute: number) => {
      setTempHour(hour);
      setTempMinute(minute);
      if (type === 'time') {
        emitChange(formatTime(hour, minute));
      } else if (type === 'datetime-local' && currentDate) {
        emitChange(`${formatDate(currentDate.year, currentDate.month, currentDate.day)}T${formatTime(hour, minute)}`);
      }
    };

    const applyQuickDateTime = useCallback((kind: 'now' | 'round' | 'add15' | 'add30' | 'add60') => {
      const base = new Date();
      if (currentDate) {
        base.setFullYear(currentDate.year, currentDate.month, currentDate.day);
      }
      const baseHour = currentTime?.hour ?? tempHour ?? base.getHours();
      const baseMinute = currentTime?.minute ?? tempMinute ?? base.getMinutes();
      base.setHours(baseHour, baseMinute, 0, 0);

      if (kind === 'now') {
        base.setTime(Date.now());
      } else if (kind === 'round') {
        if (base.getMinutes() > 0 || base.getSeconds() > 0) {
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
    }, [currentDate, currentTime, emitChange, tempHour, tempMinute]);

    const applyQuickDate = useCallback((kind: QuickDateKind) => {
      const base = new Date();
      const refDate = currentDate
        ? new Date(currentDate.year, currentDate.month, currentDate.day)
        : new Date();
      const baseHour = currentTime?.hour ?? tempHour ?? base.getHours();
      const baseMinute = currentTime?.minute ?? tempMinute ?? base.getMinutes();

      let target = new Date(refDate);
      if (kind === 'today') {
        target = new Date();
      } else if (kind === 'tomorrow') {
        target.setDate(refDate.getDate() + 1);
      } else if (kind === 'weekend') {
        const day = refDate.getDay();
        const diff = day === 0 ? 6 : 6 - day;
        target.setDate(refDate.getDate() + diff);
      } else if (kind === 'nextMonday') {
        const day = refDate.getDay();
        const diff = day === 1 ? 7 : (8 - day) % 7;
        target.setDate(refDate.getDate() + diff);
      } else if (kind === 'monthEnd') {
        target = new Date(refDate.getFullYear(), refDate.getMonth() + 1, 0);
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
    }, [currentDate, currentTime, emitChange, tempHour, tempMinute, type]);

    const handleClear = (e: React.MouseEvent) => {
      e.stopPropagation();
      emitChange('');
      setOpen(false);
    };

    const displayText = (() => {
      if (!value) return '';
      if (type === 'date') return toDisplayDate(value);
      if (type === 'time' && currentTime) return formatTime(currentTime.hour, currentTime.minute);
      if (type === 'datetime-local' && currentDate) {
        const t = currentTime || { hour: 0, minute: 0 };
        return `${toDisplayDate(formatDate(currentDate.year, currentDate.month, currentDate.day))} ${formatTime(t.hour, t.minute)}`;
      }
      return value;
    })();

    const defaultPlaceholder = type === 'date' ? '选择日期' : type === 'time' ? '选择时间' : '选择日期和时间';
    const dropdownWidth = type === 'time' ? Math.min(placement.width, 184) : placement.width;

    return (
      <div ref={(node) => {
        containerRef.current = node;
        if (typeof ref === 'function') ref(node);
        else if (ref) ref.current = node;
      }} className={`relative ${open ? 'z-[120]' : 'z-0'}`}>
        <input type="hidden" id={id} name={name} value={value} required={required} />

        <button
          type="button"
          disabled={disabled}
          onClick={() => !disabled && setOpen(!open)}
          className={cn(
            'cf-control group flex h-11 w-full items-center gap-2 rounded-xl px-4 text-left text-sm',
            open && 'cf-control-active',
            className,
          )}
        >
          {type === 'time' ? (
            <Clock
              size={14}
              className={cn(
                'shrink-0',
                open
                  ? 'text-[color:var(--cf-primary-600)] dark:text-[rgb(204,251,241)]'
                  : 'text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300',
              )}
            />
          ) : (
            <Calendar
              size={14}
              className={cn(
                'shrink-0',
                open
                  ? 'text-[color:var(--cf-primary-600)] dark:text-[rgb(204,251,241)]'
                  : 'text-slate-400 group-hover:text-slate-600 dark:text-slate-500 dark:group-hover:text-slate-300',
              )}
            />
          )}

          <span className={cn('flex-1 truncate', displayText ? 'text-slate-700 dark:text-slate-100' : 'text-slate-400 dark:text-slate-500')}>
            {displayText || placeholder || defaultPlaceholder}
          </span>

          {value && !disabled ? (
            <X
              size={14}
              className="shrink-0 cursor-pointer text-slate-300 transition-colors hover:text-slate-600"
              onClick={handleClear}
            />
          ) : null}
        </button>

        {open && typeof document !== 'undefined'
          ? createPortal(
              <div
                ref={dropdownRef}
                className="fixed z-[160] flex max-w-[calc(100vw-2rem)] flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-[0_22px_46px_rgba(15,23,42,0.14)] animate-in fade-in-0 zoom-in-95 duration-150 dark:border-slate-800 dark:bg-slate-950 dark:shadow-[0_22px_46px_rgba(2,6,23,0.52)]"
                style={{
                  top: placement.top,
                  left: placement.left,
                  width: dropdownWidth,
                  maxHeight: placement.maxHeight,
                }}
              >
                <div className="flex items-stretch">
                  {type === 'date' || type === 'datetime-local' ? (
                    <div className={cn('shrink-0', type === 'date' ? 'w-full' : 'basis-[82%]')}>
                      <CalendarPanel
                        year={viewYear}
                        month={viewMonth}
                        selectedDate={currentDate}
                        onSelectDate={handleSelectDate}
                        onChangeMonth={(y, m) => {
                          setViewYear(y);
                          setViewMonth(m);
                        }}
                        onQuickDate={type === 'date' || type === 'datetime-local' ? applyQuickDate : undefined}
                      />
                    </div>
                  ) : null}

                  {type === 'time' || type === 'datetime-local' ? (
                    <div className={cn('shrink-0', type === 'time' ? 'w-full' : 'basis-[18%] border-l border-slate-100 dark:border-slate-800')}>
                      <TimePanel
                        hour={tempHour}
                        minute={tempMinute}
                        onChangeTime={handleChangeTime}
                        layout={type === 'time' ? 'row' : 'col'}
                      />
                    </div>
                  ) : null}
                </div>

                {type === 'datetime-local' ? (
                  <div className="w-full border-t border-slate-100 bg-slate-50 p-2.5 dark:border-slate-800 dark:bg-slate-900">
                    <div className="flex flex-wrap items-center gap-1.5">
                      {[
                        { key: 'now', label: '此刻' },
                        { key: 'round', label: '整点' },
                        { key: 'add15', label: '+15min' },
                        { key: 'add30', label: '+30min' },
                        { key: 'add60', label: '+1h' },
                      ].map((item) => (
                        <button
                          key={item.key}
                          type="button"
                          disabled={disabled}
                          onClick={() => applyQuickDateTime(item.key as 'now' | 'round' | 'add15' | 'add30' | 'add60')}
                          className="rounded-md border border-slate-200 bg-white px-2.5 py-1 text-[11px] text-slate-600 transition-colors hover:bg-slate-50 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-50 dark:border-slate-800 dark:bg-slate-950 dark:text-slate-300 dark:hover:bg-slate-900 dark:hover:text-slate-100"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    <div className="mt-2 flex items-center justify-between gap-3">
                      <span className="text-xs font-medium text-slate-600 dark:text-slate-300">
                        {currentDate ? `${toDisplayDate(formatDate(currentDate.year, currentDate.month, currentDate.day))} ${formatTime(tempHour, tempMinute)}` : '请选择日期'}
                      </span>
                      <Button
                        type="button"
                        size="sm"
                        onClick={(e) => {
                          e.preventDefault();
                          e.stopPropagation();
                          setOpen(false);
                        }}
                      >
                        确定
                      </Button>
                    </div>
                  </div>
                ) : null}
              </div>,
              document.body,
            )
          : null}
      </div>
    );
  },
);

DatePicker.displayName = 'DatePicker';

export default DatePicker;
