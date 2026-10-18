import React, { useState } from 'react';
import { createRoot } from 'react-dom/client';
import { flushSync } from 'react-dom';
import { BrowserRouter, Route, Routes, useNavigate } from 'react-router-dom';
import * as echarts from 'echarts/core';
import { Chart, LineChart, BarChart, DonutChart, ScatterChart, FunnelChart, MetricCard } from '../../cloudflow-frontend/src/components/charts';
import '../../cloudflow-frontend/src/index.css';

const fixture = window as unknown as { charts: typeof echarts; mount: (mounted: boolean) => Promise<number> };
fixture.charts = echarts;
const labels = Array.from({ length: 1000 }, (_, index) => `第${index + 1}天`);
function Check() {
  const navigate = useNavigate();
  const [revision, setRevision] = useState(1);
  const [selected, setSelected] = useState('');
  const [loading, setLoading] = useState(false);
  const [empty, setEmpty] = useState(false);
  fixture.mount = async value => {
    const start = performance.now();
    const previousElement = document.querySelector<HTMLElement>('[data-testid="performance"] [role="img"]');
    const previousInstance = previousElement ? echarts.getInstanceByDom(previousElement) : undefined;
    flushSync(() => navigate(`${value ? '/preset-check' : '/chart-empty'}?lifecycle=1`));
    const deadline = start + 5000;
    do {
      await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
      const element = document.querySelector<HTMLElement>('[data-testid="performance"] [role="img"]');
      if (value ? element && echarts.getInstanceByDom(element) : !element && (!previousInstance || previousInstance.isDisposed())) break;
      if (performance.now() > deadline) throw new Error('Chart route did not reach its requested state');
    } while (true);
    return performance.now() - start;
  };
  const onlyLife = new URLSearchParams(location.search).has('lifecycle');
  return <main className="p-4">
    <button onClick={() => setRevision(value => value + 1)}>更新回调</button><output>{selected}</output>
    <button onClick={() => setLoading(value => !value)}>切换加载</button><button onClick={() => setEmpty(value => !value)}>切换空数据</button>
    <Routes><Route path="/preset-check" element={<div data-testid="performance"><LineChart ariaLabel="千点趋势" height={240} categories={labels} series={[{ name: '总量', values: labels.map((_, index) => index % 31) }]} /></div>} /><Route path="/chart-empty" element={null} /></Routes>
    {!onlyLife && <div className="grid gap-6 md:grid-cols-2">
      <section data-testid="line"><LineChart ariaLabel="分类与状态趋势" height={240} loading={loading} empty={empty} categories={['第一天', '第二天']}
        series={[{ name: '正常量', values: [1, 2] }, { name: '超时量', semantic: 'warning', values: [2, 3] }, { name: '异常量', semantic: 'critical', values: [3, 4] }, { name: '另一分类', values: [4, 5] }]} /></section>
      <section data-testid="bar"><BarChart ariaLabel="堆叠横柱" height={240} horizontal categories={['甲', '乙']}
        series={[{ name: '已完成', values: [1, 2], stack: 'total' }, { name: '剩余', values: [3, 4], stack: 'total' }]} /></section>
      <section data-testid="donut"><DonutChart ariaLabel="五类占比" height={240} showTotal data={Array.from({ length: 5 }, (_, index) => ({ name: `分类${index + 1}`, value: index + 1 }))} /></section>
      <section data-testid="scatter"><ScatterChart ariaLabel="风险矩阵测试" height={240} xAxisName="平均时长" yAxisName="风险强度" sizeName="实例数"
        onSelect={point => setSelected(`${revision}:${point.id}`)}
        data={[{ id: 'risk', name: '<img src=x onerror="window.chartInjection=1">流程', x: 120, y: 15, size: 9, semantic: 'critical', dimensions: { 异常率: '10%', 超时率: '5%' } }, { id: 'normal', name: '正常流程', x: 40, y: 1, size: 5, semantic: 'good' }]} /></section>
      <section data-testid="funnel"><FunnelChart ariaLabel="漏斗测试" height={240} data={[{ name: '线索', value: 10 }, { name: '商机', value: 5 }, { name: '成交', value: 2 }]} /></section>
      <section data-testid="metric"><MetricCard title="收入" value="100" meta="同比 5%" trend={[{ label: '昨天', value: 90 }, { label: '今天', value: 100 }]} /></section>
      <section data-testid="overflow"><LineChart ariaLabel="九类溢出" height={240} categories={['今天']} series={Array.from({ length: 9 }, (_, index) => ({ name: `第${index + 1}类`, values: [index] }))} /></section>
      <section data-testid="raw"><Chart ariaLabel="原始配置兼容" height={240} option={{ xAxis: { type: 'category', data: ['甲', '乙'] }, yAxis: { type: 'value' }, tooltip: {}, series: [{ type: 'bar', data: [1, 2] }] }} /></section>
    </div>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<BrowserRouter><Check /></BrowserRouter>);
