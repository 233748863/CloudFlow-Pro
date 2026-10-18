import React, { useMemo, useState } from 'react';
import { PieChart, RefreshCw, TrendingUp } from 'lucide-react';
import {
  Button,
  DatePicker,
  EmptyState,
  LoadingSpinner,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/common';
import { Chart, type ChartTheme } from '@/components/charts/Chart';
import { LineChart } from '@/components/charts/presets';
import { ChartDataTable, ChartViewToggle } from '@/components/charts/ChartDataTable';
import './UserDashboardCharts.css';
import '../../../styles/features/dashboard-chart.css';

/** 图表颜色槽位固定为 1-8，调用方不写死颜色值。 */
export type ChartSlot = 1 | 2 | 3 | 4 | 5 | 6 | 7 | 8;
type TrendSeriesKey = keyof Pick<UserDashboardTrendPoint, 'tasks' | 'applications' | 'announcements' | 'schedules'>;

export interface UserDashboardDistributionItem {
  label: string;
  count: number;
  description: string;
  slot: ChartSlot;
}

export interface UserDashboardTrendPoint {
  label: string;
  shortLabel: string;
  tasks: number;
  applications: number;
  announcements: number;
  schedules: number;
}

interface UserDashboardChartsProps {
  startDate: string;
  endDate: string;
  granularity: 'day' | 'hour';
  loading: boolean;
  distribution: UserDashboardDistributionItem[];
  trend: UserDashboardTrendPoint[];
  onStartDateChange: (value: string) => void;
  onEndDateChange: (value: string) => void;
  onGranularityChange: (value: 'day' | 'hour') => void;
  onRefresh: () => void;
}

const seriesMeta: Array<{ key: TrendSeriesKey; label: string; slot: ChartSlot }> = [
  { key: 'tasks', label: '待办审批', slot: 1 },
  { key: 'applications', label: '我的申请', slot: 2 },
  { key: 'announcements', label: '公告提醒', slot: 3 },
  { key: 'schedules', label: '日程安排', slot: 4 },
];

/**
 * CSS 变量形式的槽位色。只能给 CSS 属性用（如列表圆点的 backgroundColor），
 * 浏览器会解析 var()。
 */
const slotColor = (slot: ChartSlot) => `var(--cf-chart-${slot})`;

/**
 * 槽位色的**已解析**值，专供 ECharts 使用。
 *
 * ECharts 用 canvas 渲染，fillStyle/strokeStyle 收到 'var(--cf-chart-3)' 这种字符串
 * 无法解析，会退化成黑色——这张图从内联 SVG 迁到 ECharts 时就是漏了这一步，
 * 环整个是黑的，而右侧列表圆点因为走 CSS backgroundColor 所以颜色正常。
 *
 * Chart.tsx 的 readTheme() 已经按 --cf-chart-1..8 的顺序把它们读成了具体色值，
 * 并且在 html.dark 变化时重新读一次，所以这里直接按槽位取下标即可，暗色自动跟随。
 */
const resolvedSlotColor = (theme: ChartTheme, slot: ChartSlot) =>
  theme.colors[slot - 1] || undefined;

const formatValue = (value: number) => Number(value || 0).toLocaleString('zh-CN');

/** 环图内圈半径。中间「总计」白圆按同一个百分比取宽高，两者才能严丝合缝。 */
const DOUGHNUT_INNER_RADIUS = '62%';

const DistributionCard: React.FC<{
  loading: boolean;
  items: UserDashboardDistributionItem[];
}> = ({ loading, items }) => {
  const [tableView, setTableView] = useState(false);
  const total = items.reduce((sum, item) => sum + Number(item.count || 0), 0);
  // 这个环图只占 dashboard-model-chart 的第一列（9.75rem ≈ 156px），
  // 放不下 ECharts 的外置标签和底部 legend：标签带引导线往两侧甩、legend 在窄列里
  // 折成四行，两者都会溢出到卡片外。右侧 dashboard-model-list 已经把名称、说明、
  // 数量/占比逐项列全了，环图只负责画比例，所以标签和 legend 一并关掉，信息不丢。
  const option = useMemo(() => (theme: ChartTheme) => ({
    // appendTo: 'body' 是必须的：tooltip 默认渲染在图表容器内部，而外层
    // .dashboard-chart-card 有 overflow: hidden（dashboard-chart.css:51，给圆角服务），
    // 环图容器本身又只有 156px，tooltip 一探头就被裁掉。挂到 body 才能完整显示。
    // 6.1.0 里 appendToBody 已废弃，用 appendTo。
    tooltip: { trigger: 'item', formatter: '{b}: {c} ({d}%)', appendTo: 'body' },
    legend: { show: false },
    series: [{
      name: '工作负载',
      type: 'pie',
      radius: [DOUGHNUT_INNER_RADIUS, '80%'],
      // 圆心必须是 50%/50%，才能和中间「总计」那个白圆对齐（它在容器里居中）。
      center: ['50%', '50%'],
      label: { show: false },
      labelLine: { show: false },
      data: items.map((item) => ({
        name: item.label,
        value: item.count,
        itemStyle: { color: resolvedSlotColor(theme, item.slot) },
      })),
    }],
  }), [items]);

  return (
    <article className="dashboard-chart-card">
      {loading ? <div className="dashboard-loading-overlay"><LoadingSpinner size="lg" /></div> : null}
      <div className="dashboard-chart-heading">
        <h3 className="inline-flex items-center gap-2"><PieChart size={18} className="text-cf-faint" />工作负载分布</h3>
        <ChartViewToggle tableView={tableView} onChange={setTableView} />
      </div>
      {total === 0 ? (
        <EmptyState title="当前时间范围没有数据" description="尝试调整时间范围，或刷新后重新查看。" className="px-0 py-6" />
      ) : tableView ? <ChartDataTable label="工作负载分布" data={{ columns: ['事项', '数量', '占比', '说明'],
        rows: items.map(item => [item.label, item.count, `${(item.count / total * 100).toFixed(2)}%`, item.description]) }} /> : (
        <div className="dashboard-model-chart">
          {/* 尺寸分两段：
              ≥768px 由 index.css 未分层区的 .dashboard-doughnut 定死 9.75rem 正方（该处未分层，
              压过 @layer 内 1024px 那条 11.875rem，也压过这里的 Tailwind 尺寸类）；
              <768px 没有任何 CSS 给尺寸，靠这里的 aspect-square + max-w 兜出正方并限高。
              必须是正方：环图半径按短边算，容器扁了中间白圆就成椭圆、且和圆环内圈错开。
              改造前 Chart 写死 h-56(224px) 塞进 156px 的容器，画布竖向溢出 68px，
              叠上 center 43% 与白圆 50% 的差值，就是截图里圆环上缘露出、下缘被压的原因。 */}
          <div className="dashboard-doughnut relative mx-auto aspect-square w-full max-w-[13.75rem]">
            {/* minHeight 必须走内联 style：Chart 内部默认类名带 min-h-[220px]（Chart.tsx:133），
                而 cn() 只是字符串拼接、不是 tailwind-merge，传 min-h-0 会和它并存、
                胜负取决于生成 CSS 的源序而非书写顺序。内联 style 才能确定性压掉。
                不压的话画布是 156×220，圆心落在 220 的一半 110px，
                而白圆在 156 容器里居中是 78px，两者差 32px —— 就是环和白圆不同心的原因。 */}
            <Chart
              className="aspect-square w-full"
              style={{ minHeight: 0 }}
              option={option}
              ariaLabel="工作负载分布"
              seriesCount={items.length}
            />
            <div
              className="pointer-events-none absolute left-1/2 top-1/2 flex -translate-x-1/2 -translate-y-1/2 flex-col items-center justify-center rounded-full border border-slate-200 bg-[var(--cf-surface-strong)] text-center dark:border-slate-800 dark:bg-slate-950"
              style={{ width: DOUGHNUT_INNER_RADIUS, height: DOUGHNUT_INNER_RADIUS }}
            >
              <div className="text-[11px] font-medium text-cf-faint">总计</div>
              <div className="mt-1 text-[1.5rem] font-semibold leading-none text-cf-title">{formatValue(total)}</div>
              <div className="mt-1 text-[11px] text-cf-subtle">协同事项</div>
            </div>
          </div>
          <div className="dashboard-model-list">
            {items.map((item) => {
              const percentage = total === 0 ? 0 : Math.round((item.count / total) * 100);
              return (
                <div key={item.label} className="dashboard-model-row">
                  <span className="dashboard-model-dot" style={{ backgroundColor: slotColor(item.slot) }} />
                  <div className="min-w-0 flex-1">
                    <p>{item.label}</p>
                    <span>{item.description}</span>
                  </div>
                  <strong>{formatValue(item.count)} / {percentage}%</strong>
                </div>
              );
            })}
          </div>
        </div>
      )}
    </article>
  );
};

const TrendCard: React.FC<{
  loading: boolean;
  trend: UserDashboardTrendPoint[];
  granularity: 'day' | 'hour';
}> = ({ loading, trend, granularity }) => {
  const maxValue = Math.max(1, ...trend.map((item) => Math.max(item.tasks, item.applications, item.announcements, item.schedules)));

  return (
    <article className="dashboard-chart-card no-divider">
      {loading ? <div className="dashboard-loading-overlay"><LoadingSpinner size="lg" /></div> : null}
      <div className="dashboard-chart-heading">
        <h3 className="inline-flex items-center gap-2"><TrendingUp size={18} className="text-cf-faint" />协同趋势</h3>
      </div>
      {trend.length === 0 ? (
        <EmptyState title="没有可绘制的趋势数据" description="当前筛选区间内没有命中任何待办、申请、公告或日程。" className="px-0 py-6" />
      ) : (
        <div className="chart-canvas-wrap dashboard-trend-chart" style={{ height: 'auto', overflow: 'visible' }}>
          <LineChart height={420} ariaLabel="协同趋势图" max={maxValue} categoryAxisName={granularity === 'hour' ? '小时' : '日期'}
            categories={trend.map(item => item.label)} series={seriesMeta.map((series, index) => ({
              name: series.label, values: trend.map(item => item[series.key]), slot: series.slot, area: index === 0,
            }))} />
        </div>
      )}
    </article>
  );
};

export const UserDashboardCharts: React.FC<UserDashboardChartsProps> = ({
  startDate,
  endDate,
  granularity,
  loading,
  distribution,
  trend,
  onStartDateChange,
  onEndDateChange,
  onGranularityChange,
  onRefresh,
}) => (
  <div className="dashboard-chart-suite">
    <div className="dashboard-toolbar dashboard-chart-toolbar">
      <div className="dashboard-chart-filter-grid">
        <div className="dashboard-toolbar-group">
          <div className="dashboard-filter dashboard-range-filter">
            <span>时间范围</span>
            <div className="dashboard-date-range-controls">
              <DatePicker id="dashboard-start-date" type="date" className="date-range-input" value={startDate} onChange={(event) => onStartDateChange(event.target.value)} />
              <span className="dashboard-date-separator">至</span>
              <DatePicker id="dashboard-end-date" type="date" className="date-range-input" value={endDate} onChange={(event) => onEndDateChange(event.target.value)} />
            </div>
          </div>
          <Button variant="outline" size="sm" onClick={onRefresh} disabled={loading}>
            <RefreshCw size={15} className={loading ? 'animate-spin' : undefined} />刷新
          </Button>
        </div>
        <div className="dashboard-filter dashboard-granularity-filter">
          <span>粒度</span>
          <div className="dashboard-granularity-control">
            <Select value={granularity} onValueChange={(value) => onGranularityChange(value as 'day' | 'hour')}>
              <SelectTrigger><SelectValue placeholder="选择粒度" /></SelectTrigger>
              <SelectContent><SelectItem value="day">按天</SelectItem><SelectItem value="hour">按小时</SelectItem></SelectContent>
            </Select>
          </div>
        </div>
      </div>
    </div>
    <div className="dashboard-chart-surface">
      <DistributionCard loading={loading} items={distribution} />
      <TrendCard loading={loading} trend={trend} granularity={granularity} />
    </div>
  </div>
);
