import { useMemo } from 'react';
import type { EChartsCoreOption } from 'echarts/core';
import { Chart, ChartDataTable, type ChartTheme } from '@/components/charts';
import { aggregateNames, type ChartType, type ReportColumn, type ReportResult, type ReportRow, type ReportStyle } from '@/services/api/report';

interface Props {
  result: ReportResult;
  type: ChartType;
  style: ReportStyle;
  title: string;
}

const columnTitle = (column: ReportColumn) => `${column.title}${column.aggregate ? ` · ${aggregateNames[column.aggregate]}` : ''}${column.unit ? `（${column.unit}）` : ''}`;
const cellValue = (row: ReportRow, column: ReportColumn): string | null => {
  if (column.key === 'dimension1') return row.label1 ?? row.dimension1;
  if (column.key === 'dimension2') return row.label2 ?? row.dimension2;
  return row[column.key as keyof ReportRow];
};

function chartOption(result: ReportResult, type: ChartType, style: ReportStyle, theme: ChartTheme): EChartsCoreOption {
  const dimensions = result.columns.filter(column => column.aggregate === null);
  const measures = result.columns.filter(column => column.aggregate !== null);
  const labels = result.rows.map(row => dimensions.length ? dimensions.map(column => cellValue(row, column) ?? '未填写').join(' / ') : '汇总');
  const firstColor = { PRIMARY: theme.colors[0], SUCCESS: theme.good, WARNING: theme.warning, NEUTRAL: theme.subtle }[style.palette];
  const colors = [firstColor, ...theme.colors.slice(1)];
  const base = {
    tooltip: { trigger: 'item', renderMode: 'richText', confine: true },
    legend: { show: style.showLegend, type: 'scroll', bottom: 0 },
  };
  if (type === 'PIE' || type === 'FUNNEL') {
    const measure = measures[0];
    return { ...base, series: [{ type: type === 'PIE' ? 'pie' : 'funnel', name: columnTitle(measure),
      ...(type === 'PIE' ? { radius: ['25%', '65%'], center: ['50%', '44%'] } : { top: 16, bottom: 60, left: '10%', width: '80%', sort: 'none' }),
      label: { show: style.showValues, position: 'inside', formatter: (point: { dataIndex: number }) => cellValue(result.rows[point.dataIndex], measure) ?? '—' },
      data: result.rows.map((row, index) => ({ name: labels[index], value: cellValue(row, measure) === null ? null : Number(cellValue(row, measure)),
        itemStyle: { color: colors[index % colors.length] } })),
    }] };
  }
  return { ...base, tooltip: { ...base.tooltip, trigger: 'axis' }, grid: { left: 16, right: 16, top: 28, bottom: style.showLegend ? 68 : 40, containLabel: true },
    xAxis: { type: 'category', data: labels, axisLabel: { width: 100, overflow: 'truncate' } },
    yAxis: { type: 'value' },
    series: measures.map((measure, index) => ({ type: type === 'BAR' ? 'bar' : 'line', name: columnTitle(measure),
      itemStyle: { color: colors[index % colors.length] }, lineStyle: { color: colors[index % colors.length] },
      label: { show: style.showValues, position: 'top', formatter: (point: { dataIndex: number }) => cellValue(result.rows[point.dataIndex], measure) ?? '—' },
      data: result.rows.map(row => { const value = cellValue(row, measure); return value === null ? null : Number(value); }),
    })),
  };
}

export function ReportResultView({ result, type, style, title }: Props) {
  const table = useMemo(() => ({ columns: result.columns.map(columnTitle), rows: result.rows.map(row => result.columns.map(column => cellValue(row, column))) }), [result]);
  const option = useMemo(() => (theme: ChartTheme) => chartOption(result, type, style, theme), [result, type, style]);
  const measures = result.columns.filter(column => column.aggregate !== null);
  const missing = result.missingDates;
  return <div className="report-result space-y-4">
    <div className="space-y-1 text-sm text-cf-muted">
      <p>{result.description}</p>
      <p>{result.startDate ? `统计日期：${result.startDate} 至 ${result.endDate}` : `数据快照：${result.snapshotDate}`}；{result.truncated ? `已截断至${result.limitRows}行` : `共${result.rows.length}行`}。</p>
    </div>
    {result.truncated && <p role="status" className="report-warning">结果已截断，图表不代表全部数据。</p>}
    {result.rows.length === 0 ? <p role="status" className="py-8 text-center text-sm text-cf-muted">
      {result.datasetCode === 'OA_EXPENSE' ? '所选日期范围内暂无已补齐费用日期的数据。' : '当前权限与筛选范围内暂无数据。'}
    </p> : <>
      {type === 'METRIC' && <dl className="report-metrics">{result.rows.map((row, rowIndex) => measures.map(column => <div className="report-metric" key={`${rowIndex}-${column.key}`}>
        <dt>{columnTitle(column)}</dt><dd>{cellValue(row, column) ?? '—'}</dd>
      </div>))}</dl>}
      {type !== 'TABLE' && type !== 'METRIC' && <>
        <Chart option={option} ariaLabel={title || '报表图表'} height={320} seriesCount={type === 'PIE' || type === 'FUNNEL' ? 1 : measures.length} />
        <p className="text-xs text-cf-muted">图形用于比较，精确数值以数据表为准。</p>
      </>}
      <div className="report-data-table"><ChartDataTable data={table} label={title || '报表结果'} /></div>
    </>}
    {missing && <section role="region" aria-label="缺费用日期" className="report-missing-dates space-y-3">
      <h4 className="font-medium">缺费用日期</h4>
      <p className="text-sm text-cf-muted">以下为当前权限内尚未填写费用日期的单据汇总，独立于所选日期范围，不计入上方图表。</p>
      <dl className="report-metrics">
        <div><dt>单据数</dt><dd>{missing.claimCount}</dd></div>
        <div><dt>报销金额（元）</dt><dd>{missing.claimAmount}</dd></div>
        <div><dt>核准金额（元）</dt><dd>{missing.approvedAmount}</dd></div>
        <div><dt>已付金额（元）</dt><dd>{missing.paidAmount}</dd></div>
      </dl>
    </section>}
  </div>;
}
