import React, { useEffect, useMemo, useState } from 'react';
import { Clock3, Edit2, Plus, Power, PowerOff, Trash2 } from 'lucide-react';
import { toast } from 'sonner';
import { getErrorMessage } from '@/utils/errorMessage';
import { BaseDialog, ConfirmDialog, TableRowActions } from '@/components/common';
import { Button, Input, Textarea } from '@/components/common';
import { DatePicker } from '@/components/common/date-picker';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/common/select';
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

const fieldLabelClassName = 'mb-2 block text-sm font-medium text-slate-700 dark:text-slate-200';

const getWindowTypeLabel = (type: DeployWindow['windowType']) =>
  WINDOW_TYPES.find((item) => item.value === type)?.label || WINDOW_TYPES[0].label;

const getWeeklyLabel = (weekDays?: string) =>
  (weekDays || '')
    .split(',')
    .filter(Boolean)
    .map((day) => WEEK_DAYS.find((item) => item.value === day)?.label || day)
    .join('、');

const getScheduleLabel = (window: DeployWindow) => {
  switch (window.windowType) {
    case 'WEEKLY':
      return getWeeklyLabel(window.weekDays) || '-';
    case 'MONTHLY':
      return window.monthDays?.trim() || '-';
    case 'CUSTOM':
      return window.customDates?.trim() || '-';
    case 'DAILY':
    default:
      return '每天生效';
  }
};

const InlineState: React.FC<{
  title: string;
  description?: string;
  loading?: boolean;
}> = ({ title, description, loading = false }) => (
  <div className="flex flex-col items-center justify-center px-6 py-16 text-center">
    {loading ? <Clock3 className="mb-3 h-5 w-5 animate-pulse text-slate-400 dark:text-slate-500" /> : null}
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? (
      <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">
        {description}
      </div>
    ) : null}
  </div>
);

const DetailRows: React.FC<{
  children: React.ReactNode;
  className?: string;
}> = ({ children, className }) => (
  <div
    className={cn(
      'overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800',
      className,
    )}
  >
    {children}
  </div>
);

const DetailRow: React.FC<{
  label: React.ReactNode;
  value: React.ReactNode;
  alignStart?: boolean;
}> = ({ label, value, alignStart = false }) => (
  <div
    className={cn(
      'flex flex-col gap-1 border-b border-slate-100 px-4 py-3 last:border-b-0 dark:border-slate-800 sm:flex-row sm:gap-4',
      alignStart ? 'sm:items-start' : 'sm:items-center',
    )}
  >
    <div className="w-20 flex-shrink-0 text-xs text-slate-500 dark:text-slate-400">{label}</div>
    <div
      className={cn(
        'min-w-0 flex-1 text-sm text-slate-700 dark:text-slate-200',
        alignStart ? '' : 'sm:text-right',
      )}
    >
      {value}
    </div>
  </div>
);

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
      toast.error(getErrorMessage(error, '加载发布窗口失败'));
      console.error(error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadWindows();
  }, []);

  const summary = useMemo(() => {
    const enabledCount = windows.filter((item) => item.isEnabled).length;

    return {
      total: windows.length,
      enabledCount,
      disabledCount: Math.max(windows.length - enabledCount, 0),
    };
  }, [windows]);

  const dialogRows = useMemo(() => {
    const rows: Array<{ label: string; value: React.ReactNode; alignStart?: boolean }> = [
      { label: '类型', value: getWindowTypeLabel(formData.windowType) },
      { label: '时段', value: `${formData.startTime || '--:--'} - ${formData.endTime || '--:--'}` },
      { label: '规则', value: getScheduleLabel(formData) },
      { label: '状态', value: formData.isEnabled ? '保存后启用' : '保存后禁用' },
    ];

    if (formData.description?.trim()) {
      rows.push({ label: '说明', value: formData.description.trim(), alignStart: true });
    }

    return rows;
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

    const payload: DeployWindow = {
      ...formData,
      windowName: formData.windowName.trim(),
      description: formData.description?.trim(),
      weekDays: formData.windowType === 'WEEKLY' ? formData.weekDays : '',
      monthDays: formData.windowType === 'MONTHLY' ? formData.monthDays?.trim() : '',
      customDates: formData.windowType === 'CUSTOM' ? formData.customDates?.trim() : '',
    };

    if (payload.windowType === 'WEEKLY' && !payload.weekDays) {
      toast.error('请选择生效星期');
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
        toast.success('窗口已更新');
      } else {
        await saveDeployWindow(payload);
        toast.success('窗口已创建');
      }

      resetDialog();
      await loadWindows();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存发布窗口失败'));
      console.error(error);
    }
  };

  const handleDelete = async (window: DeployWindow | null) => {
    if (!window?.id) {
      return;
    }

    try {
      await deleteDeployWindow(window.id);
      toast.success('窗口已删除');
      setDeleteTarget(null);
      await loadWindows();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除发布窗口失败'));
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
      toast.error(getErrorMessage(error, '切换窗口状态失败'));
      console.error(error);
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-slate-500 dark:text-slate-400">
          <span>共 {summary.total} 条</span>
          <span>启用 {summary.enabledCount} 条</span>
          <span>禁用 {summary.disabledCount} 条</span>
        </div>

        <div className="ml-auto flex flex-wrap items-center gap-2">
          <Button variant="outline" size="sm" onClick={() => void loadWindows()}>
            刷新
          </Button>
          <Button variant="contrast" size="sm" onClick={handleOpenCreate}>
            <Plus className="h-4 w-4" />
            新建窗口
          </Button>
        </div>
      </div>

      {loading ? (
        <InlineState title="正在读取发布窗口" loading />
      ) : windows.length === 0 ? (
        <InlineState title="暂无发布窗口" />
      ) : (
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
          <div className="hidden bg-slate-50 px-4 py-3 text-xs font-medium text-slate-500 dark:bg-slate-900/70 dark:text-slate-400 md:grid md:grid-cols-[minmax(0,1.5fr)_92px_132px_150px_92px_12rem] md:items-center">
            <span>窗口</span>
            <span>类型</span>
            <span>时段</span>
            <span>规则</span>
            <span>状态</span>
            <span>操作</span>
          </div>

          {windows.map((window) => (
            <div
              key={window.id}
              className={cn(
                'grid gap-3 border-t border-slate-200 px-4 py-3.5 first:border-t-0 dark:border-slate-800 md:grid-cols-[minmax(0,1.5fr)_92px_132px_150px_92px_12rem] md:items-center',
                !window.isEnabled && 'bg-slate-50/60 dark:bg-slate-900/40',
              )}
            >
              <div className="min-w-0">
                <div className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                  {window.windowName}
                </div>
                <div
                  className="mt-1 truncate text-xs leading-5 text-slate-500 dark:text-slate-400"
                  title={window.description?.trim() || undefined}
                >
                  {window.description?.trim() || '-'}
                </div>
              </div>

              <div className="text-sm text-slate-700 dark:text-slate-200">
                {getWindowTypeLabel(window.windowType)}
              </div>

              <div className="text-sm text-slate-700 dark:text-slate-200">
                {window.startTime} - {window.endTime}
              </div>

              <div className="text-sm text-slate-600 dark:text-slate-300">{getScheduleLabel(window)}</div>

              <div className="text-sm text-slate-600 dark:text-slate-300">{window.isEnabled ? '启用' : '禁用'}</div>

              <div className="md:justify-self-end">
                <TableRowActions
                  align="end"
                  overflowLabel="更多"
                  actions={[
                    {
                      label: '编辑窗口',
                      icon: <Edit2 className="h-3.5 w-3.5" />,
                      onClick: () => handleEdit(window),
                      semantic: 'edit',
                      isPrimary: true,
                    },
                    {
                      label: window.isEnabled ? '禁用窗口' : '启用窗口',
                      icon: window.isEnabled ? <PowerOff className="h-3.5 w-3.5" /> : <Power className="h-3.5 w-3.5" />,
                      onClick: () => handleToggle(window.id, window.isEnabled),
                      semantic: window.isEnabled ? 'disable' : 'enable',
                      danger: window.isEnabled,
                    },
                    {
                      label: '删除窗口',
                      icon: <Trash2 className="h-3.5 w-3.5" />,
                      onClick: () => setDeleteTarget(window),
                      semantic: 'delete',
                      danger: true,
                    },
                  ]}
                />
              </div>
            </div>
          ))}
        </div>
      )}

      <BaseDialog
        open={showDialog}
        title={editingWindow ? '编辑发布窗口' : '新建发布窗口'}
        onClose={resetDialog}
        maxWidthClassName="max-w-2xl"
        footer={
          <div className="flex justify-end gap-3">
            <Button variant="outline" onClick={resetDialog}>
              取消
            </Button>
            <Button onClick={handleSave}>{editingWindow ? '保存' : '创建'}</Button>
          </div>
        }
      >
        <div className="space-y-4 pr-1">
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
            </div>

            <div>
              <label className={fieldLabelClassName}>启用状态</label>
              <label className="flex items-center gap-3 text-sm text-slate-600 dark:text-slate-300">
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
                保存后启用
              </label>
            </div>

            <div>
              <label className={fieldLabelClassName}>
                开始时间 <span className="text-rose-500">*</span>
              </label>
              <DatePicker
                type="time"
                className="w-full"
                value={formData.startTime}
                onChange={(event) => setFormData((prev) => ({ ...prev, startTime: event.target.value }))}
              />
            </div>

            <div>
              <label className={fieldLabelClassName}>
                结束时间 <span className="text-rose-500">*</span>
              </label>
              <DatePicker
                type="time"
                className="w-full"
                value={formData.endTime}
                onChange={(event) => setFormData((prev) => ({ ...prev, endTime: event.target.value }))}
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
                        'rounded-lg border px-3 py-2 text-sm transition-colors',
                        selected
                          ? 'border-slate-300 bg-slate-100 text-slate-900 dark:border-slate-700 dark:bg-slate-800 dark:text-slate-100'
                          : 'border-slate-200 bg-white text-slate-500 hover:border-slate-300 hover:text-slate-900 dark:border-slate-800 dark:bg-slate-950/88 dark:text-slate-400 dark:hover:border-slate-700 dark:hover:text-slate-100',
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
              <label className={fieldLabelClassName}>
                生效日期 <span className="text-rose-500">*</span>
              </label>
              <Input
                value={formData.monthDays || ''}
                onChange={(event) => setFormData((prev) => ({ ...prev, monthDays: event.target.value }))}
                placeholder="例如：1,15,28"
              />
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
            </div>
          ) : null}

          <div>
            <label className={fieldLabelClassName}>窗口说明</label>
            <Textarea
              value={formData.description || ''}
              onChange={(event) => setFormData((prev) => ({ ...prev, description: event.target.value }))}
              placeholder="选填"
              rows={4}
            />
          </div>

          <DetailRows>
            {dialogRows.map((row) => (
              <DetailRow key={row.label} label={row.label} value={row.value} alignStart={row.alignStart} />
            ))}
          </DetailRows>
        </div>
      </BaseDialog>

      <ConfirmDialog
        open={Boolean(deleteTarget)}
        title="确认删除发布窗口"
        message={
          deleteTarget
            ? `删除后将移除“${deleteTarget.windowName}”的窗口规则。`
            : '删除后将移除这条窗口规则。'
        }
        confirmText="删除"
        cancelText="取消"
        danger
        onConfirm={() => handleDelete(deleteTarget)}
        onCancel={() => setDeleteTarget(null)}
      />
    </div>
  );
};
