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

const WINDOW_TYPES: Array<{ value: DeployWindow['windowType']; label: string }> = [
  { value: 'DAILY', label: '每日' },
  { value: 'WEEKLY', label: '每周' },
  { value: 'MONTHLY', label: '每月' },
  { value: 'CUSTOM', label: '自定义日期' },
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

const getWindowTypeLabel = (type: DeployWindow['windowType']) =>
  WINDOW_TYPES.find((item) => item.value === type)?.label || type;

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

export const DeployWindowManagement: React.FC = () => {
  const [windows, setWindows] = useState<DeployWindow[]>([]);
  const [loading, setLoading] = useState(true);
  const [showDialog, setShowDialog] = useState(false);
  const [editingWindow, setEditingWindow] = useState<DeployWindow | null>(null);
  const [formData, setFormData] = useState<DeployWindow>(emptyFormData);

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

  const handleDelete = async (id?: number) => {
    if (!id) {
      return;
    }
    if (!confirm('确定删除这个发布窗口吗？')) {
      return;
    }

    try {
      await deleteDeployWindow(id);
      toast.success('窗口删除成功');
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
          aside={<Clock3 className="h-[18px] w-[18px] text-cyan-700" />}
        />
        <WorkspaceMetricCard
          label="启用中"
          value={summary.enabledCount}
          hint="当前允许生效的窗口数量"
          aside={<Power className="h-[18px] w-[18px] text-emerald-500" />}
        />
        <WorkspaceMetricCard
          label="每周策略"
          value={summary.weeklyCount}
          hint="按星期控制开放时段的窗口"
          aside={<Calendar className="h-[18px] w-[18px] text-sky-500" />}
        />
        <WorkspaceMetricCard
          label="自定义日期"
          value={summary.customCount}
          hint="用于活动日或特殊发版场景"
          aside={<Sparkles className="h-[18px] w-[18px] text-amber-500" />}
        />
      </div>

      <WorkspaceSectionCard
        title="发布窗口列表"
        description="统一管理允许发布的时间窗口，覆盖每日、每周、每月和自定义日期四种规则。"
        eyebrow="Window Rules"
        headerAside={
          <div className="flex items-center gap-2">
            <Button variant="outline" size="sm" onClick={loadWindows}>
              刷新
            </Button>
            <Button size="sm" onClick={handleOpenCreate}>
              <Plus className="h-4 w-4" />
              新建窗口
            </Button>
          </div>
        }
      >
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
            {windows.map((window) => (
              <div
                key={window.id}
                className={cn(
                  'rounded-2xl border px-5 py-5 shadow-sm ring-1 ring-slate-200/70',
                  window.isEnabled
                    ? 'border-slate-200 bg-white'
                    : 'border-slate-200 bg-slate-50 opacity-90',
                )}
              >
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <div className="text-base font-semibold text-slate-900">{window.windowName}</div>
                      <span
                        className={cn(
                          'rounded-full px-2.5 py-1 text-[11px] font-semibold',
                          window.isEnabled
                            ? 'bg-emerald-50 text-emerald-600 ring-1 ring-emerald-100'
                            : 'bg-slate-100 text-slate-500 ring-1 ring-slate-200',
                        )}
                      >
                        {window.isEnabled ? '启用中' : '已禁用'}
                      </span>
                    </div>
                    <div className="mt-2 text-sm text-slate-500">
                      {getWindowTypeLabel(window.windowType)}
                    </div>
                  </div>
                </div>

                <div className="mt-4 space-y-2 text-sm text-slate-600">
                  <div className="flex items-center gap-2">
                    <Clock3 className="h-4 w-4 text-slate-400" />
                    <span>
                      {window.startTime} - {window.endTime}
                    </span>
                  </div>
                  <div className="flex items-start gap-2">
                    <Calendar className="mt-0.5 h-4 w-4 text-slate-400" />
                    <span>{getScheduleLabel(window)}</span>
                  </div>
                  <div className="min-h-[44px] text-sm leading-6 text-slate-500">
                    {window.description || '未填写窗口说明。'}
                  </div>
                </div>

                <div className="mt-5 flex flex-wrap items-center gap-2">
                  <Button variant="outline" size="sm" onClick={() => handleEdit(window)}>
                    <Edit2 className="h-4 w-4" />
                    编辑
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => handleToggle(window.id, window.isEnabled)}
                    className="text-slate-600"
                  >
                    {window.isEnabled ? <PowerOff className="h-4 w-4" /> : <Power className="h-4 w-4" />}
                    {window.isEnabled ? '禁用' : '启用'}
                  </Button>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-rose-500 hover:text-rose-600"
                    onClick={() => handleDelete(window.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                    删除
                  </Button>
                </div>
              </div>
            ))}
          </div>
        )}
      </WorkspaceSectionCard>

      {showDialog ? (
        <WorkspaceDialogShell
          title={editingWindow ? '编辑发布窗口' : '新建发布窗口'}
          description="配置窗口名称、时段规则和说明信息，让部署治理遵循统一时段。"
          onClose={resetDialog}
          maxWidthClassName="max-w-3xl"
          bodyClassName="max-h-[84vh] overflow-y-auto"
        >
          <div className="space-y-5">
            <div className="grid gap-4 md:grid-cols-2">
              <div className="md:col-span-2">
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  窗口名称 <span className="text-rose-500">*</span>
                </label>
                <Input
                  value={formData.windowName}
                  onChange={(event) => setFormData((prev) => ({ ...prev, windowName: event.target.value }))}
                  placeholder="例如：工作日发布窗口"
                />
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
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
              </div>

              <div className="flex items-end gap-3">
                <label className="flex items-center gap-2 rounded-2xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600">
                  <input
                    type="checkbox"
                    checked={formData.isEnabled}
                    onChange={(event) =>
                      setFormData((prev) => ({
                        ...prev,
                        isEnabled: event.target.checked,
                      }))
                    }
                    className="h-4 w-4 rounded border-slate-300 accent-cyan-600"
                  />
                  保存后立即启用窗口
                </label>
              </div>

              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
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
                <label className="mb-2 block text-sm font-semibold text-slate-700">
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
                <label className="mb-2 block text-sm font-semibold text-slate-700">
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
                          'rounded-2xl px-4 py-2 text-sm font-medium transition',
                          selected
                            ? 'bg-cyan-600 text-white shadow-sm'
                            : 'border border-slate-200 bg-white text-slate-600 shadow-sm hover:bg-slate-50',
                        )}
                      >
                        {day.label}
                      </button>
                    );
                  })}
                </div>
              </div>
            ) : null}

            {formData.windowType === 'MONTHLY' ? (
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  生效日期 <span className="text-rose-500">*</span>
                </label>
                <Input
                  value={formData.monthDays || ''}
                  onChange={(event) => setFormData((prev) => ({ ...prev, monthDays: event.target.value }))}
                  placeholder="例如：1,15,28"
                />
                <div className="mt-2 text-xs text-slate-400">使用逗号分隔每月生效日期，例如 1,15,28。</div>
              </div>
            ) : null}

            {formData.windowType === 'CUSTOM' ? (
              <div>
                <label className="mb-2 block text-sm font-semibold text-slate-700">
                  自定义日期 <span className="text-rose-500">*</span>
                </label>
                <Textarea
                  value={formData.customDates || ''}
                  onChange={(event) => setFormData((prev) => ({ ...prev, customDates: event.target.value }))}
                  placeholder="例如：2026-05-01,2026-06-18"
                  rows={3}
                />
                <div className="mt-2 text-xs text-slate-400">
                  使用逗号分隔完整日期，适合节假日发版窗口或专项活动窗口。
                </div>
              </div>
            ) : null}

            <div>
              <label className="mb-2 block text-sm font-semibold text-slate-700">窗口说明</label>
              <Textarea
                value={formData.description || ''}
                onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
                placeholder="补充窗口适用范围、审批要求或特殊说明。"
                rows={4}
              />
            </div>

            <div className="flex justify-end gap-3">
              <Button variant="outline" onClick={resetDialog}>
                取消
              </Button>
              <Button onClick={handleSave}>{editingWindow ? '保存更新' : '创建窗口'}</Button>
            </div>
          </div>
        </WorkspaceDialogShell>
      ) : null}
    </div>
  );
};
