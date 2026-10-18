# PRD：代码生成器（后端模板）

| 项 | 内容 |
| --- | --- |
| 条目编号 | SYS-07 |
| 所属批次 | 批次 A（第 1 项，本批先行） |
| 对标依据 | `docs/benchmark/05-system-系统治理对标.md` |
| 优先级 | 批次 A（已从 P2 提前，用户 2026-08-31 决策） |
| 范围决策 | **只做后端模板，前端 React 页面继续手写** |
| 预估工作量 | M |
| 版本 | v1 · 2026-08-31 |

## 1. 背景与目标

### 1.1 为什么现在做

对标调研产出 67 个可移植条目，预估需新增 **50+ 张表**。当前 121 个 Controller、371+ 实体全部手写。

手写 50 张表的后端 CRUD，除重复劳动外有一个更严重的问题：**规范会漂移**。项目已有多条硬约束（权限码命名、审计列、租户字段、禁止 Java 拼接 SQL、内部接口注解），手写 50 张表极易出现 50 种写法，而 `PLAN.md` 里的构建期扫描规则会直接阻断不合规代码，返工成本高。

### 1.2 目标

1. **主目标**：把项目既有后端规范固化进模板，保证后续新增表的后端代码规范一致
2. **次目标**：减少 CRUD 重复劳动
3. **非目标**：不追求"零代码"，生成物是**起点不是终点**，业务逻辑仍需手写

### 1.3 成功判据

- 用生成器产出的代码，**不经手改即可通过** `PLAN.md` 的构建期权限扫描规则
- 生成一张标准 CRUD 表的后端五件套耗时 < 5 分钟（对比手写约 30-60 分钟）
- 批次 A 后续项（SYS-01 消息中心 5 表、SYS-02 任务平台 2 表、节假日 2 表）的后端代码由本生成器产出，作为首批验证

## 2. 现状基线（实测，2026-08-31）

### 2.1 参考实现栈

以 `oa_supplier` 为标准样本，实测现有 CRUD 五件套形态：

**Entity**（`domain/SysSupplier.java`）
```
@Data
@TableName("oa_supplier")
  private static final long serialVersionUID = 1L;
  @TableId(type = IdType.AUTO)          → supplierId
  private Long tenantId;                 → 租户字段
  ...业务字段...
  @TableField(fill = FieldFill.INSERT)        → deleted
  @Version                                    → version
  @TableField(fill = FieldFill.INSERT)        → createBy
  @JsonFormat(pattern = "yyyy-MM-dd HH:mm:ss")
  @TableField(fill = FieldFill.INSERT)        → createTime
  @TableField(fill = FieldFill.INSERT_UPDATE) → updateBy
  @JsonFormat + @TableField(fill = INSERT_UPDATE) → updateTime
```

**Mapper**（`mapper/SysSupplierMapper.java`）—— 标准 CRUD **无 XML**，仅 7 行：
```
@Mapper
public interface SysSupplierMapper extends BaseMapper<SysSupplier> { }
```

**Controller**（`controller/SupplierController.java`，80 行）实测注解组合：
| 方法 | 注解 |
| --- | --- |
| `list` | `@GetMapping("/list")` + `@SaCheckPermission("oa:supplier:list")`，入参 `(entity query, pageNum=1, pageSize=10)`，返回 `R<IPage<T>>` |
| `getInfo` | `@GetMapping("/{id}")` + `@SaCheckPermission("oa:supplier:list")`，返回 `R<T>` |
| `add` | `@SysLog("新增供应商")` + `@RepeatSubmit` + `@PostMapping` + `@SaCheckPermission("oa:supplier:add")`，返回 `R<Void>` |
| `edit` | `@SysLog` + `@PutMapping` + `@SaCheckPermission("oa:supplier:edit")` |
| `remove` | `@SysLog` + `@DeleteMapping("/{ids}")` + `@SaCheckPermission("oa:supplier:remove")`，入参 `@PathVariable List<Long> ids` |

类级：`@RestController` + `@RequestMapping("/supplier")` + `@RequiredArgsConstructor`

**关键结论**：标准 CRUD 走 MyBatis-Plus `BaseMapper` 即可，**不需要 XML mapper**。XML 只在自定义查询时才写 —— 这与"禁止 Java 拼接 SQL"约束一致（不写 SQL 自然不违反）。

### 2.2 项目硬约束（模板必须内置）

| 约束 | 来源 | 模板处理 |
| --- | --- | --- |
| 禁止 Java 拼接 SQL 字符串 | 项目长期约定 | 标准 CRUD 走 BaseMapper；自定义查询生成 XML 骨架，绝不生成 `String sql = "..."` |
| 权限码 `{module}:{resource}:{action}` | `PLAN.md` 完成态 | 模块前缀限 `system`/`oa`/`crm`/`hr`/`workflow` 五类，生成时校验 |
| 外部 Controller 不得仅 `@SaCheckLogin` | `PLAN.md` 构建期扫描规则 | 每个外部方法必带 `@SaCheckPermission` |
| 内部接口走 `@Inner` | `PLAN.md` | `tpl_category=INNER` 时生成 `@Inner` 而非权限码 |
| 标准审计列 | 各表实际结构；2026-09-16用户确认 | 按表中已有字段生成，保留对应审计填充注解；不补不存在的列，验证码表`sys_sms_code`保持仅有`create_time`的结构 |
| 多租户隔离 | 现有全部业务表 | `tenant_id` 字段 + 自动填充 |
| 写操作幂等 | `docs/M0-8-RepeatSubmit-Guide.md` | `add` 方法带 `@RepeatSubmit` |
| 操作日志 | 现有 `@SysLog` | 增删改三个方法带 `@SysLog` |
| 项目未上线不做兼容 | 项目约定 | 生成建表 SQL 直接写进结构脚本，不生成迁移脚本 |

## 3. 范围

### 3.1 做

| # | 内容 |
| --- | --- |
| 1 | 表元数据管理：导入数据库表结构 → 落 `sys_codegen_table` / `sys_codegen_column` |
| 2 | 列配置：Java 类型映射、是否必填、是否参与列表/查询/新增/编辑、查询方式、HTML 控件类型、关联字典 |
| 3 | 生成后端五件套：Entity / Mapper 接口 / Mapper XML（仅自定义查询需要时）/ Service + ServiceImpl / Controller |
| 4 | 生成建表 SQL 骨架（含审计列、租户列、索引建议） |
| 5 | 生成菜单与权限初始化 SQL 片段（减少 `06.cloudflow-business-seed.sql` 手工维护） |
| 6 | 预览与下载：在线预览生成结果、打包 ZIP 下载、可选直接写入指定路径 |

### 3.2 不做

| 项 | 原因 |
| --- | --- |
| **前端 React 页面模板** | 参考项目（ruoyi-vue-pro / JeecgBoot）模板均为 Vue；我们是 React 19 + TanStack Query + Zustand + 约 70 个自研公共组件，生成页面风格难贴合，且各模块页面差异大。前端继续手写 |
| 业务逻辑生成 | 生成物是 CRUD 骨架，状态机、校验、跨服务调用等一律手写 |
| 反向工程（代码生成表） | 只做表 → 代码单向 |
| 在线表结构设计器 | 建表 SQL 仍在 `DB/*.sql` 维护，生成器只读表结构 |
| 覆盖已有 121 个 Controller | 只服务于新增表，不重写存量代码 |

## 4. 使用角色与权限

| 角色 | 权限码 | 可做 |
| --- | --- | --- |
| 开发/管理员 | `system:codegen:list` / `:import` / `:edit` / `:preview` / `:generate` / `:remove` | 全部 |
| 其他角色 | — | 无权访问 |

**约束**：生成器是开发期工具，权限只授予受信管理角色。生产环境建议通过配置开关整体关闭（`cloudflow.codegen.enabled=false`）。

## 5. 功能需求

### FR-1 表结构导入
- FR-1.1 列出当前数据源的所有表（表名、注释、创建时间），支持按表名模糊搜索、排除已导入表
- FR-1.2 勾选表批量导入，读取 `information_schema` 得到列名、列注释、数据类型、是否主键、是否自增、是否可空
- FR-1.3 导入时按规则推导默认值：
  - `class_name`：表名去模块前缀后转大驼峰（`oa_supplier` → `Supplier`；实体类名可配前缀，如现有 `SysSupplier`）
  - `module_name`：按表名前缀推导（`sys_`→system、`oa_`/`biz_`→oa、`crm_`→crm、`hr_`→hr、`wf_`→workflow），**推导结果必须落在五类内，否则要求人工指定**
  - `business_name`：用于 URL 与权限码资源段
  - Java 类型：`bigint`→`Long`、`int`/`tinyint`/`smallint`→`Integer`、`varchar`/`char`/`text`/`longtext`→`String`、`decimal`→`BigDecimal`、`datetime`/`timestamp`→`LocalDateTime`、`date`→`LocalDate`、`time`→`LocalTime`、`json`→`String`
  - 审计列（`deleted`/`version`/`create_by`/`create_time`/`update_by`/`update_time`）与 `tenant_id` 自动识别并标记为"不参与列表/查询/新增/编辑表单"
- FR-1.4 已导入的表可重新同步表结构（新增列追加、删除列移除、已有列配置保留）

### FR-2 列配置
- FR-2.1 可编辑每列：显示名称、Java 字段名、Java 类型、是否必填、是否参与新增/编辑/列表/查询、查询方式、HTML 控件类型、字典类型、排序号
- FR-2.2 查询方式枚举：`EQ` / `NE` / `GT` / `GE` / `LT` / `LE` / `LIKE` / `BETWEEN` / `IN`
- FR-2.3 HTML 控件类型枚举：`input` / `textarea` / `number` / `select` / `radio` / `checkbox` / `date` / `datetime` / `daterange` / `upload` / `editor`（该字段仅作为手写前端时的参考信息，本期不生成前端代码）
- FR-2.4 `dict_type` 可从现有 `sys_dict_type` 下拉选择

### FR-3 生成配置
- FR-3.1 表级配置项：`tpl_category`（`CRUD` 标准增删改查 / `TREE` 树形结构 / `SUB` 主子表 / `INNER` 内部接口）、`module_name`、`business_name`、`class_name`、`function_name`（功能中文名，用于注释与 `@SysLog`）、`author`、`parent_menu_id`
- FR-3.2 开关项：`tenant_field_flag`（是否含租户字段）、`logic_delete_flag`（是否逻辑删除）、`version_field_flag`（是否乐观锁）
- FR-3.3 `TREE` 类型额外配置：父字段名、显示字段名
- FR-3.4 `SUB` 类型额外配置：子表名、外键字段

### FR-4 代码生成
- FR-4.1 生成 Entity：按 2.1 的注解形态，字段顺序为 主键 → 租户 → 业务字段 → 审计列
- FR-4.2 生成 Mapper 接口：`@Mapper` + `extends BaseMapper<T>`
- FR-4.3 生成 Mapper XML：**仅当存在自定义查询需求时生成骨架**（含 `resultMap`），标准 CRUD 不生成空 XML
- FR-4.4 生成 Service 接口 + Impl：Impl 继承 `ServiceImpl<Mapper, Entity>`，包含 list（分页 + 按 `query_type` 组装 `LambdaQueryWrapper`）/ getById / save / updateById / removeByIds
- FR-4.5 生成 Controller：按 2.1 的注解组合，权限码为 `{module_name}:{business_name}:{action}`
- FR-4.6 `tpl_category=INNER` 时：路径前缀 `/inner/{module}/{business}`，方法用 `@Inner` 不用 `@SaCheckPermission`
- FR-4.7 生成建表 SQL 骨架：含审计列、租户列、主键、`tenant_id` 索引建议、列注释（取自 `column_comment`）
- FR-4.8 生成菜单与权限 SQL 片段：`sys_menu` 插入语句（含 5 个权限码按钮）+ `sys_role_menu` 授权片段，可直接贴进 `06.cloudflow-business-seed.sql`

### FR-5 预览与产出
- FR-5.1 在线预览：按文件分页签展示生成结果，带语法高亮（前端已有 `SourceCodeViewer.tsx` 组件可复用）
- FR-5.2 打包下载 ZIP，目录结构按 Maven 标准布局
- FR-5.3 可选直接写入磁盘指定路径；**写入前必须列出将覆盖的文件并要求二次确认**，默认不覆盖已存在文件

## 6. 数据模型

### 6.1 `sys_codegen_table`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| table_id | BIGINT PK AUTO | 主键 |
| table_name | VARCHAR(100) | 表名 |
| table_comment | VARCHAR(200) | 表注释 |
| module_name | VARCHAR(30) | 模块名，限 system/oa/crm/hr/workflow |
| business_name | VARCHAR(50) | 业务名，用于 URL 与权限码资源段 |
| class_name | VARCHAR(100) | 实体类名 |
| function_name | VARCHAR(100) | 功能中文名 |
| package_name | VARCHAR(200) | 生成包路径 |
| author | VARCHAR(50) | 作者 |
| tpl_category | VARCHAR(20) | CRUD/TREE/SUB/INNER |
| parent_menu_id | BIGINT | 上级菜单 ID |
| sub_table_name | VARCHAR(100) | 子表名（SUB 用） |
| sub_table_fk | VARCHAR(64) | 子表外键（SUB 用） |
| tree_parent_code | VARCHAR(64) | 树父字段（TREE 用） |
| tree_name_code | VARCHAR(64) | 树显示字段（TREE 用） |
| tenant_field_flag | TINYINT | 是否含租户字段 |
| logic_delete_flag | TINYINT | 是否逻辑删除 |
| version_field_flag | TINYINT | 是否乐观锁 |
| remark | VARCHAR(500) | 备注 |
| + 标准审计列 | | deleted/version/create_by/create_time/update_by/update_time |

唯一索引：`uk_table_name(table_name)`

### 6.2 `sys_codegen_column`

| 字段 | 类型 | 说明 |
| --- | --- | --- |
| column_id | BIGINT PK AUTO | 主键 |
| table_id | BIGINT | 所属表 |
| column_name | VARCHAR(100) | 列名 |
| column_comment | VARCHAR(200) | 列注释 |
| column_type | VARCHAR(100) | 数据库类型 |
| java_type | VARCHAR(100) | Java 类型 |
| java_field | VARCHAR(100) | Java 字段名 |
| pk_flag | TINYINT | 是否主键 |
| increment_flag | TINYINT | 是否自增 |
| required_flag | TINYINT | 是否必填 |
| insert_flag | TINYINT | 参与新增 |
| edit_flag | TINYINT | 参与编辑 |
| list_flag | TINYINT | 参与列表 |
| query_flag | TINYINT | 参与查询 |
| query_type | VARCHAR(20) | EQ/NE/GT/GE/LT/LE/LIKE/BETWEEN/IN |
| html_type | VARCHAR(30) | 控件类型（供手写前端参考） |
| dict_type | VARCHAR(100) | 关联 sys_dict_type |
| audit_field_flag | TINYINT | 是否审计列（自动识别） |
| sort_no | INT | 排序 |
| + 标准审计列 | | |

索引：`idx_table_id(table_id)`

**放置位置**：`DB/01.cloudflow-common.sql`（属系统治理层）

## 7. 接口设计

服务：`cloudflow-auth`，路径前缀 `/system/codegen`

| 方法 | 路径 | 权限码 | 说明 |
| --- | --- | --- | --- |
| GET | `/db/list` | `system:codegen:list` | 查询数据库表（未导入的） |
| GET | `/list` | `system:codegen:list` | 查询已导入表（分页） |
| GET | `/{tableId}` | `system:codegen:list` | 表与列配置详情 |
| POST | `/import` | `system:codegen:import` | 批量导入表结构 |
| PUT | `/` | `system:codegen:edit` | 保存表与列配置 |
| POST | `/{tableId}/sync` | `system:codegen:edit` | 重新同步表结构 |
| GET | `/{tableId}/preview` | `system:codegen:preview` | 预览生成代码（返回 文件路径→内容 映射） |
| GET | `/{tableId}/download` | `system:codegen:generate` | 下载 ZIP |
| POST | `/{tableId}/write` | `system:codegen:generate` | 写入磁盘（需 `confirmOverwrite` 参数） |
| DELETE | `/{tableIds}` | `system:codegen:remove` | 删除导入记录 |

## 8. 非功能需求

| 项 | 要求 |
| --- | --- |
| 环境开关 | `cloudflow.codegen.enabled`，生产默认 false；关闭时接口返回 403 |
| 权限 | 仅受信管理角色；所有生成与写入操作记 `@SysLog` + `sys_audit_log` |
| 路径安全 | FR-5.3 写入磁盘必须限制在项目根目录内，**拒绝路径穿越**（`../`）；拒绝写入 `DB/`、`config/` 等敏感目录之外的绝对路径 |
| 表名安全 | FR-1 读 `information_schema` 时表名参数化，不拼接；只允许查询当前配置数据源 |
| 生成质量 | 生成代码必须通过 `mvn compile`；权限码必须通过 `PLAN.md` 构建期扫描 |
| 模板可维护 | 模板文件外置（Velocity 或 Freemarker），改模板不需改 Java 代码 |
| 幂等 | 重复生成同一表结果一致（不含时间戳等易变内容，或时间戳可关闭） |

## 9. 验收标准

| # | 验收项 |
| --- | --- |
| AC-1 | 导入 `oa_supplier`，生成结果与现有手写 `SysSupplier` / `SysSupplierMapper` / `SupplierController` **结构一致**（注解、方法签名、返回类型） |
| AC-2 | 生成代码 `mvn compile` 通过，无需手改 |
| AC-3 | 生成的 Controller 每个外部方法都有 `@SaCheckPermission`，权限码前缀在五类内；`PLAN.md` 构建期扫描通过 |
| AC-4 | 生成的 Entity 审计列六项齐全且注解正确（`@TableField(fill)` / `@Version` / `@JsonFormat`） |
| AC-5 | 生成代码中**不存在** Java 字符串拼接 SQL |
| AC-6 | `tpl_category=INNER` 时生成 `@Inner`，路径为 `/inner/{module}/{business}`，无权限码 |
| AC-7 | 生成的菜单权限 SQL 片段可直接执行，执行后该功能在前端菜单可见、5 个按钮权限可授权 |
| AC-8 | 写入磁盘时对已存在文件默认不覆盖；传路径穿越参数被拒绝 |
| AC-9 | `cloudflow.codegen.enabled=false` 时全部接口 403 |
| AC-10 | 用本生成器产出 SYS-01 消息中心 5 张表的后端代码，作为首批实战验证 |

## 10. 依赖与风险

### 10.1 依赖
- 无外部依赖（不引入新中间件）
- 模板引擎：项目现有依赖中 Hutool 5.8.26 自带模板能力，或引入 Velocity（Apache-2.0）

### 10.2 风险

| 风险 | 应对 |
| --- | --- |
| 生成代码与手写风格有细微差异，导致代码库两种风格并存 | AC-1 以现有 `oa_supplier` 栈为基准对齐；差异项在模板中修正而非事后手改 |
| 模板固化的规范本身过时（如后续权限码规则变化） | 模板外置，规范变化只改模板；已生成代码不追溯修改 |
| 开发依赖生成器而跳过设计思考，产出一堆无业务逻辑的 CRUD | 明确定位：生成物是**起点**；PRD 3.2 已声明不生成业务逻辑 |
| 写入磁盘误覆盖已有代码 | 默认不覆盖 + 二次确认 + 路径限制（NFR + AC-8） |

## 11. 里程碑

| 阶段 | 内容 |
| --- | --- |
| M1 | 2 张表结构 + 表结构导入 + 列配置 CRUD 接口 |
| M2 | Entity / Mapper / Service / Controller 四模板 + 预览接口（AC-1/2/3/4/5 可验） |
| M3 | 建表 SQL 与菜单权限 SQL 模板 + TREE/SUB/INNER 三类模板（AC-6/7 可验） |
| M4 | 下载与写入磁盘 + 环境开关 + 安全加固（AC-8/9 可验） |
| M5 | 前端管理页面（手写）+ 用 SYS-01 五表实战验证（AC-10） |

## 12. 待确认

| # | 问题 | 建议默认 |
| --- | --- | --- |
| 1 | 实体类名是否统一带 `Sys`/模块前缀？现状不一致（`SysSupplier` vs `HrEmployee` vs `CrmCustomer`） | 按模块推导：system→`Sys`、hr→`Hr`、crm→`Crm`、oa→无前缀或 `Oa`、workflow→`Wf`；导入时可人工改 |
| 2 | 模板引擎选 Velocity 还是复用 Hutool | 复用 Hutool 少一个依赖，但 Velocity 模板可读性更好；建议 Velocity |
| 3 | 是否需要生成 DTO/VO（现有 HR 模块有 `domain/dto` 与 `domain/vo` 分层，OA 直接用 Entity） | 本期先只生成 Entity；DTO/VO 分层各模块不一致，按需手写 |
