# 批次 C 技术设计（表单能力）

| 项 | 内容 |
| --- | --- |
| 覆盖 | C1（LC-01+02 字段与布局）· C2（LC-03 子表）· C3（LC-04 字段权限）· C4（LC-08 版本） |
| 表改动 | `wf_form_definition` 改 6 列 + 主键重构；`wf_form_field_permission` 已由 B 批次建 |
| 前端 | **主体工作量在此**：`FormBuilder`(791 行) 重构 + 两个渲染器 |
| 版本 | v1 · 2026-08-31 |

## 0. `FormBuilder.tsx` 内部结构（设计前补查，摸排未查项之一）

实测 791 行的组成：

| 位置 | 内容 | 改造影响 |
| --- | --- | --- |
| L55 `FIELD_TYPES[]` | 字段面板数据（type/label/icon） | 9 → 22 项 |
| L67 `FIELD_TYPE_STYLES` | 每类型样式 Record | 需补 13 项 |
| L79 `MASTER_DATA_TYPES` | 组织类字段 Set（EMPLOYEE/DEPT/POST/POSITION） | 需扩到 6 项（+USER_MULTI/DEPT_MULTI） |
| L81/L93 `DEFAULT_FIELD_IDS` / `DEFAULT_FIELD_LABELS` | 默认 ID 与标签 Record | 需补 13 项 |
| L114 `buildDefaultField(type,id)` | 字段工厂，内有 4 个 `if (type === 'X')` 分支 | 需补 13 分支 |
| L172 `PreviewControl` | 预览渲染，内有 `TEXTAREA/SELECT/DATE/NUMBER` 分支 | 需补 13 分支 |
| L227 `SortableField` | **拖拽卡片 + 内联属性编辑**，L291/L357/L435 三处类型分支 | 需补 13 分支 |
| L479 `FormPreview` | 预览容器，含 `formData`/`errors` 状态 | 需支持容器递归 |
| L568 `FormBuilder` | 主组件 | 需支持嵌套拖拽 |

**关键结论**：类型相关逻辑散在 **5 处**（`buildDefaultField` / `PreviewControl` / `SortableField` ×3）。若直接加 13 个类型，每处都要加 13 个分支 = 65 处改动，且后续加类型还要再改 5 处。

**因此 C1 的第一步必须是提取字段类型注册表**，把散落的分支收口到一处。这是本设计的核心决策。

---

## 1. 字段类型注册表（C1 的地基改造）

### 1.1 单一数据源

新建 `src/components/form-builder/fieldRegistry.ts`：

```ts
export interface FieldTypeDefinition {
  type: FormFieldType;
  label: string;
  icon: React.ElementType;
  group: 'text' | 'number' | 'date' | 'select' | 'org' | 'file' | 'static' | 'container';
  styleClass: string;
  defaultIdPrefix: string;
  defaultLabel: string;
  isMasterData?: boolean;        // 替代 MASTER_DATA_TYPES Set
  isContainer?: boolean;         // GROUP/GRID/TABS/COLLAPSE
  allowedInSubTable?: boolean;   // C2 子表列可用性
  /** 该类型独有的默认配置 */
  buildDefaults?: (id: string) => Partial<FormField>;
  /** 预览渲染 */
  renderPreview: (field: FormField, value: any, onChange: (v: any) => void) => React.ReactNode;
  /** 属性编辑面板（替代 SortableField 里的内联分支） */
  renderPropertyEditor?: (field: FormField, onUpdate: (patch: Partial<FormField>) => void) => React.ReactNode;
}

export const FIELD_REGISTRY: Record<FormFieldType, FieldTypeDefinition> = { ... };
export const FIELD_GROUPS = [
  { key: 'text',      label: '文本',   types: ['TEXT','TEXTAREA','RICH_TEXT'] },
  { key: 'number',    label: '数值',   types: ['NUMBER','AMOUNT'] },
  { key: 'date',      label: '日期',   types: ['DATE','DATETIME','TIME','DATE_RANGE'] },
  { key: 'select',    label: '选择',   types: ['SELECT','MULTI_SELECT','RADIO_GROUP','CHECKBOX_GROUP','SWITCH','DICT_SELECT'] },
  { key: 'org',       label: '组织',   types: ['EMPLOYEE','DEPT','POST','POSITION','USER_MULTI','DEPT_MULTI'] },
  { key: 'file',      label: '文件',   types: ['UPLOAD_FILE','UPLOAD_IMAGE'] },
  { key: 'static',    label: '静态',   types: ['DESCRIPTION','DIVIDER'] },
  { key: 'container', label: '布局',   types: ['GROUP','GRID','TABS','COLLAPSE','SUB_TABLE'] },
];
```

**改造后**：
- `FormBuilder` 的 `FIELD_TYPES` / `FIELD_TYPE_STYLES` / `MASTER_DATA_TYPES` / `DEFAULT_FIELD_IDS` / `DEFAULT_FIELD_LABELS` 五个常量**全部删除**，改读注册表
- `buildDefaultField` 改为 `registry[type].buildDefaults?.(id)`
- `PreviewControl` 改为 `registry[field.type].renderPreview(...)`
- `SortableField` 的三处类型分支改为 `registry[field.type].renderPropertyEditor?.(...)`
- **后续加字段类型只改注册表一处**

### 1.2 文件拆分

791 行拆为：
```
components/form-builder/
├── fieldRegistry.ts           字段类型注册表（单一数据源）
├── fields/                    各类型的 preview + propertyEditor
│   ├── TextField.tsx  NumberField.tsx  DateField.tsx  SelectField.tsx
│   ├── OrgField.tsx（复用现有 5 个 Selector）
│   ├── UploadField.tsx（复用现有 FileUpload）
│   └── ...
├── containers/                布局容器
│   ├── GroupContainer.tsx  GridContainer.tsx  TabsContainer.tsx  CollapseContainer.tsx
│   └── SubTableField.tsx      C2 的子表
├── FieldPalette.tsx           左侧字段面板（按 FIELD_GROUPS 分组折叠）
├── FormCanvas.tsx             中间画布（递归 + 嵌套拖拽）
├── SortableFieldCard.tsx      单个字段卡片
├── PropertyPanel.tsx          右侧属性面板（从 SortableField 内联抽出）
├── FormPreviewPane.tsx        预览（Web/移动端双模式）
└── FormBuilder.tsx            主组件（组装，目标 < 200 行）
```

> ✅ **已定决策（2026-08-31）：改为独立右侧面板**。
> 现有属性编辑内联在 `SortableField` 卡片里（L291/L357/L435 三处类型分支）。改为"点卡片 → 右侧 `PropertyPanel` 编辑"。
> **理由**：22 种字段类型的配置项差异极大 —— 子表要配 N 列（每列又是一个完整字段）、上传要配 `accept`/`maxSize`/`maxCount`、字典要选 `dictType`、`GRID` 要配列数与 span。内联会让卡片高度失控，子表类型在卡片里基本无法展开。
> **交互变更的代价**：现有用户需适应"选中→编辑"两步。缓解措施见下。

**三栏布局与交互细节**：

```
┌──────────┬────────────────────────┬──────────────┐
│ 字段面板  │        画布            │  属性面板     │
│ (分组折叠)│  (卡片列表 + 嵌套拖拽)  │  (选中项配置)  │
│          │                        │              │
│ 文本 ▾    │  ┌──────────────────┐  │ 字段ID       │
│  单行文本 │  │ ▸ 申请事由  必填  │◀─│ 标签         │
│  多行文本 │  └──────────────────┘  │ 必填 ☑       │
│ 数值 ▾    │  ┌──────────────────┐  │ 占位提示     │
│  数字     │  │ ▸ 费用明细 (子表) │  │ 校验正则     │
│  金额     │  └──────────────────┘  │ ...按类型变化 │
└──────────┴────────────────────────┴──────────────┘
```

- **卡片上保留常用项**：标签文字（可双击就地改）、必填标记（可直接点切换）、删除与复制按钮 —— 高频操作不必进面板
- **未选中任何字段时**，属性面板显示**表单级配置**（表单名、提交按钮文案等），避免空白
- 移动端预览模式下属性面板折叠为抽屉

---

## 2. 数据结构：扁平 → 树

### 2.1 类型定义（`src/types.ts`）

```ts
export type FormFieldType =
  // 现有 9 种（保留）
  | 'TEXT' | 'NUMBER' | 'DATE' | 'SELECT' | 'TEXTAREA'
  | 'EMPLOYEE' | 'DEPT' | 'POST' | 'POSITION'
  // C1 新增 13 种
  | 'RICH_TEXT' | 'AMOUNT' | 'DATETIME' | 'TIME' | 'DATE_RANGE'
  | 'MULTI_SELECT' | 'RADIO_GROUP' | 'CHECKBOX_GROUP' | 'SWITCH' | 'DICT_SELECT'
  | 'USER_MULTI' | 'DEPT_MULTI' | 'UPLOAD_FILE' | 'UPLOAD_IMAGE'
  | 'DESCRIPTION' | 'DIVIDER'
  // C1 布局容器 4 种
  | 'GROUP' | 'GRID' | 'TABS' | 'COLLAPSE'
  // C2 子表
  | 'SUB_TABLE';

export interface FormField {
  id: string;
  type: FormFieldType;
  label: string;
  required: boolean;
  // ===== 现有配置（保留）=====
  options?: string[];
  placeholder?: string;
  readonly?: boolean;
  displayFieldId?: string;
  fillMappings?: FormFieldFillMapping[];
  filterByDeptFieldId?: string;
  onlyActive?: boolean;
  regex?: string;
  errorMsg?: string;
  // ===== C1 新增配置 =====
  min?: number; max?: number; precision?: number;      // 数值与金额
  accept?: string; maxSize?: number; maxCount?: number; // 上传
  dictType?: string;                                    // DICT_SELECT
  defaultValue?: any;
  multiple?: boolean;
  rows?: number;                                        // 多行文本
  // ===== C1 布局容器 =====
  children?: FormField[];                               // ← 树形结构核心
  columns?: 2 | 3 | 4;                                  // GRID
  span?: number;                                        // GRID 子项占列数
  defaultExpanded?: boolean;                            // COLLAPSE
  // ===== C2 子表 =====
  subColumns?: FormField[];                             // SUB_TABLE 的列定义
  minRows?: number; maxRows?: number;
  allowAdd?: boolean; allowDelete?: boolean; allowSort?: boolean; allowCopyRow?: boolean;
  summaryColumns?: Array<{ columnId: string; aggregation: 'SUM'|'COUNT'|'AVG' }>;
  emptyText?: string;
  // ===== C3 字段权限（运行时下发，非设计态）=====
  visibleExpr?: string;
  disabledExpr?: string;
}
```

**为什么 `SUB_TABLE` 用 `subColumns` 而非复用 `children`**：容器的 `children` 是"嵌套的字段"（渲染为嵌套布局），子表的列是"表格的列定义"（渲染为表头 + 行）。语义不同，混用会让递归渲染逻辑难写。

### 2.2 `wf_form_definition` 改动（C4）

```sql
-- 主键重构（C4 的 FR-2.1B：多版本多行）
  id                BIGINT(20)      NOT NULL AUTO_INCREMENT COMMENT '主键ID',   -- 新增
  form_id           VARCHAR(64)     NOT NULL COMMENT '表单业务ID',              -- 降级为业务键
-- 新增 5 列（version/is_latest/version_lock 已存在，复用）
  checksum          VARCHAR(64)     DEFAULT NULL COMMENT '字段定义哈希',
  change_log        VARCHAR(500)    DEFAULT NULL COMMENT '变更说明',
  change_type       VARCHAR(30)     DEFAULT NULL COMMENT 'ADD_FIELD/REMOVE_FIELD/MODIFY_FIELD/LAYOUT_CHANGE/MIXED',
  is_rollback       TINYINT(1)      NOT NULL DEFAULT 0 COMMENT '是否回滚产生',
  rollback_from_version INT         DEFAULT NULL COMMENT '回滚来源版本',
-- 删除（语义重叠，实测 version_lock 才是生效的乐观锁）
  -- lock_version   删除
-- 索引调整
  PRIMARY KEY (id),
  UNIQUE KEY uk_form_version (tenant_id, form_id, version),
  KEY idx_form_latest (tenant_id, form_id, is_latest),
  KEY idx_form_tenant (tenant_id)
```

`wf_process_instance` 增：
```sql
  form_version      INT             DEFAULT NULL COMMENT '发起时的表单版本',
```

---

## 3. 服务端校验器（C1 的 FR-3，安全必需）

### 3.1 扩展现有 `JsonSchemaValidator`

摸排确认该类已存在且校验表单定义。**新增数据校验方法，不新建类**：

```java
@Component
public class JsonSchemaValidator {

    // ===== 现有方法（不动）=====
    public void validateFormSchema(String formSchema) { ... }

    // ===== C1 新增 =====
    public FormValidationResult validateFormData(String fieldsJson, Map<String,Object> data,
                                                 FieldPermissionContext permCtx) {
        List<FormField> fields = parseFields(fieldsJson);
        FormValidationResult result = new FormValidationResult();
        Set<String> declaredIds = new HashSet<>();
        validateRecursive(fields, data, result, declaredIds, permCtx, "");
        // AC-7：未声明字段一律拒绝
        for (String key : data.keySet()) {
            if (!declaredIds.contains(key)) {
                result.addError(key, "未声明的字段");
            }
        }
        return result;
    }

    private void validateRecursive(List<FormField> fields, Map<String,Object> data,
                                   FormValidationResult result, Set<String> declaredIds,
                                   FieldPermissionContext permCtx, String pathPrefix) {
        for (FormField f : fields) {
            declaredIds.add(f.getId());
            // 容器：递归 children
            if (isContainer(f.getType())) {
                validateRecursive(f.getChildren(), data, result, declaredIds, permCtx, pathPrefix);
                continue;
            }
            // 子表：逐行逐列递归（C2）
            if ("SUB_TABLE".equals(f.getType())) {
                validateSubTable(f, data.get(f.getId()), result, declaredIds, permCtx);
                continue;
            }
            // C3：不可见字段跳过校验（值已被过滤掉）
            if (permCtx != null && !permCtx.isVisible(f.getId())) { continue; }
            // 普通字段
            Object v = data.get(f.getId());
            validateSingle(f, v, result, permCtx);
        }
    }

    private void validateSingle(FormField f, Object v, FormValidationResult r, FieldPermissionContext ctx) {
        boolean required = ctx != null ? ctx.isRequired(f) : f.isRequired();
        if (required && isEmpty(v)) { r.addError(f.getId(), f.getLabel() + " 不能为空"); return; }
        if (isEmpty(v)) return;
        FieldTypeValidator validator = validatorFactory.get(f.getType());   // 策略模式，每类型一个
        validator.validate(f, v, r);
    }
}
```

### 3.2 类型校验器（策略模式，避免 22 个 if-else）

```java
public interface FieldTypeValidator {
    Set<FormFieldType> supports();
    void validate(FormField field, Object value, FormValidationResult result);
}

// 示例：金额
@Component
class AmountFieldValidator implements FieldTypeValidator {
    public Set<FormFieldType> supports() { return Set.of(AMOUNT, NUMBER); }
    public void validate(FormField f, Object v, FormValidationResult r) {
        BigDecimal d = toBigDecimal(v, r, f);   if (d == null) return;
        if (f.getMin() != null && d.compareTo(BigDecimal.valueOf(f.getMin())) < 0)
            r.addError(f.getId(), "不能小于 " + f.getMin());
        if (f.getMax() != null && d.compareTo(BigDecimal.valueOf(f.getMax())) > 0)
            r.addError(f.getId(), "不能大于 " + f.getMax());
        if (f.getPrecision() != null && d.scale() > f.getPrecision())
            r.addError(f.getId(), "小数位不能超过 " + f.getPrecision());
    }
}

// 示例：选项类（AC-7 的"选项外的值被拒绝"）
@Component
class OptionFieldValidator implements FieldTypeValidator {
    public Set<FormFieldType> supports() { return Set.of(SELECT, MULTI_SELECT, RADIO_GROUP, CHECKBOX_GROUP, DICT_SELECT); }
    public void validate(FormField f, Object v, FormValidationResult r) {
        List<String> allowed = "DICT_SELECT".equals(f.getType())
                ? dictService.getValues(f.getDictType())      // 字典驱动
                : f.getOptions();
        for (String one : toList(v)) {
            if (!allowed.contains(one)) { r.addError(f.getId(), "非法选项值: " + one); }
        }
    }
}

// 示例：上传（AC-11 按内容判类型）
@Component
class UploadFieldValidator implements FieldTypeValidator {
    public Set<FormFieldType> supports() { return Set.of(UPLOAD_FILE, UPLOAD_IMAGE); }
    public void validate(FormField f, Object v, FormValidationResult r) {
        List<Long> fileIds = toLongList(v);
        if (f.getMaxCount() != null && fileIds.size() > f.getMaxCount())
            r.addError(f.getId(), "最多上传 " + f.getMaxCount() + " 个");
        for (Long id : fileIds) {
            SysFile file = fileService.getById(id);
            if (file == null) { r.addError(f.getId(), "文件不存在"); continue; }
            // 复用 SysFileServiceImpl 已有的类别与扩展名白名单（摸排发现）
            if (!fileService.matchesCategory(file, f.getAccept()))
                r.addError(f.getId(), "文件类型不允许");
        }
    }
}
```

**调用点**：`WfInstanceServiceImpl` 的 `startProcess` 与 `WfTaskServiceImpl` 的 `completeTask`（提交表单数据处）。

---

## 4. C2 子表设计

### 4.1 数据结构

提交值：
```json
{ "expenseItems": [
    { "_rowId": "r1", "itemName": "机票", "amount": 1200.00, "occurDate": "2026-08-01" },
    { "_rowId": "r2", "itemName": "住宿", "amount": 800.00,  "occurDate": "2026-08-02" }
] }
```

`_rowId` 前端生成（React key + 错误定位），提交时保留。

### 4.2 校验错误的三层定位（AC-6）

```java
// FormValidationResult 的错误结构
{
  "expenseItems": {                    // 子表字段 ID
    "0": { "amount": "不能为空" },      // 行索引 → 列 ID → 错误
    "2": { "occurDate": "日期格式错误" }
  },
  "applyReason": "不能为空"             // 普通字段
}
```

### 4.3 合计精度（AC-3）

前端用 `decimal.js` 或字符串运算，**不用 JS number 直接加**（0.1+0.2 问题）。后端校验时用 `BigDecimal`。

> 需新增前端依赖 `decimal.js`（约 30KB）。或用整数分存储金额（更省但改动大）。**见 §9-2**。

### 4.4 虚拟滚动的边界

`react-window` 已在依赖。但**行内编辑 + 虚拟滚动组合易丢焦点**。设计：
- 行数 ≤ 30：普通渲染（覆盖多数场景：报销/采购明细通常 < 20 行）
- 行数 > 30：启用 `react-window`，但**当前编辑行强制保持挂载**（`overscanCount` 调大 + 编辑态行索引加入 forced render 列表）

---

## 5. C3 字段权限设计

### 5.1 服务端过滤（核心安全修复）

**统一在响应序列化层做，而非每接口单独处理**（AC-3 要求覆盖全部接口，逐个改必漏）：

```java
@Component
public class FormDataPermissionFilter {

    /** 下发前过滤：删除不可见字段的键（非置 null） */
    public void filterOutbound(Map<String,Object> formData, String definitionId,
                               String nodeKey, Long userId) {
        Set<String> invisible = permissionCache.getInvisibleFields(definitionId, nodeKey);
        // 删键而非置 null（AC-1：返回体中无该字段键）
        invisible.forEach(formData::remove);
    }

    /** 同时过滤表单定义（AC-2：前端看不到字段标签） */
    public String filterDefinition(String fieldsJson, String definitionId, String nodeKey) {
        Set<String> invisible = permissionCache.getInvisibleFields(definitionId, nodeKey);
        List<FormField> fields = parseFields(fieldsJson);
        removeRecursive(fields, invisible);      // 递归删除（含容器内与子表列）
        return toJson(fields);
    }
}
```

**接入点清单**（AC-3 要求梳理，本设计给出）：

| # | 接口 | 过滤对象 |
| --- | --- | --- |
| 1 | `GET /wf/instance/{id}` | 实例的 `variables` 中的表单数据 |
| 2 | `GET /wf/todo` / `GET /wf/done` 列表项 | 若列表返回表单摘要则需过滤 |
| 3 | `GET /wf/instance/{id}/trace` | 轨迹中的表单快照 |
| 4 | `GET /wf/form/{formId}` | 表单定义 |
| 5 | `GET /wf/definition/{id}` | 定义内嵌的表单 |
| 6 | `wf_process_snapshot` 读取处 | 历史快照（**最易漏**，C3 的 FR-2.5） |
| 7 | 各业务模块的单据详情接口 | 若嵌入流程表单数据 |

### 5.2 ⚠️ 引擎内部数据不过滤（C3 的 §9-4 待确认项的答案）

**这是最关键的实现约束**：

```java
// 引擎内部（条件分支求值、审批人解析、规则校验）→ 用未过滤的完整数据
Map<String,Object> rawVars = instanceService.getRawVariables(instanceId);
boolean matched = conditionEvaluator.eval(node.getCondition(), rawVars);   // ← 必须用 raw

// 对外响应 → 用过滤后的数据
Map<String,Object> safeVars = new HashMap<>(rawVars);
permissionFilter.filterOutbound(safeVars, definitionId, nodeKey, userId);
return R.ok(safeVars);                                                     // ← 只有这里过滤
```

若引擎内部也用过滤后数据，条件分支会因"看不到金额字段"而走错分支。**实现时必须严格区分 `getRawVariables()` 与 `getVisibleVariables()` 两个方法名**，避免误用。

### 5.3 表达式解析器（禁 eval）

> ✅ **已实测验证（2026-08-31）：Aviator 5.3.3 可用，但必须用下方 4 项完整配置**。
> ⚠️ **原设计的单项 `FEATURE_SET` 配置已验证无效** —— 实测 `user.class.classLoader` 返回真实 `AppClassLoader` 对象，是完整 RCE 通道。
> 完整验证过程与 20 项用例结果见 **`02-安全验证报告.md` §2**。

**必须的 4 项配置**（缺任一项即有 RCE 风险）：

```java
@Component
public class RestrictedExpressionEvaluator {

    private final AviatorEvaluatorInstance engine;

    public RestrictedExpressionEvaluator() {
        AviatorEvaluatorInstance ins = AviatorEvaluator.newInstance();

        // ① 关属性语法糖 —— 阻断 RCE 入口（user.class.classLoader）
        //    实测：不关则返回真实 AppClassLoader；关后一律返回 null
        ins.setOption(Options.ENABLE_PROPERTY_SYNTAX_SUGAR, false);

        // ② 限特性集 —— 阻断 new / lambda / let
        ins.setOption(Options.FEATURE_SET, Feature.asSet(Feature.If));

        // ③ 类白名单置空
        ins.setOption(Options.ALLOWED_CLASS_SET, Collections.emptySet());

        // ④ 移除全部内置函数 —— FEATURE_SET 管不到函数（Feature 枚举里无函数相关项）
        //    实测 Aviator 5.3.3 有 123 个内置函数，不移除则 sysdate()/string.length() 全可调
        for (String name : new HashSet<>(ins.getFuncMap().keySet())) {
            ins.removeFunction(name);
        }
        this.engine = ins;
    }

    // 语法：${fieldId} 比较 字面量，支持 && || ! ( ) == != > >= < <=

    public boolean eval(String expr, Map<String,Object> vars, Set<String> allowedFieldIds) {
        if (!StringUtils.hasText(expr)) return true;
        if (expr.length() > 500) throw new IllegalArgumentException("表达式过长");
        Ast ast = parse(expr);                        // 解析失败 → 抛异常
        assertDepth(ast, 5);                          // 嵌套 ≤ 5 层
        assertOnlyAllowedVars(ast, allowedFieldIds);  // 变量白名单
        return evalAst(ast, vars);
    }
}
```

**保守失败**（C3 的 FR-3.3）：解析失败或引用未声明字段 → 判 `false`（不可见/禁用）并记日志，不抛到用户。

> ⚠️ **应用层变量白名单是必需项而非可选项**（实测确认）：Aviator 对未声明变量**静默返回 false 而不报错**：
> ```
> notExist > 10000                   => false     ← 不抛异常
> amount > 10000 && notExist == nil  => true      ← 静默通过
> ```
> 所以 `assertOnlyAllowedVars(ast, allowedFieldIds)` 不能省 —— Aviator 不会因引用了不存在的字段而拒绝表达式。

**回归测试要求**：三个测试类纳入 `src/test/java/.../security/`，升级 Aviator 版本时必跑（见 `02-安全验证报告.md` §6）。

**同一解析器供 H2 的 HR-13 绩效公式复用**（改为返回 BigDecimal 的 `evalNumeric`）。

---

## 6. C4 版本管理设计

### 6.1 保存逻辑改造（`updateById` → insert）

```java
@Transactional(rollbackFor = Exception.class)
public R<String> saveFormDefinition(WfFormDefinition def) {
    WfFormDefinition latest = findLatest(def.getTenantId(), def.getFormId());

    if (latest == null) {
        def.setVersion(1); def.setIsLatest(1); def.setVersionLock(0);
        def.setChecksum(computeChecksum(def.getFieldsJson()));
        formMapper.insert(def);
        return R.ok(def.getFormId());
    }

    // 保留现有并发冲突检测（实测第 97 行逻辑）
    if (def.getVersionLock() != null && !Objects.equals(def.getVersionLock(), latest.getVersionLock())) {
        throw WorkflowException.invalidState("表单定义已被其他用户修改，请刷新后重试");
    }

    String newChecksum = computeChecksum(def.getFieldsJson());
    if (newChecksum.equals(latest.getChecksum())) {
        // AC-2：内容未变不产生新版本，仅更新 versionLock
        formMapper.updateVersionLockOnly(latest.getId(), latest.getVersionLock() + 1);
        return R.ok(def.getFormId());
    }

    // 产生新版本
    def.setId(null);                                   // 自增
    def.setVersion(latest.getVersion() + 1);
    def.setIsLatest(1);
    def.setVersionLock(latest.getVersionLock() + 1);
    def.setChecksum(newChecksum);
    def.setChangeType(diffChangeType(latest.getFieldsJson(), def.getFieldsJson()));
    if (!StringUtils.hasText(def.getChangeLog())) {
        def.setChangeLog(autoChangeLog(latest.getFieldsJson(), def.getFieldsJson()));
    }
    formMapper.insert(def);
    formMapper.markNotLatest(latest.getId());          // 原最新版 is_latest=0
    return R.ok(def.getFormId());
}
```

### 6.2 checksum 归一化（AC-2 的稳定性）

```java
private String computeChecksum(String fieldsJson) {
    // 归一化：属性键排序 + 去除无意义空白 + 忽略 _rowId 等运行时字段
    JsonNode normalized = normalize(objectMapper.readTree(fieldsJson));
    return DigestUtils.sha256Hex(objectMapper.writeValueAsString(normalized));
}
```

否则 JSON 键顺序变化会产生假版本。

### 6.3 历史实例按版本渲染（AC-5，本条目核心价值）

```java
public WfFormDefinition getFormForInstance(String instanceId) {
    WfProcessInstance inst = instanceMapper.selectById(instanceId);
    if (inst.getFormVersion() != null) {
        return formMapper.selectByFormIdAndVersion(inst.getFormId(), inst.getFormVersion());
    }
    // 兼容：form_version 为空（改造前数据）→ 取最新版并标记
    WfFormDefinition latest = findLatest(...);
    latest.setVersionUnknownFlag(true);     // 前端提示"表单版本未知"
    return latest;
}
```

### 6.4 引用完整性（AC-10）

```sql
-- 删除版本前校验
SELECT COUNT(*) FROM wf_process_instance
 WHERE form_id = ? AND form_version = ?;
-- > 0 则拒绝物理删除
```

---

## 7. 移动端渲染适配

| 类型 | 移动端降级 |
| --- | --- |
| `GRID` | 降为单列（C1 的 FR-2.1，忽略 `columns`/`span`） |
| `TABS` | 保持，标签横向滚动 |
| `SUB_TABLE` | **降为卡片列表**（C2 的 FR-3）：每行一卡，卡内字段纵向；排序改上移/下移按钮 |
| `RICH_TEXT` | 降为 `TEXTAREA` + Markdown（见 §9-3） |
| `DATE_RANGE` | 分步选择（先开始后结束） |
| 各 Selector | 全屏选择页 |

`MobileFormRenderer` 与 `FormRenderer` **共用 `fieldRegistry`**，通过 `renderPreview` 的第二套移动端实现（`renderMobilePreview`）区分，避免两份类型分支。

---

## 8. 实施顺序

| 阶段 | 内容 | 可验收 |
| --- | --- | --- |
| **M0** | **字段类型注册表 + `FormBuilder` 拆分**（先重构再加功能，否则 65 处改动） | 现有 9 种字段行为不变（C1 的 AC-12） |
| M1 | 类型定义扩展（22+5 种）+ 树形结构 + `formDefinition.ts` 解析改造 | 类型检查通过 |
| M2 | 13 个新字段类型的 preview + propertyEditor（复用现有组件） | C1 的 AC-1/2/3 |
| M3 | 4 个布局容器 + 递归渲染 + 嵌套拖拽 | C1 的 AC-4/5/6 |
| M4 | **服务端校验器**（扩展 `JsonSchemaValidator` + 22 个类型校验器） | C1 的 AC-7/8/9/11 |
| M5 | C2 子表（Web 表格 + 递归校验 + 合计） | C2 的 AC-1~6 |
| M6 | C2 移动端卡片式 + 虚拟滚动 | C2 的 AC-7/8/9 |
| M7 | **C3 服务端过滤器**（统一序列化层 + 7 个接入点） | C3 的 AC-1/2/3 |
| M8 | C3 提交校验 + 篡改审计 + 表达式解析器 | C3 的 AC-4~12 |
| M9 | C4 表结构 + 保存改 insert + checksum + 历史渲染 | C4 的 AC-1~6 |
| M10 | C4 版本列表/差异/回滚 + 前端 | C4 的 AC-7~12 |

**M0 是本批次成败关键**：不先做注册表重构就加 13 个类型，会在 5 处各加 13 分支，后续 C2 的子表列类型又要再改一遍。

---

## 9. 待确认

**全部 5 项已于 2026-08-31 定案**（见 `01-决策汇总.md` §3）：

| # | 问题 | ✅ 决策 |
| --- | --- | --- |
| 1 | 属性编辑改独立面板 | **改独立右侧面板**，三栏布局与交互细节见 §1.2 |
| 2 | 子表合计精度 | **引入 `decimal.js`**（约 30KB gzip），后端 `BigDecimal`。前端依赖 38 → 39 个 |
| 3 | `RICH_TEXT` 是否真做 | **做但降级为 Markdown**：`TEXTAREA` 输入 + `marked`（已在依赖）渲染 + `dompurify` 净化。不引入富文本编辑器（避开 XSS 面与包体积） |
| 4 | 表达式解析器 | **Aviator + 禁用函数调用**。⚠️ 实施前必须逐项验证 5 条，见 §5.3 与 `01-决策汇总.md` §5.1 |
| 5 | `lock_version` 是否删 | **确认无引用后删除**（与 `version_lock` 语义重叠，实测生效的是后者）。`wf_form_definition` 12 → 16 列（+5 −1） |

2026-10-16过期产物清理约定：本记录中的已完成历史轮次保留版本、检查范围、结果及未解决边界；过期服务包、独立环境、截图、输入快照及脚本副本按用户授权移除。当前运行和未完成验收依赖单独保护，历史失败不改写为通过；实际删除范围与空间结果见《开发测试过期文件清理-20261016.md》。
