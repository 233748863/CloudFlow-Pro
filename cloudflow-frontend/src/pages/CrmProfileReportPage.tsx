import React, { useState } from 'react';
import { Chart } from '@/components/charts/Chart';
import { crmOperations } from '@/services/api/crm/operations';
import { useDict } from '@/hooks/useDict';
import { Funnel, OperationsPage, OpsSelect, OpsTable, qualificationStatuses, Section, useRemote } from '@/components/crm/operations/OperationsKit';

export default function CrmProfileReportPage() {
  const [dimension, setDimension] = useState('territory');
  const source = useRemote(() => crmOperations.profileReport(dimension), [dimension]);
  const segment = useDict('crm_market_segment');
  const funnelStatuses = { ...qualificationStatuses, CONVERTED: '已转化' };
  const rows = (source.data?.distribution || []).map(row => ({ ...row, name: dimension === 'segment' ? segment.getLabel(row.name) || row.name : row.name }));
  return <OperationsPage title="客户分层与资质漏斗" description="在当前数据权限内观察线索质量和客户分布，已转化线索独立统计。" loading={source.loading} error={source.error} refresh={source.refresh} filters={<div className="max-w-xs"><OpsSelect label="分布维度" value={dimension} options={{ territory: '销售区域', segment: '细分市场', industry: '行业', score: '线索评分' }} onChange={setDimension} /></div>}>
    <div className="grid gap-5 xl:grid-cols-2"><Section title="资质状态分布"><Funnel title="线索资质分布" values={Object.entries(funnelStatuses).map(([status, name]) => ({ name, value: source.data?.funnel[status] || 0 }))} /></Section><Section title="线索与客户分布"><Chart seriesCount={dimension === 'score' ? 1 : 2} dataTable={{ columns: ['分层', '线索', ...(dimension === 'score' ? [] : ['客户'])], rows: rows.map(row => [row.name, row.leads, ...(dimension === 'score' ? [] : [row.customers])]) }} ariaLabel="客户分层统计" style={{ height: 300 }} option={{ tooltip: { trigger: 'axis' }, legend: { bottom: 0 }, grid: { top: 20, left: 45, right: 20, bottom: 65 }, xAxis: { type: 'category', data: rows.map(row => row.name), axisLabel: { rotate: rows.length > 8 ? 35 : 0 } }, yAxis: { type: 'value', minInterval: 1 }, dataZoom: rows.length > 12 ? [{ type: 'inside' }] : [], series: [{ name: '线索', type: 'bar', data: rows.map(row => row.leads) }, ...(dimension === 'score' ? [] : [{ name: '客户', type: 'bar', data: rows.map(row => row.customers) }])] }} /></Section></div>
    <OpsTable headers={['分层', '线索数', '客户数']} empty={!source.loading && !rows.length}>{rows.map(row => <tr key={row.name}><td>{row.name}</td><td>{row.leads}</td><td>{dimension === 'score' ? '不适用' : row.customers}</td></tr>)}</OpsTable>
  </OperationsPage>;
}
