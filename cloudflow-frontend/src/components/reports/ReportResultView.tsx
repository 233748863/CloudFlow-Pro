import React from 'react';
import Decimal from 'decimal.js';
import type { EChartsCoreOption } from 'echarts/core';
import { Chart, type ChartTheme } from '@/components/charts/Chart';
import { aggregateNames, type ChartType, type ReportColumn, type ReportResult, type ReportRow, type ReportStyle } from '@/services/api/report';

const rowValue = (row: ReportRow, key: string) => row[key as keyof ReportRow];
const columnTitle = (column: ReportColumn) => `${column.title}${column.aggregate ? ` · ${aggregateNames[column.aggregate]}` : ''}${column.unit ? `（${column.unit}）` : ''}`;
const dimensionLabel = (row: ReportRow, key: string) => rowValue(row, key.replace('dimension', 'label')) ?? rowValue(row, key) ?? '未填写';

export function reportValue(row: ReportRow, column: ReportColumn): string {
  if (!column.aggregate) return dimensionLabel(row, column.key);
  const value = rowValue(row, column.key);
  if (value == null) return '—';
  const decimal = new Decimal(value);
  return column.aggregate === 'COUNT' ? decimal.toFixed(0) : decimal.toFixed(Math.max(2, decimal.decimalPlaces()));
}

function DataTable({ result }: { result: ReportResult }) {
  return <div className="overflow-auto"><table className="report-data-table"><caption className="sr-only">查询结果精确数据</caption><thead><tr>{result.columns.map(column => <th scope="col" key={column.key}>{columnTitle(column)}</th>)}</tr></thead><tbody>
    {result.rows.map((row, index) => <tr key={index}>{result.columns.map(column => <td className={column.aggregate ? 'tabular-nums' : ''} key={column.key}>{reportValue(row, column)}</td>)}</tr>)}
  </tbody></table></div>;
}

export function ReportResultView({ result, type, style, title }: { result: ReportResult; type: ChartType; style: ReportStyle; title: string }) {
  const missingDates = result.missingDates;
  const measures = result.columns.filter(column => column.aggregate);
  const dimensions = result.columns.filter(column => !column.aggregate);
  const option = (theme: ChartTheme): EChartsCoreOption => {
    const colors = style.palette === 'SUCCESS' ? [theme.good, ...theme.colors] : style.palette === 'WARNING' ? [theme.warning, ...theme.colors] : style.palette === 'NEUTRAL' ? [theme.subtle, ...theme.colors] : theme.colors;
    const labels = result.rows.map(row => dimensions.map(column => dimensionLabel(row, column.key)).join(' / '));
    const base: EChartsCoreOption = { animation: !window.matchMedia('(prefers-reduced-motion: reduce)').matches, animationDuration: 150, color: colors,
      tooltip: { trigger: 'item', renderMode: 'richText', confine: true }, legend: { show: style.showLegend, type: 'scroll', textStyle: { color: theme.text } } };
    if (type === 'PIE' || type === 'FUNNEL') return { ...base, series: [{ type: type === 'PIE' ? 'pie' : 'funnel', top: 50, bottom: 30, left: 30, right: 30,
      radius: type === 'PIE' ? ['35%', '65%'] : undefined, label: { show: style.showValues, color: theme.text },
      data: result.rows.map((row, index) => ({ name: labels[index], value: Number(rowValue(row, measures[0].key) ?? 0) })) }] };
    return { ...base, tooltip: { trigger: 'axis', renderMode: 'richText', confine: true }, grid: { left: 24, right: 24, top: 52, bottom: labels.length > 20 ? 64 : 32, containLabel: true },
      xAxis: { type: 'category', data: labels, axisLabel: { color: theme.text, width: 96, overflow: 'truncate' } },
      yAxis: { type: 'value', axisLabel: { color: theme.subtle }, splitLine: { lineStyle: { color: theme.border } } },
      dataZoom: labels.length > 20 ? [{ type: 'slider', start: 0, end: Math.min(100, 2000 / labels.length) }] : [],
      series: measures.map(column => ({ name: columnTitle(column), type: type === 'LINE' ? 'line' : 'bar', connectNulls: false, label: { show: style.showValues, color: theme.text },
        data: result.rows.map(row => rowValue(row, column.key) === null ? null : Number(rowValue(row, column.key))) })) };
  };
  return <div className="space-y-3">
    <p className="text-xs text-cf-subtle">{result.startDate ? `${result.startDate} 至 ${result.endDate}` : `查询日：${result.snapshotDate}`} · {result.rows.length}行{result.truncated ? ` · 已截断至${result.limitRows}行，请缩小筛选范围` : ''}</p>
    {result.truncated && <p role="status" className="report-warning">结果已截断，图表不代表全部数据。</p>}
    {result.rows.length === 0 ? <p role="status" className="py-12 text-center text-cf-muted">{result.datasetCode === 'OA_EXPENSE' ? '所选日期范围内暂无已补齐费用日期的数据。' : '当前权限与筛选范围内暂无数据。'}</p> : type === 'TABLE' ? <DataTable result={result} /> : <>
      {type === 'METRIC' ? <div className="py-10 text-center"><p className="text-sm text-cf-muted">{columnTitle(measures[0])}</p><p className="mt-3 break-all text-4xl font-semibold tabular-nums">{reportValue(result.rows[0], measures[0])}</p></div>
        : <Chart option={option} style={{ height: 340 }} ariaLabel={title || '自助统计图表'} seriesCount={measures.length} />}
      <details><summary className="cursor-pointer text-sm">查看精确数据表</summary><DataTable result={result} /></details>
    </>}
    {missingDates && <section className="report-warning space-y-2" aria-label="缺费用日期">
      <p className="font-semibold">缺费用日期</p>
      <p className="text-xs leading-5">以下单据按同一人员范围及筛选条件单独汇总，不计入上方日期统计；补齐真实费用日期后重新查询。</p>
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <div><dt className="text-xs">单据数</dt><dd className="mt-1 break-all font-semibold tabular-nums">{missingDates.claimCount}</dd></div>
        {([['claimAmount', '申请金额'], ['approvedAmount', '已审批金额'], ['paidAmount', '已付款金额']] as const).map(([key, label]) => <div key={key}>
          <dt className="text-xs">{label}</dt><dd className="mt-1 break-all font-semibold tabular-nums">{new Decimal(missingDates[key]).toFixed(2)}</dd>
        </div>)}
      </dl>
    </section>}
    <p className="text-xs leading-5 text-cf-subtle">{result.description}</p>
  </div>;
}
