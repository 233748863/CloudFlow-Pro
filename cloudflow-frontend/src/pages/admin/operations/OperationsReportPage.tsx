import React, { useState } from 'react';
import { useLocation } from 'react-router-dom';
import { addDays, format } from 'date-fns';
import { Button, Input } from '@/components/common';
import { Chart } from '@/components/charts/Chart';
import { oaGet, type OperationsReport, type ReportRow } from '@/services/api/oaOperations';
import { OperationsPage, Section, OpsTable, OpsSelect, Field, Metric, money, useRemote, useAccess } from '@/components/oa/operations/OperationsKit';
import { assetStatuses, standings, taskStatuses, today } from '@/components/oa/operations/RecordEditor';
import SupplierReportCharts from '@/components/oa/operations/SupplierReportCharts';

interface ReportSection { key: string; title: string; columns: [string, string][] }
const sections: Record<string, ReportSection[]> = {
  assets: [
    { key: 'distribution', title: '资产分布', columns: [['dimension', '维度'], ['groupName', '分组'], ['assetCount', '资产数'], ['purchaseAmount', '原值'], ['netBookValue', '净值']] },
    { key: 'depreciation', title: '期间已过账折旧', columns: [['period', '月份'], ['categoryName', '资产分类'], ['depreciationAmount', '折旧金额'], ['assetCount', '资产数']] },
    { key: 'repairs', title: '维修费用与停机', columns: [['assetName', '资产'], ['repairCount', '次数'], ['repairCost', '维修费用'], ['downtimeHours', '停机小时'], ['capitalizedAmount', '资本化金额']] },
  ],
  suppliers: [
    { key: 'standing', title: '供应商分档', columns: [['standing', '分档'], ['supplierCount', '供应商数']] },
    { key: 'scores', title: '周期评分趋势', columns: [['supplierName', '供应商'], ['periodType', '周期类型'], ['periodStart', '开始'], ['periodEnd', '结束'], ['totalScore', '得分'], ['standing', '分档']] },
    { key: 'expiry', title: '资质到期预警', columns: [['supplierName', '供应商'], ['certName', '证件'], ['expireDate', '到期日'], ['remainingDays', '剩余天数'], ['verifyStatus', '核验状态']] },
    { key: 'purchases', title: '采购金额与供应商评分', columns: [['supplierName', '供应商'], ['purchaseAmount', '采购金额'], ['purchaseCount', '采购次数'], ['score', '评分'], ['standing', '分档']] },
  ],
  projects: [
    { key: 'costs', title: '项目预算与成本', columns: [['projectName', '项目'], ['ownerName', '负责人'], ['budgetAmount', '预算'], ['actualCostAmount', '实际成本'], ['laborCostAmount', '人工'], ['purchaseCostAmount', '采购'], ['otherCostAmount', '其他'], ['billableAmount', '可计费'], ['billedAmount', '已开票'], ['grossMargin', '毛利'], ['grossMarginRate', '毛利率'], ['actualHours', '工时']] },
    { key: 'labor', title: '项目与活动工时', columns: [['projectName', '项目'], ['employeeName', '员工'], ['activityName', '活动'], ['hours', '工时'], ['billableHours', '计费工时']] },
    { key: 'filing', title: '期间工时填报', columns: [['projectName', '项目'], ['userName', '成员'], ['submittedFlag', '已提交工时']] },
    { key: 'gantt', title: '任务排期与基线', columns: [['projectName', '项目'], ['subject', '任务'], ['assigneeName', '负责人'], ['status', '状态'], ['progress', '进度'], ['plannedStart', '计划开始'], ['plannedEnd', '计划结束'], ['baselineStart', '基线开始'], ['baselineEnd', '基线结束']] },
  ],
  contracts: [
    { key: 'dashboard', title: '履约看板', columns: [['contractName', '合同'], ['counterpartyName', '相对方'], ['ownerName', '负责人'], ['fulfilmentStatus', '履约状态'], ['fulfilmentDeadline', '整体期限'], ['fulfilledTermCount', '已履约'], ['totalTermCount', '总条款'], ['fulfilmentProgress', '履约进度']] },
    { key: 'overdue', title: '超期条款', columns: [['contractName', '合同'], ['termContent', '条款'], ['responsibleName', '责任人'], ['deadlineDate', '截止日'], ['overdueDays', '逾期天数']] },
    ...['byType', 'byOwner', 'byCounterparty'].map((key, index) => ({ key, title: ['按类型履约统计', '按负责人履约统计', '按相对方履约统计'][index], columns: [['groupName', '分组'], ['contractCount', '合同数'], ['fulfilledContractCount', '全部履约合同'], ['fulfilledTermCount', '已履约条款'], ['totalTermCount', '条款数'], ['fulfilmentRate', '条款履约率']] as [string, string][] })),
  ],
  rfqs: [
    { key: 'savings', title: '按币种采购节省', columns: [['currency', '币种'], ['awardedCount', '定标数'], ['averageSavings', '单均节省'], ['totalSavings', '累计节省']] },
    { key: 'responses', title: '供应商响应率', columns: [['supplierName', '供应商'], ['invitedCount', '邀请数'], ['respondedCount', '报价数'], ['responseRate', '响应率']] },
    { key: 'nonLowest', title: '非最低价定标', columns: [['rfqNo', '询价号'], ['title', '询价'], ['supplierName', '中标供应商'], ['currency', '币种'], ['awardedAmount', '中标金额'], ['lowestAmount', '同币种最低金额'], ['awardReason', '定标理由'], ['awardTime', '定标时间']] },
  ],
};
const textValues: Record<string, string> = { ...assetStatuses, ...standings, ...taskStatuses, CATEGORY: '分类', DEPARTMENT: '部门', STATUS: '状态', MONTHLY: '月度', QUARTERLY: '季度', YEARLY: '年度', PENDING: '待核验', VERIFIED: '已核验', REJECTED: '未通过', EXPIRED: '已过期', ONGOING: '履约中', FULFILLED: '已履约', PARTIALLY_BREACHED: '部分违约', BREACHED: '整体违约' };
const display = (key: string, value: ReportRow[string]) => value == null ? '—' : key === 'submittedFlag' ? Number(value) ? '已提交' : '未提交' : key === 'grossMarginRate' ? (Number(value) * 100).toFixed(2) + '%' : /Rate$|Progress$|^progress$/.test(key) ? Number(value).toFixed(2) + '%' : /Amount$|Cost$|Value$|Savings$|Depreciation$|^grossMargin$/.test(key) ? money(value) : textValues[String(value)] || String(value);
function ReportTable({ section, rows, mobileDetails = false }: { section: ReportSection; rows: ReportRow[]; mobileDetails?: boolean }) {
  const [page, setPage] = useState(1); const pages = Math.max(1, Math.ceil(rows.length / 25)); const selectedPage = Math.min(page, pages);
  const selectedRows = rows.slice((selectedPage - 1) * 25, selectedPage * 25);
  return <Section title={section.title}>
    <div className={mobileDetails ? 'hidden md:block' : undefined}>
      <OpsTable headers={section.columns.map(column => column[1])} empty={!rows.length}>{selectedRows.map((row, index) => <tr key={index}>{section.columns.map(([key]) => <td key={key}>{display(key, row[key])}</td>)}</tr>)}</OpsTable>
    </div>
    {mobileDetails && <div className="space-y-3 md:hidden">
      {!rows.length && <p className="py-6 text-center text-sm text-cf-muted">暂无记录</p>}
      {selectedRows.map((row, index) => <article key={index} data-report-record={section.key} className="rounded-lg border border-[var(--cf-border)] bg-[var(--cf-surface-strong)] p-4">
        <dl className="grid grid-cols-[5.5rem_minmax(0,1fr)] gap-x-3 gap-y-2 text-sm">
          {section.columns.map(([key, label]) => <React.Fragment key={key}>
            <dt className="text-cf-muted">{label}</dt>
            <dd data-report-value={key} className="m-0 min-w-0 whitespace-normal text-cf-title [overflow-wrap:anywhere]">{display(key, row[key])}</dd>
          </React.Fragment>)}
        </dl>
      </article>)}
    </div>}
    {pages > 1 && <div className="oa-ops-actions mt-3"><Button variant="outline" disabled={selectedPage === 1} onClick={() => setPage(selectedPage - 1)}>上一页</Button><span>{selectedPage} / {pages} 页 · {rows.length} 条</span><Button variant="outline" disabled={selectedPage === pages} onClick={() => setPage(selectedPage + 1)}>下一页</Button></div>}
  </Section>;
}
export default function OperationsReportPage() {
  const can = useAccess(); const location = useLocation(); const available = [ ['assets', '资产经营', 'oa:asset:report'], ['suppliers', '供应商经营', 'oa:supplier:report'], ['projects', '项目工时', 'oa:project:report'], ['contracts', '合同履约', 'oa:contract:report'], ['rfqs', '询价合规', 'oa:rfq:report'] ].filter(item => can(item[2]) && (item[0] !== 'rfqs' || can('oa:rfq:comparison')));
  const [chosen, setChosen] = useState(location.pathname.split('/').pop() || ''); const tab = available.some(item => item[0] === chosen) ? chosen : available[0]?.[0] || '';
  const [from, setFrom] = useState(format(addDays(new Date(), -30), 'yyyy-MM-dd')); const [to, setTo] = useState(today());
  const data = useRemote<OperationsReport>(() => tab ? oaGet<OperationsReport>('/reports/' + tab + (tab === 'projects' && !can('oa:activity-cost:list') ? '/effort' : ''), tab === 'contracts' ? {} : { from, to }) : Promise.resolve({}), [tab, from, to]);
  const report = data.data || {};
  const chartRows = tab === 'assets' ? (report.distribution || []).filter(row => row.dimension === 'CATEGORY').map(row => ({ name: String(row.groupName), value: Number(row.assetCount) })) : tab === 'suppliers' ? (report.standing || []).map(row => ({ name: textValues[String(row.standing)] || '未评分', value: Number(row.supplierCount) })) : tab === 'projects' ? (report.labor || []).map(row => ({ name: String(row.projectName) + ' / ' + row.employeeName + ' / ' + row.activityName, value: Number(row.hours) })) : tab === 'rfqs' ? (report.responses || []).map(row => ({ name: String(row.supplierName), value: Number(row.responseRate) })) : (report.dashboard || []).map(row => ({ name: String(row.contractName), value: Number(row.fulfilmentProgress) }));
  const summary = report.summary?.[0];
  return <OperationsPage title="OA 经营报表" description="按授权范围汇总资产、供应商、项目、履约与询价；金额保持各业务精度，外币单独统计。" loading={data.loading} error={data.error} refresh={data.refresh} filters={<div className="flex flex-wrap items-end gap-3"><Field label="业务报表"><OpsSelect label="业务报表" value={tab} options={Object.fromEntries(available.map(item => [item[0], item[1]]))} onChange={setChosen} /></Field>{tab === 'contracts' ? <p className="text-sm text-cf-muted">按当前履约情况统计</p> : <><Field label="开始日期"><Input type="date" value={from} onChange={event => { if (event.target.value) setFrom(event.target.value); }} /></Field><Field label="结束日期"><Input type="date" value={to} onChange={event => { if (event.target.value) setTo(event.target.value); }} /></Field></>}</div>}>
    {!available.length && <p>当前账号没有经营报表查看权限。</p>}
    {summary && <div className="grid gap-3 md:grid-cols-3">{(tab === 'assets' ? [['assetCount', '资产数量'], ['purchaseAmount', '资产原值'], ['accumulatedDepreciation', '累计折旧'], ['netBookValue', '账面净值']] : [['rfqCount', '询价数量'], ['averageInvited', '平均邀请数'], ['averageResponseRate', '平均响应率'], ['awardedCount', '已定标数量']]).map(([key, label]) => <Metric key={key} label={label} value={display(key, summary[key])} />)}</div>}
    {tab === 'suppliers' && <SupplierReportCharts report={report} />}
    {tab !== 'suppliers' && !!chartRows.length && <Section title={available.find(item => item[0] === tab)?.[1]}><Chart seriesCount={1} dataTable={{ columns: ['名称', '数值'], rows: chartRows.map(item => [item.name, item.value]) }} ariaLabel="业务分布" style={{ height: 300 }} option={{ tooltip: { trigger: 'axis' }, grid: { left: 48, right: 24, bottom: 72, top: 24 }, xAxis: { type: 'category', data: chartRows.map(item => item.name), axisLabel: { rotate: chartRows.length > 5 ? 25 : 0, width: 110, overflow: 'truncate' } }, yAxis: { type: 'value' }, dataZoom: chartRows.length > 12 ? [{ type: 'slider' }] : [], series: [{ type: 'bar', data: chartRows.map(item => item.value), barMaxWidth: 42 }] }} /></Section>}
    {tab === 'suppliers' && !!report.purchases?.length && <Section title="采购金额与评分分布"><Chart seriesCount={1} dataTable={{ columns: ['供应商', '评分', '采购金额'], rows: report.purchases.filter(row => row.score != null).map(row => [String(row.supplierName), String(row.score), String(row.purchaseAmount)]) }} ariaLabel="供应商采购金额与评分" style={{ height: 300 }} option={{ tooltip: { trigger: 'item' }, xAxis: { type: 'value', name: '评分', min: 0, max: 100 }, yAxis: { type: 'value', name: '采购金额' }, series: [{ type: 'scatter', symbolSize: 14, data: report.purchases.filter(row => row.score != null).map(row => ({ name: String(row.supplierName), value: [Number(row.score), Number(row.purchaseAmount)] })) }] }} /></Section>}
    {(sections[tab] || []).filter(section => report[section.key]).map(section => <ReportTable key={tab + section.key} section={section} rows={report[section.key] || []} mobileDetails={tab === 'suppliers' || tab === 'projects' || tab === 'rfqs'} />)}
  </OperationsPage>;
}
