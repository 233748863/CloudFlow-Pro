import React, { useState } from 'react';
import { Chart } from '@/components/charts/Chart';
import { LineChart } from '@/components/charts/presets';
import type { OperationsReport } from '@/services/api/oaOperations';
import { Field, OpsSelect, Section } from './OperationsKit';
import { standings } from './RecordEditor';

const periods: Record<string, string> = { MONTHLY: '月度', QUARTERLY: '季度', YEARLY: '年度' };

export default function SupplierReportCharts({ report }: { report: OperationsReport }) {
  const [chosenSupplier, setChosenSupplier] = useState('');
  const [chosenPeriod, setChosenPeriod] = useState('MONTHLY');
  const slices = (report.standing || []).map(row => ({
    standing: String(row.standing || ''),
    name: standings[String(row.standing) as keyof typeof standings] || '未评分',
    value: Number(row.supplierCount),
  }));
  const total = slices.reduce((count, slice) => count + slice.value, 0);
  const scores = report.scores || [];
  const suppliers = Object.fromEntries(scores.map(row => [String(row.supplierId), String(row.supplierName)]));
  const supplierId = Object.hasOwn(suppliers, chosenSupplier) ? chosenSupplier : Object.keys(suppliers)[0] || '';
  const supplierScores = scores.filter(row => String(row.supplierId) === supplierId);
  const availablePeriods = Object.fromEntries(Object.entries(periods).filter(([period]) => supplierScores.some(row => row.periodType === period)));
  const period = Object.hasOwn(availablePeriods, chosenPeriod) ? chosenPeriod : Object.keys(availablePeriods)[0] || '';
  const trend = supplierScores.filter(row => row.periodType === period)
    .sort((left, right) => String(left.periodEnd).localeCompare(String(right.periodEnd)) || String(left.periodStart).localeCompare(String(right.periodStart)));

  return <>
    <Section title="供应商分档分布图">
      <Chart ariaLabel="供应商分档饼图" seriesCount={1} height={300} empty={total === 0}
        dataTable={{ columns: ['分档', '供应商数', '占比'], rows: slices.map(slice => [slice.name, slice.value, total ? (slice.value / total * 100).toFixed(2) + '%' : '—']) }}
        option={theme => ({
          tooltip: { trigger: 'item', formatter: '{b}：{c}（{d}%）' },
          legend: { type: 'scroll', bottom: 0 },
          series: [{ type: 'pie', radius: '65%', center: ['50%', '43%'], label: { show: false },
            data: slices.map(slice => ({ name: slice.name, value: slice.value,
              itemStyle: { color: slice.standing === 'ELIMINATED' ? theme.critical : slice.standing === 'WATCH' ? theme.warning
                : ['EXCELLENT', 'QUALIFIED'].includes(slice.standing) ? theme.good : theme.subtle } })),
          }],
        })} />
    </Section>
    <Section title="供应商评分趋势图">
      <div className="mb-4 grid min-w-0 gap-3 sm:grid-cols-2">
        <Field label="评分供应商"><OpsSelect label="评分供应商" value={supplierId} options={suppliers}
          empty={supplierId ? undefined : '暂无已确认评分'} onChange={setChosenSupplier} disabled={!supplierId} /></Field>
        <Field label="评分周期"><OpsSelect label="评分周期" value={period} options={availablePeriods}
          empty={period ? undefined : '暂无评分周期'} onChange={setChosenPeriod} disabled={!period} /></Field>
      </div>
      <LineChart ariaLabel="供应商周期评分折线图" height={300} categories={trend.map(row => String(row.periodEnd))}
        series={[{ name: '评分', values: trend.map(row => Number(row.totalScore)) }]}
        categoryAxisName="周期结束日" valueAxisName="评分" max={100} valueFormatter={value => value.toFixed(2)} />
    </Section>
  </>;
}
