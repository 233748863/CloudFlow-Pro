import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  CheckCircle2,
  Edit3,
  Eye,
  MapPin,
  Plus,
  RefreshCw,
  RotateCcw,
  Search,
  Settings2,
  Star,
  Trash2,
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
import {
  addHolidayCalendar,
  deleteHolidayCalendars,
  getAllHolidayCalendars,
  getHolidayCalendar,
  HolidayCalendar,
  HolidayCalendarPayload,
  HolidayCalendarStatus,
  updateHolidayCalendar,
} from '@/services/api/holiday';
import { getErrorMessage } from '@/utils/errorMessage';
import { cn } from '@/utils/cn';
import {
  InfrastructureBadge,
  InfrastructureField,
  InfrastructurePageHeader,
  InfrastructureStats,
  InfrastructureTableStateRow,
} from '../_components/InfrastructurePrimitives';

const ALL_VALUE = '__all__';
const WEEK_DAYS = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 7, label: '周日' },
];

const EMPTY_CALENDAR: HolidayCalendarPayload = {
  calendarCode: '',
  calendarName: '',
  region: 'CN',
  defaultFlag: 0,
  weeklyRestDays: '6,7',
  workStartTime: '09:00:00',
  workEndTime: '18:00:00',
  lunchStartTime: '12:00:00',
  lunchEndTime: '13:00:00',
  status: 'ENABLED',
  remark: '',
};

type CalendarFilters = {
  keyword: string;
  status: '' | HolidayCalendarStatus;
};

const normalizeTime = (value?: string) => {
  if (!value) return '';
  return value.length === 5 ? `${value}:00` : value;
};

const displayRestDays = (value: string) => {
  const selected = new Set(
    value
      .split(',')
      .map((item) => Number(item))
      .filter((item) => item >= 1 && item <= 7),
  );
  return WEEK_DAYS.filter((item) => selected.has(item.value))
    .map((item) => item.label)
    .join('、') || '无固定休息日';
};

export const HolidayCalendarPage: React.FC = () => {
  const navigate = useNavigate();
  const [calendars, setCalendars] = useState<HolidayCalendar[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [filters, setFilters] = useState<CalendarFilters>({ keyword: '', status: '' });
  const [appliedFilters, setAppliedFilters] = useState<CalendarFilters>({
    keyword: '',
    status: '',
  });
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [editorOpen, setEditorOpen] = useState(false);
  const [editing, setEditing] = useState<HolidayCalendar | null>(null);
  const [form, setForm] = useState<HolidayCalendarPayload>({ ...EMPTY_CALENDAR });
  const [submitting, setSubmitting] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<HolidayCalendar | null>(null);
  const [detailCalendar, setDetailCalendar] = useState<HolidayCalendar | null>(null);

  const loadCalendars = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setCalendars(await getAllHolidayCalendars());
    } catch (loadError) {
      const message = getErrorMessage(loadError, '节假日日历加载失败');
      setError(message);
      setCalendars([]);
      toast.error(message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadCalendars();
  }, [loadCalendars]);

  const filteredCalendars = useMemo(() => {
    const keyword = appliedFilters.keyword.trim().toLowerCase();
    return calendars.filter((item) => {
      const keywordMatched =
        !keyword ||
        item.calendarName.toLowerCase().includes(keyword) ||
        item.calendarCode.toLowerCase().includes(keyword) ||
        (item.region || '').toLowerCase().includes(keyword);
      const statusMatched = !appliedFilters.status || item.status === appliedFilters.status;
      return keywordMatched && statusMatched;
    });
  }, [appliedFilters, calendars]);

  const pageRows = useMemo(
    () => filteredCalendars.slice((page - 1) * pageSize, page * pageSize),
    [filteredCalendars, page, pageSize],
  );

  useEffect(() => {
    const maxPage = Math.max(1, Math.ceil(filteredCalendars.length / pageSize));
    if (page > maxPage) setPage(maxPage);
  }, [filteredCalendars.length, page, pageSize]);

  const stats = useMemo(
    () => [
      {
        label: '日历总数',
        value: String(calendars.length),
        meta: `筛选后 ${filteredCalendars.length}`,
        icon: <CalendarDays size={18} />,
        tone: 'blue' as const,
      },
      {
        label: '启用日历',
        value: String(calendars.filter((item) => item.status === 'ENABLED').length),
        meta: '可参与日期判定',
        icon: <CheckCircle2 size={18} />,
        tone: 'green' as const,
      },
      {
        label: '默认日历',
        value: String(calendars.filter((item) => item.defaultFlag === 1).length),
        meta: '每租户最多 1 个',
        icon: <Star size={18} />,
        tone: 'amber' as const,
      },
      {
        label: '适用地区',
        value: String(new Set(calendars.map((item) => item.region).filter(Boolean)).size),
        meta: '地区覆盖',
        icon: <MapPin size={18} />,
        tone: 'violet' as const,
      },
    ],
    [calendars, filteredCalendars.length],
  );

  const handleSearch = (event: React.FormEvent) => {
    event.preventDefault();
    setAppliedFilters(filters);
    setPage(1);
  };

  const handleReset = () => {
    const next = { keyword: '', status: '' as const };
    setFilters(next);
    setAppliedFilters(next);
    setPage(1);
  };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...EMPTY_CALENDAR });
    setEditorOpen(true);
  };

  const openEdit = async (calendar: HolidayCalendar) => {
    setEditing(calendar);
    setForm({ ...EMPTY_CALENDAR, ...calendar });
    setEditorOpen(true);
    if (!calendar.calendarId) return;
    try {
      const detail = await getHolidayCalendar(calendar.calendarId);
      setEditing(detail);
      setForm({ ...EMPTY_CALENDAR, ...detail });
    } catch (loadError) {
      toast.error(getErrorMessage(loadError, '日历详情加载失败'));
    }
  };

  const toggleRestDay = (day: number) => {
    const selected = new Set(
      form.weeklyRestDays
        .split(',')
        .map((item) => Number(item))
        .filter(Boolean),
    );
    if (selected.has(day)) selected.delete(day);
    else selected.add(day);
    setForm((current) => ({
      ...current,
      weeklyRestDays: Array.from(selected).sort((a, b) => a - b).join(','),
    }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!form.calendarCode.trim() || !form.calendarName.trim()) {
      toast.error('日历编码和名称必填');
      return;
    }
    if (!form.weeklyRestDays) {
      toast.error('至少选择一个每周固定休息日');
      return;
    }
    const workStartTime = normalizeTime(form.workStartTime);
    const workEndTime = normalizeTime(form.workEndTime);
    const lunchStartTime = normalizeTime(form.lunchStartTime);
    const lunchEndTime = normalizeTime(form.lunchEndTime);
    if (!workStartTime || !workEndTime || workStartTime >= workEndTime) {
      toast.error('上班时间必须早于下班时间');
      return;
    }
    if (
      !lunchStartTime ||
      !lunchEndTime ||
      lunchStartTime >= lunchEndTime ||
      lunchStartTime < workStartTime ||
      lunchEndTime > workEndTime
    ) {
      toast.error('午休时段必须完整且位于工作时段内');
      return;
    }
    if (form.defaultFlag === 1 && form.status !== 'ENABLED') {
      toast.error('租户默认日历必须保持启用');
      return;
    }
    const payload: HolidayCalendarPayload = {
      ...form,
      calendarId: editing?.calendarId,
      calendarCode: form.calendarCode.trim(),
      calendarName: form.calendarName.trim(),
      region: form.region?.trim() || undefined,
      workStartTime,
      workEndTime,
      lunchStartTime,
      lunchEndTime,
      remark: form.remark?.trim() || undefined,
    };
    setSubmitting(true);
    try {
      if (editing?.calendarId) {
        await updateHolidayCalendar(payload);
        toast.success('节假日日历已更新');
      } else {
        await addHolidayCalendar(payload);
        toast.success('节假日日历已创建');
      }
      setEditorOpen(false);
      await loadCalendars();
    } catch (submitError) {
      toast.error(getErrorMessage(submitError, editing ? '日历更新失败' : '日历创建失败'));
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget?.calendarId) return;
    try {
      await deleteHolidayCalendars([deleteTarget.calendarId]);
      toast.success('节假日日历已删除');
      setDeleteTarget(null);
      await loadCalendars();
    } catch (deleteError) {
      toast.error(getErrorMessage(deleteError, '日历删除失败，请确认日历未被引用且无日期明细'));
    }
  };

  const hasActiveFilters = Boolean(appliedFilters.keyword || appliedFilters.status);

  return (
    <>
      <section className="admin-source-page">
        <TablePageLayout
          actions={
            <div className="grid gap-5">
              <InfrastructurePageHeader
                kicker="WORKDAY CALENDARS"
                title="节假日日历"
                description="维护地区日历、固定休息日和标准工作时段"
              >
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => void loadCalendars()}
                  disabled={loading}
                >
                  <RefreshCw size={16} className={cn(loading && 'animate-spin')} />
                  刷新
                </Button>
                <PermissionGuard permissions={['system:holiday:add']} hidden>
                  <Button size="sm" onClick={openCreate}>
                    <Plus size={16} />
                    新增日历
                  </Button>
                </PermissionGuard>
              </InfrastructurePageHeader>
              <InfrastructureStats items={stats} />
            </div>
          }
          filters={
            <section className="card admin-users-toolbar">
              <form onSubmit={handleSearch} className="admin-holiday-calendar-filter-grid">
                <label className="admin-source-search">
                  <span className="input-label">日历搜索</span>
                  <div className="admin-source-search-field">
                    <Search size={16} />
                    <Input
                      type="search"
                      value={filters.keyword}
                      onChange={(event) =>
                        setFilters((current) => ({ ...current, keyword: event.target.value }))
                      }
                      placeholder="名称、编码或地区"
                    />
                  </div>
                </label>
                <label>
                  <span className="input-label">状态</span>
                  <Select
                    value={filters.status || ALL_VALUE}
                    onValueChange={(value) =>
                      setFilters((current) => ({
                        ...current,
                        status:
                          value === ALL_VALUE ? '' : (value as HolidayCalendarStatus),
                      }))
                    }
                  >
                    <SelectTrigger className="h-[42px]">
                      <SelectValue placeholder="全部状态" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value={ALL_VALUE}>全部状态</SelectItem>
                      <SelectItem value="ENABLED">启用</SelectItem>
                      <SelectItem value="DISABLED">停用</SelectItem>
                    </SelectContent>
                  </Select>
                </label>
                <div className="admin-users-toolbar-actions">
                  <span className="admin-users-filter-count">
                    共 {filteredCalendars.length} 项
                  </span>
                  <Button type="submit" size="sm">查询</Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={handleReset}
                    disabled={!hasActiveFilters && !filters.keyword && !filters.status}
                  >
                    <RotateCcw size={14} />
                    重置
                  </Button>
                </div>
              </form>
            </section>
          }
          table={
            <InnerTableSurface>
              <table className="unity-data-table admin-source-table min-w-[1120px]">
                <thead>
                  <tr>
                    <th>日历</th>
                    <th>地区</th>
                    <th>固定休息日</th>
                    <th>工作时段</th>
                    <th>午休时段</th>
                    <th>默认</th>
                    <th>状态</th>
                    <th>更新时间</th>
                    <th className="text-right">操作</th>
                  </tr>
                </thead>
                <tbody>
                  {loading ? (
                    <InfrastructureTableStateRow colSpan={9} title="正在加载节假日日历..." loading />
                  ) : error ? (
                    <InfrastructureTableStateRow colSpan={9} title="节假日日历加载失败" description={error} />
                  ) : pageRows.length === 0 ? (
                    <InfrastructureTableStateRow colSpan={9} title="暂无符合条件的节假日日历" />
                  ) : (
                    pageRows.map((calendar) => (
                      <tr key={calendar.calendarId}>
                        <td>
                          <div className="min-w-[190px]">
                            <div className="flex items-center gap-2">
                              <strong className="text-sm text-cf-title">{calendar.calendarName}</strong>
                              {calendar.defaultFlag === 1 ? (
                                <Star size={14} className="fill-amber-400 text-amber-500" aria-label="默认日历" />
                              ) : null}
                            </div>
                            <code className="mt-1 block text-xs text-cf-subtle">
                              {calendar.calendarCode}
                            </code>
                          </div>
                        </td>
                        <td>
                          <span className="text-sm text-cf-body">{calendar.region || '-'}</span>
                        </td>
                        <td>
                          <span className="text-sm text-cf-body">
                            {displayRestDays(calendar.weeklyRestDays)}
                          </span>
                        </td>
                        <td>
                          <span className="whitespace-nowrap font-mono text-xs text-cf-subtle">
                            {calendar.workStartTime} - {calendar.workEndTime}
                          </span>
                        </td>
                        <td>
                          <span className="whitespace-nowrap font-mono text-xs text-cf-subtle">
                            {calendar.lunchStartTime || '-'} - {calendar.lunchEndTime || '-'}
                          </span>
                        </td>
                        <td>
                          <InfrastructureBadge tone={calendar.defaultFlag === 1 ? 'warning' : 'neutral'}>
                            {calendar.defaultFlag === 1 ? '默认' : '普通'}
                          </InfrastructureBadge>
                        </td>
                        <td>
                          <InfrastructureBadge tone={calendar.status === 'ENABLED' ? 'success' : 'neutral'}>
                            {calendar.status === 'ENABLED' ? '启用' : '停用'}
                          </InfrastructureBadge>
                        </td>
                        <td>
                          <span className="whitespace-nowrap text-xs text-cf-subtle">
                            {calendar.updateTime || calendar.createTime || '-'}
                          </span>
                        </td>
                        <td className="text-right">
                          <div className="admin-users-row-actions">
                            <button
                              type="button"
                              data-tooltip="查看详情"
                              aria-label="查看详情"
                              onClick={() => setDetailCalendar(calendar)}
                            >
                              <Eye size={15} />
                            </button>
                            <button
                              type="button"
                              data-tooltip="维护日期明细"
                              aria-label="维护日期明细"
                              onClick={() =>
                                navigate(`/holiday/date?calendarId=${calendar.calendarId}`)
                              }
                            >
                              <Settings2 size={15} />
                            </button>
                            <PermissionGuard permissions={['system:holiday:edit']} hidden>
                              <button
                                type="button"
                                data-tooltip="编辑日历"
                                aria-label="编辑日历"
                                onClick={() => void openEdit(calendar)}
                              >
                                <Edit3 size={15} />
                              </button>
                            </PermissionGuard>
                            <PermissionGuard permissions={['system:holiday:remove']} hidden>
                              <button
                                type="button"
                                className="danger"
                                data-tooltip="删除日历"
                                aria-label="删除日历"
                                onClick={() => setDeleteTarget(calendar)}
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
          }
          pagination={
            filteredCalendars.length > 0 ? (
              <Pagination
                page={page}
                pageSize={pageSize}
                total={filteredCalendars.length}
                onPageChange={setPage}
                onPageSizeChange={(nextPageSize) => {
                  setPageSize(nextPageSize);
                  setPage(1);
                }}
              />
            ) : null
          }
        />
      </section>

      <BaseDialog
        open={editorOpen}
        onClose={() => {
          if (!submitting) setEditorOpen(false);
        }}
        title={editing ? '编辑节假日日历' : '新增节假日日历'}
        description="固定休息日构成基础模式，日期明细只需保存例外日期。"
        width="wide"
        bodyClassName="admin-dialog-stack"
        footer={
          <>
            <Button
              type="button"
              variant="outline"
              onClick={() => setEditorOpen(false)}
              disabled={submitting}
            >
              取消
            </Button>
            <Button type="submit" form="holiday-calendar-form" disabled={submitting}>
              {submitting ? '保存中...' : editing ? '保存修改' : '创建日历'}
            </Button>
          </>
        }
      >
        <form id="holiday-calendar-form" onSubmit={handleSubmit} className="grid gap-5">
          <div className="grid gap-4 sm:grid-cols-2">
            <InfrastructureField label="日历编码 *">
              <Input
                data-autofocus
                value={form.calendarCode}
                maxLength={50}
                onChange={(event) =>
                  setForm((current) => ({
                    ...current,
                    calendarCode: event.target.value.toUpperCase(),
                  }))
                }
                placeholder="例如 CN_2026"
              />
            </InfrastructureField>
            <InfrastructureField label="日历名称 *">
              <Input
                value={form.calendarName}
                maxLength={100}
                onChange={(event) =>
                  setForm((current) => ({ ...current, calendarName: event.target.value }))
                }
                placeholder="例如 中国大陆标准日历"
              />
            </InfrastructureField>
            <InfrastructureField label="适用地区">
              <Input
                value={form.region || ''}
                maxLength={50}
                onChange={(event) =>
                  setForm((current) => ({ ...current, region: event.target.value }))
                }
                placeholder="例如 CN、CN-SH"
              />
            </InfrastructureField>
            <InfrastructureField label="状态">
              <Select
                value={form.status}
                onValueChange={(value) =>
                  setForm((current) => ({
                    ...current,
                    status: value as HolidayCalendarStatus,
                  }))
                }
              >
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="ENABLED">启用</SelectItem>
                  <SelectItem value="DISABLED">停用</SelectItem>
                </SelectContent>
              </Select>
            </InfrastructureField>
          </div>

          <section className="card p-4">
            <div className="mb-3 flex items-start justify-between gap-4">
              <div>
                <h4 className="text-sm font-semibold text-cf-title">每周固定休息日</h4>
                <p className="mt-1 text-xs text-cf-subtle">
                  明细表无需重复录入普通周末。
                </p>
              </div>
              <InfrastructureBadge tone="info">
                {displayRestDays(form.weeklyRestDays)}
              </InfrastructureBadge>
            </div>
            <div className="grid grid-cols-4 gap-2 sm:grid-cols-7">
              {WEEK_DAYS.map((day) => {
                const selected = form.weeklyRestDays
                  .split(',')
                  .map(Number)
                  .includes(day.value);
                return (
                  <button
                    key={day.value}
                    type="button"
                    aria-pressed={selected}
                    className={cn(
                      'min-h-11 rounded-md border px-2 py-2 text-sm transition-colors duration-150',
                      selected
                        ? 'border-cyan-300 bg-cyan-50 font-medium text-cyan-700 dark:border-cyan-800 dark:bg-cyan-950/30 dark:text-cyan-200'
                        : 'border-slate-200 bg-[var(--cf-surface-strong)] text-cf-muted hover:border-cyan-200 hover:text-cf-title dark:border-slate-800 dark:bg-slate-950',
                    )}
                    onClick={() => toggleRestDay(day.value)}
                  >
                    {day.label}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="card p-4">
            <div className="mb-4">
              <h4 className="text-sm font-semibold text-cf-title">标准工作时段</h4>
              <p className="mt-1 text-xs text-cf-subtle">
                用于工作日时长、请假半天和 SLA 时间计算。
              </p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
              <InfrastructureField label="上班时间">
                <DatePicker
                  type="time"
                  value={form.workStartTime}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      workStartTime: event.target.value,
                    }))
                  }
                />
              </InfrastructureField>
              <InfrastructureField label="下班时间">
                <DatePicker
                  type="time"
                  value={form.workEndTime}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      workEndTime: event.target.value,
                    }))
                  }
                />
              </InfrastructureField>
              <InfrastructureField label="午休开始">
                <DatePicker
                  type="time"
                  value={form.lunchStartTime || ''}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      lunchStartTime: event.target.value,
                    }))
                  }
                />
              </InfrastructureField>
              <InfrastructureField label="午休结束">
                <DatePicker
                  type="time"
                  value={form.lunchEndTime || ''}
                  onChange={(event) =>
                    setForm((current) => ({
                      ...current,
                      lunchEndTime: event.target.value,
                    }))
                  }
                />
              </InfrastructureField>
            </div>
          </section>

          <div className="flex items-center justify-between gap-4 rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] p-4 dark:border-slate-800 dark:bg-slate-900/70">
            <div>
              <p className="text-sm font-medium text-cf-title">设为租户默认日历</p>
              <p className="mt-1 text-xs text-cf-subtle">
                启用后会自动取消当前租户的其他默认日历。
              </p>
            </div>
            <Switch
              checked={form.defaultFlag === 1}
              onCheckedChange={(checked) =>
                setForm((current) => ({ ...current, defaultFlag: checked ? 1 : 0 }))
              }
            />
          </div>

          <InfrastructureField label="备注">
            <Textarea
              rows={3}
              value={form.remark || ''}
              maxLength={500}
              onChange={(event) =>
                setForm((current) => ({ ...current, remark: event.target.value }))
              }
              placeholder="说明适用组织、地区或维护责任人"
            />
          </InfrastructureField>
        </form>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={() => void handleDelete()}
        title="删除节假日日历"
        message={
          deleteTarget
            ? `确定删除“${deleteTarget.calendarName}”吗？存在日期明细或业务引用时，系统会拒绝删除。`
            : ''
        }
        confirmText="确认删除"
        danger
      />

      <DetailDialog
        open={Boolean(detailCalendar)}
        title="节假日日历详情"
        onClose={() => setDetailCalendar(null)}
        heading={detailCalendar?.calendarName}
        subheading={detailCalendar?.calendarCode}
        headingAside={detailCalendar ? (
          <span className="text-xs text-cf-subtle">{detailCalendar.status === 'ENABLED' ? '启用' : '停用'}</span>
        ) : undefined}
        sections={detailCalendar ? [
          {
            title: '日历信息',
            items: [
              { label: '日历名称', value: detailCalendar.calendarName },
              { label: '日历编码', value: detailCalendar.calendarCode },
              { label: '适用地区', value: detailCalendar.region },
              { label: '默认日历', value: detailCalendar.defaultFlag === 1 ? '是' : '否' },
              { label: '周休息日', value: displayRestDays(detailCalendar.weeklyRestDays) },
              { label: '上班时间', value: detailCalendar.workStartTime },
              { label: '下班时间', value: detailCalendar.workEndTime },
              { label: '午休开始', value: detailCalendar.lunchStartTime },
              { label: '午休结束', value: detailCalendar.lunchEndTime },
              { label: '状态', value: detailCalendar.status === 'ENABLED' ? '启用' : '停用' },
              { label: '备注', value: detailCalendar.remark, wide: true },
            ],
          },
          {
            title: '变更记录',
            items: [
              { label: '创建人', value: detailCalendar.createBy },
              { label: '创建时间', value: detailCalendar.createTime },
              { label: '更新人', value: detailCalendar.updateBy },
              { label: '更新时间', value: detailCalendar.updateTime },
            ],
          },
        ] : []}
      />
    </>
  );
};

export default HolidayCalendarPage;
