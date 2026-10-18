# PRD：引入图表库替代手写图表

| 项 | 内容 |
| --- | --- |
| 条目编号 | LC-05 |
| 所属批次 | 批次 A（第 5 项） |
| 对标依据 | `docs/benchmark/06-lowcode-bi-表单报表对标.md` |
| 优先级 | P0 —— 成本最低、可见收益最高 |
| 预估工作量 | M |
| 版本 | v1 · 2026-08-31 |

## 1. 背景与目标

### 1.1 现状问题

前端 38 个依赖里**没有任何图表库**（无 ECharts / Recharts / Chart.js / D3）。现有图表全部手写 SVG + CSS：

| 位置 | 规模 | 形态 |
| --- | --- | --- |
| `components/user/dashboard/UserDashboardCharts.tsx` | **602 行** | 内含 4 个 `DONUT` 常量（环形图）、`DistributionCard`（分布卡）、`TrendCard`（趋势卡），4 处 `<svg>` |
| `styles/features/dashboard-chart.css` | 133 行 | `.dashboard-chart-card` / `-surface` / `-grid` / `-suite` 等布局样式 |
| `pages/PerformanceStats.tsx` | 1595 行 | 4 处 `<svg>`，含 5 个 `<circle>`（风险气泡图）、4 组 `<line>`（坐标轴）、4 个 `<path>` |
| `pages/hr/components/HrPerformanceDistributionPanel.tsx` | 313 行 | 绩效分布 |

**四个实际问题**：
1. **新增图表成本极高** —— 加一个柱状图要手写 SVG 坐标计算、刻度、图例
2. **无交互** —— 没有 tooltip、图例点击隐藏系列、缩放、数据点悬停
3. **风格不统一** —— 各处手写，间距、字号、动画各不相同
4. **后续需求全被卡住** —— 待建看板：`WorkflowMonitorController` 的 overview/trend/performance-dashboard、`CrmDashboardController` 的 summary/workplace、LC-06 自助报表（受限版）都需要图表渲染层

### 1.2 目标
1. 引入图表库并封装统一 `<Chart>` 组件层
2. **严格复用批次 21 已落地的 dataviz 校验色板**（这是硬约束，见 §2.2）
3. 迁移现有四处手写图表
4. 为后续看板与 LC-06 提供渲染底座
5. 控制包体积（按需引入，不全量打包）

### 1.3 非目标
- 不做大屏可视化
- 不做图表编辑器（LC-06 负责配置层）
- 不迁移非图表 SVG（`Tooltip.tsx`、`CustomTitleBar.tsx` 里的 SVG 是图标，不动）

## 2. 现状基线与硬约束

### 2.1 技术栈
React 19.2.0 / TypeScript 5.8.2 / Vite 6.4.1 / Tailwind CSS 4.1.18。已有 `@xyflow/react` 12.11.1（流程画布，非图表库，不冲突）。

### 2.2 dataviz 色板硬约束（**本 PRD 最重要的约束**）

`src/index.css` 已定义经校验的图表色板，**改任何一个槽都必须重跑校验脚本，不得手调**。原文注释明确记录：

```
--cf-chart-1: #0d95b5;   --cf-chart-5: #e87ba4;
--cf-chart-2: #eb6834;   --cf-chart-6: #008300;
--cf-chart-3: #4a3aa7;   --cf-chart-7: #2a78d6;
--cf-chart-4: #eda100;   --cf-chart-8: #e34948;

--cf-chart-good: #10b981;
--cf-chart-warning: #f59e0b;
--cf-chart-critical: #f43f5e;
```

从 `index.css` 注释提取的**必须遵守的规则**：

| # | 规则 | 出处 |
| --- | --- | --- |
| 1 | 这 8 个色**只用于图表标记**（线/柱/扇/点/图例色块），**文字一律用 `--cf-fg-*` 墨色**，不得用图表色写字 | 注释原文 |
| 2 | 槽位按固定顺序分配，**不循环**。第 9 个系列不是再生成一个色，而是并入「其它」或改用分面 | 注释原文 |
| 3 | **槽 4（#eda100，白底 2.17:1）与槽 5（#e87ba4，2.69:1）低于 3:1**，校验器判为"需要补偿"。用到这两槽的图**必须有可见图例或直标** | 注释原文，2026-08-06 实测 |
| 4 | 状态三色与分类 8 槽**互不混用**：分类槽答"这是哪个系列"，状态色答"这个值处于什么状态"。超时=warning、异常=critical 这类带状态语义的系列用状态色，不占分类槽 | 注释原文 |
| 5 | 状态色**亮暗同值**，故意不放进 `html.dark` 覆盖 —— 状态色是固定语义，换主题变色会让"红=严重"约定不稳 | 注释原文 |
| 6 | 用到状态色的地方**必须带可见标签**（状态色的补偿手段是图标+文字标签，不是靠色相区分） | 注释原文 |
| 7 | 改色板必须重跑 `dataviz` 技能的 `scripts/validate_palette.js` 六项检查（亮度带、彩度下限、CVD 相邻分离、常视力下限、对比度） | 注释原文 |

**这意味着**：图表库的默认配色**必须整体禁用**，全部走 CSS 变量。这是本 PRD 的第一验收项。

### 2.3 暗色模式
项目有 `html.dark` 主题与 `theme-mode-switcher.tsx`。分类 8 槽在暗色下有覆盖值，状态三色亮暗同值（规则 5）。图表必须响应主题切换。

## 3. 选型

### 3.1 建议：ECharts（Apache-2.0）

| 维度 | ECharts | Recharts | 结论 |
| --- | --- | --- | --- |
| 许可证 | Apache-2.0 | MIT | 都可用 |
| 图表类型 | 最全（含漏斗、桑基、热力、气泡、雷达） | 常规类型为主，无漏斗/桑基 | **ECharts** —— CRM 销售漏斗（CRM-02/09）、工作流耗时分布、风险气泡图（现有 PerformanceStats 已有）都需要 |
| React 集成 | 需薄封装（或 echarts-for-react） | 原生 React 组件 | Recharts 略优，但封装成本可控 |
| 按需引入 | 支持（`echarts/core` + 按需注册） | 天然按需 | 都可控 |
| 中文生态 | 最好 | 一般 | ECharts |
| 与 unity2 视觉风格对齐 | 配置项细粒度更高，易对齐 | 定制受组件 API 限制 | ECharts |

**选 ECharts**，理由：图表类型覆盖后续全部需求（尤其漏斗与气泡），配置粒度足够精细以严格对齐 dataviz 色板与 unity2 风格。

**不引入 `echarts-for-react`**：该封装已久未大更新，且我们需要的封装逻辑（色板注入、主题响应、resize、按需注册）自己写更可控，约 150-200 行。

### 3.2 包体积控制
- 用 `echarts/core` + 按需 `use()` 注册，**不 import 全量 `echarts`**
- 首期只注册需要的图表与组件：`LineChart` / `BarChart` / `PieChart` / `ScatterChart` / `FunnelChart` + `GridComponent` / `TooltipComponent` / `LegendComponent` / `DataZoomComponent` / `TitleComponent` + `CanvasRenderer`
- 目标：图表相关 gzip 后增量 < 350KB
- Vite 配置里图表库单独 chunk，配合路由懒加载，非看板页不加载

## 4. 范围

### 4.1 做
1. 引入 ECharts 并配置按需注册与独立 chunk
2. 封装 `<Chart>` 基础组件：色板注入、主题响应、resize 监听、loading/empty 态、无障碍属性
3. 封装常用图表预设：折线、柱状、环形/饼、散点/气泡、漏斗、指标卡
4. 迁移四处手写图表
5. 图表使用规范文档（写进 `cloudflow-frontend/docs/`）

### 4.2 不做
| 项 | 原因 |
| --- | --- |
| 图表配置界面 | LC-06 负责 |
| 大屏 | 无业务诉求 |
| 迁移图标类 SVG | `Tooltip.tsx` / `CustomTitleBar.tsx` 里是图标不是图表 |
| 改色板取值 | 已校验通过，规则 7 明确禁止手调 |
| 服务端图表渲染 | 打印模板（LC-07）需要时再评估 |

## 5. 功能需求

### FR-1 `<Chart>` 基础组件
- FR-1.1 Props：`option`（ECharts 配置）、`height`、`loading`、`empty`、`onEvents`、`className`
- FR-1.2 **色板自动注入**：组件内部读取 CSS 变量 `--cf-chart-1..8` 与 `--cf-chart-good/warning/critical`，注入 ECharts `color` 数组；调用方不写死 hex
- FR-1.3 **主题响应**：监听 `html.dark` class 变化，重新读取 CSS 变量并更新图表（分类槽有暗色覆盖值，状态色不变）
- FR-1.4 容器 resize 时自动 `resize()`（ResizeObserver）
- FR-1.5 组件卸载时 `dispose()`，防内存泄漏
- FR-1.6 loading 态复用现有 `Skeleton.tsx`；empty 态复用现有 `EmptyState.tsx`
- FR-1.7 文字颜色统一取 `--cf-fg-*`（规则 1），组件内置到 textStyle/axisLabel/legend 默认配置

### FR-2 图表预设
提供预配置组件，内置符合规范的默认项：

| 组件 | 用途 | 内置规范 |
| --- | --- | --- |
| `<LineChart>` | 趋势 | 平滑关闭（数据准确优先）、tooltip axis 触发、超 30 点自动开 dataZoom |
| `<BarChart>` | 对比、分布 | 支持横竖向、堆叠 |
| `<DonutChart>` | 占比 | 中心可放总数、**默认开图例**（因可能用到槽 4/5，规则 3） |
| `<ScatterChart>` | 气泡（迁移 PerformanceStats 风险气泡图） | 坐标轴必带名称、tooltip 必带完整维度值（规则 6） |
| `<FunnelChart>` | CRM 销售漏斗（供 CRM-02/09 使用） | 各段带标签与转化率 |
| `<MetricCard>` | 单指标 + 同比环比 | 复用现有 `StatCard.tsx`，只补趋势迷你图 |

- FR-2.1 每个预设的 `series` 超过 8 个时**开发期告警**并提示按规则 2 处理（并入「其它」或改分面），不静默循环取色
- FR-2.2 状态语义系列（超时/异常/风险）通过 `semantic` prop 指定，自动用状态三色且**强制显示标签**（规则 4/6）

### FR-3 迁移现有图表
| # | 对象 | 要求 |
| --- | --- | --- |
| FR-3.1 | `UserDashboardCharts.tsx`（602 行，4 个 DONUT + DistributionCard + TrendCard） | 迁移后**亮色像素级视觉基本一致**（色板取值不变，规则 7 保证），行数应显著下降 |
| FR-3.2 | `PerformanceStats.tsx`（1595 行，4 处 SVG 含风险气泡图） | 风险气泡图迁移为 `<ScatterChart>`，保留现有 tooltip 与坐标轴（规则 6 要求） |
| FR-3.3 | `HrPerformanceDistributionPanel.tsx`（313 行） | 绩效分布迁移为 `<BarChart>` |
| FR-3.4 | `dashboard-chart.css`（133 行） | 保留布局类（`-card`/`-grid`/`-suite`），删除纯图形绘制相关样式 |

### FR-4 无障碍
- FR-4.1 图表容器带 `role="img"` 与 `aria-label`（描述图表内容与关键结论）
- FR-4.2 提供"查看数据表"切换，图表可切为等价数据表格（键盘与读屏可访问）
- FR-4.3 不依赖单一色相传达信息：多系列图必带图例，状态色必带文字标签（规则 3/6）

### FR-5 使用规范文档
在 `cloudflow-frontend/docs/CHART-USAGE.md` 写明：色板七条规则、预设组件用法、何时用状态色 vs 分类槽、超 8 系列怎么办、无障碍要求。

## 6. 非功能需求

| 项 | 要求 |
| --- | --- |
| 包体积 | 图表相关 gzip 增量 < 350KB；单独 chunk；非看板路由不加载 |
| 首屏 | 看板页图表懒加载，不阻塞首屏 |
| 渲染性能 | 1000 数据点折线渲染 < 300ms；开启 `large` 模式阈值可配 |
| 内存 | 组件卸载必 dispose；反复切换路由无泄漏 |
| 主题切换 | 切换暗色后图表 ≤ 300ms 内更新，无闪白 |
| 色板合规 | **图表配置中不得出现硬编码 hex 颜色**，全部走 CSS 变量 |
| 兼容 | 与现有 Tailwind 4 主题体系共存，不引入全局样式污染 |
| PWA/Tauri | 离线环境下图表可用（ECharts 本地打包，无 CDN 依赖） |

## 7. 验收标准

| # | 验收项 |
| --- | --- |
| AC-1 | **全仓图表代码中搜不到硬编码 hex 颜色**，颜色全部来自 `--cf-chart-*` CSS 变量 |
| AC-2 | 切换暗色主题，图表分类色按暗色覆盖值更新；**状态三色保持不变**（规则 5） |
| AC-3 | 图表文字（坐标轴标签、图例文字、tooltip 文字）颜色为 `--cf-fg-*` 墨色，非图表色（规则 1） |
| AC-4 | 用到槽 4 或槽 5 的图表**必有可见图例或直标**（规则 3） |
| AC-5 | 状态语义系列（超时/异常）用状态三色且带文字标签；**未占用分类槽**（规则 4/6） |
| AC-6 | 系列数超过 8 时开发期给出告警，不静默循环取色（规则 2） |
| AC-7 | `UserDashboardCharts` 迁移后亮色视觉与迁移前基本一致（色板取值未变） |
| AC-8 | `PerformanceStats` 风险气泡图迁移后保留 tooltip 与坐标轴名称 |
| AC-9 | 四处手写图表全部迁移完成，`dashboard-chart.css` 中纯绘制样式已清理 |
| AC-10 | 图表相关打包 gzip 增量 < 350KB，且为独立 chunk |
| AC-11 | 容器 resize 时图表自适应；路由反复切换 20 次无内存增长 |
| AC-12 | 图表带 `role="img"` 与有意义的 `aria-label`；可切换为数据表格视图 |
| AC-13 | `npm run type-check` 与 `npm run build` 通过 |
| AC-14 | `CHART-USAGE.md` 已产出并含色板七条规则 |

## 8. 依赖与风险

### 8.1 依赖
| 依赖 | 说明 |
| --- | --- |
| ECharts（新增，Apache-2.0） | 唯一新增依赖 |
| 现有 dataviz 色板（`index.css`） | 硬约束来源 |
| 现有 `Skeleton.tsx` / `EmptyState.tsx` / `StatCard.tsx` | 复用 |

### 8.2 被依赖
| 后续条目 | 需要什么 |
| --- | --- |
| LC-06 自助报表（受限版） | 全部图表类型的渲染层 |
| CRM-02 营销 ROI 看板 | 漏斗图、转化率 |
| CRM-09 商机阶段 | 漏斗图 |
| 工作流监控看板增强 | 折线、柱状、气泡 |
| HR 各类统计 | 柱状、饼图 |

### 8.3 风险

| 风险 | 应对 |
| --- | --- |
| **迁移后视觉不一致，用户感知为"改坏了"** | AC-7 要求亮色视觉基本一致；色板取值不变是前提（规则 7 禁止改色板）；迁移逐个页面进行并附前后对比截图 |
| 包体积超预算 | 严格按需注册；AC-10 卡阈值；必要时首期只上折线/柱状/环形三类，漏斗与气泡随需求追加 |
| 开发绕过 `<Chart>` 封装直接用 ECharts 硬编码颜色 | AC-1 全仓扫描硬编码 hex；可加 ESLint 规则或 CI 检查禁止图表文件出现 hex |
| ECharts 默认配色覆盖不彻底，某些图表类型仍出现默认色 | `<Chart>` 内统一设置 `color` 数组并覆盖各 series 默认；AC-1 逐图验证 |
| 手写图表里可能有业务定制逻辑（如特殊标注）迁移丢失 | 迁移前逐个梳理 602 行与 1595 行里的定制点，列清单后迁移 |
| 状态色被误用为分类色（规则 4 违反） | 预设组件用 `semantic` prop 显式区分；Code Review 检查项 |

## 9. 里程碑

| 阶段 | 内容 | 可验收 |
| --- | --- | --- |
| M1 | 引入 ECharts + 按需注册 + 独立 chunk + `<Chart>` 基础组件（色板注入、主题响应、resize、dispose） | AC-1/2/3/10/11/13 |
| M2 | 六个预设组件 + 系列数与状态色规范约束 | AC-4/5/6/12 |
| M3 | 迁移 `UserDashboardCharts`（4 DONUT + 分布卡 + 趋势卡） | AC-7 |
| M4 | 迁移 `PerformanceStats` 4 处 SVG + `HrPerformanceDistributionPanel` + CSS 清理 | AC-8/9 |
| M5 | `CHART-USAGE.md` + CI 硬编码颜色检查 | AC-14 |

## 10. 待确认

| # | 问题 | 建议默认 |
| --- | --- | --- |
| 1 | 首期上全部六个预设还是先三个 | 建议先上折线/柱状/环形（覆盖现有四处迁移），漏斗与气泡在 M2 补（气泡 PerformanceStats 要用，实际也要 M2 上） |
| 2 | 是否加 CI 规则禁止图表文件出现 hex 颜色 | 建议加，否则 AC-1 只能靠人工 review 保证 |
| 3 | `MetricCard` 是新组件还是扩展现有 `StatCard.tsx` | 建议扩展 `StatCard.tsx` 加可选迷你趋势图，避免两个相似组件 |
| 4 | 迁移是否要求像素级一致 | 建议"亮色视觉基本一致"即可（色板不变前提下），交互增强（tooltip/图例）属预期改善不算不一致 |
