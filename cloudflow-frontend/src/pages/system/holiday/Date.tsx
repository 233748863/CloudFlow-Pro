import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import {
  ArrowLeft,
  CalendarRange,
  ChevronLeft,
  ChevronRight,
  Eye,
  FileSpreadsheet,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  WandSparkles,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  BaseDialog,
  Button,
  ConfirmDialog,
  DetailDialog,
  DatePicker,
  Input,
  Pagination,
  PermissionGuard,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Textarea,
} from '@/components/common';
import { InnerTableSurface, TablePageLayout } from '@/components/layout';
import { ImportButton } from '@/components/import/ImportButton';
import {
  DayType,
  getAllHolidayCalendars,
  getHolidayDates,
  getHolidayMonthTypes,
  HolidayCalendar,
  HolidayDateItem,
  HolidayDateType,
  saveHolidayDates,
} from '@/services/api/holiday';
import { getErrorMessage } from '@/utils/errorMessage';
import { cn } from '@/utils/cn';
import { useAuth } from '@/context/AuthContext';
import type { DatePickerDayAnnotation } from '@/components/common/date-picker';
import {
  InfrastructureBadge,
  InfrastructureField,
  InfrastructurePageHeader,
  InfrastructureStats,
  InfrastructureTableStateRow,
} from '../_components/InfrastructurePrimitives';

const WEEKDAY_LABELS = ['一', '二', '三', '四', '五', '六', '日'];
const MONTH_LABELS = [
  '一月',
  '二月',
  '三月',
  '四月',
  '五月',
  '六月',
  '七月',
  '八月',
  '九月',
  '十月',
  '十一月',
  '十二月',
];

const DATE_TYPE_LABELS: Record<HolidayDateType, string> = {
  WORKDAY: '调休上班',
  HOLIDAY: '法定节假日',
  REST: '休息日',
};

const dateTypeTone = (type: HolidayDateType) => {
  if (type === 'WORKDAY') return 'success' as const;
  if (type === 'HOLIDAY') return 'danger' as const;
  return 'warning' as const;
};

const dateTypeCellClass = (type: HolidayDateType) => {
  if (type === 'WORKDAY') {
    return 'border-emerald-200 bg-emerald-50 text-emerald-800 dark:border-emerald-900/70 dark:bg-emerald-950/30 dark:text-emerald-100';
  }
  if (type === 'HOLIDAY') {
    return 'border-rose-200 bg-rose-50 text-rose-800 dark:border-rose-900/70 dark:bg-rose-950/30 dark:text-rose-100';
  }
  return 'border-amber-200 bg-amber-50 text-amber-800 dark:border-amber-900/70 dark:bg-amber-950/30 dark:text-amber-100';
};

const formatDate = (year: number, month: number, day: number) =>
  `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;

const isValidIsoDate = (value: string) => {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
  if (!match) return false;
  const expectedYear = Number(match[1]);
  const expectedMonth = Number(match[2]);
  const expectedDay = Number(match[3]);
  const parsed = new Date(expectedYear, expectedMonth - 1, expectedDay);
  return (
    parsed.getFullYear() === expectedYear &&
    parsed.getMonth() === expectedMonth - 1 &&
    parsed.getDate() === expectedDay
  );
};

const buildMonthCells = (year: number, month: number) => {
  const firstWeekday = (new Date(year, month - 1, 1).getDay() + 6) % 7;
  const dayCount = new Date(year, month, 0).getDate();
  return [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: dayCount }, (_, index) => ({
      day: index + 1,
      date: formatDate(year, month, index + 1),
    })),
  ];
};

const normalizeDateItem = (item: HolidayDateItem): HolidayDateItem => ({
  ...item,
  triplePayFlag: item.dateType === 'HOLIDAY' ? item.triplePayFlag : 0,
  holidayName: item.holidayName || '',
  remark: item.remark || '',
});

const sortDateItems = (items: HolidayDateItem[]) =>
  [...items].sort((left, right) => left.holidayDate.localeCompare(right.holidayDate));

type PendingContext = {
  calendarId: number;
  year: number;
  month?: number;
  reload?: boolean;
};

export const HolidayDatePage: React.FC = () => {
  const navigate = useNavigate();
  const { hasPermission } = useAuth();
  const canEdit = hasPermission('system:holiday:edit');
  const [searchParams] = useSearchParams();
  const requestedCalendarId = Number(searchParams.get('calendarId') || 0);
  const currentDate = new Date();
  const [calendars, setCalendars] = useState<HolidayCalendar[]>([]);
  const [calendarId, setCalendarId] = useState(0);
  const [year, setYear] = useState(currentDate.getFullYear());
  const [yearInput, setYearInput] = useState(String(currentDate.getFullYear()));
  const [month, setMonth] = useState(currentDate.getMonth() + 1);
  const [savedDates, setSavedDates] = useState<HolidayDateItem[]>([]);
  const [draftDates, setDraftDates] = useState<HolidayDateItem[]>([]);
  const [monthTypes, setMonthTypes] = useState<DayType[]>([]);
  const [loading, setLoading] = useState(false);
  const [monthLoading, setMonthLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [dirty, setDirty] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [calendarError, setCalendarError] = useState<string | null>(null);
  const [loadedYear, setLoadedYear] = useState('');
  const yearRequest = useRef(0);
  const monthRequest = useRef(0);
  const calendarRequest = useRef(0);
  const [editor, setEditor] = useState<HolidayDateItem | null>(null);
  const [batchOpen, setBatchOpen] = useState(false);
  const [batchText, setBatchText] = useState('');
  const [pendingContext, setPendingContext] = useState<PendingContext | null>(null);
  const [detailDate, setDetailDate] = useState<HolidayDateItem | null>(null);
  const [datePage, setDatePage] = useState(1);
  const [datePageSize, setDatePageSize] = useState(10);

  const selectedCalendar = useMemo(
    () => calendars.find((item) => item.calendarId === calendarId),
    [calendarId, calendars],
  );
  const yearReady = loadedYear === `${calendarId}:${year}` && !loading && !error && !calendarError;
  const editingDisabled = !canEdit || saving || !yearReady;

  const loadCalendars = useCallback(async () => {
    const requestId = ++calendarRequest.current;
    setCalendarError(null);
    try {
      const rows = await getAllHolidayCalendars();
      if (requestId !== calendarRequest.current) return;
      setCalendars(rows);
      setCalendarId((current) => {
        if (rows.some((item) => item.calendarId === current)) return current;
        if (
          Number.isSafeInteger(requestedCalendarId) &&
          requestedCalendarId > 0 &&
          rows.some((item) => item.calendarId === requestedCalendarId)
        ) {
          return requestedCalendarId;
        }
        return (
          rows.find((item) => item.defaultFlag === 1 && item.status === 'ENABLED')
            ?.calendarId ||
          rows.find((item) => item.status === 'ENABLED')?.calendarId ||
          rows[0]?.calendarId ||
          0
        );
      });
    } catch (loadError) {
      if (requestId !== calendarRequest.current) return;
      const message = getErrorMessage(loadError, '日历选项加载失败');
      setCalendarError(message);
      toast.error(message);
    }
  }, [requestedCalendarId]);

  const loadYearDates = useCallback(async () => {
    const requestId = ++yearRequest.current;
    if (!calendarId) {
      setSavedDates([]);
      setDraftDates([]);
      return;
    }
    setLoading(true);
    setError(null);
    try {
      const rows = sortDateItems((await getHolidayDates(calendarId, year)) || []).map(
        normalizeDateItem,
      );
      if (requestId !== yearRequest.current) return;
      setSavedDates(rows);
      setDraftDates(rows);
      setLoadedYear(`${calendarId}:${year}`);
      setDirty(false);
      setDatePage(1);
    } catch (loadError) {
      if (requestId !== yearRequest.current) return;
      const message = getErrorMessage(loadError, '日期明细加载失败');
      setError(message);
      toast.error(message);
    } finally {
      if (requestId === yearRequest.current) setLoading(false);
    }
  }, [calendarId, year]);

  const loadMonthTypes = useCallback(async () => {
    const requestId = ++monthRequest.current;
    if (!calendarId) {
      setMonthTypes([]);
      return;
    }
    setMonthLoading(true);
    try {
      const rows = (await getHolidayMonthTypes(calendarId, year, month)) || [];
      if (requestId === monthRequest.current) setMonthTypes(rows);
    } catch (loadError) {
      if (requestId !== monthRequest.current) return;
      setMonthTypes([]);
      toast.error(getErrorMessage(loadError, '月度日期类型加载失败'));
    } finally {
      if (requestId === monthRequest.current) setMonthLoading(false);
    }
  }, [calendarId, month, year]);

  useEffect(() => {
    void loadCalendars();
    return () => { calendarRequest.current += 1; };
  }, [loadCalendars]);

  useEffect(() => {
    void loadYearDates();
    return () => { yearRequest.current += 1; };
  }, [loadYearDates]);

  useEffect(() => {
    void loadMonthTypes();
    return () => { monthRequest.current += 1; };
  }, [loadMonthTypes]);

  useEffect(() => {
    setYearInput(String(year));
  }, [year]);

  const savedDateMap = useMemo(
    () => new Map(savedDates.map((item) => [item.holidayDate, item])),
    [savedDates],
  );
  const draftDateMap = useMemo(
    () => new Map(draftDates.map((item) => [item.holidayDate, item])),
    [draftDates],
  );
  const resolvedDateMap = useMemo(
    () => new Map(monthTypes.map((item) => [item.date, item])),
    [monthTypes],
  );
  const restDays = useMemo(
    () =>
      new Set(
        (selectedCalendar?.weeklyRestDays || '6,7')
          .split(',')
          .map(Number)
          .filter(Boolean),
      ),
    [selectedCalendar?.weeklyRestDays],
  );
  const monthCells = useMemo(() => buildMonthCells(year, month), [month, year]);
  const pickerAnnotations = useMemo(() => {
    const annotations: Record<string, DatePickerDayAnnotation> = {};
    if (!yearReady || !selectedCalendar) return annotations;
    for (let monthIndex = 0; monthIndex < 12; monthIndex += 1) {
      const dayCount = new Date(year, monthIndex + 1, 0).getDate();
      for (let day = 1; day <= dayCount; day += 1) {
        const date = formatDate(year, monthIndex + 1, day);
        const explicit = draftDateMap.get(date);
        const weekday = new Date(year, monthIndex, day).getDay() || 7;
        const type = explicit?.dateType || (restDays.has(weekday) ? 'REST' : 'WORKDAY');
        const label = type === 'HOLIDAY' ? '假' : type === 'REST' ? '休' : explicit ? '班' : '';
        const description = type === 'WORKDAY' && !explicit ? '工作日' : DATE_TYPE_LABELS[type];
        annotations[date] = {
          label,
          description: [description, explicit?.holidayName, explicit?.triplePayFlag === 1 ? '三倍工资日' : undefined].filter(Boolean).join('，'),
          className: type === 'HOLIDAY' ? 'text-rose-700 dark:text-rose-200' : type === 'REST' ? 'text-amber-800 dark:text-amber-200' : 'text-emerald-700 dark:text-emerald-200',
        };
      }
    }
    return annotations;
  }, [draftDateMap, restDays, selectedCalendar, year, yearReady]);
  const pagedDates = useMemo(
    () => draftDates.slice((datePage - 1) * datePageSize, datePage * datePageSize),
    [datePage, datePageSize, draftDates],
  );

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(draftDates.length / datePageSize));
    if (datePage > maxPage) setDatePage(maxPage);
  }, [datePage, datePageSize, draftDates.length]);

  const getDisplayedDayType = (date: string): DayType => {
    const draft = draftDateMap.get(date);
    if (draft) {
      return {
        date,
        dateType: draft.dateType,
        holidayName: draft.holidayName,
        triplePayFlag: draft.triplePayFlag,
      };
    }
    if (dirty && savedDateMap.has(date)) {
      const day = new Date(`${date}T00:00:00`).getDay();
      const isoWeekday = day === 0 ? 7 : day;
      return {
        date,
        dateType: restDays.has(isoWeekday) ? 'REST' : 'WORKDAY',
        holidayName: '',
        triplePayFlag: 0,
      };
    }
    const resolved = resolvedDateMap.get(date);
    if (resolved) return resolved;
    const day = new Date(`${date}T00:00:00`).getDay();
    const isoWeekday = day === 0 ? 7 : day;
    return {
      date,
      dateType: restDays.has(isoWeekday) ? 'REST' : 'WORKDAY',
      holidayName: '',
      triplePayFlag: 0,
    };
  };

  const requestContextChange = (next: PendingContext) => {
    if (saving) return;
    if (next.calendarId === calendarId && next.year === year) {
      if (next.month) setMonth(next.month);
      return;
    }
    if (dirty) {
      setPendingContext(next);
      return;
    }
    setSavedDates([]);
    setDraftDates([]);
    setMonthTypes([]);
    setCalendarId(next.calendarId);
    setYear(next.year);
    if (next.month) setMonth(next.month);
  };

  const applyYearInput = () => {
    const nextYear = Number(yearInput);
    if (!Number.isSafeInteger(nextYear) || nextYear < 1900 || nextYear > 2100) {
      toast.error('年份必须为 1900 至 2100 的整数');
      setYearInput(String(year));
      return;
    }
    requestContextChange({ calendarId, year: nextYear });
  };

  const confirmContextChange = () => {
    if (!pendingContext) return;
    const reloadCurrent = pendingContext.reload === true;
    setDirty(false);
    if (!reloadCurrent) {
      setSavedDates([]);
      setDraftDates([]);
      setMonthTypes([]);
    }
    setCalendarId(pendingContext.calendarId);
    setYear(pendingContext.year);
    if (pendingContext.month) setMonth(pendingContext.month);
    setPendingContext(null);
    if (reloadCurrent) {
      void Promise.all([loadYearDates(), loadMonthTypes()]);
    }
  };

  const openDateEditor = (date: string) => {
    if (saving || !yearReady) return;
    const existing = draftDateMap.get(date);
    const resolved = getDisplayedDayType(date);
    if (!canEdit) {
      setDetailDate(existing || { holidayDate: date, dateType: resolved.dateType, holidayName: resolved.holidayName, triplePayFlag: resolved.triplePayFlag, yearNo: year });
      return;
    }
    setEditor(
      normalizeDateItem(
        existing || {
          holidayDate: date,
          dateType: resolved.dateType,
          holidayName: resolved.holidayName || '',
          triplePayFlag: resolved.triplePayFlag,
          yearNo: year,
          remark: '',
        },
      ),
    );
  };

  const saveDateEditor = () => {
    if (!editor || editingDisabled) return;
    const parsedDate = new Date(`${editor.holidayDate}T00:00:00`);
    if (
      !isValidIsoDate(editor.holidayDate) ||
      parsedDate.getFullYear() !== year
    ) {
      toast.error(`日期必须属于 ${year} 年`);
      return;
    }
    const next = normalizeDateItem({
      ...editor,
      holidayName: editor.holidayName?.trim() || '',
      remark: editor.remark?.trim() || '',
      yearNo: year,
    });
    setDraftDates((current) =>
      sortDateItems([
        ...current.filter((item) => item.holidayDate !== next.holidayDate),
        next,
      ]),
    );
    setDirty(true);
    setEditor(null);
    setMonth(parsedDate.getMonth() + 1);
  };

  const removeDraftDate = (date: string) => {
    if (editingDisabled) return;
    setDraftDates((current) => current.filter((item) => item.holidayDate !== date));
    setDirty(true);
  };

  const parseBatchLines = () => {
    if (editingDisabled) return;
    const typeAliases: Record<string, HolidayDateType> = {
      WORKDAY: 'WORKDAY',
      HOLIDAY: 'HOLIDAY',
      REST: 'REST',
      调休上班: 'WORKDAY',
      法定节假日: 'HOLIDAY',
      休息日: 'REST',
    };
    const lines = batchText
      .split(/\r?\n/)
      .map((text, index) => ({ text: text.trim(), rowNumber: index + 1 }))
      .filter((line) => line.text);
    if (!lines.length) {
      toast.error('请至少录入一行日期');
      return;
    }
    const parsed: HolidayDateItem[] = [];
    const seen = new Set<string>();
    for (let index = 0; index < lines.length; index += 1) {
      const { text, rowNumber } = lines[index];
      const columns = text.split(',').map((item) => item.trim());
      const [date = '', rawType = '', holidayName = '', rawFlag = '', remark = ''] = columns;
      const dateValue = new Date(`${date}T00:00:00`);
      const type = typeAliases[rawType.toUpperCase()] || typeAliases[rawType];
      if (
        !isValidIsoDate(date) ||
        dateValue.getFullYear() !== year
      ) {
        toast.error(`第 ${rowNumber} 行日期无效或不属于 ${year} 年`);
        return;
      }
      if (!type) {
        toast.error(`第 ${rowNumber} 行类型必须为 WORKDAY、HOLIDAY 或 REST`);
        return;
      }
      if (columns.length < 4 || columns.length > 5 || !['0', '1'].includes(rawFlag)) {
        toast.error(`第 ${rowNumber} 行必须明确填写是否三倍工资日：0 或 1；格式为日期,类型,名称,是否三倍工资日,备注`);
        return;
      }
      if (type !== 'HOLIDAY' && rawFlag !== '0') {
        toast.error(`第 ${rowNumber} 行工作日或休息日的三倍工资标记必须为 0`);
        return;
      }
      if (holidayName.length > 50 || remark.length > 200) {
        toast.error(`第 ${rowNumber} 行名称最多50字，备注最多200字`);
        return;
      }
      if (seen.has(date)) {
        toast.error(`第 ${rowNumber} 行日期重复：${date}`);
        return;
      }
      seen.add(date);
      parsed.push({
        holidayDate: date,
        dateType: type,
        holidayName,
        triplePayFlag: Number(rawFlag),
        yearNo: year,
        remark,
      });
    }
    const merged = new Map(draftDates.map((item) => [item.holidayDate, item]));
    parsed.forEach((item) => merged.set(item.holidayDate, item));
    setDraftDates(sortDateItems(Array.from(merged.values())));
    setDirty(true);
    setBatchOpen(false);
    setBatchText('');
    toast.success(`已暂存 ${parsed.length} 条日期，点击“保存全年配置”后生效`);
  };

  const handleSave = async () => {
    if (editingDisabled) return;
    if (!calendarId) {
      toast.error('请先选择日历');
      return;
    }
    setSaving(true);
    try {
      await saveHolidayDates(calendarId, year, draftDates);
      setDirty(false);
      setSavedDates(draftDates);
      toast.success(`${year} 年日期配置已保存，共 ${draftDates.length} 条例外`);
      await Promise.all([loadYearDates(), loadMonthTypes()]);
    } catch (saveError) {
      toast.error(getErrorMessage(saveError, '日期配置保存失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleRefresh = () => {
    if (saving) return;
    if (calendarError || !calendars.length) {
      void loadCalendars();
      return;
    }
    if (dirty) {
      setPendingContext({ calendarId, year, reload: true });
      return;
    }
    void Promise.all([loadYearDates(), loadMonthTypes()]);
  };

  const stats = useMemo(
    () => [
      {
        label: '全年例外',
        value: String(draftDates.length),
        meta: dirty ? '存在未保存修改' : '已与服务端同步',
        icon: <CalendarRange size={18} />,
        tone: 'blue' as const,
      },
      {
        label: '法定节假日',
        value: String(draftDates.filter((item) => item.dateType === 'HOLIDAY').length),
        meta: '全年配置',
        icon: <FileSpreadsheet size={18} />,
        tone: 'green' as const,
      },
      {
        label: '调休上班',
        value: String(draftDates.filter((item) => item.dateType === 'WORKDAY').length),
        meta: '全年配置',
        icon: <WandSparkles size={18} />,
        tone: 'amber' as const,
      },
      {
        label: '休息日例外',
        value: String(draftDates.filter((item) => item.dateType === 'REST').length),
        meta: selectedCalendar?.calendarName || '未选择日历',
        icon: <Save size={18} />,
        tone: 'violet' as const,
      },
    ],
    [dirty, draftDates, selectedCalendar?.calendarName],
  );

  return (
    <>
      <section className="admin-source-page">
        <TablePageLayout
          actions={
            <div className="grid gap-5">
              <InfrastructurePageHeader
                kicker="HOLIDAY DATE WORKBENCH"
                title="日期明细维护"
                description="按年维护例外日期，普通周末由日历固定休息日自动推导"
              >
                <Button variant="outline" size="sm" onClick={() => navigate('/holiday')}>
                  <ArrowLeft size={16} />
                  返回日历
                </Button>
                <ImportButton bizType="HOLIDAY" permission="system:holiday:import" disabled={dirty}
                  onSuccess={() => void Promise.all([loadYearDates(), loadMonthTypes()])} />
                <Button
                  variant="outline"
                  size="sm"
                  onClick={handleRefresh}
                  disabled={loading || monthLoading || saving}
                >
                  <RefreshCw
                    size={16}
                    className={cn((loading || monthLoading) && 'animate-spin')}
                  />
                  刷新
                </Button>
                <PermissionGuard permissions={['system:holiday:edit']} hidden>
                  <Button
                    size="sm"
                    onClick={() => void handleSave()}
                    disabled={!dirty || editingDisabled || !calendarId}
                  >
                    <Save size={16} />
                    {saving ? '保存中...' : '保存全年配置'}
                  </Button>
                </PermissionGuard>
              </InfrastructurePageHeader>
              <InfrastructureStats items={stats} />
            </div>
          }
          filters={
            <section className="card admin-users-toolbar">
              <div className="admin-holiday-date-filter-grid">
                <label className="admin-source-search">
                  <span className="input-label">节假日日历</span>
                  <Select
                    value={calendarId ? String(calendarId) : ''}
                    disabled={saving}
                    onValueChange={(value) =>
                      requestContextChange({ calendarId: Number(value), year })
                    }
                    searchable
                    searchPlaceholder="搜索日历"
                  >
                    <SelectTrigger className="h-[42px]">
                      <SelectValue placeholder="请选择日历" />
                    </SelectTrigger>
                    <SelectContent className="min-w-[280px]">
                      {calendars.map((calendar) => (
                        <SelectItem
                          key={calendar.calendarId}
                          value={String(calendar.calendarId)}
                          label={calendar.calendarName}
                        >
                          <div>
                            <p className="text-sm">{calendar.calendarName}</p>
                            <p className="mt-1 font-mono text-xs text-cf-subtle">
                              {calendar.calendarCode} · {calendar.region || '未设置地区'}
                            </p>
                          </div>
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <label>
                  <span className="input-label">年份</span>
                  <Input
                    type="number"
                    disabled={saving}
                    min={1900}
                    max={2100}
                    value={yearInput}
                    onChange={(event) => setYearInput(event.target.value)}
                    onBlur={applyYearInput}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        event.preventDefault();
                        applyYearInput();
                      }
                    }}
                  />
                </label>
                <label>
                  <span className="input-label">月份</span>
                  <Select value={String(month)} disabled={saving} onValueChange={(value) => setMonth(Number(value))}>
                    <SelectTrigger className="h-[42px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {MONTH_LABELS.map((label, index) => (
                        <SelectItem key={label} value={String(index + 1)}>
                          {label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </label>
                <div className="admin-users-toolbar-actions">
                  <span className="admin-users-filter-count">
                    {selectedCalendar?.calendarName || '未选择日历'}
                  </span>
                  <PermissionGuard permissions={['system:holiday:edit']} hidden>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      onClick={() => {
                        setBatchText('');
                        setBatchOpen(true);
                      }}
                      disabled={!calendarId || editingDisabled}
                    >
                      <WandSparkles size={15} />
                      批量录入
                    </Button>
                    <Button
                      type="button"
                      size="sm"
                      onClick={() => openDateEditor(formatDate(year, month, 1))}
                      disabled={!calendarId || editingDisabled}
                    >
                      <Plus size={15} />
                      新增日期
                    </Button>
                  </PermissionGuard>
                </div>
              </div>
            </section>
          }
          table={
            <div className="grid gap-5">
              <section className="card overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 p-4 dark:border-slate-800">
                  <div>
                    <h3 className="text-sm font-semibold text-cf-title">
                      {year} 年 {MONTH_LABELS[month - 1]}
                    </h3>
                    <div className="mt-2 flex flex-wrap gap-2">
                      <InfrastructureBadge tone="success">调休上班</InfrastructureBadge>
                      <InfrastructureBadge tone="danger">法定节假日</InfrastructureBadge>
                      <InfrastructureBadge tone="warning">休息日</InfrastructureBadge>
                      <InfrastructureBadge tone="info">圆点表示显式例外</InfrastructureBadge>
                    </div>
                  </div>
                  <div className="flex items-center gap-2">
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="上个月"
                      disabled={month === 1 || saving}
                      onClick={() => setMonth((current) => current - 1)}
                    >
                      <ChevronLeft size={16} />
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="sm"
                      disabled={saving}
                      onClick={() => {
                        requestContextChange({
                          calendarId,
                          year: currentDate.getFullYear(),
                          month: currentDate.getMonth() + 1,
                        });
                      }}
                    >
                      今天
                    </Button>
                    <Button
                      type="button"
                      variant="outline"
                      size="icon"
                      aria-label="下个月"
                      disabled={month === 12 || saving}
                      onClick={() => setMonth((current) => current + 1)}
                    >
                      <ChevronRight size={16} />
                    </Button>
                  </div>
                </div>
                <div className="p-3 sm:p-4">
                  {calendarError || error ? <p role="alert" className="mb-3 text-sm text-rose-700 dark:text-rose-200">{calendarError || error}，请刷新后再维护日期。</p> : null}
                  {!yearReady && !calendarError && !error ? <p role="status" className="mb-3 text-sm text-cf-subtle">{calendarId ? '正在加载年度日期类型…' : '请先创建并选择日历。'}</p> : null}
                  <div className="grid grid-cols-7 gap-1.5">
                    {WEEKDAY_LABELS.map((label) => (
                      <div
                        key={label}
                        className="py-2 text-center text-xs font-medium text-cf-faint"
                      >
                        周{label}
                      </div>
                    ))}
                    {monthCells.map((cell, index) => {
                      if (!cell) {
                        return <div key={`blank-${index}`} className="min-h-[78px]" />;
                      }
                      const dayType = getDisplayedDayType(cell.date);
                      const explicit = draftDateMap.has(cell.date);
                      const dayTypeLabel = dayType.dateType === 'WORKDAY' && !explicit ? '工作日' : DATE_TYPE_LABELS[dayType.dateType];
                      return (
                        <button
                          key={cell.date}
                          type="button"
                          disabled={!yearReady || saving}
                          onClick={() => openDateEditor(cell.date)}
                          className={cn(
                            'relative min-h-[78px] rounded-md border p-2 text-left transition duration-150 motion-reduce:transition-none hover:-translate-y-0.5 hover:shadow-sm focus:outline-none focus:ring-2 focus:ring-cyan-500/30 disabled:cursor-not-allowed disabled:opacity-50 sm:min-h-[92px]',
                            dateTypeCellClass(dayType.dateType),
                          )}
                          aria-label={`${cell.date}，${dayTypeLabel}`}
                        >
                          <span className="text-sm font-semibold">{cell.day}</span>
                          {explicit ? (
                            <span className="absolute right-2 top-2 h-1.5 w-1.5 rounded-full bg-current" />
                          ) : null}
                          <span className="mt-2 block text-[11px] font-medium sm:text-xs">
                            {dayType.holidayName || dayTypeLabel}
                          </span>
                          {dayType.triplePayFlag === 1 ? (
                            <span className="mt-1 block text-[10px]">三倍工资日</span>
                          ) : null}
                        </button>
                      );
                    })}
                  </div>
                  {monthLoading ? (
                    <p className="mt-3 text-center text-xs text-cf-subtle">正在刷新月度日期类型...</p>
                  ) : null}
                </div>
              </section>

              <section>
                <div className="mb-3 flex flex-wrap items-end justify-between gap-3">
                  <div>
                    <h3 className="text-sm font-semibold text-cf-title">{year} 年例外日期</h3>
                    <p className="mt-1 text-xs text-cf-subtle">
                      保存操作会以当前列表整体替换该年份的服务端配置。
                    </p>
                  </div>
                  {dirty ? (
                    <InfrastructureBadge tone="warning">有未保存修改</InfrastructureBadge>
                  ) : (
                    <InfrastructureBadge tone="success">已同步</InfrastructureBadge>
                  )}
                </div>
                <InnerTableSurface>
                  <table className="unity-data-table admin-source-table min-w-[960px]">
                    <thead>
                      <tr>
                        <th>日期</th>
                        <th>类型</th>
                        <th>节假日名称</th>
                        <th>工资倍率</th>
                        <th>备注</th>
                        <th>更新时间</th>
                        <th className="text-right">操作</th>
                      </tr>
                    </thead>
                    <tbody>
                      {loading ? (
                        <InfrastructureTableStateRow colSpan={7} title="正在加载日期明细..." loading />
                      ) : error ? (
                        <InfrastructureTableStateRow colSpan={7} title="日期明细加载失败" description={error} />
                      ) : pagedDates.length === 0 ? (
                        <InfrastructureTableStateRow
                          colSpan={7}
                          title="本年度暂无例外日期"
                          description="普通工作日和固定休息日会由日历基础模式自动推导。"
                        />
                      ) : (
                        pagedDates.map((item) => (
                          <tr key={item.holidayDate}>
                            <td>
                              <button
                                type="button"
                                disabled={!yearReady || saving}
                                className="font-mono text-sm font-medium text-cf-title hover:text-cyan-700 dark:hover:text-cyan-200"
                                onClick={() => {
                                  setMonth(Number(item.holidayDate.slice(5, 7)));
                                  openDateEditor(item.holidayDate);
                                }}
                              >
                                {item.holidayDate}
                              </button>
                            </td>
                            <td>
                              <InfrastructureBadge tone={dateTypeTone(item.dateType)}>
                                {DATE_TYPE_LABELS[item.dateType]}
                              </InfrastructureBadge>
                            </td>
                            <td>
                              <span className="text-sm text-cf-body">{item.holidayName || '-'}</span>
                            </td>
                            <td>
                              <span className="text-sm text-cf-body">
                                {item.triplePayFlag === 1 ? '3 倍' : '非三倍'}
                              </span>
                            </td>
                            <td>
                              <span className="inline-block max-w-[240px] truncate text-sm text-cf-subtle">
                                {item.remark || '-'}
                              </span>
                            </td>
                            <td>
                              <span className="whitespace-nowrap text-xs text-cf-subtle">
                                {item.updateTime || item.createTime || (dirty ? '待保存' : '-')}
                              </span>
                            </td>
                            <td className="text-right">
                              <div className="admin-users-row-actions">
                                <button
                                  type="button"
                                  data-tooltip="查看详情"
                                  aria-label="查看详情"
                                  onClick={() => setDetailDate(item)}
                                >
                                  <Eye size={15} />
                                </button>
                                <PermissionGuard permissions={['system:holiday:edit']} hidden>
                                  <button
                                    type="button"
                                    data-tooltip="编辑日期"
                                    aria-label="编辑日期"
                                    disabled={editingDisabled}
                                    onClick={() => openDateEditor(item.holidayDate)}
                                  >
                                    <CalendarRange size={15} />
                                  </button>
                                  <button
                                    type="button"
                                    className="danger"
                                    data-tooltip="移出全年配置"
                                    aria-label="移出全年配置"
                                    disabled={editingDisabled}
                                    onClick={() => removeDraftDate(item.holidayDate)}
                                  >
                                    <Trash2 size={15} />
                                  </button>
                                </PermissionGuard>
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </InnerTableSurface>
              </section>
            </div>
          }
          pagination={
            draftDates.length > 0 ? (
              <Pagination
                page={datePage}
                pageSize={datePageSize}
                total={draftDates.length}
                onPageChange={setDatePage}
                onPageSizeChange={(nextPageSize) => {
                  setDatePageSize(nextPageSize);
                  setDatePage(1);
                }}
              />
            ) : null
          }
        />
      </section>

      <BaseDialog
        open={Boolean(editor)}
        onClose={() => setEditor(null)}
        title={draftDateMap.has(editor?.holidayDate || '') ? '编辑例外日期' : '新增例外日期'}
        description="仅保存与每周固定模式不同的日期，以及法定节假日。"
        width="normal"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setEditor(null)}>
              取消
            </Button>
            <Button type="button" className="!min-h-[44px]" disabled={editingDisabled} onClick={saveDateEditor}>暂存日期</Button>
          </>
        }
      >
        {editor ? (
          <div className="admin-dialog-stack">
            <InfrastructureField label="日期 *">
              <DatePicker
                type="date"
                className="!min-h-[44px]"
                dayAnnotations={pickerAnnotations}
                dayLegend="假：法定节假日；班：调休上班；休：休息日。使用当前暂存配置。"
                value={editor.holidayDate}
                min={`${year}-01-01`}
                max={`${year}-12-31`}
                onChange={(event) =>
                  setEditor((current) =>
                    current ? { ...current, holidayDate: event.target.value } : current,
                  )
                }
              />
            </InfrastructureField>
            <InfrastructureField label="日期类型 *">
              <Select
                value={editor.dateType}
                onValueChange={(value) =>
                  setEditor((current) =>
                    current
                      ? {
                          ...current,
                          dateType: value as HolidayDateType,
                          triplePayFlag: value === 'HOLIDAY' && current.dateType === 'HOLIDAY' ? current.triplePayFlag : 0,
                        }
                      : current,
                  )
                }
              >
                <SelectTrigger aria-label="日期类型" className="!min-h-[44px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="WORKDAY">调休上班</SelectItem>
                  <SelectItem value="HOLIDAY">法定节假日</SelectItem>
                  <SelectItem value="REST">休息日</SelectItem>
                </SelectContent>
              </Select>
            </InfrastructureField>
            <InfrastructureField
              label="节假日名称"
              hint="法定节假日建议填写，例如春节、国庆节。"
            >
              <Input
                value={editor.holidayName || ''}
                maxLength={50}
                onChange={(event) =>
                  setEditor((current) =>
                    current ? { ...current, holidayName: event.target.value } : current,
                  )
                }
                placeholder="例如 春节"
              />
            </InfrastructureField>
            <div className="flex items-center justify-between gap-4 rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] p-4 dark:border-slate-800 dark:bg-slate-900/70">
              <div>
                <label htmlFor="holiday-triple-pay" className="text-sm font-medium text-cf-title">三倍工资日</label>
                <p className="mt-1 text-xs text-cf-subtle">
                  按已核定安排手动设置，法定节假日可选0或1；工作日和休息日固定为0。
                </p>
              </div>
              <Switch id="holiday-triple-pay" className="!min-h-[44px] !min-w-[44px]" checked={editor.triplePayFlag === 1} disabled={editor.dateType !== 'HOLIDAY' || editingDisabled}
                onCheckedChange={(checked) => setEditor((current) => current ? { ...current, triplePayFlag: checked ? 1 : 0 } : current)} />
            </div>
            <InfrastructureField label="备注">
              <Textarea
                rows={3}
                value={editor.remark || ''}
                maxLength={200}
                onChange={(event) =>
                  setEditor((current) =>
                    current ? { ...current, remark: event.target.value } : current,
                  )
                }
                placeholder="说明调休来源或特殊安排"
              />
            </InfrastructureField>
          </div>
        ) : null}
      </BaseDialog>

      <BaseDialog
        open={batchOpen}
        onClose={() => setBatchOpen(false)}
        title="批量录入例外日期"
        description="每行格式：日期,类型,名称,是否三倍工资日(0/1),备注；同日期会覆盖当前暂存项。"
        width="wide"
        footer={
          <>
            <Button type="button" variant="outline" onClick={() => setBatchOpen(false)}>
              取消
            </Button>
            <Button type="button" className="!min-h-[44px]" disabled={editingDisabled} onClick={parseBatchLines}>
              <WandSparkles size={15} />
              解析并暂存
            </Button>
          </>
        }
      >
        <div className="admin-dialog-stack">
          <div className="rounded-md border border-cyan-200 bg-cyan-50 p-3 text-xs leading-6 text-cyan-800 dark:border-cyan-900/70 dark:bg-cyan-950/30 dark:text-cyan-100">
            类型支持 WORKDAY、HOLIDAY、REST，也支持“调休上班、法定节假日、休息日”；是否三倍工资日必须填写0或1，工作日和休息日只能填0。
          </div>
          <InfrastructureField label="批量内容">
            <Textarea
              data-autofocus
              rows={12}
              value={batchText}
              onChange={(event) => setBatchText(event.target.value)}
              className="font-mono text-xs leading-6"
              placeholder={`${year}-01-01,HOLIDAY,名称,0,待核定样本\n${year}-01-02,WORKDAY,,0,调休样本`}
            />
          </InfrastructureField>
        </div>
      </BaseDialog>


      <ConfirmDialog
        open={Boolean(pendingContext)}
        onCancel={() => {
          setPendingContext(null);
          setYearInput(String(year));
        }}
        onConfirm={confirmContextChange}
        title="放弃未保存修改"
        message="切换日历、年份或重新加载会丢弃当前暂存的日期修改，确定继续吗？"
        confirmText="放弃并继续"
        danger
      />

      <DetailDialog
        open={Boolean(detailDate)}
        title="节假日日期详情"
        onClose={() => setDetailDate(null)}
        heading={detailDate?.holidayName || detailDate?.holidayDate}
        subheading={detailDate?.holidayDate}
        headingAside={detailDate ? (
          <span className="text-xs text-cf-subtle">{DATE_TYPE_LABELS[detailDate.dateType]}</span>
        ) : undefined}
        sections={detailDate ? [
          {
            title: '日期信息',
            items: [
              { label: '日期', value: detailDate.holidayDate },
              { label: '日期类型', value: DATE_TYPE_LABELS[detailDate.dateType] },
              { label: '节假日名称', value: detailDate.holidayName },
              { label: '三倍工资', value: detailDate.triplePayFlag === 1 ? '3 倍' : '非三倍' },
              { label: '所属年份', value: detailDate.yearNo === undefined ? '' : String(detailDate.yearNo) },
              { label: '备注', value: detailDate.remark, wide: true },
            ],
          },
          {
            title: '变更记录',
            items: [
              { label: '创建时间', value: detailDate.createTime },
              { label: '更新时间', value: detailDate.updateTime },
            ],
          },
        ] : []}
      />
    </>
  );
};

export default HolidayDatePage;
