import React from 'react';
import { Chart, type ChartProps, type ChartTheme } from './Chart';
import { StatCard } from '@/components/common/StatCard';

export type ChartSemantic = 'good' | 'warning' | 'critical';
export type ChartSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
const STATUS_LABELS: Record<ChartSemantic, string> = { good: '正常', warning: '预警', critical: '严重' };
interface ColorMeaning { semantic?: ChartSemantic; slot?: ChartSlot }
interface PresetProps extends Pick<ChartProps, 'height' | 'loading' | 'empty' | 'ariaLabel' | 'className' | 'wrapperClassName'> {}
export interface ChartSeries extends ColorMeaning {
  name: string;
  values: readonly (number | null)[];
  stack?: string;
  area?: boolean;
}

const semanticName = (name: string, semantic?: ChartSemantic) => semantic ? `${name}（${STATUS_LABELS[semantic]}）` : name;
const categoryCount = (items: readonly ColorMeaning[]) => items.filter(item => !item.semantic).length;
/** 先预留指定槽，再顺序分配；状态色永远不占分类槽。超限由 Chart 阻止绘制。 */
const colorsFor = (theme: ChartTheme, items: readonly ColorMeaning[]) => {
  const used = new Set(items.filter(item => !item.semantic && item.slot).map(item => item.slot as number));
  return items.map(item => {
    if (item.semantic) return theme[item.semantic];
    if (item.slot) return theme.colors[item.slot - 1];
    const slot = Array.from({ length: 8 }, (_, index) => index + 1).find(candidate => !used.has(candidate));
    if (!slot) return undefined;
    used.add(slot);
    return theme.colors[slot - 1];
  });
};
const escapeHtml = (value: string | number) => String(value).replace(/[&<>"']/g, character => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[character]!);
const valueText = (value: number | null, formatter?: (value: number) => string) => value === null ? null : formatter?.(value) ?? value;

export interface CartesianChartProps extends PresetProps {
  categories: readonly string[];
  series: readonly ChartSeries[];
  categoryAxisName?: string;
  valueAxisName?: string;
  valueFormatter?: (value: number) => string;
  max?: number;
  largeThreshold?: number;
}

const CartesianChart = ({ categories, series, categoryAxisName = '', valueAxisName = '', valueFormatter, max,
  largeThreshold = 2000, horizontal = false, kind, ...props }: CartesianChartProps & { horizontal?: boolean; kind: 'line' | 'bar' }) => {
  const zoom = categories.length > 30;
  return <Chart {...props} seriesCount={categoryCount(series)} empty={props.empty ?? (!categories.length || !series.length)}
    dataTable={{ columns: [categoryAxisName || '分类', ...series.map(item => semanticName(item.name, item.semantic))],
      rows: categories.map((category, index) => [category, ...series.map(item => valueText(item.values[index] ?? null, valueFormatter))]) }}
    option={theme => {
      const colors = colorsFor(theme, series);
      const categoryAxis = { type: 'category', name: categoryAxisName, nameLocation: 'middle', nameGap: 28, data: categories };
      const valueAxis = { type: 'value', name: valueAxisName, max, axisLabel: { formatter: valueFormatter } };
      return {
        animation: categories.length < 1000,
        tooltip: { trigger: 'axis', valueFormatter: (value: unknown) => typeof value === 'number' ? valueFormatter?.(value) ?? String(value) : String(value ?? '—') },
        legend: { type: 'scroll', top: 0 },
        grid: { left: 12, right: horizontal && zoom ? 54 : 24, top: 48, bottom: zoom && !horizontal ? 64 : 32, containLabel: true },
        xAxis: horizontal ? valueAxis : categoryAxis, yAxis: horizontal ? categoryAxis : valueAxis,
        dataZoom: zoom ? [{ type: 'slider', ...(horizontal ? { yAxisIndex: 0, right: 0 } : { xAxisIndex: 0, bottom: 0 }), start: 0, end: Math.min(100, 30 / categories.length * 100) },
          { type: 'inside', ...(horizontal ? { yAxisIndex: 0 } : { xAxisIndex: 0 }) }] : [],
        series: series.map((item, index) => ({ name: semanticName(item.name, item.semantic), type: kind, data: item.values,
          smooth: false, stack: item.stack, showSymbol: categories.length <= 30, symbolSize: 6,
          large: kind === 'bar' && !item.semantic && categories.length >= largeThreshold, largeThreshold,
          lineStyle: { color: colors[index], width: 2 }, itemStyle: { color: colors[index] },
          areaStyle: item.area ? { color: colors[index], opacity: 0.12 } : undefined,
        })),
      };
    }} />;
};

export const LineChart = (props: CartesianChartProps) => <CartesianChart {...props} kind="line" />;
export const BarChart = (props: CartesianChartProps & { horizontal?: boolean }) => <CartesianChart {...props} kind="bar" />;

export interface ChartSlice extends ColorMeaning { name: string; value: number }
export interface DonutChartProps extends PresetProps {
  data: readonly ChartSlice[];
  totalLabel?: string;
  showTotal?: boolean;
  pie?: boolean;
}
export const DonutChart = ({ data, totalLabel = '总计', showTotal = false, pie = false, ...props }: DonutChartProps) => {
  const total = data.reduce((sum, item) => sum + item.value, 0);
  return <Chart {...props} seriesCount={categoryCount(data)} empty={props.empty ?? (!data.length || total === 0)}
    dataTable={{ columns: ['分类', '数值', '占比'], rows: data.map(item => [semanticName(item.name, item.semantic), item.value, total ? `${(item.value / total * 100).toFixed(2)}%` : '—']) }}
    option={theme => {
      const colors = colorsFor(theme, data);
      return {
        tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)' }, legend: { type: 'scroll', bottom: 0 },
        title: showTotal && !pie ? { text: total.toLocaleString('zh-CN'), subtext: totalLabel, left: 'center', top: '34%' } : undefined,
        series: [{ type: 'pie', radius: pie ? '65%' : ['42%', '68%'], center: ['50%', '43%'],
          label: { show: false }, data: data.map((item, index) => ({ name: semanticName(item.name, item.semantic), value: item.value, itemStyle: { color: colors[index] } })) }],
      };
    }} />;
};

export interface ScatterPoint extends ColorMeaning {
  name: string;
  x: number;
  y: number;
  size?: number;
  id?: string;
  dimensions?: Readonly<Record<string, string | number>>;
}
export interface ScatterChartProps extends PresetProps {
  data: readonly ScatterPoint[];
  xAxisName: string;
  yAxisName: string;
  sizeName?: string;
  xFormatter?: (value: number) => string;
  yFormatter?: (value: number) => string;
  selectedId?: string;
  onSelect?: (point: ScatterPoint) => void;
  largeThreshold?: number;
}
export const ScatterChart = ({ data, xAxisName, yAxisName, sizeName = '数量', xFormatter, yFormatter, selectedId, onSelect, largeThreshold = 2000, ...props }: ScatterChartProps) => {
  const dimensions = Array.from(new Set(data.flatMap(point => Object.keys(point.dimensions ?? {}))));
  return <div className={props.wrapperClassName}>
    <Chart {...props} wrapperClassName={undefined} seriesCount={data.some(point => !point.semantic) ? 1 : 0}
      empty={props.empty ?? !data.length}
      dataTable={{ columns: ['名称', xAxisName, yAxisName, sizeName, '状态', ...dimensions],
        rows: data.map(point => [point.name, valueText(point.x, xFormatter), valueText(point.y, yFormatter), point.size ?? null, point.semantic ? STATUS_LABELS[point.semantic] : '—', ...dimensions.map(key => point.dimensions?.[key] ?? null)]),
        onActivate: onSelect ? index => onSelect(data[index]) : undefined, actionLabel: '选择流程' }}
      onEvents={onSelect ? { click: params => { const index = (params as { dataIndex?: number })?.dataIndex; if (typeof index === 'number' && data[index]) onSelect(data[index]); } } : undefined}
      option={theme => ({
        tooltip: { trigger: 'item', formatter: (params: unknown) => {
          const point = data[(params as { dataIndex: number }).dataIndex];
          if (!point) return '';
          return [point.name, `${xAxisName}：${valueText(point.x, xFormatter)}`, `${yAxisName}：${valueText(point.y, yFormatter)}`,
            `${sizeName}：${point.size ?? '—'}`, ...(point.semantic ? [`状态：${STATUS_LABELS[point.semantic]}`] : []),
            ...Object.entries(point.dimensions ?? {}).map(([key, value]) => `${key}：${value}`)].map(escapeHtml).join('<br/>');
        } },
        grid: { left: 12, right: 24, top: 34, bottom: 44, containLabel: true },
        xAxis: { type: 'value', name: xAxisName, nameLocation: 'middle', nameGap: 30, axisLabel: { formatter: xFormatter } },
        yAxis: { type: 'value', name: yAxisName, axisLabel: { formatter: yFormatter } },
        series: [{ name: props.ariaLabel, type: 'scatter',
          // 大规模模式不支持逐点状态/选择样式，有这类业务语义时保持普通绘制。
          large: data.length >= largeThreshold && !data.some(point => point.semantic) && !onSelect, largeThreshold,
          symbolSize: (value: number[]) => 10 + Math.min(24, Math.sqrt(Math.max(0, value[2])) * 2),
          data: data.map(point => ({ name: point.name, value: [point.x, point.y, point.size ?? 1],
            itemStyle: { color: point.semantic ? theme[point.semantic] : theme.colors[0], opacity: 0.75,
              borderColor: point.id === selectedId ? theme.colors[0] : theme.border, borderWidth: point.id === selectedId ? 3 : 1 } })),
        }],
      })} />
    {data.some(point => point.semantic) ? <ul className="mt-2 flex flex-wrap gap-3 text-xs text-cf-body" aria-label="风险状态图例">
      {(['good', 'warning', 'critical'] as const).filter(semantic => data.some(point => point.semantic === semantic)).map(semantic =>
        <li key={semantic} className="inline-flex items-center gap-1"><span aria-hidden="true" className="h-2 w-2 rounded-full" style={{ backgroundColor: `var(--cf-chart-${semantic})` }} />{STATUS_LABELS[semantic]}</li>)}
    </ul> : null}
  </div>;
};

export const FunnelChart = ({ data, ...props }: PresetProps & { data: readonly ChartSlice[] }) => {
  const conversion = (index: number) => index === 0 ? '100%' : data[index - 1].value === 0 ? '—' : `${(data[index].value / data[index - 1].value * 100).toFixed(2)}%`;
  return <Chart {...props} seriesCount={categoryCount(data)} empty={props.empty ?? !data.length}
    dataTable={{ columns: ['阶段', '数量', '较上阶段转化率'], rows: data.map((item, index) => [semanticName(item.name, item.semantic), item.value, conversion(index)]) }}
    option={theme => {
      const colors = colorsFor(theme, data);
      return { tooltip: { trigger: 'item' }, legend: { type: 'scroll', bottom: 0 }, series: [{ type: 'funnel', sort: 'none', left: '5%', right: '36%', top: 16, bottom: 40,
        label: { show: true, position: 'right', formatter: (params: { name: string; dataIndex: number }) => `${params.name} ${conversion(params.dataIndex)}` },
        data: data.map((item, index) => ({ name: semanticName(item.name, item.semantic), value: item.value, itemStyle: { color: colors[index] } })) }] };
    }} />;
};

export interface MetricCardProps extends React.ComponentProps<typeof StatCard> {
  trend?: readonly { label: string; value: number | null }[];
  semantic?: ChartSemantic;
  loading?: boolean;
}
export const MetricCard = ({ trend, semantic, loading, ...props }: MetricCardProps) => <StatCard {...props}
  meta={<>{props.meta}{trend ? <LineChart height={160} ariaLabel={`${props.title}趋势`} loading={loading}
    categories={trend.map(point => point.label)} series={[{ name: props.title, values: trend.map(point => point.value), semantic }]} /> : null}</>} />;
