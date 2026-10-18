import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { Link } from 'react-router-dom';
import { BaseDialog, Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/utils/errorMessage';
import { toBackendDateString } from '@/utils/dateFormat';
import { getAllHolidayCalendars } from '@/services/api/holiday';
import type { HrRecord } from '@/services/api/hr';
import { ruleGet, rulePost, rulePut } from '@/services/api/hr/rules';
import { HrCrudPanel } from '../HrDomainWorkspace';
import { RuleFields, RuleFormDialog, RulePage, RulePagedResource, RuleResource, RuleTask, localToday, employeeScopeFields, namedOptions, options, showValue, yesNo, type RuleField } from './RuleWorkspace';

const statuses = { NORMAL: '正常', LATE: '迟到', EARLY_EXIT: '早退', LATE_AND_EARLY: '迟到且早退', HALF_DAY: '半天', ABSENT: '缺勤', LEAVE: '请假', HOLIDAY: '节假日', REST: '休息', BUSINESS_TRIP: '出差', PENDING: '待打卡' };
const statusLabel = (status: string) => statuses[status as keyof typeof statuses] || status;
const dayColumns = [{ key: 'employeeId', label: '员工编号' }, { key: 'attendanceDate', label: '考勤日' }, { key: 'status', label: '判定', render: (row: HrRecord) => statusLabel(row.status) }, { key: 'workMinutes', label: '工作分钟' }, { key: 'expectedMinutes', label: '应工作分钟' }, { key: 'lateMinutes', label: '迟到分钟' }, { key: 'earlyExitMinutes', label: '早退分钟' }, { key: 'manualAdjustedFlag', label: '人工保护', render: (row: HrRecord) => Number(row.manualAdjustedFlag) === 1 ? '已保护' : '自动' }];

export default function HrAttendanceRulesPage() {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState('records');
  const [shifts, setShifts] = useState<HrRecord[]>([]);
  const [rules, setRules] = useState<HrRecord[]>([]);
  const [calendars, setCalendars] = useState<HrRecord[]>([]);
  const [query, setQuery] = useState<HrRecord>({ from: localToday(), to: localToday() });
  const [recordFilters, setRecordFilters] = useState<HrRecord>({});
  const [recordQuery, setRecordQuery] = useState<HrRecord>({});
  const [punches, setPunches] = useState<HrRecord[]>([]);
  const [dialog, setDialog] = useState<{ action: string; id?: number } | null>(null);
  const [form, setForm] = useState<HrRecord>({});
  const [preview, setPreview] = useState<HrRecord | null>(null);
  const [task, setTask] = useState('');
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(previous => previous + 1), []);
  useEffect(() => { void Promise.all([ruleGet('/attendance/shifts'), ruleGet('/attendance/rules')]).then(([loadedShifts, loadedRules]) => { setShifts(loadedShifts); setRules(loadedRules); }).catch(error => toast.error(getErrorMessage(error, '考勤配置加载失败'))); }, [tab, revision]);
  useEffect(() => { if (hasPermission('system:holiday:list')) void getAllHolidayCalendars().then(setCalendars).catch(error => toast.error(getErrorMessage(error, '日历加载失败'))); }, [hasPermission]);
  const shiftOptions = namedOptions(shifts, 'id', 'shiftName');
  const ruleOptions = namedOptions(rules, 'id', 'ruleName');
  const flag = (key: string, label: string): RuleField => ({ key, label, type: 'select', options: yesNo, numeric: true });
  const open = (action: string, row: HrRecord = {}) => { setForm({ ...row }); setDialog({ action, id: row.id }); };
  const shiftFields: RuleField[] = [
    { key: 'shiftCode', label: '编码', required: true }, { key: 'shiftName', label: '名称', required: true }, { key: 'startTime', label: '上班时间', type: 'time', required: true }, { key: 'endTime', label: '下班时间（早于上班表示跨夜）', type: 'time', required: true },
    { key: 'breakMinutes', label: '休息分钟', type: 'number', min: 0 }, { key: 'workMinutes', label: '应出勤分钟（留空按班次计算）', type: 'number', min: 1 },
    { key: 'checkinWindowBeforeMinutes', label: '提前打卡窗口（分钟）', type: 'number', min: 0 }, { key: 'checkoutWindowAfterMinutes', label: '延后打卡窗口（分钟）', type: 'number', min: 0 },
    { key: 'lateGraceMinutes', label: '迟到宽限分钟', type: 'number', min: 0 }, { key: 'earlyExitGraceMinutes', label: '早退宽限分钟', type: 'number', min: 0 },
    { key: 'halfDayHoursThreshold', label: '半天出勤小时阈值', type: 'number', min: 0 }, { key: 'absentHoursThreshold', label: '缺勤小时阈值', type: 'number', min: 0 },
    { key: 'workingHoursCalcMode', label: '工时计算', type: 'select', options: options({ FIRST_LAST: '首末打卡', PAIRED: '进出配对累计' }), required: true },
    { key: 'checkinDetermineMode', label: '进出判定', type: 'select', options: options({ EARLIEST_LATEST: '首进末出', ALTERNATING: '严格进出配对' }), required: true },
    { key: 'holidayCalendarId', label: '绑定日历（留空继承部门 / 租户）', type: 'select', numeric: true, options: namedOptions(calendars, 'calendarId', 'calendarName') }, flag('autoAttendanceFlag', '自动计算考勤'),
    { key: 'processAttendanceAfter', label: '自动计算起始日', type: 'date' }, flag('markOnHolidayFlag', '节假日也生成打卡结论'), { key: 'overtimeThresholdMinutes', label: '加班记录阈值（分钟）', type: 'number', min: 0 }, { key: 'color', label: '显示色值' }, flag('status', '启用'),
  ];
  const actionFields: RuleField[] = dialog?.action === 'recalculate' ? [
    ...employeeScopeFields, { key: 'startDate', label: '开始日期', type: 'date', required: true }, { key: 'endDate', label: '结束日期', type: 'date', required: true },
    { key: 'forceOverwrite', label: '覆盖人工调整记录（已封账月份仍受保护）', type: 'checkbox' }, { key: 'confirmed', label: '确认重算范围；未指定范围时包含有权操作的全部员工', type: 'checkbox', required: true },
  ] : ['summarize', 'confirm'].includes(dialog?.action || '') ? [{ key: 'employeeId', label: '员工', type: 'employee', required: true }, { key: 'month', label: '月份', type: 'month', required: true }, ...(dialog?.action === 'confirm' ? [{ key: 'confirmed', label: '确认封账；封账后本月打卡、调整和重算被锁定', type: 'checkbox' as const, required: true }] : [])] : dialog?.action === 'preview' ? [{ key: 'employeeId', label: '员工', type: 'employee', required: true }, { key: 'date', label: '日期', type: 'date', required: true }] : dialog?.action === 'punch' ? [
    { key: 'employeeId', label: '员工', type: 'employee', required: true }, { key: 'logType', label: '进出类型', type: 'select', options: options({ IN: '进入', OUT: '离开' }), required: true }, { key: 'checkTime', label: '打卡时间', type: 'datetime-local', required: true },
    { key: 'checkMethod', label: '记录来源', type: 'select', options: options({ MANUAL: '人工补录', APP: '应用', CARD: '门禁卡', FACE: '人脸', GPS: '定位', WIFI: '无线网络' }), required: true }, { key: 'latitude', label: '纬度', type: 'number', min: -90, max: 90 }, { key: 'longitude', label: '经度', type: 'number', min: -180, max: 180 }, { key: 'locationName', label: '地点' }, { key: 'remark', label: '说明', type: 'textarea', required: true },
  ] : [
    ...(dialog?.action === 'manual' ? [{ key: 'employeeId', label: '员工', type: 'employee' as const, required: true }, { key: 'attendanceDate', label: '考勤日', type: 'date' as const, required: true }] : []),
    { key: 'status', label: '判定', type: 'select', options: options(statuses), required: true }, { key: 'workMinutes', label: '工作分钟', type: 'number', min: 0 }, { key: 'expectedMinutes', label: '应工作分钟', type: 'number', min: 0 }, { key: 'lateMinutes', label: '迟到分钟', type: 'number', min: 0 }, { key: 'earlyExitMinutes', label: '早退分钟', type: 'number', min: 0 }, { key: 'remark', label: '调整原因', type: 'textarea', required: true },
  ];
  return <RulePage title="考勤规则与月封账" description="原始打卡与每日结论分开保存；人工调整默认受重算保护，封账后禁止改动。" actions={<Link className="text-sm underline" to="/hr/attendance-appeals">处理考勤申诉</Link>}>
    {task && <RuleTask executeNo={task} path="/attendance" onComplete={refresh} />}
    <Tabs value={tab} onValueChange={setTab}><TabsList className="flex h-auto flex-wrap justify-start">{[['records', '每日结论'], ['checkins', '原始打卡'], ['monthly', '月汇总与封账'], ['shifts', '班次'], ['rules', '打卡规则'], ['schedules', '排班']].map(([value, label]) => <TabsTrigger key={value} value={value}>{label}</TabsTrigger>)}</TabsList>
      <TabsContent value="records" className="space-y-3">
        <div className="flex flex-wrap gap-2"><Button variant="outline" onClick={() => open('preview', { date: localToday() })}>单日试算</Button>{hasPermission('hr:attendance:recalculate') && <Button onClick={() => open('recalculate', { startDate: localToday(), endDate: localToday(), confirmed: false, forceOverwrite: false, employeeIds: [], deptIds: [] })}>范围重算</Button>}{hasPermission('hr:attendance:adjust') && <Button variant="outline" onClick={() => open('manual', { attendanceDate: localToday(), status: 'NORMAL' })}>人工录入</Button>}</div>
        <form className="card space-y-4 p-4" aria-label="考勤结论筛选" onSubmit={event => {
          event.preventDefault();
          if (recordFilters.startDate && recordFilters.endDate && recordFilters.startDate > recordFilters.endDate) { toast.error('开始日期不能晚于结束日期'); return; }
          setRecordQuery({ ...recordFilters });
        }}>
          <RuleFields fields={[
            { key: 'employeeId', label: '员工', type: 'employee' }, { key: 'deptId', label: '部门', type: 'dept' },
            { key: 'startDate', label: '开始日期', type: 'date' }, { key: 'endDate', label: '结束日期', type: 'date' },
            { key: 'status', label: '判定', type: 'select', options: options(statuses) },
          ]} form={recordFilters} setForm={setRecordFilters} />
          <div className="flex flex-wrap gap-2"><Button type="submit">查询结论</Button><Button type="button" variant="outline" onClick={() => { setRecordFilters({}); setRecordQuery({}); }}>重置</Button></div>
        </form>
        <RulePagedResource title="日考勤结论" path="/attendance/records/page" query={recordQuery} refreshKey={revision} columns={dayColumns} actions={row => hasPermission('hr:attendance:adjust') ? [{ label: '人工调整', semantic: 'edit', onClick: () => open('adjust', row) }] : []} />
      </TabsContent>
      <TabsContent value="checkins"><div className="card space-y-4 p-4"><RuleFields fields={[{ key: 'employeeId', label: '员工', type: 'employee', required: true }, { key: 'from', label: '开始日期', type: 'date', required: true }, { key: 'to', label: '结束日期', type: 'date', required: true }]} form={query} setForm={setQuery} /><div className="flex gap-2"><Button onClick={() => { if (!query.employeeId) { toast.error('请选择员工'); return; } void ruleGet('/attendance/checkins', query).then(setPunches).catch(error => toast.error(getErrorMessage(error, '打卡查询失败'))); }}>查询打卡</Button>{hasPermission('hr:attendance:add') && <Button variant="outline" onClick={() => open('punch', { ...query, logType: 'IN', checkMethod: 'MANUAL' })}>补录原始打卡</Button>}</div></div><HrCrudPanel<HrRecord> title="原始打卡" rows={punches.map(row => ({ ...row, id: row.checkinId }))} pageSize={20} columns={[{ key: 'checkTime', label: '打卡时刻' }, { key: 'attendanceDate', label: '归属考勤日' }, { key: 'logType', label: '进 / 出' }, { key: 'checkMethod', label: '方式' }, { key: 'locationValidFlag', label: '地点有效', render: row => Number(row.locationValidFlag) === 1 ? '是' : '否' }, { key: 'offshiftFlag', label: '班次外', render: row => Number(row.offshiftFlag) === 1 ? '是' : '否' }, { key: 'remark', label: '说明' }]} /></TabsContent>
      <TabsContent value="monthly"><div className="mb-3 flex gap-2">{hasPermission('hr:attendance:recalculate') && <Button onClick={() => open('summarize', { month: localToday().slice(0, 7) })}>生成月汇总</Button>}</div><RuleResource title="月考勤汇总" path="/attendance/monthly" refreshKey={revision} columns={[{ key: 'employeeId', label: '员工' }, { key: 'year', label: '年' }, { key: 'month', label: '月' }, { key: 'workDays', label: '应出勤天数' }, { key: 'actualDays', label: '实际出勤' }, { key: 'leaveDays', label: '请假天数' }, { key: 'absentDays', label: '缺勤天数' }, { key: 'status', label: '状态', render: row => row.status === 'CONFIRMED' ? '已封账' : '待确认' }]} actions={row => hasPermission('hr:attendance:confirm') && row.status !== 'CONFIRMED' ? [{ label: '确认封账', semantic: 'confirm', onClick: () => open('confirm', { employeeId: row.employeeId, month: `${row.year}-${String(row.month).padStart(2, '0')}`, confirmed: false }) }] : []} /></TabsContent>
      <TabsContent value="shifts"><RuleResource title="班次" path="/attendance/shifts" permission="hr:attendance:edit" createPermission="hr:attendance:add" fields={shiftFields} defaults={{ startTime: '09:00', endTime: '18:00', breakMinutes: 60, checkinWindowBeforeMinutes: 60, checkoutWindowAfterMinutes: 120, workingHoursCalcMode: 'FIRST_LAST', checkinDetermineMode: 'EARLIEST_LATEST', autoAttendanceFlag: 1, markOnHolidayFlag: 0, status: 1 }} columns={[{ key: 'shiftCode', label: '编码' }, { key: 'shiftName', label: '名称' }, { key: 'startTime', label: '上班' }, { key: 'endTime', label: '下班' }, { key: 'workMinutes', label: '应出勤分钟' }, { key: 'workingHoursCalcMode', label: '计算方式' }, { key: 'holidayCalendarId', label: '日历', render: row => calendars.find(calendar => calendar.calendarId === row.holidayCalendarId)?.calendarName || '继承默认日历' }]} /></TabsContent>
      <TabsContent value="rules"><RuleResource title="打卡规则" path="/attendance/rules" permission="hr:attendance:edit" createPermission="hr:attendance:add" defaults={{ ruleType: 'STANDARD', status: 1, checkMethods: ['APP'] }} fields={[
        { key: 'ruleCode', label: '编码', required: true }, { key: 'ruleName', label: '名称', required: true }, { key: 'shiftId', label: '班次', type: 'select', numeric: true, options: shiftOptions, required: true }, { key: 'checkMethods', label: '允许打卡方式', type: 'multiselect', options: options({ APP: '应用', FACE: '人脸', CARD: '门禁卡', WIFI: '无线网络', GPS: '定位' }) },
        { key: 'breakStartTime', label: '班内休息开始（夜班部分请假必填）', type: 'time' }, { key: 'breakEndTime', label: '班内休息结束', type: 'time' },
        { key: 'latitude', label: '围栏中心纬度', type: 'number', min: -90, max: 90 }, { key: 'longitude', label: '围栏中心经度', type: 'number', min: -180, max: 180 }, { key: 'radiusMeters', label: '围栏半径（米；留空不启用）', type: 'number', min: 1 }, flag('status', '启用'),
      ]} prepareForm={row => { const configuration = typeof row.configJson === 'string' ? JSON.parse(row.configJson) : row.configJson || {}; return { ...row, ...configuration.geofence, breakStartTime: configuration.breakStartTime, breakEndTime: configuration.breakEndTime }; }} preparePayload={(row, original) => { const { latitude, longitude, radiusMeters, breakStartTime, breakEndTime, ...payload } = row; const configuration = typeof original.configJson === 'string' ? JSON.parse(original.configJson) : original.configJson || {}; return { ...payload, ruleType: original.ruleType || 'STANDARD', configJson: { ...configuration, breakStartTime: breakStartTime || null, breakEndTime: breakEndTime || null, geofence: radiusMeters == null ? null : { latitude, longitude, radiusMeters } } }; }} columns={[{ key: 'ruleCode', label: '编码' }, { key: 'ruleName', label: '名称' }, { key: 'shiftId', label: '班次', render: row => shifts.find(shift => shift.id === row.shiftId)?.shiftName || row.shiftId }, { key: 'status', label: '启用', render: row => Number(row.status) === 1 ? '是' : '否' }]} /></TabsContent>
      <TabsContent value="schedules"><RuleResource title="排班" path="/attendance/schedules" permission="hr:attendance:edit" createPermission="hr:attendance:add" defaults={{ targetType: 'EMPLOYEE', status: 'ACTIVE', effectiveStart: localToday() }} fields={[
        { key: 'targetType', label: '排班对象', type: 'select', options: options({ EMPLOYEE: '员工', DEPT: '部门' }), required: true }, { key: 'employeeId', label: '指定员工', type: 'employee' }, { key: 'deptId', label: '指定部门', type: 'dept' }, { key: 'shiftId', label: '班次', type: 'select', numeric: true, options: shiftOptions }, { key: 'ruleId', label: '打卡规则', type: 'select', numeric: true, options: ruleOptions }, { key: 'scheduleDate', label: '单日排班日期（优先于有效期）', type: 'date' }, { key: 'effectiveStart', label: '有效开始', type: 'date' }, { key: 'effectiveEnd', label: '有效结束', type: 'date' }, { key: 'status', label: '状态', type: 'select', options: options({ ACTIVE: '启用', INACTIVE: '停用' }) },
      ]} prepareForm={row => ({ ...row, employeeId: row.targetType === 'EMPLOYEE' ? row.targetId : null, deptId: row.targetType === 'DEPT' ? row.targetId : null })} preparePayload={row => { const { employeeId, deptId, ...payload } = row; return { ...payload, targetId: row.targetType === 'EMPLOYEE' ? employeeId : deptId }; }} columns={[{ key: 'targetType', label: '对象类型' }, { key: 'targetName', label: '对象', render: row => row.targetName || row.targetId }, { key: 'shiftId', label: '班次', render: row => shifts.find(shift => shift.id === row.shiftId)?.shiftName || row.shiftId }, { key: 'scheduleDate', label: '单日指定' }, { key: 'effectiveStart', label: '有效开始' }, { key: 'effectiveEnd', label: '有效结束' }, { key: 'status', label: '状态' }]} /></TabsContent>
    </Tabs>
    <RuleFormDialog open={dialog !== null} title={{ preview: '单日试算', recalculate: '确认范围重算', manual: '人工录入日考勤', adjust: '人工调整日考勤', punch: '补录原始打卡', summarize: '生成月汇总', confirm: '确认月封账' }[dialog?.action || 'preview']} fields={actionFields} form={form} setForm={setForm} onClose={() => setDialog(null)} onSubmit={async values => {
      if (dialog?.action === 'preview') setPreview(await ruleGet('/attendance/records/calculate', values));
      else if (dialog?.action === 'recalculate') { if (!values.confirmed) throw new Error('请确认重算范围'); const result = await rulePost<{ asynchronous: boolean; executeNo?: string; affected?: number }>('/attendance/recalculate', values); if (result.executeNo) setTask(result.executeNo); else toast.success(`已重算 ${result.affected || 0} 条`); }
      else if (dialog?.action === 'punch') { await rulePost('/attendance/checkins', { ...values, checkTime: toBackendDateString(values.checkTime) }); toast.success('打卡已记录，有效性以原始记录中的地点和班次校验结果为准'); }
      else if (dialog?.action === 'manual') await rulePost('/attendance/records', values);
      else if (dialog?.action === 'adjust') await rulePut(`/attendance/records/${dialog.id}/adjust`, values);
      else { if (dialog?.action === 'confirm' && !values.confirmed) throw new Error('请确认封账'); await rulePost(`/attendance/monthly/${dialog?.action}`, undefined, { employeeId: values.employeeId, month: values.month }); toast.success(dialog?.action === 'confirm' ? '已封账' : '月汇总已生成'); }
      refresh();
    }} />
    <BaseDialog open={preview !== null} title="单日试算结果（未保存）" onClose={() => setPreview(null)}><dl className="space-y-3 text-sm">{preview && dayColumns.map(column => <div key={column.key} className="flex justify-between gap-4"><dt>{column.label}</dt><dd>{column.render ? column.render(preview) : showValue(preview[column.key])}</dd></div>)}</dl></BaseDialog>
  </RulePage>;
}
