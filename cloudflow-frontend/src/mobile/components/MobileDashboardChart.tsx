import React from 'react';
import { Chart } from '@/components/charts/Chart';

export interface DashboardStats {
  pendingTasks: number | null;
  todaySchedules: number | null;
  unreadMessages: number | null;
}

/** 使用工作台同一批真实计数；日程仅限今天，待办和未读消息为当前总数。 */
export const MobileDashboardChart = ({ stats }: { stats: DashboardStats }) => {
  const categories = ['待办任务', '今日日程', '未读消息'];
  const values = [stats.pendingTasks, stats.todaySchedules, stats.unreadMessages];
  return <section className="rounded-lg border border-cf-border bg-cf-surface p-4" aria-labelledby="mobile-dashboard-chart-title">
    <h2 id="mobile-dashboard-chart-title" className="font-bold text-cf-title">工作概览</h2>
    <p className="mt-1 text-xs text-cf-subtle">日程统计今天，待办与未读消息统计当前总数；— 表示尚未取得数据。</p>
    <Chart height={220} ariaLabel="工作概览：待办任务、今日日程与未读消息数量" seriesCount={1}
      empty={values.every(value => value === null)}
      dataTable={{ columns: ['事项', '数量'], rows: categories.map((name, index) => [name, values[index]]) }}
      option={theme => ({
        legend: { show: false },
        tooltip: { trigger: 'axis', triggerOn: 'click', confine: true, axisPointer: { type: 'shadow', snap: true } },
        grid: { left: 4, right: 36, top: 12, bottom: 28, containLabel: true },
        xAxis: { type: 'value', min: 0, minInterval: 1 },
        yAxis: { type: 'category', inverse: true, data: categories, axisTick: { show: false } },
        series: [{ name: '数量', type: 'bar', data: values, barWidth: 22,
          itemStyle: { color: theme.colors[0], borderRadius: [0, 4, 4, 0] },
          label: { show: true, position: 'right' }, emphasis: { focus: 'self' } }],
      })} />
  </section>;
};
