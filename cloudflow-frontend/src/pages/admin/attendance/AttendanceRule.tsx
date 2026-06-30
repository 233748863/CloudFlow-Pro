import React, { useMemo, useState } from 'react';
import {
  CalendarClock,
  CalendarDays,
  Clock3,
  MapPin,
  Plus,
  RefreshCw,
  Save,
  Trash2,
  Users,
  Wifi,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  AttendanceRuleAssignment,
  AttendanceRuleConfig,
  HrScheduleRule,
  HrShift,
  WorkCalendarDay,
  createHrScheduleRule,
  createHrScheduleRuleAssignment,
  createWorkCalendarDay,
  deleteHrScheduleRule,
  deleteHrScheduleRuleAssignment,
  deleteWorkCalendarDay,
  listHrScheduleRuleAssignments,
  listHrScheduleRules,
  listHrShifts,
  listWorkCalendarDays,
  updateHrScheduleRule,
  updateWorkCalendarDay,
} from '@/services/api/hr';
import { useMount } from '@/hooks/useMount';
import { getErrorMessage } from '@/utils/errorMessage';
import {
  Button,
  DatePicker,
  Input,
  Label,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  Switch,
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
  Textarea,
} from '@/components/common';
import { useDict } from '@/hooks/useDict';
import { InnerTableSurface, TablePageLayout } from '@/components/layout/TablePageLayout';

const WEEKDAYS = [
  { value: 1, label: '周一' },
  { value: 2, label: '周二' },
  { value: 3, label: '周三' },
  { value: 4, label: '周四' },
  { value: 5, label: '周五' },
  { value: 6, label: '周六' },
  { value: 7, label: '周日' },
];

const NEW_RULE_VALUE = '__new_rule__';

const defaultConfig = (shiftId?: number): AttendanceRuleConfig => ({
  shiftId,
  workDays: [1, 2, 3, 4, 5],
  checkMethods: ['GPS', 'WIFI', 'FACE'],
  locationPoints: [{ name: '总部园区', latitude: 39.9042, longitude: 116.4074, radius: 500 }],
  wifiConfigs: [{ ssid: 'CloudFlow-Office' }],
  overtimeEnabled: true,
  overtimeMinMinutes: 30,
  lateToleranceCount: 0,
  severeLateMinutes: 60,
  absentMinutes: 240,
  photoRequired: false,
  radius: 500,
});

const parseConfig = (value?: string): AttendanceRuleConfig => {
  if (!value) {
    return defaultConfig();
  }
  try {
    return { ...defaultConfig(), ...JSON.parse(value) };
  } catch {
    return defaultConfig();
  }
};

const normalizeTime = (value?: string) => (value || '').slice(0, 5);

const formatTodayDate = () => new Date().toISOString().slice(0, 10);

const addDays = (days: number) => {
  const date = new Date();
  date.setDate(date.getDate() + days);
  return date.toISOString().slice(0, 10);
};

const Field = ({ label, children }: { label: string; children: React.ReactNode }) => (
  <div className="admin-attendance-field">
    <Label className="text-xs font-semibold text-slate-600 dark:text-slate-300">{label}</Label>
    {children}
  </div>
);

const Panel = ({ title, icon, children }: { title: string; icon: React.ReactNode; children: React.ReactNode }) => (
  <section className="admin-attendance-surface">
    <div className="admin-attendance-surface-head">
      <div className="flex items-center gap-2">
        <div className="text-slate-500 dark:text-slate-400">{icon}</div>
        <strong>{title}</strong>
      </div>
    </div>
    <div className="admin-attendance-surface-body">{children}</div>
  </section>
);

const toRulePayload = (rule: HrScheduleRule, config: AttendanceRuleConfig) => ({
  ruleName: rule.ruleName,
  ruleType: rule.ruleType,
  ruleConfig: JSON.stringify(config),
  description: rule.description || '',
  status: rule.status ?? 1,
});

const createDraftRule = (shiftId?: number): HrScheduleRule => ({
  id: 0,
  ruleName: '新考勤规则',
  ruleType: 'FIXED',
  ruleConfig: JSON.stringify(defaultConfig(shiftId)),
  description: '',
  status: 1,
});

const AttendanceRulePage: React.FC = () => {
  const ruleTypeDict = useDict('hr_schedule_rule_type');
  const targetTypeDict = useDict('hr_target_type');
  const dayTypeDict = useDict('hr_work_calendar_day_type');
  const [rules, setRules] = useState<HrScheduleRule[]>([]);
  const [shifts, setShifts] = useState<HrShift[]>([]);
  const [selectedId, setSelectedId] = useState<number | null>(null);
  const [draft, setDraft] = useState<HrScheduleRule | null>(null);
  const [config, setConfig] = useState<AttendanceRuleConfig>(defaultConfig());
  const [assignments, setAssignments] = useState<AttendanceRuleAssignment[]>([]);
  const [calendarDays, setCalendarDays] = useState<WorkCalendarDay[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [assignmentDraft, setAssignmentDraft] = useState({
    targetType: 'DEPT' as 'DEPT' | 'POST' | 'EMPLOYEE',
    targetId: '',
    effectiveStart: formatTodayDate(),
  });
  const [calendarDraft, setCalendarDraft] = useState({
    calendarDate: formatTodayDate(),
    dayType: 'WORKDAY' as 'WORKDAY' | 'REST' | 'HOLIDAY',
    dayName: '',
  });

  useMount(() => {
    void loadAll();
  });

  const selectedShift = useMemo(
    () => shifts.find((item) => item.id === Number(config.shiftId)),
    [config.shiftId, shifts],
  );

  const activeRuleId = draft?.id || selectedId;

  const loadAll = async () => {
    setLoading(true);
    try {
      const [ruleList, shiftList, days] = await Promise.all([
        listHrScheduleRules(),
        listHrShifts(),
        listWorkCalendarDays({ startDate: addDays(-7), endDate: addDays(14) }),
      ]);
      setRules(ruleList);
      setShifts(shiftList);
      setCalendarDays(days);
      const firstRule = ruleList[0] || null;
      if (firstRule) {
        selectRule(firstRule, false);
      } else {
        setDraft(createDraftRule(shiftList[0]?.id));
        setConfig(defaultConfig(shiftList[0]?.id));
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '加载考勤规则失败'));
    } finally {
      setLoading(false);
    }
  };

  const selectRule = (rule: HrScheduleRule, shouldLoadAssignments = true) => {
    setSelectedId(rule.id);
    setDraft({ ...rule });
    setConfig(parseConfig(rule.ruleConfig));
    if (shouldLoadAssignments) {
      void loadAssignments(rule.id);
    } else {
      listHrScheduleRuleAssignments(rule.id).then(setAssignments).catch(() => setAssignments([]));
    }
  };

  const startNewRule = () => {
    setSelectedId(null);
    setDraft(createDraftRule(shifts[0]?.id));
    setConfig(defaultConfig(shifts[0]?.id));
    setAssignments([]);
  };

  const handleRuleSelect = (value: string) => {
    if (value === NEW_RULE_VALUE) {
      startNewRule();
      return;
    }

    const rule = rules.find((item) => String(item.id) === value);
    if (rule) {
      selectRule(rule);
    }
  };

  const loadAssignments = async (ruleId: number) => {
    try {
      setAssignments(await listHrScheduleRuleAssignments(ruleId));
    } catch {
      setAssignments([]);
    }
  };

  const updateConfig = <K extends keyof AttendanceRuleConfig>(key: K, value: AttendanceRuleConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const toggleArrayValue = (key: 'workDays' | 'checkMethods', value: number | string) => {
    setConfig((prev) => {
      const current = Array.isArray(prev[key]) ? [...(prev[key] as Array<number | string>)] : [];
      const next = current.includes(value) ? current.filter((item) => item !== value) : [...current, value];
      return { ...prev, [key]: next.sort() };
    });
  };

  const handleSave = async () => {
    if (!draft?.ruleName.trim()) {
      toast.error('请输入规则名称');
      return;
    }
    setSaving(true);
    try {
      const payload = toRulePayload(draft, config);
      if (draft.id) {
        await updateHrScheduleRule(draft.id, payload);
      } else {
        const id = await createHrScheduleRule(payload);
        setSelectedId(id);
      }
      toast.success('规则已保存');
      await loadAll();
    } catch (error) {
      toast.error(getErrorMessage(error, '保存规则失败'));
    } finally {
      setSaving(false);
    }
  };

  const handleDeleteRule = async () => {
    if (!draft?.id) {
      return;
    }
    try {
      await deleteHrScheduleRule(draft.id);
      toast.success('规则已删除');
      setSelectedId(null);
      setDraft(null);
      await loadAll();
    } catch (error) {
      toast.error(getErrorMessage(error, '删除规则失败'));
    }
  };

  const handleAddAssignment = async () => {
    if (!activeRuleId || !assignmentDraft.targetId) {
      toast.error('请输入目标ID');
      return;
    }
    try {
      await createHrScheduleRuleAssignment(activeRuleId, {
        targetType: assignmentDraft.targetType,
        targetId: Number(assignmentDraft.targetId),
        effectiveStart: assignmentDraft.effectiveStart,
        status: 1,
      });
      toast.success('适用范围已添加');
      setAssignmentDraft((prev) => ({ ...prev, targetId: '' }));
      await loadAssignments(activeRuleId);
    } catch (error) {
      toast.error(getErrorMessage(error, '添加适用范围失败'));
    }
  };

  const handleDeleteAssignment = async (id: number) => {
    try {
      await deleteHrScheduleRuleAssignment(id);
      toast.success('适用范围已删除');
      if (activeRuleId) {
        await loadAssignments(activeRuleId);
      }
    } catch (error) {
      toast.error(getErrorMessage(error, '删除适用范围失败'));
    }
  };

  const handleSaveCalendar = async () => {
    if (!calendarDraft.dayName.trim()) {
      toast.error('请输入日期名称');
      return;
    }
    try {
      const existing = calendarDays.find((item) => item.calendarDate === calendarDraft.calendarDate);
      const payload = { ...calendarDraft, source: 'MANUAL', status: 1 };
      if (existing) {
        await updateWorkCalendarDay(existing.id, payload);
      } else {
        await createWorkCalendarDay(payload);
      }
      toast.success('企业日历已保存');
      setCalendarDays(await listWorkCalendarDays({ startDate: addDays(-7), endDate: addDays(14) }));
    } catch (error) {
      toast.error(getErrorMessage(error, '保存企业日历失败'));
    }
  };

  const handleDeleteCalendar = async (id: number) => {
    try {
      await deleteWorkCalendarDay(id);
      toast.success('企业日历已删除');
      setCalendarDays(await listWorkCalendarDays({ startDate: addDays(-7), endDate: addDays(14) }));
    } catch (error) {
      toast.error(getErrorMessage(error, '删除企业日历失败'));
    }
  };

  const locationPoint = config.locationPoints?.[0] || {};
  const wifiText = (config.wifiConfigs || []).map((item) => item.ssid).filter(Boolean).join('\n');
  const metrics = [
    { label: '规则总数', value: String(rules.length), meta: draft?.ruleName || '当前规则', icon: <CalendarClock size={18} />, tone: 'blue' },
    { label: '班次数量', value: String(shifts.length), meta: selectedShift?.shiftName || '未绑定班次', icon: <Clock3 size={18} />, tone: 'green' },
    { label: '适用范围', value: String(assignments.length), meta: activeRuleId ? '当前规则' : '未保存规则', icon: <Users size={18} />, tone: 'amber' },
    { label: '企业日历', value: String(calendarDays.length), meta: '近21天维护', icon: <CalendarDays size={18} />, tone: 'violet' },
  ];

  const pageActions = (
    <div className="grid gap-5">
      <header className="admin-source-header">
        <div>
          <p className="admin-source-kicker">ATTENDANCE RULES</p>
          <h2>考勤规则</h2>
          <span>维护班次、打卡方式、适用范围和企业日历</span>
        </div>
        <div className="admin-source-controls">
          <Button variant="outline" size="sm" onClick={() => void loadAll()} disabled={loading}>
            <RefreshCw size={16} className={loading ? 'animate-spin' : ''} />
            刷新
          </Button>
          <Button
            size="sm"
            onClick={startNewRule}
          >
            <Plus size={16} />
            新增规则
          </Button>
        </div>
      </header>

      <section className="admin-source-stat-grid">
        {metrics.map((metric) => (
          <article key={metric.label} className={`card admin-source-stat admin-source-tone-${metric.tone}`}>
            <div className="admin-source-stat-icon">{metric.icon}</div>
            <div>
              <p>{metric.label}</p>
              <strong>{metric.value}</strong>
              <span>{metric.meta}</span>
            </div>
          </article>
        ))}
      </section>
    </div>
  );

  const pageFilters = (
    <section className="card admin-users-toolbar">
      <div className="admin-toolbar-filter-grid [--admin-toolbar-filter-count:2]">
        <label className="grid gap-1.5">
          <span className="text-xs font-medium text-slate-500 dark:text-slate-400">当前规则</span>
          <Select value={selectedId ? String(selectedId) : NEW_RULE_VALUE} onValueChange={handleRuleSelect}>
            <SelectTrigger className="cf-control">
              <SelectValue placeholder="选择考勤规则" />
            </SelectTrigger>
            <SelectContent>
              {rules.map((rule) => {
                const itemConfig = parseConfig(rule.ruleConfig);
                const shift = shifts.find((item) => item.id === Number(itemConfig.shiftId));
                return (
                  <SelectItem key={rule.id} value={String(rule.id)}>
                    {rule.ruleName} / {shift?.shiftName || '未绑定班次'}
                  </SelectItem>
                );
              })}
              <SelectItem value={NEW_RULE_VALUE}>新考勤规则</SelectItem>
            </SelectContent>
          </Select>
        </label>
        <div className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          班次<br />
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">
            {selectedShift ? `${normalizeTime(selectedShift.startTime)}-${normalizeTime(selectedShift.endTime)}` : '未选择'}
          </span>
        </div>
        <div className="rounded-md border border-slate-200 bg-[var(--cf-surface-muted)] px-3 py-2 text-xs text-slate-600 dark:border-slate-800 dark:bg-slate-900 dark:text-slate-300">
          适用范围<br />
          <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{assignments.length} 项</span>
        </div>
        <div className="flex flex-wrap justify-end gap-2">
          {draft?.id ? (
            <Button variant="outline" size="sm" onClick={handleDeleteRule}>
              <Trash2 size={14} className="mr-1.5" />
              删除
            </Button>
          ) : null}
          <Button size="sm" onClick={handleSave} disabled={saving || !draft}>
            <Save size={14} className="mr-1.5" />
            {saving ? '保存中...' : '保存规则'}
          </Button>
        </div>
      </div>
    </section>
  );

  const pageContent = (
    <InnerTableSurface
      className="flex min-h-0 flex-1 flex-col"
      wrapperClassName="flex min-h-0 flex-1 flex-col overflow-hidden"
    >
      <div className="admin-attendance-rule-workspace">
        <main className="admin-attendance-workbench">
          <Tabs defaultValue="rule" className="admin-source-content admin-attendance-tabs">
            <TabsList>
              <TabsTrigger value="rule">规则配置</TabsTrigger>
              <TabsTrigger value="assignment">适用范围</TabsTrigger>
              <TabsTrigger value="calendar">企业日历</TabsTrigger>
            </TabsList>

            <TabsContent value="rule" className="admin-source-content-grid admin-attendance-tab">
              <Panel title="基础与班次" icon={<CalendarClock size={16} />}>
                <div className="grid gap-4 lg:grid-cols-3">
                  <Field label="规则名称">
                    <Input value={draft?.ruleName || ''} onChange={(event) => setDraft((prev) => (prev ? { ...prev, ruleName: event.target.value } : prev))} />
                  </Field>
                  <Field label="规则类型">
                    <Select value={draft?.ruleType || 'FIXED'} onValueChange={(value) => setDraft((prev) => (prev ? { ...prev, ruleType: value } : prev))}>
                      <SelectTrigger><SelectValue /></SelectTrigger>
                      <SelectContent>
                        {ruleTypeDict.getOptions().map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="绑定班次">
                    <Select value={String(config.shiftId || '')} onValueChange={(value) => updateConfig('shiftId', Number(value))}>
                      <SelectTrigger><SelectValue placeholder="选择班次" /></SelectTrigger>
                      <SelectContent>
                        {shifts.map((shift) => (
                          <SelectItem key={shift.id} value={String(shift.id)}>
                            {shift.shiftName} {normalizeTime(shift.startTime)}-{normalizeTime(shift.endTime)}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  </Field>
                  <Field label="启用规则">
                    <div className="admin-attendance-control-shell">
                      <Switch checked={(draft?.status ?? 1) === 1} onCheckedChange={(checked) => setDraft((prev) => (prev ? { ...prev, status: checked ? 1 : 0 } : prev))} />
                    </div>
                  </Field>
                  <Field label="备注">
                    <Input value={draft?.description || ''} onChange={(event) => setDraft((prev) => (prev ? { ...prev, description: event.target.value } : prev))} />
                  </Field>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  {WEEKDAYS.map((day) => (
                    <Button key={day.value} type="button" size="sm" variant={config.workDays?.includes(day.value) ? 'default' : 'outline'} onClick={() => toggleArrayValue('workDays', day.value)}>
                      {day.label}
                    </Button>
                  ))}
                </div>
              </Panel>

              <div className="grid gap-4 xl:grid-cols-2">
                <Panel title="打卡方式与地点" icon={<MapPin size={16} />}>
                  <div className="mb-4 flex flex-wrap gap-2">
                    {['GPS', 'WIFI', 'FACE'].map((method) => (
                      <Button key={method} type="button" size="sm" variant={config.checkMethods?.includes(method) ? 'default' : 'outline'} onClick={() => toggleArrayValue('checkMethods', method)}>
                        {method}
                      </Button>
                    ))}
                  </div>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="地点名称">
                      <Input value={locationPoint.name || ''} onChange={(event) => updateConfig('locationPoints', [{ ...locationPoint, name: event.target.value }])} />
                    </Field>
                    <Field label="打卡半径(米)">
                      <Input type="number" value={config.radius || 0} onChange={(event) => updateConfig('radius', Number(event.target.value || 0))} />
                    </Field>
                    <Field label="纬度">
                      <Input type="number" value={locationPoint.latitude || ''} onChange={(event) => updateConfig('locationPoints', [{ ...locationPoint, latitude: Number(event.target.value || 0) }])} />
                    </Field>
                    <Field label="经度">
                      <Input type="number" value={locationPoint.longitude || ''} onChange={(event) => updateConfig('locationPoints', [{ ...locationPoint, longitude: Number(event.target.value || 0) }])} />
                    </Field>
                  </div>
                  <div className="mt-4">
                    <Field label="Wi-Fi SSID（一行一个）">
                      <Textarea
                        value={wifiText}
                        onChange={(event) => updateConfig('wifiConfigs', event.target.value.split('\n').filter(Boolean).map((ssid) => ({ ssid })))}
                        className="min-h-[96px]"
                      />
                    </Field>
                  </div>
                </Panel>

                <Panel title="异常与加班口径" icon={<Wifi size={16} />}>
                  <div className="grid gap-4 md:grid-cols-2">
                    <Field label="每月迟到容忍次数">
                      <Input type="number" value={config.lateToleranceCount || 0} onChange={(event) => updateConfig('lateToleranceCount', Number(event.target.value || 0))} />
                    </Field>
                    <Field label="严重迟到阈值(分钟)">
                      <Input type="number" value={config.severeLateMinutes || 0} onChange={(event) => updateConfig('severeLateMinutes', Number(event.target.value || 0))} />
                    </Field>
                    <Field label="旷工阈值(分钟)">
                      <Input type="number" value={config.absentMinutes || 0} onChange={(event) => updateConfig('absentMinutes', Number(event.target.value || 0))} />
                    </Field>
                    <Field label="加班最小时长(分钟)">
                      <Input type="number" value={config.overtimeMinMinutes || 0} onChange={(event) => updateConfig('overtimeMinMinutes', Number(event.target.value || 0))} />
                    </Field>
                    <Field label="允许加班">
                      <div className="admin-attendance-control-shell">
                        <Switch checked={config.overtimeEnabled !== false} onCheckedChange={(checked) => updateConfig('overtimeEnabled', checked)} />
                      </div>
                    </Field>
                    <Field label="拍照/人脸增强">
                      <div className="admin-attendance-control-shell">
                        <Switch checked={Boolean(config.photoRequired)} onCheckedChange={(checked) => updateConfig('photoRequired', checked)} />
                      </div>
                    </Field>
                  </div>
                </Panel>
              </div>
            </TabsContent>

            <TabsContent value="assignment" className="admin-source-content-grid admin-attendance-tab">
              <Panel title="适用范围" icon={<Users size={16} />}>
                <div className="grid gap-3 lg:grid-cols-[160px_1fr_180px_auto]">
                  <Select value={assignmentDraft.targetType} onValueChange={(value) => setAssignmentDraft((prev) => ({ ...prev, targetType: value as 'DEPT' | 'POST' | 'EMPLOYEE' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {targetTypeDict.getOptions().map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input placeholder="目标ID" value={assignmentDraft.targetId} onChange={(event) => setAssignmentDraft((prev) => ({ ...prev, targetId: event.target.value }))} />
                  <DatePicker type="date" value={assignmentDraft.effectiveStart} onChange={(event) => setAssignmentDraft((prev) => ({ ...prev, effectiveStart: event.target.value }))} />
                  <Button onClick={handleAddAssignment} disabled={!activeRuleId}>
                    <Plus size={14} className="mr-1.5" />
                    添加
                  </Button>
                </div>

                <div className="admin-attendance-list-panel mt-4">
                  {assignments.length === 0 ? (
                    <div className="admin-attendance-empty">暂无适用范围</div>
                  ) : assignments.map((item) => (
                    <div key={item.id} className="admin-attendance-list-row">
                      <span className="rounded-md bg-[var(--cf-surface-muted)] px-2 py-1 text-xs dark:bg-slate-800">{targetTypeDict.getLabel(item.targetType || '') || item.targetType}</span>
                      <span className="text-sm font-medium text-slate-900 dark:text-slate-100">{item.targetName || item.targetId}</span>
                      <span className="text-xs text-slate-500">{item.effectiveStart} 起</span>
                      <Button className="ml-auto" variant="ghost" size="icon" onClick={() => handleDeleteAssignment(item.id)}>
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  ))}
                </div>
              </Panel>
            </TabsContent>

            <TabsContent value="calendar" className="admin-source-content-grid admin-attendance-tab">
              <Panel title="企业日历" icon={<CalendarDays size={16} />}>
                <div className="grid gap-3 lg:grid-cols-[180px_180px_1fr_auto]">
                  <DatePicker type="date" value={calendarDraft.calendarDate} onChange={(event) => setCalendarDraft((prev) => ({ ...prev, calendarDate: event.target.value }))} />
                  <Select value={calendarDraft.dayType} onValueChange={(value) => setCalendarDraft((prev) => ({ ...prev, dayType: value as 'WORKDAY' | 'REST' | 'HOLIDAY' }))}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      {dayTypeDict.getOptions().map((opt) => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
                    </SelectContent>
                  </Select>
                  <Input placeholder="日期名称" value={calendarDraft.dayName} onChange={(event) => setCalendarDraft((prev) => ({ ...prev, dayName: event.target.value }))} />
                  <Button onClick={handleSaveCalendar}>
                    <Save size={14} className="mr-1.5" />
                    保存
                  </Button>
                </div>

                <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
                  {calendarDays.map((item) => (
                    <div key={item.id} className="admin-attendance-list-row">
                      <div className="min-w-0 flex-1">
                        <div className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">{item.calendarDate}</div>
                        <div className="mt-1 text-xs text-slate-500">{item.dayName || dayTypeDict.getLabel(item.dayType || '') || item.dayType}</div>
                      </div>
                      <span className="rounded-md bg-[var(--cf-surface-muted)] px-2 py-1 text-xs dark:bg-slate-800">{dayTypeDict.getLabel(item.dayType || '') || item.dayType}</span>
                      <Button variant="ghost" size="icon" onClick={() => handleDeleteCalendar(item.id)}>
                        <Trash2 size={15} />
                      </Button>
                    </div>
                  ))}
                </div>
              </Panel>
            </TabsContent>
          </Tabs>
        </main>
      </div>
    </InnerTableSurface>
  );

  return (
    <section className="admin-source-page admin-attendance-rule-page">
      <TablePageLayout
        actions={pageActions}
        filters={pageFilters}
        table={pageContent}
      />
    </section>
  );
};

export default AttendanceRulePage;
