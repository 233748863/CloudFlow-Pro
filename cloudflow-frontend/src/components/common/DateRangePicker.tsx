import React, { useEffect, useId, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CalendarDays, Check, ChevronDown } from 'lucide-react';
import { cn } from '@/utils/cn';
import { Button } from './button';
import { BaseDialog } from './BaseDialog';
import { useBreakpoint } from '@/hooks/useBreakpoint';
import './common-primitives.css';

export interface DateRangeValue {
  startDate: string;
  endDate: string;
}

export interface DateRangePickerProps extends React.AriaAttributes {
  id?: string;
  value: DateRangeValue;
  onChange: (value: DateRangeValue) => void;
  disabled?: boolean;
  min?: string;
  max?: string;
  className?: string;
  ariaLabel?: string;
}

const formatLocalDate = (date: Date) => {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

const addDays = (dateValue: string, days: number) => {
  const date = new Date(`${dateValue}T00:00:00`);
  if (Number.isNaN(date.getTime())) return '';
  date.setDate(date.getDate() + days);
  return formatLocalDate(date);
};

const PRESETS = [
  { key: 'today', label: '今日', days: 0 },
  { key: '7d', label: '最近 7 天', days: 6 },
  { key: '30d', label: '最近 30 天', days: 29 },
] as const;

export const DateRangePicker: React.FC<DateRangePickerProps> = ({
  value,
  onChange,
  disabled = false,
  min,
  max,
  className,
  ariaLabel = '选择日期区间',
  id,
  ...accessibility
}) => {
  const popoverId = useId();
  const isMobile = useBreakpoint() === 'mobile';
  const [dateStep, setDateStep] = useState<'start' | 'end'>('start');
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);
  const [placement, setPlacement] = useState({ top: 0, left: 0, width: 352 });
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const popoverRef = useRef<HTMLDivElement | null>(null);

  const today = formatLocalDate(new Date());
  const activePreset = useMemo(
    () => PRESETS.find((preset) => value.endDate === today && value.startDate === addDays(today, -preset.days)) ?? null,
    [today, value.endDate, value.startDate],
  );
  const invalidStart = Boolean(draft.startDate && ((min && draft.startDate < min) || (max && draft.startDate > max)));
  const invalidDraft = invalidStart || Boolean(draft.endDate && ((min && draft.endDate < min) || (max && draft.endDate > max) || (draft.startDate && draft.startDate > draft.endDate)));
  const displayLabel = activePreset?.label
    || (value.startDate && value.endDate ? `${value.startDate} - ${value.endDate}` : '选择日期区间');

  useEffect(() => {
    if (open) {
      setDraft(value);
      setDateStep('start');
    }
  }, [open, value]);

  useEffect(() => {
    if (!open || isMobile) return undefined;
    const closeFromOutside = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!triggerRef.current?.contains(target) && !popoverRef.current?.contains(target)) setOpen(false);
    };
    const closeFromEscape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        setOpen(false);
        triggerRef.current?.focus();
      }
    };
    document.addEventListener('mousedown', closeFromOutside, true);
    window.addEventListener('keydown', closeFromEscape);
    return () => {
      document.removeEventListener('mousedown', closeFromOutside, true);
      window.removeEventListener('keydown', closeFromEscape);
    };
  }, [open, isMobile]);

  useLayoutEffect(() => {
    if (!open || isMobile || !triggerRef.current) return undefined;
    const updatePlacement = () => {
      if (!triggerRef.current) return;
      const rect = triggerRef.current.getBoundingClientRect();
      const viewportPadding = 12;
      const width = Math.min(352, window.innerWidth - viewportPadding * 2);
      const popoverHeight = popoverRef.current?.offsetHeight ?? 310;
      const spaceBelow = window.innerHeight - rect.bottom - viewportPadding;
      const dropUp = spaceBelow < popoverHeight && rect.top > spaceBelow;
      const top = dropUp ? Math.max(viewportPadding, rect.top - popoverHeight - 6) : rect.bottom + 6;
      const left = Math.min(
        Math.max(viewportPadding, rect.left),
        Math.max(viewportPadding, window.innerWidth - width - viewportPadding),
      );
      setPlacement({ top, left, width });
    };
    updatePlacement();
    const frame = window.requestAnimationFrame(updatePlacement);
    window.addEventListener('resize', updatePlacement);
    window.addEventListener('scroll', updatePlacement, true);
    return () => {
      window.cancelAnimationFrame(frame);
      window.removeEventListener('resize', updatePlacement);
      window.removeEventListener('scroll', updatePlacement, true);
    };
  }, [open, isMobile]);

  const applyPreset = (days: number) => {
    onChange({ startDate: addDays(today, -days), endDate: today });
    setOpen(false);
  };

  return (
    <div className={cn('cf-date-range-picker', className)}>
      <button
        ref={triggerRef}
        id={id}
        {...accessibility}
        type="button"
        className="cf-date-range-trigger cf-control cf-mobile-touch"
        disabled={disabled}
        aria-label={ariaLabel}
        aria-expanded={open}
        aria-haspopup="dialog"
        aria-controls={open ? popoverId : undefined}
        onClick={() => setOpen((current) => !current)}
      >
        <CalendarDays size={16} />
        <span>{displayLabel}</span>
        <ChevronDown size={16} className={cn('cf-date-range-chevron', open && 'is-open')} />
      </button>

      {isMobile ? (
        <BaseDialog open={open} title="日期区间" description={dateStep === 'start' ? '第 1 步：选择开始日期' : '第 2 步：选择结束日期'} onClose={() => setOpen(false)} zIndex={80} footer={(
          <>
            <Button type="button" variant="outline" onClick={() => dateStep === 'end' ? setDateStep('start') : setOpen(false)}>{dateStep === 'end' ? '上一步' : '取消'}</Button>
            <Button type="button" disabled={dateStep === 'start' ? !draft.startDate || invalidStart : !draft.startDate || !draft.endDate || invalidDraft} onClick={() => {
              if (dateStep === 'start') setDateStep('end');
              else {
                onChange(draft);
                setOpen(false);
              }
            }}>{dateStep === 'start' ? '下一步' : '应用'}</Button>
          </>
        )}>
          <div className="space-y-5">
            <div className="flex flex-wrap gap-2">
              {PRESETS.map((preset) => <Button key={preset.key} type="button" variant="outline" onClick={() => applyPreset(preset.days)} disabled={Boolean((min && addDays(today, -preset.days) < min) || (max && today > max))}>{preset.label}</Button>)}
            </div>
            <label className="block space-y-2 text-sm text-cf-body">
              <span>{dateStep === 'start' ? '开始日期' : '结束日期'}</span>
              <input key={dateStep} data-autofocus type="date" className="cf-control cf-mobile-touch w-full" aria-label={dateStep === 'start' ? '开始日期' : '结束日期'} value={dateStep === 'start' ? draft.startDate : draft.endDate} min={dateStep === 'start' ? min : draft.startDate || min} max={max} onChange={(event) => setDraft((current) => ({ ...current, [dateStep === 'start' ? 'startDate' : 'endDate']: event.target.value }))} />
            </label>
            {dateStep === 'end' ? <p className="text-sm text-cf-subtle">开始日期：{draft.startDate}</p> : null}
            {(dateStep === 'start' ? invalidStart : invalidDraft) ? <p role="alert" className="text-sm text-red-600 dark:text-red-400">请选择允许范围内的日期，结束日期不能早于开始日期。</p> : null}
          </div>
        </BaseDialog>
      ) : open && typeof document !== 'undefined'
        ? createPortal(
            <div
              ref={popoverRef}
              id={popoverId}
              role="dialog"
              aria-label="日期区间"
              className="cf-date-range-popover"
              style={placement}
            >
              <div className="cf-date-range-presets">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.key}
                    type="button"
                    className={cn(activePreset?.key === preset.key && 'is-active')}
                    onClick={() => applyPreset(preset.days)}
                  >
                    <span>{preset.label}</span>
                    {activePreset?.key === preset.key ? <Check size={15} /> : null}
                  </button>
                ))}
              </div>
              <div className="cf-date-range-custom">
                <label>
                  <span>开始日期</span>
                  <input
                    type="date"
                    className="cf-control"
                    value={draft.startDate}
                    min={min}
                    max={draft.endDate || max}
                    onChange={(event) => setDraft((current) => ({ ...current, startDate: event.target.value }))}
                  />
                </label>
                <label>
                  <span>结束日期</span>
                  <input
                    type="date"
                    className="cf-control"
                    value={draft.endDate}
                    min={draft.startDate || min}
                    max={max}
                    onChange={(event) => setDraft((current) => ({ ...current, endDate: event.target.value }))}
                  />
                </label>
              </div>
              {invalidDraft ? <p className="cf-date-range-error" role="alert">开始日期不能晚于结束日期</p> : null}
              <div className="cf-date-range-actions">
                <Button type="button" size="sm" variant="outline" onClick={() => setOpen(false)}>取消</Button>
                <Button
                  type="button"
                  size="sm"
                  disabled={!draft.startDate || !draft.endDate || invalidDraft}
                  onClick={() => {
                    onChange(draft);
                    setOpen(false);
                  }}
                >
                  应用
                </Button>
              </div>
            </div>,
            document.body,
          )
        : null}
    </div>
  );
};
