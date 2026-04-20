import React, { useEffect, useMemo, useState } from 'react';
import {
  Calendar,
  Clock3,
  Edit2,
  Plus,
  Power,
  PowerOff,
  Sparkles,
  Trash2,
} from 'lucide-react';
import { toast } from 'sonner';
import { ConfirmDialog } from '@/components/common';
import { Button, Input, Textarea } from '@/components/ui';
import { DatePicker } from '@/components/ui/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { WorkspaceInlineState } from '@/components/workspace/WorkspacePrimitives';
import {
  WorkspaceDialogShell,
  WorkspaceMetricCard,
  WorkspaceSectionCard,
} from '@/components/workspace/WorkspacePanels';
import { cn } from '@/utils/cn';
import {
  DeployWindow,
  deleteDeployWindow,
  listDeployWindows,
  saveDeployWindow,
  toggleDeployWindow,
  updateDeployWindow,
} from '@/services/api/deployEnhancement';

const WINDOW_TYPES: Array<{ value: DeployWindow['windowType']; label: string; summary: string }> = [
  { value: 'DAILY', label: '每日', summary: '每天固定时段开放' },
  { value: 'WEEKLY', label: '每周', summary: '按工作日或特定星期治理' },
  { value: 'MONTHLY', label: '每月', summary: '按月度窗口控制发版节奏' },
  { value: 'CUSTOM', label: '自定义日期', summary: '用于节假日或专项发版窗口' },
];

const WEEK_DAYS = [
  { value: '1', label: '周一' },
  { value: '2', label: '周二' },
  { value: '3', label: '周三' },
  { value: '4', label: '周四' },
  { value: '5', label: '周五' },
  { value: '6', label: '周六' },
  { value: '7', label: '周日' },
];

const emptyFormData: DeployWindow = {
  windowName: '',
  windowType: 'DAILY',
  startTime: '09:00',
  endTime: '18:00',
  weekDays: '',
  monthDays: '',
  customDates: '',
  isEnabled: true,
  description: '',
};

const fieldLabelClassName = 'mb-2 block text-sm font-semibold text-slate-700 dark:text-slate-200';
const fieldHintClassName = 'mt-2 text-xs leading-5 text-slate-400 dark:text-slate-500';
const softSurfaceClassName =
  'rounded-3xl border border-slate-200 bg-slate-50/90 p-5 shadow-sm shadow-slate-200/50 dark:border-slate-800 dark:bg-slate-900/70 dark:shadow-none';

const getWindowTypeMeta = (type: DeployWindow['windowType']) =>
  WINDOW_TYPES.find((item) => item.value === type) || WINDOW_TYPES[0];

const getWeeklyLabel = (weekDays?: string) =>
  (weekDays || '')
    .split(',')
    .filter(Boolean)
    .map((day) => WEEK_DAYS.find((item) => item.value === day)?.label || day)
    .join('、');

const getScheduleLabel = (window: DeployWindow) => {
  switch (window.windowType) {
    case 'WEEKLY':
      return getWeeklyLabel(window.weekDays) || '未配置星期';
    case 'MONTHLY':
      return window.monthDays || '未配置日期';
    case 'CUSTOM':
      return window.customDates || '未配置日期';
    case 'DAILY':
    default:
      return '每天生效';
  }
};

const getWindowTypeBadgeClassName = (type: DeployWindow['windowType']) => {
  switch (type) {
    case 'WEEKLY':
      return 'border border-sky-200 bg-sky-50 text-sky-700 dark:border-sky-900/70 dark:bg-sky-950/40 dark:text-sky-200';
    case 'MONTHLY':
      return 'border border-violet-200 bg-violet-50 text-violet-700 dark:border-violet-900/70 dark:bg-violet-950/40 dark:text-violet-200';
    case 'CUSTOM':
      return 'border border-amber-200 bg-amber-50 text-amber-700 dark:border-amber-900/70 dark:bg-amber-950/40 dark:text-amber-200';
    case 'DAILY':
    default:
      return 'border border-cyan-200 bg-cyan-50 text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200';
  }
};

export const DeployWindowManagement: React.FC = () => {
  const [windows, setWindows] = useState<DeployWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingWindow, setEditingWindow] = useState<DeployWindow | null>(null);
  const [formData, setFormData] = useState<DeployWindow>(emptyFormData);
  const [deleteTarget, setDeleteTarget] = useState<DeployWindow | null>(null);

  const resetDialog = () => {
    setEditingWindow(null);
    setFormData(emptyFormData);
    setShowDialog(false);
  };

  const loadWindows = async () => {
    try {
      setLoading(true);
      const data = await listDeployWindows();
      setWindows(Array.isArray(data) ? data : []);
    } catch (error) {
      toast.error('加载发布窗口失败');
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadWindows();
  }, []);

  const summary = useMemo(() => {
    const enabledCount = windows.filter((item) => item.isEnabled).length;
    const weeklyCount = windows.filter((item) => item.windowType === 'WEEKLY').length;
    const customCount = windows.filter((item) => item.windowType === 'CUSTOM').length;

    return {
      total: windows.length,
      enabledCount,
      weeklyCount,
      customCount,
    };
  }, [windows]);

  const dialogPreview = useMemo(() => {
    const typeMeta = getWindowTypeMeta(formData.windowType);

    return {
      typeLabel: typeMeta.label,
      typeSummary: typeMeta.summary,
      scheduleLabel: getScheduleLabel(formData),
      periodLabel: `${formData.startTime || '--:--'} - ${formData.endTime || '--:--'}`,
      description: formData.description?.trim() || '建议补充适用范围、审批要求和特殊说明，便于窗口治理保持一致。',
    };
  }, [formData]);

  const handleOpenCreate = () => {
    setEditingWindow(null);
    setFormData(emptyFormData);
    setShowDialog(true);
  };

  const handleEdit = (window: DeployWindow) => {
    setEditingWindow(window);
    setFormData({
      ...emptyFormData,
      ...window,
    });
    setShowDialog(true);
  };

  const handleSave = async () => {
    if (!formData.windowName.trim() || !formData.startTime || !formData.endTime) {
      toast.error('请填写窗口名称和起止时间');
      return;
    }

    // 不同窗口类型对应不同规则字段，保存前统一清理无关配置，避免脏数据混入。
    const payload: DeployWindow = {
      ...formData,
      windowName: formData.windowName.trim(),
      description: formData.description?.trim(),
      weekDays: formData.windowType === 'WEEKLY' ? formData.weekDays : '',
      monthDays: formData.windowType === 'MONTHLY' ? formData.monthDays?.trim() : '',
      customDates: formData.windowType === 'CUSTOM' ? formData.customDates?.trim() : '',
    };

    if (payload.windowType === 'WEEKLY' && !payload.weekDays) {
      toast.error('请选择每周生效的星期');
      return;
    }

    if (payload.windowType === 'MONTHLY' && !payload.monthDays) {
      toast.error('请填写每月生效日期');
      return;
    }

    if (payload.windowType === 'CUSTOM' && !payload.customDates) {
      toast.error('请填写自定义日期');
      return;
    }

    try {
      if (editingWindow?.id) {
        await updateDeployWindow({ ...payload, id: editingWindow.id });
        toast.success('窗口更新成功');
      } else {
        await saveDeployWindow(payload);
        toast.success('窗口创建成功');
      }

      resetDialog();
      await loadWindows();
    } catch (error) {
      toast.error('保存窗口失败');
      console.error(error);
    }
  };

  const handleDelete = async (window: DeployWindow | null) => {
    if (!window?.id) {
      return;
    }

    try {
      await deleteDeployWindow(window.id);
      toast.success('窗口删除成功');
      setDeleteTarget(null);
      await loadWindows();
    } catch (error) {
      toast.error('删除窗口失败');
      console.error(error);
    }
  };

  const handleToggle = async (id?: number, enabled?: boolean) => {
    if (!id) {
      return;
    }

    try {
      await toggleDeployWindow(id, !enabled);
      toast.success(enabled ? '窗口已禁用' : '窗口已启用');
      await loadWindows();
    } catch (error) {
      toast.error('切换窗口状态失败');
      console.error(error);
    }
  };

  return (
    <div className="space-y-5">
      <div className="grid gap-4 xl:grid-cols-4">
        <WorkspaceMetricCard
          label="窗口总数"
          value={summary.total}
          hint="当前系统中定义的全部发布窗口"
          aside={<Clock3 className="h-[18px] w-[18px] text-cyan-700 dark:text-cyan-300" />}
        />
        <WorkspaceMetricCard
          label="启用中"
          value={summary.enabledCount}
          hint="当前允许生效的窗口数量"
          aside={<Power className="h-[18px] w-[18px] text-emerald-500 dark:text-emerald-300" />}
        />
        <WorkspaceMetricCard
          label="每周策略"
          value={summary.weeklyCount}
          hint="按星期控制开放时段的窗口"
          aside={<Calendar className="h-[18px] w-[18px] text-sky-500 dark:text-sky-300" />}
        />
        <WorkspaceMetricCard
          label="自定义日期"
          value={summary.customCount}
          hint="用于活动日或特殊发版场景"
          aside={<Sparkles className="h-[18px] w-[18px] text-amber-500 dark:text-amber-300" />}
        />
      </div>

      <WorkspaceSectionCard
        title="发布窗口列表"
        description="统一管理允许发布的时间窗口，覆盖每日、每周、每月和自定义日期四种规则。"
        eyebrow="Window Rules"
        headerAside={(
          <div className="flex flex-wrap items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadWindows}>
              刷新
            </Button>
            <Button size="sm" onClick={handleOpenCreate}>
              <Plus className="h-4 w-4" />
              新建窗口
            </Button>
          </div>
        )}
        bodyClassName="space-y-5"
      >
        <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_320px]">
          <div className={softSurfaceClassName}>
            <div className="flex flex-wrap items-start justify-between gap-3">
              <div>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">治理原则</div>
                <div className="mt-1 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  窗口配置要与审批、回滚策略协同工作，避免流程页、弹窗页和治理页出现各自维护一套规则的情况。
                </div>
              </div>
              <span className="inline-flex items-center gap-2 rounded-full border border-cyan-200 bg-cyan-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-[0.14em] text-cyan-700 dark:border-cyan-900/70 dark:bg-cyan-950/40 dark:text-cyan-200">
                <Sparkles className="h-3.5 w-3.5" />
                Governed Window
              </span>
            </div>
          </div>

          <div className={cn(softSurfaceClassName, 'space-y-3')}>
            <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">收口重点</div>
            {[
              '窗口状态、类型徽标与动作按钮全部统一到同一套卡片比例。',
              'Light / Dark 同时验收，卡片、表单和确认动作不再各写一套颜色。',
              '删除动作改为统一确认框，避免继续使用浏览器原生 confirm。',
            ].map((item) => (
              <div
                key={item}
                className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300"
              >
                {item}
              </div>
            ))}
          </div>
        </div>

        {loading ? (
          <WorkspaceInlineState
            type="loading"
            title="正在读取发布窗口..."
            description="系统正在同步可用时段配置，请稍候。"
            className="py-16"
          />
        ) : windows.length === 0 ? (
          <WorkspaceInlineState
            icon={<Clock3 className="h-5 w-5" />}
            title="还没有配置发布窗口"
            description="先创建一个窗口，后续部署审批和回滚策略才能按时段治理。"
            className="py-16"
          />
        ) : (
          <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
            {windows.map((window) => {
              const typeMeta = getWindowTypeMeta(window.windowType);

              return (
                <div
                  key={window.id}
                  className={cn(
                    'rounded-[28px] border p-5 shadow-sm shadow-slate-200/60 transition-all duration-200 dark:shadow-none',
                    window.isEnabled
                      ? 'border-slate-200 bg-white/95 dark:border-slate-800 dark:bg-slate-950/88'
                      : 'border-slate-200 bg-slate-50/90 dark:border-slate-800 dark:bg-slate-900/70',
                  )}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="min-w-0 space-y-2">
                      <div className="flex flex-wrap items-center gap-2">
                        <div className="truncate text-base font-semibold text-slate-950 dark:text-slate-100">
                          {window.windowName}
                        </div>
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold',
                            window.isEnabled
                              ? 'border border-emerald-200 bg-emerald-50 text-emerald-700 dark:border-emerald-900/70 dark:bg-emerald-950/40 dark:text-emerald-200'
                              : 'border border-slate-200 bg-slate-100 text-slate-600 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300',
                          )}
                        >
                          {window.isEnabled ? '启用中' : '已禁用'}
                        </span>
                        <span
                          className={cn(
                            'inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold',
                            getWindowTypeBadgeClassName(window.windowType),
                          )}
                        >
                          {typeMeta.label}
                        </span>
                      </div>
                      <div className="text-sm leading-6 text-slate-500 dark:text-slate-400">
                        {window.description || '未填写窗口说明，建议补充适用范围和审批边界。'}
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-3 text-slate-500 dark:border-slate-800 dark:bg-slate-900/80 dark:text-slate-300">
                      <Calendar className="h-5 w-5" />
                    </div>
                  </div>

                  <div className="mt-4 grid gap-3">
                    <div className="grid gap-3 sm:grid-cols-2">
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                        <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                          时段
                        </div>
                        <div className="mt-2 inline-flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          <Clock3 className="h-4 w-4 text-cyan-600 dark:text-cyan-300" />
                          {window.startTime} - {window.endTime}
                        </div>
                      </div>
                      <div className="rounded-2xl border border-slate-200 bg-slate-50/90 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/70">
                        <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                          生效规则
                        </div>
                        <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {getScheduleLabel(window)}
                        </div>
                      </div>
                    </div>

                    <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-950/70 dark:text-slate-300">
                      <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                        规则说明
                      </div>
                      <div className="mt-2">{typeMeta.summary}</div>
                    </div>
                  </div>

                  <div className="mt-5 flex flex-wrap items-center gap-2">
                    <Button variant="outline" size="sm" onClick={() => handleEdit(window)}>
                      <Edit2 className="h-4 w-4" />
                      编辑
                    </Button>
                    <Button
                      variant={window.isEnabled ? 'secondary' : 'soft'}
                      size="sm"
                      onClick={() => handleToggle(window.id, window.isEnabled)}
                    >
                      {window.isEnabled ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                      {window.isEnabled ? '禁用' : '启用'}
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-rose-500 hover:bg-rose-50 hover:text-rose-600 dark:text-rose-300 dark:hover:bg-rose-950/40 dark:hover:text-rose-200"
                      onClick={() => setDeleteTarget(window)}
                    >
                      <Trash2 className="h-4 w-4" />
                      删除
                    </Button>
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </WorkspaceSectionCard>

      {showDialog ? (
        <WorkspaceDialogShell
          title={editingWindow ? '编辑发布窗口' : '新建发布窗口'}
          description="配置窗口名称、时段规则和说明信息，让部署治理遵循统一时段。"
          onClose={resetDialog}
          maxWidthClassName="max-w-5xl"
          bodyClassName="max-h-[84vh] overflow-y-auto"
        >
          <div className="grid gap-5 xl:grid-cols-[minmax(0,1fr)_300px]">
            <div className="space-y-5">
              <div className="grid gap-4 md:grid-cols-2">
                <div className="md:col-span-2">
                  <label className={fieldLabelClassName}>
                    窗口名称 <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    value={formData.windowName}
                    onChange={(event) => setFormData((prev) => ({ ...prev, windowName: event.target.value }))}
                    placeholder="例如：工作日发布窗口"
                  />
                </div>

                <div>
                  <label className={fieldLabelClassName}>
                    窗口类型 <span className="text-rose-500">*</span>
                  </label>
                  <Select
                    value={formData.windowType}
                    onValueChange={(value) =>
                      setFormData((prev) => ({
                        ...prev,
                        windowType: value as DeployWindow['windowType'],
                      }))
                    }
                  >
                    <SelectTrigger>
                      <SelectValue placeholder="请选择窗口类型" />
                    </SelectTrigger>
                    <SelectContent>
                      {WINDOW_TYPES.map((item) => (
                        <SelectItem key={item.value} value={item.value}>
                          {item.label}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <div className={fieldHintClassName}>{getWindowTypeMeta(formData.windowType).summary}</div>
                </div>

                <div>
                  <label className={fieldLabelClassName}>启用策略</label>
                  <label className="flex items-center gap-3 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/70 dark:text-slate-300">
                    <input
                      type="checkbox"
                      checked={formData.isEnabled}
                      onChange={(event) =>
                        setFormData((prev) => ({
                          ...prev,
                          isEnabled: event.target.checked,
                        }))
                      }
                      className="h-4 w-4 rounded border-slate-300 accent-cyan-600 dark:border-slate-700"
                    />
                    保存后立即启用窗口
                  </label>
                </div>

                <div>
                  <label className={fieldLabelClassName}>
                    开始时间 <span className="text-rose-500">*</span>
                  </label>
                  <DatePicker
                    type="time"
                    value={formData.startTime}
                    onChange={(event) => setFormData((prev) => ({ ...prev, startTime: event.target.value }))}
                    variant="glass"
                  />
                </div>

                <div>
                  <label className={fieldLabelClassName}>
                    结束时间 <span className="text-rose-500">*</span>
                  </label>
                  <DatePicker
                    type="time"
                    value={formData.endTime}
                    onChange={(event) => setFormData((prev) => ({ ...prev, endTime: event.target.value }))}
                    variant="glass"
                  />
                </div>
              </div>

              {formData.windowType === 'WEEKLY' ? (
                <div>
                  <label className={fieldLabelClassName}>
                    生效星期 <span className="text-rose-500">*</span>
                  </label>
                  <div className="flex flex-wrap gap-2">
                    {WEEK_DAYS.map((day) => {
                      const values = (formData.weekDays || '').split(',').filter(Boolean);
                      const selected = values.includes(day.value);

                      return (
                        <button
                          key={day.value}
                          type="button"
                          onClick={() =>
                            setFormData((prev) => {
                              const items = (prev.weekDays || '').split(',').filter(Boolean);
                              const next = items.includes(day.value)
                                ? items.filter((item) => item !== day.value)
                                : [...items, day.value];

                              return { ...prev, weekDays: next.join(',') };
                            })
                          }
                          className={cn(
                            'rounded-2xl border px-4 py-2 text-sm font-medium transition-all',
                            selected
                              ? 'border-cyan-500 bg-cyan-600 text-white shadow-sm shadow-cyan-500/20'
                              : 'border-slate-200 bg-white text-slate-600 hover:border-slate-300 hover:bg-slate-50 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-300 dark:hover:border-slate-600 dark:hover:bg-slate-800',
                          )}
                        >
                          {day.label}
                        </button>
                      );
                    })}
                  </div>
                  <div className={fieldHintClassName}>按周治理适合工作日发版、夜间窗口等固定节奏。</div>
                </div>
              ) : null}

              {formData.windowType === 'MONTHLY' ? (
                <div>
                  <label className={fieldLabelClassName}>
                    生效日期 <span className="text-rose-500">*</span>
                  </label>
                  <Input
                    value={formData.monthDays || ''}
                    onChange={(event) => setFormData((prev) => ({ ...prev, monthDays: event.target.value }))}
                    placeholder="例如：1,15,28"
                  />
                  <div className={fieldHintClassName}>使用逗号分隔每月生效日期，例如 1,15,28。</div>
                </div>
              ) : null}

              {formData.windowType === 'CUSTOM' ? (
                <div>
                  <label className={fieldLabelClassName}>
                    自定义日期 <span className="text-rose-500">*</span>
                  </label>
                  <Textarea
                    value={formData.customDates || ''}
                    onChange={(event) => setFormData((prev) => ({ ...prev, customDates: event.target.value }))}
                    placeholder="例如：2026-05-01,2026-06-18"
                    rows={3}
                  />
                  <div className={fieldHintClassName}>
                    使用逗号分隔完整日期，适合节假日发版窗口或专项活动窗口。
                  </div>
                </div>
              ) : null}

              <div>
                <label className={fieldLabelClassName}>窗口说明</label>
                <Textarea
                  value={formData.description || ''}
                  onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
                  placeholder="补充窗口适用范围、审批要求或特殊说明。"
                  rows={4}
                />
              </div>
            </div>

            <div className="space-y-4">
              <div className={softSurfaceClassName}>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">规则预览</div>
                <div className="mt-3 space-y-3">
                  <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
                    <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                      窗口类型
                    </div>
                    <div className="mt-2 flex items-center gap-2">
                      <span
                        className={cn(
                          'inline-flex rounded-full px-2.5 py-1 text-[11px] font-semibold',
                          getWindowTypeBadgeClassName(formData.windowType),
                        )}
                      >
                        {dialogPreview.typeLabel}
                      </span>
                      <span className="text-sm text-slate-500 dark:text-slate-400">{dialogPreview.typeSummary}</span>
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
                    <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                      生效时段
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {dialogPreview.periodLabel}
                    </div>
                  </div>

                  <div className="rounded-2xl border border-slate-200 bg-white/80 px-4 py-3 dark:border-slate-800 dark:bg-slate-950/70">
                    <div className="text-xs font-medium uppercase tracking-[0.14em] text-slate-400 dark:text-slate-500">
                      生效规则
                    </div>
                    <div className="mt-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
                      {dialogPreview.scheduleLabel}
                    </div>
                  </div>
                </div>
              </div>

              <div className={softSurfaceClassName}>
                <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">治理提示</div>
                <div className="mt-3 text-sm leading-6 text-slate-500 dark:text-slate-400">
                  {dialogPreview.description}
                </div>
              </div>
            </div>
          </div>

          <div className="mt-6 flex justify-end gap-3">
            <Button variant="outline" onClick={resetDialog}>
              取消
            </Button>
            <Button onClick={handleSave}>{editingWindow ? '保存更新' : '创建窗口'}</Button>
          </div>
        </WorkspaceDialogShell>
      ) : null}

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="确认删除发布窗口"
        message={
          deleteTarget
            ? `删除后将移除“${deleteTarget.windowName}”的时段规则，相关发布治理页不会再显示该窗口。`
            : '删除后将移除这条窗口规则。'
        }
        confirmText="删除窗口"
        cancelText="保留"
        danger
        onConfirm={() => handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
