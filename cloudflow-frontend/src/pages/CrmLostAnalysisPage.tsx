import React, { useState } from 'react';
import Decimal from 'decimal.js';
import { formatDecimalAmount } from '@/utils/amountValue';
import { BaseDialog, Button, Input, Textarea } from '@/components/common';
import { Chart } from '@/components/charts/Chart';
import { crmOperations, type LostReason, type Competitor, type LostReport } from '@/services/api/crm/operations';
import { Field, labelOf, money, OperationsPage, OpsSelect, OpsTable, Section, useAccess, useMutation, useRemote } from '@/components/crm/operations/OperationsKit';

const categories = { PRICE: '价格', PRODUCT: '产品', SERVICE: '服务', COMPETITOR: '竞品', TIMING: '时机', BUDGET: '预算', RELATIONSHIP: '客户关系', OTHER: '其他' };
function ReasonRanking({ reasons, dimension }: { reasons: LostReport['reasons']; dimension: 'count' | 'amount' }) {
  const amount = dimension === 'amount';
  const ranked = [...reasons].sort((left, right) => (amount
    ? new Decimal(right.amount).comparedTo(left.amount)
    : right.count - left.count) || left.reasonId - right.reasonId).slice(0, 10);
  const title = amount ? '丢单原因金额排名（前10项）' : '丢单原因次数排名（前10项）';
  const seriesName = amount ? '丢单金额' : '丢单次数';
  return <Section title={title}>
    <Chart seriesCount={1} empty={ranked.length === 0}
      dataTable={{ columns: ['丢单原因', amount ? '丢单金额（元）' : '丢单次数（单）'], rows: ranked.map(row => [row.reasonName, amount ? formatDecimalAmount(row.amount, 2) : row.count]) }}
      ariaLabel={amount ? '丢单原因金额排名，前10项，单位元' : '丢单原因次数排名，前10项，单位单'}
      style={{ height: 280 }} option={{
        tooltip: { trigger: 'axis', valueFormatter: (value: unknown) => amount ? formatDecimalAmount(String(value), 2) + ' 元' : String(value) + ' 单' },
        grid: { left: 8, right: 35, top: 25, bottom: 25, containLabel: true },
        xAxis: { type: 'value', name: amount ? '元' : '单', minInterval: amount ? undefined : 1 },
        yAxis: { type: 'category', inverse: true, data: ranked.map(row => row.reasonName), axisLabel: { width: 110, overflow: 'truncate' } },
        series: [{ name: seriesName, type: 'bar', data: ranked.map(row => amount ? Number(row.amount) : row.count) }],
      }} />
  </Section>;
}

export function LostCharts({ report }: { report?: LostReport }) {
  return <div className="grid gap-5 xl:grid-cols-2">
    <ReasonRanking reasons={report?.reasons || []} dimension="count" />
    <ReasonRanking reasons={report?.reasons || []} dimension="amount" />
    <Section title="竞争对手输赢">
      <Chart seriesCount={2} empty={!report?.competitors.length}
        dataTable={{ columns: ['竞争对手', '赢单', '丢单'], rows: (report?.competitors || []).map(row => [row.competitorName, row.wonCount, row.lostCount]) }}
        ariaLabel="竞争对手输赢" style={{ height: 280 }} option={{
          tooltip: { trigger: 'axis' }, legend: { bottom: 0 }, grid: { bottom: 65 },
          xAxis: { type: 'category', data: report?.competitors.map(row => row.competitorName) || [] },
          yAxis: { type: 'value', minInterval: 1 },
          series: [{ name: '赢单', type: 'bar', data: report?.competitors.map(row => row.wonCount) || [] }, { name: '丢单', type: 'bar', data: report?.competitors.map(row => row.lostCount) || [] }],
        }} />
    </Section>
    <Section title="月度丢单金额">
      <Chart seriesCount={1} empty={!report?.trend.length}
        dataTable={{ columns: ['月份', '丢单金额（元）'], rows: (report?.trend || []).map(row => [row.month, formatDecimalAmount(row.amount, 2)]) }}
        ariaLabel="月度丢单金额" style={{ height: 280 }} option={{
          tooltip: { trigger: 'axis' }, grid: { left: 65, bottom: 35 },
          xAxis: { type: 'category', data: report?.trend.map(row => row.month) || [] },
          yAxis: { type: 'value', name: '元' },
          series: [{ name: '丢单金额', type: 'line', data: report?.trend.map(row => Number(row.amount)) || [] }],
        }} />
    </Section>
  </div>;
}

export default function CrmLostAnalysisPage() {
  const can = useAccess();
  const mutation = useMutation();
  const [tab, setTab] = useState(can('crm:lost:report') ? 'report' : 'reasons');
  const [start, setStart] = useState('');
  const [end, setEnd] = useState('');
  const reasons = useRemote(crmOperations.lostReasons);
  const competitors = useRemote(crmOperations.competitors);
  const report = useRemote(() => can('crm:lost:report') ? crmOperations.lostReport({ start: start || undefined, end: end || undefined }) : Promise.resolve(undefined), [start, end]);
  const [reason, setReason] = useState<LostReason>();
  const [competitor, setCompetitor] = useState<Competitor>();
  const refresh = () => { reasons.refresh(); competitors.refresh(); report.refresh(); };
  return <OperationsPage title="丢单分析与竞争情报" description="从结构化丢单原因找改进方向，保留主管审批与竞争信息。" loading={tab === 'report' ? report.loading : tab === 'reasons' ? reasons.loading : competitors.loading} error={report.error || reasons.error || competitors.error} refresh={refresh} actions={can('crm:lost:edit') && <><Button variant="outline" onClick={() => setCompetitor({ competitorCode: '', competitorName: '', threatLevel: 'MEDIUM', status: 'ACTIVE' })}>新增竞对</Button><Button onClick={() => setReason({ reasonCode: '', reasonName: '', reasonCategory: 'OTHER', status: 'ACTIVE', sortNo: 0 })}>新增原因</Button></>} filters={<div className="grid gap-3 md:grid-cols-3"><OpsSelect label="分析视图" value={tab} options={{ ...(can('crm:lost:report') ? { report: '丢单报表' } : {}), reasons: '丢单原因', competitors: '竞争对手' }} onChange={setTab} />{tab === 'report' && <><Input type="date" aria-label="统计开始日期" value={start} onChange={event => setStart(event.target.value)} /><Input type="date" aria-label="统计结束日期" value={end} onChange={event => setEnd(event.target.value)} /></>}</div>}>
    {tab === 'report' && <><LostCharts report={report.data} /><OpsTable headers={['丢单原因', '丢单数', '丢单金额']} empty={!report.loading && !report.data?.reasons.length}>{report.data?.reasons.map(row => <tr key={row.reasonId}><td>{row.reasonName}</td><td>{row.count}</td><td>{money(row.amount)}</td></tr>)}</OpsTable></>}
    {tab === 'reasons' && <OpsTable headers={['原因', '编码', '分类', '排序', '状态', '操作']} empty={!reasons.loading && !reasons.data?.rows.length}>{reasons.data?.rows.map(row => <tr key={row.reasonId}><td>{row.reasonName}</td><td>{row.reasonCode}</td><td>{labelOf(categories, row.reasonCategory)}</td><td>{row.sortNo}</td><td>{row.status === 'ACTIVE' ? '启用' : '停用'}</td><td>{can('crm:lost:edit') && <Button variant="ghost" onClick={() => setReason({ ...row })}>编辑</Button>}</td></tr>)}</OpsTable>}
    {tab === 'competitors' && <OpsTable headers={['竞争对手', '行业', '优势 / 劣势', '威胁程度', '状态', '操作']} empty={!competitors.loading && !competitors.data?.rows.length}>{competitors.data?.rows.map(row => <tr key={row.competitorId}><td>{row.competitorName}</td><td>{row.industry || '—'}</td><td className="max-w-xs whitespace-normal">{row.strength || '—'} / {row.weakness || '—'}</td><td>{labelOf({ HIGH: '高', MEDIUM: '中', LOW: '低' }, row.threatLevel)}</td><td>{row.status === 'ACTIVE' ? '启用' : '停用'}</td><td>{can('crm:lost:edit') && <Button variant="ghost" onClick={() => setCompetitor({ ...row })}>编辑</Button>}</td></tr>)}</OpsTable>}
    {reason && <BaseDialog open title="丢单原因" onClose={() => setReason(undefined)} footer={<Button disabled={mutation.busy || !reason.reasonName.trim() || !reason.reasonCode.trim()} onClick={() => void mutation.run(() => crmOperations.saveLostReason(reason), () => { setReason(undefined); refresh(); })}>保存</Button>}><div className="grid gap-4"><Field label="名称"><Input value={reason.reasonName} onChange={event => setReason({ ...reason, reasonName: event.target.value })} /></Field><Field label="编码"><Input value={reason.reasonCode} onChange={event => setReason({ ...reason, reasonCode: event.target.value })} /></Field><Field label="分类"><OpsSelect label="原因分类" value={reason.reasonCategory} options={categories} onChange={reasonCategory => setReason({ ...reason, reasonCategory })} /></Field><Field label="排序"><Input type="number" value={reason.sortNo || 0} onChange={event => setReason({ ...reason, sortNo: Number(event.target.value) })} /></Field><Field label="状态"><OpsSelect label="原因状态" value={reason.status} options={{ ACTIVE: '启用', INACTIVE: '停用' }} onChange={status => setReason({ ...reason, status })} /></Field><Field label="备注"><Textarea value={reason.remark || ''} onChange={event => setReason({ ...reason, remark: event.target.value })} /></Field></div></BaseDialog>}
    {competitor && <BaseDialog open title="竞争对手" onClose={() => setCompetitor(undefined)} footer={<Button disabled={mutation.busy || !competitor.competitorName.trim() || !competitor.competitorCode.trim()} onClick={() => void mutation.run(() => crmOperations.saveCompetitor(competitor), () => { setCompetitor(undefined); refresh(); })}>保存</Button>}><div className="grid gap-4">{([['competitorName', '名称'], ['competitorCode', '编码'], ['industry', '行业'], ['website', '网站']] as const).map(([field, label]) => <Field key={field} label={label}><Input value={competitor[field] || ''} onChange={event => setCompetitor({ ...competitor, [field]: event.target.value })} /></Field>)}<Field label="优势"><Textarea value={competitor.strength || ''} onChange={event => setCompetitor({ ...competitor, strength: event.target.value })} /></Field><Field label="劣势"><Textarea value={competitor.weakness || ''} onChange={event => setCompetitor({ ...competitor, weakness: event.target.value })} /></Field><Field label="威胁程度"><OpsSelect label="威胁程度" value={competitor.threatLevel} options={{ HIGH: '高', MEDIUM: '中', LOW: '低' }} onChange={threatLevel => setCompetitor({ ...competitor, threatLevel })} /></Field><Field label="状态"><OpsSelect label="竞对状态" value={competitor.status} options={{ ACTIVE: '启用', INACTIVE: '停用' }} onChange={status => setCompetitor({ ...competitor, status })} /></Field></div></BaseDialog>}
  </OperationsPage>;
}
