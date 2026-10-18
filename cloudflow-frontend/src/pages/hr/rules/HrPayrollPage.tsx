import React, { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { toast } from 'sonner';
import { BaseDialog, Button, Input, Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { getErrorMessage } from '@/utils/errorMessage';
import { decimalAmount, normalizeFormNumber } from '@/utils/amountValue';
import { payrollFailureMessage, salaryComponentName, salaryStatusText } from '@/utils/hrPayrollDisplay';
import type { HrRecord } from '@/services/api/hr';
import { ruleDownload, ruleGet, rulePost, rulePut } from '@/services/api/hr/rules';
import { HrCrudPanel } from '../HrDomainWorkspace';
import HrTaxDeductionsPanel from './HrTaxDeductionsPanel';
import { RuleFormDialog, RulePage, RuleResource, RuleTask, localToday, employeeScopeFields, namedOptions, options, showValue, yesNo, type RuleField } from './RuleWorkspace';

const root = '/compensation/payroll';
const batchStates: Record<string, string> = { DRAFT: '草稿', CALCULATING: '计算中', CALCULATED: '已计算', SUBMITTED: '已提交', PAID: '已发放', FAILED: '失败', CANCELLED: '已取消' };
const statusNames: Record<string, string> = { PENDING: '待计算', SUCCESS: '成功', FAILED: '失败', SKIPPED: '跳过' };
const money = (value: unknown) => decimalAmount(String(value ?? 0))?.toFixed(2) ?? '—';
const employeeSummary = (row: HrRecord, showAmounts = false) => <div className="w-44 min-w-0 whitespace-normal lg:w-auto">
  <span className="break-words">{row.employeeName || '—'}</span>
  <div className="mt-2 space-y-1 text-xs text-cf-subtle lg:hidden">
    {showAmounts && <dl className="space-y-1">
      <div><dt className="inline">应发：</dt><dd className="inline break-all tabular-nums">{money(row.grossTotal)}</dd></div>
      <div><dt className="inline">实发：</dt><dd className="inline break-all tabular-nums">{money(row.netTotal)}</dd></div>
    </dl>}
    {row.errorMessage && <p className="break-words">原因：{payrollFailureMessage(row.errorMessage)}</p>}
  </div>
</div>;
const slipAmounts: Record<string, string> = { grossTotal: '应发合计', deductionTotal: '扣款合计', taxAmount: '本期个税', netTotal: '实发合计', cumulativeTaxableIncome: '累计应税所得', cumulativeDeduction: '累计扣除', cumulativeTaxPayable: '累计应纳税', cumulativeTaxPaid: '累计已预扣税' };

export default function HrPayrollPage() {
  const { hasPermission } = useAuth();
  const [search] = useSearchParams();
  const [tab, setTab] = useState('batches');
  const [periods, setPeriods] = useState<HrRecord[]>([]);
  const [slabs, setSlabs] = useState<HrRecord[]>([]);
  const [dialog, setDialog] = useState<{ action: string; id?: number } | null>(null);
  const [form, setForm] = useState<HrRecord>({});
  const [preview, setPreview] = useState<HrRecord[]>([]);
  const [previewSignature, setPreviewSignature] = useState('');
  const [batch, setBatch] = useState<{ batch: HrRecord; employees: HrRecord[]; processed: number } | null>(null);
  const [slip, setSlip] = useState<HrRecord | null>(null);
  const [slab, setSlab] = useState<HrRecord | null>(null);
  const [brackets, setBrackets] = useState<HrRecord[]>([]);
  const [saving, setSaving] = useState(false);
  const [task, setTask] = useState('');
  const [revision, setRevision] = useState(0);
  const refresh = useCallback(() => setRevision(previous => previous + 1), []);
  useEffect(() => { void Promise.all([ruleGet(`${root}/config/periods`), ruleGet(`${root}/config/tax-slabs`)]).then(([loadedPeriods, loadedSlabs]) => { setPeriods(loadedPeriods); setSlabs(loadedSlabs); }).catch(error => toast.error(getErrorMessage(error, '薪资配置加载失败'))); }, [tab, revision]);
  const openSlip = useCallback(async (id: number) => { try { setSlip(await ruleGet(`${root}/slips/${id}`)); } catch (error) { toast.error(getErrorMessage(error, '工资单加载失败')); } }, []);
  useEffect(() => { const id = Number(search.get('id')); if (id > 0) void openSlip(id); }, [search, openSlip]);
  const openBatch = async (id: number) => { try { setBatch(await ruleGet(`${root}/batches/${id}`)); } catch (error) { toast.error(getErrorMessage(error, '批次加载失败')); } };
  const periodOptions = namedOptions(periods, 'periodId', 'periodName');
  const openAction = (action: string, row: HrRecord = {}) => { setForm({ ...row, confirmed: false }); setDialog({ action, id: row.batchId || row.correctionId || row.periodId }); setPreview([]); setPreviewSignature(''); };
  const batchFields: RuleField[] = [{ key: 'payrollPeriodId', label: '薪资周期', type: 'select', options: periodOptions, numeric: true, required: true }, { key: 'postingDate', label: '记账日期', type: 'date', required: true }, ...employeeScopeFields, { key: 'employeeType', label: '用工类型（留空不限）' }, { key: 'validateAttendanceFlag', label: '校验考勤封账', type: 'select', options: yesNo, numeric: true, required: true }, { key: 'deductUnverifiedFlag', label: '纳入未审核专项扣除', type: 'select', options: yesNo, numeric: true, required: true }];
  const fields: RuleField[] = ['create', 'employees'].includes(dialog?.action || '') ? batchFields : dialog?.action === 'previewSlip' ? [{ key: 'employeeId', label: '员工', type: 'employee', required: true }, { key: 'periodId', label: '薪资周期', type: 'select', options: periodOptions, numeric: true, required: true }, { key: 'deductUnverified', label: '纳入未审核扣除', type: 'checkbox' }] : dialog?.action === 'correct' ? [{ key: 'originalSlipId', label: '原已发放工资单编号', type: 'number', min: 1, required: true }, { key: 'payrollPeriodId', label: '补正归属周期', type: 'select', numeric: true, options: periodOptions, required: true }, { key: 'grossAdjustment', label: '应发调整金额（增加填正、减少填负）', type: 'number', required: true }, { key: 'deductionAdjustment', label: '扣款调整金额（增加填正、减少填负）', type: 'number', required: true }, { key: 'reason', label: '补正原因', type: 'textarea', required: true }] : [{ key: 'confirmed', label: ({ pay: '确认发放整个批次的已提交工资单', submit: '确认提交并封存本批次工资单', cancel: '确认仅取消本批次工资单', close: '确认关闭该薪资周期', payCorrection: '确认发放审批通过的补正工资单', calculate: '确认开始后台计算', retry: '确认仅重跑失败员工' } as Record<string, string>)[dialog?.action || ''] || '确认执行操作', type: 'checkbox', required: true }];
  const perform = async (values: HrRecord) => {
    const action = dialog?.action;
    if (action === 'create' || action === 'employees') {
      const signature = JSON.stringify(values);
      if (previewSignature !== signature) { setPreview(await rulePost<HrRecord[]>(`${root}/batches/preview`, values)); setPreviewSignature(signature); toast.info('预检完成，请核对员工清单及跳过原因，再次确认保存'); return false; }
      if (action === 'create') await rulePost(`${root}/batches`, values); else await rulePut(`${root}/batches/${dialog?.id}/employees`, values);
    } else if (action === 'previewSlip') setSlip(await ruleGet(`${root}/slips/preview`, values));
    else if (action === 'correct') { await rulePost(`${root}/corrections`, values); toast.success('补正已提交审批，原工资单保持不变'); }
    else {
      if (!values.confirmed) throw new Error('请确认操作');
      if (action === 'calculate' || action === 'retry') setTask(await rulePost<string>(`${root}/batches/${dialog?.id}/${action}`));
      else if (action === 'close') await rulePost(`${root}/periods/${dialog?.id}/close`);
      else if (action === 'payCorrection') await rulePost(`${root}/corrections/${dialog?.id}/pay`);
      else await rulePost(`${root}/batches/${dialog?.id}/${action}`);
    }
    refresh(); setBatch(null); return true;
  };
  return <RulePage title="薪资批次与累计个税" description="先预检考勤、假期和税档，再逐员工计算；已确定工资保存计算快照，差异通过补正审批处理。" actions={<>{hasPermission('hr:payroll:calculate') && <Button variant="outline" onClick={() => openAction('previewSlip')}>单员工试算</Button>}{hasPermission('hr:payroll:create') && <Button onClick={() => openAction('create', { postingDate: localToday(), validateAttendanceFlag: 1, deductUnverifiedFlag: 0, employeeIds: [], deptIds: [] })}>创建薪资批次</Button>}</>}>
    <div className="card p-4 text-sm text-cf-subtle">2026 年居民普通工资税表已配置完整 7 档税率，每月减除费用为 5000 元，须由管理员或财务启用后参与算薪。本期累计税额为负时按 0 处理。</div>
    {task && <RuleTask executeNo={task} path={root} onComplete={refresh} />}
    <Tabs value={tab} onValueChange={setTab}><TabsList className="flex h-auto flex-wrap justify-start">{[['batches', '薪资批次'], ['periods', '薪资周期'], ['basis', '计薪口径'], ['slabs', '税率表'], ['profiles', '员工税档'], ['deductions', '专项扣除'], ['corrections', '工资补正']].map(([value, label]) => <TabsTrigger value={value} key={value}>{label}</TabsTrigger>)}</TabsList>
      <TabsContent value="batches"><RuleResource title="薪资批次" path={`${root}/batches`} primaryKey="batchId" refreshKey={revision} columns={[{ key: 'batchNo', label: '批次编号' }, { key: 'payrollPeriodId', label: '周期', render: row => periods.find(period => period.periodId === row.payrollPeriodId)?.periodName || row.payrollPeriodId }, { key: 'employeeCount', label: '员工数' }, { key: 'status', label: '状态', render: row => batchStates[row.status] || row.status }, { key: 'totalGross', label: '应发', render: row => money(row.totalGross) }, { key: 'totalTax', label: '个税', render: row => money(row.totalTax) }, { key: 'totalNet', label: '实发', render: row => money(row.totalNet) }]} actions={row => [
        { label: '员工清单与进度', semantic: 'view', onClick: () => void openBatch(row.batchId) },
        ...(['DRAFT'].includes(row.status) && hasPermission('hr:payroll:create') ? [{ label: '调整员工清单', semantic: 'edit' as const, onClick: () => openAction('employees', { ...row, employeeIds: row.filterEmployeeIds || [], deptIds: row.filterDeptIds || [], positionIds: row.filterPositionIds || [], jobLevelIds: row.filterJobLevelIds || [], employeeType: row.filterEmployeeType || null }) }] : []),
        ...(row.status === 'DRAFT' && hasPermission('hr:payroll:calculate') ? [{ label: '开始计算', semantic: 'process' as const, onClick: () => openAction('calculate', row) }] : []),
        ...(['CALCULATED', 'FAILED'].includes(row.status) && hasPermission('hr:payroll:calculate') ? [{ label: '重跑失败员工', semantic: 'reset' as const, onClick: () => openAction('retry', row) }] : []),
        ...(row.status === 'CALCULATED' && hasPermission('hr:payroll:submit') ? [{ label: '提交工资单', semantic: 'submit' as const, onClick: () => openAction('submit', row) }] : []),
        ...(row.status === 'SUBMITTED' && hasPermission('hr:payroll:pay') ? [{ label: '发放批次', semantic: 'confirm' as const, onClick: () => openAction('pay', row) }] : []),
        ...(!['PAID', 'CANCELLED', 'CALCULATING'].includes(row.status) && hasPermission('hr:payroll:cancel') ? [{ label: '取消批次', semantic: 'void' as const, onClick: () => openAction('cancel', row) }] : []),
      ]} /></TabsContent>
      <TabsContent value="periods"><RuleResource title="薪资周期" path={`${root}/config/periods`} writePath={`${root}/periods`} primaryKey="periodId" permission="hr:payroll:configure" fields={[{ key: 'periodName', label: '周期名称', required: true }, { key: 'startDate', label: '开始日期', type: 'date', required: true }, { key: 'endDate', label: '结束日期', type: 'date', required: true }, { key: 'frequency', label: '发薪频率', type: 'select', options: options({ MONTHLY: '月薪', SEMI_MONTHLY: '半月薪', WEEKLY: '周薪' }), required: true }, { key: 'payDate', label: '计划发薪日', type: 'date' }, { key: 'remark', label: '说明', type: 'textarea' }]} defaults={{ frequency: 'MONTHLY' }} refreshKey={revision} columns={[{ key: 'periodName', label: '名称' }, { key: 'startDate', label: '开始' }, { key: 'endDate', label: '结束' }, { key: 'frequency', label: '频率' }, { key: 'status', label: '状态' }]} actions={row => row.status !== 'CLOSED' && hasPermission('hr:payroll:configure') ? [{ label: '关闭周期', semantic: 'archive', onClick: () => openAction('close', row) }] : []} /></TabsContent>
      <TabsContent value="slabs"><RuleResource title="个税税率表" description="居民普通工资按累计预扣规则计算；税表由管理员或财务启用，草稿不参与算薪。" path={`${root}/config/tax-slabs`} writePath={`${root}/tax-slabs`} primaryKey="slabId" permission="hr:payroll:configure" refreshKey={revision} fields={[{ key: 'slabName', label: '税表名称', required: true }, { key: 'region', label: '适用地区', required: true }, { key: 'effectiveFrom', label: '生效日期', type: 'date', required: true }, { key: 'effectiveTo', label: '失效日期', type: 'date' }, { key: 'thresholdAmount', label: '每月减除费用', type: 'number', min: 0, required: true }, { key: 'status', label: '状态', type: 'select', options: options({ DRAFT: '草稿待启用', ACTIVE: '启用', INACTIVE: '停用' }), required: true }, { key: 'remark', label: '核定说明', type: 'textarea' }]} defaults={{ status: 'DRAFT', region: 'CN' }} columns={[{ key: 'slabName', label: '名称' }, { key: 'region', label: '地区' }, { key: 'effectiveFrom', label: '生效日' }, { key: 'thresholdAmount', label: '每月减除费用' }, { key: 'status', label: '状态' }]} actions={row => [{ label: '税率档位', semantic: 'edit', onClick: () => { void ruleGet(`${root}/config/tax-slab-details`, { slabId: row.slabId }).then(result => { setBrackets(result.length ? result : Array.from({ length: 7 }, (_, index) => ({ levelNo: index + 1, fromAmount: null, toAmount: null, taxRate: null, quickDeduction: null }))); setSlab(row); }).catch(error => toast.error(getErrorMessage(error, '税率加载失败'))); } }]} /></TabsContent>
      <TabsContent value="basis"><RuleResource title="薪资结构计薪口径" path={`${root}/config/structures`} writePath={`${root}/structures`} permission="hr:payroll:configure" allowCreate={false} description="分期发薪和中途入职须先核定口径；月薪分摊按所选实际日期或日历工作日计算，社保同月只扣一次。" prepareForm={row => ({ ...row, ...row.componentConfig?.payrollBasis })} fields={[
        { key: 'salaryBasis', label: '已分配工资金额的口径', type: 'select', required: true, options: options({ MONTHLY: '整月工资，分期时拆分', PER_PERIOD: '每个薪资周期的工资' }) },
        { key: 'prorationBasis', label: '周期和入职分摊依据', type: 'select', required: true, options: options({ WORKDAYS: '按日历实际工作日', CALENDAR_DAYS: '按自然日期' }) },
        { key: 'benefitTiming', label: '当月个人社保扣除时点', type: 'select', required: true, options: options({ FIRST_PAYROLL: '当月首次计算工资时', LAST_PAYROLL: '覆盖当月最后一天的工资中' }) },
      ]} columns={[{ key: 'structureName', label: '薪资结构' }, { key: 'basis', label: '金额口径', render: row => ({ MONTHLY: '整月工资', PER_PERIOD: '每期工资' } as Record<string, string>)[row.componentConfig?.payrollBasis?.salaryBasis] || '待核定分期口径' }, { key: 'status', label: '状态', render: row => Number(row.status) === 1 ? '启用' : '停用' }]} /></TabsContent>
      <TabsContent value="profiles"><RuleResource title="员工税档" path="/compensation/tax-profiles" permission="hr:compensation:edit" createPermission="hr:compensation:add" fields={[{ key: 'employeeId', label: '员工', type: 'employee', required: true }, { key: 'taxSlabId', label: '适用税率表', type: 'select', numeric: true, options: namedOptions(slabs, 'slabId', 'slabName'), required: true }, { key: 'taxResidenceCity', label: '纳税地' }, { key: 'status', label: '状态', type: 'select', options: options({ ACTIVE: '启用', INACTIVE: '停用' }), required: true }]} defaults={{ status: 'ACTIVE' }} columns={[{ key: 'employeeId', label: '员工' }, { key: 'taxSlabId', label: '税率表', render: row => slabs.find(item => item.slabId === row.taxSlabId)?.slabName || row.taxSlabId }, { key: 'taxResidenceCity', label: '纳税地' }, { key: 'status', label: '状态' }]} /></TabsContent>
      <TabsContent value="deductions"><HrTaxDeductionsPanel /></TabsContent>
      <TabsContent value="corrections"><div className="mb-3">{hasPermission('hr:payroll:correct') && <Button onClick={() => openAction('correct', { grossAdjustment: 0, deductionAdjustment: 0 })}>创建工资补正</Button>}</div><RuleResource title="工资补正" path={`${root}/corrections`} primaryKey="correctionId" refreshKey={revision} columns={[{ key: 'originalSlipId', label: '原工资单' }, { key: 'correctionSlipId', label: '差额工资单' }, { key: 'diffAmount', label: '实发差额', render: row => money(row.diffAmount) }, { key: 'reason', label: '原因' }, { key: 'status', label: '状态', render: row => salaryStatusText(row.status) }]} actions={row => [{ label: '原工资单', semantic: 'view', onClick: () => void openSlip(row.originalSlipId) }, ...(row.correctionSlipId ? [{ label: '差额工资单', semantic: 'view' as const, onClick: () => void openSlip(row.correctionSlipId) }] : []), ...(row.status === 'APPLIED' && hasPermission('hr:payroll:pay') ? [{ label: '发放补正', semantic: 'confirm' as const, onClick: () => openAction('payCorrection', row) }] : [])]} /></TabsContent>
    </Tabs>
    <RuleFormDialog open={dialog !== null} title={dialog?.action === 'correct' ? '差额补正（保留原工资单）' : ['create', 'employees'].includes(dialog?.action || '') ? '预检并保存员工清单' : '确认薪资操作'} form={form} setForm={setForm} fields={fields} onClose={() => setDialog(null)} onSubmit={perform} submitLabel={['create', 'employees'].includes(dialog?.action || '') && previewSignature !== JSON.stringify(form) ? '预检员工清单' : '确认'}>{preview.length > 0 && <HrCrudPanel title="预检结果" rows={preview} pageSize={10} columns={[{ key: 'employeeName', label: '员工', render: row => employeeSummary(row) }, { key: 'calcStatus', label: '结果', render: row => statusNames[row.calcStatus] || row.calcStatus }, { key: 'errorMessage', label: '跳过 / 失败原因', className: 'min-w-64 max-w-sm whitespace-normal', render: row => payrollFailureMessage(row.errorMessage) }]} />}</RuleFormDialog>
    <BaseDialog open={batch !== null} title={batch ? `${batch.batch.batchNo} · ${batch.processed}/${batch.employees.length}` : '批次详情'} width="wide" onClose={() => setBatch(null)} headerAside={batch && <Button variant="outline" onClick={() => void openBatch(batch.batch.batchId)}>刷新进度</Button>}><HrCrudPanel title="批次员工清单" rows={batch?.employees || []} pageSize={20} columns={[{ key: 'employeeName', label: '员工', render: row => employeeSummary(row, true) }, { key: 'calcStatus', label: '结果', render: row => statusNames[row.calcStatus] || row.calcStatus }, { key: 'grossTotal', label: '应发', render: row => money(row.grossTotal) }, { key: 'netTotal', label: '实发', render: row => money(row.netTotal) }, { key: 'errorMessage', label: '原因', className: 'min-w-64 max-w-sm whitespace-normal', render: row => payrollFailureMessage(row.errorMessage) }]} actions={row => row.salarySlipId ? [{ label: '查看工资单', semantic: 'view', onClick: () => { setBatch(null); void openSlip(row.salarySlipId); } }] : []} /></BaseDialog>
    <BaseDialog open={slip !== null} title={slip?.id ? `工资单 #${slip.id}` : '工资试算（未保存）'} width="wide" onClose={() => setSlip(null)} footer={slip?.id && <Button onClick={() => void ruleDownload(`${root}/slips/${slip.id}/pdf`, `工资单-${slip.id}.pdf`).catch(error => toast.error(getErrorMessage(error, '导出失败')))}>导出工资单 PDF</Button>}>
      {slip && <div className="space-y-4"><p className="text-sm">员工 #{slip.employeeId} · {slip.periodMonth} · {salaryStatusText(slip.status)}</p><dl className="grid gap-3 md:grid-cols-2">{Object.entries(slipAmounts).map(([key, label]) => <div key={key} className="flex justify-between rounded border border-[var(--cf-border)] p-3 text-sm"><dt>{label}</dt><dd>{money(slip[key])}</dd></div>)}</dl><p className="text-xs text-cf-subtle">计算快照已随工资单保存，税率与专项扣除后续变更不会改写该单。</p><HrCrudPanel title="工资组成" rows={(Array.isArray(slip.components) ? slip.components : []).filter((component: HrRecord) => ['EARNING', 'DEDUCTION'].includes(component.type))} columns={[{ key: 'name', label: '项目', render: row => salaryComponentName(row) }, { key: 'amount', label: '金额', render: row => money(row.amount) }]} /></div>}
    </BaseDialog>
    <BaseDialog open={slab !== null} title={`${slab?.slabName || ''} · 财务核定档位`} width="wide" onClose={() => { if (!saving) setSlab(null); }} footer={hasPermission('hr:payroll:configure') && <Button disabled={saving || slab?.status === 'ACTIVE'} onClick={() => { if (!slab) return; setSaving(true); void rulePut(`${root}/tax-slabs/${slab.slabId}/details`, brackets).then(() => { toast.success('税率档位已保存'); setSlab(null); refresh(); }).catch(error => toast.error(getErrorMessage(error, '档位保存失败'))).finally(() => setSaving(false)); }}>保存核定档位</Button>}>
      <p className="mb-3 text-sm text-cf-subtle">下限从 0 连续衔接；税率填写 0 至 1 的小数；末档上限留空。启用中的税表须先停用再编辑。</p><div className="overflow-x-auto"><table className="unity-data-table min-w-[640px]"><thead><tr><th>档次</th><th>下限</th><th>上限</th><th>税率（小数）</th><th>速算扣除</th></tr></thead><tbody>{brackets.map((row, index) => <tr key={row.levelNo}><td>{row.levelNo}</td>{['fromAmount', 'toAmount', 'taxRate', 'quickDeduction'].map(key => <td key={key}><Input aria-label={`第${row.levelNo}档${key}`} type="number" min={0} step="any" value={row[key] ?? ''} disabled={slab?.status === 'ACTIVE' || !hasPermission('hr:payroll:configure')} onChange={event => { const value = event.target.value; setBrackets(previous => previous.map((entry, rowIndex) => rowIndex === index ? { ...entry, [key]: value === '' ? null : normalizeFormNumber(value) } : entry)); }} /></td>)}</tr>)}</tbody></table></div>
    </BaseDialog>
  </RulePage>;
}
