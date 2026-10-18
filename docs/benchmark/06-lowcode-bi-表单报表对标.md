# 低代码表单与报表 BI 对标调研

> 本文档独立可用。调研时间 2026-08-31，我方基线为实测前端源码与依赖清单。

## 一、许可证规则

| 分类 | 项目 | 使用方式 |
| --- | --- | --- |
| 可读可借鉴实现 | amis(Apache-2.0, 18.9k)、form-create(MIT, 7.1k)、formily(MIT, 12.6k)、univer(Apache-2.0, 14.3k)、ureport(Apache-2.0, 2.2k)、appsmith(Apache-2.0, 40.8k)、JeecgBoot(Apache-2.0) | 可参照实现思路与代码结构 |
| 仅借鉴业务设计 | dataease(GPL-3.0, 24.4k) | 只提取设计，禁止复制代码 |
| 需逐项复核 | metabase(NOASSERTION, 49k)、nocodb(NOASSERTION, 64.8k)、budibase(NOASSERTION, 28.2k)、variant-form(NOASSERTION) | 使用前确认条款 |
| 可用（Apache-2.0） | superset(Apache-2.0, 74.6k) | 可参照 |

**注意**：form-create / formily / variant-form / amis 均为 **Vue 或自有渲染体系**，我们是 React 19。这些项目的价值是**参照其表单 Schema 设计与组件能力清单**，不是直接引入依赖。

## 二、我们的现状基线（实测）

前端依赖共 38 个（`cloudflow-frontend/package.json`）。与本模块相关的：
- **有**：`@xyflow/react` 12.11.1（流程设计器画布）、`@dnd-kit/*`（拖拽）、`@fullcalendar/*`（日历）、`react-window` 2.2.6（虚拟列表）、`marked` 18（Markdown）、`dompurify` 3.3.1（XSS 净化）
- **没有**：**任何图表库**（无 ECharts / Recharts / Chart.js / D3）、**任何表单引擎**（无 react-hook-form / formily / zod）、任何表格组件库（无 AG Grid / TanStack Table）

自研组件实测：
- `components/FormBuilder.tsx`（791 行）—— 自研可视化表单设计器
- `components/FormRenderer.tsx` + `components/mobile/MobileFormRenderer.tsx` —— 表单渲染（含移动端）
- `utils/formDefinition.ts` + `utils/formFieldRuntime.ts` + `utils/workflowFormDisplay.ts`
- `pages/FormDesign.tsx` —— 表单设计页
- `components/user/dashboard/UserDashboardCharts.tsx` + `styles/features/dashboard-chart.css` —— **图表是手写 CSS/SVG 实现的**

表单字段类型实测（`src/types.ts` 的 `FormFieldType`）—— **共 9 种**：
`TEXT | NUMBER | DATE | SELECT | TEXTAREA | EMPLOYEE | DEPT | POST | POSITION`

字段配置能力实测（`FormField` 接口）：`required, options, placeholder, readonly, displayFieldId, fillMappings（联动填充）, filterByDeptFieldId（按部门过滤）, onlyActive, regex + errorMsg（正则校验）`

后端：`wf_form_definition` 表存表单定义，`FormDefinition` 只有 `id / name / fields[]`（无版本、无布局、无权限）。

**结论：表单引擎的"基础字段 + 联动 + 正则校验"已有，但字段类型只有 9 种，缺布局能力、缺明细子表、缺字段级权限；报表 BI 几乎为零（图表手写、无自助分析、无中式复杂报表）。**

## 三、功能深度差距矩阵

深度等级：`0`=无 / `1`=有雏形 / `2`=可用 / `3`=完整

| 能力项 | 我们 | form-create / formily / amis | dataease / metabase / ureport | 差距判定 |
| --- | --- | --- | --- | --- |
| 表单字段类型数 | **9 种** | form-create 约 20+ / amis 100+ 组件 | — | **重点缺口** |
| 上传/图片/附件字段 | 有独立 `FileUpload` 组件但非表单字段类型 | 3 | — | 缺口 |
| 明细子表（一对多） | **0** | 3（amis input-table / formily ArrayTable） | — | **重点缺口** |
| 表单布局（分栏/分组/标签页） | **0**（线性排列） | 3（Grid/Group/Tabs 容器组件） | — | **重点缺口** |
| 字段级权限（可见/可编辑） | 1（`readonly` 全局） | 2（按角色/按流程节点） | — | **重点缺口** |
| 字段联动（显隐/计算） | 1（`fillMappings` 填充联动） | 3（amis 表达式 / formily reactions 支持显隐+计算+校验联动） | — | 缺口 |
| 表单版本管理 | **0** | 1 | — | 缺口 |
| 表单打印模板 | **0** | 2 | 3（ureport 中式报表） | 缺口 |
| 图表库 | **0（手写 CSS/SVG）** | — | 3 | **重点缺口** |
| 自助数据分析 | **0** | — | 3（dataease/metabase 拖拽出图） | 缺口 |
| 仪表盘编排 | 1（固定布局的 dashboard 页） | — | 3（拖拽布局 + 联动筛选） | 缺口 |
| 中式复杂报表（交叉/分组小计） | **0** | — | 3（ureport 纯 Java 报表引擎） | 缺口 |
| 报表导出 | 2（后端有 FastExcel + POI，CSV 导出已实现） | — | 3 | 相当 |
| 在线表格编辑 | **0** | — | univer 3 | 小缺口 |
| 大屏可视化 | **0** | — | 2 | 不做 |

## 四、可移植条目

### [LC-01] 表单字段类型扩展（9 → 20+）
- **参考来源**：`xaboy/form-create`（MIT，可参照实现）→ 组件清单；`baidu/amis`（Apache-2.0）→ 表单类组件；`alibaba/formily`（MIT）
- **参考实现怎么做的**：form-create 与 amis 的字段类型大致覆盖：文本/多行文本/数字/金额/日期/日期区间/时间/下拉/多选下拉/级联选择/单选组/复选组/开关/滑块/评分/上传文件/上传图片/富文本/颜色/地区选择/子表格/说明文本/分隔线/隐藏域。amis 用 JSON Schema 描述，`type` 字段决定组件，`visibleOn`/`disabledOn` 用表达式控制状态。
- **我们现状**：9 种（`TEXT/NUMBER/DATE/SELECT/TEXTAREA/EMPLOYEE/DEPT/POST/POSITION`）。其中 `EMPLOYEE/DEPT/POST/POSITION` 四种组织类字段是我们特有的优势（参考项目没有内建组织选择器）。缺的是通用字段类型：**金额、日期区间、多选、级联、开关、评分、上传、富文本、地区、说明文本、隐藏域**。审批单里"上传附件"这么基础的能力都不是表单字段（要靠独立 `FileUpload` 组件）。
- **落地改动**：
  - `FormFieldType` 扩展：`AMOUNT, DATE_RANGE, DATETIME, TIME, MULTI_SELECT, CASCADER, RADIO_GROUP, CHECKBOX_GROUP, SWITCH, SLIDER, RATE, UPLOAD_FILE, UPLOAD_IMAGE, RICH_TEXT, COLOR, REGION, DICT_SELECT（对接现有 `sys_dict_data`）, USER_MULTI, DEPT_MULTI, DESCRIPTION, DIVIDER, HIDDEN`
  - `FormField` 增配置：`min/max/precision`（数字与金额）、`accept/maxSize/maxCount`（上传）、`dictType`（字典下拉直接读 `sys_dict_type`，避免手填 options）、`defaultValue`、`defaultValueExpr`
  - `FormBuilder.tsx`（791 行）扩展设计器面板；`FormRenderer.tsx` + `MobileFormRenderer.tsx` 同步扩展
  - 富文本必须过 `dompurify`（已在依赖里）净化，**防 XSS**
  - `UPLOAD_*` 字段对接 `sys_file`（并配合 05 文档 SYS-04 的签名 URL 改造）
  - 后端 `wf_form_definition` 的 `fields_json` 是 JSON，无需改表结构；但需补服务端校验（**当前若只有前端校验，是可绕过的**，服务端必须按 schema 校验提交值）
- **工作量**：L（前端为主：设计器 + 2 个渲染器 + 服务端校验器）
- **优先级**：P0 —— 表单是工作流的载体，9 种字段类型限制了所有审批场景；「上传附件不是表单字段」是最突出的短板

### [LC-02] 表单布局容器（分栏 / 分组 / 标签页）
- **参考来源**：`alibaba/formily`（MIT）→ `FormGrid`/`FormLayout`/`FormTab`/`FormCollapse`；`baidu/amis`（Apache-2.0）→ `grid`/`fieldSet`/`tabs` 容器组件
- **参考实现怎么做的**：布局是**容器型字段**，嵌套在 fields 数组里，容器有自己的 children。formily 的 `FormGrid` 支持 `maxColumns/minColumns` 响应式列数；`FormTab` 把长表单拆成多个标签页。
- **我们现状**：`FormDefinition.fields` 是**扁平数组**，字段线性从上到下排列。一个 30 字段的采购申请表只能拉成一长条，无法分区（基本信息/供应商信息/明细/附件）。
- **落地改动**：
  - `FormField` 增容器类型：`GROUP`（分组标题+边框）、`GRID`（分栏，带 `columns` 与 `span`）、`TABS`（标签页）、`COLLAPSE`（折叠面板）
  - `FormField` 增 `children?: FormField[]`（结构从扁平数组改为树）；**这是破坏性结构变更，项目未上线可直接改，`wf_form_definition.fields_json` 直接用新结构**
  - 渲染器改为递归渲染；移动端渲染器把 GRID 降级为单列（响应式）
  - `FormBuilder` 支持容器内拖拽（`@dnd-kit` 已在依赖，支持嵌套排序）
- **工作量**：M（结构改造 + 递归渲染 + 嵌套拖拽）
- **优先级**：P0 —— 与 LC-01 同批做，两者都改 FormBuilder/Renderer，拆开做要改两遍

### [LC-03] 明细子表字段（一对多）
- **参考来源**：`baidu/amis`（Apache-2.0）→ `input-table`；`alibaba/formily`（MIT）→ `ArrayTable`；ERPNext 的 `Table` fieldtype（GPL-3.0 仅借鉴设计，但它是 doctype 子表机制的核心）
- **参考实现怎么做的**：子表字段本身是一个数组，内部定义列（每列又是一个字段定义），运行时可增删行、行内校验、列合计。ERPNext 里几乎每张单据都靠子表（`items`、`payables`、`time_logs`），是企业单据的基本形态。
- **我们现状**：没有。但后端已经大量存在"主表 + 明细表"结构：`biz_expense_claim` + `biz_expense_item`、`biz_purchase_request` + `biz_purchase_item`、`crm_quote` + `crm_quote_line`、`oa_budget_plan` + `oa_budget_line`。**这些明细都是靠专用页面写死的，走工作流表单时无法动态配置。**
- **落地改动**：
  - `FormField` 增类型 `SUB_TABLE`，配置 `columns: FormField[]`、`minRows/maxRows`、`summaryColumns[]`（合计列）、`allowAdd/allowDelete`
  - 渲染器实现行内编辑表格（`react-window` 已在依赖，行数多时可虚拟滚动）
  - 提交值为二维结构，服务端校验需支持嵌套
  - 移动端降级为卡片列表式编辑
- **工作量**：M
- **优先级**：P1（依赖 LC-02 的树形结构改造）

### [LC-04] 字段级权限与流程节点联动
- **参考来源**：`baidu/amis`（Apache-2.0）→ `visibleOn`/`disabledOn` 表达式；`L1yp/van`（MIT）→ 流程节点与表单字段权限绑定的实战做法
- **参考实现怎么做的**：字段的可见性与可编辑性由表达式或配置决定，van 的做法是把"流程节点 × 表单字段 × 权限"做成配置矩阵（发起人可编辑金额，部门经理只读，财务可改付款方式）。
- **我们现状**：`FormField.readonly` 是静态全局标记。同一张表单在不同审批节点看到的字段完全一样 —— 这意味着敏感字段（如薪资、成本价）在整条审批链上对所有审批人可见，**既是体验问题也是数据最小化的合规问题**。
- **落地改动**：
  - 新增 `wf_form_field_permission`：`definition_id, node_key, field_id, visible_flag, editable_flag, required_flag`（按流程节点覆盖字段权限）
  - `FormField` 增 `visibleExpr` / `disabledExpr`（表达式，**用白名单变量 + 受限求值，不用 eval**）
  - 表单数据下发时**服务端过滤不可见字段**（不能只靠前端隐藏，否则接口仍返回敏感值）
  - `FormRenderer` 按节点权限渲染
- **工作量**：M
- **优先级**：P1 —— 含一个实际的数据暴露修复（当前敏感字段全链可见）

### [LC-05] 引入图表库替代手写图表
- **参考来源**：现状是 `components/user/dashboard/UserDashboardCharts.tsx` + `dashboard-chart.css` 手写实现
- **参考实现怎么做的**：（本条不是移植外部项目，是补齐基础设施）主流选择：ECharts（Apache-2.0，中文生态好、图表类型最全）、Recharts（MIT，React 原生、API 简洁）、visx（MIT，底层灵活）。
- **我们现状**：**依赖清单里没有任何图表库**，仪表盘图表用 CSS/SVG 手写。这意味着：① 新增图表类型成本高；② 无交互（缩放/图例切换/tooltip）；③ 各处图表风格不统一。而项目里已有多处需要图表：`PerformanceStats.tsx`、`WorkflowMonitorController` 的 overview/trend/performance-dashboard、`CrmDashboardController`、HR 绩效分布面板（`HrPerformanceDistributionPanel`）。
- **落地改动**：
  - 选型建议 **ECharts**（Apache-2.0，与 unity2 参考站的视觉风格更容易对齐，且饼图/漏斗/桑基/热力图等类型齐全，CRM 销售漏斗、工作流耗时分布都需要）
  - 封装统一 `<Chart>` 组件承接主题（配合已有 Tailwind 4 主题与 `unity2-refresh.css`）
  - 迁移现有手写图表；`UserDashboardCharts.tsx` 优先
  - **注意包体积**：按需引入 ECharts 模块，不全量打包（当前 Vite 6 支持 tree-shaking）
- **工作量**：M
- **优先级**：P0 —— 这是最低成本、最高可见收益的一条；后续所有看板类需求都被它卡着

### [LC-06] 自助报表与数据集
- **参考来源**：`dataease/dataease`（GPL-3.0，**仅借鉴设计**，24.4k）；`metabase/metabase`（NOASSERTION 需复核，49k）；`apache/superset`（Apache-2.0, 74.6k，可参照实现）
- **参考实现怎么做的**：三层模型 —— **数据源 → 数据集（SQL 或拖拽建模）→ 图表 → 仪表盘**。用户选维度和度量即出图，无需开发。权限落在数据集层（行级权限）。
- **我们现状**：所有报表都是后端写死接口（`/workflow/statistics/metrics`、`/crm/dashboard/summary`、`/oa/workplace/summary` 等）+ 前端固定页面。业务方要一个新口径就要走一轮开发。
- **落地改动**（**已确认采用受限版：只允许预置数据集，不开放自由 SQL**）：
  - 新增 `sys_report_dataset`：`dataset_id, dataset_code, dataset_name, module(system/oa/crm/hr/workflow), mapper_method（指向 XML mapper 里的查询方法）, field_meta(JSON: 字段名/中文名/类型/维度或度量/是否可筛选), default_filters(JSON), tenant_isolated_flag, data_scope_flag（是否套用现有 sys_role 数据权限）, permission_code, status, remark`
    - **关键差异**：**没有 `source_sql` 字段**。数据集的 SQL 由开发预先写在 XML mapper 里（符合项目"禁止 Java 拼接 SQL"约束），数据集记录只是"这个查询叫什么、有哪些字段、哪些是维度哪些是度量、需要什么权限"的元信息。
    - 用户完全无法输入 SQL，从根上消除注入面与越权查询面。
  - 新增 `sys_report_chart`：`chart_id, dataset_id, chart_name, chart_type(BAR/LINE/PIE/FUNNEL/TABLE/METRIC), dimensions(JSON: 从 field_meta 的维度字段中选), measures(JSON: 从度量字段中选 + 聚合方式 SUM/COUNT/AVG/MAX/MIN), filters(JSON: 字段 + 操作符 + 值，操作符白名单), sort_config, limit_rows, style_config(JSON), owner_id, share_scope(PRIVATE/DEPT/TENANT)`
  - 新增 `sys_report_dashboard` + `sys_report_dashboard_item`（布局：`x, y, w, h, chart_id`）
  - **查询执行层**：
    - 维度/度量/筛选字段必须在 `field_meta` 声明的白名单内，否则拒绝（防止通过字段名注入）
    - 聚合方式与筛选操作符都走枚举白名单，不接受自由字符串
    - 参数全部走 MyBatis 参数绑定（`#{}`，不用 `${}`）
    - 强制注入 `tenant_id`；`data_scope_flag` 为真时套用现有 `sys_role.data_scope/ds_type/ds_scope` 数据权限
    - 结果行数上限 + 查询超时
    - 数据集访问按 `permission_code` 走 `@SaCheckPermission`
  - **首批预置数据集建议**（把现有写死的报表接口改造成数据集，业务方即可自行换维度）：流程实例与耗时、任务处理时效、CRM 销售漏斗与回款账龄、HR 考勤与假期统计、OA 费用与预算执行、资产台账
  - **后续若要开放自由 SQL**：需另立评审，满足原文档记录的 5 条红线（只允许 SELECT、强制租户隔离、独立只读账号、语句超时、行数上限、仅受信角色）。本轮不做。
- **工作量**：M（受限版比完整版低一档：4 表 + 白名单查询引擎 + 前端配置面板，不需要 SQL 解析与沙箱）
- **优先级**：P2 —— 建议在 LC-05 图表库落地后做（图表渲染层复用）

### [LC-07] 中式复杂报表与打印模板
- **参考来源**：`youseries/ureport`（Apache-2.0, 2.2k，纯 Java 报表引擎，专为中式复杂报表设计）
- **参考实现怎么做的**：单元格式报表设计（类 Excel），支持行列分组、小计合计、交叉表、纵向/横向扩展、套打定位。这是中国式报表（政府报表、财务报表）与西式 BI 图表的核心差异。
- **我们现状**：后端有 FastExcel 1.0.0 + Apache POI 5.2.5（导出能力具备），CSV 导出已实现（`/oa/audit/events` 导出）。缺的是：① 带分组小计的复杂表格；② **打印/套打模板**（合同、报销单、工资条、offer 都需要固定格式打印，当前应是浏览器直接打印页面）。
- **落地改动**：
  - 优先做**打印模板**（比自助报表更刚需）：新增 `sys_print_template`：`template_code, template_name, biz_type(CONTRACT/EXPENSE/SALARY_SLIP/OFFER/PURCHASE), template_content(HTML 或 Excel 模板), paper_size, orientation, status, version`
  - 用 POI 模板填充（Excel 模板）或 HTML 转 PDF；HR 侧已有 `HrPdfRenderer` 可复用扩展
  - 复杂分组报表可用 ureport（Apache-2.0）作为独立能力引入，或用 POI 手写模板
- **工作量**：M（打印模板）/ L（含复杂报表引擎）
- **优先级**：P1（打印模板）/ P2（复杂报表引擎）—— 打印模板是真实高频缺失（合同、工资条、offer 都要打印）

### [LC-08] 表单版本管理
- **参考来源**：我们自己的 `wf_process_definition` 已有完整版本机制（`version, is_latest, checksum, change_log, change_type, is_rollback, rollback_from_version`）
- **参考实现怎么做的**：（本条是内部一致性对齐，不是外部移植）流程定义有版本，表单定义没有 —— 表单改字段后，历史实例的表单数据可能无法正确渲染。
- **我们现状**：`wf_form_definition` 无版本字段。流程有版本与回滚、表单没有，属于内部不一致。改表单删掉一个字段，历史审批单的该字段值就渲染不出来。
- **落地改动**：`wf_form_definition` 增 `version, is_latest, checksum, change_log`；`wf_process_instance` 记录发起时的 `form_version`；历史实例按当时版本渲染（现有 `wf_process_snapshot` 表可承载表单快照）
- **工作量**：S
- **优先级**：P1 —— 小改动，修掉一个真实的数据渲染隐患

## 五、不建议移植

| 项 | 原因 |
| --- | --- |
| **自助报表开放自由 SQL** | **已决策不做**（2026-08-31）。LC-06 采用受限版：数据集 SQL 由开发写在 XML mapper 里，用户只能选预置数据集 + 配维度/度量/筛选。从根上消除注入与越权面，且符合项目"禁止 Java 拼接 SQL"约束 |
| 直接引入 form-create / variant-form | **Vue 生态**，我们是 React 19；只参照其字段类型清单与 Schema 设计 |
| 直接引入 amis | 自有渲染体系（JSON → 组件树），引入等于在 React 里嵌第二套 UI 框架，与既有 Tailwind 4 + 自研组件风格冲突；只参照组件能力清单 |
| formily 作为表单引擎替换自研 | 我们的 `FormBuilder`(791行) + 双渲染器已投入且含组织类字段等业务定制；替换成本高于扩展成本 |
| nocodb / budibase / appsmith 低代码搭建平台 | 那是"用配置生成应用"的产品形态，我们是固定业务系统；且 nocodb/budibase 许可证需复核 |
| dataease / metabase / superset 整体部署 | 引入独立 BI 服务的运维成本 + 数据同步复杂度，对当前阶段过重；LC-06 做轻量内建版本更合适 |
| 大屏可视化 | 无实际业务诉求，属演示性需求 |
| univer 在线表格 | 除非有多人协同编辑表格的明确场景，否则收益低 |
| 自助报表开放自由 SQL 给普通用户 | 安全风险不可接受（见 LC-06 安全红线） |

## 六、建议批次

**P0（表单与图表的基础能力，建议一次性推进）**
1. LC-05 引入图表库（ECharts）—— 成本最低、可见收益最高，解锁所有看板需求
2. LC-01 字段类型扩展（9 → 20+）+ LC-02 布局容器 —— **必须同批**，都改 FormBuilder/FormRenderer，拆开要改两遍

**P1（表单深度与刚需补齐）**
3. LC-03 明细子表（依赖 LC-02 树形结构）
4. LC-04 字段级权限（含敏感字段全链可见的修复）
5. LC-08 表单版本管理（S，修渲染隐患）
6. LC-07 打印模板（合同/工资条/offer 刚需）

**P2（增强）**
7. LC-06 自助报表 —— **已确认采用受限版**（只允许预置数据集，无自由 SQL），在 LC-05 之后做
8. LC-07 复杂报表引擎（ureport）

依赖关系：LC-02 → LC-03；LC-01/LC-02 同批；LC-05 独立可先做；LC-06 建议在 LC-05 之后。

## 七、安全注意事项（本模块特有）

- **服务端表单校验必须存在**：LC-01 扩展字段类型后，若只有前端校验，攻击者可直接调接口提交非法值。服务端必须按 form schema 校验。
- **富文本字段必过净化**：`dompurify` 已在依赖，`RICH_TEXT` 与 `DESCRIPTION` 渲染必须净化，防存储型 XSS。
- **字段权限必须服务端过滤**：LC-04 的不可见字段要在接口层剔除，不能只在前端隐藏。
- **表达式求值不用 eval**：LC-04 的 `visibleExpr` 与 05 文档 HR-13 的得分公式同理，用白名单变量 + 受限表达式解析器。
- **LC-06 已按受限版定案，原自由 SQL 风险点消除**：数据集 SQL 由开发写在 XML mapper，用户只能选预置数据集；维度/度量/筛选字段走 `field_meta` 白名单校验，聚合方式与操作符走枚举白名单，参数全部 `#{}` 绑定，强制租户隔离 + 现有数据权限，行数上限 + 查询超时。若未来要开放自由 SQL，需另立评审。
- **上传字段**：`accept` 与 `maxSize` 需服务端二次校验，文件类型按内容而非扩展名判断。
