import React, { useCallback, useEffect, useState } from 'react';
import { toast } from 'sonner';
import { BaseDialog, Button, Input, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/utils/errorMessage';
import type { HrRecord } from '@/services/api/hr';
import { ruleGet, rulePost, rulePut } from '@/services/api/hr/rules';
import { HrCrudPanel } from '../HrDomainWorkspace';
import { HrLeaveProofs } from './HrLeaveProofs';
import { RuleFields, RuleFormDialog, RulePage, RuleResource, localToday, employeeScopeFields, namedOptions, options, yesNo, type RuleField } from './RuleWorkspace';

const root = '/attendance/leave';
const flagField = (key: string, label: string): RuleField => ({ key, label, type: 'select', numeric: true, options: yesNo });
const statuses = options({ OPEN: '开放', CLOSED: '关闭' });
const quantity = (row: HrRecord) => `${Number(row.leaveDays || 0).toFixed(2)} ${row.quantityUnit === 'HOUR' ? '小时' : '天'}`;
const runningBalance = (row: HrRecord) => row.runningBalance == null ? '—' : `${Number(row.runningBalance).toFixed(2)} ${row.quantityUnit === 'HOUR' ? '小时' : '天'}`;
const transactionNames: Record<string, string> = { ALLOCATION: '额度分配', APPLICATION: '请假扣减', CARRY_FORWARD: '周期结转', EXPIRY: '额度过期', ENCASHMENT: '假期折现', ADJUSTMENT: '人工调整', COMPENSATORY: '调休转入', FREEZE: '审批冻结', UNFREEZE: '审批解冻' };

export default function HrLeaveRulesPage() {
  const { hasPermission } = useAuth();
  const [tab, setTab] = useState('types');
  const [types, setTypes] = useState<HrRecord[]>([]);
  const [periods, setPeriods] = useState<HrRecord[]>([]);
  const [policies, setPolicies] = useState<HrRecord[]>([]);
  const [components, setComponents] = useState<HrRecord[]>([]);
  const [dialog, setDialog] = useState<string | null>(null);
  const [form, setForm] = useState<HrRecord>({});
  const [query, setQuery] = useState<HrRecord>({});
  const [ledger, setLedger] = useState<HrRecord[]>([]);
  const [policy, setPolicy] = useState<HrRecord | null>(null);
  const [policyDetails, setPolicyDetails] = useState<HrRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [revision, setRevision] = useState(0);
  const refreshOptions = useCallback(async () => {
    try { const [loadedTypes, loadedPeriods, loadedPolicies] = await Promise.all([ruleGet('/attendance/leave-types'), ruleGet(`${root}/periods`), ruleGet(`${root}/policies`)]); setTypes(loadedTypes); setPeriods(loadedPeriods); setPolicies(loadedPolicies); }
    catch (error) { toast.error(getErrorMessage(error, '假期配置加载失败')); }
  }, []);
  useEffect(() => { void refreshOptions(); }, [refreshOptions, tab, revision]);
  useEffect(() => { if (hasPermission('hr:compensation:list')) void ruleGet('/compensation/components').then(setComponents).catch(() => setComponents([])); }, [hasPermission]);
  const typeOptions = types.map(type => ({ value: Number(type.id), label: `${type.leaveName}（${type.unit === 'HOUR' ? '小时' : '天'}）` }));
  const periodOptions = namedOptions(periods, 'periodId', 'periodName');
  const policyOptions = namedOptions(policies, 'policyId', 'policyName');
  const identityFields: RuleField[] = [{ key: 'employeeId', label: '员工', type: 'employee', required: true }, { key: 'leaveTypeId', label: '假期', type: 'select', options: typeOptions, numeric: true, required: true }, { key: 'periodId', label: '周期', type: 'select', options: periodOptions, numeric: true, required: true }];
  const loadLedger = async () => {
    if (!query.employeeId || !query.leaveTypeId) { toast.error('请先选择员工和假期类型'); return; }
    try { setLedger(await ruleGet(`${root}/ledger`, query)); } catch (error) { toast.error(getErrorMessage(error, '台账加载失败')); }
  };
  const typeFields: RuleField[] = [
    { key: 'leaveCode', label: '编码', required: true }, { key: 'leaveName', label: '名称', required: true },
    { key: 'unit', label: '数量单位', type: 'select', options: options({ DAY: '天', HOUR: '小时' }), required: true }, flagField('needQuota', '控制额度'), flagField('isPaid', '带薪'),
    { key: 'maxDaysPerYear', label: '每周期额度上限（按本假期单位）', type: 'number', min: 0 }, { key: 'applicableAfterDays', label: '入职等待天数', type: 'number', min: 0 },
    { key: 'maxContinuousDays', label: '连续请假上限（按本假期单位）', type: 'number', min: 0 }, flagField('carryForwardFlag', '允许结转'),
    { key: 'maxCarryForwardDays', label: '结转上限（按本假期单位）', type: 'number', min: 0 }, { key: 'carryForwardExpireDays', label: '结转有效天数', type: 'number', min: 1 },
    flagField('earnedLeaveFlag', '按期累积'), { key: 'earnedLeaveFrequency', label: '累积频率', type: 'select', options: options({ MONTHLY: '每月', QUARTERLY: '每季度', HALF_YEARLY: '每半年', YEARLY: '每年' }) },
    { key: 'roundingMode', label: '数量取整', type: 'select', options: options({ NONE: '保留两位小数', HALF_DAY: '半天', FULL_DAY: '全天' }) },
    flagField('encashmentFlag', '允许折现'), { key: 'encashmentComponentId', label: '折现薪酬项', type: 'select', options: namedOptions(components, 'id', 'itemName'), numeric: true },
    flagField('lwpFlag', '无薪假'), flagField('partialPaidFlag', '部分带薪'), { key: 'salaryFractionPerDay', label: '带薪比例（0 至 1）', type: 'number', min: 0, max: 1 },
    flagField('compensatoryFlag', '允许调休转入'), flagField('optionalLeaveFlag', '可选假'), flagField('includeHolidayFlag', '计入休息日和节假日'),
    flagField('allowNegativeFlag', '允许负余额'), flagField('allowOverAllocationFlag', '允许超额分配'), flagField('needAttachmentFlag', '必须附证明'),
    { key: 'status', label: '启用', type: 'select', options: yesNo, numeric: true },
  ];
  const openDetails = async (row: HrRecord) => {
    try { const existing = await ruleGet(`${root}/policy-details`, { policyId: row.policyId }); setPolicyDetails(existing); setPolicy(row); }
    catch (error) { toast.error(getErrorMessage(error, '政策明细加载失败')); }
  };
  return <RulePage title="假期政策与台账" description="配置周期与政策，按员工范围分配额度；历史台账保留，修订通过追加或冲正记录完成。">
    <Tabs value={tab} onValueChange={setTab}><TabsList className="flex h-auto flex-wrap justify-start"><TabsTrigger value="types">假期类型</TabsTrigger><TabsTrigger value="periods">周期</TabsTrigger><TabsTrigger value="policies">政策明细</TabsTrigger><TabsTrigger value="assignments">政策分配</TabsTrigger><TabsTrigger value="ledger">额度台账</TabsTrigger><TabsTrigger value="requests">请假申请</TabsTrigger></TabsList>
      <TabsContent value="types"><RuleResource title="假期类型" path="/attendance/leave-types" permission="hr:leave:configure" createPermission="hr:attendance:add" fields={typeFields} defaults={{ unit: 'DAY', needQuota: 1, isPaid: 1, status: 1, roundingMode: 'NONE', earnedLeaveFlag: 0, carryForwardFlag: 0, allowNegativeFlag: 0 }} columns={[{ key: 'leaveCode', label: '编码' }, { key: 'leaveName', label: '名称' }, { key: 'unit', label: '单位', render: row => row.unit === 'HOUR' ? '小时' : '天' }, { key: 'maxDaysPerYear', label: '额度上限' }, { key: 'status', label: '状态', render: row => Number(row.status) === 1 ? '启用' : '停用' }]} /></TabsContent>
      <TabsContent value="periods"><RuleResource title="假期周期" path={`${root}/periods`} primaryKey="periodId" permission="hr:leave:configure" fields={[{ key: 'periodName', label: '周期名称', required: true }, { key: 'startDate', label: '开始日期', type: 'date', required: true }, { key: 'endDate', label: '结束日期', type: 'date', required: true }, flagField('defaultFlag', '默认周期'), { key: 'status', label: '状态', type: 'select', options: statuses }, { key: 'remark', label: '备注', type: 'textarea' }]} defaults={{ status: 'OPEN', defaultFlag: 0 }} columns={[{ key: 'periodName', label: '名称' }, { key: 'startDate', label: '开始' }, { key: 'endDate', label: '结束' }, { key: 'status', label: '状态' }]} /></TabsContent>
      <TabsContent value="policies"><RuleResource title="假期政策" path={`${root}/policies`} primaryKey="policyId" permission="hr:leave:configure" fields={[{ key: 'policyCode', label: '编码', required: true }, { key: 'policyName', label: '名称', required: true }, { key: 'description', label: '说明', type: 'textarea' }, { key: 'status', label: '状态', type: 'select', options: options({ DRAFT: '草稿', ACTIVE: '启用', INACTIVE: '停用' }) }]} defaults={{ status: 'DRAFT' }} columns={[{ key: 'policyCode', label: '编码' }, { key: 'policyName', label: '名称' }, { key: 'status', label: '状态' }]} actions={row => [{ label: '假期与额度', semantic: 'edit', onClick: () => void openDetails(row) }]} /></TabsContent>
      <TabsContent value="assignments"><div className="mb-3 flex gap-2">{hasPermission('hr:leave:assign') && <Button onClick={() => { setForm({ assignmentBasis: 'PERIOD', carryForwardFlag: 0, employeeIds: [], deptIds: [] }); setDialog('assign'); }}>批量分配政策</Button>}</div><RuleResource title="政策分配" path={`${root}/policy-assignments`} primaryKey="assignmentId" refreshKey={revision} columns={[{ key: 'employeeId', label: '员工编号' }, { key: 'policyId', label: '政策', render: row => policies.find(policyRow => policyRow.policyId === row.policyId)?.policyName || row.policyId }, { key: 'leavePeriodId', label: '周期', render: row => periods.find(period => period.periodId === row.leavePeriodId)?.periodName || row.leavePeriodId }, { key: 'effectiveFrom', label: '生效日' }, { key: 'effectiveTo', label: '失效日' }, { key: 'status', label: '状态' }]} /><div className="mt-4"><RuleResource title="假期累积计划" path={`${root}/earned-schedules`} primaryKey="scheduleId" columns={[{ key: 'employeeId', label: '员工' }, { key: 'leaveTypeId', label: '假期' }, { key: 'scheduleDate', label: '累积日期' }, { key: 'earnedDays', label: '数量' }, { key: 'executedFlag', label: '状态', render: row => Number(row.executedFlag) === 1 ? '已执行' : '待执行' }]} /></div></TabsContent>
      <TabsContent value="ledger"><div className="card space-y-4 p-4"><RuleFields fields={identityFields.map(field => ({ ...field, required: field.key !== 'periodId' }))} form={query} setForm={setQuery} /><div className="flex flex-wrap gap-2"><Button onClick={() => void loadLedger()}>查询台账</Button>{hasPermission('hr:leave:adjust') && <><Button variant="outline" onClick={() => { setForm({ ...query, transactionType: 'ADJUSTMENT', sourceId: crypto.randomUUID(), effectiveDate: localToday() }); setDialog('entry'); }}>调整 / 调休转入 / 折现</Button><Button variant="outline" onClick={() => { setForm({ ...query, confirmed: false }); setDialog('recalculate'); }}>重建额度汇总</Button></>}</div></div><HrCrudPanel<HrRecord> title="不可覆盖的额度台账" rows={ledger.map(row => ({ ...row, id: row.ledgerId }))} pageSize={20} columns={[{ key: 'periodId', label: '周期', render: row => periods.find(period => String(period.periodId) === String(row.periodId))?.periodName || `周期 #${row.periodId}` }, { key: 'transactionType', label: '变动类型', render: row => transactionNames[row.transactionType] || row.transactionType }, { key: 'leaveDays', label: '数量', render: quantity }, { key: 'runningBalance', label: '变动后余额', render: runningBalance }, { key: 'fromDate', label: '有效起始' }, { key: 'toDate', label: '有效截止' }, { key: 'remark', label: '原因' }, { key: 'createTime', label: '时间' }]} actions={row => hasPermission('hr:leave:adjust') ? [{ label: '冲正', semantic: 'reset', onClick: () => { setForm({ ledgerId: row.ledgerId }); setDialog('reverse'); } }] : []} /></TabsContent>
      <TabsContent value="requests"><RuleResource title="请假申请与证明" path="/attendance/time-requests?requestType=LEAVE" columns={[{ key: 'requestNo', label: '申请编号' }, { key: 'employeeId', label: '员工' }, { key: 'startTime', label: '开始' }, { key: 'endTime', label: '结束' }, { key: 'duration', label: '数量', render: row => `${row.duration} ${row.unit === 'HOUR' ? '小时' : '天'}` }, { key: 'status', label: '审批状态' }, { key: 'proof', label: '证明', render: row => <HrLeaveProofs requestId={row.id} /> }]} /></TabsContent>
    </Tabs>
    <RuleFormDialog open={dialog !== null} title={dialog === 'assign' ? '批量分配假期政策' : dialog === 'reverse' ? '追加冲正记录' : dialog === 'recalculate' ? '从台账重建额度汇总' : '追加额度变动'} form={form} setForm={setForm} onClose={() => setDialog(null)} fields={dialog === 'assign' ? [
      { key: 'policyId', label: '政策', type: 'select', numeric: true, options: policyOptions, required: true }, { key: 'periodId', label: '周期', type: 'select', numeric: true, options: periodOptions, required: true },
      ...employeeScopeFields, { key: 'assignmentBasis', label: '分配依据', type: 'select', options: options({ PERIOD: '按周期', JOINING_DATE: '按入职日期折算' }), required: true },
      { key: 'effectiveFrom', label: '生效日（留空采用周期起始）', type: 'date' }, { key: 'effectiveTo', label: '失效日（留空采用周期结束）', type: 'date' }, flagField('carryForwardFlag', '结转上期可用额度'),
      { key: 'confirmed', label: '确认分配范围；未指定员工或部门时包含有权操作的全部员工', type: 'checkbox', required: true },
    ] : dialog === 'reverse' ? [{ key: 'reason', label: '冲正原因', type: 'textarea', required: true }] : dialog === 'recalculate' ? [...identityFields.slice(0, 2), { key: 'confirmed', label: '确认依据已有台账重建汇总，保留全部台账记录', type: 'checkbox', required: true }] : [
      ...identityFields, { key: 'transactionType', label: '变动类型', type: 'select', options: options({ ADJUSTMENT: '人工调整', COMPENSATORY: '调休转入', ENCASHMENT: '假期折现' }), required: true },
      { key: 'quantity', label: '数量（调整可填负数；其他填正数）', type: 'number', required: true }, { key: 'sourceId', label: '业务来源编号', required: true },
      { key: 'encashmentAmount', label: '已核定折现金额', type: 'number', min: 0 }, { key: 'effectiveDate', label: '生效日期', type: 'date' }, { key: 'remark', label: '原因', type: 'textarea', required: true },
    ]} onSubmit={async values => {
      if (dialog === 'assign') { if (!values.confirmed) throw new Error('请确认分配范围'); const count = await rulePost(`${root}/assignments`, values); toast.success(`已分配 ${count} 位员工`); }
      else if (dialog === 'reverse') { await rulePost(`${root}/ledger/${values.ledgerId}/reverse`, { reason: values.reason }); await loadLedger(); }
      else if (dialog === 'recalculate') { if (!values.confirmed) throw new Error('请确认重建操作'); await rulePost(`${root}/recalculate`, undefined, { employeeId: values.employeeId, leaveTypeId: values.leaveTypeId }); toast.success('额度汇总已重建'); }
      else { await rulePost(`${root}/ledger`, values); await loadLedger(); }
      setRevision(previous => previous + 1);
    }} />
    <BaseDialog open={policy !== null} title={`${policy?.policyName || ''} · 假期额度明细`} width="wide" onClose={() => { if (!saving) setPolicy(null); }} footer={hasPermission('hr:leave:configure') && <Button disabled={saving} onClick={() => {
      if (!policy) return; setSaving(true);
      void rulePut(`${root}/policies/${policy.policyId}/details`, policyDetails).then(() => { toast.success('政策明细已保存'); setPolicy(null); }).catch(error => toast.error(getErrorMessage(error, '保存失败'))).finally(() => setSaving(false));
    }}>保存明细</Button>}><div className="space-y-3"><p className="text-sm text-cf-subtle">数量沿用各假期的天或小时单位；已有有效分配的政策不可直接改写。</p>{types.map(type => {
      const row = policyDetails.find(entry => entry.leaveTypeId === type.id);
      return <label key={type.id} className="flex items-center justify-between gap-3 text-sm"><span>{type.leaveName}（{type.unit === 'HOUR' ? '小时' : '天'}）</span><Input type="number" min={0} step="0.01" className="max-w-40" disabled={!hasPermission('hr:leave:configure')} value={row?.annualDays ?? ''} placeholder="不纳入政策" onChange={event => { const value = event.target.value; setPolicyDetails(previous => [...previous.filter(entry => entry.leaveTypeId !== type.id), ...(value === '' ? [] : [{ leaveTypeId: type.id, annualDays: Number(value) }])]); }} /></label>;
    })}</div></BaseDialog>
  </RulePage>;
}
