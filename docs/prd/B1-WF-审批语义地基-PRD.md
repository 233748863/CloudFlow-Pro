# PRD：工作流审批语义地基（WF-01/02/03/05/06/12）

| 项 | 内容 |
| --- | --- |
| 条目编号 | WF-01 任务类型语义 · WF-02 驳回策略 · WF-03 审批人来源 · WF-05 自审策略 · WF-06 节点级开关 · WF-12 设计器面板 |
| 所属批次 | 批次 B（合并交付：六项共用节点模型与设计器，拆开做要改多遍） |
| 对标依据 | `docs/benchmark/01-workflow-流程引擎对标.md` |
| 优先级 | P0（WF-01/02/03）+ P1（WF-05/06/12） |
| 预估工作量 | **M+**（调研文档估 L+，实测后下调，理由见 §0） |
| 版本 | v1 · 2026-08-31 |

## 0. 对调研结论的重要修正（编码前实测）

调研文档 `01-workflow` 基于对标项目模型对比得出结论，**编码前实测发现现状比文档判断的完整得多**，四条需要修正：

| # | 调研文档写的 | 实测现状 | 影响 |
| --- | --- | --- | --- |
| 1 | WF-03：「`wf_task` 只有 `assignee` + `candidate_roles` 两条路，发起人自选、主管、多级主管、部门负责人全部不支持」 | **已有 `AssignUserStrategy` 策略模式 + 工厂 + 7 个实现类**，覆盖 **9 种类型**：`USER` / `USERS` / `USER_LIST` / `ROLE` / `DEPT` / `DEPT_MANAGER` / `DIRECT_LEADER` / `INITIATOR` / `VARIABLE_USER`。接口注释明确写了"借鉴 poco-flow 的策略模式设计，将原来 resolveAssignee() 中的 if-else 硬编码重构为可扩展的策略接口" | **WF-03 工作量从 L 降到 S/M**。真实缺口只剩 2 个：发起人自选（`initiatorSelected`）、多级主管（`multiLevelSupervisors` + `directorLevel`） |
| 2 | WF-02：「驳回去向是固定实现，不可按节点配置」 | `WorkflowP4ServiceImpl.rejectToPrevious()` **已实现驳回到上一步**（P4.8），写 `wf_task_history.action='REJECT_TO_PREVIOUS'` | 5 种策略里 `TO_INITIATOR` 与 `TO_PREVIOUS_NODE` 已有，缺 `TO_SPECIFIED_NODE` / `TERMINATE_APPROVAL` / `TO_PARENT_NODE`，且缺节点级配置 |
| 3 | WF-04（本 PRD 不含，但需修正）：「只有 `wf_countersign_task`，无或签语义」 | `WfNodeConfig.signType` **已声明 `ALL` / `ANY` / `PERCENT`**，前端 `types.ts` 的 `PARALLEL_SIGN_MODES` 有 `ALL/ANY/PERCENT/SEQUENTIAL` 四值且注释写明"与后端 WfNode.signType 枚举对齐" | 或签（ANY）已有语义，WF-04 真实缺口只剩票签权重（`passWeight`） |
| 4 | WF-07（本 PRD 不含，但需修正）：「有超时告警但没有超时自动流转」 | `TaskTimeoutJob.handleTimeoutTask()` **已实现超时自动通过**，注释写"默认策略：自动通过（AUTO_PASS）"，走完整 `completeTask` 引擎 | 超时自动流转已有；缺口是 `slaAction` 字段**已声明但 TaskTimeoutJob 未读取**（实测 grep 计数为 0），AUTO_REJECT 未接线 |

**结论**：工作流的实际成熟度高于调研判断。本 PRD 的定位从"补齐审批语义"调整为**"把已有能力配置化 + 补齐少数真实缺口"**。

## 1. 背景与目标

### 1.1 真实问题

现状能力散落且不可按节点配置：

1. **任务语义无字段承载**：`wf_task` 无 `task_type` 字段，语义靠多张表（`wf_task_delegation` / `wf_task_add_sign` / `wf_countersign_task`）与 `wf_task_history.action` 字符串推断
2. **能力全局开关**：加签/减签/委派/催办对任意任务都可用，不能按节点关闭（"总经理节点不允许加签"无法表达）
3. **审批人缺 2 类**：发起人提交时自选审批人、多级主管逐级审批
4. **驳回缺 3 类且不可配**：驳回到指定节点、驳回即终止、子流程驳回穿透父流程
5. **自审无策略**：发起人恰好是审批人时产生自审自批，属合规风险面
6. **`slaAction` 声明未接线**：字段在 `WfNodeConfig` 里，`TaskTimeoutJob` 硬编码 AUTO_PASS 不读它

### 1.2 目标
1. `wf_task` 增 `task_type`，审批语义有权威字段承载，流程轨迹可按语义渲染
2. 驳回策略补齐 5 种并支持节点级配置
3. 审批人补齐发起人自选与多级主管两类策略
4. 自审策略 4 种
5. 节点级开关（加签/减签/委派/催办/回退/抄送/选人）
6. 设计器节点属性面板承载以上全部配置
7. 顺带接线 `slaAction`（成本极低）

### 1.3 非目标
- 不换流程引擎
- 不做 BPMN 全集
- 不做票签权重（WF-04，独立条目）
- 不做定时/触发节点（WF-07，独立条目）
- 不做包含网关与路由分支（WF-10）

## 2. 现状基线（实测）

### 2.1 已有资产

**审批人解析**（`strategy/` 包）
```
AssignUserStrategy.java          接口：resolve() 单人 + 多人（会签场景）
AssignUserStrategyFactory.java   工厂：按 approverType 获取策略
strategy/impl/
  UserAssignStrategy          supports: USER
  UsersAssignStrategy         supports: USERS, USER_LIST
  RoleAssignStrategy          supports: ROLE
  DeptAssignStrategy          supports: DEPT
  DeptManagerAssignStrategy   supports: DEPT_MANAGER, DIRECT_LEADER
  InitiatorAssignStrategy     supports: INITIATOR
  VariableUserAssignStrategy  supports: VARIABLE_USER
```
`DeptManagerAssignStrategy` 实测逻辑：按发起人所在部门查 `leader` 字段，兼容 leader 存 userId / userName / nickName 三种形态，兜底回退到"当前部门/上级部门的 manager 用户"。**但只解析一级，无 `directorLevel` 多级参数。**

**节点配置**（`WfNodeConfig`，18 字段）
```
id, type, title, description
approverType, approverValue          审批人（已支持 9 种类型）
branchStrategy, condition            分支
allowEdit                            仅一个开关
inputs, outputs, props, retry        扩展位
signType(ALL/ANY/PERCENT), passPercent   会签
slaHours, slaAction(AUTO_PASS/AUTO_REJECT)   SLA（slaAction 未接线）
```

**节点类型**（前端 `types.ts` 的 `NodeType` 枚举，11 类）
`START / APPROVAL / CONDITION / PARALLEL / END / NOTIFICATION / SCRIPT / TIMER / SUBPROCESS / MANUAL / COPY`

**已实现的审批动作**（`WorkflowController` + `WorkflowEnhanceController` + `WorkflowP4ServiceImpl`）
start / complete / recall / reject / **rejectToPrevious** / withdraw / pause / resume / terminate / invalidate / addSign / removeSign / delegate / addSignature / reductionSignature / task read / urge

**节点处理器**（`handler/impl/`）：`CopyNodeHandler`、`ManualNodeHandler` 等，按 `approverType` + `approverValue` 解析人

**表结构**：`wf_task`(15列，无 task_type)、`wf_task_history`、`wf_countersign_task`(17列，含 sign_type/pass_percent/assignee_order/current_index)、`wf_task_delegation`(13列)、`wf_node_record`(18列，含 event_type)

**前端**：`WorkflowBuilder.tsx`、`components/workflow-builder/`、`WorkflowSettingsModal.tsx`、`@xyflow/react` 12.11.1 画布、`ProcessTrace.tsx` 轨迹、`MobileProcessTrace.tsx`

### 2.2 真实缺口清单（收敛后）

| # | 缺口 | 大小 |
| --- | --- | --- |
| 1 | `wf_task` 无 `task_type` 字段 | S |
| 2 | 审批人缺 `INITIATOR_SELECTED`（发起人自选） | S |
| 3 | 审批人缺 `MULTI_LEVEL_MANAGER`（多级主管 + directorLevel） | M |
| 4 | 驳回缺 `TO_SPECIFIED_NODE` / `TERMINATE` / `TO_PARENT_NODE` | M |
| 5 | 驳回策略不可按节点配置 | S |
| 6 | 无自审策略（4 种） | S |
| 7 | 无节点级开关（7 个） | M |
| 8 | `slaAction` 未接线 | XS |
| 9 | 设计器面板不含以上配置项 | M（前端） |

## 3. 范围

### 3.1 做
1. `wf_task` + `wf_task_history` 增 `task_type`
2. `WfNodeConfig` 扩展：驳回策略、自审策略、7 个节点级开关、`directorLevel`
3. 新增 2 个 `AssignUserStrategy` 实现（发起人自选、多级主管）
4. 驳回策略 5 种实现 + 节点级配置读取
5. 自审检测与 4 种处理策略
6. 节点级开关校验（拦截被禁用的动作）
7. `slaAction` 接线到 `TaskTimeoutJob`
8. 设计器节点属性面板扩展
9. 流程轨迹按 `task_type` 渲染语义图标

### 3.2 不做
| 项 | 原因 |
| --- | --- |
| 重写 `AssignUserStrategy` 体系 | 已有且设计良好（策略模式 + 工厂），只新增 2 个实现 |
| 重写 `rejectToPrevious` | 已实现，纳入 5 策略体系时复用 |
| 票签权重 | WF-04 独立条目 |
| 定时/触发节点 | WF-07 独立条目 |
| `wf_countersign_task` 表拆分 | WF-04 处理 |
| 31 种 flowlong TaskType 全集 | 只落地我们真实用到的子集（见 FR-1.2） |

## 4. 功能需求

### FR-1 任务类型语义（WF-01）
- FR-1.1 `wf_task` 与 `wf_task_history` 增 `task_type VARCHAR(30)`
- FR-1.2 取值范围（**只取我们真实用到的子集，不照搬 flowlong 31 种**）：
  ```
  APPROVAL         普通审批
  CC               抄送（对应 COPY 节点）
  MANUAL           人工任务（对应 MANUAL 节点）
  COUNTERSIGN      会签（signType=ALL）
  OR_SIGN          或签（signType=ANY）
  PERCENT_SIGN     比例签（signType=PERCENT）
  SEQUENTIAL_SIGN  顺序签（signType=SEQUENTIAL）
  TRANSFER         转办
  DELEGATE         委派
  DELEGATE_RETURN  委派归还
  ADD_SIGN         加签
  REDUCE_SIGN      减签
  REJECT           驳回产生的任务
  REJECT_JUMP      驳回跳转产生的任务
  AUTO_PASS        超时自动通过
  AUTO_REJECT      超时自动驳回
  AUTO_SKIP        自审跳过
  ```
- FR-1.3 现有创建任务的各入口按语义写入 `task_type`
- FR-1.4 `GET /wf/instance/{id}/trace` 返回体带 `taskType`
- FR-1.5 `wf_node_record.event_type` 与 `task_type` 语义对齐（避免两套口径）

### FR-2 驳回策略 5 种（WF-02）
- FR-2.1 `WfNodeConfig` 增 `rejectStrategy` + `rejectToNodeKey`
- FR-2.2 五种策略：
  | 取值 | 行为 | 现状 |
  | --- | --- | --- |
  | `TO_INITIATOR` | 回到发起人 | 已有（`reject`） |
  | `TO_PREVIOUS_NODE` | 回到上一审批节点 | **已有**（`rejectToPrevious`），复用 |
  | `TO_SPECIFIED_NODE` | 回到 `rejectToNodeKey` 指定节点 | 新增 |
  | `TERMINATE` | 直接终止流程 | 新增（可复用现有 terminate 逻辑） |
  | `TO_PARENT_NODE` | 子流程驳回穿透到父流程 | 新增，用现有 `wf_process_instance.parent_instance_id` + `parent_node_key` 回溯 |
- FR-2.3 `POST /wf/reject` 增可选 `strategy` 入参，缺省读节点配置，节点未配则默认 `TO_INITIATOR`
- FR-2.4 `TO_SPECIFIED_NODE` 保存时校验目标节点存在且在当前节点之前（不能驳回到后面）
- FR-2.5 驳回产生的任务 `task_type=REJECT` 或 `REJECT_JUMP`

### FR-3 审批人来源补 2 类（WF-03）
- FR-3.1 新增 `InitiatorSelectedAssignStrategy`，`supports("INITIATOR_SELECTED")`
  - 发起时由发起人指定该节点审批人，`POST /wf/start` 增 `nodeAssignees` 入参（`{nodeKey: [userId...]}`）
  - 发起人选的人存入 `wf_process_instance.variables` 或 `wf_task_candidate` 表（后者已存在，优先复用）
  - 节点配置可限定可选范围（限某角色/某部门内）
- FR-3.2 新增 `MultiLevelManagerAssignStrategy`，`supports("MULTI_LEVEL_MANAGER")`
  - `WfNodeConfig` 增 `directorLevel`（第几级主管，1=直属上级，2=上级的上级……）
  - 沿 `sys_dept.parent_id` 逐级向上查 `leader`；复用 `DeptManagerAssignStrategy` 已有的 leader 字段兼容逻辑（userId/userName/nickName 三形态）
  - 层级不足时按 `directorFallback` 处理：`TOP_LEVEL`（用能找到的最高级）/ `SKIP`（跳过该节点）/ `FAIL`（流程报错）
- FR-3.3 两个新策略走现有 `AssignUserStrategyFactory` 注册机制，**不改工厂与接口**

### FR-4 自审策略（WF-05）
- FR-4.1 `WfNodeConfig` 增 `approveSelf`，四种取值：
  | 取值 | 行为 |
  | --- | --- |
  | `ALLOW`（默认，保持现状） | 就是本人审 |
  | `AUTO_SKIP` | 自动跳过该节点 |
  | `TO_DIRECT_LEADER` | 转直属上级 |
  | `TO_DEPT_MANAGER` | 转部门负责人 |
- FR-4.2 审批人解析完成后做自审检测：解析结果 == `instance.start_user_id` 时触发策略
- FR-4.3 `AUTO_SKIP` 时写 `wf_node_record`（`event_type=AUTO_SKIP`）留痕，任务 `task_type=AUTO_SKIP`
- FR-4.4 转派时复用现有 `DeptManagerAssignStrategy`
- FR-4.5 转派后仍是发起人本人时（如发起人就是部门负责人），降级为 `ALLOW` 并留痕，避免死循环

### FR-5 节点级开关（WF-06）
- FR-5.1 `WfNodeConfig` 增 7 个布尔开关（**默认全为 true，保持现状行为不变**）：
  ```
  allowAddSign      允许加签
  allowReduceSign   允许减签
  allowDelegate     允许委派/转办
  allowUrge         允许催办
  allowRollback     允许回退
  allowCc           允许抄送
  allowSelection    允许选人（配合 INITIATOR_SELECTED）
  ```
- FR-5.2 相应接口增开关校验，被禁用时返回明确业务码与提示：
  | 接口 | 校验开关 |
  | --- | --- |
  | `POST /enhance/task/addSign` / `/wf/task/add-signature` | `allowAddSign` |
  | `POST /enhance/task/removeSign` / `/wf/task/reduction-signature` | `allowReduceSign` |
  | `POST /enhance/task/delegate` | `allowDelegate` |
  | `POST /wf/task/urge` | `allowUrge` |
  | `POST /wf/reject`（回退类） | `allowRollback` |
  | 抄送节点相关 | `allowCc` |
- FR-5.3 前端按开关隐藏对应操作按钮（**但服务端校验是权威**，前端隐藏只是体验）

### FR-6 slaAction 接线（顺带修）
- FR-6.1 `TaskTimeoutJob.handleTimeoutTask()` 读节点 `slaAction`：`AUTO_PASS`（现状默认，保持）/ `AUTO_REJECT`（新接线）
- FR-6.2 `AUTO_REJECT` 时按节点 `rejectStrategy` 处理去向（与 FR-2 联动）
- FR-6.3 任务 `task_type` 写 `AUTO_PASS` / `AUTO_REJECT`
- FR-6.4 `slaAction` 未配时保持现状默认 AUTO_PASS，**不改变现有行为**

### FR-7 设计器面板（WF-12）
- FR-7.1 节点属性面板新增配置区（按节点类型条件展示）：
  - 审批人区：`approverType` 下拉扩展到 11 种（9 现有 + 2 新增），选 `MULTI_LEVEL_MANAGER` 时显示 `directorLevel` 与 `directorFallback`，选 `INITIATOR_SELECTED` 时显示可选范围限定
  - 驳回区：`rejectStrategy` 下拉，选 `TO_SPECIFIED_NODE` 时显示节点选择器（只列当前节点之前的节点）
  - 自审区：`approveSelf` 下拉 4 种
  - 开关区：7 个开关（默认全开）
  - SLA 区：`slaHours` + `slaAction`（已有字段，补上配置入口）
- FR-7.2 配置项带说明文案（每项一句话解释业务含义）
- FR-7.3 保存前前端校验：`TO_SPECIFIED_NODE` 必选目标节点、`MULTI_LEVEL_MANAGER` 的 `directorLevel` ≥ 1
- FR-7.4 流程轨迹（`ProcessTrace.tsx` + `MobileProcessTrace.tsx`）按 `task_type` 渲染语义图标与文案

## 5. 数据模型

### 5.1 表结构改动

| 表 | 改动 |
| --- | --- |
| `wf_task` | 增 `task_type VARCHAR(30)`（15→16 列） |
| `wf_task_history` | 增 `task_type VARCHAR(30)` |
| `wf_task_candidate` | 复用承载发起人自选的候选人快照（表已存在，按需增 `source` 字段标记来源） |

### 5.2 `WfNodeConfig` 扩展（JSON 模型，不改表结构）

`wf_process_definition.model_json` 里节点对象新增字段：
```
rejectStrategy      TO_INITIATOR | TO_PREVIOUS_NODE | TO_SPECIFIED_NODE | TERMINATE | TO_PARENT_NODE
rejectToNodeKey     String（TO_SPECIFIED_NODE 用）
approveSelf         ALLOW | AUTO_SKIP | TO_DIRECT_LEADER | TO_DEPT_MANAGER
directorLevel       Integer（MULTI_LEVEL_MANAGER 用）
directorFallback    TOP_LEVEL | SKIP | FAIL
selectableScope     Object（INITIATOR_SELECTED 的可选范围限定）
allowAddSign        Boolean（默认 true）
allowReduceSign     Boolean（默认 true）
allowDelegate       Boolean（默认 true）
allowUrge           Boolean（默认 true）
allowRollback       Boolean（默认 true）
allowCc             Boolean（默认 true）
allowSelection      Boolean（默认 true）
```

**兼容性**：项目未上线，直接改建表 SQL 与种子数据；新字段全部有默认值，旧模型 JSON 无这些字段时按默认值处理（等价现状行为）。

### 5.3 前端类型同步
`src/types.ts` 的 `FormFieldType` 无关；需扩展工作流节点类型定义与 `PARALLEL_SIGN_MODES` 同级的新枚举常量。

## 6. 接口设计

| 方法 | 路径 | 改动 |
| --- | --- | --- |
| POST | `/wf/start` | 增 `nodeAssignees` 入参（发起人自选） |
| POST | `/wf/reject` | 增可选 `strategy` + `targetNodeKey` 入参 |
| GET | `/wf/instance/{id}/trace` | 返回体增 `taskType` |
| GET | `/wf/definition/{id}` | 返回体含新节点配置字段 |
| POST | `/wf/definition/save` | 接收并校验新节点配置字段 |
| POST | `/enhance/task/addSign` 等 6 个动作接口 | 增节点开关校验 |
| GET | `/wf/definition/{id}/selectable-nodes` | **新增**：供设计器选驳回目标节点（返回指定节点之前的节点列表） |
| GET | `/wf/definition/{id}/start-assignee-nodes` | **新增**：发起页查询哪些节点需要发起人选人 |

权限码沿用现有 `workflow:*` 命名空间，不新增。

## 7. 非功能需求

| 项 | 要求 |
| --- | --- |
| **行为兼容** | 所有新字段有默认值，未配置时行为与现状完全一致。这是最重要的一条：不能因为加了配置项导致现有流程行为变化 |
| 服务端权威 | 节点开关校验必须在服务端（FR-5.3），前端隐藏按钮不算安全控制 |
| 自审防死循环 | FR-4.5 转派后仍是本人时降级处理 |
| 多级主管性能 | 逐级查 `sys_dept` 时限制最大层级（默认 10 级），防部门树成环导致死循环 |
| 驳回目标合法性 | `TO_SPECIFIED_NODE` 服务端二次校验目标节点在当前节点之前，防跳到后续节点造成流程状态错乱 |
| 子流程驳回 | `TO_PARENT_NODE` 需处理父实例已结束的情况（降级为 TERMINATE 并留痕） |
| 留痕完整 | 自审跳过、超时自动处理、驳回跳转都必须写 `wf_node_record` 与 `wf_task_history` |
| 并发 | 复用现有任务锁（`completeTask` 内已有）与 `wf_task.lock_version` 乐观锁 |

## 8. 验收标准

| # | 验收项 |
| --- | --- |
| AC-1 | `wf_task.task_type` 在 17 种语义下均正确写入；`/wf/instance/{id}/trace` 返回 taskType |
| AC-2 | 流程轨迹前端按 taskType 渲染不同图标与文案（Web + 移动端） |
| AC-3 | 五种驳回策略逐一验证：回发起人、回上一步（复用已有）、回指定节点、直接终止、子流程穿透父流程 |
| AC-4 | 驳回到指定节点时，服务端拒绝"驳回到当前节点之后的节点" |
| AC-5 | 子流程 `TO_PARENT_NODE` 在父实例已结束时降级为 TERMINATE 并留痕 |
| AC-6 | `INITIATOR_SELECTED`：发起时选人，任务正确分配给所选人；超出可选范围的人被拒绝 |
| AC-7 | `MULTI_LEVEL_MANAGER` + `directorLevel=2` 时任务分配给上级的上级；层级不足时按 `directorFallback` 处理 |
| AC-8 | 部门树成环时多级主管解析在 10 级后终止，不死循环 |
| AC-9 | 四种自审策略逐一验证；`AUTO_SKIP` 写 `wf_node_record(event_type=AUTO_SKIP)` |
| AC-10 | 自审转派后仍是本人时降级为 ALLOW 并留痕，不死循环 |
| AC-11 | 7 个节点开关逐一验证：关闭后对应接口返回明确业务码，前端按钮隐藏 |
| AC-12 | `slaAction=AUTO_REJECT` 时超时任务自动驳回并按 `rejectStrategy` 处理去向 |
| AC-13 | `slaAction` 未配置时行为与现状一致（AUTO_PASS） |
| AC-14 | **回归：旧流程定义（无新字段）行为与改造前完全一致** |
| AC-15 | 设计器可配置全部新增项；`TO_SPECIFIED_NODE` 的节点选择器只列当前节点之前的节点 |
| AC-16 | 现有 9 种 approverType 行为不变（`AssignUserStrategy` 体系未被破坏） |

## 9. 依赖与风险

### 9.1 依赖
| 依赖 | 说明 |
| --- | --- |
| 现有 `AssignUserStrategy` 体系 | 只新增 2 个实现，不改接口与工厂 |
| 现有 `rejectToPrevious`（P4.8） | 纳入 5 策略体系时复用 |
| `sys_dept.parent_id` + `leader` | 多级主管解析依赖部门树与负责人数据质量 |
| `wf_task_candidate`（已有表） | 承载发起人自选快照 |
| SYS-01 消息中心 | 自审跳过、超时自动处理的通知；弱依赖 |

### 9.2 风险

| 风险 | 应对 |
| --- | --- |
| **改动触及核心流转逻辑，回归面大** | AC-14/16 明确要求旧行为不变；新字段全部有默认值；逐条目独立提交 |
| `sys_dept.leader` 数据质量差导致多级主管解析失败 | 复用 `DeptManagerAssignStrategy` 已有的三形态兼容逻辑；解析失败按 `directorFallback` 处理并告警 |
| 部门树成环导致死循环 | NFR 限制最大 10 级；AC-8 验证 |
| 驳回到指定节点造成流程状态错乱 | 服务端校验目标节点必须在当前节点之前（FR-2.4 + AC-4） |
| 子流程驳回穿透的边界情况多（父实例已结束/已作废/多层嵌套） | AC-5 覆盖父实例已结束；多层嵌套按逐级向上处理，最多穿透至根实例 |
| 节点开关默认值设错导致现有流程功能失效 | 默认全 true（FR-5.1），等价现状 |
| 设计器面板配置项过多导致易用性下降 | 按节点类型条件展示（FR-7.1）；配置项带说明文案；非常用项折叠 |

## 10. 里程碑

| 阶段 | 内容 | 可验收 |
| --- | --- | --- |
| M1 | `task_type` 字段 + 各入口写入 + trace 返回 | AC-1 |
| M2 | 两个新 `AssignUserStrategy` 实现 + `directorLevel` 解析 | AC-6/7/8/16 |
| M3 | 驳回 5 策略 + 节点级配置 + 校验 | AC-3/4/5 |
| M4 | 自审 4 策略 + `slaAction` 接线 | AC-9/10/12/13 |
| M5 | 7 个节点开关 + 服务端校验 | AC-11 |
| M6 | 设计器面板 + 轨迹语义渲染（前端） | AC-2/15 |
| M7 | 全量回归（重点：旧定义行为不变） | AC-14 |

## 11. 待确认

| # | 问题 | 建议默认 |
| --- | --- | --- |
| 1 | 调研文档的 WF-03/WF-02/WF-04/WF-07 判断已被实测修正，是否同步更新 `01-workflow` 对标文档 | 建议更新，避免后续按错误基线排期。本 PRD §0 已记录修正内容 |
| 2 | `wf_node_record.event_type` 与新增 `task_type` 是否合并为一套取值 | 建议对齐但不合并：`event_type` 记节点级事件，`task_type` 记任务语义，两者粒度不同 |
| 3 | 发起人自选的候选人存 `wf_task_candidate` 还是 `instance.variables` | 建议 `wf_task_candidate`（表已存在且语义匹配），variables 用于流程变量不宜混放 |
| 4 | 多级主管的"级"按部门树还是按汇报线（`hr_employee` 可能有汇报关系字段） | 建议先按 `sys_dept.parent_id` + `leader`（与现有 `DeptManagerAssignStrategy` 一致）；若 HR 侧有独立汇报线数据，后续可加 `MULTI_LEVEL_REPORT_LINE` 策略 |
