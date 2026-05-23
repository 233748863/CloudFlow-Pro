import React, { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';
import { Button, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/common';
import { Link } from 'react-router-dom';
import {
  AttendanceRuleAssignment,
  DeptTreeNode,
  HrAttendanceMonthly,
  HrAttendanceRecord,
  HrEmployee,
  HrLeaveQuotaVO,
  HrLeaveTypeOption,
  HrRecord,
  HrScheduleRule,
  HrShift,
  PostOption,
  changeHrTimeRequestStatus,
  createHrAttendanceRecord,
  createHrLeaveQuota,
  createHrLeaveType,
  createHrScheduleAssignment,
  createHrScheduleRule,
  createHrShift,
  createHrTimeRequest,
  getDeptTreeOptions,
  getPostOptions,
  listHrAttendanceMonthly,
  listHrAttendanceRecords,
  listHrLeaveQuotaRecords,
  listHrLeaveTypes,
  listHrScheduleAssignments,
  listHrScheduleRules,
  listHrShifts,
  listHrTimeRequests,
  listEmployees,
} from '@/services/api/hr';
import { getErrorMessage } from '@/utils/errorMessage';
import { buildEmployeeLabel, flattenDeptTree, idFallbackLabel, normalizeRows } from './hrShared';
import { HrCrudPanel, HrFormField, HrPageHeader, renderStatus } from './HrDomainWorkspace';

const ruleTypeLabels: Record<string, string> = {
  FIXED: '固定工时',
  STANDARD: '标准工时',
  FLEXIBLE: '弹性工时',
};

const targetTypeLabels: Record<string, string> = {
  DEPT: '部门',
  POST: '岗位',
  EMPLOYEE: '员工',
};

const checkTypeLabels: Record<string, string> = {
  CHECK_IN: '上班打卡',
  CHECK_OUT: '下班打卡',
};

const checkMethodLabels: Record<string, string> = {
  MANUAL: '人工补录',
  MOBILE: '移动端',
  TERMINAL: '考勤机',
  WIFI: 'Wi-Fi',
  GPS: '定位',
};

const leaveUnitLabels: Record<string, string> = {
  DAY: '天',
  HOUR: '小时',
};

const requestTypeLabels: Record<string, string> = {
  LEAVE: '请假',
  OVERTIME: '加班',
  SUPPLEMENT: '补录',
};

const formatTimeValue = (value?: unknown) => {
  const text = String(value || '');
  const match = text.match(/\d{2}:\d{2}/);
  return match?.[0] || '-';
};

const formatDateValue = (value?: unknown) => {
  if (!value) return '-';
  return String(value).slice(0, 10);
};

const formatDateTimeValue = (value?: unknown) => {
  if (!value) return '-';
  const text = String(value).replace('T', ' ');
  const match = text.match(/^(\d{4}-\d{2}-\d{2})\s?(\d{2}:\d{2})/);
  return match ? `${match[1]} ${match[2]}` : text;
};

const yesNoLabel = (value?: unknown) =>
  Number(value) === 1 || value === true ? '是' : '否';

const shiftDefault = (): HrRecord => ({
  shiftCode: `SH${Date.now()}`,
  shiftName: '',
  startTime: '09:00',
  endTime: '18:00',
  breakMinutes: 60,
  status: 1,
});

const ruleDefault = (): HrRecord => ({
  ruleCode: `RULE${Date.now()}`,
  ruleName: '',
  ruleType: 'STANDARD',
  shiftId: '',
  workDays: [1, 2, 3, 4, 5],
  lateToleranceMinutes: 10,
  absentThresholdMinutes: 60,
  status: 1,
});

const scheduleDefault = (): HrRecord => ({
  ruleId: '',
  targetType: 'DEPT',
  targetId: '',
  targetName: '',
  effectiveStart: '',
  effectiveEnd: '',
  status: 1,
});

const recordDefault = (): HrRecord => ({
  employeeId: '',
  checkType: 'CHECK_IN',
  checkTime: '',
  checkMethod: 'MANUAL',
  location: '',
  status: 'NORMAL',
});

const leaveTypeDefault = (): HrRecord => ({
  leaveCode: `LEAVE${Date.now()}`,
  leaveName: '',
  needQuota: 1,
  isPaid: 1,
  unit: 'DAY',
  status: 1,
});

const quotaDefault = (): HrRecord => ({
  employeeId: '',
  leaveTypeId: '',
  year: new Date().getFullYear(),
  totalQuota: 0,
  usedQuota: 0,
  frozenQuota: 0,
  availableQuota: 0,
  expiryDate: '',
});

const requestDefault = (): HrRecord => ({
  requestNo: `HRTM${Date.now()}`,
  requestType: 'LEAVE',
  employeeId: '',
  leaveTypeId: '',
  startTime: '',
  endTime: '',
  duration: 1,
  unit: 'DAY',
  reason: '',
  status: 'DRAFT',
});

const HrAttendancePage: React.FC = () => {
  const [activeTab, setActiveTab] = useState('shifts');
  const [shifts, setShifts] = useState<HrShift[]>([]);
  const [rules, setRules] = useState<HrScheduleRule[]>([]);
  const [schedules, setSchedules] = useState<AttendanceRuleAssignment[]>([]);
  const [records, setRecords] = useState<HrAttendanceRecord[]>([]);
  const [monthly, setMonthly] = useState<HrAttendanceMonthly[]>([]);
  const [leaveTypes, setLeaveTypes] = useState<HrLeaveTypeOption[]>([]);
  const [quotas, setQuotas] = useState<HrLeaveQuotaVO[]>([]);
  const [timeRequests, setTimeRequests] = useState<HrRecord[]>([]);
  const [employees, setEmployees] = useState<HrEmployee[]>([]);
  const [deptTree, setDeptTree] = useState<DeptTreeNode[]>([]);
  const [posts, setPosts] = useState<PostOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [shiftForm, setShiftForm] = useState<HrRecord>(shiftDefault);
  const [ruleForm, setRuleForm] = useState<HrRecord>(ruleDefault);
  const [scheduleForm, setScheduleForm] = useState<HrRecord>(scheduleDefault);
  const [recordForm, setRecordForm] = useState<HrRecord>(recordDefault);
  const [leaveTypeForm, setLeaveTypeForm] = useState<HrRecord>(leaveTypeDefault);
  const [quotaForm, setQuotaForm] = useState<HrRecord>(quotaDefault);
  const [requestForm, setRequestForm] = useState<HrRecord>(requestDefault);

  const loadData = async () => {
    setLoading(true);
    try {
      const [shiftRes, ruleRes, scheduleRes, recordRes, monthlyRes, leaveTypeRes, quotaRes, requestRes, employeeRes, deptRes, postRes] = await Promise.all([
        listHrShifts(),
        listHrScheduleRules(),
        listHrScheduleAssignments(),
        listHrAttendanceRecords(),
        listHrAttendanceMonthly(),
        listHrLeaveTypes(),
        listHrLeaveQuotaRecords(),
        listHrTimeRequests(),
        listEmployees({ pageNum: 1, pageSize: 500 }),
        getDeptTreeOptions(),
        getPostOptions(),
      ]);
      setShifts(normalizeRows<HrShift>(shiftRes));
      setRules(normalizeRows<HrScheduleRule>(ruleRes));
      setSchedules(normalizeRows<AttendanceRuleAssignment>(scheduleRes));
      setRecords(normalizeRows<HrAttendanceRecord>(recordRes));
      setMonthly(normalizeRows<HrAttendanceMonthly>(monthlyRes));
      setLeaveTypes(normalizeRows<HrLeaveTypeOption>(leaveTypeRes));
      setQuotas(normalizeRows<HrLeaveQuotaVO>(quotaRes));
      setTimeRequests(normalizeRows<HrRecord>(requestRes));
      setEmployees(normalizeRows<HrEmployee>(employeeRes));
      setDeptTree(normalizeRows<DeptTreeNode>(deptRes));
      setPosts(normalizeRows<PostOption>(postRes));
    } catch (error) {
      toast.error(getErrorMessage(error, '考勤休假数据加载失败'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    void loadData();
  }, []);

  const shiftOptions = useMemo(
    () => shifts.map((item) => ({ label: item.shiftName || item.shiftCode, value: item.id })),
    [shifts],
  );

  const ruleOptions = useMemo(
    () => rules.map((item) => ({ label: item.ruleName || item.ruleCode || item.id, value: item.id })),
    [rules],
  );

  const leaveTypeOptions = useMemo(
    () => leaveTypes.map((item) => ({ label: item.leaveName || item.leaveCode, value: item.id })),
    [leaveTypes],
  );

  const employeeOptions = useMemo(
    () => employees.map((item) => ({ label: buildEmployeeLabel(item) || item.name || item.employeeNo, value: item.id })),
    [employees],
  );

  const employeeLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    employees.forEach((employee) => {
      map.set(String(employee.id), buildEmployeeLabel(employee) || employee.name || employee.employeeNo || String(employee.id));
    });
    return map;
  }, [employees]);

  const shiftLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    shifts.forEach((shift) => {
      map.set(String(shift.id), shift.shiftName || shift.shiftCode || String(shift.id));
    });
    return map;
  }, [shifts]);

  const ruleLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    rules.forEach((rule) => {
      map.set(String(rule.id), rule.ruleName || rule.ruleCode || String(rule.id));
    });
    return map;
  }, [rules]);

  const leaveTypeLabelMap = useMemo(() => {
    const map = new Map<string, string>();
    leaveTypes.forEach((leaveType) => {
      map.set(String(leaveType.id), leaveType.leaveName || leaveType.leaveCode || String(leaveType.id));
    });
    return map;
  }, [leaveTypes]);

  const deptOptions = useMemo(() => flattenDeptTree(deptTree), [deptTree]);

  const postOptions = useMemo(
    () => posts.map((item) => ({ label: item.postName || item.postCode || String(item.postId), value: item.postId })),
    [posts],
  );

  const scheduleTargetOptions = useMemo(() => {
    if (scheduleForm.targetType === 'POST') return postOptions;
    if (scheduleForm.targetType === 'EMPLOYEE') return employeeOptions;
    return deptOptions;
  }, [deptOptions, employeeOptions, postOptions, scheduleForm.targetType]);

  const getOptionLabel = (value: string | number, options: Array<{ label: React.ReactNode; value: string | number }>) => {
    const option = options.find((item) => String(item.value) === String(value));
    return typeof option?.label === 'string' || typeof option?.label === 'number' ? String(option.label) : '';
  };

  const weekDayOptions = [
    { label: '周一', value: 1 },
    { label: '周二', value: 2 },
    { label: '周三', value: 3 },
    { label: '周四', value: 4 },
    { label: '周五', value: 5 },
    { label: '周六', value: 6 },
    { label: '周日', value: 7 },
  ];

  const buildRulePayload = (form: HrRecord) => ({
    ...form,
    configJson: JSON.stringify({
      workDays: form.workDays || [],
      lateToleranceMinutes: Number(form.lateToleranceMinutes || 0),
      absentThresholdMinutes: Number(form.absentThresholdMinutes || 0),
    }),
  });

  const employeeLabel = (row: HrRecord) =>
    String(row.employeeName || employeeLabelMap.get(String(row.employeeId)) || idFallbackLabel('员工', row.employeeId));

  const shiftLabel = (value?: unknown) =>
    shiftLabelMap.get(String(value)) || idFallbackLabel('班次', value);

  const ruleLabel = (value?: unknown) =>
    ruleLabelMap.get(String(value)) || idFallbackLabel('规则', value);

  const leaveTypeLabel = (row: HrRecord) =>
    String(row.leaveTypeName || leaveTypeLabelMap.get(String(row.leaveTypeId)) || idFallbackLabel('假期', row.leaveTypeId));

  const scheduleTargetLabel = (row: HrRecord) => {
    const targetType = String(row.targetType || '').toUpperCase();
    const options = targetType === 'POST' ? postOptions : targetType === 'EMPLOYEE' ? employeeOptions : deptOptions;
    const prefix = targetTypeLabels[targetType] || '对象';
    return row.targetName || getOptionLabel(row.targetId, options) || idFallbackLabel(prefix, row.targetId);
  };

  const submitAndReload = async (runner: () => Promise<unknown>, success: string) => {
    try {
      await runner();
      toast.success(success);
      await loadData();
    } catch (error) {
      toast.error(getErrorMessage(error, success.replace('已', '') + '失败'));
    }
  };

  const requestActions = (row: HrRecord) => {
    const status = String(row.status || '').toUpperCase();
    return (
      <div className="flex flex-wrap justify-end gap-2">
        {[
          { label: '提交', action: 'submit', enabled: status === 'DRAFT' },
          { label: '通过', action: 'approve', enabled: status === 'APPROVING' },
          { label: '驳回', action: 'reject', enabled: status === 'APPROVING' },
          { label: '取消', action: 'cancel', enabled: !['APPROVED', 'REJECTED', 'CANCELLED'].includes(status) },
        ].map((item) => (
          <Button
            key={item.action}
            variant="outline"
            size="sm"
            disabled={!item.enabled}
            onClick={() => void submitAndReload(
              () => changeHrTimeRequestStatus(Number(row.id), item.action),
              `申请已${item.label}`,
            )}
          >
            {item.label}
          </Button>
        ))}
      </div>
    );
  };

  const shiftFields: HrFormField[] = [
    { key: 'shiftName', label: '班次名称' },
    { key: 'startTime', label: '上班时间', type: 'time' },
    { key: 'endTime', label: '下班时间', type: 'time' },
    { key: 'breakMinutes', label: '休息分钟', type: 'number' },
    { key: 'status', label: '状态', type: 'select', valueType: 'number', options: [{ label: '启用', value: 1 }, { label: '停用', value: 0 }] },
  ];

  const ruleFields: HrFormField[] = [
    { key: 'ruleName', label: '规则名称' },
    { key: 'ruleType', label: '规则类型', type: 'select', options: [{ label: '标准工时', value: 'STANDARD' }, { label: '弹性工时', value: 'FLEXIBLE' }] },
    { key: 'shiftId', label: '默认班次', type: 'select', valueType: 'number', options: shiftOptions },
    { key: 'workDays', label: '工作日', type: 'multiselect', valueType: 'number', options: weekDayOptions, className: 'md:col-span-2' },
    { key: 'lateToleranceMinutes', label: '迟到容差（分钟）', type: 'number' },
    { key: 'absentThresholdMinutes', label: '缺勤阈值（分钟）', type: 'number' },
    { key: 'status', label: '状态', type: 'select', valueType: 'number', options: [{ label: '启用', value: 1 }, { label: '停用', value: 0 }] },
  ];

  const scheduleFields: HrFormField[] = [
    { key: 'ruleId', label: '规则', type: 'select', valueType: 'number', options: ruleOptions },
    {
      key: 'targetType',
      label: '对象类型',
      type: 'select',
      options: [{ label: '部门', value: 'DEPT' }, { label: '岗位', value: 'POST' }, { label: '员工', value: 'EMPLOYEE' }],
      onValueChange: () => ({ targetId: '', targetName: '' }),
    },
    {
      key: 'targetId',
      label: scheduleForm.targetType === 'POST' ? '岗位' : scheduleForm.targetType === 'EMPLOYEE' ? '员工' : '部门',
      type: 'select',
      valueType: 'number',
      options: scheduleTargetOptions,
      onValueChange: (value) => ({ targetName: getOptionLabel(value as string | number, scheduleTargetOptions) }),
    },
    { key: 'effectiveStart', label: '生效开始', type: 'date' },
    { key: 'effectiveEnd', label: '生效结束', type: 'date' },
    { key: 'status', label: '状态', type: 'select', valueType: 'number', options: [{ label: '启用', value: 1 }, { label: '停用', value: 0 }] },
  ];

  const requestFields: HrFormField[] = [
    { key: 'requestType', label: '类型', type: 'select', options: [{ label: '请假', value: 'LEAVE' }, { label: '加班', value: 'OVERTIME' }, { label: '补录', value: 'SUPPLEMENT' }] },
    { key: 'employeeId', label: '员工', type: 'employee' },
    { key: 'leaveTypeId', label: '假期类型', type: 'select', valueType: 'number', options: leaveTypeOptions },
    { key: 'startTime', label: '开始时间', type: 'datetime-local' },
    { key: 'endTime', label: '结束时间', type: 'datetime-local' },
    { key: 'duration', label: '时长', type: 'number' },
    { key: 'unit', label: '单位', type: 'select', options: [{ label: '天', value: 'DAY' }, { label: '小时', value: 'HOUR' }] },
    { key: 'reason', label: '原因', type: 'textarea', className: 'md:col-span-2' },
  ];

  return (
    <div className="space-y-4">
      <HrPageHeader
        eyebrow="Attendance"
        title="考勤休假"
        stats={[
          { label: '班次', value: shifts.length },
          { label: '规则', value: rules.length },
          { label: '排班', value: schedules.length },
          { label: '申请', value: timeRequests.length, tone: 'active' },
        ]}
      />

      <div className="flex justify-end">
        <Link to="/hr/attendance/appeals">
          <Button variant="outline">考勤异常申诉</Button>
        </Link>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab} className="space-y-4">
        <TabsList className="w-full justify-start overflow-x-auto lg:w-auto">
          {[
            ['shifts', '班次'],
            ['rules', '规则'],
            ['schedules', '排班'],
            ['records', '打卡'],
            ['monthly', '月度'],
            ['leaveTypes', '假期类型'],
            ['quotas', '额度'],
            ['requests', '申请'],
          ].map(([value, label]) => (
            <TabsTrigger key={value} value={value} className="flex-1 lg:flex-none">{label}</TabsTrigger>
          ))}
        </TabsList>

        <TabsContent value="shifts">
          <HrCrudPanel
            title="班次"
            rows={shifts}
            loading={loading}
            onRefresh={() => void loadData()}
            createLabel="新增班次"
            form={shiftForm}
            setForm={setShiftForm}
            resetForm={shiftDefault}
            formFields={shiftFields}
            onCreate={(form) => submitAndReload(() => createHrShift(form as Omit<HrShift, 'id'> & HrRecord), '班次已保存')}
            columns={[
              { key: 'shiftCode', label: '编码' },
              { key: 'shiftName', label: '名称' },
              { key: 'startTime', label: '上班', render: (row) => formatTimeValue(row.startTime) },
              { key: 'endTime', label: '下班', render: (row) => formatTimeValue(row.endTime) },
              { key: 'breakMinutes', label: '休息', render: (row) => `${row.breakMinutes ?? 0} 分钟` },
              { key: 'status', label: '状态', render: (row) => renderStatus(row.status) },
            ]}
          />
        </TabsContent>

        <TabsContent value="rules">
          <HrCrudPanel
            title="规则"
            rows={rules}
            loading={loading}
            onRefresh={() => void loadData()}
            createLabel="新增规则"
            form={ruleForm}
            setForm={setRuleForm}
            resetForm={ruleDefault}
            formFields={ruleFields}
            onCreate={(form) => submitAndReload(() => createHrScheduleRule(buildRulePayload(form) as Omit<HrScheduleRule, 'id'> & HrRecord), '规则已保存')}
            columns={[
              { key: 'ruleCode', label: '编码' },
              { key: 'ruleName', label: '名称' },
              { key: 'ruleType', label: '类型', render: (row) => ruleTypeLabels[String(row.ruleType || '').toUpperCase()] || row.ruleType || '-' },
              { key: 'shiftId', label: '班次', render: (row) => shiftLabel(row.shiftId) },
              { key: 'status', label: '状态', render: (row) => renderStatus(row.status) },
            ]}
          />
        </TabsContent>

        <TabsContent value="schedules">
          <HrCrudPanel
            title="排班"
            rows={schedules}
            loading={loading}
            onRefresh={() => void loadData()}
            createLabel="新增排班"
            form={scheduleForm}
            setForm={setScheduleForm}
            resetForm={scheduleDefault}
            formFields={scheduleFields}
            onCreate={(form) => submitAndReload(() => createHrScheduleAssignment(form), '排班已保存')}
            columns={[
              { key: 'ruleId', label: '规则', render: (row) => ruleLabel(row.ruleId) },
              { key: 'targetType', label: '对象', render: (row) => targetTypeLabels[String(row.targetType || '').toUpperCase()] || row.targetType || '-' },
              { key: 'targetName', label: '名称', render: scheduleTargetLabel },
              { key: 'effectiveStart', label: '开始', render: (row) => formatDateValue(row.effectiveStart) },
              { key: 'effectiveEnd', label: '结束', render: (row) => formatDateValue(row.effectiveEnd) },
              { key: 'status', label: '状态', render: (row) => renderStatus(row.status) },
            ]}
          />
        </TabsContent>

        <TabsContent value="records">
          <HrCrudPanel
            title="打卡记录"
            rows={records}
            loading={loading}
            onRefresh={() => void loadData()}
            createLabel="新增记录"
            form={recordForm}
            setForm={setRecordForm}
            resetForm={recordDefault}
            formFields={[
              { key: 'employeeId', label: '员工', type: 'employee' },
              { key: 'checkType', label: '类型', type: 'select', options: [{ label: '上班', value: 'CHECK_IN' }, { label: '下班', value: 'CHECK_OUT' }] },
              { key: 'checkTime', label: '时间', type: 'datetime-local' },
              { key: 'checkMethod', label: '方式', type: 'select', options: [{ label: '人工补录', value: 'MANUAL' }, { label: '移动端', value: 'MOBILE' }, { label: '考勤机', value: 'TERMINAL' }] },
              { key: 'location', label: '地点' },
              { key: 'status', label: '状态', type: 'select', options: [{ label: '正常', value: 'NORMAL' }, { label: '迟到', value: 'LATE' }, { label: '早退', value: 'EARLY' }, { label: '缺勤', value: 'ABSENT' }] },
            ]}
            onCreate={(form) => submitAndReload(() => createHrAttendanceRecord(form), '打卡记录已保存')}
            columns={[
              { key: 'employeeName', label: '员工', render: (row) => employeeLabel(row) },
              { key: 'checkType', label: '类型', render: (row) => checkTypeLabels[String(row.checkType || '').toUpperCase()] || row.checkType || '-' },
              { key: 'checkTime', label: '时间', render: (row) => formatDateTimeValue(row.checkTime) },
              { key: 'checkMethod', label: '方式', render: (row) => checkMethodLabels[String(row.checkMethod || '').toUpperCase()] || row.checkMethod || '-' },
              { key: 'status', label: '状态', render: (row) => renderStatus(row.status) },
            ]}
          />
        </TabsContent>

        <TabsContent value="monthly">
          <HrCrudPanel
            title="月度统计"
            rows={monthly}
            loading={loading}
            onRefresh={() => void loadData()}
            columns={[
              { key: 'employeeName', label: '员工', render: (row) => employeeLabel(row) },
              { key: 'year', label: '年度' },
              { key: 'month', label: '月份' },
              { key: 'workDays', label: '应出勤' },
              { key: 'actualDays', label: '实出勤' },
              { key: 'lateTimes', label: '迟到' },
              { key: 'absentDays', label: '缺勤' },
            ]}
          />
        </TabsContent>

        <TabsContent value="leaveTypes">
          <HrCrudPanel
            title="假期类型"
            rows={leaveTypes}
            loading={loading}
            onRefresh={() => void loadData()}
            createLabel="新增假期"
            form={leaveTypeForm}
            setForm={setLeaveTypeForm}
            resetForm={leaveTypeDefault}
            formFields={[
              { key: 'leaveName', label: '名称' },
              { key: 'needQuota', label: '额度控制', type: 'select', valueType: 'number', options: [{ label: '是', value: 1 }, { label: '否', value: 0 }] },
              { key: 'isPaid', label: '带薪', type: 'select', valueType: 'number', options: [{ label: '是', value: 1 }, { label: '否', value: 0 }] },
              { key: 'unit', label: '单位', type: 'select', options: [{ label: '天', value: 'DAY' }, { label: '小时', value: 'HOUR' }] },
              { key: 'status', label: '状态', type: 'select', valueType: 'number', options: [{ label: '启用', value: 1 }, { label: '停用', value: 0 }] },
            ]}
            onCreate={(form) => submitAndReload(() => createHrLeaveType(form), '假期类型已保存')}
            columns={[
              { key: 'leaveCode', label: '编码' },
              { key: 'leaveName', label: '名称' },
              { key: 'unit', label: '单位', render: (row) => leaveUnitLabels[String(row.unit || '').toUpperCase()] || row.unit || '-' },
              { key: 'needQuota', label: '额度', render: (row) => yesNoLabel(row.needQuota) },
              { key: 'status', label: '状态', render: (row) => renderStatus(row.status) },
            ]}
          />
        </TabsContent>

        <TabsContent value="quotas">
          <HrCrudPanel
            title="假期额度"
            rows={quotas}
            loading={loading}
            onRefresh={() => void loadData()}
            createLabel="新增额度"
            form={quotaForm}
            setForm={setQuotaForm}
            resetForm={quotaDefault}
            formFields={[
              { key: 'employeeId', label: '员工', type: 'employee' },
              { key: 'leaveTypeId', label: '假期类型', type: 'select', valueType: 'number', options: leaveTypeOptions },
              { key: 'year', label: '年度', type: 'number' },
              { key: 'totalQuota', label: '总额度', type: 'number' },
              { key: 'usedQuota', label: '已用', type: 'number' },
              { key: 'frozenQuota', label: '冻结', type: 'number' },
              { key: 'availableQuota', label: '可用', type: 'number' },
              { key: 'expiryDate', label: '过期日期', type: 'date' },
            ]}
            onCreate={(form) => submitAndReload(() => createHrLeaveQuota(form), '额度已保存')}
            columns={[
              { key: 'employeeName', label: '员工', render: (row) => employeeLabel(row) },
              { key: 'leaveTypeName', label: '假期', render: (row) => leaveTypeLabel(row) },
              { key: 'year', label: '年度' },
              { key: 'totalQuota', label: '总额' },
              { key: 'usedQuota', label: '已用' },
              { key: 'availableQuota', label: '可用' },
            ]}
          />
        </TabsContent>

        <TabsContent value="requests">
          <HrCrudPanel
            title="假勤申请"
            rows={timeRequests}
            loading={loading}
            onRefresh={() => void loadData()}
            createLabel="新增申请"
            form={requestForm}
            setForm={setRequestForm}
            resetForm={requestDefault}
            formFields={requestFields}
            onCreate={(form) => submitAndReload(() => createHrTimeRequest(form), '申请已保存')}
            columns={[
              { key: 'requestNo', label: '编号' },
              { key: 'requestType', label: '类型', render: (row) => requestTypeLabels[String(row.requestType || '').toUpperCase()] || row.requestType || '-' },
              { key: 'employeeName', label: '员工', render: (row) => employeeLabel(row) },
              { key: 'startTime', label: '开始', render: (row) => formatDateTimeValue(row.startTime) },
              { key: 'endTime', label: '结束', render: (row) => formatDateTimeValue(row.endTime) },
              { key: 'duration', label: '时长' },
              { key: 'status', label: '状态', render: (row) => renderStatus(row.status) },
            ]}
            actions={requestActions}
            minWidthClassName="min-w-[1040px]"
          />
        </TabsContent>
      </Tabs>
    </div>
  );
};

export default HrAttendancePage;
