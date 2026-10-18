import React, { useEffect, useId, useRef, useState } from 'react';
import * as echarts from 'echarts/core';
import { BarChart, LineChart, PieChart, ScatterChart, FunnelChart } from 'echarts/charts';
import {
  DataZoomComponent,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  TransformComponent,
} from 'echarts/components';
import { CanvasRenderer } from 'echarts/renderers';
import type { EChartsCoreOption } from 'echarts/core';
import { cn } from '@/utils/cn';
import { Skeleton } from '@/components/common/Skeleton';
import { EmptyState } from '@/components/common/EmptyState';
import { ChartDataTable, ChartViewToggle, type ChartTableData } from './ChartDataTable';
import { useBreakpoint } from '@/hooks/useBreakpoint';

echarts.use([
  BarChart,
  LineChart,
  PieChart,
  ScatterChart,
  FunnelChart,
  DataZoomComponent,
  DatasetComponent,
  GridComponent,
  LegendComponent,
  TitleComponent,
  TooltipComponent,
  TransformComponent,
  CanvasRenderer,
]);

const CHART_TOKENS = Array.from({ length: 8 }, (_, index) => `--cf-chart-${index + 1}`);

const readCssVariable = (styles: CSSStyleDeclaration, name: string) =>
  styles.getPropertyValue(name).trim();

const readTheme = () => {
  const styles = getComputedStyle(document.documentElement);
  return {
    colors: CHART_TOKENS.map((token) => readCssVariable(styles, token)),
    text: readCssVariable(styles, '--cf-fg-body') || readCssVariable(styles, '--cf-fg'),
    subtle: readCssVariable(styles, '--cf-fg-subtle'),
    border: readCssVariable(styles, '--cf-border'),
    good: readCssVariable(styles, '--cf-chart-good'),
    warning: readCssVariable(styles, '--cf-chart-warning'),
    critical: readCssVariable(styles, '--cf-chart-critical'),
    surface: readCssVariable(styles, '--cf-surface'),
    fontFamily: styles.fontFamily,
  };
};

export type ChartTheme = ReturnType<typeof readTheme>;

export interface ChartProps {
  option: EChartsCoreOption | ((theme: ChartTheme) => EChartsCoreOption);
  className?: string;
  style?: React.CSSProperties;
  ariaLabel: string;
  seriesCount?: number;
  onEvents?: Record<string, (params: unknown) => void>;
  height?: number | string;
  loading?: boolean;
  empty?: boolean;
  dataTable?: ChartTableData;
  wrapperClassName?: string;
}

const objectOption = (value: unknown): Record<string, unknown> => value && typeof value === 'object' && !Array.isArray(value) ? value as Record<string, unknown> : {};
const asOptions = (value: unknown): Record<string, unknown>[] => value == null ? [] : (Array.isArray(value) ? value : [value]).map(objectOption);

/** 图表文字始终使用墨色；调用方仍可配置轴、图例、网格及标记样式。 */
const themedOption = (option: EChartsCoreOption, theme: ChartTheme): EChartsCoreOption => {
  const axis = (value: unknown) => asOptions(value).map(item => ({
    ...item, nameTextStyle: { ...objectOption(item.nameTextStyle), color: theme.text },
    axisLabel: { ...objectOption(item.axisLabel), color: theme.subtle },
    axisLine: { ...objectOption(item.axisLine), lineStyle: { color: theme.border, ...objectOption(objectOption(item.axisLine).lineStyle) } },
    splitLine: { ...objectOption(item.splitLine), lineStyle: { color: theme.border, ...objectOption(objectOption(item.splitLine).lineStyle) } },
  }));
  return {
    animationDuration: 200, animationDurationUpdate: 200, ...option,
    ...(window.matchMedia('(prefers-reduced-motion: reduce)').matches ? { animation: false } : {}),
    color: theme.colors, backgroundColor: 'transparent',
    textStyle: { ...option.textStyle, color: theme.text, fontFamily: theme.fontFamily },
    xAxis: axis(option.xAxis), yAxis: axis(option.yAxis),
    legend: asOptions(option.legend).map(item => ({ ...item, textStyle: { ...objectOption(item.textStyle), color: theme.subtle }, pageTextStyle: { color: theme.subtle } })),
    tooltip: asOptions(option.tooltip).map(item => ({ appendTo: 'body', ...item, backgroundColor: theme.surface, borderColor: theme.border, textStyle: { ...objectOption(item.textStyle), color: theme.text } })),
    title: asOptions(option.title).map(item => ({ ...item, textStyle: { ...objectOption(item.textStyle), color: theme.text }, subtextStyle: { ...objectOption(item.subtextStyle), color: theme.subtle } })),
    series: asOptions(option.series).map(item => ({ ...item, label: { ...objectOption(item.label), color: theme.text },
      emphasis: { ...objectOption(item.emphasis), label: { ...objectOption(objectOption(item.emphasis).label), color: theme.text } },
      data: Array.isArray(item.data) ? item.data.map((point: unknown) => point && typeof point === 'object' && !Array.isArray(point)
        ? { ...point, label: { ...objectOption(objectOption(point).label), color: theme.text } } : point) : item.data,
    })),
  };
};

/**
 * 统一 ECharts 容器：CSS 色板注入、暗色监听、尺寸自适应与销毁回收。
 */
export const Chart: React.FC<ChartProps> = ({
  option,
  className,
  style,
  ariaLabel,
  seriesCount,
  onEvents,
  height,
  loading = false,
  empty = false,
  dataTable,
  wrapperClassName,
}) => {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const mobile = useBreakpoint() === 'mobile';
  const instanceRef = useRef<echarts.EChartsType | null>(null);
  const optionRef = useRef(option);
  const renderRef = useRef<(() => void) | null>(null);
  const renderedOptionRef = useRef<ChartProps['option'] | null>(null);
  const [tableView, setTableView] = useState(false);
  const viewId = useId();
  const overflow = typeof seriesCount === 'number' && seriesCount > 8;
  const active = !loading && !empty && !overflow && !(tableView && dataTable);
  optionRef.current = option;

  useEffect(() => {
    const element = containerRef.current;
    if (!active || !element) return undefined;
    const instance = echarts.init(element, undefined, { renderer: 'canvas',
      ...(mobile ? { useCoarsePointer: true, pointerSize: 44 } : {}) });
    instanceRef.current = instance;

    const render = () => {
      const theme = readTheme();
      const currentOption = typeof optionRef.current === 'function'
        ? optionRef.current(theme)
        : optionRef.current;
      const responsiveOption = mobile ? { ...currentOption,
        legend: asOptions(currentOption.legend).map(item => ({ ...item, type: 'scroll', itemWidth: 12, itemHeight: 12, itemGap: 16, pageIconSize: 16 })),
        tooltip: asOptions(currentOption.tooltip).map(item => ({ ...item, triggerOn: 'click', confine: true })),
      } : currentOption;
      instance.setOption(themedOption(responsiveOption, theme), true);
      renderedOptionRef.current = optionRef.current;
    };

    renderRef.current = render;
    render();
    const resizeObserver = new ResizeObserver(() => instance.resize());
    resizeObserver.observe(element);
    const themeObserver = new MutationObserver(render);
    themeObserver.observe(document.documentElement, { attributes: true, attributeFilter: ['class'] });

    return () => {
      resizeObserver.disconnect();
      themeObserver.disconnect();
      instance.dispose();
      instanceRef.current = null;
      renderRef.current = null;
      renderedOptionRef.current = null;
    };
  }, [active, mobile]);

  useEffect(() => {
    if (renderedOptionRef.current !== option) renderRef.current?.();
  }, [option]);

  useEffect(() => {
    const instance = instanceRef.current;
    if (!instance) return;
    const boundEvents = Object.entries(onEvents ?? {});
    boundEvents.forEach(([name, handler]) => instance.on(name, handler));
    return () => { if (!instance.isDisposed()) boundEvents.forEach(([name, handler]) => instance.off(name, handler)); };
  }, [onEvents, active, mobile]);

  useEffect(() => {
    if (import.meta.env.DEV && overflow) {
      console.warn(`[Chart] 图表包含 ${seriesCount} 个系列，超过 8 槽色板上限，请合并为“其它”或改用分面。`);
    }
  }, [seriesCount, overflow]);

  return (
    <div className={cn('min-w-0 w-full', wrapperClassName)} style={{ contain: 'inline-size' }} aria-busy={loading}>
      {dataTable ? <div className="mb-2 flex justify-end"><ChartViewToggle tableView={tableView} onChange={setTableView} controls={viewId} /></div> : null}
      <div id={viewId}>
        {loading ? <div key="loading" role="status" aria-label={`${ariaLabel}加载中`}><Skeleton className={className} height={height ?? 220} /></div>
          : empty ? <EmptyState title="暂无图表数据" description="请调整筛选条件后重试。" className={className} />
          : tableView && dataTable ? <ChartDataTable data={dataTable} label={ariaLabel} />
          : overflow ? <EmptyState title="分类超过八项" description="请合并为“其它”或拆分为多个图表。" />
          : <div key="canvas" ref={containerRef} role="img" aria-label={ariaLabel} className={cn('w-full', height === undefined ? 'min-h-[220px]' : undefined, className)}
            style={{ height, ...style }} />}
      </div>
    </div>
  );
};

export default Chart;
