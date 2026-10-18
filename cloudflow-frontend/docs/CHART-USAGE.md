# 图表使用规范

图表统一使用 `src/components/charts`，ECharts 按需注册并由 Vite 输出独立 `chart-vendor`，无需网络或 CDN。页面保持路由懒加载；普通指标仍使用 `StatCard`，需要迷你趋势时使用复用它的 `MetricCard`。

## 色板七条规则

1. `--cf-chart-1..8` 仅用于线、柱、扇区、点和图例标记；图中文字使用 `--cf-fg-*`。禁止在图表配置中写固定十六进制颜色。
2. 分类按八个槽位顺序分配，不循环。超过八类应合并为“其它”或拆成多图；预设在开发期告警并停止绘图，原始数据表仍完整可读。
3. 第四、第五槽对比度需要补偿，必须显示图例或直接标签。环图默认显示图例；工作台紧凑环图使用右侧完整明细作外置图例。
4. 分类槽表示不同系列，状态色表示正常、预警、严重。通过 `semantic="good|warning|critical"` 或数据项上的同名属性指定状态，状态不占分类槽。
5. 三个状态色在亮暗主题中保持同值。分类槽随主题更新，基础组件监听 `html.dark` 并重新读取变量。
6. 状态色必须同时显示文字。预设将状态写入图例名称，散点图额外提供可见状态图例；数据表逐点列出状态。
7. 色板值不得手调；修改任何槽位前须重新运行 dataviz 色板校验器的全部六项检查。本轮未修改色板。

## 预设用法

```tsx
import { LineChart, BarChart, DonutChart, ScatterChart, FunnelChart, MetricCard } from '@/components/charts';

<LineChart ariaLabel="本月申请与异常数量" height={280} loading={loading}
  categories={rows.map(row => row.date)} categoryAxisName="日期"
  series={[
    { name: '申请', values: rows.map(row => row.count) },
    { name: '异常', values: rows.map(row => row.errors), semantic: 'critical' },
  ]} />
<BarChart ariaLabel="各部门预算与执行" height={280} horizontal categories={departments}
  series={[{ name: '已使用', values: used, stack: 'budget' }, { name: '剩余', values: remaining, stack: 'budget' }]} />
<DonutChart ariaLabel="客户来源占比" height={280} data={sources} showTotal totalLabel="客户总数" />
<ScatterChart ariaLabel="流程时长与风险" height={280} xAxisName="平均时长" yAxisName="风险强度"
  data={[{ id: 'process-a', name: '审批流程', x: 20, y: 15, size: 40, semantic: 'critical', dimensions: { 超时率: '10%' } }]}
  onSelect={point => selectProcess(point.id)} />
<FunnelChart ariaLabel="销售转化" height={280} data={[{ name: '线索', value: 100 }, { name: '商机', value: 40 }]} />
<MetricCard title="本月收入" value="100,000" meta="同比增长 5%" trend={[{ label: '上月', value: 95000 }, { label: '本月', value: 100000 }]} />
```

`LineChart` 不平滑，超过30点自动开启缩放；`BarChart` 支持横向与同名 `stack` 堆叠。两者的 `values` 与 `categories` 按索引对应，缺失值用 `null`，不得把缺数据填成零。可以用 `slot` 固定已建立的分类含义；未指定槽位从剩余槽顺序分配。

`DonutChart` 的 `pie` 可显示实心饼图；图例保持开启。`FunnelChart` 保留传入的业务阶段顺序，显示“当前数量 ÷ 上一阶段数量”的转化率，上一阶段为零时显示“—”，不假定数量递减。`ScatterChart` 必须提供两个轴名称；提示和表格显示名称、横纵值、数量、状态及全部 `dimensions`。点击或表格操作共用 `onSelect`。

柱状与散点的 `largeThreshold` 默认2000，可按数据量配置。散点存在逐点状态或选择交互时保留普通绘制，确保状态与点击有效。千点以上折线关闭动画，系统启用减少动画时全部图表关闭动画。

## 原始配置及无障碍

混合双轴等业务定制可用 `<Chart option={theme => ...}>`，颜色只能读取 `theme.colors`、`theme.good/warning/critical`。同时提供分类数量 `seriesCount`，显式提供与业务口径一致的 `dataTable={{ columns, rows }}`。`height` 控制画布高度，`className/style` 作用于画布，`wrapperClassName` 用于外部 flex/grid 布局。

每个图表的 `ariaLabel` 必须说明业务含义；画布带 `role="img"`。预设自动生成等价数据表，表格每页100行，保留全部原始数据，按钮支持键盘且高度至少44px。紧凑环图可把 `ChartViewToggle` 和 `ChartDataTable` 放在同一卡片内，保证切换与图例不会挤压画布。加载使用 `Skeleton`，空数据使用 `EmptyState`，不要让旧画布继续接受操作。

自定义 HTML 提示必须转义业务文本；散点预设已转义全部名称和维度。事件回调更新后重新绑定，切换到表格、加载、空态以及页面卸载均释放图表和观察器。表格取业务原始值，不读取已经被缩放、隐藏或抽样的画面。

## 检查

`npm run check:charts` 扫描图表调用与图表样式中的硬编码颜色，并限制 ECharts 运行时只从统一封装导入；`npm run build` 在构建前自动运行。完成类型、构建及实际浏览器验证后再登记验收；截图、主题耗时、千点性能和20次卸载的内存结果单独记录，不能用类型检查代替。
