import React, { useState } from 'react';
import { CalendarClock, Edit3, Save } from 'lucide-react';
import { getAttendanceRule, saveAttendanceRule, AttendanceRule } from '@/services/api/admin';
import { useMount } from '@/hooks/useMount';
import {
  Button,
  DatePicker,
  Input,
  Label,
  Switch,
  Textarea,
} from '@/components/common';
import { toast } from 'sonner';

const WEEKDAYS = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 7, label: '周日' },
];

const createDefaultRule = (): AttendanceRule => ({
  ruleName: '默认考勤组',
  checkInTime: '09:00:00',
  checkOutTime: '18:00:00',
  elasticMinutes: 30,
  workDays: '[1,2,3,4,5]',
  lunchBreakStart: '12:00:00',
  lunchBreakEnd: '13:00:00',
  overtimeEnabled: 0,
  overtimeMinMinutes: 30,
  lateToleranceCount: 3,
  severeLateMinutes: 60,
  absentMinutes: 240,
  photoRequired: 0,
  enabled: 1,
  radius: 200,
});

const InlineState: React.FC<{
  title: string;
  description?: string;
  icon?: React.ReactNode;
  className?: string;
  actions?: React.ReactNode;
}> = ({ title, description, icon, className, actions }) => (
  <div className={['flex flex-col items-center justify-center px-6 py-10 text-center', className].filter(Boolean).join(' ')}>
    <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full border border-slate-200 bg-slate-50 text-slate-400 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-500">
      {icon || <CalendarClock className="h-4 w-4" />}
    </div>
    <div className="text-sm font-medium text-slate-900 dark:text-slate-100">{title}</div>
    {description ? <div className="mt-2 text-xs leading-6 text-slate-500 dark:text-slate-400">{description}</div> : null}
    {actions ? <div className="mt-4">{actions}</div> : null}
  </div>
);

const FieldBlock: React.FC<{
  title: string;
  children: React.ReactNode;
}> = ({ title, children }) => (
  <section className="border-b border-slate-100 px-4 py-4 last:border-b-0 dark:border-slate-800">
    <div className="mb-3">
      <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
    </div>
    {children}
  </section>
);

const ToggleRow: React.FC<{
  title: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  disabled: boolean;
}> = ({ title, checked, onCheckedChange, disabled }) => (
  <div className="flex items-center justify-between rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 dark:border-slate-800 dark:bg-slate-900/60">
    <div className="text-sm font-semibold text-slate-900 dark:text-slate-100">{title}</div>
    <Switch checked={checked} onCheckedChange={onCheckedChange} disabled={disabled} />
  </div>
);

const ReadonlyTextBlock: React.FC<{
  value?: string | null;
  placeholder?: string;
  mono?: boolean;
}> = ({ value, placeholder = '未配置', mono = false }) => (
  <div
    className={[
      'min-h-[112px] whitespace-pre-wrap break-all rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:border-slate-800 dark:bg-slate-900/60 dark:text-slate-300',
      mono ? 'font-mono' : '',
    ].filter(Boolean).join(' ')}
  >
    {value?.trim() || placeholder}
  </div>
);

const AttendanceRulePage: React.FC = () => {
  const [rule, setRule] = useState<AttendanceRule | null>(null);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [editing, setEditing] = useState(false);
  const [workDays, setWorkDays] = useState<number[]>([1, 2, 3, 4, 5]);

  useMount(() => {
    loadRule();
  });

  const loadRule = () => {
    setLoading(true);
    getAttendanceRule()
      .then((res) => {
        const data = res || null;
        if (data) {
          setRule(data as AttendanceRule);
          if (data.workDays) {
            try {
              setWorkDays(JSON.parse(data.workDays));
            } catch {
              setWorkDays([1, 2, 3, 4, 5]);
            }
          }
        }
      })
      .catch(() => {
        toast.error('加载考勤规则失败');
      })
      .finally(() => setLoading(false));
  };

  const handleSave = async () => {
    if (!rule) {
      return;
    }

    if (!rule.ruleName?.trim()) {
      toast.error('请输入规则名称');
      return;
    }
    if (!rule.checkInTime) {
      toast.error('请设置上班时间');
      return;
    }
    if (!rule.checkOutTime) {
      toast.error('请设置下班时间');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        ...rule,
        workDays: JSON.stringify(workDays),
        enabled: rule.enabled ?? 1,
      };
      await saveAttendanceRule(payload);
      toast.success('保存成功');
      setEditing(false);
      loadRule();
    } catch {
      toast.error('保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    setEditing(false);
    loadRule();
  };

  const toggleWorkDay = (day: number) => {
    setWorkDays((prev) =>
      prev.includes(day) ? prev.filter((value) => value !== day) : [...prev, day].sort(),
    );
  };

  const handleCreateRule = () => {
    setRule(createDefaultRule());
    setWorkDays([1, 2, 3, 4, 5]);
    setEditing(true);
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
            <CalendarClock className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
            Attendance Rules
          </div>
          <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            考勤规则
          </h1>
        </div>
        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
          <InlineState title="正在加载考勤规则..." className="py-16" />
        </div>
      </div>
    );
  }

  if (!rule && !editing) {
    return (
      <div className="space-y-4">
        <div className="min-w-0">
          <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
            <CalendarClock className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
            Attendance Rules
          </div>
          <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
            考勤规则
          </h1>
        </div>

        <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
          <InlineState
            title="暂无考勤规则"
            className="py-16"
            actions={<Button onClick={handleCreateRule}>创建考勤规则</Button>}
          />
        </div>
      </div>
    );
  }

  const selectedWorkDays = WEEKDAYS.filter((day) => workDays.includes(day.value));
  const enabledLabel = rule?.enabled === 1 ? '已启用' : '未启用';

  return (
    <div className="space-y-4">
      <div className="min-w-0">
        <div className="inline-flex items-center gap-2 text-[11px] font-medium uppercase tracking-[0.16em] text-slate-400 dark:text-slate-500">
          <CalendarClock className="h-3.5 w-3.5 text-cyan-600 dark:text-cyan-300" />
          Attendance Rules
        </div>
        <h1 className="mt-1.5 text-[26px] font-semibold tracking-tight text-slate-900 dark:text-slate-100">
          考勤规则
        </h1>
      </div>

      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3 shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          规则 {rule?.ruleName || '未命名'}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          状态 {enabledLabel}
        </span>
        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          工作日 {selectedWorkDays.length} 天
        </span>

        <div className="ml-auto flex flex-wrap gap-2">
          {editing ? (
            <>
              <Button variant="outline" size="sm" onClick={handleCancel} disabled={saving}>
                取消
              </Button>
              <Button size="sm" onClick={handleSave} disabled={saving}>
                <Save size={14} className="mr-1.5" />
                {saving ? '保存中...' : '保存'}
              </Button>
            </>
          ) : (
            <Button size="sm" onClick={() => setEditing(true)}>
              <Edit3 size={14} className="mr-1.5" />
              编辑
            </Button>
          )}
        </div>
      </div>

      <div className="overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-950/88">
        <FieldBlock title="基本信息">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">规则名称</Label>
              <Input
                value={rule?.ruleName || ''}
                onChange={(event) => setRule((prev) => (prev ? { ...prev, ruleName: event.target.value } : null))}
                disabled={!editing}
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">弹性时间（分钟）</Label>
              <Input
                type="number"
                value={rule?.elasticMinutes || 0}
                onChange={(event) =>
                  setRule((prev) => (prev ? { ...prev, elasticMinutes: parseInt(event.target.value, 10) || 0 } : null))
                }
                disabled={!editing}
                className="h-11"
              />
            </div>

            <div className="space-y-2 lg:col-span-2">
              <ToggleRow
                title="启用此规则"
                checked={rule?.enabled === 1}
                onCheckedChange={(checked) => setRule((prev) => (prev ? { ...prev, enabled: checked ? 1 : 0 } : null))}
                disabled={!editing}
              />
            </div>
          </div>
        </FieldBlock>

        <FieldBlock title="上下班时间">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-2">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">上班时间</Label>
              <DatePicker
                type="time"
                value={rule?.checkInTime || ''}
                onChange={(event) => setRule((prev) => (prev ? { ...prev, checkInTime: event.target.value } : null))}
                disabled={!editing}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">下班时间</Label>
              <DatePicker
                type="time"
                value={rule?.checkOutTime || ''}
                onChange={(event) => setRule((prev) => (prev ? { ...prev, checkOutTime: event.target.value } : null))}
                disabled={!editing}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">午休开始</Label>
              <DatePicker
                type="time"
                value={rule?.lunchBreakStart || ''}
                onChange={(event) => setRule((prev) => (prev ? { ...prev, lunchBreakStart: event.target.value } : null))}
                disabled={!editing}
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">午休结束</Label>
              <DatePicker
                type="time"
                value={rule?.lunchBreakEnd || ''}
                onChange={(event) => setRule((prev) => (prev ? { ...prev, lunchBreakEnd: event.target.value } : null))}
                disabled={!editing}
              />
            </div>
          </div>
        </FieldBlock>

        <FieldBlock title="工作日">
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => (
              <Button
                key={day.value}
                type="button"
                onClick={() => editing && toggleWorkDay(day.value)}
                disabled={!editing}
                variant={workDays.includes(day.value) ? 'default' : 'outline'}
                size="sm"
                className="rounded-lg"
              >
                {day.label}
              </Button>
            ))}
          </div>
        </FieldBlock>

        <FieldBlock title="加班与迟到口径">
          <div className="grid grid-cols-1 gap-4 lg:grid-cols-3">
            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">每月迟到容忍次数</Label>
              <Input
                type="number"
                value={rule?.lateToleranceCount || 0}
                onChange={(event) =>
                  setRule((prev) => (prev ? { ...prev, lateToleranceCount: parseInt(event.target.value, 10) || 0 } : null))
                }
                disabled={!editing}
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">严重迟到阈值（分钟）</Label>
              <Input
                type="number"
                value={rule?.severeLateMinutes || 60}
                onChange={(event) =>
                  setRule((prev) => (prev ? { ...prev, severeLateMinutes: parseInt(event.target.value, 10) || 60 } : null))
                }
                disabled={!editing}
                className="h-11"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">旷工阈值（分钟）</Label>
              <Input
                type="number"
                value={rule?.absentMinutes || 240}
                onChange={(event) =>
                  setRule((prev) => (prev ? { ...prev, absentMinutes: parseInt(event.target.value, 10) || 240 } : null))
                }
                disabled={!editing}
                className="h-11"
              />
            </div>

            <div className="space-y-2 lg:col-span-3">
              <ToggleRow
                title="允许加班"
                checked={rule?.overtimeEnabled === 1}
                onCheckedChange={(checked) => setRule((prev) => (prev ? { ...prev, overtimeEnabled: checked ? 1 : 0 } : null))}
                disabled={!editing}
              />
            </div>

            {rule?.overtimeEnabled === 1 ? (
              <div className="space-y-2 lg:col-span-3">
                <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">加班最低时长（分钟）</Label>
                <Input
                  type="number"
                  value={rule?.overtimeMinMinutes || 30}
                  onChange={(event) =>
                    setRule((prev) => (prev ? { ...prev, overtimeMinMinutes: parseInt(event.target.value, 10) || 30 } : null))
                  }
                  disabled={!editing}
                  className="h-11 lg:max-w-sm"
                />
              </div>
            ) : null}
          </div>
        </FieldBlock>

        <FieldBlock title="打卡设置">
          <div className="space-y-4">
            <ToggleRow
              title="需要拍照打卡"
              checked={rule?.photoRequired === 1}
              onCheckedChange={(checked) => setRule((prev) => (prev ? { ...prev, photoRequired: checked ? 1 : 0 } : null))}
              disabled={!editing}
            />

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">打卡范围半径（米）</Label>
              <Input
                type="number"
                value={rule?.radius || 200}
                onChange={(event) =>
                  setRule((prev) => (prev ? { ...prev, radius: parseInt(event.target.value, 10) || 200 } : null))
                }
                disabled={!editing}
                className="h-11 lg:max-w-sm"
              />
            </div>

            <div className="space-y-2">
              <Label className="text-sm font-semibold text-slate-700 dark:text-slate-300">Wi-Fi 配置（JSON）</Label>
              {editing ? (
                <Textarea
                  value={rule?.wifiConfigs || ''}
                  onChange={(event) => setRule((prev) => (prev ? { ...prev, wifiConfigs: event.target.value } : null))}
                  disabled={!editing}
                  placeholder="[]"
                  className="min-h-[120px] font-mono text-sm"
                />
              ) : (
                <ReadonlyTextBlock value={rule?.wifiConfigs} mono />
              )}
            </div>
          </div>
        </FieldBlock>

        <FieldBlock title="备注">
          {editing ? (
            <Textarea
              value={rule?.remark || ''}
              onChange={(event) => setRule((prev) => (prev ? { ...prev, remark: event.target.value } : null))}
              disabled={!editing}
              className="min-h-[120px]"
            />
          ) : (
            <ReadonlyTextBlock value={rule?.remark} placeholder="未填写" />
          )}
        </FieldBlock>
      </div>
    </div>
  );
};

export default AttendanceRulePage;
