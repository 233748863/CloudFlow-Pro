# 前端按钮组件（Button）统一规范化审计与重构计划

陛下，为了确保整个 CloudFlow Pro 前端系统的 UI 风格一致性、避免各个页面单独编写零散的样式，同时提升系统的可维护性与无障碍（Accessibility）支持，我们对前端代码库（包含 `components`、`pages`、`mobile` 目录）进行了全面审计。

以下为陛下呈递的审计结果与重构升级计划。

---

## 1. 核心治理目标与组件标准

### 1.1 统一目标组件
本项目拥有一个封装良好且支持多主题（暗色/亮色）和多变体（Variant）的公共按钮组件：
- **组件路径**：`@/components/common/button`（文件名：`cloudflow-frontend/src/components/common/button.tsx`）
- **核心定义**：
  ```tsx
  interface ButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
    variant?: 'default' | 'outline' | 'ghost' | 'link' | 'secondary' | 'destructive' | 'warning' | 'success' | 'soft' | 'contrast';
    size?: 'default' | 'sm' | 'lg' | 'xl' | 'icon';
  }
  ```

### 1.2 按钮分类定义（关键决策）
并非所有的 `<button>` 标签都应该被粗暴地替换为 `<Button>` 组件。为了避免样式错乱和基础 UI 破坏，我们设定了严格的分类边界：

| 类别 | 定义 | 处理建议 |
| :--- | :--- | :--- |
| **语义化操作按钮 (Semantic Action Buttons)** | 业务上的动作，如 “保存”、“新建”、“查询”、“重置”、“删除”、“提交”。 | **必须替换为 `<Button>`**，并采用标准的 `variant` 与 `size`。 |
| **基础 UI 变体/基础套件 (UI Primitives)** | 诸如 `Switch`、`Tabs`、`SegmentedControl`、`DatePicker` 以及通用 `dialog` 底层。 | **严禁替换**。这些基础原子组件使用原生 `<button>` 是为了维持特定的 headless 交互与 WAI-ARIA 属性，且替换会造成循环依赖。 |
| **布局与交互容器 (Layout & Custom Controllers)** | 树节点展开/收起（如部门树展开）、任务卡片整条点击、自定义系统窗口控制栏（最小化/最大化/关闭按钮）、通知铃铛触发器。 | **保持原生**。这些元素在结构上作为容器或轻量交互块使用，不带常规按钮的 padding、边框与投影。 |

---

## 2. 页面与组件审计清单及重构路线

### 2.1 `pages` 目录（PC 桌面端页面）

以下列出了含有原生 `<button>` 标签的桌面端业务页面、审计判定以及重构建议：

| 页面路径 | 所在行号 | 当前代码片段简述 | 审计判定 | 具体重构方案 |
| :--- | :--- | :--- | :--- | :--- |
| `src/pages/AuthPage.tsx` | L519+ | `cf-auth-retry-button` 等重试与登录动作按钮。 | 语义化按钮 | 引入 `Button`，将 `cf-auth-retry-button` 改为 `Button`，统一登录页的交互手势及暗色支持。 |
| `src/pages/ContactPage.tsx` | L239, L246 | 部门树的展开收起按钮与部门节点点击。 | 布局与交互容器 | **保持原生**。树节点的触控状态和自定义行为不属于常规按钮。 |
| `src/pages/CopyListPage.tsx` | L425 | 抄送列表中的卡片折叠/展开。 | 布局与交互容器 | **保持原生**。属于结构性交互。 |
| `src/pages/CrmCustomerWorkspacePage.tsx` | L333+ | 客户工作区中的标签页切换/折叠栏。 | 布局与交互容器 | **保持原生**。属于局部交互。 |
| `src/pages/ExpenseClaimPage.tsx` | L852 | 报销明细中的 “删除明细” 按钮（带红色边框与 Trash2 图标）。 | **语义化操作按钮** | **必须替换**。<br>原代码：<br>`<button className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600 ...">` <br>建议重构为：<br>`<Button variant="destructive" size="icon" className="h-10 w-10 rounded-lg bg-white border border-rose-200 text-rose-600 hover:bg-rose-50 ...">` |
| `src/pages/FormDesign.tsx` | L228 | 表单设计列表中的表单卡片选项切换。 | 布局与交互容器 | **保持原生**。属于卡片型选项列表。 |
| `src/pages/KnowledgePage.tsx` | L688, L928 | 知识库侧边栏分类切换等。 | 布局与交互容器 | **保持原生**. |
| `src/pages/MeetingRoomPage.tsx` | L155+ | 日历视图中的日期格子或自定义排期块。 | 布局与交互容器 | **保持原生**。日历网格及排班条具有高度定制的宽高与背景。 |
| `src/pages/PerformanceStats.tsx` | L644 | 性能统计图表项切换。 | 布局与交互容器 | **保持原生**。 |
| `src/pages/ProjectManagementPage.tsx` | L210, L230 | 项目阶段切换自定义按钮。 | 布局与交互容器 | **保持原生**。 |
| `src/pages/PurchaseRequestPage.tsx` | L690 | 采购单删除明细。 | **语义化操作按钮** | **必须替换**。使用 `Button` 替代，并设为 `variant="destructive"` 保持全局红字警告色一致。 |
| `src/pages/SchedulePage.tsx` | L949, L958 | 日历或日程中的快速控制。 | 布局与交互容器 | **保持原生**。 |
| `src/pages/TaskListPage.tsx` | L144 | 任务列表中整条任务卡片的点击区。 | 布局与交互容器 | **保持原生**。该 button 承载整个卡片的无障碍点击，不应用 `.btn` 样式。 |

---

### 2.2 `mobile` 目录（移动端业务页面）

移动端页面目前为了极简加载以及针对触屏手势进行高度定制，绝大多数操作（包含返回、导航、筛选、切换）都使用原生 `<button>` 并配合 Tailwind 自定义样式（如 L12/L14 高度触控面）。

#### 移动端重构建议：
- **原则上保持高定原生 `<button>`**：由于移动端返回按钮、底部固定操作栏（通常带有 `w-full h-12 bg-teal-600 text-white rounded-xl font-medium` 样式）需要完美的全面屏安全区适配与触手振动反馈，直接套用 PC 端 `.btn` 样式（带默认投影和偏小的 padding）可能会导致样式收缩和点击域（Touch Target）变小。
- **推荐策略**：在后续迭代中，若要统一移动端样式，建议在 `cloudflow-frontend/src/components/mobile/` 下封装专门的 `MobileButton.tsx` 组件，承载 `h-12` 高触控面设计，而不是直接将 PC 端 Button 引入移动端。

---

### 2.3 `components` 目录（共享组件库）

| 组件路径 | 所在行号 | 场景简述 | 判定与重构建议 |
| :--- | :--- | :--- | :--- |
| `src/components/FileUpload.tsx` | L146 | 已上传文件右侧的 `X` 移除按钮。 | **保持原生**。这是一个精细 of icon 按钮，具有独特的 hover text-red-500 和 group 隐藏显示类，原生更适合。 |
| `src/components/FormBuilder.tsx` | L125+ | 字段配置区拖入、删除、上移、下移。 | **语义化辅助按钮**。可重构为使用 `Button` 设为 `variant="ghost" size="icon"`，这样可以统一所有的操作反馈和聚焦边框。 |
| `src/components/OrgStructure.tsx` | L242+ | 组织架构树操作（展开、新建、删除子级）。 | **语义化辅助按钮**。可将部门卡片底部自定义的操作字样与按钮，引入 `Button` 对应的 `variant`。 |
| `src/components/header/HeaderUserMenu.tsx` | L82+ | 右上角头像及下拉菜单项切换。 | **保持原生**。属于菜单级交互容器，不应当被添加默认 `.btn` 样式。 |
| `src/components/layout/CustomTitleBar.tsx` | L92+ | Tauri 原生窗口顶部控制按钮。 | **保持原生**。用于窗口操纵（Minimize, Maximize, Close）。 |

---

## 3. 具体重构代码规范示例（以删除明细按钮为例）

### 3.1 改造前（原生自定义样式）
```tsx
<button
  type="button"
  onClick={() => removeItem(index)}
  className="inline-flex h-10 w-10 items-center justify-center rounded-lg border border-rose-200 bg-white text-rose-600 transition-colors hover:bg-rose-50 hover:text-rose-700 dark:border-rose-900 dark:bg-slate-950 dark:text-rose-300 dark:hover:bg-rose-950/30"
  aria-label="删除明细"
  title="删除明细"
>
  <Trash2 size={14} />
</button>
```

### 3.2 改造后（使用公共 `Button` 组件）
```tsx
import { Button } from '@/components/common/button'; // 或者是 '@/components/common'

<Button
  type="button"
  variant="destructive" // 映射 destructive 变体，统一红字警告边框与行为
  size="icon"           // 设为 icon 尺寸，自动映射 btn-icon 高宽，保持与其他图标按钮一致
  onClick={() => removeItem(index)}
  className="rounded-lg bg-white hover:bg-rose-50 dark:bg-slate-950 dark:hover:bg-rose-950/30 border border-rose-200 dark:border-rose-900" // 仅保留特殊的高亮底色微调
  aria-label="删除明细"
  title="删除明细"
>
  <Trash2 size={14} />
</Button>
```

---

## 4. 验证与测试步骤

重构进行时，陛下可以使用以下手段验证重构质量：
1. **静态类型检查**：
   运行命令 `npm run type-check` 以确保所有的 `Button` 参数均满足 `ButtonProps` 定义，没有发生类型丢失。
2. **多主题回归测试**：
   逐一打开重构过的页面，切换日间模式/夜间模式，确保按钮在聚焦（Focus）、悬停（Hover）、点击（Active）和禁用（Disabled）状态下拥有完美的样式过渡，不再有硬编码写死的突兀背景色。
