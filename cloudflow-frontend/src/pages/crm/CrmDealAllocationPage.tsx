import React, { useRef, useState } from 'react';
import { Button, Input } from '@/components/common';
import { BaseDialog } from '@/components/common/BaseDialog';
import { Empty, Field, money, OperationsPage, OpsSelect, OpsTable, useRemote } from '@/components/crm/operations/OperationsKit';
import { useAuth } from '@/context/AuthContext';
import { commissionApi, CommissionFilters, DealAllocation } from '@/services/api/crm/commission';
import { decimalAmount } from '@/utils/amountValue';
import { getErrorMessage } from '@/utils/errorMessage';

const eventTypes = { RECEIPT: '到账与退款', WON: '赢单与撤回', CONTRACT: '合同生效与冲减' };
const businessTypes = { RECEIVABLE: '回款计划', OPPORTUNITY: '商机', CONTRACT: '合同' };
const allocationKey = (row: DealAllocation) => String(row.allocationId);
const proportion = (value: string | number | null | undefined) => {
  const amount = decimalAmount(value);
  return amount ? amount.mul(100).toFixed(2) + '%' : '—';
};
const payableFact = (row: DealAllocation) => row.eventType === 'RECEIPT' && row.baselineFlag === 0;

function commissionState(row: DealAllocation) {
  if (!payableFact(row)) return '不计提成';
  if (row.payrollState === 'PAID' || row.commissionStatus === 'PAID') return row.reversalOfId ? '已扣回' : '已发放';
  if (row.payrollState === 'PENDING') return '待选择扣回周期';
  if (row.compChangeId) return row.reversalOfId ? '已入薪，待扣回' : '已入薪，待发放';
  if (row.commissionStatus === 'UNCONFIRMED') return row.reversalOfId ? '等待原款核定' : '待核定';
  if (row.commissionRequested) return '传送待确认';
  return row.reversalOfId ? '退款待处理' : '已核定，待入薪';
}

export default function CrmDealAllocationPage() {
  const { hasPermission } = useAuth();
  const canRead = hasPermission('crm:deal-allocation:list');
  const canManage = hasPermission('crm:commission:manage');
  const [filters, setFilters] = useState<CommissionFilters>({ pageNum: 1, pageSize: 20, eventType: 'RECEIPT', currency: 'CNY' });
  const [selected, setSelected] = useState<string[]>([]);
  const [dialog, setDialog] = useState<'confirm' | 'post'>();
  const [dialogRows, setDialogRows] = useState<DealAllocation[]>([]);
  const [rate, setRate] = useState('');
  const [basis, setBasis] = useState('');
  const [period, setPeriod] = useState('');
  const [component, setComponent] = useState('');
  const [busy, setBusy] = useState(false);
  const busyRef = useRef(false);
  const [actionError, setActionError] = useState('');
  const [notice, setNotice] = useState('');
  const source = useRemote(() => canRead ? commissionApi.list(filters) : Promise.resolve({ rows: [], total: 0 }), [canRead, JSON.stringify(filters)]);
  const options = useRemote(() => canManage && dialog === 'post' ? commissionApi.options() : Promise.resolve({ periods: [], components: [] }), [canManage, dialog]);
  const rows = source.data?.rows || [];
  const selectedRows = rows.filter(row => selected.includes(allocationKey(row)));
  const confirmable = selectedRows.length > 0 && selectedRows.every(row => payableFact(row) && !row.reversalOfId);
  const postable = selectedRows.length > 0 && selectedRows.every(row => payableFact(row) && row.currency === 'CNY'
    && row.commissionRate !== null && row.commissionRate !== undefined && ['APPROVED', 'READY', 'POSTED', 'PAID'].includes(row.commissionStatus || ''));
  const pageCount = Math.max(1, Math.ceil(Number(source.data?.total || 0) / filters.pageSize));

  function changeFilter(patch: Partial<CommissionFilters>) {
    setSelected([]); setNotice(''); setFilters(previous => ({ ...previous, ...patch, pageNum: patch.pageNum || 1 }));
  }
  function choose(row: DealAllocation, checked: boolean) {
    const key = allocationKey(row);
    setSelected(previous => checked ? [...previous.filter(value => value !== key), key] : previous.filter(value => value !== key));
  }
  function open(next: 'confirm' | 'post') {
    setDialogRows(selectedRows); setDialog(next); setActionError(''); setNotice('');
    if (next === 'confirm') { setRate(''); setBasis(''); }
    else { setPeriod(''); setComponent(''); }
  }
  function close() {
    if (busyRef.current) return;
    setDialog(undefined); setActionError('');
  }
  async function submit() {
    if (busyRef.current || !dialog || !canManage || dialogRows.length === 0) return;
    const selectedRate = decimalAmount(rate);
    if (dialog === 'confirm' && (!selectedRate || selectedRate.lt(0) || selectedRate.gt(100) || selectedRate.decimalPlaces() > 2 || !basis.trim())) {
      setActionError('请填写0至100%的提成比例，最多两位小数，并填写核定依据。'); return;
    }
    if (dialog === 'post' && (!period || !component)) { setActionError('请选择工资周期和薪资项目。'); return; }
    busyRef.current = true; setBusy(true); setActionError('');
    try {
      const allocationIds = dialogRows.map(allocationKey);
      if (dialog === 'confirm') {
        await commissionApi.confirm({ allocationIds, commissionRate: selectedRate!.div(100).toFixed(4), approvalBasis: basis.trim() });
        setNotice('提成已核定；相关退款按原款比例生成扣回记录。');
      } else {
        const result = await commissionApi.post({ allocationIds, payrollPeriodId: period, salaryComponentId: component });
        setNotice(result.pending ? '传送请求已保存，工资确认仍在处理中；请刷新核对逐笔状态。' : '已进入所选工资周期；实际发薪后更新为已发放或已扣回。');
      }
      setDialog(undefined); setSelected([]);
    } catch (failure) {
      setActionError(getErrorMessage(failure, '办理结果尚未确认，请刷新核对后按原选择重试。'));
    } finally {
      busyRef.current = false; setBusy(false); source.refresh();
    }
  }

  if (!canRead) return <p role="alert">无权查看业绩与提成事实。</p>;
  const checkbox = (row: DealAllocation) => <label className="inline-flex min-h-11 min-w-11 cursor-pointer items-center justify-center">
    <input type="checkbox" aria-label={'选择分配记录 ' + allocationKey(row)} checked={selected.includes(allocationKey(row))}
      disabled={!payableFact(row) || busy} onChange={event => choose(row, event.target.checked)} className="h-4 w-4" />
  </label>;
  const title = (row: DealAllocation) => <div className="min-w-0 space-y-1 [overflow-wrap:anywhere]">
    <p className="font-medium text-cf-title">{row.customerName}</p>
    <p className="text-sm text-cf-muted">{row.businessName || businessTypes[row.bizType as keyof typeof businessTypes] || row.bizType}</p>
    <p className="text-xs text-cf-muted">分配记录 {allocationKey(row)} · 业务记录 {row.bizId}</p>
  </div>;
  const member = (row: DealAllocation) => <div className="min-w-0 [overflow-wrap:anywhere]">
    <p>{row.salesUserName || '人员 ' + row.salesUserId}</p><p className="text-sm text-cf-muted">{row.deptName || '部门 ' + row.deptId}</p>
    <p className="text-xs text-cf-muted">团队版本 {row.teamVersion} · 分成 {proportion(row.allocatedPercentage)}</p>
  </div>;

  return <OperationsPage title="业绩与提成事实" description="逐笔核对业务发生时的销售分配；真实到账后核定提成，退款沿用原款依据扣回。"
    loading={source.loading} error={source.error} refresh={busy ? undefined : source.refresh}
    actions={canManage && <div className="flex flex-wrap items-center gap-2">
      <span className="text-sm text-cf-muted">已选 {selectedRows.length} 条</span>
      <Button className="min-h-11" variant="outline" disabled={!confirmable || busy || source.loading} onClick={() => open('confirm')}>核定提成</Button>
      <Button className="min-h-11" disabled={!postable || busy || source.loading} onClick={() => open('post')}>传送至工资</Button>
    </div>}
    filters={<fieldset disabled={busy} className="grid min-w-0 grid-cols-1 gap-3 sm:grid-cols-2 xl:grid-cols-5">
      <Field label="业务事实"><OpsSelect label="业务事实" value={filters.eventType} options={eventTypes} empty="全部事实"
        onChange={value => changeFilter({ eventType: value || undefined })} /></Field>
      <Field label="业务类型"><OpsSelect label="业务类型" value={filters.bizType} options={businessTypes} empty="全部业务"
        onChange={value => changeFilter({ bizType: value || undefined })} /></Field>
      <Field label="币种"><Input aria-label="币种" value={filters.currency || ''} maxLength={3} placeholder="全部币种"
        onChange={event => changeFilter({ currency: event.target.value.toUpperCase() || undefined })} /></Field>
      <Field label="开始日期"><Input type="date" aria-label="开始日期" value={filters.startDate || ''} onChange={event => changeFilter({ startDate: event.target.value || undefined })} /></Field>
      <Field label="结束日期"><Input type="date" aria-label="结束日期" value={filters.endDate || ''} onChange={event => changeFilter({ endDate: event.target.value || undefined })} /></Field>
    </fieldset>}>
    {notice && <p role="status" className="rounded-lg border border-cf-border bg-cf-card p-3 text-sm [overflow-wrap:anywhere]">{notice}</p>}
    {canManage && <p className="text-sm text-cf-muted">当前工资以人民币核算；其他币种分别保留。已发工资保持原记录，退款扣回另行选择开放的工资周期。</p>}
    <div className="hidden md:block">
      <OpsTable headers={[...(canManage ? ['选择'] : []), '客户与业务', '销售与冻结团队', '发生时间', '分配金额', ...(canManage ? ['提成', '工资处理'] : [])]}>
        {rows.map(row => <tr key={allocationKey(row)}>
          {canManage && <td>{checkbox(row)}</td>}
          <td className="max-w-72">{title(row)}{row.reversalOfId && <p className="mt-1 text-xs text-cf-muted">冲减原分配 {row.reversalOfId}</p>}{row.baselineFlag === 1 && <p className="text-xs text-cf-muted">期初快照</p>}</td>
          <td>{member(row)}</td><td>{row.occurredTime?.replace('T', ' ')}</td>
          <td className="font-medium tabular-nums">{money(row.allocatedAmount)} <span className="text-xs">{row.currency}</span></td>
          {canManage && <><td className="tabular-nums">{money(row.commissionAmount)} <span className="text-xs">{row.currency}</span><p className="text-xs text-cf-muted">提成比例 {proportion(row.commissionRate)}</p></td>
            <td><p>{commissionState(row)}</p><p className="max-w-56 text-xs text-cf-muted [overflow-wrap:anywhere]">{row.payrollPeriodName || '尚未指定工资周期'}</p></td></>}
        </tr>)}
      </OpsTable>
    </div>
    <div className="space-y-3 md:hidden">
      {rows.map(row => <article key={allocationKey(row)} aria-label={'分配记录 ' + allocationKey(row)} className="min-w-0 rounded-xl border border-cf-border bg-cf-card p-4">
        <div className="flex min-w-0 items-start justify-between gap-2">{title(row)}{canManage && <span className="shrink-0">{checkbox(row)}</span>}</div>
        <div className="mt-3">{member(row)}</div>
        <dl className="mt-4 grid min-w-0 grid-cols-1 gap-3 min-[360px]:grid-cols-2">
          <div className="min-w-0"><dt className="text-xs text-cf-muted">分配金额</dt><dd className="mt-1 break-all font-semibold tabular-nums">{money(row.allocatedAmount)} {row.currency}</dd></div>
          {canManage && <div className="min-w-0"><dt className="text-xs text-cf-muted">提成金额 · {proportion(row.commissionRate)}</dt><dd className="mt-1 break-all font-semibold tabular-nums">{money(row.commissionAmount)} {row.currency}</dd></div>}
          <div className="min-w-0"><dt className="text-xs text-cf-muted">发生时间</dt><dd className="mt-1 text-sm [overflow-wrap:anywhere]">{row.occurredTime?.replace('T', ' ')}</dd></div>
          {canManage && <div className="min-w-0"><dt className="text-xs text-cf-muted">工资处理</dt><dd className="mt-1 text-sm [overflow-wrap:anywhere]">{commissionState(row)}<p className="text-xs text-cf-muted">{row.payrollPeriodName || '尚未指定工资周期'}</p></dd></div>}
        </dl>
        {row.reversalOfId && <p className="mt-3 break-all text-xs text-cf-muted">冲减原分配 {row.reversalOfId}</p>}
        {row.baselineFlag === 1 && <p className="mt-3 text-xs text-cf-muted">期初快照</p>}
      </article>)}
    </div>
    {!source.loading && !source.error && rows.length === 0 && <Empty text="当前筛选下暂无业绩分配记录" />}
    <div className="flex flex-wrap items-center justify-between gap-3">
      <p className="text-sm text-cf-muted">共 {source.data?.total || 0} 条 · 第 {filters.pageNum} / {pageCount} 页</p>
      <div className="flex gap-2"><Button variant="outline" className="min-h-11" disabled={filters.pageNum <= 1 || source.loading || busy} onClick={() => changeFilter({ pageNum: filters.pageNum - 1 })}>上一页</Button>
        <Button variant="outline" className="min-h-11" disabled={filters.pageNum >= pageCount || source.loading || busy} onClick={() => changeFilter({ pageNum: filters.pageNum + 1 })}>下一页</Button></div>
    </div>
    <BaseDialog open={Boolean(dialog)} title={dialog === 'confirm' ? '核定到账提成' : '传送提成至工资'} onClose={close}
      closeOnEscape={!busy} hideCloseButton={busy} width="normal"
      footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="outline" className="min-h-11" onClick={close} disabled={busy}>返回</Button>
        <Button className="min-h-11" onClick={() => void submit()} disabled={busy || dialog === 'post' && (options.loading || Boolean(options.error))}>{busy ? '正在办理…' : dialog === 'confirm' ? '确认核定' : '确认传送'}</Button></div>}>
      <div className="space-y-4">
        <p className="text-sm text-cf-muted">本次办理 {dialogRows.length} 条分配记录。{dialog === 'confirm' ? '核定后保留提成比例和依据，相关退款同步按原款扣回。' : '工资周期须开放，且该员工本期工资尚未生成；实际发薪后更新处理结果。'}</p>
        <ul className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-cf-border p-3 text-sm">
          {dialogRows.map(row => <li key={allocationKey(row)} className="min-w-0 [overflow-wrap:anywhere]">
            {row.salesUserName || '人员 ' + row.salesUserId} · {row.businessName || row.customerName} · 记录 {allocationKey(row)}
            <p className="tabular-nums text-cf-muted">{dialog === 'confirm' ? '分配金额 ' + money(row.allocatedAmount) : '提成金额 ' + money(row.commissionAmount)} {row.currency}</p>
          </li>)}
        </ul>
        {dialog === 'confirm' ? <fieldset disabled={busy} className="space-y-3">
          <Field label="提成比例（%）"><Input aria-label="提成比例（%）" type="number" min="0" max="100" step="0.01" value={rate} onChange={event => setRate(event.target.value)} placeholder="例如 10 表示 10%" /></Field>
          <Field label="核定依据"><textarea aria-label="核定依据" className="cf-control min-h-24 w-full resize-y rounded-md p-3 text-sm" maxLength={800} value={basis} onChange={event => setBasis(event.target.value)} placeholder="填写适用的提成政策及本次核定依据" /></Field>
        </fieldset> : <fieldset disabled={busy || options.loading} className="space-y-3">
          <Field label="工资周期"><OpsSelect label="工资周期" value={period} empty={options.loading ? '正在读取工资周期' : '请选择工资周期'} options={Object.fromEntries((options.data?.periods || []).map(choice => [choice.id, choice.name]))} onChange={setPeriod} /></Field>
          <Field label="薪资项目"><OpsSelect label="薪资项目" value={component} empty="请选择计税的变动薪资项目" options={Object.fromEntries((options.data?.components || []).map(choice => [choice.id, choice.name]))} onChange={setComponent} /></Field>
          {options.error && <p role="alert" className="text-sm">{options.error}<Button variant="link" onClick={options.refresh}>重新读取</Button></p>}
        </fieldset>}
        {actionError && <p role="alert" className="crm-ops-warning [overflow-wrap:anywhere]">{actionError}</p>}
      </div>
    </BaseDialog>
  </OperationsPage>;
}
