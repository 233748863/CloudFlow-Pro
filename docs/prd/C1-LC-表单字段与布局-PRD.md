# PRD：表单字段类型与布局容器（LC-01 + LC-02）

| 项 | 内容 |
| --- | --- |
| 条目编号 | LC-01 字段类型 9→20+ · LC-02 布局容器 |
| 所属批次 | 批次 C（第 1 份，**两项必须同批**：都改 `FormBuilder` 与两个渲染器，拆开要改两遍） |
| 对标依据 | `docs/benchmark/06-lowcode-bi-表单报表对标.md` |
| 优先级 | P0 |
| 预估工作量 | L（前端为主） |
| 版本 | v1 · 2026-08-31 |

## 1. 背景与目标

### 1.1 问题

表单是工作流的载体，当前只有 **9 种字段类型**，且字段是**扁平数组无布局能力**。两个最突出的后果：

1. **上传附件不是表单字段** —— 有独立 `FileUpload.tsx` 组件，但审批表单里加不了附件字段。这是审批场景最基础的需求
2. **30 字段的采购申请只能拉成一长条** —— 无法分区（基本信息 / 供应商 / 明细 / 附件）

### 1.2 目标
1. 字段类型 9 → 22 种，覆盖企业审批单据的常规需求
2. 引入布局容器（分组 / 分栏 / 标签页 / 折叠），`fields` 从扁平数组改为树
3. 服务端按 schema 校验提交值（当前若只有前端校验，可绕过）
4. 移动端渲染器同步（GRID 降级单列）

### 1.3 非目标
- 不引入 formily / form-create / amis（Vue 生态或自有渲染体系，与 React 19 + 自研组件冲突）
- 不做明细子表（LC-03，本批第 2 份）
- 不做字段级权限（LC-04，本批第 3 份）
- 不做表单版本（LC-08，本批第 4 份）

## 2. 现状基线（实测）

### 2.1 字段类型（`src/types.ts`）
```ts
type FormFieldType =
  | 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT' | 'TEXTAREA'
  | 'EMPLOYEE' | 'DEPT' | 'POST' | 'POSITION';   // 共 9 种
```
后四种组织类字段是**我们特有的优势**（对标项目无内建组织选择器），要保留。

### 2.2 字段配置（`FormField` 接口）
```ts
interface FormField {
  id, type, label, required
  options?: string[]          // SELECT 用
  placeholder?, readonly?
  displayFieldId?
  fillMappings?: FormFieldFillMapping[]   // 联动填充（已有）
  filterByDeptFieldId?, onlyActive?
  regex?, errorMsg?           // 正则校验（已有）
}
interface FormDefinition { id, name, fields: FormField[] }   // 扁平数组
```

### 2.3 实现资产
| 文件 | 规模 | 说明 |
| --- | --- | --- |
| `components/FormBuilder.tsx` | 791 行 | 自研可视化设计器 |
| `components/FormRenderer.tsx` | — | Web 渲染，实测 switch 只处理 `DATE` / `NUMBER` 特例 |
| `components/mobile/MobileFormRenderer.tsx` | — | 移动端渲染 |
| `utils/formDefinition.ts` | — | 后端定义映射（`fieldsJson` / `formSchema` 解析，含容错） |
| `utils/formFieldRuntime.ts` | — | 运行时，实测只有 `fillMappings` 一种联动 |
| `utils/workflowFormDisplay.ts` | — | 工作流表单展示 |
| `pages/FormDesign.tsx` | — | 设计页 |

**实测确认**：`FormBuilder.tsx` 中 `GRID` / `GROUP` / `TABS` / `SUB_TABLE` / `children` 关键字计数为 **0**，确无布局能力。

### 2.4 可复用的现有组件（约 70 个）
`AmountInput` / `DateRangePicker` / `DictSelect` / `DictBadge` / `EmployeeSelector` / `DeptSelector` / `PostSelector` / `PositionSelector` / `UserSelector` / `RoleSelector` / `MeetingRoomSelector` / `SelectorShell` / `FileUpload` / `switch` / `select` / `textarea` / `input` / `date-picker` / `tabs` / `card` / `form-layout`

**这批组件是本 PRD 的最大助力** —— 多数新字段类型可直接包装现有组件，不从零写。

### 2.5 后端
- `wf_form_definition`（12 列）存定义，`fields_json` 与 `form_schema` 两个 LONGTEXT 字段
- **已有 `JsonSchemaValidator.validateFormSchema()`** 校验表单定义合法性（校验字段 ID 集合），在保存时调用
- 版本字段 `version` / `is_latest` / `lock_version` / `version_lock` **已存在**但保存时原地覆盖（详见 C4 的 §1.1 修正）

## 3. 范围

### 3.1 做
1. `FormFieldType` 扩展到 22 种
2. `FormField` 增配置项（数字精度、上传限制、字典类型、默认值等）
3. 引入 4 种布局容器 + `children` 树形结构
4. `FormBuilder` 支持容器内嵌套拖拽（`@dnd-kit` 已在依赖）
5. `FormRenderer` 与 `MobileFormRenderer` 递归渲染
6. **服务端 schema 校验器**（后端）
7. 富文本 XSS 净化（`dompurify` 已在依赖）

### 3.2 不做
| 项 | 原因 |
| --- | --- |
| 引入第三方表单引擎 | §1.3 已说明 |
| 明细子表 / 字段权限 / 表单版本 | LC-03 / LC-04 / LC-08 |
| 表单打印模板 | LC-07（批次 G） |
| 字段级计算联动（如 A+B 自动算 C） | 本期只做显隐联动，计算联动留 LC-03 的子表合计与后续评估 |

## 4. 功能需求

### FR-1 字段类型扩展（9 → 22）

保留现有 9 种，新增 13 种：

| 分组 | 类型 | 复用组件 |
| --- | --- | --- |
| 文本 | `TEXT` `TEXTAREA` `RICH_TEXT`(新) | `input` / `textarea` / 新增 |
| 数值 | `NUMBER` `AMOUNT`(新) | `input` / **`AmountInput`（已有）** |
| 日期 | `DATE` `DATETIME`(新) `TIME`(新) `DATE_RANGE`(新) | `date-picker` / **`DateRangePicker`（已有）** |
| 选择 | `SELECT` `MULTI_SELECT`(新) `RADIO_GROUP`(新) `CHECKBOX_GROUP`(新) `SWITCH`(新) `DICT_SELECT`(新) | `select` / `switch` / **`DictSelect`（已有）** |
| 组织 | `EMPLOYEE` `DEPT` `POST` `POSITION` `USER_MULTI`(新) `DEPT_MULTI`(新) | **五个 Selector 已有** |
| 文件 | `UPLOAD_FILE`(新) `UPLOAD_IMAGE`(新) | **`FileUpload`（已有）** |
| 静态 | `DESCRIPTION`(新) `DIVIDER`(新) | 新增 |

- FR-1.1 `DICT_SELECT` 通过 `dictType` 直接读 `sys_dict_type`，**免手填 options**（现状 SELECT 要手填选项，字典改了表单不同步）
- FR-1.2 `AMOUNT` 复用 `AmountInput`，带千分位与精度
- FR-1.3 `UPLOAD_*` 对接 `sys_file`，配置 `accept` / `maxSize` / `maxCount`；**配合批次 G 的 SYS-04 签名 URL 改造**
- FR-1.4 `RICH_TEXT` 渲染必过 `dompurify` 净化
- FR-1.5 新增字段配置项：
  ```
  min, max, precision        数值与金额
  accept, maxSize, maxCount  上传
  dictType                   字典下拉
  defaultValue               默认值
  multiple                   多选类
  rows                       多行文本行数
  ```

### FR-2 布局容器（LC-02）
- FR-2.1 四种容器类型：
  | 类型 | 配置 | 移动端降级 |
  | --- | --- | --- |
  | `GROUP` | `title`（分组标题 + 边框） | 保持 |
  | `GRID` | `columns`（2/3/4 列），子字段带 `span` | **降为单列** |
  | `TABS` | 子容器为标签页，各带 `title` | 保持（横向滚动） |
  | `COLLAPSE` | `title`、`defaultExpanded` | 保持 |
- FR-2.2 `FormField` 增 `children?: FormField[]`，结构从扁平数组改为树
- FR-2.3 容器可嵌套（限制最大 3 层，防设计器体验失控）
- FR-2.4 `FormBuilder` 支持拖拽字段进容器、容器内排序、容器间移动（`@dnd-kit/sortable` 支持嵌套）
- FR-2.5 渲染器递归渲染；`GRID` 用 Tailwind 响应式类（`grid-cols-*`），断点由现有主题体系决定

### FR-3 服务端校验（**安全必需**）

> **2026-08-31 摸排修正**：`JsonSchemaValidator.validateFormSchema()` **已存在**（在 `WfFormServiceImpl` 第 81 行被调用），但它校验的是**表单定义的合法性**（字段 ID 集合），**不是提交值**。本 FR 仍然成立（全仓无 `validateFormData` 类逻辑），但**实现方式改为扩展该 validator 而非新建**，保持一处收口。

- FR-3.1 **扩展现有 `JsonSchemaValidator`**，新增 `validateFormData(fieldsJson, submittedData)` 方法：提交表单数据时按 `fields_json` 递归校验
- FR-3.2 校验内容：必填、类型、`min`/`max`/`precision`、`regex`、`options` 合法性（提交值必须在选项内）、上传字段的 `maxCount`
- FR-3.3 校验失败返回字段级错误信息（`{fieldId: errorMsg}`），前端定位到具体字段
- FR-3.4 **未在 schema 声明的字段一律拒绝**（防提交额外字段污染业务数据）
- FR-3.5 `UPLOAD_*` 字段的文件类型按内容判断而非扩展名（后端），`maxSize` 二次校验

### FR-4 数据结构变更
- FR-4.1 `FormDefinition.fields` 从 `FormField[]`（扁平）改为树形（含 `children`）
- FR-4.2 **项目未上线，直接改 `wf_form_definition.fields_json` 新结构与种子数据，不做旧结构兼容**
- FR-4.3 `utils/formDefinition.ts` 的解析逻辑同步改造（保留其现有容错：`fieldsJson` / `formSchema` 双字段名兼容、非法 JSON 的 sanitize 重试）

### FR-5 设计器体验
- FR-5.1 左侧字段类型面板按 §FR-1 的 7 个分组折叠展示
- FR-5.2 中间画布支持容器嵌套拖拽、字段复制、批量删除
- FR-5.3 右侧属性面板按字段类型条件展示配置项
- FR-5.4 顶部预览：切换 Web / 移动端两种预览模式
- FR-5.5 保存前校验：容器不为空、字段 id 唯一、`DICT_SELECT` 必选 `dictType`、嵌套不超 3 层

## 5. 非功能需求

| 项 | 要求 |
| --- | --- |
| **服务端校验是权威** | FR-3 必须实现。当前若只有前端校验，攻击者可直接调接口提交非法值 |
| **富文本 XSS** | `RICH_TEXT` 与 `DESCRIPTION` 渲染必过 `dompurify`（已在依赖） |
| **上传安全** | 类型按内容判断、大小服务端二次校验、文件名不信任 |
| 行为兼容 | 现有 9 种字段类型的渲染与校验行为不变 |
| 移动端 | `GRID` 降单列；触控目标 ≥ 44px |
| 无障碍 | 每字段有 `<label>` 关联；错误信息用 `aria-describedby`；容器用 `<fieldset>` + `<legend>` |
| 性能 | 50 字段表单渲染 < 200ms；递归渲染避免不必要重渲（`React.memo`） |
| 嵌套深度 | 最大 3 层，服务端与前端双向限制 |

## 6. 验收标准

| # | 验收项 |
| --- | --- |
| AC-1 | 22 种字段类型在 Web 与移动端均正确渲染与取值 |
| AC-2 | `DICT_SELECT` 选项来自 `sys_dict_type`；字典改动后表单选项同步（无需改表单定义） |
| AC-3 | `UPLOAD_FILE` 可在审批表单中上传附件并正确关联 `sys_file` |
| AC-4 | 四种布局容器正确渲染；`GRID` 在移动端降为单列 |
| AC-5 | 容器可嵌套 3 层；超 3 层被拒绝 |
| AC-6 | `FormBuilder` 可拖拽字段进容器、容器内排序、容器间移动 |
| AC-7 | **服务端校验：必填缺失、类型错误、超出 min/max、选项外的值、schema 未声明的字段全部被拒绝** |
| AC-8 | 校验失败返回字段级错误，前端定位到具体字段 |
| AC-9 | **绕过前端直接调接口提交非法数据被服务端拒绝** |
| AC-10 | `RICH_TEXT` 提交含 `<script>` 的内容，渲染时被净化不执行 |
| AC-11 | 上传伪装扩展名的文件（.jpg 实为 .exe）被后端按内容识别并拒绝 |
| AC-12 | 现有 9 种字段类型行为与改造前一致 |
| AC-13 | 设计器可切换 Web / 移动端预览 |
| AC-14 | 50 字段表单渲染 < 200ms；`npm run type-check` 与 `build` 通过 |
| AC-15 | 无障碍：字段有 label 关联、错误有 aria-describedby、容器用 fieldset/legend |

## 7. 依赖与风险

### 7.1 依赖
| 依赖 | 说明 |
| --- | --- |
| 现有约 70 个公共组件 | 多数新字段类型直接包装（最大助力） |
| `@dnd-kit/*`（已有） | 嵌套拖拽 |
| `dompurify` 3.3.1（已有） | 富文本净化 |
| `sys_dict_type`（已有） | `DICT_SELECT` |
| `sys_file`（已有） | 上传字段 |
| 批次 G SYS-04 | 上传字段的签名 URL（弱依赖，可先用现状） |

### 7.2 风险

| 风险 | 应对 |
| --- | --- |
| **数据结构从扁平改树，破坏性变更** | 项目未上线，直接改新结构 + 种子数据（FR-4.2）；`formDefinition.ts` 的解析容错保留 |
| 服务端校验器工作量被低估（要递归 + 22 种类型） | 独立里程碑 M4；类型校验用策略模式，每类型一个校验器 |
| 设计器 791 行改造后复杂度失控 | 拆分组件：字段面板 / 画布 / 属性面板 / 预览各独立文件 |
| 嵌套拖拽交互难做对 | `@dnd-kit` 支持但需仔细处理 drop 目标判定；M3 单独里程碑 |
| 移动端 22 种字段适配工作量 | 部分类型移动端降级（如 `GRID` 单列、富文本降为纯文本编辑）；AC-1 覆盖 |
| 富文本引入新依赖（编辑器） | 建议先用 `textarea` + Markdown（`marked` 18 已在依赖）而非引入富文本编辑器，见 §9-2 |

## 8. 里程碑

| 阶段 | 内容 | 可验收 |
| --- | --- | --- |
| M1 | 类型定义扩展（22 种 + 树形结构）+ `formDefinition.ts` 解析改造 | 类型检查通过 |
| M2 | `FormRenderer` 递归渲染 + 22 种字段渲染（复用现有组件） | AC-1/2/3/12 |
| M3 | `FormBuilder` 改造：分组面板、嵌套拖拽、属性面板、双端预览 | AC-4/5/6/13 |
| M4 | **后端 schema 校验器** | AC-7/8/9/11 |
| M5 | `MobileFormRenderer` 适配 + 无障碍 + 性能 | AC-14/15 |
| M6 | 富文本净化 + 上传安全 | AC-10/11 |

## 9. 待确认

| # | 问题 | 建议默认 |
| --- | --- | --- |
| 1 | `RICH_TEXT` 是否真需要 | 建议先不做真富文本编辑器。用 `TEXTAREA` + Markdown 渲染（`marked` 18 已在依赖）覆盖大部分场景，避免引入编辑器依赖与更大的 XSS 面。若确需所见即所得再评估 |
| 2 | 组织类字段是否需要"多选 + 限定范围" | 建议 `USER_MULTI` / `DEPT_MULTI` 支持 `scopeDeptId` 限定，复用现有 Selector 的 `filterByDeptFieldId` 思路 |
| 3 | 字段计算联动（A+B=C）本期是否做 | 建议不做。现有只有 `fillMappings` 填充联动；计算联动涉及表达式求值，安全面大，且 LC-03 子表合计会先覆盖主要场景 |
| 4 | 22 种是否一次全上 | 建议按优先级分两波：第一波（M2）上 `UPLOAD_FILE` / `AMOUNT` / `DICT_SELECT` / `MULTI_SELECT` / `DATE_RANGE` / `SWITCH` / `DESCRIPTION`（覆盖 80% 场景），其余随需求补 |
