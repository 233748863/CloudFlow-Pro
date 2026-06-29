import React, { useCallback, useEffect, useLayoutEffect, useRef, useState } from 'react';
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
}

interface DropdownPlacement {
  top: number;
  left: number;
  width: number;
  maxHeight: number;
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

function getEstimatedDropdownHeight(type: PickerMode): number {
  if (type === 'time') {
    return 256;
  }
  return 380;
}

function getDropdownWidth(type: PickerMode, triggerWidth: number): number {
  if (type === 'time') {
    return Math.max(triggerWidth, 184);
  }
  if (type === 'datetime-local') {
    return Math.max(triggerWidth, 420);
  }
  return Math.max(triggerWidth, 288);
}

function resolvePlacement(
  triggerRect: DOMRect,
  type: PickerMode,
  dropdownElement: HTMLDivElement | null,
): DropdownPlacement {
  const viewportPadding = 16;
  const width = getDropdownWidth(type, triggerRect.width);
  const dropdownWidth = dropdownElement?.offsetWidth ?? width;
  const dropdownHeight = dropdownElement?.offsetHeight ?? getEstimatedDropdownHeight(type);
  const spaceBelow = window.innerHeight - triggerRect.bottom - viewportPadding;
  const spaceAbove = triggerRect.top - viewportPadding;
  const dropUp = spaceBelow < Math.min(dropdownHeight, getEstimatedDropdownHeight(type)) && spaceAbove > spaceBelow;
  const maxHeight = Math.max(180, (dropUp ? spaceAbove : spaceBelow) - 6);
  const renderedHeight = Math.min(dropdownHeight, maxHeight);

  let left = triggerRect.left;
  if (left + dropdownWidth > window.innerWidth - viewportPadding) {
    left = Math.max(viewportPadding, window.innerWidth - dropdownWidth - viewportPadding);
  }

  const top = dropUp
    ? Math.max(viewportPadding, triggerRect.top - renderedHeight - 6)
    : triggerRect.bottom + 6;

  return {
    top,
    left,
    width,
    maxHeight,
  };
}

function centerSelectedItem(container: HTMLDivElement | null) {
  if (!container) {
    return;
  }

  const selected = container.querySelector<HTMLElement>('[data-selected="true"]');
  if (!selected) {
    return;
  }

  const targetScrollTop = selected.offsetTop - (container.clientHeight - selected.offsetHeight) / 2;
  const boundedScrollTop = Math.max(0, Math.min(targetScrollTop, container.scrollHeight - container.clientHeight));
  container.scrollTop = boundedScrollTop;
}

interface CalendarPanelProps {
  year: number;
  month: number;
  selectedDate: { year: number; month: number; day: number } | null;
  onSelectDate: (year: number, month: number, day: number) => void;
  onChangeMonth: (year: number, month: number) => void;
  onQuickDate?: (kind: QuickDateKind) => void;
  isDateDisabled?: (year: number, month: number, day: number) => boolean;
}

function CalendarPanel({
  year,
  month,
  selectedDate,
  onSelectDate,
  onChangeMonth,
  onQuickDate,
  isDateDisabled,
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
    <div className="cf-date-panel">
      <div className="cf-date-panel-header">
        <button
          type="button"
          onClick={goToPrevMonth}
          className="cf-date-nav-button"
        >
          <ChevronLeft size={16} />
        </button>
        <span className="cf-date-title">
          {year}年 {MONTH_NAMES[month]}
        </span>
        <button
          type="button"
          onClick={goToNextMonth}
          className="cf-date-nav-button"
        >
          <ChevronRight size={16} />
        </button>
      </div>

      <div className="cf-date-weekdays">
        {WEEKDAY_NAMES.map((name) => (
          <div key={name} className="cf-date-weekday">
            {name}
          </div>
        ))}
      </div>

      <div className="cf-date-grid">
        {prevDays.map((day) => (
          (() => {
            const targetYear = month === 0 ? year - 1 : year;
            const targetMonth = month === 0 ? 11 : month - 1;
            const disabled = isDateDisabled?.(targetYear, targetMonth, day) ?? false;

            return (
              <button
                key={`prev-${day}`}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (disabled) {
                    return;
                  }
                  onSelectDate(targetYear, targetMonth, day);
                  goToPrevMonth();
                }}
                className={cn(
                  'cf-date-cell cf-date-cell-outside',
                  disabled && 'is-disabled',
                )}
              >
                {day}
              </button>
            );
          })()
        ))}

        {currentDays.map((day) => {
          const dateStr = formatDate(year, month, day);
          const isToday = dateStr === todayStr;
          const isDisabled = isDateDisabled?.(year, month, day) ?? false;
          const isSelected = selectedDate
            && selectedDate.year === year
            && selectedDate.month === month
            && selectedDate.day === day;

          return (
            <button
              key={`cur-${day}`}
              type="button"
              disabled={isDisabled}
              onClick={() => {
                if (isDisabled) {
                  return;
                }
                onSelectDate(year, month, day);
              }}
              className={cn(
                'cf-date-cell',
                isDisabled && 'is-disabled',
                isSelected && 'is-selected',
                isToday && !isSelected && 'is-today',
              )}
            >
              {day}
            </button>
          );
        })}

        {nextDays.map((day) => (
          (() => {
            const targetYear = month === 11 ? year + 1 : year;
            const targetMonth = month === 11 ? 0 : month + 1;
            const disabled = isDateDisabled?.(targetYear, targetMonth, day) ?? false;

            return (
              <button
                key={`next-${day}`}
                type="button"
                disabled={disabled}
                onClick={() => {
                  if (disabled) {
                    return;
                  }
                  onSelectDate(targetYear, targetMonth, day);
                  goToNextMonth();
                }}
                className={cn(
                  'cf-date-cell cf-date-cell-outside',
                  disabled && 'is-disabled',
                )}
              >
                {day}
              </button>
            );
          })()
        ))}
      </div>

      <div className="cf-date-quickbar">
        <div className="cf-date-quickrow hide-scrollbar">
          <button
            type="button"
            onClick={() => (onQuickDate ? onQuickDate('today') : undefined)}
            className="cf-date-quick-button"
          >
            今天
          </button>
          {onQuickDate ? (
            <>
              <button
                type="button"
                onClick={() => onQuickDate('tomorrow')}
                className="cf-date-quick-button"
              >
                明天
              </button>
              <button
                type="button"
                onClick={() => onQuickDate('weekend')}
                className="cf-date-quick-button"
              >
                本周末
              </button>
              <button
                type="button"
                onClick={() => onQuickDate('nextMonday')}
                className="cf-date-quick-button"
              >
                下周一
              </button>
              <button
                type="button"
                onClick={() => onQuickDate('monthEnd')}
                className="cf-date-quick-button"
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

  useLayoutEffect(() => {
    centerSelectedItem(hourRef.current);
    centerSelectedItem(minuteRef.current);
  }, [hour, minute]);

  const isRow = layout === 'row';

  return (
    <div
      className={cn(
        'cf-time-panel',
        isRow ? 'is-row' : 'is-column',
      )}
    >
      <div className="cf-time-section">
        <div className="cf-time-title">
          时
        </div>
        <div ref={hourRef} className="cf-time-list hide-scrollbar">
          {Array.from({ length: 24 }, (_, i) => (
            <button
              key={i}
              type="button"
              data-selected={i === hour}
              onClick={() => onChangeTime(i, minute)}
              className={cn(
                'cf-time-option',
                i === hour && 'is-selected',
              )}
            >
              {pad(i)}
            </button>
          ))}
        </div>
      </div>

      <div className="cf-time-section">
        <div className="cf-time-title">
          分
        </div>
        <div ref={minuteRef} className="cf-time-list hide-scrollbar">
          {Array.from({ length: 60 }, (_, i) => (
            <button
              key={i}
              type="button"
              data-selected={i === minute}
              onClick={() => onChangeTime(hour, i)}
              className={cn(
                'cf-time-option',
                i === minute && 'is-selected',
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
  ({ type = 'date', value = '', onChange, placeholder, disabled, className = '', min, max, id, name, required }, ref) => {
    const [open, setOpen] = useState(false);
    const [positionReady, setPositionReady] = useState(false);
    const containerRef = useRef<HTMLDivElement>(null);
    const dropdownRef = useRef<HTMLDivElement>(null);
    const [placement, setPlacement] = useState<DropdownPlacement>({
      top: 0,
      left: 0,
      width: 288,
      maxHeight: 380,
    });

    const now = new Date();
    const currentDate = parseDate(type === 'datetime-local' ? value?.split('T')[0] || '' : type === 'date' ? value : '');
    const currentTime = parseTime(type === 'datetime-local' ? value?.split('T')[1] || '' : type === 'time' ? value : '');
    const minDate = parseDate(type === 'datetime-local' ? min?.split('T')[0] || '' : type === 'date' ? min : '');
    const maxDate = parseDate(type === 'datetime-local' ? max?.split('T')[0] || '' : type === 'date' ? max : '');

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

    const isDateDisabled = useCallback((year: number, month: number, day: number) => {
      const targetValue = formatDate(year, month, day);
      if (minDate && targetValue < formatDate(minDate.year, minDate.month, minDate.day)) {
        return true;
      }
      if (maxDate && targetValue > formatDate(maxDate.year, maxDate.month, maxDate.day)) {
        return true;
      }
      return false;
    }, [maxDate, minDate]);

    const updatePlacement = useCallback(() => {
      if (!containerRef.current) {
        setPositionReady(false);
        return;
      }

      setPlacement(resolvePlacement(containerRef.current.getBoundingClientRect(), type, dropdownRef.current));
      setPositionReady(true);
    }, [type]);

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

    useLayoutEffect(() => {
      if (!open) {
        setPositionReady(false);
        return;
      }

      updatePlacement();
      const rafId = window.requestAnimationFrame(updatePlacement);
      window.addEventListener('resize', updatePlacement);
      window.addEventListener('scroll', updatePlacement, true);

      return () => {
        window.cancelAnimationFrame(rafId);
        window.removeEventListener('resize', updatePlacement);
        window.removeEventListener('scroll', updatePlacement, true);
      };
    }, [open, updatePlacement]);

    const handleSelectDate = (year: number, month: number, day: number) => {
      if (isDateDisabled(year, month, day)) {
        return;
      }
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

      if (isDateDisabled(y, m, d)) {
        return;
      }

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
    }, [currentDate, currentTime, emitChange, isDateDisabled, tempHour, tempMinute, type]);

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

    return (
      <div
        ref={(node) => {
          containerRef.current = node;
          if (typeof ref === 'function') ref(node);
          else if (ref) ref.current = node;
        }}
        className={cn('cf-date-picker', open && 'is-open')}
      >
        <input type="hidden" id={id} name={name} value={value} required={required} />

        <button
          type="button"
          disabled={disabled}
          onClick={() => {
            if (disabled) {
              return;
            }

            if (!open && containerRef.current) {
              setPlacement(resolvePlacement(containerRef.current.getBoundingClientRect(), type, null));
              setPositionReady(false);
            }

            setOpen(!open);
          }}
          className={cn(
            'cf-date-trigger cf-control group flex h-10 min-h-10 w-full items-center gap-2 rounded-md px-4 text-left text-sm',
            open && 'cf-control-active',
            className,
          )}
        >
          {type === 'time' ? (
            <Clock
              size={14}
              className="cf-date-trigger-icon"
            />
          ) : (
            <Calendar
              size={14}
              className="cf-date-trigger-icon"
            />
          )}

          <span className={cn('cf-date-trigger-value', !displayText && 'is-placeholder')}>
            {displayText || placeholder || defaultPlaceholder}
          </span>

          {value && !disabled ? (
            <X
              size={14}
              className="cf-date-clear"
              onClick={handleClear}
            />
          ) : null}
        </button>

        {open && typeof document !== 'undefined'
          ? createPortal(
              <div
                ref={dropdownRef}
                className={cn('cf-date-dropdown', type === 'datetime-local' && 'is-datetime', type === 'time' && 'is-time')}
                style={{
                  top: placement.top,
                  left: placement.left,
                  width: placement.width,
                  maxHeight: placement.maxHeight,
                  visibility: positionReady ? 'visible' : 'hidden',
                  pointerEvents: positionReady ? undefined : 'none',
                }}
              >
                <div className="cf-date-dropdown-main">
                  {type === 'date' || type === 'datetime-local' ? (
                    <div className={cn('cf-date-calendar-slot', type === 'date' ? 'is-full' : 'is-datetime')}>
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
                        isDateDisabled={type === 'date' || type === 'datetime-local' ? isDateDisabled : undefined}
                      />
                    </div>
                  ) : null}

                  {type === 'time' || type === 'datetime-local' ? (
                    <div className={cn('cf-date-time-slot', type === 'time' ? 'is-full' : 'is-datetime')}>
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
                  <div className="cf-date-footer">
                    <div className="cf-date-footer-quickrow">
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
                          className="cf-date-quick-button"
                        >
                          {item.label}
                        </button>
                      ))}
                    </div>

                    <div className="cf-date-footer-actions">
                      <span className="cf-date-summary">
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
