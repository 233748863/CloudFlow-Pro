import React, { useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Calculator, Plus, RefreshCw } from 'lucide-react';
import { BaseDialog, Button, ListResultFooter } from '@/components/common';
import { useAuth } from '@/context/AuthContext';
import { finalSettlementApi, type FinalSettlement, type SettlementItem, type SettlementOption, type SettlementPolicyOption, type SettlementQuery } from '@/services/api/hr/finalSettlements';
import { Hr09Error } from '@/services/api/hr/hr09Model';
import { Hr09Access, Hr09ErrorNotice, Hr09FormDialog, Hr09Input, Hr09Notice, Hr09Page, Hr09Select, Hr09State, Hr09Textarea, Hr09Value,
  dateTimeText, useHr09Mutation, useHr09Resource } from './components/Hr09Shared';
import './final-settlements.css';
import { HrSettlementAssetEditor, SettlementAssetEvidence } from './components/HrSettlementAssetEditor';
import { HrSettlementAssetReminder } from './components/HrSettlementAssetReminder';
import { SettlementFundsDialog, SettlementFundsProgress, type SettlementFundsAction } from './components/HrSettlementFunds';

const statuses = { DRAFT: '草稿', CONFIRMED: '已确认', PAID: '已结清', CLOSED: '已关闭' };
const approvalStatuses: Record<string, string> = { DRAFT: '未提交', SUBMITTED: '待财务复核', APPROVED: '财务已通过', REJECTED: '财务已退回', CANCELLED: '已撤回' };
const uncertainResult = (error: unknown) => !(error instanceof Hr09Error) || error.status == null || error.status >= 500;

function ApplicationLookup({ selected, onChange }: { selected?: SettlementOption; onChange: (option?: SettlementOption) => void }) {
  const [keyword, setKeyword] = useState(''); const [page, setPage] = useState(1);
  const lookup = useHr09Resource(signal => finalSettlementApi.applications({ pageNum: page, pageSize: 20, keyword }, signal), [page, keyword]);
  const options = [...(selected && !lookup.data?.rows.some(item => item.value === selected.value) ? [selected] : []), ...(lookup.data?.rows || [])];
  return <div className="space-y-3">
    <Hr09Input label="搜索离职申请单号" value={keyword} maxLength={64} onChange={event => { setKeyword(event.target.value); setPage(1); }} />
    <Hr09Select label="离职申请" required value={selected?.value || ''} options={options} disabled={lookup.loading || Boolean(lookup.error)} onChange={value => onChange(options.find(item => item.value === value))} />
    {lookup.loading && <p role="status" className="text-sm text-cf-subtle">正在读取已通过的离职申请…</p>}
    {lookup.error && <Hr09State error title="离职申请读取失败" description={lookup.error.message} onRetry={lookup.refresh} />}
    {lookup.data && !lookup.data.rows.length && <p role="status" className="text-sm text-cf-subtle">没有符合条件的已通过离职申请。</p>}
    {lookup.data && lookup.data.total > 20 && <ListResultFooter total={lookup.data.total} page={page} pageSize={20} onPageChange={setPage} summary={`共 ${lookup.data.total} 项`} />}
  </div>;
}

function CreateDraft({ onClose, onSaved }: { onClose: () => void; onSaved: (id: string) => void }) {
  const [source, setSource] = useState<SettlementOption>(); const [remark, setRemark] = useState('');
  const [uncertain, setUncertain] = useState(false); const [saved, setSaved] = useState<FinalSettlement>(); const [notFound, setNotFound] = useState(false);
  const recovery = useHr09Mutation();
  const recover = () => void recovery.run(async () => {
    if (!source) return;
    setNotFound(false);
    for (let pageNum = 1; ; pageNum++) {
      const result = await finalSettlementApi.list({ employeeId: source.employeeId, pageNum, pageSize: 100 });
      const found = result.rows.find(row => row.lifecycleApplicationId === source.value);
      if (found) { setSaved(found); return; }
      if (pageNum * 100 >= result.total || !result.rows.length) { setNotFound(true); return; }
    }
  });
  return <Hr09FormDialog title="建立离职结算草稿" panelClassName="final-settlements" description="从已通过的离职申请建立结算，再核定取样和来源。" submitText="建立草稿" successText="结算草稿已建立"
    blocked={uncertain || !source} onClose={onClose} onReload={recover} onSubmit={async () => {
      try { onSaved(await finalSettlementApi.create(source!.value, remark)); }
      catch (error) { if (uncertainResult(error) || error instanceof Hr09Error && error.status === 409) setUncertain(true); throw error; }
    }}>
    <fieldset disabled={uncertain} className="min-w-0 space-y-4"><ApplicationLookup selected={source} onChange={setSource} />
      {source && <p className="text-sm text-cf-subtle">离职日期：{source.relievingDate}</p>}
      <Hr09Textarea label="备注" value={remark} maxLength={500} onChange={event => setRemark(event.target.value)} /></fieldset>
    {uncertain && <Hr09Notice>建立结果尚待核对，已保留输入并停止重复提交。<div className="mt-2 flex flex-wrap gap-2"><Button type="button" variant="outline" disabled={recovery.busy} onClick={recover}>读取已保存结果</Button>
      {saved && <Button type="button" onClick={() => { onSaved(saved.settlementId); onClose(); }}>查看已保存结算</Button>}</div></Hr09Notice>}
    {notFound && <Hr09Notice>本次尚未查到已保存记录，请稍后再次读取核对。</Hr09Notice>}<Hr09ErrorNotice error={recovery.error} />
  </Hr09FormDialog>;
}

function PolicyLookup({ row, selected, onChange }: { row: FinalSettlement; selected?: SettlementPolicyOption; onChange: (option?: SettlementPolicyOption) => void }) {
  const [keyword, setKeyword] = useState(''); const [page, setPage] = useState(1);
  const lookup = useHr09Resource(signal => finalSettlementApi.policies(row.settlementId, { pageNum: page, pageSize: 20, keyword }, signal), [row.settlementId, keyword, page]);
  const options = [...(selected && !lookup.data?.rows.some(item => item.value === selected.value) ? [selected] : []), ...(lookup.data?.rows || [])];
  return <div className="space-y-3 rounded-lg border border-[var(--cf-border)] p-3">
    <Hr09Input label="搜索补偿政策名称或编号" value={keyword} maxLength={64} onChange={event => { setKeyword(event.target.value); setPage(1); }} />
    <Hr09Select label="补偿政策" value={selected?.value || ''} options={options} placeholder="尚未核定政策" disabled={lookup.loading || Boolean(lookup.error)} onChange={value => onChange(options.find(item => item.value === value))} hint="仅可选择已核定且覆盖本单离职日期的政策。" />
    {lookup.loading && <p role="status" className="text-sm text-cf-subtle">正在读取可用政策…</p>}
    {lookup.error && <Hr09State error title="政策读取失败" description={lookup.error.message} onRetry={lookup.refresh} />}
    {lookup.data && !lookup.data.rows.length && <p role="status" className="text-sm text-cf-subtle">暂无符合条件的政策，可先保留草稿。</p>}
    {lookup.data && lookup.data.total > 20 && <ListResultFooter total={lookup.data.total} page={page} pageSize={20} onPageChange={setPage} summary={`共 ${lookup.data.total} 项`} />}
  </div>;
}

function SamplingEditor({ row, onClose, onSaved, onLoad }: { row: FinalSettlement; onClose: () => void; onSaved: () => void; onLoad: (row: FinalSettlement) => void }) {
  const [policy, setPolicy] = useState<SettlementPolicyOption | undefined>(row.ruleId ? { value: row.ruleId, label: row.ruleName || '原政策暂不可用，请重新选择' } : undefined);
  const [months, setMonths] = useState(row.sampling?.months || []); const [month, setMonth] = useState('');
  const [averaging, setAveraging] = useState(row.sampling?.averagingMonths || ''); const [reason, setReason] = useState(row.sampling?.reason || '');
  const [remark, setRemark] = useState(row.remark || ''); const [uncertain, setUncertain] = useState(false); const [saved, setSaved] = useState<FinalSettlement>();
  const recovery = useHr09Mutation();
  const recover = () => void recovery.run(async () => { setSaved(await finalSettlementApi.detail(row.settlementId)); });
  const addable = /^[1-9]\d{3}-(?:0[1-9]|1[0-2])$/.test(month) && month >= row.joinDate.slice(0, 7) && month <= row.relievingDate.slice(0, 7) && !months.includes(month) && months.length < 120;
  return <Hr09FormDialog title="核定结算取样" panelClassName="final-settlements" description={`${row.employeeName} · 在职期间 ${row.joinDate} 至 ${row.relievingDate}`} submitText="保存核定" successText="本单核定已保存，请重新计算"
    blocked={uncertain} onClose={onClose} onReload={recover} onSubmit={async () => {
      try { await finalSettlementApi.update(row, { ruleId: policy?.value || null, sampling: months.length || averaging || reason ? { months, averagingMonths: averaging, reason } : null, remark: remark.trim() || null }); onSaved(); }
      catch (error) { if (uncertainResult(error) || error instanceof Hr09Error && error.status === 409) setUncertain(true); throw error; }
    }}>
    <fieldset disabled={uncertain} className="min-w-0 space-y-4"><PolicyLookup row={row} selected={policy} onChange={setPolicy} />
      <div className="flex flex-wrap items-end gap-2"><div className="min-w-0 flex-1"><Hr09Input label="添加取样月份" type="month" min={row.joinDate.slice(0, 7)} max={row.relievingDate.slice(0, 7)} value={month} onChange={event => setMonth(event.target.value)} /></div>
        <Button type="button" variant="outline" disabled={!addable} onClick={() => { setMonths([...months, month].sort()); setMonth(''); }}>添加月份</Button></div>
      <div className="space-y-2"><p className="text-sm text-cf-body">已选 {months.length} / 120 个月</p>
        {!months.length && <p className="text-sm text-cf-subtle">尚未核定取样月份。</p>}
        <div className="flex flex-wrap gap-2">{months.map(value => <Button key={value} type="button" variant="outline" aria-label={`移除 ${value}`} onClick={() => setMonths(months.filter(item => item !== value))}>{value} ×</Button>)}</div></div>
      <Hr09Input label="平均月份数" inputMode="decimal" maxLength={8} value={averaging} onChange={event => setAveraging(event.target.value)} hint="按适用政策逐单核定；大于0且不超过120，最多4位小数，可与已选月份数量不同。" />
      <Hr09Textarea label="核定原因" value={reason} maxLength={2000} onChange={event => setReason(event.target.value)} hint="说明离职当月、不足月份及平均月份数的处理依据。" />
      <Button type="button" variant="outline" onClick={() => { setMonths([]); setMonth(''); setAveraging(''); setReason(''); }}>清空本单取样</Button>
      <Hr09Textarea label="备注" value={remark} maxLength={500} onChange={event => setRemark(event.target.value)} /></fieldset>
    {uncertain && <Hr09Notice>保存结果尚待核对，当前输入已保留。<div className="mt-2"><Button type="button" variant="outline" disabled={recovery.busy} onClick={recover}>读取已保存结果</Button></div></Hr09Notice>}
    {saved && <section aria-label="已保存核定结果" className="space-y-3 rounded-lg border border-[var(--cf-border)] p-3"><h3 className="font-medium text-cf-title">服务器已保存结果</h3>
      <dl className="space-y-3"><Hr09Value label="已保存取样月份">{saved.sampling?.months.join('、') || '尚未核定'}</Hr09Value><Hr09Value label="已保存平均月份数">{saved.sampling?.averagingMonths}</Hr09Value><Hr09Value label="已保存核定原因">{saved.sampling?.reason}</Hr09Value></dl>
      <Button type="button" variant="outline" onClick={() => onLoad(saved)}>载入已保存结果</Button><p className="text-xs text-cf-subtle">载入后以已保存内容替换当前输入。</p></section>}
    <Hr09ErrorNotice error={recovery.error} />
  </Hr09FormDialog>;
}

function Evidence({ evidence }: { evidence: Record<string, unknown> }) {
  const labels: Record<string, string> = { periodStart: '期间开始', periodEnd: '期间结束', grossTotal: '工资收入合计', deductionTotal: '工资扣款合计', netTotal: '工资实发额',
    advanceNo: '借款单号', funded: '已放款', repaid: '已还款', writtenOff: '已核销', outstanding: '未还余额', payrollReserved: '工资已预扣', settlementReceivable: '本次借款应收',
    assessedAmount: '培训核定金额', collectedAmount: '培训已收金额', receivableAmount: '培训本次应收', assessmentReason: '培训核定原因',
    leaveCode: '假期代码', total: '假期总额度', used: '已使用额度', frozen: '已冻结额度', available: '可用额度', expiryDate: '到期日期',
    assetCode: '资产编号', name: '资产名称', averageMonthlySalary: '取样平均月工资', cappedMonthlySalary: '适用上限后的月基数', compensationMonths: '补偿月数', severanceAmount: '补偿金额' };
  const objects = [evidence, evidence.calculation, evidence.valuation && typeof evidence.valuation === 'object' ? (evidence.valuation as Record<string, unknown>).calculation : null]
    .filter((value): value is Record<string, unknown> => Boolean(value) && typeof value === 'object' && !Array.isArray(value));
  const entries = objects.flatMap(value => Object.entries(value).filter(([key, field]) => labels[key] && (typeof field === 'string' || typeof field === 'number')));
  return entries.length ? <dl className="grid gap-3 sm:grid-cols-2">{entries.map(([key, value], index) => <Hr09Value key={`${key}:${index}`} label={labels[key]}>{String(value)}</Hr09Value>)}</dl> : <p className="text-sm text-cf-subtle">请结合来源记录核对；尚未形成可展示的计算依据。</p>;
}

function ApprovalAction({ row, withdraw, onClose, onChanged }: { row: FinalSettlement; withdraw: boolean; onClose: () => void; onChanged: () => void }) {
  const [reason, setReason] = useState(''); const [uncertain, setUncertain] = useState(false);
  const [saved, setSaved] = useState<FinalSettlement>(); const recovery = useHr09Mutation();
  const recover = () => void recovery.run(async () => { setSaved(undefined); setSaved(await finalSettlementApi.detail(row.settlementId)); });
  return <Hr09FormDialog title={withdraw ? '撤回财务复核' : '提交财务复核'} panelClassName="final-settlements"
    description={row.settlementKind === 'REVERSAL'
      ? withdraw ? '待冲正审批确实结束后撤回，原已付结算及来源继续保留。' : '按原已入账金额的相反数提交独立财务复核，提交人与离职本人回避。实际反向收付完成后才恢复来源。'
      : withdraw ? '撤回申请保存后，待原审批确实结束再释放来源；财务已先办结时，以实际审批结果为准。' : '提交时重新核对并冻结来源，由独立财务复核，提交人与离职本人回避。'}
    submitText={withdraw ? '申请撤回' : '提交复核'} successText={withdraw ? '撤回申请已保存，请读取最新进度' : '结算已提交财务复核'}
    confirmation={withdraw ? '我已核对撤回原因。' : '我已核对本单来源和结算金额。'} blocked={uncertain || withdraw && !reason.trim()}
    onClose={onClose} onReload={recover} onSubmit={async () => {
      try { if (withdraw) await finalSettlementApi.withdraw(row, reason); else await finalSettlementApi.submit(row); onChanged(); }
      catch (error) { if (uncertainResult(error) || error instanceof Hr09Error && error.status === 409) setUncertain(true); throw error; }
    }}>
    <dl className="space-y-3"><Hr09Value label="员工">{row.employeeName}</Hr09Value><Hr09Value label="本单净额（元）">{row.netAmount}</Hr09Value></dl>
    {withdraw && <Hr09Textarea label="撤回原因" value={reason} maxLength={500} disabled={uncertain} onChange={event => setReason(event.target.value)} />}
    {uncertain && <Hr09Notice>操作结果尚待核对，已保留输入并停止重复提交。<div className="mt-2"><Button type="button" variant="outline" disabled={recovery.busy} onClick={recover}>读取已保存结果</Button></div></Hr09Notice>}
    {saved && <section aria-label="已保存审批结果" className="space-y-3 rounded-lg border border-[var(--cf-border)] p-3">
      <Hr09Value label="服务器审批状态">{saved.approval?.cancelPending ? '撤回处理中，来源继续冻结' : approvalStatuses[saved.approvalStatus] || saved.approvalStatus}</Hr09Value>
      <Hr09Value label="审批轮次">{saved.approval?.revision || '尚未提交'}</Hr09Value>
      <Button type="button" variant="outline" onClick={() => { onClose(); onChanged(); }}>返回最新结算详情</Button>
    </section>}
    <Hr09ErrorNotice error={recovery.error} />
  </Hr09FormDialog>;
}

function ReverseSettlement({ row, onClose, onOpen }: { row: FinalSettlement; onClose: () => void; onOpen: (id: string) => void }) {
  const [reason, setReason] = useState(''); const [uncertain, setUncertain] = useState(false);
  const [saved, setSaved] = useState<FinalSettlement>(); const recovery = useHr09Mutation();
  const recover = () => void recovery.run(async () => { setSaved(await finalSettlementApi.detail(row.settlementId)); });
  return <Hr09FormDialog title="建立离职结算冲正" panelClassName="final-settlements" submitText="建立冲正草稿" successText="冲正草稿已建立"
    description="系统按原已入账金额生成反向明细，并保留原结算。冲正须独立财务审批及实际反向收付，完成后才能重新结算。"
    confirmation="我已核对原单及冲正原因，已知悉还需独立审批和实际收付。" blocked={uncertain || recovery.busy || !reason.trim()}
    onClose={onClose} onReload={recover} onSubmit={async () => {
      try { onOpen(await finalSettlementApi.reverse(row, reason)); }
      catch (error) { if (uncertainResult(error) || error instanceof Hr09Error && error.status === 409) setUncertain(true); throw error; }
    }}>
    <dl className="grid gap-4 sm:grid-cols-2"><Hr09Value label="员工">{row.employeeName}</Hr09Value><Hr09Value label="原结算单号">{row.settlementNo}</Hr09Value><Hr09Value label="原净额（元）">{row.netAmount}</Hr09Value></dl>
    <Hr09Textarea label="冲正原因" value={reason} maxLength={500} disabled={uncertain} onChange={event => setReason(event.target.value)} />
    {uncertain && <Hr09Notice>建立结果尚待核对，原因已保留。请读取原单，查找已建立的冲正单。<div className="mt-2"><Button type="button" variant="outline" disabled={recovery.busy} onClick={recover}>读取已保存结果</Button></div></Hr09Notice>}
    {saved && <section aria-label="已保存冲正结果" className="space-y-3">{saved.reversal.reversalSettlementId
      ? <Button type="button" onClick={() => onOpen(saved.reversal.reversalSettlementId!)}>打开已建立的冲正单</Button>
      : <Hr09Notice>当前尚未查到冲正单，请重新读取确认后再处理。</Hr09Notice>}</section>}
    <Hr09ErrorNotice error={recovery.error} />
  </Hr09FormDialog>;
}

function SettlementDetail({ identifier, onClose, onChanged, onOpen }: { identifier: string; onClose: () => void; onChanged: () => void; onOpen: (id: string) => void }) {
  const { hasPermission } = useAuth(); const [uncertain, setUncertain] = useState(false); const [editing, setEditing] = useState<FinalSettlement>(); const [refreshingSource, setRefreshingSource] = useState(false);
  const [editorRevision, setEditorRevision] = useState(0); const [refreshUncertain, setRefreshUncertain] = useState(false);
  const [assetEditing, setAssetEditing] = useState<{ row: FinalSettlement; item: SettlementItem }>();
  const [assetReminding, setAssetReminding] = useState<{ row: FinalSettlement; item: SettlementItem }>();
  const [approvalAction, setApprovalAction] = useState<{ row: FinalSettlement; withdraw: boolean }>();
  const [fundsAction, setFundsAction] = useState<{ row: FinalSettlement; action: SettlementFundsAction }>();
  const [reversing, setReversing] = useState<FinalSettlement>();
  const detail = useHr09Resource(async signal => { const value = await finalSettlementApi.detail(identifier, signal); setUncertain(false); return value; }, [identifier]);
  const mutation = useHr09Mutation(); const row = detail.data; const busy = detail.loading || mutation.busy || Boolean(editing) || Boolean(assetEditing) || Boolean(assetReminding) || Boolean(approvalAction) || Boolean(fundsAction) || Boolean(reversing) || refreshingSource;
  const changed = () => { detail.refresh(); onChanged(); };
  return <><BaseDialog open title="离职结算详情" panelClassName="final-settlements" width="wide" onClose={() => { if (!busy) onClose(); }} hideCloseButton={busy} closeOnEscape={!busy}
    footer={<div className="flex flex-wrap justify-end gap-2"><Button variant="outline" disabled={busy} onClick={detail.refresh}>重新读取</Button>
      {row?.editable && hasPermission('hr:settlement:edit') && <Button variant="outline" disabled={busy || uncertain} onClick={() => setEditing(row)}>核定取样</Button>}
      {row?.editable && hasPermission('hr:settlement:calculate') && <Button disabled={busy || uncertain} onClick={() => void mutation.run(async () => { try { await finalSettlementApi.calculate(row); changed(); } catch (error) { setUncertain(true); throw error; } })}><Calculator size={16} className="mr-2" />重新计算</Button>}
      {row?.canSubmit && hasPermission(row.settlementKind === 'REVERSAL' ? 'hr:settlement:reverse' : 'hr:settlement:submit') && <Button type="button" disabled={busy || uncertain} onClick={() => setApprovalAction({ row, withdraw: false })}>提交财务复核</Button>}
      {row?.approval?.canWithdraw && hasPermission(row.settlementKind === 'REVERSAL' ? 'hr:settlement:reverse' : 'hr:settlement:submit') && <Button type="button" variant="outline" disabled={busy || uncertain} onClick={() => setApprovalAction({ row, withdraw: true })}>撤回审批</Button>}
      {row?.funds.canConfirm && hasPermission('hr:settlement:confirm') && <Button type="button" disabled={busy || uncertain} onClick={() => setFundsAction({ row, action: 'CONFIRM' })}>确认结算</Button>}
      {row?.funds.canReceipt && hasPermission('hr:settlement:receipt') && <Button type="button" disabled={busy || uncertain} onClick={() => setFundsAction({ row, action: 'RECEIPT' })}>登记实际收款</Button>}
      {row?.funds.canClose && hasPermission('hr:settlement:confirm') && <Button type="button" disabled={busy || uncertain} onClick={() => setFundsAction({ row, action: 'CLOSE' })}>核对并关闭</Button>}
      {row?.reversal.canCreate && hasPermission('hr:settlement:reverse') && <Button type="button" variant="outline" disabled={busy || uncertain} onClick={() => setReversing(row)}>建立冲正</Button>}
      <Button variant="outline" disabled={busy} onClick={onClose}>关闭</Button></div>}>
    {detail.loading ? <Hr09State loading title="正在读取结算详情" /> : detail.error ? <Hr09State error title="结算详情读取失败" description={detail.error.message} onRetry={detail.refresh} /> : row ? <div className="space-y-5">
      <dl className="grid gap-4 sm:grid-cols-2"><Hr09Value label="员工">{row.employeeName}</Hr09Value><Hr09Value label="结算单号">{row.settlementNo}</Hr09Value>
        <Hr09Value label="入职日期">{row.joinDate}</Hr09Value><Hr09Value label="离职日期">{row.relievingDate}</Hr09Value><Hr09Value label="结算状态">{statuses[row.status]}</Hr09Value><Hr09Value label="补偿政策">{row.ruleName || '尚未核定或政策已不可用'}</Hr09Value></dl>
      {(row.settlementKind === 'REVERSAL' || row.reversal.reversalSettlementId) && <section aria-label="冲正关系" className="space-y-3 rounded-lg border border-[var(--cf-border)] p-3">
        <h3 className="font-medium text-cf-title">{row.settlementKind === 'REVERSAL' ? '冲正单' : '原结算已有冲正单'}</h3>
        <p className="text-sm text-cf-body">{row.reversal.completed ? '冲正已完成，原结算记录保留，来源已恢复。' : '实际反向收付及来源恢复完成前，原结算继续有效。'}</p>
        {row.reversal.originalSettlementId && <div className="min-w-0 space-y-2"><p className="break-all text-sm text-cf-body">原结算单号：{row.reversal.originalSettlementNo}</p><Button type="button" variant="outline" disabled={busy} onClick={() => onOpen(row.reversal.originalSettlementId!)}>查看原结算</Button></div>}
        {row.reversal.reversalSettlementId && <Button type="button" variant="outline" disabled={busy} onClick={() => onOpen(row.reversal.reversalSettlementId!)}>查看关联冲正单</Button>}
      </section>}
      {row.editable && hasPermission('hr:settlement:edit') && <Button variant="outline" disabled={busy || uncertain} onClick={() => { setRefreshUncertain(false); setRefreshingSource(true); }}>核对离职来源</Button>}
      <Hr09Notice>{row.approval?.cancelPending ? '撤回处理中，来源继续冻结，请重新读取最新进度。' : approvalStatuses[row.approvalStatus] || row.approvalStatus}
        {row.approval && ` · 第 ${row.approval.revision} 轮`}{row.approvalStatus === 'APPROVED' && row.status === 'DRAFT' && '；仍待结算确认及实际收付款。'}
        {row.approval?.cancelOutcome === 'ALREADY_DECIDED' && row.approvalStatus === 'SUBMITTED' && '；财务已先办结，等待审批结果同步。'}</Hr09Notice>
      <section className="space-y-3" aria-label="本单取样核定"><h3 className="font-medium text-cf-title">本单取样核定</h3>
        {row.sampling ? <dl className="grid gap-4 sm:grid-cols-2"><Hr09Value label="取样月份">{row.sampling.months.join('、')}</Hr09Value><Hr09Value label="平均月份数">{row.sampling.averagingMonths}</Hr09Value>
          <Hr09Value label="核定原因">{row.sampling.reason}</Hr09Value><Hr09Value label="核定时间">{dateTimeText(row.sampling.reviewedTime)}</Hr09Value></dl> : <p className="text-sm text-cf-subtle">尚未核定取样月份及平均月份数。</p>}</section>
      {row.missingRequirements.length > 0 && <section aria-label="待补齐事项" className="space-y-2"><h3 className="font-medium text-cf-title">待补齐事项</h3>{row.missingRequirements.map((message, index) => <Hr09Notice key={index} danger>{message}</Hr09Notice>)}</section>}
      {row.calculated && <><Hr09Notice>{row.missingRequirements.length ? '来源尚未齐备，以下金额仅为当前已汇集部分。' : row.status === 'DRAFT' ? row.approvalStatus === 'APPROVED' ? '财务已审批以下金额，等待确认结算。' : '本次已汇集来源，金额仍为草稿结果。' : '以下为已确认金额。'}各项金额四舍五入到分后合计。</Hr09Notice>
        <dl className="grid gap-4 sm:grid-cols-2"><Hr09Value label="应付合计（元）">{row.totalPayable}</Hr09Value><Hr09Value label="经济补偿（元）">{row.severanceAmount}</Hr09Value>
          <Hr09Value label="应收合计（元）">{row.totalReceivable}</Hr09Value><Hr09Value label="资产损失（元）">{row.assetRecoveryCost}</Hr09Value><Hr09Value label="本单净额（元）">{row.netAmount}</Hr09Value></dl>
        <p className="text-xs leading-5 text-cf-subtle">净额 = 应付合计 + 经济补偿 − 应收合计 − 资产损失；正数表示向员工支付，负数表示向员工收取。</p></>}
      <SettlementFundsProgress row={row} />
      <section className="space-y-3" aria-label="结算来源明细"><h3 className="font-medium text-cf-title">来源明细</h3>
        {!row.items.length && <p className="text-sm text-cf-subtle">暂无已汇集明细。</p>}
        {row.items.map(item => <article key={item.itemId} className="space-y-3 rounded-lg border border-[var(--cf-border)] p-3"><div className="flex flex-wrap justify-between gap-2"><h4 className="min-w-0 break-words font-medium text-cf-title">{item.itemName}</h4><span className="text-sm tabular-nums text-cf-title">{item.confirmed ? `${item.amount} 元` : '金额待核定'}</span></div>
          <p className="text-xs text-cf-subtle">{({ PAYABLE: '应付', RECEIVABLE: '应收', ASSET: '资产回收', SEVERANCE: '经济补偿' })[item.itemType]} · {item.posted ? '已入账' : '未入账'}</p>
          {item.sourceBizType === 'OA_ASSET' && <><SettlementAssetEvidence evidence={item.evidence} />{row.editable && hasPermission('hr:settlement:edit') && <Button type="button" variant="outline" disabled={busy || uncertain} onClick={() => setAssetEditing({ row, item })}>核定资产处理</Button>}</>}
          {item.sourceBizType === 'OA_ASSET' && row.canRemindAssets && hasPermission('hr:settlement:edit') && <Button type="button" variant="outline" disabled={busy || uncertain} onClick={() => setAssetReminding({ row, item })}>提醒归还</Button>}
          <details><summary className="cursor-pointer text-sm text-cf-body">查看来源依据</summary><div className="mt-3"><Evidence evidence={item.evidence} /></div></details></article>)}</section>
      <dl><Hr09Value label={row.settlementKind === 'REVERSAL' ? '冲正原因' : '备注'}>{row.remark}</Hr09Value></dl>
      {uncertain && <Hr09Notice>操作结果尚待核对，请先重新读取结算详情。</Hr09Notice>}<Hr09ErrorNotice error={mutation.error} />
    </div> : <Hr09State error title="未取得完整结算详情" onRetry={detail.refresh} />}
  </BaseDialog>
    {approvalAction && <ApprovalAction row={approvalAction.row} withdraw={approvalAction.withdraw} onClose={() => setApprovalAction(undefined)} onChanged={changed} />}
    {assetReminding && <HrSettlementAssetReminder row={assetReminding.row} item={assetReminding.item} onClose={() => setAssetReminding(undefined)} />}
    {fundsAction && <SettlementFundsDialog row={fundsAction.row} action={fundsAction.action} onClose={() => setFundsAction(undefined)} onChanged={changed} />}
    {reversing && <ReverseSettlement row={reversing} onClose={() => setReversing(undefined)} onOpen={id => { onChanged(); onOpen(id); }} />}
    {assetEditing && <HrSettlementAssetEditor key={`${assetEditing.row.version}:${assetEditing.item.itemId}:${editorRevision}`} row={assetEditing.row} item={assetEditing.item} onClose={() => setAssetEditing(undefined)} onSaved={() => { setAssetEditing(undefined); changed(); }} onLoad={saved => { const item = saved.items.find(value => value.itemId === assetEditing.item.itemId); if (!item || !saved.editable) { setAssetEditing(undefined); changed(); } else { setAssetEditing({ row: saved, item }); setEditorRevision(value => value + 1); } }} />}
    {editing && <SamplingEditor key={`${editing.settlementId}:${editing.version}:${editorRevision}`} row={editing} onClose={() => setEditing(undefined)} onSaved={changed} onLoad={saved => { if (saved.editable) { setEditing(saved); setEditorRevision(value => value + 1); } else { setEditing(undefined); changed(); } }} />}
    {row && refreshingSource && <Hr09FormDialog title="核对离职来源" panelClassName="final-settlements" submitText="核对并更新来源" successText="离职来源已核对"
      description="读取原申请及员工档案中的日期。日期变化时清空本单旧政策、取样和计算，请重新核定。" confirmation="我已知悉日期变化会使旧核定失效。"
      blocked={refreshUncertain} onClose={() => setRefreshingSource(false)} onReload={() => { setRefreshingSource(false); changed(); }} onSubmit={async () => {
        try { await finalSettlementApi.refreshSource(row); changed(); } catch (error) { if (uncertainResult(error)) setRefreshUncertain(true); throw error; }
      }}><p className="text-sm text-cf-body">{row.employeeName} · 当前离职日期 {row.relievingDate}</p>{refreshUncertain && <Hr09Notice>更新结果尚待核对，请关闭此窗口后重新读取结算详情。</Hr09Notice>}</Hr09FormDialog>}
  </>;
}

function Workspace() {
  const [searchParams] = useSearchParams(); const linkedId = searchParams.get('settlementId');
  const { hasPermission } = useAuth(); const [query, setQuery] = useState<SettlementQuery>({ pageNum: 1, pageSize: 20 }); const [selected, setSelected] = useState<string | undefined>(linkedId && /^[1-9]\d{0,18}$/.test(linkedId) ? linkedId : undefined); const [creating, setCreating] = useState(false);
  const list = useHr09Resource(signal => finalSettlementApi.list(query, signal), [query]);
  return <div className="final-settlements"><Hr09Page title="离职结算" description="按本单核定政策和月份汇集工资、补偿及应收来源。" actions={<><Button variant="outline" disabled={list.loading} onClick={list.refresh}><RefreshCw size={16} className="mr-2" />刷新</Button>
    {hasPermission('hr:settlement:add') && <Button onClick={() => setCreating(true)}><Plus size={16} className="mr-2" />建立草稿</Button>}</>}>
    <div className="grid gap-4 rounded-lg border border-[var(--cf-border)] p-4 sm:grid-cols-2"><Hr09Input label="搜索结算单号" value={query.keyword || ''} maxLength={64} onChange={event => setQuery({ ...query, keyword: event.target.value || undefined, pageNum: 1 })} />
      <Hr09Select label="结算状态" value={query.status || ''} options={Object.entries(statuses).map(([value, label]) => ({ value, label }))} placeholder="全部状态" onChange={value => setQuery({ ...query, status: value || undefined, pageNum: 1 })} /></div>
    {list.loading ? <Hr09State loading title="正在读取结算列表" /> : list.error ? <Hr09State error title="结算列表读取失败" description={list.error.message} onRetry={list.refresh} /> : !list.data?.rows.length ? <Hr09State title="暂无离职结算" description="可调整查询条件，或从已通过的离职申请建立草稿。" /> : <div className="space-y-3">{list.data.rows.map(row => <article key={row.settlementId} className="settlement-row rounded-lg border border-[var(--cf-border)] p-4">
      <div className="min-w-0"><h2 className="break-words font-medium text-cf-title">{row.employeeName} · {row.settlementKind === 'REVERSAL' ? '冲正单' : row.reversal.completed ? '已冲正原单' : '结算单'}</h2><p className="mt-1 break-all text-xs text-cf-subtle">{row.settlementNo}</p></div>
      <div className="text-sm text-cf-body"><p>{row.relievingDate}</p><p className="mt-1 text-cf-subtle">{statuses[row.status]} · {row.approval?.cancelPending ? '撤回处理中' : approvalStatuses[row.approvalStatus] || row.approvalStatus} · {row.calculated ? row.missingRequirements.length ? '待补齐来源' : '已计算' : '待核定计算'}</p></div>
      <span className="text-sm tabular-nums text-cf-body">{row.calculated && !row.missingRequirements.length ? `${row.netAmount} 元` : '金额待核实'}</span><Button variant="outline" onClick={() => setSelected(row.settlementId)}>查看结算</Button>
    </article>)}</div>}
    {list.data && <ListResultFooter total={list.data.total} page={query.pageNum || 1} pageSize={20} onPageChange={pageNum => setQuery({ ...query, pageNum })} summary={`共 ${list.data.total} 张结算单`} />}
  </Hr09Page>{creating && <CreateDraft onClose={() => setCreating(false)} onSaved={id => { setCreating(false); setSelected(id); list.refresh(); }} />}
    {selected && <SettlementDetail key={selected} identifier={selected} onClose={() => setSelected(undefined)} onChanged={list.refresh} onOpen={setSelected} />}</div>;
}

export default function HrFinalSettlementPage() { return <Hr09Access permission="hr:settlement:list"><Workspace /></Hr09Access>; }
