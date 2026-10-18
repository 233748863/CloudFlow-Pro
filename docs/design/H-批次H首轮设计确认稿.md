# 批次 H 首轮设计确认稿

状态：用户已确认首轮四项及 HR 方案 A，已实施并进入真实验收。设计核实日期：2026-09-13；实施核实日期：2026-09-14。

确认范围为 INT-06 一期菜单搜索、WF-11 草稿、OA-08 耗材台账、HR-09 加班调班。下文保留确认时的设计及基线；运行状态与逐项证据以 [H 首轮实施与验收记录](H-首轮实施与验收记录.md) 为准，设计预期不等同于已通过验收。

实施补充：普通员工发起页与草稿参考字段现使用按当前租户、本人发起资格及字段可见性裁剪的专用目录接口，不再依赖流程/人员管理权限。菜单搜索已分别验证桌面、窄屏桌面和真正手机路由；草稿页面与独立数据库事务证据分开记录，保留既有手机草稿和C子表边界。

配套专项设计：

- [OA-08 耗材台账](H-OA08-耗材台账设计确认稿.md)
- [HR-09 加班调班](H-HR09-加班调班设计确认稿.md)

术语：DDL = 可直接用于建表的 SQL；幂等 = 重复请求只产生一次业务结果；乐观锁 = 请求携带读到的版本号，版本已变化时拒绝覆盖；冲正 = 保留原流水，追加一笔反向流水；物化值 = 从流水计算并保存在主表、供日常快速查询的余额。

## 1. 重新摸排及范围边界

### 1.1 数据库与菜单实际基线

已统计正式脚本，并通过本仓连接助手对当前数据库执行只读事务查询；没有重建库、修改数据、清缓存或重启服务。

| 项目 | 本次实测 | 本轮约定 |
| --- | --- | --- |
| `01.cloudflow-common.sql` | 50 张表 | 菜单搜索不新增表 |
| `02.cloudflow-workflow.sql` | 45 张表 | 草稿表已存在，完善原表 |
| `03.cloudflow-hr.sql` | 100 张表 | HR-09 建议增加类型表及两张独立申请表 |
| `04.cloudflow-oa.sql` | 87 张表 | OA-08 按专项稿增加台账和领用单 |
| `05.cloudflow-crm.sql` | 35 张表 | 本轮不改 CRM 业务 |
| 正式脚本 / 当前库 | 均为 317 张表 | 不采用旧稿 319/320 的估计基线 |
| 当前 `sys_menu` | 731 条，最大编号 1762 | `1800—1859` 查询结果为 0 行 |
| 当前 `sys_job` / `sys_job_handler` | `1800—1859` 均无占用 | 拟新增草稿清理任务使用 1800 |
| 角色 | 11 个 | 包括 11 `customer_success`，不沿用旧文档的 10 角色 |
| `wf_form_draft` | 0 行 | 不设计旧草稿迁移 |

角色编号为：1 admin、2 manager、3 finance、4 hr、5 employee、6 legal、7 oa_clerk、8 sales_manager、9 sales_rep、10 crm_ops、11 customer_success。

当前拥有 `workflow:process:start` 的种子角色只有 1、2、3、4、5、8、9；草稿功能不能顺便向其他角色授予流程发起或流程管理权限。业务单据的审批走其本模块受限工作流入口，不能为了接线扩大通用权限。

菜单段位预留：WF-11 使用 1800—1809；OA-08 使用 1810—1829；HR-09 使用 1830—1859；INT-06 复用当前用户菜单，不新增菜单权限。预留空位不生成占位记录，落库前必须再次查询实际冲突。

### 1.2 搜索与草稿的代码证据

| 事实 | 现有位置 | 设计影响 |
| --- | --- | --- |
| 菜单查询及缓存已存在 | `cloudflow-frontend/src/hooks/useBackendMenus.ts:4` | 复用 `backendMenuQueryKey` 和 `getRouters`，不建搜索后端 |
| 菜单已有转换、展平、路径和查询参数处理 | `cloudflow-frontend/src/layouts/MainLayout.tsx:45`、`cloudflow-frontend/src/utils/menuRouteFixes.ts:76` | 侧栏和搜索共用处理结果，不能各写一套路径规则 |
| 查询缓存只有租户维度，退出会话只清存储桶 | `cloudflow-frontend/src/lib/queryClient.ts:13`、`cloudflow-frontend/src/utils/sessionCleanup.ts:34` | 菜单查询与搜索历史都须带用户维度，不能复用同租户上一账号的5分钟菜单缓存 |
| B 已建草稿表与唯一键 | `cloudflow-backend/DB/02.cloudflow-workflow.sql:1125` | 已有一租户、一用户、一定义一份草稿的基础 |
| 当前没有草稿实体、接口与清理任务 | 全仓查找 `wf_form_draft` / `draftId`；现有 `ProcessStartReq.java:9` 只有四项发起字段 | WF-11 仍需服务与界面逻辑，不能把预建表当成功能完成 |
| 发起按 Key 选最新已发布定义，并按业务键防重复 | `cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/impl/WfInstanceServiceImpl.java:1267` | 从草稿发起必须核对定义快照并使用服务端业务键 |
| 发起弹窗现有审批人选择与表单渲染 | `cloudflow-frontend/src/components/workflow/catalog/WorkflowLaunchDialog.tsx:22` | 恢复时仍重新验证审批人候选范围 |
| 表单已有受控展示，但提交只读取内部状态 | `cloudflow-frontend/src/components/FormRenderer.tsx:104` | 恢复不能只传 `data`；须统一提交、校验、变更所用的数据来源 |
| 表单可原 ID 更新，页面按 ID 缓存 | `cloudflow-backend/cloudflow-service-workflow/src/main/java/com/cloudflow/workflow/service/impl/WfFormServiceImpl.java:102`、`cloudflow-frontend/src/pages/Workplace.tsx:178` | 第一次保存也要核验用户加载时的配置摘要，不能保存时才首次生成摘要 |

### 1.3 发现的前置缺口，须确认验收边界

H1 原 PRD 的 AC-5 要求子表数据恢复，明确依赖 C 的 LC-03。当前 `cloudflow-frontend/src/types.ts:32` 只有 TEXT、NUMBER、DATE、SELECT、TEXTAREA、EMPLOYEE、DEPT、POST、POSITION 九类字段；没有 SUB_TABLE 类型或对应渲染器，仓内也未找到 C 设计中的 `RestrictedExpressionEvaluator`。`wf_form_definition` 仍是现有 12 列形态。因此不能宣称 C 的树形表单与子表已完成。

建议本轮交付九类现有字段的草稿、审批人恢复及通用数据存储；子表完整恢复的 AC-5 标为“前置 C 未就绪，未验收”，待 C 完成后接入并联验。用户如要求 WF-11 原 PRD 全部验收，WF-11 的完整交付必须等待 C，不能在 H 中默默扩做 C。此边界尚待本稿确认。

其他发现：通用约束中的 244 表、1210 最大菜单编号、10 角色属于旧基线；本次按实测值设计。OA 原估计“四表”不能据此凑表；以三张明确业务表为准，详见专项稿。

HR 的类型倍率主数据也尚未建立：现有 `overtime_type_id` 只是预留列，字典编号不能当类型表主键；调休假种目前 `compensatory_flag=0`，没有自动转入链路。H2 原 PRD 的“两张表”是加班类型表与调班申请表，并沿用混合时间申请；若解决 H 优先级指出的加班与请假混用问题，还需独立加班申请表。因此本稿推荐 HR 专项的三表方案 A，四项总新增六表；这是待用户确认的设计建议。保留原 PRD 混合申请方案 B 则总新增五表，不把两种方案混在同一套 SQL 中。

本轮不做业务数据全文搜索、OAuth2、客户门户、邮件归档、包含网关、OA 会议深化或 C 表单引擎，也不宣布 D/E 的延后项、F/G 整批已验收。

## 2. INT-06 一期：菜单与功能搜索

### 2.1 用户操作与界面

桌面主布局顶栏增加搜索按钮及 `Ctrl/Cmd+K` 提示；窄屏提供同一个按钮入口，面板自适应可用宽度。继续使用 `BaseDialog`、`Input`、`Button`、Lucide 图标、现有主题颜色与字体，不引入第二套界面库。

```text
+--------------------------------------------------+
| 搜索功能                                      Esc |
| [ 输入名称、拼音首字母或菜单路径                 ] |
| 最近访问 / 常用功能（关键词为空时）                |
| > 我的申请           流程中心 / 我的申请           |
|   耗材管理           行政管理 / 耗材管理           |
| 上下选择   Enter打开   Esc关闭                     |
+--------------------------------------------------+
```

输入变化立即在本地菜单集合匹配。结果显示名称及父级位置，保留原菜单路径和查询参数。空输入显示最近访问及常用功能；无结果显示清楚的空态；菜单加载中、加载失败和无可用菜单分别提示，失败不回退到全量静态路由。

键盘支持上下移动、回车打开、Esc 关闭、Tab 焦点约束和关闭后焦点返回。中文输入法组合输入期间不触发导航；富文本或代码编辑器占用快捷键时不抢夺。使用对话框和列表框语义、结果数量播报；触控入口至少 44×44 像素。面板使用 150 毫秒淡入，遵守系统减少动画设置。

### 2.2 数据与匹配规则

1. 复用登录后已有的菜单树。保留 `backendMenuQueryKey` 作为失效前缀，实际菜单 queryKey 增加当前 tenantId/userId；主布局与搜索共用同一个身份化查询。身份未确定时不启用，权限刷新时使当前键失效重取；不使用上一账号的缓存或 keepPreviousData 过渡。只索引当前用户实际获授权、`status='0'`、`visible='0'` 的 C 类菜单；祖先隐藏或停用时其子树也排除。M 类只提供分组，F 类按钮不作为搜索结果。
2. 提取主布局现有菜单转换/展平为共用纯函数，继续调用 `applyKnownMenuRouteFix`、`normalizeMenuRoutePath`；不更改原有菜单名称修正或路由语义。保留显式 `query`，并按现有规则兼容路径内查询参数。
3. 只允许站内路由：拒绝 `javascript:`、`data:`、协议相对路径、外部 URL 和空路径。导航时再次核实菜单仍在当前授权集合，并由现有路由守卫、后端权限完成最终校验。
4. 匹配中文名称、英文名称、拼音首字母和规范化路径；采用不区分英文大小写的子串匹配。排序依次为名称完全匹配、名称前缀、名称或拼音命中、路径命中；同等级沿菜单顺序及 `menuId` 稳定排序。
5. 本地关键词上限建议为 80 字符；结果最多显示 20 条，并提示缩小范围。允许单个汉字检索；原 PRD 的“至少 2 字符”和“搜索接口限流”来自二期业务查询，不在本期新建接口实现。

拼音方案建议选技术要点已列出的 `pinyin-match`，固定 `1.2.10`；2026-09-13 查询 npm 元数据为 MIT、无运行依赖、带 `index.d.ts`、解包大小 486407 字节。解包大小不代表最终页面下载体积，编码后需检查生产产物。只在搜索组件中使用并按面板懒加载；不自行拼不完整汉字首字母字典。该新前端依赖随本设计一并待确认，当前未安装。

### 2.3 最近访问、常用功能与隔离

沿用 `tenantStorage`，键名为 `menu-search:v1:user:{userId}`，从而同时包含租户及用户。只保存菜单 ID 与访问时间，不保存关键词、表单内容、菜单查询参数、访问令牌或业务对象。

建议保存最近 30 天、最多 100 次有效菜单访问；最近访问取其中最近的 8 个不同菜单，常用功能按这份有界记录的访问次数取前 6 个，不宣称是全部历史使用频率。频次相同按最近访问时间排序。侧栏、搜索和直接进入有匹配菜单的页面使用同一记录入口，重复渲染不重复计数。

每次展示先与当前授权菜单重新求交集；历史 ID 不反查或拼造任何菜单。用户/租户变化、退出登录、鉴权失效时关闭面板、清空输入及组件索引；页面刷新从当前身份的桶恢复。保留现有 `clearSessionCaches` 退出清桶行为及切租户清其它桶的安全策略，不承诺退出后还保留旧历史。存储损坏、不可写或被清空时仍可搜索。浏览器持久记录按到期策略清理，不跨账户共用。

### 2.4 六步落点与验收

本项 DDL 为零、新增后端接口为零、新权限码为零、新菜单种子为零。已有数据源是 `GET /auth/getRouters`；不得调用 `/auth/system/menu/list` 来获得全量菜单。拟变更范围为主布局、共用菜单转换函数、搜索面板与历史 Hook、前端依赖清单和锁文件。

| 编号 | 可自测验收 |
| --- | --- |
| INT-01 | Windows Ctrl+K、Mac Cmd+K、按钮均能打开；上下/回车/Esc/焦点返回正确 |
| INT-02 | 中文名、拼音首字母、英文大小写和含查询参数路由能匹配并到达原菜单目标 |
| INT-03 | 无权限、隐藏、停用、按钮、危险外链及祖先不可见的菜单不出现 |
| INT-04 | 最近访问与常用功能按本节数量和排序显示；撤权后旧历史不恢复菜单 |
| INT-05 | 同租户两个不同权限账号在5分钟缓存期内先后登录，或切换租户/权限刷新，均不能闪现上一身份菜单；历史遵从既有退出清理且不串用 |
| INT-06 | 输入和打开面板不产生新的搜索 HTTP 请求；菜单失败不暴露静态全量路由 |
| INT-07 | 损坏/满额 localStorage、窄屏、浅色/深色主题可用；现有侧栏、面包屑和路由查询参数不变 |

## 3. WF-11：草稿设计

### 3.1 业务规则与前后端接线

一租户、一用户、一个具体 `definition_id` 只有一份草稿；正常再次保存更新原草稿，多窗口过期版本禁止静默覆盖。草稿仅放在 `wf_form_draft`，不创建流程实例、待办、监控记录、业务审批副作用或通知；`WfProcessStatus.DRAFT` 继续保留，不拿来生成空流程实例。

手动保存和自动保存共用接口。自动保存采用变更后 5 秒防抖，并设置连续编辑最长 30 秒触发一次；没有实质变化不写库、不延长有效期。最近有效保存后 30 天到期，时间由服务端计算。保存允许必填项暂缺，提交才执行完整的当前字段校验与流程发起校验。

发起页按定义查询本人草稿并提示恢复；恢复完整保留九类现有字段的值和审批人选择。新增“我的草稿”页面，显示流程名、标题、最近保存时间、到期时间及可继续/已失效状态，并支持本人删除。

```text
+--------------------------------------------------+
| 发起流程                          [ 我的草稿(3) ] |
+--------------------------------------------------+
| 填写申请                                          |
| 现有表单字段与审批人选择                           |
| 已保存 14:30:12       [ 保存草稿 ] [ 提交申请 ]     |
+--------------------------------------------------+
```

`WorkflowLaunchDialog` 持有表单值、审批人、草稿 ID、草稿版本、loadedContextHash 及 dirty/saving/error 状态；`FormRenderer` 的展示、变更、校验和提交统一读取 `getRuntimeData()`。保持未传 `data` 的原调用方式不变，不额外创建另一套表单渲染器。支持草稿的弹窗每次打开都从下述 context 接口取得同批表单结构和配置摘要，不把旧 `formCache` 与新摘要拼在一起；审批人候选仍沿用 B 的服务计算。请求结果绑定打开时的租户、用户、定义和草稿，关闭或切换之后的旧响应不能覆盖新弹窗。

提交前停止自动保存并等待当前保存完成，最后保存成功后携版本提交；保存失败留在界面并保留当前内存数据。离开时有未保存改动则提示，不能声称关闭浏览器后的异步请求一定保存成功；不把业务草稿正文写进 localStorage。

### 3.2 完整 DDL 与现有表改动

下列 SQL 是获批后替换 `02` 中原草稿建表段的最终形态草案；本次仅写入文档，没有执行。表数不变；保留 workflow 的字符串主键、不加物理外键、不加 `deleted`。

新增 `definition_snapshot_hash`、`lock_version`、`create_by`、`update_by`、`update_time` 五列；前三个时间/租户非空约束和查询索引调整见完整定义。这些字段是原要点未定义的设计补充，需本稿确认：版本防止多窗口丢失修改，摘要防止已发布定义或表单原地变化，审计列对齐通用规范。

```sql
DROP TABLE IF EXISTS wf_form_draft;
CREATE TABLE wf_form_draft (
  draft_id                 VARCHAR(64)   NOT NULL COMMENT '草稿ID',
  tenant_id                BIGINT(20)    NOT NULL DEFAULT 100000 COMMENT '租户ID',
  definition_id            VARCHAR(64)   NOT NULL COMMENT '流程定义ID',
  definition_name          VARCHAR(100)  DEFAULT NULL COMMENT '流程名称快照',
  form_id                  VARCHAR(64)   DEFAULT NULL COMMENT '绑定表单ID',
  user_id                  BIGINT(20)    NOT NULL COMMENT '草稿所属用户ID',
  title                    VARCHAR(200)  DEFAULT NULL COMMENT '申请标题',
  form_data                LONGTEXT     COMMENT '表单数据JSON对象',
  node_assignees           TEXT         COMMENT '发起人自选审批人JSON对象',
  attachment_url           VARCHAR(1000) DEFAULT NULL COMMENT '预留附件引用，本轮不接受任意外部URL',
  definition_snapshot_hash CHAR(64)      NOT NULL COMMENT '流程表单及发起配置SHA256摘要',
  lock_version             INT          NOT NULL DEFAULT 1 COMMENT '草稿乐观锁版本号',
  last_save_time           DATETIME     NOT NULL DEFAULT CURRENT_TIMESTAMP COMMENT '最近有效保存时间',
  expire_time              DATETIME     NOT NULL COMMENT '最近有效保存30天后的到期时间',
  create_by                VARCHAR(64)  DEFAULT '' COMMENT '创建者',
  create_time              DATETIME     DEFAULT CURRENT_TIMESTAMP COMMENT '创建时间',
  update_by                VARCHAR(64)  DEFAULT '' COMMENT '更新者',
  update_time              DATETIME     DEFAULT NULL ON UPDATE CURRENT_TIMESTAMP COMMENT '更新时间',
  PRIMARY KEY (draft_id),
  UNIQUE KEY uk_wfdraft_user_def (tenant_id, user_id, definition_id),
  KEY idx_wfdraft_expire (expire_time, draft_id),
  KEY idx_wfdraft_user_save (tenant_id, user_id, last_save_time, draft_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COMMENT='表单草稿表';
```

`form_data` 沿用现有 LONGTEXT，由服务端严格解析为 JSON 对象再序列化写入；不把字符串直接拼 SQL。摘要由服务端对定义 ID/版本、绑定表单 ID/字段结构、流程模型中的审批人选择配置及 `__START__` 字段权限进行确定性序列化后计算；数组次序保留、对象键稳定排序，不采用前端提供的摘要。

当前九类表单没有通用上传控件。`attachment_url` 保留但本轮写入必须为 NULL，接口不接收任意 URL；不能把预留列变成绕过业务文件鉴权的入口。C 上传/子表及对应安全组件落地后再设计附件恢复，不伪造现成附件检查器。

### 3.3 接口签名与权限码

下表为工作流服务内路径；网关统一增加 `/workflow` 前缀。返回统一使用 `R<T>` / `R<PageResult<T>>` / `R<Void>`，分页沿 `PageQuery`。

| 方法与路径 | 入参 | 出参 | 权限 |
| --- | --- | --- | --- |
| `GET /wf/draft/context/{definitionId}` | 具体定义 ID | `DraftLaunchContextVO` | `workflow:draft:view` 或 `workflow:draft:save`，同时检查定义发起资格 |
| `POST /wf/draft` | `DraftSaveRequest` | `DraftSaveResult` | `workflow:draft:save` |
| `GET /wf/draft/list` | pageNum、pageSize、keyword、definitionId 可选 | `PageResult<DraftSummaryVO>` | `workflow:draft:list` |
| `GET /wf/draft/by-definition/{definitionId}` | 具体定义 ID | 本人草稿摘要或 NULL | `workflow:draft:view` |
| `GET /wf/draft/{draftId}` | 草稿 ID | `DraftDetailVO` | `workflow:draft:view` |
| `DELETE /wf/draft/{draftId}` | expectedVersion 必填 | Void | `workflow:draft:remove` |
| `POST /wf/start` 现有接口扩展 | 原请求，或 draftId + expectedVersion | 现有 instanceId、processInstanceId、processNo | 原 `workflow:process:start`；草稿分支额外校验 `workflow:draft:submit` |

请求与结果字段完整约定：

- `DraftLaunchContextVO`：definitionId、processDefKey、definitionName、formId、当前九类字段的 formDefinition、`__START__` 的 fieldPermissions、B 的 assigneeNodes、contextHash。服务端在一致性读取下同时生成结构与摘要；表单为空时明确返回 NULL。接口不返回其它定义节点的配置或未授权表单。
- `DraftSaveRequest`：draftId 可空字符串、definitionId 必填字符串、expectedVersion 必填整数（新建 0、修改为读取的版本）、loadedContextHash 必填 64 位十六进制字符串、title 可空且最长 200 字符、formData 必填 JSON 对象、nodeAssignees 可空且为节点 Key 到用户 ID 数组的映射。loadedContextHash 仅回传加载时服务端给出的校验值，不作为数据库摘要的赋值来源。用户和租户由登录上下文获取；定义名称、formId、保存/到期时间由服务端生成，客户端不得提交覆盖。
- `DraftSaveResult`：draftId、definitionId、lockVersion、lastSaveTime、expireTime、changed；不返回保存正文。ID 在 HTTP 交互中采用字符串，避免浏览器数值精度丢失，服务端用户 ID 解析为 Long。
- `DraftSummaryVO`：draftId、definitionId、definitionName、title、lastSaveTime、expireTime、lockVersion、availability、unavailableReason。availability 为 AVAILABLE、STALE、UNAVAILABLE；仅为展示状态，不加入数据库或流程状态枚举。
- `DraftDetailVO`：上述摘要加 formId、formData、nodeAssignees、contextHash；仅在仍具备定义发起资格且快照有效时返回正文。恢复时必须与弹窗 contextHash 一致。列表与按定义查询不携正文。
- `ProcessStartReq`：增加可空 draftId、expectedVersion。普通发起仍用原四项；草稿发起只传 draftId、expectedVersion，拒绝同时携带 variables、nodeAssignees、businessKey 等覆盖已保存内容的字段。

保存的 JSON 对象建议最多 1048576 个 UTF-8 字节、嵌套深度不超过 16；审批人映射序列化最多 60000 字节。边界是本稿拟定的资源保护值，非既有数据库容量声明。对不支持的字段类型、非对象根、重复键、非法数字和未声明字段明确报错，不运行表达式、不请求任何 URL。

保存/删除接口使用 `@RepeatSubmit`、`@SysLog`；服务删除方法使用 `@Audit(highRisk=true)`。`POST /wf/start` 使用约束允许的 `@RepeatSubmit.Disabled`，不同时叠加启用的 `@RepeatSubmit`：现切面的默认 5 秒窗口会在查询既有实例前拦截重试，该入口改由既有业务键唯一约束及本稿的行锁、版本、身份核验提供持久防重，保留原发起限流。保存建议按用户和租户限流为每分钟 30 次，能覆盖 5 秒自动保存。所有用户草稿接口 SQL 都绑定当前 tenantId 和 userId；管理员也不能通过该功能读取他人的草稿正文。系统清理仅按任务租户处理，详见 §3.5。

### 3.4 保存、恢复、提交的事务边界

保存流程：

1. 校验当前身份、已发布定义与发起资格，在一致性读取下读取服务端字段/审批人范围并重算配置摘要。首次保存必须使 loadedContextHash 等于当前摘要；修改时还必须同时等于数据库原 definition_snapshot_hash。任一不一致返回 DRAFT_STALE，不能把旧表单内容配上新摘要后继续保存。无绑定表单时只允许空 formData，仍可保存标题和审批人选择。
2. 首次保存由服务端生成 UUID，唯一键冲突返回 `DRAFT_CONFLICT`，不覆盖另一窗口内容。修改必须带原 draftId/version，在 XML 中按租户、用户、ID、版本条件更新并将版本加一；不存在的旧 ID 不走自动新建。
3. 校验字段可见/可编辑权限与已填写值的类型；允许必填项暂缺。保存时允许尚未选择完整审批人，已选部分必须在当前候选范围内；隐藏或只读字段不能接受客户端伪造写入。服务端派生的默认值与显示辅助字段必须有明确来源。
4. 实质内容相同则返回当前版本和原有效期；内容变化才刷新 lastSaveTime、expireTime、审计列。客户端串行保存，首次结果不明时先按定义查询恢复身份，不盲目再次创建。

恢复流程：先核对所有者，再核对定义发布状态、发起资格、当前摘要与所存摘要。定义或表单变更、审批范围变更时返回 STALE，保留原草稿至用户明确删除或到期；不静默套用新定义、不丢字段后自动保存。失去发起资格可看到自己的不可用摘要并删除，但不能取回正文。

提交流程在 workflow 本服务内完成一个数据库事务，禁止用跨服务远程调用假装同一事务：

1. XML 按 tenantId、userId、draftId `SELECT ... FOR UPDATE`，校验 expectedVersion、未到期、仍有提交权限；锁定并核验当前定义/表单快照。新的版本已发布时拒绝静默切换。
2. 草稿数据作为唯一提交正文；现有九类字段在普通外部发起与草稿发起中复用同一校验入口，草稿保存只跳过必填检查。继续执行发起权限、绑定表单租户、审批人选择、工作流图及首节点校验；业务模块内部发起保持自身 DTO 校验与既有语义。C 的高级字段和公式依赖仍未就绪，不在此新建表达式引擎。
3. 业务键由服务端生成 `WF_DRAFT:{draftId}`，最长不超过现有 business_key 的 64 字符；普通外部发起禁止自定义使用该保留前缀。引擎草稿入口增加 expectedDefinitionId 校验，保证按 Key 查询到的定义仍是所核验的具体版本。
4. 调用现有事务化启动核心，成功后按原草稿 ID 删除草稿。实例、初始任务或草稿删除任一失败均回滚，草稿仍在；任何节点异常不能当成功吞掉。
5. 提交响应丢失后重试：按当前租户、发起用户与上述业务键查已启动实例并返回原结果；草稿已删也不重建。不能只按业务键返回其他用户的实例；旧请求不能删除同定义下后来创建的新草稿。

自动保存、人工删除、提交与清理使用一致的行锁/版本条件。保存/提交对配置采用固定顺序“定义→绑定表单→发起字段权限”；涉及这些配置的现有修改入口也需先取得同一定义锁再修改，或通过同等原子版本检查保证快照不可在校验与落库/发起之间被替换。只协调本项依赖的配置写入，不扩建 C。提交成功后停止计时器，已经发出的旧保存若版本失效或草稿消失则报冲突；不得重新创建已消费的旧 ID。

错误码约定：DRAFT_NOT_FOUND（不存在或无权访问）、DRAFT_CONFLICT（版本冲突）、DRAFT_EXPIRED（本人草稿到期）、DRAFT_STALE（配置变化）、DRAFT_UNAVAILABLE（发起资格或定义不可用）、DRAFT_TOO_LARGE（超过约定体积）、FORM_UNSUPPORTED_FIELD_TYPE（当前渲染/校验未支持）。使用现有异常响应机制；不得把业务拒绝包装成成功空值，异常中不回显正文。

### 3.5 与 B/A 的接线及日志安全

复用 B 的 `wf_form_draft`、`WfProcessStatus`、`WorkflowPermissionService.canStartProcess`、`WorkflowDefinitionConfigService.startAssigneeNodes`、`InitiatorSelectionService`、`wf_form_field_permission` 的 `__START__` 标识、原引擎事务与业务键唯一约束。字段权限行已有配置能力，当前通用发起路径不能假定已完成 C 的运行时字段处理；本轮仅补九类现有字段的安全接线。

清理接入 A 的 SYS-02：拟新增 `@JobHandler(value="workflowDraftCleanup")` 和 `@DistributedJob(name="workflow-draft-cleanup-job")`，服务名 `workflow`，不再追加独立 `@Scheduled`。默认租户任务每天 03:20 执行，按当前任务租户处理；其他租户须配置本租户任务，禁止在一个租户任务里无条件扫全租户。

清理每批查询 500 条到期候选，按 draftId、租户、版本和 expireTime 条件删除；并发刚保存的行不会被删除。草稿到期后的接口即时拒绝访问，不依赖夜间任务才能失效。只清草稿数据，不删除通用业务附件或不可变审计记录；超时与异常交给任务平台记录、告警和重试。

草稿保存及 `POST /wf/start` 使用 `@SysLog(logParams=false)`，不记录正文或审批人明细；后者同时覆盖恶意混传 variables 时的拒绝路径。现有 `RequestLogAspect` 仍会独立打印参数，而 `SysLogAspect` 只控制操作日志；故实施时需要让请求日志切面同样识别既有 `logParams=false` 元数据，且不让 common-core 反向依赖 common-log。通过 Spring 注解属性读取实现这一已有开关的一致语义，不新增依赖或另一套日志开关。普通未关闭参数日志的接口行为不变。前端草稿 API 及发起 API 日志仅保留 ID/版本等元信息，不能把 formData/variables 传给 `logApiCall`。

参数绑定和 Bean Validation 失败早于请求日志切面；`GlobalExceptionHandler` 当前会打印可能带被拒绝值的异常 message。因此共用开关还必须覆盖这些路径：从请求已解析的 HandlerMethod 读取同一 `logParams=false` 标记，敏感入口仅记录请求标识、错误类型和字段名，不记录异常 message、rejectedValue、原文 cause/stack 或请求正文；响应只返回不包含拒绝值的业务说明。JSON 解析失败、类型转换、超长字段及服务异常均须验证，不能只检查成功请求。HR 核价等本轮敏感入口沿用同一修正，共享文件由集成人维护。

### 3.6 菜单、种子数据和任务记录

菜单定义共五条，全部位于本批段位。草稿列表独立页面 `/workflow/drafts`，不复用“我的申请”接口返回假实例。

| menu_id | 父级 | 名称 / 类型 | 权限 | 角色 |
| --- | --- | --- | --- | --- |
| 1800 | 3 | 我的草稿 / C | workflow:draft:list | 1、2、3、4、5、8、9 |
| 1801 | 1800 | 草稿详情 / F | workflow:draft:view | 同上 |
| 1802 | 1800 | 保存草稿 / F | workflow:draft:save | 同上 |
| 1803 | 1800 | 删除草稿 / F | workflow:draft:remove | 同上 |
| 1804 | 1800 | 从草稿提交 / F | workflow:draft:submit | 同上且仍须原流程发起权限 |

```sql
INSERT INTO cloud_flow_db.sys_menu
  (menu_id, menu_name, parent_id, order_num, path, component, query, is_frame, is_cache,
   menu_type, visible, status, perms, icon, create_by, create_time, update_by, update_time, remark)
VALUES
  (1800, '我的草稿', 3, 5, '/workflow/drafts', 'pages/WorkflowDraftPage', NULL, 0, 0,
   'C', '0', '0', 'workflow:draft:list', 'FileText', 'seed', NOW(), '', NULL, '仅当前用户草稿'),
  (1801, '草稿详情', 1800, 1, '', NULL, NULL, 0, 0,
   'F', '1', '0', 'workflow:draft:view', '#', 'seed', NOW(), '', NULL, '仅当前用户草稿'),
  (1802, '保存草稿', 1800, 2, '', NULL, NULL, 0, 0,
   'F', '1', '0', 'workflow:draft:save', '#', 'seed', NOW(), '', NULL, '校验定义发起资格'),
  (1803, '删除草稿', 1800, 3, '', NULL, NULL, 0, 0,
   'F', '1', '0', 'workflow:draft:remove', '#', 'seed', NOW(), '', NULL, '仅当前用户草稿'),
  (1804, '从草稿提交', 1800, 4, '', NULL, NULL, 0, 0,
   'F', '1', '0', 'workflow:draft:submit', '#', 'seed', NOW(), '', NULL, '仍需流程发起资格');

INSERT INTO cloud_flow_db.sys_job_handler
  (handler_id, service_name, handler_name, handler_desc, status, last_report_time, create_by, create_time)
VALUES
  (1800, 'workflow', 'workflowDraftCleanup', '清理本租户到期表单草稿', 'ONLINE', NOW(), 'seed', NOW());

INSERT INTO cloud_flow_db.sys_job
  (job_id, tenant_id, job_name, job_group, service_name, handler_name, trigger_type, cron_expression,
   status, concurrent_flag, misfire_strategy, retry_count, timeout_seconds, lock_time_seconds,
   alarm_on_fail_flag, create_by, create_time)
VALUES
  (1800, 100000, '到期表单草稿清理', 'WORKFLOW', 'workflow', 'workflowDraftCleanup', 'CRON', '0 20 3 * * ?',
   'ENABLED', 0, 'IGNORE', 1, 150, 180, 1, 'seed', NOW());
```

`06` 的角色授权实施时必须按上述精确 ID+权限码配对，并再次核对角色 ID+role_key；只对当前已有流程发起权限的七角色添加五项自有草稿权限。ADMIN 的全量授予语句须在新增菜单之后执行。不得把候选空位、其他 H 权限或所有角色做无条件笛卡尔积授权。

不在正式 `06` 预置私人业务草稿；验收用真实测试身份通过 API 创建。仅验收数据使用即将到期/已过期样例，不能把样例变成通用生产数据。`07` 必须通过 `scripts/generate-demo-seed.ps1` 生成，不能手改。本次未修改 `01—07`。

### 3.7 WF-11 可自测验收

| 编号 | 场景与必须结果 |
| --- | --- |
| WF-01 | 必填未填可手动保存；刷新并恢复后九类已有字段的值、标题及审批人选择一致 |
| WF-02 | 变更后 5 秒保存；持续编辑 30 秒内触发保存；无变化不写库、不续期 |
| WF-03 | 同用户同定义只有一行；多窗口旧版本不能覆盖新版本；新建冲突不吞错 |
| WF-04 | 切换用户/租户、改 URL 的 draftId、伪造 userId/tenantId 不能读写他人草稿，管理员亦不能借本功能查看他人正文 |
| WF-05 | 保存不生成实例、任务、通知或业务审批副作用；用户授权与原流程可发起范围一致 |
| WF-06 | 提交校验失败、首节点异常、删除失败全部回滚，草稿还在；成功后仅删除对应草稿 |
| WF-07 | 两次提交、成功响应丢失后立即重试均得到同一流程实例，不能被5秒防重窗口挡在查询前；旧保存/旧提交不覆盖或删除新草稿 |
| WF-08 | 第一次保存前或已有草稿保存前发生定义升级/表单原地修改均被摘要检出；撤销发起资格、审批人移出范围不静默迁移或越权提交 |
| WF-09 | 模拟时钟到最近有效保存后 30 天即不可恢复；真实任务只删除到期草稿，并发刚保存记录保留 |
| WF-10 | 未绑定表单、空草稿、超大/过深/非法 JSON、只读/隐藏字段伪造写入均符合明确边界 |
| WF-11 | 正常保存、非法JSON、类型错误、超长字段、提交异常的日志/操作日志/浏览器日志均不出现草稿敏感标记；普通日志开关回归通过 |
| WF-12 | 原正常发起、普通受控/非受控表单、已存在业务模块工作流仍可用，不降低静态扫描或审计要求 |
| WF-C | 原 PRD AC-5 子表恢复：前置 C 未就绪，本轮不可记为通过；C 完成后补树形数据往返、渲染和提交联验 |

## 4. 跨模块取值、总表数与种子约束

WF 草稿所属人使用认证用户 ID，不混用 HR 的 employee_id；HR 员工与认证用户之间的映射沿既有服务。菜单、角色和工作流权限码均保持五个既有模块前缀，不新增 `sys` 或 `h` 前缀。接口中的大整数 ID 使用字符串；金额、库存数量和工时不交给 JavaScript 浮点数自行结算。

草稿不扩充流程实例状态；OA 领用状态、库存流水类型、HR 加班/调班状态与 D 的调休/算薪接线分别以专项稿的状态映射为准，不能因为中文同名而混用枚举。OA 数量/价格、HR 分钟/天数换算均需给出现有列精度依据及明确舍入规则；待确认的新规则不作为既定业务事实落库。

本轮建议采用 HR 三表方案 A：OA 3 张 + HR 3 张，共 6 张；INT-06 与 WF-11 均不新建表。预计正式脚本为 50 / 45 / 103 / 90 / 35，合计 323 张。新增表为 `oa_consumable_ledger`、`oa_consumable_request`、`oa_consumable_request_item`、`hr_overtime_type`、`hr_overtime_request`、`hr_shift_request`。若用户改选沿用混合申请的方案 B，则仅 5 张新表、全库 322 张。

方案 A 改动既有 7 张表：`wf_form_draft`、`oa_consumable`，以及 HR 的 `hr_time_request`、`hr_attendance_checkin`、`hr_schedule_assignment`、`hr_comp_change`、`hr_leave_ledger`。HR 核定加班日/月展示由申请聚合读取，不新增两份汇总列或改写 D 原考勤口径。DDL 与每一项必要性分别列在本稿和专项稿中，实施前按确认版本再次汇总核实。C 如单独实施，其原设计不新增表，但不能仅凭表数证明 C 已完成。

所有表直接修改正式建表脚本，项目未上线，不写旧数据迁移或兼容层。库存初始化必须由专项稿的期初台账生成当前库存；HR 种子不得编造新法定倍率或新税率。审批模板、业务类型注册、功能菜单、精确角色授权、任务种子与演示生成器需共同校验；不会只给菜单而缺业务注册。

共享工作流文件由集成人统一接线：HR 在核定/核价或对方同意后发起时，原申请人身份取服务端冻结的员工关联，不能误用当时经办人；OA/HR 均补齐办理及终审的参与人排除校验，不能仅依赖现有 SelfApprovalPolicy 的配置。新业务注册显式填写真实表、主键与实例列。HR 调休详情按 verify 权限裁剪，HR 不因处理调休而获得他人薪资查看权；具体接口及 11 角色矩阵见专项稿。

## 5. 分阶段实施及验证计划（确认后执行）

| 阶段 | 交付 | 出口检查 |
| --- | --- | --- |
| H0 | 确认本稿、两份专项稿、C 前置边界及待定业务规则 | DDL、权限、计量单位、审批路径无悬空决策 |
| H1 | 菜单搜索；建立草稿表完善、版本及安全服务 | 搜索原行为回归；草稿本人读写、并发及日志检查 |
| H2 | 草稿界面/自动保存/提交/清理；耗材台账与领用单 | 两项可并行，分别固定工作流通用文件与 OA 业务文件负责人 |
| H3 | 加班调班及 D 规则接线；OA 与 HR 的模板、种子集中集成 | 审批、调休、工资、库存流水的重复回调/取消/并发场景 |
| H4 | 正式脚本、全量构建、真实接口与界面、角色和前批回归 | 推荐方案 323 张表、菜单冲突 0、员工无非预期管理写权限；C 阻塞项单列 |

并行约束：前端主布局与通用工作流由同一负责人维护；OA、HR 各自业务实现分开；`02/03/04/06` 脚本最终由集成人统一合并，`07` 只由生成脚本写入。未经用户确认不开展任何实现。

验证沿通用约束：Maven validate 静态规则零 finding、后端构建与启动、高风险审计检查、前端 type-check/build、正式 `01—06` 初始化、menu_id 冲突与角色授权校验、真实租户/所有者隔离、越权与重试/并发测试。复用现有回归机制，不新增测试框架。数据库操作需另按实施时实际状态备份与安排，不复用旧里程碑的重建或清缓存脚本盲目覆盖当前库。

DE-20260912 是既有已验收范围的回归基线；HR 金额、额度、考勤与 OA 文件/审批等接线不能把延后项冒记通过。设计阶段的文档检查不能替代代码构建、运行验收或完整 C 联验。

## 6. 提交确认的决策

1. 接受本轮四项范围；WF-11 先覆盖现有九类字段，原子表恢复验收等 C 完成后补；不把 C 编码加入本轮。
2. 接受本稿草稿并发/定义变更保护、30 天保留、菜单搜索本地历史规则以及 `pinyin-match@1.2.10` 前端依赖；接受补齐原草稿表五列及索引的 DDL。
3. 确认 HR 的类型表+两张独立申请表方案（本轮共新增六表），以及 OA 专项稿中的领用/库存计价规则、HR 专项稿中的加班结算/调班/取消边界；倍率、调休比例与期限、工时上限、审批人等未核定规则不以占位数据冒充已可用政策，批准后才进入正式 SQL 与业务代码。

当前结论：用户确认后的实施已完成正式六张新表与七张既有表调整；01—07已导入，运行库保持323张表。2026-09-15四项约定验收及现场恢复完成，未核定政策继续停用，线上、隔离验证及保留边界按实施记录分别披露。

本轮文档完整性检查通过：6 张计划新表、7 张现有改表均与正式脚本基线对应；43 条新增菜单段位互不重叠，OA 的1819及各预留空位不生成记录；HR 19 种接口权限与菜单逐项对应，11 角色精确授权共108对。三稿的文档链接、代码围栏、SQL括号及行尾空白检查无问题；这些检查不代表 DDL 已执行、代码已构建或业务已验收。

## 7. 用户确认后的实施记录

本稿四项范围及HR方案A已获确认并完成实施。菜单搜索与私人草稿的真实接口、桌面和手机入口验证分别留证；耗材含税采购在原截止时间后办结，人事日历、周期处置及前序业务验证完成。最终23项只读一致性检查通过，运行库保持323张表，临时配置和身份已恢复；经用户授权仅清理一个验证码计数，未重导数据库。

逐项状态、实际运行证据和未覆盖边界统一维护在[H首轮实施与验收记录](H-首轮实施与验收记录.md)。本轮仅覆盖已确认的四项，其余H条目、C子表和前批延期仍保持原范围；未核定的人事政策及审批人配置不因测试通过而自动启用。
