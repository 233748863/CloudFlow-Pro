import { useEffect, useState } from 'react';
import { DatePicker } from '@/components/common/date-picker';
import { getAllHolidayCalendars, type HolidayCalendar } from '@/services/api/holiday';
import { LazyInput } from './LazyInput';
import { PropertySection, PropertySelect, type SemanticPropertyProps } from './SemanticPropertyFields';

export const TimerPropertyFields = ({ node, onChange }: SemanticPropertyProps) => {
  const props = node.props ?? {};
  const update = (changes: Record<string, unknown>) => onChange({ props: { ...props, ...changes } });
  const timerType = props.timerType ?? 'DELAY';
  const legacyDelay = props.delayValue == null && props.delayMinutes != null;
  const delayUnit = legacyDelay ? 'MINUTE' : props.delayUnit ?? 'HOUR';
  const delayValue = legacyDelay ? props.delayMinutes : props.delayValue;
  const timeKey = timerType === 'SCHEDULE' ? 'scheduleTime' : 'fixedTime';
  const usesVariable = String(props[timeKey] ?? '').includes('${');
  const [calendars, setCalendars] = useState<HolidayCalendar[]>([]);
  const [calendarError, setCalendarError] = useState('');

  useEffect(() => {
    if (delayUnit !== 'WORKDAY') return;
    let cancelled = false;
    setCalendarError('');
    getAllHolidayCalendars().then((rows) => {
      if (!cancelled) setCalendars(rows.filter((calendar) => calendar.status === 'ENABLED'));
    }).catch(() => {
      if (!cancelled) setCalendarError('日历列表加载失败；不指定日历时仍按发起员工的有效日历计算。');
    });
    return () => { cancelled = true; };
  }, [delayUnit]);

  return <PropertySection title="定时设置">
    <PropertySelect label="定时类型" value={timerType}
      options={{ DELAY: '延迟一段时间', FIXED_TIME: '等待指定时刻', CRON_ONCE: '时间表达式的下次时刻', ...(timerType === 'SCHEDULE' ? { SCHEDULE: '指定时刻（原配置）' } : {}) }}
      onChange={(value) => update({ timerType: value })} />
    {timerType === 'DELAY' && <>
      <label className="grid gap-1 text-xs text-cf-body"><span>延迟数量（1—36500）</span>
        <LazyInput aria-label="延迟数量" type="number" min={1} max={36500} step={1} value={String(delayValue ?? '')}
          onChange={(value: string) => update({ delayValue: value === '' ? undefined : Number(value), delayUnit })} />
      </label>
      <PropertySelect label="延迟单位" value={delayUnit} options={{ MINUTE: '分钟', HOUR: '小时', DAY: '自然日', WORKDAY: '工作日' }}
        onChange={(value) => update({ delayUnit: value, delayValue })} />
      {delayUnit === 'WORKDAY' && <>
        <PropertySelect label="工作日日历" value={String(props.calendarId ?? '__AUTO__')}
          options={{ __AUTO__: '按发起员工自动匹配', ...Object.fromEntries(calendars.map((calendar) => [String(calendar.calendarId), calendar.calendarName])) }}
          onChange={(value) => update({ calendarId: value === '__AUTO__' ? undefined : Number(value) })}
          description="跳过周末和节假日，保留进入节点时的时分秒。" />
        {calendarError && <p role="status" className="text-[11px] text-[var(--cf-chart-warning)]">{calendarError}</p>}
      </>}
    </>}
    {(timerType === 'FIXED_TIME' || timerType === 'SCHEDULE') && <>
      <label className="grid gap-1 text-xs text-cf-body"><span>等待到达的时刻</span>
        {usesVariable
          ? <LazyInput aria-label="固定时间变量" value={props[timeKey] ?? ''} placeholder="${plannedTime}" onChange={(value: string) => update({ [timeKey]: value })} />
          : <DatePicker type="datetime-local" value={props[timeKey] ?? ''} onChange={(event) => update({ [timeKey]: event.target.value })} />}
      </label>
      {timerType === 'FIXED_TIME' && <label className="flex min-h-11 items-center gap-2 text-xs text-cf-body">
        <input type="checkbox" checked={usesVariable} onChange={(event) => update({ fixedTime: event.target.checked ? '${plannedTime}' : '' })} />使用流程时间变量
      </label>}
    </>}
    {timerType === 'CRON_ONCE' && <label className="grid gap-1 text-xs text-cf-body"><span>时间表达式</span>
      <LazyInput aria-label="定时时间表达式" value={props.cronExpression ?? ''} placeholder="0 0 9 * * MON-FRI" onChange={(value: string) => update({ cronExpression: value })} />
      <span className="text-[11px] text-cf-muted">依次填写秒、分、时、日、月、星期；只等待下次时刻，不重复执行。</span>
    </label>}
    <PropertySelect label="到期动作" value={props.timerAction ?? 'AUTO_PASS'}
      options={{ AUTO_PASS: '自动通过并继续', AUTO_REJECT: '按驳回策略退回', NOTIFY_ONLY: '仅通知，继续等待人工结束' }}
      onChange={(value) => update({ timerAction: value })} />
    <p className="text-[11px] leading-relaxed text-cf-muted">正常扫描间隔为 3 分钟，到期触发误差不超过 3 分钟。仅通知时不会继续流转，管理员可填写原因提前结束等待。</p>
  </PropertySection>;
};
