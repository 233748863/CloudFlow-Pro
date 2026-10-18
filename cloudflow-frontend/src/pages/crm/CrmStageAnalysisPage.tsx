import React, { useState } from 'react';
import { Button, Input } from '@/components/common';
import { Field, Funnel, money, OperationsPage, OpsTable, Section, useRemote } from '@/components/crm/operations/OperationsKit';
import { useAuth } from '@/context/AuthContext';
import { opportunityStages } from '@/services/api/crm/opportunityStages';
import { formatDateTimeDisplay } from '@/utils/dateFormat';
import '@/components/crm/opportunity/opportunity.css';

const dayText = (seconds: number | string | null) => seconds == null ? '无完整区间' : `${(Number(seconds) / 86400).toFixed(2)} 天`;

export default function CrmStageAnalysisPage() {
  const { hasPermission } = useAuth();
  const allowed = hasPermission('crm:opportunity:stage-analysis');
  const [dates, setDates] = useState({ startDate: '', endDate: '' });
  const [query, setQuery] = useState<{ startDate?: string; endDate?: string }>({});
  const remote = useRemote(() => allowed ? opportunityStages.analysis({ ...query, currency: 'CNY' }) : Promise.reject(new Error('无权查看阶段分析')), [allowed, query]);
  const report = remote.data;
  if (!allowed) return <p role="alert">无权查看阶段分析。</p>;
  return <div className="crm-opportunity-panel"><OperationsPage title="销售阶段分析" description="按当前可见客户范围统计，历史转化按进入期去重；金额仅统计人民币。" loading={remote.loading} error={remote.error} refresh={remote.refresh}
    filters={<form className="grid gap-3 sm:grid-cols-[1fr_1fr_auto] items-end" onSubmit={event => { event.preventDefault(); setQuery({ startDate: dates.startDate || undefined, endDate: dates.endDate || undefined }); }}>
      <Field label="进入期开始"><Input type="date" value={dates.startDate} onChange={event => setDates(previous => ({ ...previous, startDate: event.target.value }))} /></Field>
      <Field label="进入期结束"><Input type="date" value={dates.endDate} onChange={event => setDates(previous => ({ ...previous, endDate: event.target.value }))} /></Field>
      <Button type="submit" disabled={remote.loading}>查询分析</Button>
    </form>}>
    {report && <>
      <p className="crm-ops-warning">进入期 {report.startDate} 至 {report.endDate}（默认90天，最多366天）；统计时点 {formatDateTimeDisplay(report.asOf)}。当前分布与预测为此时点快照，不受进入期筛选；历史完整时长仅统计进入期内开始且已退出的区间。</p>
      <Section title="当前进行中商机分布"><Funnel title="当前进行中商机数量" values={report.stages.filter(stage => !stage.terminal).map(stage => ({ name: stage.stageName, value: stage.currentCount }))} /><p className="text-sm text-cf-muted">图中数值为各阶段当前商机数量，赢单与丢单在表格单列；此分布不表示历史转化率。</p></Section>
      <Section title="阶段明细（CNY / 元）">
        <p id="stage-analysis-scroll-hint" className="mb-3 text-sm text-cf-muted">左右滑动查看全部 9 列；键盘聚焦表格后可用左右方向键。</p>
        <OpsTable tableClassName="crm-stage-analysis-table" ariaLabel="阶段明细（人民币，单位元）" scrollHintId="stage-analysis-scroll-hint" headers={['阶段', '当前商机', '当前预计金额', '加权金额', '完整区间 / 平均停留', '未退出区间 / 已停留合计', '期初无历史', '转化数 / 队列数 / 转化率', '队列赢单 / 丢单']}>
        {report.stages.map(stage => <tr key={stage.stage}><td><strong>{stage.stageName}</strong><small>{stage.enabled ? '' : '已停用 · '}{stage.terminal ? '终态' : '进行中'}</small></td><td>{stage.currentCount}</td><td>{money(stage.currentAmount)}</td><td>{money(stage.weightedForecast)}<small>{stage.terminal ? '终态金额，非进行中预测' : '预计金额 × 赢率 ÷ 100'}</small></td><td>{stage.completedCount} 次<small>{dayText(stage.averageCompletedSeconds)}</small></td><td>{stage.incompleteCount} 次<small>{dayText(stage.incompleteSeconds)}</small></td><td>{stage.untrackedCount}</td><td>{stage.convertedCount} / {stage.cohortCount}<small>{stage.conversionRate == null ? '不计算' : `${stage.conversionRate}%`}</small></td><td>{stage.wonCount} / {stage.lostCount}</td></tr>)}
      </OpsTable></Section>
      <p className="text-sm text-cf-muted">队列 = 进入期内曾进入该阶段的去重商机；转化数 = 队列中此后从该阶段向前推进或赢单的商机数。循环回退分次计完整时长，未退出区间与无历史期初记录不计入完整平均；未退出时长为合计天数。</p>
    </>}
  </OperationsPage></div>;
}
